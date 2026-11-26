import Two from 'two.js';
import type { Cable, Project, Vec, Vent } from '../types';
import { cableCode, pointCode, ventCode } from './numbering';
import {
  CABLE_SYMBOL_R,
  LABEL_FONT,
  VENT_SYMBOL_R,
  labelBoxSize,
  toScreen,
  type Camera
} from './geometry';
import { stroke, theme } from './theme';

export type EntityKind = 'cable' | 'vent';

/** 命中区域:符号本体或标注框,均为屏幕像素坐标 */
export interface HitTarget {
  id: string;
  kind: EntityKind;
  part: 'symbol' | 'label';
  /** 屏幕空间圆(符号) */
  circle?: { cx: number; cy: number; r: number };
  /** 屏幕空间矩形(标注框) */
  rect?: { x: number; y: number; w: number; h: number };
}

export interface LabelTextProvider {
  (e: Cable | Vent): string;
}

export function defaultPlanLabel(project: Project): LabelTextProvider {
  return (e) =>
    e.type === 'cable'
      ? cableCode(e, project.rules)
      : `${ventCode(e, project.rules)}\n${e.kind}`;
}

export function detailedPlanLabel(project: Project): LabelTextProvider {
  return (e) => {
    if (e.type === 'vent') {
      return `${ventCode(e, project.rules)} ${e.kind}`;
    }
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    if (!first || !last) return cableCode(e, project.rules);
    return `${cableCode(e, project.rules)}\n${pointCode(e, first, project.rules)}~${pointCode(
      e,
      last,
      project.rules
    )}`;
  };
}

// ---------- 基础图元 ----------

function drawGrid(two: Two, cam: Camera, project: Project): void {
  const { width, depth } = project.warehouse;
  const step = 2;
  for (let x = 0; x <= width + 1e-6; x += step) {
    const a = toScreen(cam, { x, y: 0 });
    const b = toScreen(cam, { x, y: depth });
    two.makeLine(a.x, a.y, b.x, b.y).stroke = theme.grid;
  }
  for (let y = 0; y <= depth + 1e-6; y += step) {
    const a = toScreen(cam, { x: 0, y });
    const b = toScreen(cam, { x: width, y });
    two.makeLine(a.x, a.y, b.x, b.y).stroke = theme.grid;
  }
}

function drawWalls(two: Two, cam: Camera, project: Project): void {
  const { width, depth } = project.warehouse;
  const corners = [
    toScreen(cam, { x: 0, y: 0 }),
    toScreen(cam, { x: width, y: 0 }),
    toScreen(cam, { x: width, y: depth }),
    toScreen(cam, { x: 0, y: depth })
  ];
  const wall = two.makePath(
    ...corners.flatMap((c) => [c.x, c.y])
  );
  wall.closed = true;
  wall.fill = 'rgba(38,52,69,0.03)';
  wall.stroke = theme.warehouse;
  wall.linewidth = stroke.wall;

  for (const comp of project.compartments) {
    const p1 = toScreen(cam, { x: comp.rect.x, y: comp.rect.y });
    const p2 = toScreen(cam, {
      x: comp.rect.x + comp.rect.w,
      y: comp.rect.y + comp.rect.h
    });
    const r = two.makeRectangle(
      (p1.x + p2.x) / 2,
      (p1.y + p2.y) / 2,
      Math.abs(p2.x - p1.x),
      Math.abs(p2.y - p1.y)
    );
    r.fill = theme.compartmentFill;
    r.stroke = theme.compartment;
    r.linewidth = stroke.thin;
    r.dashes = [6, 4];

    const title = toScreen(cam, {
      x: comp.rect.x + 0.4,
      y: comp.rect.y + comp.rect.h - 0.55
    });
    two.makeText(comp.name, title.x, title.y, {
      size: 15,
      fill: theme.compartment,
      weight: 700,
      alignment: 'left'
    });
  }

  // 尺寸线:仓房长/宽
  const y0 = toScreen(cam, { x: 0, y: 0 });
  const yD = toScreen(cam, { x: 0, y: depth });
  const xW = toScreen(cam, { x: width, y: 0 });
  two.makeText(`${width} m`, (y0.x + xW.x) / 2, y0.y + 22, {
    size: 12,
    fill: theme.dim
  });
  two.makeText(`${depth} m`, y0.x - 20, (y0.y + yD.y) / 2, {
    size: 12,
    fill: theme.dim,
    alignment: 'right'
  });
}

