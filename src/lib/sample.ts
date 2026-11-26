import type { Cable, Project, Vent } from '../types';
import { renumber } from './numbering';
import { uid } from './util';

/**
 * 示例工程:保管员拿到的典型场景——
 * 一栋 30m × 18m 平房仓,两个廒间,每廒间 12 根测温电缆(3×4),
 * 每根电缆 8 个分层测点(粮面下 1m 起,每 1.5m 一层),
 * 6 个地槽风口,风道标高 -0.5m。
 */
export function createSampleProject(): Project {
  const project: Project = {
    version: 1,
    name: '一号平房仓测温与通风布点',
    warehouse: { width: 30, depth: 18, grainHeight: 12 },
    compartments: [
      { id: 'comp_a', name: '1号廒间', rect: { x: 0, y: 0, w: 14.4, h: 18 } },
      { id: 'comp_b', name: '2号廒间', rect: { x: 15.6, y: 0, w: 14.4, h: 18 } }
    ],
    cables: [],
    vents: [],
    rules: {
      cablePrefix: 'C',
      cableStartFrom: 1,
      cablePadding: 1,
      layerStartFrom: 1,
      layerPadding: 1,
      ventPrefix: 'F',
      ventStartFrom: 1,
      ventPadding: 1
    }
  };

  const makePoints = () =>
    Array.from({ length: 8 }, (_, i) => ({ layer: i + 1, depth: 1 + i * 1.5 }));

  for (const comp of project.compartments) {
    const cols = 4;
    const rows = 3;
    const marginX = 2.4;
    const marginY = 3;
    const gapX = (comp.rect.w - marginX * 2) / (cols - 1);
    const gapY = (comp.rect.h - marginY * 2) / (rows - 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = comp.rect.x + marginX + c * gapX;
        const y = comp.rect.y + marginY + r * gapY;
        const cable: Cable = {
          id: uid('cable'),
          type: 'cable',
          compartmentId: comp.id,
          pos: { x, y },
          seq: 0,
          points: makePoints(),
          label: { pos: { x, y }, pinned: false },
          sectionLabel: { pos: { x, y: 0 }, pinned: false }
        };
        project.cables.push(cable);
      }
    }
  }

  const ventDefs: Array<[number, number, number]> = [
    [4, 0.3, 0],
    [10.4, 0.3, 0],
    [19.6, 0.3, 0],
    [26, 0.3, 0],
    [7.2, 17.7, 180],
    [22.8, 17.7, 180]
  ];
  for (const [x, y, angle] of ventDefs) {
    const vent: Vent = {
      id: uid('vent'),
      type: 'vent',
      compartmentId: x < 15 ? 'comp_a' : 'comp_b',
      pos: { x, y },
      seq: 0,
      kind: '地槽',
      ductElevation: -0.5,
      angle,
      label: { pos: { x, y }, pinned: false },
      sectionLabel: { pos: { x, y: 0 }, pinned: false }
    };
    project.vents.push(vent);
  }

  renumber(project);
  return project;
}

/** 空工程(手工录入用) */
export function createEmptyProject(): Project {
  const project: Project = {
    version: 1,
    name: '未命名布点工程',
    warehouse: { width: 24, depth: 12, grainHeight: 8 },
    compartments: [
      { id: 'comp_a', name: '1号廒间', rect: { x: 0, y: 0, w: 24, h: 12 } }
    ],
    cables: [],
    vents: [],
    rules: {
      cablePrefix: 'C',
      cableStartFrom: 1,
      cablePadding: 1,
      layerStartFrom: 1,
      layerPadding: 1,
      ventPrefix: 'F',
      ventStartFrom: 1,
      ventPadding: 1
    }
  };
  renumber(project);
  return project;
}
