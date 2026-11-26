import type { BaseEntity, Vec } from '../types';
import { clamp } from './util';

/**
 * 标注自动避让引擎(平面、剖面通用)。
 * 思路:每个标注框受三个力——
 *  1. 与其他标注框重叠时的排斥力(把互相压住的标注推开);
 *  2. 朝自己符号锚点的弱拉力(引线不会被拉得无限长);
 *  3. 越过排版边界时的软墙回推力。
 * 保管员手动拖过的标注 pinned=true,全程固定不动,
 * 其余标注在它周围找空位,保证"拖开的标注不会被重排抢回去"。
 */

export interface Box {
  w: number;
  h: number;
}

export interface LayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LayoutOptions {
  bounds: LayoutBounds;
  /** 实体锚点(符号中心)取法,默认取实体 pos */
  anchorOf?: (e: BaseEntity) => Vec;
  /** 每个实体标注框尺寸(米),默认取 defaultBox */
  boxOf?: (e: BaseEntity) => Box;
  defaultBox: Box;
  iterations?: number;
  /** 新标注初始相对锚点的偏移方向序列(米),按顺序找第一个不冲突的 */
  seedOffsets?: Vec[];
}

interface Node {
  entity: BaseEntity;
  box: Box;
  pos: Vec; // 标注框中心
  anchor: Vec;
  pinned: boolean;
}

const DEFAULT_OFFSETS: Vec[] = [
  { x: 0.9, y: -0.7 },
  { x: 0.9, y: 0.7 },
  { x: -0.9, y: -0.7 },
  { x: -0.9, y: 0.7 },
  { x: 0, y: -1.0 },
  { x: 0, y: 1.0 },
  { x: 1.4, y: 0 },
  { x: -1.4, y: 0 }
];

const OVERLAP_GAP = 0.18; // 标注框之间至少留的间隙(米)
const WALL_GAP = 0.15;

function boxesOverlap(
  a: Node,
  ax: number,
  ay: number,
  b: Node,
  bx: number,
  by: number
): boolean {
  return (
    Math.abs(ax - bx) < (a.box.w + b.box.w) / 2 + OVERLAP_GAP &&
    Math.abs(ay - by) < (a.box.h + b.box.h) / 2 + OVERLAP_GAP
  );
}

/**
 * 就地更新各实体的 label(或 sectionLabel)。
 * 只改非 pinned 标注;新实体(标注位置恰好等于锚点且未 pinned)先播种子位置。
 */
export function layoutLabels(
  entities: BaseEntity[],
  which: 'label' | 'sectionLabel',
  opts: LayoutOptions
): void {
  if (entities.length === 0) return;
  const iterations = opts.iterations ?? 140;
  const offsets = opts.seedOffsets ?? DEFAULT_OFFSETS;
  const { minX, minY, maxX, maxY } = opts.bounds;

  // 1. 建节点
  const nodes: Node[] = entities.map((entity) => {
    const box = opts.boxOf ? opts.boxOf(entity) : opts.defaultBox;
    const anchor = opts.anchorOf ? opts.anchorOf(entity) : entity.pos;
    return {
      entity,
      box,
      anchor,
      pos: { ...entity[which].pos },
      pinned: entity[which].pinned
    };
  });

  // 2. 给"未拖过且还压在锚点上"的新标注播种子位置
  const placed: Node[] = [];
  for (const n of nodes) {
    const label = n.entity[which];
    const isFresh =
      !label.pinned &&
      Math.abs(label.pos.x - n.anchor.x) < 1e-6 &&
      Math.abs(label.pos.y - n.anchor.y) < 1e-6;
    if (isFresh) {
      let chosen = offsets[0];
      for (const off of offsets) {
        const tx = n.anchor.x + off.x;
        const ty = n.anchor.y + off.y;
        if (!placed.some((p) => boxesOverlap(n, tx, ty, p, p.pos.x, p.pos.y))) {
          chosen = off;
          break;
        }
      }
      n.pos = { x: n.anchor.x + chosen.x, y: n.anchor.y + chosen.y };
    }
    placed.push(n);
  }

  // 3. 力导向松弛:pinned 节点固定,其余节点被推开、被锚点拉住、被墙挡回
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const ni = nodes[i];
      if (ni.pinned) continue;
      let fx = 0;
      let fy = 0;

      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const nj = nodes[j];
        const dx = ni.pos.x - nj.pos.x;
        const dy = ni.pos.y - nj.pos.y;
        const ox = (ni.box.w + nj.box.w) / 2 + OVERLAP_GAP - Math.abs(dx);
        const oy = (ni.box.h + nj.box.h) / 2 + OVERLAP_GAP - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            fx += (dx >= 0 ? ox : -ox) * 0.5;
          } else if (oy < ox) {
            fy += (dy >= 0 ? oy : -oy) * 0.5;
          } else {
            const len = Math.hypot(dx, dy) || 1;
            fx += (dx / len) * ox * 0.5;
            fy += (dy / len) * oy * 0.5;
          }
        }
      }

      fx += (ni.anchor.x - ni.pos.x) * 0.06;
      fy += (ni.anchor.y - ni.pos.y) * 0.06;

      const left = minX + ni.box.w / 2 + WALL_GAP;
      const right = maxX - ni.box.w / 2 - WALL_GAP;
      const top = maxY - ni.box.h / 2 - WALL_GAP;
      const bottom = minY + ni.box.h / 2 + WALL_GAP;
      if (ni.pos.x < left) fx += (left - ni.pos.x) * 0.5;
      if (ni.pos.x > right) fx -= (ni.pos.x - right) * 0.5;
      if (ni.pos.y < bottom) fy += (bottom - ni.pos.y) * 0.5;
      if (ni.pos.y > top) fy -= (ni.pos.y - top) * 0.5;

      const step = iter < 60 ? 0.35 : 0.15;
      ni.pos.x = clamp(ni.pos.x + fx * step, minX - 2, maxX + 2);
      ni.pos.y = clamp(ni.pos.y + fy * step, minY - 2, maxY + 2);
    }
  }

  // 4. 写回实体(保留 pinned 标记)
  for (const n of nodes) {
    const label = n.entity[which];
    label.pos = { x: n.pos.x, y: n.pos.y };
    label.pinned = n.pinned;
  }
}
