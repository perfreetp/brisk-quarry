import paper from 'paper';
import type { Vec2 } from '../types';
import { polygonArea } from './topology';

let geometryPaperReady = false;

/** 数量计算也需要 Paper 布尔引擎；使用离屏 canvas，不影响页面上的 Paper 视图。 */
export function ensureGeometryPaper(): typeof paper {
  if (!geometryPaperReady) {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      paper.setup(canvas);
    } else {
      paper.setup(new paper.Size(256, 256));
    }
    geometryPaperReady = true;
  }
  return paper;
}

function toPath(points: Vec2[], closed = true): paper.Path {
  const p = ensureGeometryPaper();
  return new p.Path({
    segments: points.map((pt) => new p.Point(pt.x, pt.y)),
    closed,
    insert: false,
  });
}

function collectPathItems(item: paper.PathItem | paper.Item | null | undefined): paper.Path[] {
  if (!item) return [];
  const anyItem = item as unknown as { children?: paper.Item[]; className?: string };
  if (anyItem.children && anyItem.children.length) {
    return anyItem.children.flatMap((child) => collectPathItems(child as paper.PathItem));
  }
  if (anyItem.className === 'Path' || item instanceof paper.Path) return [item as paper.Path];
  return [];
}

function pathToPoints(path: paper.Path): Vec2[] {
  return path.segments.map((segment) => ({ x: segment.point.x, y: segment.point.y }));
}

function pointInsideLoop(point: Vec2, loop: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = loop[i].x;
    const yi = loop[i].y;
    const xj = loop[j].x;
    const yj = loop[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function splitOuterAndHoles(loops: Vec2[][]): { outer: Vec2[][]; holes: Vec2[][] } {
  const outer: Vec2[][] = [];
  const holes: Vec2[][] = [];
  loops.forEach((loop, index) => {
    if (loop.length < 3) return;
    const test = loop[0];
    let depth = 0;
    loops.forEach((other, otherIndex) => {
      if (index !== otherIndex && other.length > 2 && pointInsideLoop(test, other)) depth += 1;
    });
    if (depth % 2 === 0) outer.push(loop);
    else holes.push(loop);
  });
  return { outer, holes };
}

export interface BooleanRepairResult {
  loops: Vec2[][];
  outerLoops: Vec2[][];
  holes: Vec2[][];
  areaM2: number;
  repaired: boolean;
  engine: string;
}

/**
 * 对可能自交的偏移带状多边形执行 crossings 拆分 + union，
 * 再用 subtract 扣除孔洞。任何布尔异常都回退到原始环，保证排版不白屏。
 */
export function repairPolygonWithBooleans(rawBoundary: Vec2[], holePolygons: Vec2[][] = []): BooleanRepairResult {
  const p = ensureGeometryPaper();
  const fallbackLoops = rawBoundary.length >= 3 ? [rawBoundary] : [];
  const fallbackArea = Math.abs(polygonArea(rawBoundary));

  try {
    const raw = toPath(rawBoundary, true);
    let resolved: paper.PathItem = raw;
    const resolveFn = (raw as unknown as { resolveCrossings?: () => paper.PathItem }).resolveCrossings;
    if (typeof resolveFn === 'function') {
      resolved = resolveFn.call(raw) ?? raw;
    }

    let pieces = collectPathItems(resolved).filter((path) => path.segments.length >= 3 && Math.abs(path.area ?? 0) > 1e-7);
    if (!pieces.length) pieces = [raw];

    let union: paper.PathItem = pieces[0];
    for (let i = 1; i < pieces.length; i += 1) {
      try {
        const next = (union as unknown as { unite: (other: paper.Path, options?: object) => paper.PathItem }).unite(pieces[i], {
          insert: false,
          trace: true,
        });
        if (next) union = next;
      } catch {
        // 单个分片 union 失败时保留其它分片，不能让整版图册中断。
      }
    }

    for (const hole of holePolygons) {
      if (hole.length < 3) continue;
      try {
        const holePath = toPath(hole, true);
        const next = (union as unknown as { subtract: (other: paper.Path, options?: object) => paper.PathItem }).subtract(holePath, {
          insert: false,
          trace: true,
        });
        if (next) union = next;
      } catch {
        // 孔洞布尔失败时仍保留外环；面积计算会显式扣除洞面积。
      }
    }

    try {
      (union as unknown as { reorient?: (nonZero?: boolean, clockwise?: boolean) => void }).reorient?.(true, true);
    } catch {
      /* orientation is normalized by our own nesting pass */
    }

    let loops = collectPathItems(union)
      .filter((path) => path.closed && path.segments.length >= 3)
      .map(pathToPoints);

    if (!loops.length) loops = [pathToPoints(union as paper.Path)];
    loops = loops.filter((loop) => loop.length >= 3);

    const { outer, holes } = splitOuterAndHoles(loops);
    const safeOuter = outer.length ? outer : loops;
    const nestedHoles = outer.length ? holes : holePolygons;
    const outerArea = safeOuter.reduce((sum, loop) => sum + Math.abs(polygonArea(loop)), 0);
    const holeArea = nestedHoles.reduce((sum, loop) => sum + Math.abs(polygonArea(loop)), 0)
      + holePolygons.reduce((sum, hole) => (nestedHoles.length ? sum : sum + Math.abs(polygonArea(hole))), 0);
    const areaM2 = Math.max(0, outerArea - (nestedHoles.length ? holeArea : holePolygons.reduce((s, h) => s + Math.abs(polygonArea(h)), 0)));

    return {
      loops: safeOuter.concat(nestedHoles),
      outerLoops: safeOuter,
      holes: nestedHoles.length ? nestedHoles : holePolygons,
      areaM2: areaM2 || Math.abs((union as unknown as { area?: number }).area ?? fallbackArea),
      repaired: true,
      engine: `Paper.js ${p.version ?? '0.12'} boolean/resolveCrossings`,
    };
  } catch (error) {
    console.warn('[atlas] 路径布尔修复失败，使用原始边界', error);
    return {
      loops: fallbackLoops.concat(holePolygons),
      outerLoops: fallbackLoops,
      holes: holePolygons,
      areaM2: Math.max(0, fallbackArea - holePolygons.reduce((s, h) => s + Math.abs(polygonArea(h)), 0)),
      repaired: false,
      engine: 'fallback shoelace',
    };
  }
}

export function ellipsePolygon(center: Vec2, axisAlong: Vec2, axisAcross: Vec2, radiusAlong: number, radiusAcross: number, segments = 40): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i < segments; i += 1) {
    const t = (Math.PI * 2 * i) / segments;
    points.push({
      x: center.x + axisAlong.x * Math.cos(t) * radiusAlong + axisAcross.x * Math.sin(t) * radiusAcross,
      y: center.y + axisAlong.y * Math.cos(t) * radiusAlong + axisAcross.y * Math.sin(t) * radiusAcross,
    });
  }
  return points;
}