/** 测温电缆符号:双圈 + 中心点(代表分层测温杆) */
function drawCableSymbol(
  two: Two,
  cam: Camera,
  c: Cable,
  selected: boolean
): void {
  const p = toScreen(cam, c.pos);
  const r = CABLE_SYMBOL_R * cam.scale;
  const outer = two.makeCircle(p.x, p.y, r);
  outer.fill = theme.cableFill;
  outer.stroke = selected ? theme.selected : theme.cable;
  outer.linewidth = selected ? 3 : stroke.symbol;
  const inner = two.makeCircle(p.x, p.y, r * 0.45);
  inner.fill = 'transparent';
  inner.stroke = theme.cableDeep;
  inner.linewidth = stroke.thin;
  two.makeCircle(p.x, p.y, Math.max(2, r * 0.14)).fill = theme.cableDeep;
}

/** 风口符号:方框 + 朝向三角 + 风道编号位 */
function drawVentSymbol(
  two: Two,
  cam: Camera,
  v: Vent,
  selected: boolean
): void {
  const p = toScreen(cam, v.pos);
  const r = VENT_SYMBOL_R * cam.scale;
  const box = two.makeRectangle(p.x, p.y, r * 1.7, r * 1.7);
  box.fill = theme.ventFill;
  box.stroke = selected ? theme.selected : theme.vent;
  box.linewidth = selected ? 3 : stroke.symbol;
  box.rotation = v.angle;
  // 朝向小三角(局部坐标,随方框旋转)
  const rad = (v.angle * Math.PI) / 180;
  const tip = {
    x: p.x + Math.sin(rad) * r * 1.15,
    y: p.y - Math.cos(rad) * r * 1.15
  };
  const base1 = {
    x: p.x + Math.cos(rad) * r * 0.45,
    y: p.y + Math.sin(rad) * r * 0.45
  };
  const base2 = {
    x: p.x - Math.cos(rad) * r * 0.45,
    y: p.y - Math.sin(rad) * r * 0.45
  };
  const tri = two.makePath(
    tip.x,
    tip.y,
    base1.x,
    base1.y,
    base2.x,
    base2.y
  );
  tri.closed = true;
  tri.fill = theme.vent;
  tri.stroke = theme.ventDeep;
  tri.linewidth = stroke.thin;
}

interface DrawnLabel {
  entityId: string;
  kind: EntityKind;
  screenRect: { x: number; y: number; w: number; h: number };
}

export function drawLabel(
  two: Two,
  cam: Camera,
  anchor: Vec,
  labelPos: Vec,
  text: string,
  color: string,
  pinned: boolean,
  entityId: string,
  kind: EntityKind
): DrawnLabel {
  const a = toScreen(cam, anchor);
  const lp = toScreen(cam, labelPos);
  const boxWorld = labelBoxSize(text);
  const w = boxWorld.w * cam.scale;
  const h = boxWorld.h * cam.scale;

  // 引线:符号边缘 -> 标注框边缘
  const dx = lp.x - a.x;
  const dy = lp.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const start = { x: a.x + ux * CABLE_SYMBOL_R * cam.scale, y: a.y + uy * CABLE_SYMBOL_R * cam.scale };
  const end = {
    x: lp.x - ux * w / 2,
    y: lp.y - uy * h / 2
  };
  if (Math.hypot(end.x - start.x, end.y - start.y) > 2) {
    const leader = two.makeLine(start.x, start.y, end.x, end.y);
    leader.stroke = pinned ? theme.pinned : theme.leader;
    leader.linewidth = stroke.leader;
    // 引线端点小圆点
    two.makeCircle(end.x, end.y, 2.2).fill = pinned ? theme.pinned : theme.leader;
  }

  const rect = two.makeRectangle(lp.x, lp.y, w, h);
  rect.fill = theme.labelFill;
  rect.stroke = pinned ? theme.pinned : color;
  rect.linewidth = pinned ? 1.8 : stroke.thin;
  rect.opacity = 0.96;

  const lines = text.split('\n');
  const lineH = (LABEL_FONT + 0.06) * cam.scale;
  const totalH = lineH * lines.length;
  lines.forEach((line, i) => {
    two.makeText(line, lp.x, lp.y - totalH / 2 + lineH / 2 + i * lineH, {
      size: Math.max(9, LABEL_FONT * cam.scale * 0.92),
      fill: theme.labelText,
      weight: 600,
      alignment: 'center',
      family: '"Microsoft YaHei", sans-serif'
    });
  });

  return {
    entityId,
    kind,
    screenRect: { x: lp.x - w / 2, y: lp.y - h / 2, w, h }
  };
}

