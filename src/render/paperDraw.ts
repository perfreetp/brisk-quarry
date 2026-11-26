import paper from 'paper';
import type { Vec2 } from '../types';
import { RENDER_PX_PER_MM, mm } from './engineeringFont';

export function px(valueMm: number): number {
  return mm(valueMm);
}

function withScaledStroke(attrs: Record<string, unknown>): Record<string, unknown> {
  if (typeof attrs.strokeWidth === 'number') {
    return { ...attrs, strokeWidth: px(attrs.strokeWidth) };
  }
  return attrs;
}

export function rectPath(x: number, y: number, w: number, h: number, attrs: Record<string, unknown> = {}): paper.Path.Rectangle {
  return new paper.Path.Rectangle({
    rectangle: new paper.Rectangle(px(x), px(y), px(w), px(h)),
    ...withScaledStroke(attrs),
  }) as paper.Path.Rectangle;
}

export function circlePath(x: number, y: number, rMm: number, attrs: Record<string, unknown> = {}): paper.Path.Circle {
  return new paper.Path.Circle({
    center: [px(x), px(y)],
    radius: px(rMm),
    ...withScaledStroke(attrs),
  }) as paper.Path.Circle;
}

export function polygonPath(points: Vec2[], closed = true, attrs: Record<string, unknown> = {}): paper.Path {
  return new paper.Path({
    segments: points.map((p) => [px(p.x), px(p.y)]),
    closed,
    ...withScaledStroke(attrs),
  });
}

export function linePath(points: Vec2[], attrs: Record<string, unknown> = {}): paper.Path {
  return polygonPath(points, false, attrs);
}

export function setStrokeMm(item: paper.Item, widthMm: number, color: string): void {
  item.strokeColor = new paper.Color(color);
  item.strokeWidth = px(widthMm);
}

export function paperPointToMm(point: paper.Point): Vec2 {
  return { x: point.x / RENDER_PX_PER_MM, y: point.y / RENDER_PX_PER_MM };
}
