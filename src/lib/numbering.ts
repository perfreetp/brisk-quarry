import type {
  Cable,
  LayerPoint,
  NumberingRules,
  Project,
  Vent,
} from '../types';

export function pad(n: number, padding: number): string {
  return String(n).padStart(padding, '0');
}

/** 电缆平面编号,如 C1(规则 C、起始 1、不补零) */
export function cableCode(c: Cable, r: NumberingRules): string {
  return `${r.cablePrefix}${pad(c.seq + r.cableStartFrom - 1, r.cablePadding)}`;
}

/** 单个分层测点编号,如 C1-3 */
export function pointCode(
  c: Cable,
  p: LayerPoint,
  r: NumberingRules
): string {
  return `${cableCode(c, r)}-${pad(
    p.layer + r.layerStartFrom - 1,
    r.layerPadding
  )}`;
}

export function ventCode(v: Vent, r: NumberingRules): string {
  return `${r.ventPrefix}${pad(v.seq + r.ventStartFrom - 1, r.ventPadding)}`;
}

/**
 * 重排:同一套规则重算所有电缆/风口的 seq。
 * 电缆按廒间分组,组内按平面坐标(先 y 后 x,即从里到外、从左到右)排序;
 * 风口全仓按 x 后 y 排序。实体 id 不变,因此标注与符号的对应关系不丢。
 */
export function renumber(project: Project): void {
  const byComp = new Map<string, Cable[]>();
  for (const c of project.cables) {
    const list = byComp.get(c.compartmentId) ?? [];
    list.push(c);
    byComp.set(c.compartmentId, list);
  }
  for (const list of byComp.values()) {
    list
      .sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x)
      .forEach((c, i) => {
        c.seq = i + 1;
      });
  }
  [...project.vents]
    .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y)
    .forEach((v, i) => {
      v.seq = i + 1;
    });
}