// ---------- 平面场景 ----------

export interface PlanSceneResult {
  hits: HitTarget[];
}

export function buildPlanScene(
  two: Two,
  cam: Camera,
  project: Project,
  opts: {
    labelText: LabelTextProvider;
    selectedId: string | null;
    compartmentFilter?: string | null;
  }
): PlanSceneResult {
  two.clear();
  drawGrid(two, cam, project);
  drawWalls(two, cam, project);

  const visible = (id: string) =>
    !opts.compartmentFilter || id === opts.compartmentFilter;

  const hits: HitTarget[] = [];
  const drawnLabels: DrawnLabel[] = [];

  for (const c of project.cables) {
    if (!visible(c.compartmentId)) continue;
    drawCableSymbol(two, cam, c, c.id === opts.selectedId);
    const sp = toScreen(cam, c.pos);
    hits.push({
      id: c.id,
      kind: 'cable',
      part: 'symbol',
      circle: {
        cx: sp.x,
        cy: sp.y,
        r: CABLE_SYMBOL_R * cam.scale * 1.35
      }
    });
  }

  for (const v of project.vents) {
    if (!visible(v.compartmentId)) continue;
    drawVentSymbol(two, cam, v, v.id === opts.selectedId);
    const sp = toScreen(cam, v.pos);
    hits.push({
      id: v.id,
      kind: 'vent',
      part: 'symbol',
      circle: {
        cx: sp.x,
        cy: sp.y,
        r: VENT_SYMBOL_R * cam.scale * 1.35
      }
    });
  }

  // 标注最后画,压在符号之上
  for (const c of project.cables) {
    if (!visible(c.compartmentId)) continue;
    drawnLabels.push(
      drawLabel(
        two,
        cam,
        c.pos,
        c.label.pos,
        opts.labelText(c),
        theme.cable,
        c.label.pinned,
        c.id,
        'cable'
      )
    );
  }
  for (const v of project.vents) {
    if (!visible(v.compartmentId)) continue;
    drawnLabels.push(
      drawLabel(
        two,
        cam,
        v.pos,
        v.label.pos,
        opts.labelText(v),
        theme.vent,
        v.label.pinned,
        v.id,
        'vent'
      )
    );
  }

  for (const d of drawnLabels) {
    hits.push({ id: d.entityId, kind: d.kind, part: 'label', rect: d.screenRect });
  }

  // 最上层透明热区:即使标注框盖住符号,符号仍可被直接拖动
  for (const c of project.cables) {
    if (!visible(c.compartmentId)) continue;
    const sp = toScreen(cam, c.pos);
    const hot = two.makeCircle(sp.x, sp.y, CABLE_SYMBOL_R * cam.scale * 1.35);
    hot.fill = 'transparent';
    hot.stroke = 'transparent';
  }
  for (const v of project.vents) {
    if (!visible(v.compartmentId)) continue;
    const sp = toScreen(cam, v.pos);
    const hot = two.makeCircle(sp.x, sp.y, VENT_SYMBOL_R * cam.scale * 1.35);
    hot.fill = 'transparent';
    hot.stroke = 'transparent';
  }

  two.update();
  return { hits };
}

export function hitTest(hits: HitTarget[], sx: number, sy: number): HitTarget | null {
  // 符号优先:保管员想拖的通常是符号本体,即使它被标注框盖住
  let bestSymbol: HitTarget | null = null;
  let bestD = Infinity;
  for (const h of hits) {
    if (h.part !== 'symbol' || !h.circle) continue;
    const d = Math.hypot(sx - h.circle.cx, sy - h.circle.cy);
    if (d <= h.circle.r && d < bestD) {
      bestD = d;
      bestSymbol = h;
    }
  }
  if (bestSymbol) return bestSymbol;
  // 符号区之外才轮到标注框
  for (const h of hits) {
    if (!h.rect) continue;
    const r = h.rect;
    if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return h;
  }
  return null;
}
