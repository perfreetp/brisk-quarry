// 全局状态:洞列表、当前洞、角色(设计师/赛事总监)、工具、视图
import { writable, derived, get } from 'svelte/store';
import { createHole, clone } from './model.js';

const STORAGE_KEY = 'golf-yardage-annotator-v1';

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.holes)) return s;
    }
  } catch (e) { /* 忽略损坏的存档 */ }
  return { holes: [], activeHoleId: null };
}

const initial = loadInitial();

export const holes = writable(initial.holes);
export const activeHoleId = writable(initial.activeHoleId);
export const role = writable('designer'); // 'designer' | 'director'
export const view = writable('edit'); // 'edit' | 'book'
export const tool = writable('select');
// select|calibrate|centerline|green|refline|approach|landing
export const refType = writable('bunker');
export const snapEnabled = writable(true);
export const selectedLandingId = writable(null);

export const activeHole = derived([holes, activeHoleId], ([$holes, $id]) =>
  $holes.find((h) => h.id === $id) || null
);

// 自动保存
holes.subscribe((h) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ holes: h, activeHoleId: get(activeHoleId) }));
  } catch (e) { /* 存储满等情况忽略 */ }
});
activeHoleId.subscribe((id) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = raw ? JSON.parse(raw) : {};
    s.activeHoleId = id;
    if (!s.holes) s.holes = get(holes);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (e) { /* ignore */ }
});

export function addHole() {
  const n = get(holes).length + 1;
  const h = createHole(n);
  // 新洞错开摆放,避免整版完全重叠
  h.offset = { x: (n - 1) * 40, y: (n - 1) * 40 };
  holes.update((hs) => [...hs, h]);
  activeHoleId.set(h.id);
  return h;
}

export function removeHole(id) {
  holes.update((hs) => hs.filter((h) => h.id !== id));
  if (get(activeHoleId) === id) activeHoleId.set(get(holes)[0]?.id ?? null);
}

// 更新某个洞;updater 返回新洞对象。只动这一个洞,其他洞原样。
export function updateHole(id, updater) {
  holes.update((hs) => hs.map((h) => (h.id === id ? updater(clone(h)) : h)));
}

// ---- 导入 / 导出 ----
export function exportJSON() {
  return JSON.stringify({ app: 'golf-yardage-annotator', version: 1, holes: get(holes) }, null, 2);
}

export function importState(obj) {
  if (!obj || !Array.isArray(obj.holes)) throw new Error('文件结构不正确:缺少 holes 数组');
  holes.set(obj.holes);
  activeHoleId.set(obj.holes[0]?.id ?? null);
}

// ---- 示例数据:三个洞,便于直接体验 ----
export function loadDemo() {
  const mk = (num, par, ox, oy) => {
    const h = createHole(num);
    h.par = par;
    h.offset = { x: ox, y: oy };
    h.centerline = [0, 380, 60, 300, 140, 220, 190, 140, 210, 60, 205, 0];
    h.green = [185, -18, 225, -18, 238, 0, 225, 18, 185, 18, 172, 0];
    h.refLines = [
      { id: `rl_${num}_1`, type: 'bunker', points: [120, 180, 150, 165, 185, 170] },
      { id: `rl_${num}_2`, type: 'water', points: [230, 90, 260, 60, 265, 30] },
      { id: `rl_${num}_3`, type: 'turf', points: [40, 330, 110, 250, 170, 170, 200, 90] },
    ];
    h.approach = { points: [0, 380, 140, 220, 210, 60] };
    h.landings = [
      { id: `lz_${num}_1`, x: 110, y: 200, w: 60, h: 34, rotation: -20, targetHandicap: 18, wind: 'NW' },
      { id: `lz_${num}_2`, x: 185, y: 40, w: 50, h: 28, rotation: 5, targetHandicap: 9, wind: 'N' },
    ];
    return h;
  };
  const demo = [mk(1, 4, 0, 0), mk(2, 3, 350, 60), mk(3, 5, 640, -40)];
  holes.set(demo);
  activeHoleId.set(demo[0].id);
}
