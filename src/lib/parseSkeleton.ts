import type { BranchData, BudSite, SkeletonDataset, Vec3Tuple } from '../types';
import { branchLength, normalize, sub } from './math';

type Raw = unknown;
type RawObj = Record<string, Raw>;

const ID_KEYS = ['id', 'branchId', 'branch_id', '枝id', '枝ID', '编号', '枝条id'];
const PARENT_KEYS = ['parentId', 'parent_id', 'parent', 'pid', '父枝id', '父枝ID', '母枝id'];
const DIAMETER_KEYS = ['diameter', 'diameterM', 'diameter_m', 'baseDiameter', 'branchDiameter', '枝径', '直径'];
const LENGTH_KEYS = ['length', 'lengthM', 'branchLength', 'len', '长度', '枝长'];
const ANGLE_KEYS = ['angle', 'insertionAngle', 'branchAngle', 'crotchAngle', '着生角度', '角度'];
const BUDS_KEYS = ['buds', 'budSites', 'bud_positions', '芽位', '芽点'];

function isObject(v: Raw): v is RawObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pick(obj: RawObj, keys: string[]): Raw | undefined {
  for (const key of keys) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const real = lower.get(key.toLowerCase());
    if (real && obj[real] !== undefined && obj[real] !== null) return obj[real];
  }
  return undefined;
}

function asNumber(v: Raw | undefined): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.\-eE]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(v: Raw | undefined): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function readPoint(obj: RawObj, names: string[], prefixes: string[]): Vec3Tuple | null {
  for (const name of names) {
    const value = pick(obj, [name, ...names.map((n) => `${n}Point`), `${name}_point`, `${name}_point`]);
    if (Array.isArray(value) && value.length >= 3) {
      const x = asNumber(value[0]);
      const y = asNumber(value[1]);
      const z = asNumber(value[2]);
      if (x !== null && y !== null && z !== null) return [x, y, z];
    }
    if (isObject(value)) {
      const x = asNumber(pick(value, ['x', 'X', '0']));
      const y = asNumber(pick(value, ['y', 'Y', '1']));
      const z = asNumber(pick(value, ['z', 'Z', '2']));
      if (x !== null && y !== null && z !== null) return [x, y, z];
    }
  }

  for (const prefix of prefixes) {
    const x = asNumber(pick(obj, [`${prefix}X`, `${prefix}_x`, `${prefix}x`, `x_${prefix}`]));
    const y = asNumber(pick(obj, [`${prefix}Y`, `${prefix}_y`, `${prefix}y`, `y_${prefix}`]));
    const z = asNumber(pick(obj, [`${prefix}Z`, `${prefix}_z`, `${prefix}z`, `z_${prefix}`]));
    if (x !== null && y !== null && z !== null) return [x, y, z];
  }

  // Common flat schemas: startX/startY/startZ and x1/y1/z1.
  const x = asNumber(pick(obj, ['x', 'x1', 'X1']));
  const y = asNumber(pick(obj, ['y', 'y1', 'Y1']));
  const z = asNumber(pick(obj, ['z', 'z1', 'Z1']));
  if (names.includes('start') && x !== null && y !== null && z !== null) return [x, y, z];

  const x2 = asNumber(pick(obj, ['x2', 'X2', 'endX']));
  const y2 = asNumber(pick(obj, ['y2', 'Y2', 'endY']));
  const z2 = asNumber(pick(obj, ['z2', 'Z2', 'endZ']));
  if (names.includes('end') && x2 !== null && y2 !== null && z2 !== null) return [x2, y2, z2];

  return null;
}

function unitScale(unit: string | undefined, fallback: 'm' | 'cm' | 'mm'): number {
  const u = (unit ?? fallback).toLowerCase();
  if (u === 'm' || u === 'meter' || u === 'meters' || u === '米') return 1;
  if (u === 'cm' || u === 'centimeter' || u === 'centimeters' || u === '厘米') return 0.01;
  if (u === 'mm' || u === 'millimeter' || u === 'millimeters' || u === '毫米') return 0.001;
  return fallback === 'cm' ? 0.01 : fallback === 'mm' ? 0.001 : 1;
}

function normalizeUp(p: Vec3Tuple, upAxis: 'x' | 'y' | 'z'): Vec3Tuple {
  if (upAxis === 'z') return [p[0], p[2], -p[1]]; // z-up -> PlayCanvas y-up
  if (upAxis === 'x') return [p[1], p[0], p[2]];
  return p;
}

