import type { Vec2 } from '../types';

export interface SegmentIntersection {
  aIndex: number;
  bIndex: number;
  point: Vec2;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

const EPS = 1e-9;

/** 返回折线闭合后的非相邻边交点，用于识别自交偏移边界。 */
export function findSelfIntersections(polygon: Vec2[]): SegmentIntersection[] {
  const hits: SegmentIntersection[] = [];
  const n = polygon.length;
  if (n < 4) return hits;

  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      // 相邻边和首尾相邻边不算自交。
      if (j === i || j === i + 1) continue;
      if (i === 0 && j === n - 1) continue;
      const c = polygon[j];
      const d = polygon[(j + 1) % n];
      const hit = segmentIntersection(a, b, c, d);
      if (hit) hits.push({ aIndex: i, bIndex: j, point: hit });
    }
  }
  return hits;
}

export function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denominator = cross(rx, ry, sx, sy);
  const qpx = c.x - a.x;
  const qpy = c.y - a.y;

  if (Math.abs(denominator) < EPS) return null;
  const t = cross(qpx, qpy, sx, sy) / denominator;
  const u = cross(qpx, qpy, rx, ry) / denominator;
  if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
    return { x: a.x + t * rx, y: a.y + t * ry };
  }
  return null;
}

export function polygonArea(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function absolutePolygonArea(points: Vec2[]): number {
  return Math.abs(polygonArea(points));
}

export function boundsOf(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}
