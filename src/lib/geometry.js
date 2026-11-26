// 几何工具:全部在"码"(yard)坐标系内运算
// 每个洞有独立的本地坐标系(单位:码),保证改一个洞的刻度不影响其他洞

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

// 折线累计长度,返回每段端点处的累计距离数组(与点一一对应)
export function cumulativeLengths(points) {
  const out = [0];
  for (let i = 2; i < points.length; i += 2) {
    out.push(out[out.length - 1] + dist(points[i - 2], points[i - 1], points[i], points[i + 1]));
  }
  return out;
}

export function polylineLength(points) {
  const c = cumulativeLengths(points);
  return c[c.length - 1] || 0;
}

// 沿折线按固定间隔取刻度点(障碍距离刻度)
// 返回 [{x, y, yard}] yard 为距折线起点的码数
export function ticksAlongPolyline(points, interval) {
  const ticks = [];
  if (!points || points.length < 4 || interval <= 0) return ticks;
  const cum = cumulativeLengths(points);
  const total = cum[cum.length - 1];
  let next = interval;
  for (let i = 1; i < cum.length && next <= total; i++) {
    while (i < cum.length && cum[i] < next) i++;
    if (i >= cum.length) break;
    const segStart = cum[i - 1];
    const segLen = cum[i] - segStart || 1;
    const t = (next - segStart) / segLen;
    const x = points[(i - 1) * 2] + t * (points[i * 2] - points[(i - 1) * 2]);
    const y = points[(i - 1) * 2 + 1] + t * (points[i * 2 + 1] - points[(i - 1) * 2 + 1]);
    ticks.push({ x, y, yard: Math.round(next) });
    next += interval;
    if (cum[i] >= next) i--; // 同一段内可能有多个刻度
  }
  return ticks;
}

// 点到线段最近点
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * dx, y: ay + t * dy, t };
}

// 点到折线最近点
export function closestOnPolyline(px, py, points, closed = false) {
  let best = null;
  const n = points.length / 2;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const c = closestOnSegment(px, py, points[i * 2], points[i * 2 + 1], points[j * 2], points[j * 2 + 1]);
    const d = dist(px, py, c.x, c.y);
    if (!best || d < best.d) best = { ...c, d, segIndex: i };
  }
  return best;
}

// 多边形质心(果岭中心用)
export function polygonCentroid(points) {
  let cx = 0, cy = 0;
  const n = points.length / 2;
  for (let i = 0; i < n; i++) { cx += points[i * 2]; cy += points[i * 2 + 1]; }
  return n ? { x: cx / n, y: cy / n } : { x: 0, y: 0 };
}

// 吸附:在刻度点与参照线上找最近吸附目标
// targets: { ticks: [{x,y,yard}], refLines: [{points}] }
export function findSnap(px, py, targets, radius) {
  let best = null;
  for (const t of targets.ticks || []) {
    const d = dist(px, py, t.x, t.y);
    if (d <= radius && (!best || d < best.d)) best = { x: t.x, y: t.y, d, kind: 'tick', yard: t.yard };
  }
  for (const rl of targets.refLines || []) {
    const c = closestOnPolyline(px, py, rl.points);
    if (c && c.d <= radius && (!best || c.d < best.d)) best = { x: c.x, y: c.y, d: c.d, kind: 'refline' };
  }
  return best;
}

// ---- 标注排版 ----
// 码数档位:近了显示完整码数(一位小数),远了只留整数;字号随档位分大小
export function yardageTier(yards) {
  if (yards < 100) return { fontSize: 15, text: formatYards(yards) };
  if (yards < 200) return { fontSize: 13, text: String(Math.round(yards)) };
  return { fontSize: 11, text: String(Math.round(yards)) };
}

export function formatYards(y) {
  const r = Math.round(y * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// 密集处自动错开:迭代把重叠的标注框推开(不压线:沿垂直方向优先)
// labels: [{id, x, y, w, h}] 返回 {id: {dx, dy}} 自动位移
export function resolveCollisions(labels, iterations = 40) {
  const boxes = labels.map((l) => ({ ...l, dx: 0, dy: 0 }));
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const ax = a.x + a.dx, ay = a.y + a.dy, bx = b.x + b.dx, by = b.y + b.dy;
        const overlapX = (a.w + b.w) / 2 - Math.abs(ax - bx);
        const overlapY = (a.h + b.h) / 2 - Math.abs(ay - by);
        if (overlapX > 0 && overlapY > 0) {
          // 优先垂直错开,避免压到折线
          const push = overlapY / 2 + 1;
          const dir = ay <= by ? 1 : -1;
          a.dy -= push * dir;
          b.dy += push * dir;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  const out = {};
  for (const b of boxes) out[b.id] = { dx: b.dx, dy: b.dy };
  return out;
}
