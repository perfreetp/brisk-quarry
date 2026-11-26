import { reactive, computed } from 'vue';
import { OBJ_TYPES, TYPE_ORDER } from './types';
import { generateLayout, findNearestValid, isTransformLegal, makeRect } from './layout';

const state = reactive({
  params: {
    width: 60,
    depth: 40,
    corridorDir: 'x', // x: 沿长度(东西向)  z: 沿宽度(南北向)
    corridorWidth: 4,
    tiers: { tent: 2, assembly: 1, supply: 1, post: 2 },
    seed: '2026',
  },
  objects: [],
  selectedId: null,
  hoverId: null,
  snapshots: {}, // seed -> 生成时的 { params, objects }
  lastPlacedCount: 0,
  lastUnplaced: [],
  message: '',
  messageType: 'info',
});

let msgTimer = null;
export function notify(msg, type = 'info') {
  state.message = msg;
  state.messageType = type;
  if (msgTimer) clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (state.message = ''), 3600);
}

// 物件当前生效属性（手动值覆盖自动值）
export function eff(obj) {
  const meta = OBJ_TYPES[obj.type];
  const m = obj.manual;
  return {
    x: m ? m.x : obj.auto?.x ?? 0,
    z: m ? m.z : obj.auto?.z ?? 0,
    rot: m ? m.rot : obj.auto?.rot ?? 0,
    w: m?.size?.w ?? meta.w,
    d: m?.size?.d ?? meta.d,
  };
}

export function effRect(obj) {
  const e = eff(obj);
  return makeRect(e.x, e.z, e.w, e.d, e.rot);
}

function allRects(excludeId = null) {
  return state.objects
    .filter((o) => o.uid !== excludeId && !o.unplaced)
    .map((o) => ({ uid: o.uid, type: o.type, rect: effRect(o) }));
}

const preservedManual = () =>
  state.objects
    .filter((o) => o.manual && !o.unplaced)
    .map((o) => {
      const e = eff(o);
      return {
        uid: o.uid,
        type: o.type,
        x: e.x,
        z: e.z,
        rot: e.rot,
        effW: e.w,
        effD: e.d,
        manual: { ...o.manual },
      };
    });

// 生成：保留手动调整过的物件，其余按当前参数与种子重新铺开
export function generate() {
  const p = state.params;
  if (p.corridorWidth >= Math.min(p.width, p.depth)) {
    notify('通道宽度过大，超过场地尺寸', 'error');
    return;
  }
  const kept = preservedManual();
  const result = generateLayout(p, p.seed, kept);
  // 同一种子的复现锚点固定为它的首次生成；之后改参数重新生成不覆盖
  if (!state.snapshots[p.seed]) {
    state.snapshots[p.seed] = {
      params: JSON.parse(JSON.stringify(p)),
      objects: JSON.parse(JSON.stringify(result)),
    };
  }
  state.objects = result;
  state.selectedId = null;
  state.lastPlacedCount = result.filter((o) => !o.unplaced).length;
  state.lastUnplaced = result.filter((o) => o.unplaced).map((o) => o.name);
  if (state.lastUnplaced.length) {
    notify(`已放置 ${state.lastPlacedCount} 件，${state.lastUnplaced.length} 件场地不足未布下`, 'warn');
  } else {
    notify(`已生成 ${state.lastPlacedCount} 个物件，手动调整的物件保持原位`, 'ok');
  }
}

// 复现：同一种子回到该种子首次生成的完整自动布局（清掉全部手动调整）
export function reproduce() {
  const snap = state.snapshots[state.params.seed];
  if (!snap) {
    notify('该种子还没有生成记录，请先点“生成”', 'error');
    return;
  }
  const clean = JSON.parse(JSON.stringify(snap.objects)).map((o) => ({ ...o, manual: null }));
  // 必须就地覆盖 reactive 对象，不能整体替换引用，否则响应式更新会静默丢失
  Object.assign(state.params, JSON.parse(JSON.stringify(snap.params)));
  state.params.tiers = { ...snap.params.tiers };
  state.objects.splice(0, state.objects.length, ...clean);
  state.selectedId = null;
  state.lastPlacedCount = clean.filter((o) => !o.unplaced).length;
  notify(`已复现种子「${snap.params.seed}」的完整自动布局`, 'ok');
}

export function select(id) {
  state.selectedId = id;
}

export function setHover(id) {
  state.hoverId = id;
}

