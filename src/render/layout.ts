import type { AtlasPageInfo, ProjectDocument, Vec2 } from '../types';
import { locateAtChainage } from '../geometry/alignment';

export const SHEET = {
  widthMm: 420,
  heightMm: 297,
};

export const FRAME = {
  outer: { x: 8, y: 8, w: 404, h: 281 },
  inner: { x: 12, y: 12, w: 396, h: 273 },
  map: { x: 18, y: 32, w: 272, h: 205 },
  side: { x: 297, y: 32, w: 105, h: 205 },
  title: { x: 18, y: 244, w: 384, h: 41 },
};

export interface MmRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectCenter(rect: { x: number; y: number; w: number; h: number }) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function mmPerMeter(doc: ProjectDocument): number {
  return 1000 / doc.scaleDenominator;
}

export class PlanTransform {
  readonly anchor: Vec2;
  readonly theta: number;
  readonly k: number;
  readonly centerX: number;
  readonly centerY: number;

  constructor(doc: ProjectDocument, page: AtlasPageInfo) {
    const start = page.startChainage ?? doc.alignment.startChainage;
    const end = page.endChainage ?? start + doc.pageSpanM;
    const mid = (start + end) / 2;
    const located = locateAtChainage(doc.alignment, mid);
    this.anchor = located.position;
    this.theta = Math.atan2(located.tangent.y, located.tangent.x);
    this.k = mmPerMeter(doc);
    const center = rectCenter(FRAME.map);
    this.centerX = center.x;
    this.centerY = center.y;
  }

  map(point: Vec2): Vec2 {
    const dx = point.x - this.anchor.x;
    const dy = point.y - this.anchor.y;
    const cos = Math.cos(this.theta);
    const sin = Math.sin(this.theta);
    return {
      x: this.centerX + this.k * (cos * dx + sin * dy),
      y: this.centerY + this.k * (-sin * dx + cos * dy),
    };
  }

  mapVector(vector: Vec2): Vec2 {
    const cos = Math.cos(this.theta);
    const sin = Math.sin(this.theta);
    return {
      x: this.k * (cos * vector.x + sin * vector.y),
      y: this.k * (-sin * vector.x + cos * vector.y),
    };
  }

  mapLength(meters: number): number {
    return meters * this.k;
  }
}

export function rectsIntersect(a: MmRect, b: MmRect, padding = 0): boolean {
  return (
    a.x - padding < b.x + b.width &&
    a.x + a.width + padding > b.x &&
    a.y - padding < b.y + b.height &&
    a.y + a.height + padding > b.y
  );
}

export function nearestNonOverlappingPosition(
  desiredX: number,
  desiredY: number,
  width: number,
  height: number,
  obstacles: MmRect[],
  bounds: MmRect = { x: 13, y: 13, width: 394, height: 271 },
): { x: number; y: number; moved: boolean } {
  const clampX = (x: number) => Math.min(Math.max(x, bounds.x), bounds.x + bounds.width - width);
  const clampY = (y: number) => Math.min(Math.max(y, bounds.y), bounds.y + bounds.height - height);
  const desired = { x: clampX(desiredX), y: clampY(desiredY) };
  const collides = (x: number, y: number) => {
    const rect = { x, y, width, height };
    return obstacles.some((obstacle) => rectsIntersect(rect, obstacle, 1.5));
  };

  if (!collides(desired.x, desired.y)) return { ...desired, moved: false };

  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (let x = bounds.x; x <= bounds.x + bounds.width - width + 0.1; x += 4) {
    for (let y = bounds.y; y <= bounds.y + bounds.height - height + 0.1; y += 4) {
      if (collides(x, y)) continue;
      const distance = (x - desired.x) ** 2 + (y - desired.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }
  }
  return best ? { ...best, moved: true } : { ...desired, moved: false };
}
