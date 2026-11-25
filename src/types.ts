// 全局共享类型定义

export interface SectionDef {
  id: string;
  name: string;
  /** 该分区拥有的全局排号 */
  rows: number[];
}

export interface ZoneDef {
  id: string;
  name: string;
  rowMin: number;
  rowMax: number;
  /** 色温 K，仅用于灯光指导标注 */
  colorTemp: number;
  /** 俯视图区域遮罩颜色 */
  tint: number;
}

export interface Seat {
  id: number;
  /** 座位号，如 C-12-038 */
  code: string;
  sectionId: string;
  /** 全局排号 1..N */
  row: number;
  /** 排内序号 */
  seatInRow: number;
  x: number;
  y: number;
  zoneId: string;
  /** 赞助方露出区块 */
  sponsor: boolean;
}

export interface StageDef {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface VenuePlan {
  name: string;
  seats: Seat[];
  sections: SectionDef[];
  zones: ZoneDef[];
  stage: StageDef;
  rowCount: number;
}

/** 观众形象库条目 */
export interface AudienceType {
  id: string;
  name: string;
  desc: string;
  /** 服装配色池（取色随机） */
  bodyColors: number[];
  /** 荧光棒颜色池 */
  stickColors: number[];
  /** 基础站立倾向 0..1 */
  standChance: number;
  /** UI 卡片主色 */
  uiColor: string;
}

export interface SponsorConfig {
  name: string;
  /** 应援色 */
  color: number;
  /** 露出区块：起止排 */
  rowMin: number;
  rowMax: number;
  /** 中心半宽（世界坐标） */
  halfWidth: number;
}

/** 曲目段落 */
export interface SongSegment {
  name: string;
  start: number; // 0..100
  end: number;
  /** 各区域站立比例 前/中/后 */
  stand: [number, number, number];
}

export interface PersonInfo {
  seatId: number;
  code: string;
  sectionName: string;
  row: number;
  seatInRow: number;
  typeName: string;
  bodyColor: number;
  stickColor: number;
  standing: boolean;
  masked: boolean;
  sponsor: boolean;
  x: number;
  y: number;
}

export interface Stats {
  total: number;
  filled: number;
  selected: number;
  standing: number;
  masked: number;
  fps: number;
  drawnSprites: number;
}

export type FillTarget = 'all' | `zone:${string}` | `section:${string}` | 'sponsor';
