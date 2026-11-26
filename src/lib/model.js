// 数据模型:每个洞独立坐标系(单位:码),整版可叠十几个洞互不影响
import { cumulativeLengths, closestOnPolyline, polygonCentroid, dist } from './geometry.js';

let seq = 1;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${seq++}`;

export function createHole(number = 1, name = '') {
  return {
    id: uid('hole'),
    number,
    name: name || `Hole ${number}`,
    par: 4,
    handicap: number, // 洞差点
    // 平面图:导入的位图 + 比例尺(图像每像素多少码)
    map: null, // { src, width, height, yardsPerPixel, x, y }
    offset: { x: 0, y: 0 }, // 在整版上的摆放位置(屏幕像素,缩放前)
    centerline: [], // 球道中心线 [x,y,...] 码
    green: [], // 果岭台面轮廓(闭合多边形) 码
    refLines: [], // 参照线 [{id, type:'bunker'|'water'|'turf', points:[...]}]
    tickInterval: 25, // 障碍距离刻度间隔(码)
    approach: { points: [] }, // 进攻折线 码
    landings: [], // 落球区 [{id,x,y,w,h,rotation,targetHandicap,wind}]
    labelManual: {}, // 手调标注偏移 {labelKey: {dx,dy}} 码 —— 重排时保留
  };
}

export function createLanding(x, y) {
  return {
    id: uid('lz'),
    x, y, w: 60, h: 30, rotation: 0,
    targetHandicap: 10, // 目标差点
    wind: 'N', // 风向
  };
}

export const REF_TYPES = {
  bunker: { label: '沙坑唇口', color: '#c9a227' },
  water: { label: '水障碍岸线', color: '#2273c9' },
  turf: { label: '草皮边', color: '#3d8b37' },
};

export const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// ---- 派生量:进攻折线每个拐点的标注数据 ----
// 返回 [{x, y, fromTee, toGreen, toHazard, angle}]
export function approachMetrics(hole) {
  const pts = hole.approach.points;
  if (!pts || pts.length < 2) return [];
  const cum = cumulativeLengths(pts);
  const greenCenter = hole.green.length >= 6 ? polygonCentroid(hole.green) : null;
  const out = [];
  for (let i = 0; i < pts.length / 2; i++) {
    const x = pts[i * 2], y = pts[i * 2 + 1];
    const fromTee = cum[i];
    // 到果岭前沿:点到果岭轮廓最近边的距离
    let toGreen = null;
    if (hole.green.length >= 6) {
      const c = closestOnPolyline(x, y, hole.green, true);
      toGreen = c ? c.d : null;
    }
    // 到最近障碍(参照线)的距离
    let toHazard = null;
    for (const rl of hole.refLines) {
      const c = closestOnPolyline(x, y, rl.points);
      if (c && (toHazard === null || c.d < toHazard)) toHazard = c.d;
    }
    // 进攻角度:来向段与指向果岭中心连线的夹角
    let angle = null;
    if (i > 0 && greenCenter) {
      const px = pts[(i - 1) * 2], py = pts[(i - 1) * 2 + 1];
      const a1 = Math.atan2(y - py, x - px);
      const a2 = Math.atan2(greenCenter.y - y, greenCenter.x - x);
      let d = (a2 - a1) * 180 / Math.PI;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      angle = Math.round(Math.abs(d) * 10) / 10;
    }
    out.push({ x, y, fromTee, toGreen, toHazard, angle });
  }
  return out;
}

// 落球区中心点
export const landingCenter = (lz) => ({ x: lz.x + lz.w / 2, y: lz.y + lz.h / 2 });

// 深拷贝(导出/导入用)
export const clone = (o) => JSON.parse(JSON.stringify(o));
