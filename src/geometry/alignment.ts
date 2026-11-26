import type { AlignmentModel, StationMark, Vec2 } from '../types';

export interface LocatedPoint {
  position: Vec2;
  tangent: Vec2;
  segmentIndex: number;
  s: number;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polylineLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

export function cumulativeLengths(points: Vec2[]): number[] {
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1], points[i]);
    lengths.push(total);
  }
  return lengths;
}

export function locateAtDistance(points: Vec2[], s: number): LocatedPoint {
  if (points.length === 0) return { position: { x: 0, y: 0 }, tangent: { x: 1, y: 0 }, segmentIndex: 0, s: 0 };
  if (points.length === 1 || s <= 0) {
    const tangent = points.length > 1 ? normalize(sub(points[1], points[0])) : { x: 1, y: 0 };
    return { position: { ...points[0] }, tangent, segmentIndex: 0, s: 0 };
  }

  const lengths = cumulativeLengths(points);
  const total = lengths[lengths.length - 1];
  const target = Math.min(Math.max(s, 0), total);

  for (let i = 1; i < points.length; i += 1) {
    if (target <= lengths[i] || i === points.length - 1) {
      const segLen = lengths[i] - lengths[i - 1];
      const t = segLen === 0 ? 0 : (target - lengths[i - 1]) / segLen;
      const a = points[i - 1];
      const b = points[i];
      const tangent = segLen === 0 ? { x: 1, y: 0 } : { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen };
      return {
        position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        tangent,
        segmentIndex: i - 1,
        s: target,
      };
    }
  }

  const last = points[points.length - 1];
  const prev = points[points.length - 2] ?? last;
  return { position: { ...last }, tangent: normalize(sub(last, prev)), segmentIndex: points.length - 2, s: total };
}

export function locateAtChainage(alignment: AlignmentModel, chainage: number): LocatedPoint {
  return locateAtDistance(alignment.points, chainage - alignment.startChainage);
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

export function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  return len < 1e-12 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

/** side=1 为切线逆时针法向，side=-1 为另一侧（坐标计算系，不依赖渲染方向）。 */
export function normalAt(tangent: Vec2, side: -1 | 1): Vec2 {
  return { x: -tangent.y * side, y: tangent.x * side };
}

export function offsetPointAtDistance(points: Vec2[], s: number, offset: number, side: -1 | 1): Vec2 {
  const located = locateAtDistance(points, s);
  const n = normalAt(located.tangent, side);
  return { x: located.position.x + n.x * offset, y: located.position.y + n.y * offset };
}

export function offsetPolyline(
  points: Vec2[],
  offset: number,
  side: -1 | 1,
  startS = 0,
  endS?: number,
  step = 2,
): Vec2[] {
  const total = polylineLength(points);
  const end = Math.max(startS, Math.min(endS ?? total, total));
  const result: Vec2[] = [];
  const span = Math.max(0, end - startS);
  const count = Math.max(1, Math.ceil(span / step));
  for (let i = 0; i <= count; i += 1) {
    const s = startS + (span * i) / count;
    result.push(offsetPointAtDistance(points, s, offset, side));
  }
  return result;
}

export function formatChainage(chainage: number): string {
  const rounded = Math.round(chainage * 10) / 10;
  const k = Math.floor(rounded / 1000);
  const meter = Math.round(rounded - k * 1000);
  if (meter >= 1000) return `K${k + 1}+000`;
  return `K${k}+${String(meter).padStart(3, '0')}`;
}

export function parseChainage(text: string): number | null {
  const normalized = text.trim().toUpperCase().replace(/[＋\s]/g, '+');
  const match = normalized.match(/^(?:DK|K)?\s*(\d+)\s*\+\s*(\d+(?:\.\d+)?)$/);
  if (match) return Number(match[1]) * 1000 + Number(match[2]);
  const pure = normalized.match(/^(?:DK|K)?\s*(\d+(?:\.\d+)?)$/);
  if (pure) {
    const value = Number(pure[1]);
    return value < 100 ? value * 1000 : value;
  }
  return null;
}

export function buildStations(alignment: AlignmentModel): StationMark[] {
  const length = polylineLength(alignment.points);
  const start = alignment.startChainage;
  const end = start + length;
  const marks = new Map<number, StationMark>();

  const put = (chainage: number, kind: StationMark['kind']) => {
    if (chainage < start - 1e-6 || chainage > end + 1e-6) return;
    const rounded = Math.round(chainage);
    const existing = marks.get(rounded);
    if (existing && existing.kind === 'km') return;
    const located = locateAtChainage(alignment, chainage);
    const k = Math.floor(rounded / 1000);
    const meter = rounded - k * 1000;
    marks.set(rounded, {
      id: `station-${rounded}`,
      chainage: rounded,
      relChainage: rounded - start,
      k,
      meter,
      label: kind === 'curve' && meter % 100 !== 0 ? `+${String(meter).padStart(3, '0')}` : formatChainage(rounded),
      kind,
      position: located.position,
      tangent: located.tangent,
    });
  };

  const firstKm = Math.ceil(start / 1000);
  const lastKm = Math.floor(end / 1000);
  for (let k = firstKm; k <= lastKm; k += 1) put(k * 1000, 'km');

  const firstHm = Math.ceil(start / 100) * 100;
  for (let c = firstHm; c <= end; c += 100) {
    if (Math.abs(c % 1000) > 1e-6) put(c, 'hm');
  }

  for (const curve of alignment.curveRanges) {
    const first = Math.ceil(curve.startChainage / 20) * 20;
    for (let c = first; c <= curve.endChainage + 1e-6; c += 20) {
      if (Math.abs(c % 100) < 1e-6) continue;
      put(c, 'curve');
    }
  }

  return [...marks.values()].sort((a, b) => a.chainage - b.chainage);
}

export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
