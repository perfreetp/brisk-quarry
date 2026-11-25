import type { Seat, SectionDef, VenuePlan, ZoneDef } from '../types';
import { SPONSOR_PRESET, ZONE_PRESETS } from './presets';

const ROW_COUNT = 60;
const ROW_GAP = 22;
const SEAT_GAP = 16;
const AISLE_GAP = 90; // 分区之间过道宽
const STAGE_Y = 60;
const ROW_BEND = 30; // 弧形排弯曲量

interface SectionGeom {
  id: string;
  name: string;
  /** 每排座位数随排号增长 */
  baseCount: number;
  countPerRow: number;
  /** 该分区中心 x 偏移 */
  centerX: number;
  bend: number;
}

function zoneOf(row: number, zones: ZoneDef[]): string {
  return zones.find((z) => row >= z.rowMin && row <= z.rowMax)?.id ?? 'mid';
}

/**
 * 生成弧形场馆座位点阵：中央区 + 左右翼，分区之间留过道。
 * 约 2.3 万个座位，60 排。
 */
export function generateVenue(): VenuePlan {
  const zones = ZONE_PRESETS;
  const sections: SectionDef[] = [
    { id: 'C', name: '中央看台', rows: Array.from({ length: ROW_COUNT }, (_, i) => i + 1) },
    { id: 'L', name: '左翼看台', rows: Array.from({ length: ROW_COUNT }, (_, i) => i + 1) },
    { id: 'R', name: '右翼看台', rows: Array.from({ length: ROW_COUNT }, (_, i) => i + 1) },
  ];

  // 分区中心 x：用各分区中间排的实际半宽 + 过道推算，保证每排都关于自己的中心对称
  const midRow = Math.round(ROW_COUNT / 2);
  const centerMidCount = 150 + midRow * 1.6;
  const wingMidCount = 70 + midRow * 0.8;
  const centerHalf = (centerMidCount * SEAT_GAP) / 2;
  const wingHalf = (wingMidCount * SEAT_GAP) / 2;

  const geoms: SectionGeom[] = [
    { id: 'C', name: '中央看台', baseCount: 150, countPerRow: 1.6, centerX: 0, bend: ROW_BEND },
    {
      id: 'L',
      name: '左翼看台',
      baseCount: 70,
      countPerRow: 0.8,
      centerX: -(centerHalf + AISLE_GAP + wingHalf),
      bend: ROW_BEND * 0.6,
    },
    {
      id: 'R',
      name: '右翼看台',
      baseCount: 70,
      countPerRow: 0.8,
      centerX: centerHalf + AISLE_GAP + wingHalf,
      bend: ROW_BEND * 0.6,
    },
  ];

  const seats: Seat[] = [];
  const rows: number[][] = Array.from({ length: ROW_COUNT }, () => []);
  let id = 0;

  for (const g of geoms) {
    for (let r = 1; r <= ROW_COUNT; r++) {
      const count = Math.round(g.baseCount + r * g.countPerRow);
      const width = count * SEAT_GAP;
      const baseY = STAGE_Y + 120 + r * ROW_GAP;
      for (let i = 0; i < count; i++) {
        const localX = -width / 2 + (i + 0.5) * SEAT_GAP;
        const x = g.centerX + localX;
        const y = baseY + g.bend * (localX / (width / 2)) ** 2;
        const row = r;
        const zoneId = zoneOf(row, zones);
        const sponsor =
          g.id === 'C' &&
          row >= SPONSOR_PRESET.rowMin &&
          row <= SPONSOR_PRESET.rowMax &&
          Math.abs(x) <= SPONSOR_PRESET.halfWidth;
        const seat: Seat = {
          id,
          code: `${g.id}-${String(r).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`,
          sectionId: g.id,
          row,
          seatInRow: i + 1,
          x,
          y,
          zoneId,
          sponsor,
        };
        rows[r - 1].push(id);
        seats.push(seat);
        id++;
      }
    }
  }

  const stage = {
    x: 0,
    y: 0,
    width: 1100,
    height: 84,
    label: '主舞台 STAGE',
  };

  return {
    name: '橙光体育馆 · 标准演唱会台',
    seats,
    sections,
    zones,
    stage,
    rowCount: ROW_COUNT,
    // 挂载按排索引（VenuePlan 接口外的引擎缓存）
    ...({ rows } as object),
  } as VenuePlan & { rows: number[][] };
}

export type VenueWithRows = VenuePlan & { rows: number[][] };

export const VENUE_CONST = { ROW_GAP, SEAT_GAP, AISLE_GAP };
