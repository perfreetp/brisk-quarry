// 布置引擎：基于有向包围盒（OBB）的 2D 平面排布，全部单位为米
import { OBJ_TYPES, TYPE_ORDER, CORRIDOR_BUFFER, DRAG_BUFFER, SITE_MARGIN } from './types';
import { hashSeed, mulberry32, shuffle } from './rng';

export function makeRect(x, z, w, d, rot) {
  return { x, z, w, d, rot: rot ?? 0 };
}

export function halfExtents(rect) {
  return { hw: rect.w / 2, hd: rect.d / 2 };
}

// 矩形四角（逆时针）
export function rectCorners(rect) {
  const { hw, hd } = halfExtents(rect);
  const c = Math.cos(rect.rot);
  const s = Math.sin(rect.rot);
  const local = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return local.map(([lx, lz]) => ({
    x: rect.x + lx * c - lz * s,
    z: rect.z + lx * s + lz * c,
  }));
}

// 有向边轴（x 轴 / z 轴方向）
function axes(rect) {
  return [
    { x: Math.cos(rect.rot), z: Math.sin(rect.rot) },
    { x: -Math.sin(rect.rot), z: Math.cos(rect.rot) },
  ];
}

function project(corners, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of corners) {
    const v = p.x * axis.x + p.z * axis.z;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
}

// OBB-SAT 重叠判定，gap 为要求的额外净距（两侧各承担一半）
export function overlaps(a, b, gap = 0) {
  const ca = rectCorners(a);
  const cb = rectCorners(b);
  for (const ax of [...axes(a), ...axes(b)]) {
    const pa = project(ca, ax);
    const pb = project(cb, ax);
    if (pa.max + gap / 2 <= pb.min || pb.max + gap / 2 <= pa.min) return false;
  }
  return true;
}

// 沿两矩形中心连线方向的边缘净距（与布置图标注口径一致）
export function centerLineGap(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-9) return 0;
  const ux = dx / dist;
  const uz = dz / dist;
  const support = (r) => {
    const c = Math.cos(r.rot);
    const s = Math.sin(r.rot);
    return (
      Math.abs(c * ux + s * uz) * (r.w / 2) +
      Math.abs(-s * ux + c * uz) * (r.d / 2)
    );
  };
  return Math.max(0, dist - support(a) - support(b));
}

// 物件对是否满足净距：不相交且沿中心连线的边缘净距达标
export function respectsGap(a, b, requiredGap) {
  if (overlaps(a, b, 0)) return false;
  return centerLineGap(a, b) >= requiredGap - 1e-9;
}

// 通道矩形：沿场地中线
export function corridorRect(params) {
  const { width, depth, corridorWidth, corridorDir } = params;
  return corridorDir === 'x'
    ? makeRect(0, 0, width, corridorWidth, 0)
    : makeRect(0, 0, corridorWidth, depth, 0);
}

export function inBounds(rect, params, buffer = 0) {
  const { width, depth } = params;
  for (const p of rectCorners(rect)) {
    if (
      p.x < -width / 2 + buffer ||
      p.x > width / 2 - buffer ||
      p.z < -depth / 2 + buffer ||
      p.z > depth / 2 - buffer
    ) {
      return false;
    }
  }
  return true;
}

export function hitsCorridor(rect, params, buffer = CORRIDOR_BUFFER) {
  return overlaps(rect, corridorRect(params), buffer);
}