function readBuds(rawBuds: Raw | undefined, b: BranchData, coordScale: number): BudSite[] {
  if (!Array.isArray(rawBuds)) return [];
  const out: BudSite[] = [];
  const len = branchLength(b);
  rawBuds.forEach((raw, i) => {
    let t: number | null = null;
    let position: Vec3Tuple | null = null;
    let id = `${b.id}-bud-${i + 1}`;

    if (isObject(raw)) {
      id = asString(pick(raw, ['id', 'budId', 'bud_id'])) ?? id;
      t = asNumber(pick(raw, ['t', 'ratio', 'normalizedPosition', 'positionT', 'along'])) ;
      const distanceM = asNumber(pick(raw, ['distance', 'distanceFromBase', 's', 'alongLength']));
      if (t === null && distanceM !== null && len > 0) t = (distanceM * coordScale) / len;
      const pos = readPoint(raw, ['position', 'point', 'xyz', '坐标'], []);
      if (pos) position = normalizeUp(pos.map((v) => v * coordScale) as Vec3Tuple, 'y');
    } else if (typeof raw === 'number') {
      t = raw;
    }

    if (t !== null) {
      // Bare numbers >1 are interpreted as metres along the branch.
      if (t > 1.5 && len > 0) t = t / len;
      t = Math.min(0.99, Math.max(0.01, t));
      if (!position) {
        position = [
          b.start[0] + (b.end[0] - b.start[0]) * t,
          b.start[1] + (b.end[1] - b.start[1]) * t,
          b.start[2] + (b.end[2] - b.start[2]) * t,
        ];
      }
      out.push({ id, t, position });
    } else if (position) {
      const axis = sub(b.end, b.start);
      const axisLen2 = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2 || 1;
      const t0 =
        ((position[0] - b.start[0]) * axis[0] +
          (position[1] - b.start[1]) * axis[1] +
          (position[2] - b.start[2]) * axis[2]) /
        axisLen2;
      t = Math.min(0.99, Math.max(0.01, t0));
      out.push({ id, t, position });
    }
  });
  return out.sort((a, b) => a.t - b.t);
}

export interface ParseOptions {
  fallbackUnit?: 'm' | 'cm' | 'mm';
  fileName?: string;
}

