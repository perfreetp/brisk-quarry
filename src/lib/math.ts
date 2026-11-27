import type { BranchData, CutMarker, Vec3Tuple } from '../types';

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: Vec3Tuple, s: number): Vec3Tuple {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function dot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function length(a: Vec3Tuple): number {
  return Math.hypot(a[0], a[1], a[2]);
}
export function normalize(a: Vec3Tuple): Vec3Tuple {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 1, 0];
}
export function distance(a: Vec3Tuple, b: Vec3Tuple): number {
  return length(sub(a, b));
}
export function mixPoint(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function branchVector(b: BranchData): Vec3Tuple {
  return sub(b.end, b.start);
}

export function branchLength(b: BranchData): number {
  return distance(b.start, b.end);
}

export function diameterAtT(b: BranchData, t: number): number {
  return Math.max(0.0005, lerp(b.diameter, b.tipDiameter, clamp(t, 0, 1)));
}

/**
 * Latest legal cut position. JSON can provide minCutDiameter; otherwise the
 * endpoint itself is the hard bound. A small safety inset keeps the ring on wood.
 */
export function maxCutT(b: BranchData, minCutDiameter = 0): number {
  const threshold = Math.max(minCutDiameter, b.minCutDiameter ?? 0);
  if (threshold <= 0 || b.diameter <= threshold) return 0.995;
  const d0 = b.diameter;
  const d1 = Math.min(b.tipDiameter, d0 - 1e-6);
  if (threshold <= d1) return 0.995;
  const t = (d0 - threshold) / (d0 - d1);
  return clamp(t - 0.004, 0.02, 0.995);
}

export function minCutT(): number {
  return 0.005;
}

export function makeCut(b: BranchData, rawT: number, snappedBudId: string | null = null, minCutDiameter = 0): CutMarker {
  const t = clamp(rawT, minCutT(), maxCutT(b, minCutDiameter));
  return {
    t,
    position: mixPoint(b.start, b.end, t),
    snappedBudId,
    diameter: diameterAtT(b, t),
  };
}

export function formatMm(metres: number, digits = 1): string {
  return `${(metres * 1000).toFixed(digits)} mm`;
}

export function formatM(metres: number): string {
  return metres >= 10 ? metres.toFixed(2) : metres.toFixed(3);
}

export function formatCoord(v: number): string {
  return v.toFixed(3);
}

export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Deterministic seeded random for the built-in demo tree. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
