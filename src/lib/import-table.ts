import type { Cable, Project, Vent, VentKind } from '../types';
import { renumber } from './numbering';
import { uid } from './util';

/**
 * 解析保管员带来的两张表(Excel 复制出来的制表符文本)。
 * 电缆表列:电缆编号(可空)、廒间、X、Y、层号、深度 —— 同一根电缆的多行按编号/坐标归并。
 * 风口表列:风口编号(可空)、廒间、X、Y、形式、风道标高、朝向。
 * 表头可有可无,靠列内容猜测;分隔支持 Tab、逗号、连续空格。
 */

interface RawRow {
  cells: string[];
}

function splitLines(text: string): RawRow[] {
  const out: RawRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    // 只去掉行尾空白(含尾部 Tab),绝不动行首——行首空单元格(缺省编号列)必须保留
    const line = rawLine.replace(/[\t ]+$/, '');
    if (line.trim().length === 0) continue;
    out.push({
      // 仅按 Tab 或逗号分列,空单元格原样保留
      cells: line.split(/\t|,/).map((c) => c.trim())
    });
  }
  return out;
}

function num(s: string | undefined): number {
  if (!s) return NaN;
  return Number(s.replace(/[米m]/g, ''));
}

function findCompartment(
  project: Project,
  name: string
): string {
  const existing = project.compartments.find(
    (c) => c.name === name || c.id === name
  );
  if (existing) return existing.id;
  const id = uid('comp');
  project.compartments.push({
    id,
    name: name || `${project.compartments.length + 1}号廒间`,
    rect: { x: 0, y: 0, w: project.warehouse.width, h: project.warehouse.depth }
  });
  return id;
}

const VENT_KIND_WORDS: VentKind[] = ['地槽', '地上笼', '侧壁', '立筒'];

export interface ImportResult {
  cablesAdded: number;
  ventsAdded: number;
  errors: string[];
}

export function importCableTable(project: Project, text: string): ImportResult {
  const rows = splitLines(text);
  const errors: string[] = [];
  // 本次导入新建的电缆(用于统计);已存在的同位置电缆只合并测点,不重复计数
  const created = new Map<string, Cable>();
  const EPS = 1e-6;

  const findExisting = (compartmentId: string, x: number, y: number): Cable | undefined =>
    project.cables.find(
      (c) =>
        c.compartmentId === compartmentId &&
        Math.abs(c.pos.x - x) < EPS &&
        Math.abs(c.pos.y - y) < EPS
    );

  rows.forEach((row, idx) => {
    // 列:0=电缆编号(可空) 1=廒间 2=X 3=Y 4=层号 5=深度
    const [, cComp, cX, cY, cLayer, cDepth] = row.cells;
    const x = num(cX);
    const y = num(cY);
    // 表头行:X/Y 列不是有效数字(注意 Number('') === 0,必须先判空串)
    if (cX === undefined || cX.trim() === '' || Number.isNaN(x) || Number.isNaN(y)) {
      if (idx === 0) return; // 容忍首行表头
      errors.push(`第 ${idx + 1} 行:X/Y 坐标无法识别,已跳过`);
      return;
    }
    const compartmentId = findCompartment(project, cComp ?? '');
    const key = `${compartmentId}|${x}|${y}`;
    let cable = created.get(key) ?? findExisting(compartmentId, x, y);
    if (!cable) {
      cable = {
        id: uid('cable'),
        type: 'cable',
        compartmentId,
        pos: { x, y },
        seq: project.cables.length + 1,
        points: [],
        label: { pos: { x, y }, pinned: false },
        sectionLabel: { pos: { x, y: 0 }, pinned: false }
      };
      created.set(key, cable);
      project.cables.push(cable);
    }
    const layer = num(cLayer);
    const depth = num(cDepth);
    if (!Number.isNaN(depth)) {
      // 同层号去重:重复导入不叠加测点
      const layerNo = Number.isNaN(layer) ? cable.points.length + 1 : layer;
      if (!cable.points.some((pt) => pt.layer === layerNo)) {
        cable.points.push({ layer: layerNo, depth });
      }
    }
  });

  for (const c of project.cables) {
    c.points.sort((a, b) => a.layer - b.layer);
    // 层号不连续时归一为 1..n
    c.points.forEach((pt, i) => (pt.layer = i + 1));
  }
  renumber(project);
  return { cablesAdded: created.size, ventsAdded: 0, errors };
}

export function importVentTable(project: Project, text: string): ImportResult {
  const rows = splitLines(text);
  const errors: string[] = [];
  let added = 0;
  const EPS = 1e-6;

  rows.forEach((row, idx) => {
    // 列:0=风口编号(可空) 1=廒间 2=X 3=Y 4=形式 5=风道标高 6=朝向
    const [, cComp, cX, cY, cKind, cElev, cAngle] = row.cells;
    const x = num(cX);
    const y = num(cY);
    if (cX === undefined || cX.trim() === '' || Number.isNaN(x) || Number.isNaN(y)) {
      if (idx === 0) return;
      errors.push(`第 ${idx + 1} 行:X/Y 坐标无法识别,已跳过`);
      return;
    }
    const compartmentId = findCompartment(project, cComp ?? '');
    // 同廒间同坐标视为同一风口,重复导入只更新属性
    const existing = project.vents.find(
      (v) =>
        v.compartmentId === compartmentId &&
        Math.abs(v.pos.x - x) < EPS &&
        Math.abs(v.pos.y - y) < EPS
    );
    const kind = VENT_KIND_WORDS.find((k) => (cKind ?? '').includes(k)) ?? '地槽';
    const elevation = num(cElev);
    const angle = num(cAngle);
    if (existing) {
      existing.kind = kind;
      if (!Number.isNaN(elevation)) existing.ductElevation = elevation;
      if (!Number.isNaN(angle)) existing.angle = angle;
      return;
    }
    const vent: Vent = {
      id: uid('vent'),
      type: 'vent',
      compartmentId,
      pos: { x, y },
      seq: project.vents.length + 1,
      kind,
      ductElevation: Number.isNaN(elevation) ? -0.5 : elevation,
      angle: Number.isNaN(angle) ? 0 : angle,
      label: { pos: { x, y }, pinned: false },
      sectionLabel: { pos: { x, y: 0 }, pinned: false }
    };
    project.vents.push(vent);
    added += 1;
  });

  renumber(project);
  return { cablesAdded: 0, ventsAdded: added, errors };
}

export const CABLE_TABLE_TEMPLATE = [
  '电缆编号\t廒间\tX(m)\tY(m)\t层号\t深度(m)',
  '\t1号廒间\t3.0\t3.0\t1\t1.0',
  '\t1号廒间\t3.0\t3.0\t2\t2.5',
  '\t1号廒间\t3.0\t3.0\t3\t4.0'
].join('\n');

export const VENT_TABLE_TEMPLATE = [
  '风口编号\t廒间\tX(m)\tY(m)\t形式\t风道标高(m)\t朝向(度)',
  '\t1号廒间\t4.0\t0.3\t地槽\t-0.5\t0'
].join('\n');