export function parseSkeletonJson(json: Raw, options: ParseOptions = {}): SkeletonDataset {
  const warnings: string[] = [];
  let collection: Raw[] | undefined;
  let meta: RawObj = {};

  if (Array.isArray(json)) {
    collection = json;
  } else if (isObject(json)) {
    meta = isObject(json.meta) ? json.meta : isObject(json.metadata) ? json.metadata : {};
    const candidate =
      json.branches ?? json.items ?? json.data ?? json.skeleton ?? json.nodes ?? json.branchList ?? json.枝条 ?? json.枝条列表;
    if (Array.isArray(candidate)) collection = candidate;
    else if (isObject(candidate) && Array.isArray(candidate.branches)) collection = candidate.branches;
    else if (isObject(json.skeleton) && Array.isArray(json.skeleton.branches)) collection = json.skeleton.branches;
  }

  if (!collection) {
    throw new Error('未找到枝条数组：请使用 branches / items / data 字段，或直接导入枝条对象数组。');
  }

  const rawUnit = asString(pick(meta, ['unit', 'units', 'lengthUnit', '单位'])) ?? (isObject(json) ? asString(pick(json, ['unit', 'units', '单位'])) : null);
  const unit = (rawUnit?.toLowerCase().includes('mm')
    ? 'mm'
    : rawUnit?.toLowerCase().includes('cm')
      ? 'cm'
      : 'm') as 'm' | 'cm' | 'mm';
  const coordScale = unitScale(rawUnit ?? undefined, options.fallbackUnit ?? 'm');
  const upRaw = (asString(pick(meta, ['upAxis', 'up', 'coordinateUp'])) ?? asString(isObject(json) ? pick(json, ['upAxis', 'up']) : undefined) ?? 'y').toLowerCase();
  const upAxis: 'x' | 'y' | 'z' = upRaw.includes('z') ? 'z' : upRaw.includes('x') ? 'x' : 'y';

  const seen = new Set<string>();
  const branches: BranchData[] = [];

  collection.forEach((raw, index) => {
    if (!isObject(raw)) {
      warnings.push(`第 ${index + 1} 项不是对象，已跳过。`);
      return;
    }
    const id = asString(pick(raw, ID_KEYS)) ?? `branch-${index + 1}`;
    if (seen.has(id)) {
      warnings.push(`枝 ID “${id}”重复，已自动追加序号。`);
    }
    const uniqueId = seen.has(id) ? `${id}__${index + 1}` : id;
    seen.add(uniqueId);

    const parentRaw = asString(pick(raw, PARENT_KEYS));
    const parentId = parentRaw && parentRaw !== '0' && parentRaw.toLowerCase() !== 'null' && parentRaw !== '-' ? parentRaw : null;

    let start = readPoint(raw, ['start', 'startPoint', 'from', 'base', '起点'], ['start', 'p1', 'from']);
    let end = readPoint(raw, ['end', 'endPoint', 'to', 'tip', '终点'], ['end', 'p2', 'to']);
    if (!start || !end) {
      warnings.push(`枝 ${uniqueId} 缺少完整起止点，已跳过。`);
      return;
    }
    start = normalizeUp(start.map((v) => v * coordScale) as Vec3Tuple, upAxis);
    end = normalizeUp(end.map((v) => v * coordScale) as Vec3Tuple, upAxis);

    const endpointLength = Math.max(1e-6, branchLength({ start, end } as BranchData));
    let lengthValue = asNumber(pick(raw, LENGTH_KEYS));
    if (lengthValue !== null) {
      const lengthKey = [...Object.keys(raw)].find((k) => /length|长度|枝长/i.test(k));
      const lengthScale = lengthKey && /mm/i.test(lengthKey) ? 0.001 : lengthKey && /cm/i.test(lengthKey) ? 0.01 : coordScale;
      lengthValue *= lengthScale;
    }
    const length = lengthValue && lengthValue > 0 ? lengthValue : endpointLength;

    let diameter = asNumber(pick(raw, DIAMETER_KEYS));
    if (diameter === null || diameter <= 0) diameter = Math.min(0.08, Math.max(0.004, length * 0.035));
    const diameterKey = [...Object.keys(raw)].find((k) => /diameter|枝径|直径/i.test(k));
    const diameterScale = diameterKey && /mm/i.test(diameterKey) ? 0.001 : diameterKey && /cm/i.test(diameterKey) ? 0.01 : coordScale;
    diameter *= diameterScale;

    let tipDiameter = asNumber(pick(raw, ['tipDiameter', 'topDiameter', '梢径', '梢头直径']));
    if (tipDiameter !== null && tipDiameter > 0) {
      const tipKey = [...Object.keys(raw)].find((k) => /tipdiameter|topdiameter|梢径/i.test(k));
      tipDiameter *= tipKey && /mm/i.test(tipKey) ? 0.001 : tipKey && /cm/i.test(tipKey) ? 0.01 : coordScale;
    } else {
      tipDiameter = diameter * 0.38;
    }
    tipDiameter = Math.min(tipDiameter, diameter * 0.96);

    let angle = asNumber(pick(raw, ANGLE_KEYS));
    if (angle !== null && Math.abs(angle) <= Math.PI * 2 + 0.01 && /radian/i.test(JSON.stringify(Object.keys(raw)))) {
      angle *= 180 / Math.PI;
    }

    const minCutRaw = asNumber(pick(raw, ['minCutDiameter', 'cuttableDiameter', 'minimumCutDiameter']));
    const b: BranchData = {
      id: uniqueId,
      parentId,
      start,
      end,
      diameter,
      tipDiameter,
      length,
      angle,
      buds: [],
      minCutDiameter: minCutRaw ? minCutRaw * coordScale : undefined,
      meta: raw,
    };
    b.buds = readBuds(pick(raw, BUDS_KEYS), b, coordScale);

    if (angle === null) {
      // Relative angle is filled later once parent directions are available.
      b.angle = null;
    }
    branches.push(b);
  });

  if (!branches.length) throw new Error('JSON 中没有可显示的有效枝条。');

  const ids = new Set(branches.map((b) => b.id));
  for (const b of branches) {
    if (b.parentId && !ids.has(b.parentId)) {
      warnings.push(`枝 ${b.id} 的父枝 ${b.parentId} 不存在，已按根枝显示。`);
      b.parentId = null;
    }
  }

  // Compute missing attachment angles from parent/child directions.
  const byId = new Map(branches.map((b) => [b.id, b]));
  for (const b of branches) {
    if (b.angle === null && b.parentId) {
      const p = byId.get(b.parentId);
      if (p) {
        const d1 = normalize(sub(p.end, p.start));
        const d2 = normalize(sub(b.end, b.start));
        b.angle = Math.acos(Math.min(1, Math.max(-1, d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]))) * 180 / Math.PI;
      }
    }
    if (b.angle === null) b.angle = 0;
  }

  return {
    name: options.fileName?.replace(/\.json$/i, '') || '导入的枝条骨架',
    branches,
    unit,
    upAxis,
    warnings: warnings.slice(0, 30),
    importedAt: new Date().toISOString(),
  };
}
