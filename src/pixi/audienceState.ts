import type { AudienceType, FillTarget, Seat, VenuePlan } from '../types';
import { pickFromPalette } from '../utils/color';

export const enum Flags {
  Filled = 1 << 0,
  Standing = 1 << 1,
  Masked = 1 << 2,
  Selected = 1 << 3,
  Sponsor = 1 << 4,
}

/** 所有观众的逐人数据，全部走 typed array，避免 GC 压力 */
export class AudienceState {
  flags: Uint8Array;
  typeId: Uint8Array; // 对应 AUDIENCE_TYPES 下标，255 = 未分配
  bodyColor: Uint32Array;
  stickColor: Uint32Array;
  /** 当前姿态进度 0=坐 1=站，逐帧缓动 */
  pose: Float32Array;
  /** 目标姿态 */
  targetPose: Float32Array;

  constructor(public readonly n: number) {
    this.flags = new Uint8Array(n);
    this.typeId = new Uint8Array(n).fill(255);
    this.bodyColor = new Uint32Array(n);
    this.stickColor = new Uint32Array(n);
    this.pose = new Float32Array(n);
    this.targetPose = new Float32Array(n);
  }

  filled(i: number) { return (this.flags[i] & Flags.Filled) !== 0; }
  standing(i: number) { return (this.flags[i] & Flags.Standing) !== 0; }
  masked(i: number) { return (this.flags[i] & Flags.Masked) !== 0; }
  selected(i: number) { return (this.flags[i] & Flags.Selected) !== 0; }
  sponsor(i: number) { return (this.flags[i] & Flags.Sponsor) !== 0; }
}

/** 伪随机（确定性，同一份场馆填充结果稳定） */
function hashRand(seed: number): number {
  let h = seed * 374761393 + 668265263;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 默认观众构成比例（未指定形象时的批量分配） */
const TYPE_MIX: [typeIdx: number, weight: number][] = [
  [1, 0.55], // 普通观众
  [0, 0.22], // 应援团
  [3, 0.13], // 亲子
  [2, 0.07], // VIP
  [4, 0.03], // 媒体
];

function pickType(seat: Seat): number {
  const r = hashRand(seat.id * 7 + 11);
  let acc = 0;
  for (const [idx, w] of TYPE_MIX) {
    acc += w;
    if (r <= acc) return idx;
  }
  return 1;
}

export interface FillResult {
  changed: number;
  standingCount: number;
}

/** 把观众形象批量填充到座位；typeIdx < 0 表示用默认混合构成 */
export function fillSeats(
  state: AudienceState,
  venue: VenuePlan,
  types: AudienceType[],
  target: FillTarget,
  typeIdx: number,
): FillResult {
  let changed = 0;
  let standingCount = 0;

  const match = (s: Seat): boolean => {
    if (target === 'all') return true;
    if (target === 'sponsor') return s.sponsor;
    if (target.startsWith('zone:')) return s.zoneId === target.slice(5);
    if (target.startsWith('section:')) return s.sectionId === target.slice(8);
    return false;
  };

  for (const seat of venue.seats) {
    const i = seat.id;
    if (state.masked(i)) continue;
    if (!match(seat)) continue;

    const tIdx = typeIdx < 0 ? pickType(seat) : typeIdx;
    const t = types[tIdx];
    state.typeId[i] = tIdx;
    state.bodyColor[i] = pickFromPalette(t.bodyColors, seat.id + 1);
    state.stickColor[i] = pickFromPalette(t.stickColors, seat.id * 3 + 7);

    const stand = hashRand(seat.id * 13 + 5) < t.standChance;
    state.flags[i] |= Flags.Filled;
    if (seat.sponsor) state.flags[i] |= Flags.Sponsor;
    else state.flags[i] &= ~Flags.Sponsor;
    if (stand) {
      state.flags[i] |= Flags.Standing;
      state.targetPose[i] = 1;
      state.pose[i] = 1;
      standingCount++;
    } else {
      state.flags[i] &= ~Flags.Standing;
      state.targetPose[i] = 0;
      state.pose[i] = 0;
    }
    changed++;
  }
  return { changed, standingCount };
}
