import type { TargetDef } from '../types';

export const STAGE_WIDTH = 1040;
export const STAGE_HEIGHT = 430;

const xs = [34, 158, 282, 430, 554, 678, 812, 922];

export const TARGETS: TargetDef[] = [
  { id: 'door-1', label: '1号门', kind: 'door', x: xs[0], y: 112, w: 88, h: 196 },
  { id: 'door-2', label: '2号门', kind: 'door', x: xs[1], y: 112, w: 88, h: 196 },
  { id: 'door-3', label: '3号门', kind: 'door', x: xs[2], y: 112, w: 88, h: 196 },
  { id: 'door-4', label: '4号门', kind: 'door', x: xs[3], y: 112, w: 88, h: 196 },
  { id: 'door-5', label: '5号门', kind: 'door', x: xs[4], y: 102, w: 96, h: 206 },
  { id: 'door-6', label: '6号门', kind: 'door', x: xs[5], y: 112, w: 88, h: 196 },
  { id: 'terminal-7', label: '终端', kind: 'terminal', x: xs[6], y: 142, w: 92, h: 132 },
  { id: 'hatch-8', label: '逃生舱', kind: 'hatch', x: xs[7], y: 122, w: 88, h: 176 },
];

export const targetById = new Map(TARGETS.map((target) => [target.id, target]));
