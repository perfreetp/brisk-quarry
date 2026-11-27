import type { BranchData, BudSite, SkeletonDataset, Vec3Tuple } from '../types';
import { mixPoint, mulberry32, normalize } from '../lib/math';

export function createSampleTree(): SkeletonDataset {
  const rand = mulberry32(20261127);
  const branches: BranchData[] = [];
  let serial = 0;

  const perpendicular = (d: Vec3Tuple): Vec3Tuple => {
    const axis = Math.abs(d[1]) < 0.9 ? ([0, 1, 0] as Vec3Tuple) : ([1, 0, 0] as Vec3Tuple);
    const c: Vec3Tuple = [
      d[1] * axis[2] - d[2] * axis[1],
      d[2] * axis[0] - d[0] * axis[2],
      d[0] * axis[1] - d[1] * axis[0],
    ];
    return normalize(c);
  };

  const makeBuds = (id: string, start: Vec3Tuple, end: Vec3Tuple, count: number): BudSite[] => {
    const buds: BudSite[] = [];
    for (let i = 0; i < count; i++) {
      const t = 0.12 + (i + rand() * 0.55) * (0.82 / count);
      buds.push({ id: `${id}-芽${i + 1}`, t: Math.min(0.94, t), position: mixPoint(start, end, t) });
    }
    return buds;
  };

  const add = (
    parentId: string | null,
    start: Vec3Tuple,
    dir: Vec3Tuple,
    lengthM: number,
    diameterM: number,
    angle: number,
    depth: number,
  ): BranchData => {
    const id = `B${String(serial++).padStart(4, '0')}`;
    const d = normalize(dir);
    const end: Vec3Tuple = [start[0] + d[0] * lengthM, start[1] + d[1] * lengthM, start[2] + d[2] * lengthM];
    const branch: BranchData = {
      id,
      parentId,
      start,
      end,
      diameter: diameterM,
      tipDiameter: diameterM * (0.34 + rand() * 0.12),
      length: lengthM,
      angle,
      buds: makeBuds(id, start, end, depth >= 4 ? 3 + Math.floor(rand() * 3) : 4 + Math.floor(rand() * 4)),
    };
    branches.push(branch);
    return branch;
  };

  const growChildren = (parent: BranchData, depth: number, count: number) => {
    const pdir = normalize([parent.end[0] - parent.start[0], parent.end[1] - parent.start[1], parent.end[2] - parent.start[2]]);
    const u = perpendicular(pdir);
    const v: Vec3Tuple = [
      pdir[1] * u[2] - pdir[2] * u[1],
      pdir[2] * u[0] - pdir[0] * u[2],
      pdir[0] * u[1] - pdir[1] * u[0],
    ];

    for (let i = 0; i < count; i++) {
      const t = 0.32 + (i / Math.max(1, count - 1)) * 0.6 + (rand() - 0.5) * 0.05;
      const start = mixPoint(parent.start, parent.end, Math.min(0.94, Math.max(0.2, t)));
      const azimuth = (i / count) * Math.PI * 2 + rand() * 0.9 + depth * 1.7;
      const attachDeg = depth === 0 ? 48 + rand() * 24 : 28 + rand() * 34;
      const a = (attachDeg * Math.PI) / 180;
      const radial: Vec3Tuple = [
        u[0] * Math.cos(azimuth) + v[0] * Math.sin(azimuth),
        u[1] * Math.cos(azimuth) + v[1] * Math.sin(azimuth),
        u[2] * Math.cos(azimuth) + v[2] * Math.sin(azimuth),
      ];
      let dir: Vec3Tuple = [
        pdir[0] * Math.cos(a) + radial[0] * Math.sin(a),
        pdir[1] * Math.cos(a) + radial[1] * Math.sin(a),
        pdir[2] * Math.cos(a) + radial[2] * Math.sin(a),
      ];
      // Fruit scaffolds sweep outward but terminal growth still turns upward.
      dir = normalize([dir[0] * 1.08, dir[1] + 0.16 + rand() * 0.12, dir[2] * 1.08]);
      const lengthM = parent.length * (0.58 + rand() * 0.18);
      const diameterM = parent.diameter * (0.52 + rand() * 0.14);
      const child = add(parent.id, start, dir, lengthM, diameterM, attachDeg, depth + 1);

      const nextCount = depth === 0 ? 5 + Math.floor(rand() * 2) : depth === 1 ? 3 + Math.floor(rand() * 2) : depth === 2 ? 2 + Math.floor(rand() * 2) : depth === 3 ? 2 : 0;
      if (nextCount > 0) growChildren(child, depth + 1, nextCount);
    }
  };

  const trunk = add(null, [0, 0, 0], [0.03, 1, 0.02], 3.15, 0.18, 0, 0);
  // Central leader extension.
  const leader = add(trunk.id, mixPoint(trunk.start, trunk.end, 0.72), [0.08, 1, -0.04], 1.35, 0.095, 8, 1);
  growChildren(trunk, 0, 18);
  growChildren(leader, 1, 7);

  return {
    name: '示例果园·乔化苹果树骨架',
    branches,
    unit: 'm',
    upAxis: 'y',
    warnings: [],
    importedAt: new Date('2026-11-27T08:00:00.000Z').toISOString(),
  };
}
