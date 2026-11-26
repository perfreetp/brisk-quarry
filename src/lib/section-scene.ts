import Two from 'two.js';
import type { Project } from '../types';
import { cableCode, ventCode } from './numbering';
import {
  VENT_SYMBOL_R,
  toScreen,
  type Camera
} from './geometry';
import { stroke, theme } from './theme';
import { drawLabel, hitTest, type HitTarget } from './two-scene';

/**
 * 粮堆纵剖面:横向为仓房长度方向(x),纵向为高程(地坪 0,粮面为粮堆高度)。
 * 同一批电缆按各自的埋设深度把分层测点竖着排下来;
 * 风口按风道标高达落到对应高程。平面与剖面共用实体 id 与同一套编号。
 */
export function buildSectionScene(
  two: Two,
  cam: Camera,
  project: Project,
  opts: {
    selectedId: string | null;
    compartmentFilter?: string | null;
  }
): { hits: HitTarget[] } {
  two.clear();
  const { width, grainHeight } = project.warehouse;
  const visible = (compId: string) =>
    !opts.compartmentFilter || compId === opts.compartmentFilter;

  // 地坪与粮堆轮廓
  const floorL = toScreen(cam, { x: -1.2, y: 0 });
  const floorR = toScreen(cam, { x: width + 1.2, y: 0 });
  const floor = two.makeLine(floorL.x, floorL.y, floorR.x, floorR.y);
  floor.stroke = theme.ground;
  floor.linewidth = stroke.wall;

  const grain = two.makeRectangle(
    toScreen(cam, { x: width / 2, y: grainHeight / 2 }).x,
    toScreen(cam, { x: width / 2, y: grainHeight / 2 }).y,
    width * cam.scale,
    grainHeight * cam.scale
  );
  grain.fill = theme.grainFill;
  grain.stroke = theme.grain;
  grain.linewidth = stroke.thin;
  grain.dashes = [5, 4];

  const surfL = toScreen(cam, { x: 0, y: grainHeight });
  two.makeText(`粮面 +${grainHeight.toFixed(1)}m`, surfL.x, surfL.y - 12, {
    size: 12,
    fill: theme.grain,
    alignment: 'left',
    weight: 700
  });
  two.makeText('地坪 ±0.00m', floorL.x, floorL.y + 18, {
    size: 12,
    fill: theme.ground,
    alignment: 'left'
  });

  const hits: HitTarget[] = [];

  // 电缆:竖向测杆 + 分层测点
  for (const c of project.cables) {
    if (!visible(c.compartmentId)) continue;
    const top = toScreen(cam, { x: c.pos.x, y: grainHeight });
    const maxDepth = c.points.reduce((m, p) => Math.max(m, p.depth), 0);
    const bottomY = Math.max(0, grainHeight - maxDepth);
    const bottom = toScreen(cam, { x: c.pos.x, y: bottomY });
    const rod = two.makeLine(top.x, top.y, bottom.x, bottom.y);
    rod.stroke = c.id === opts.selectedId ? theme.selected : theme.cable;
    rod.linewidth = c.id === opts.selectedId ? 3 : stroke.symbol;

    for (const pt of c.points) {
      const y = Math.max(0, grainHeight - pt.depth);
      const sp = toScreen(cam, { x: c.pos.x, y });
      const dot = two.makeCircle(sp.x, sp.y, Math.max(3, 0.11 * cam.scale));
      dot.fill = theme.labelFill;
      dot.stroke = theme.cableDeep;
      dot.linewidth = stroke.thin;
    }

    const anchor = { x: c.pos.x, y: grainHeight };
    const labelText = cableCode(c, project.rules);
    const drawn = drawLabel(
      two,
      cam,
      anchor,
      c.sectionLabel.pos,
      labelText,
      theme.cable,
      c.sectionLabel.pinned,
      c.id,
      'cable'
    );
    hits.push({
      id: c.id,
      kind: 'cable',
      part: 'symbol',
      circle: { cx: top.x, cy: top.y, r: 0.3 * cam.scale }
    });
    hits.push({ id: drawn.entityId, kind: drawn.kind, part: 'label', rect: drawn.screenRect });
  }

  // 风口:风道标高处的水平短管 + 风口符号
  for (const v of project.vents) {
    if (!visible(v.compartmentId)) continue;
    const y = v.ductElevation;
    const p1 = toScreen(cam, { x: v.pos.x - 0.55, y });
    const p2 = toScreen(cam, { x: v.pos.x + 0.55, y });
    const duct = two.makeLine(p1.x, p1.y, p2.x, p2.y);
    duct.stroke = v.id === opts.selectedId ? theme.selected : theme.vent;
    duct.linewidth = stroke.symbol + 1;
    const center = toScreen(cam, { x: v.pos.x, y });
    const r = VENT_SYMBOL_R * 0.8 * cam.scale;
    const box = two.makeRectangle(center.x, center.y, r * 1.6, r * 1.6);
    box.fill = theme.ventFill;
    box.stroke = v.id === opts.selectedId ? theme.selected : theme.vent;
    box.linewidth = stroke.symbol;

    const labelText = `${ventCode(v, project.rules)}\n${v.kind} ${y >= 0 ? '+' : ''}${y.toFixed(1)}m`;
    const anchor = { x: v.pos.x, y };
    const drawn = drawLabel(
      two,
      cam,
      anchor,
      v.sectionLabel.pos,
      labelText,
      theme.vent,
      v.sectionLabel.pinned,
      v.id,
      'vent'
    );
    hits.push({
      id: v.id,
      kind: 'vent',
      part: 'symbol',
      circle: { cx: center.x, cy: center.y, r: VENT_SYMBOL_R * cam.scale }
    });
    hits.push({ id: drawn.entityId, kind: drawn.kind, part: 'label', rect: drawn.screenRect });
  }

  // 最上层透明热区:符号优先于标注可点
  for (const c of project.cables) {
    if (!visible(c.compartmentId)) continue;
    const top = toScreen(cam, { x: c.pos.x, y: grainHeight });
    const hot = two.makeCircle(top.x, top.y, 0.3 * cam.scale);
    hot.fill = 'transparent';
    hot.stroke = 'transparent';
  }
  for (const v of project.vents) {
    if (!visible(v.compartmentId)) continue;
    const center = toScreen(cam, { x: v.pos.x, y: v.ductElevation });
    const hot = two.makeCircle(center.x, center.y, VENT_SYMBOL_R * cam.scale);
    hot.fill = 'transparent';
    hot.stroke = 'transparent';
  }

  two.update();
  return { hits };
}

export { hitTest };
export type { HitTarget };