// 拖拽提交：合法落位；非法（压通道/越界/碰撞）则弹回最近空位
export function commitDrag(uid, x, z) {
  const obj = state.objects.find((o) => o.uid === uid);
  if (!obj || obj.unplaced) return { legal: false };
  const e = eff(obj);
  const obstacles = allRects(uid);
  const legal = isTransformLegal(x, z, e.w, e.d, e.rot, obj.type, uid, state.params, obstacles);
  if (legal) {
    applyManual(obj, { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
    return { legal: true, x: e.x, z: e.z };
  }
  const nearest = findNearestValid({ x, z }, obj.type, e.w, e.d, e.rot, state.params, obstacles);
  if (nearest) {
    applyManual(obj, nearest);
    notify(`该位置占用通道或超出场地，已弹回最近空位`, 'warn');
    return { legal: false, x: nearest.x, z: nearest.z };
  }
  notify('附近找不到合法空位，物件保持原位', 'error');
  return { legal: false, x: e.x, z: e.z };
}

// 拖拽过程中的实时合法性（用于红/绿提示）
export function probeDrag(uid, x, z) {
  const obj = state.objects.find((o) => o.uid === uid);
  if (!obj) return false;
  const e = eff(obj);
  return isTransformLegal(x, z, e.w, e.d, e.rot, obj.type, uid, state.params, allRects(uid));
}

function applyManual(obj, patch = {}) {
  const base = obj.manual ?? {
    x: obj.auto?.x ?? 0,
    z: obj.auto?.z ?? 0,
    rot: obj.auto?.rot ?? 0,
    size: null,
  };
  obj.manual = { ...base, ...patch };
}

export function setRotation(uid, rotDeg) {
  const obj = state.objects.find((o) => o.uid === uid);
  if (!obj) return;
  const e = eff(obj);
  const rot = (rotDeg * Math.PI) / 180;
  const obstacles = allRects(uid);
  if (!isTransformLegal(e.x, e.z, e.w, e.d, rot, obj.type, uid, state.params, obstacles)) {
    notify('该角度会压到通道或其它物件，已忽略', 'error');
    return false;
  }
  applyManual(obj, { rot });
  return true;
}

export function setSize(uid, w, d) {
  const obj = state.objects.find((o) => o.uid === uid);
  if (!obj) return;
  const w2 = Math.max(0.5, Math.round(w * 10) / 10);
  const d2 = Math.max(0.5, Math.round(d * 10) / 10);
  const e = eff(obj);
  const obstacles = allRects(uid);
  if (!isTransformLegal(e.x, e.z, w2, d2, e.rot, obj.type, uid, state.params, obstacles)) {
    notify('该尺寸会压到通道或其它物件，已忽略', 'error');
    return false;
  }
  applyManual(obj, { size: { w: w2, d: d2 } });
  return true;
}

// 恢复自动位置（保留旋转与尺寸的手动修改）
export function resetAuto(uid) {
  const obj = state.objects.find((o) => o.uid === uid);
  if (!obj || !obj.auto) return;
  const size = obj.manual?.size ?? null;
  const rot = obj.manual?.rot ?? obj.auto.rot;
  // 自动位置上验证当前尺寸/旋转是否仍合法，不合法则就近找位
  const obstacles = allRects(uid);
  let target = { x: obj.auto.x, z: obj.auto.z };
  const w = size?.w ?? OBJ_TYPES[obj.type].w;
  const d = size?.d ?? OBJ_TYPES[obj.type].d;
  if (!isTransformLegal(target.x, target.z, w, d, rot, obj.type, uid, state.params, obstacles)) {
    const nearest = findNearestValid(target, obj.type, w, d, rot, state.params, obstacles);
    if (nearest) target = nearest;
  }
  if (size === null && rot === obj.auto.rot && target.x === obj.auto.x && target.z === obj.auto.z) {
    obj.manual = null;
  } else {
    obj.manual = { x: target.x, z: target.z, rot, size };
  }
  notify(`「${obj.name}」已恢复到自动位置`, 'ok');
}

export const adjustedList = computed(() =>
  state.objects.filter((o) => o.manual && !o.unplaced)
);

export const selected = computed(() => state.objects.find((o) => o.uid === state.selectedId) ?? null);

export const countsByType = computed(() => {
  const c = {};
  for (const t of TYPE_ORDER) c[t] = 0;
  for (const o of state.objects) if (!o.unplaced) c[o.type]++;
  return c;
});

export function useStore() {
  return {
    state,
    raw: state,
    notify,
    generate,
    reproduce,
    select,
    setHover,
    commitDrag,
    probeDrag,
    setRotation,
    setSize,
    resetAuto,
    adjustedList,
    selected,
    countsByType,
    eff,
  };
}