// 候选网格点（距场地边缘留出 margin），按随机顺序消费
function buildCandidates(params, margin, rng) {
  const step = 1;
  const pts = [];
  for (let x = -params.width / 2 + margin; x <= params.width / 2 - margin + 1e-9; x += step) {
    for (let z = -params.depth / 2 + margin; z <= params.depth / 2 - margin + 1e-9; z += step) {
      pts.push({ x: round1(x), z: round1(z) });
    }
  }
  return shuffle(pts, rng);
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * 按参数与种子生成完整自动布局。
 * preserved：手动调整过的物件（{uid,type,x,z,effW,effD,rot,manual}），
 *            生成时作为障碍保留原位置；返回结果中其 auto 位置也固定为当前位置。
 */
export function generateLayout(params, seedStr, preserved = []) {
  const rng = mulberry32(hashSeed(seedStr));
  const objects = [];
  const placed = []; // { uid, type, rect, gapTo }
  let seq = 0;

  const blockedBy = (rect, type) => {
    if (!inBounds(rect, params, SITE_MARGIN)) return 'boundary';
    if (hitsCorridor(rect, params, CORRIDOR_BUFFER)) return 'corridor';
    for (const p of placed) {
      const gap = p.type === type ? OBJ_TYPES[type].spacing : 1;
      if (!respectsGap(rect, p.rect, gap)) return 'object';
    }
    return null;
  };

  // 手动调整过的物件原样保留，并作为障碍；若因通道/场地变化已不合法，就近挪到空位
  for (const m of preserved) {
    const meta = OBJ_TYPES[m.type];
    let rect = makeRect(m.x, m.z, m.effW ?? meta.w, m.effD ?? meta.d, m.rot ?? 0);
    if (!inBounds(rect, params, DRAG_BUFFER) || hitsCorridor(rect, params, DRAG_BUFFER)) {
      const nearest = findNearestValid(
        { x: m.x, z: m.z },
        m.type,
        rect.w,
        rect.d,
        rect.rot,
        params,
        placed.map((p) => ({ uid: p.uid, type: p.type, rect: p.rect })),
        DRAG_BUFFER
      );
      if (nearest) {
        m.x = nearest.x;
        m.z = nearest.z;
        rect = makeRect(nearest.x, nearest.z, rect.w, rect.d, rect.rot);
      }
    }
    objects.push({
      uid: m.uid,
      type: m.type,
      name: `${meta.label}-${++seq}`,
      auto: { x: rect.x, z: rect.z, rot: rect.rot },
      manual: {
        x: rect.x,
        z: rect.z,
        rot: rect.rot,
        size: m.effW ? { w: rect.w, d: rect.d } : null,
      },
    });
    placed.push({ uid: m.uid, type: m.type, rect, gapTo: {} });
  }

  // 自动物件：按类型顺序逐类填充，候选点网格 + 随机朝向，失败后退化到细网格
  const autoItems = [];
  for (const type of TYPE_ORDER) {
    const count = params.tiers[type] ? OBJ_TYPES[type].tierCounts[params.tiers[type]] : 0;
    for (let i = 0; i < count; i++) autoItems.push(type);
  }

  const marginFor = (w, d) => Math.max(w, d) / 2 + SITE_MARGIN;
  let candidates = buildCandidates(params, 1, rng);
  const used = new Set();

  for (const type of autoItems) {
    const meta = OBJ_TYPES[type];
    const baseW = meta.w;
    const baseD = meta.d;
    const margin = marginFor(baseW, baseD);
    const rotChoice = type === 'post' ? [0] : [0, Math.PI / 2];

    if (used.size > candidates.length * 0.6) candidates = buildCandidates(params, 1, rng);
    let chosen = null;

    outer: for (const pt of candidates) {
      const key = `${pt.x},${pt.z}`;
      if (used.has(key)) continue;
      const rot = rotChoice[Math.floor(rng() * rotChoice.length)];
      const rect = makeRect(pt.x, pt.z, baseW, baseD, rot);
      if (!blockedBy(rect, type)) {
        chosen = rect;
        used.add(key);
        break outer;
      }
    }

    // 细网格兜底（0.5m），保证尽量布下
    if (!chosen) {
      outer2: for (let x = -params.width / 2 + margin; x <= params.width / 2 - margin + 1e-9; x += 0.5) {
        for (let z = -params.depth / 2 + margin; z <= params.depth / 2 - margin + 1e-9; z += 0.5) {
          for (const rot of rotChoice) {
            const rect = makeRect(round1(x), round1(z), baseW, baseD, rot);
            if (!blockedBy(rect, type)) {
              chosen = rect;
              break outer2;
            }
          }
        }
      }
    }

    const uid = `${type}-${++seq}`;
    if (chosen) {
      objects.push({
        uid,
        type,
        name: `${meta.label}-${seq}`,
        auto: { x: chosen.x, z: chosen.z, rot: chosen.rot },
        manual: null,
      });
      placed.push({ uid, type, rect: chosen, gapTo: {} });
    } else {
      // 实在放不下：记录为未放置，由界面提示
      objects.push({
        uid,
        type,
        name: `${meta.label}-${seq}`,
        auto: null,
        manual: null,
        unplaced: true,
      });
    }
  }

  return objects;
}

/**
 * 从 start 开始螺旋外扩搜索最近的合法空位（用于拖拽弹回 / 尺寸旋转校验）。
 * obstacles：当前其它物件的 {uid,type,rect}
 */
export function findNearestValid(start, type, w, d, rot, params, obstacles = [], buffer = DRAG_BUFFER) {
  const rect0 = makeRect(start.x, start.z, w, d, rot);
  const legal = (r) => {
    if (!inBounds(r, params, buffer)) return false;
    if (hitsCorridor(r, params, buffer)) return false;
    for (const o of obstacles) {
      const gap = o.type === type ? OBJ_TYPES[type].spacing : 1;
      if (!respectsGap(r, o.rect, gap)) return false;
    }
    return true;
  };

  if (legal(rect0)) return { x: round1(start.x), z: round1(start.z) };

  const step = 0.5;
  for (let ring = 1; ring <= 120; ring++) {
    for (let ix = -ring; ix <= ring; ix++) {
      for (let iz = -ring; iz <= ring; iz++) {
        if (Math.max(Math.abs(ix), Math.abs(iz)) !== ring) continue;
        const r = makeRect(round1(start.x + ix * step), round1(start.z + iz * step), w, d, rot);
        if (legal(r)) return { x: r.x, z: r.z };
      }
    }
  }
  return null;
}

// 判定某个变换（位置/尺寸/旋转）是否合法，用于手动编辑校验
export function isTransformLegal(x, z, w, d, rot, type, ignoreUid, params, objectRects) {
  const rect = makeRect(x, z, w, d, rot);
  if (!inBounds(rect, params, DRAG_BUFFER)) return false;
  if (hitsCorridor(rect, params, DRAG_BUFFER)) return false;
  for (const o of objectRects) {
    if (o.uid === ignoreUid) continue;
    const gap = o.type === type ? OBJ_TYPES[type].spacing : 1;
    if (!respectsGap(rect, o.rect, gap)) return false;
  }
  return true;
}
