/**
 * 文档领域类型（全部可序列化，构成 Envelope 工程文件）
 */

/** 逻辑图层 id（z 序自下而上，顺序见 LAYER_ORDER） */
export type LayerId =
  | 'base'
  | 'calibration'
  | 'zones'
  | 'collision'
  | 'silkscreen'
  | 'lamps'
  | 'annotation'
  | 'wear'

export type Role = 'designer' | 'operator'

export type AlignState = 'aligned' | 'misaligned' | 'unbound'

/** 像素↔毫米标定：台面物理宽高(mm) + 图上两个轴对齐角点(场景 px) */
export interface Calibration {
  tableWidthMm: number
  tableHeightMm: number
  /** 角点 1，台面 (0,0) 对应像素 */
  p1: { x: number; y: number } | null
  /** 角点 2，台面 (W,H) 对应像素 */
  p2: { x: number; y: number } | null
  done: boolean
}

export interface LayerMeta {
  id: LayerId
  name: string
  visible: boolean
  /** 文档级锁定（碰撞体层锁定后任何角色都需显式解锁） */
  locked: boolean
  /** 运营方是否可见（分区/碰撞体默认对运营方隐藏） */
  operatorVisible: boolean
}

/** 灯位库预设（独立存 localStorage，可 CRUD） */
export interface LampSpec {
  id: string
  name: string
  diameterMm: number
  color: string
}

/** 灯珠业务数据 —— 事实源，fabric Ellipse 只是可重建视图 */
export interface LampDoc {
  id: string
  /** 稳定灯号，单调递增，不随删除重排 */
  code: number
  specId: string
  /** 直径快照(mm)，预设改名/删除不影响已放灯珠 */
  diameterMm: number
  color: string
  /** 灯心在台面 mm 坐标系中的位置 */
  centerMm: { x: number; y: number }
  boundCollisionId: string | null
  deviationMm: number | null
  alignState: AlignState
}

export interface Annotation {
  id: string
  /** 锚定的灯珠 id；不存绝对坐标，灯珠移动后 marker 跟随 */
  lampId: string
  text: string
  author: string
  role: Role
  createdAt: number
  resolved: boolean
  /** 灯珠被删时的兜底锚点(mm) */
  anchorMm: { x: number; y: number } | null
}

/** 磨损记录（卡球圈），mm 空间存储，标定变更后整体重建 */
export interface WearDoc {
  id: string
  centerMm: { x: number; y: number }
  radiusMm: number
  note: string
  author: string
  createdAt: number
}

export type ZoneKind = 'flipper' | 'spring' | 'target' | 'orbit'

export interface DocSettings {
  /** 吸附/标红阈值(mm) */
  snapThresholdMm: number
}

/** 工程文件信封 */
export interface Envelope {
  version: 1
  calibration: Calibration
  layers: LayerMeta[]
  lamps: LampDoc[]
  annotations: Annotation[]
  wears: WearDoc[]
  settings: DocSettings
  /** 底图：IndexedDB 中的 imageId；导出工程文件时替换为内嵌 dataURL */
  baseImageId: string | null
  baseImageDataUrl?: string
  /** 下一个灯号 */
  nextLampCode: number
  /** fabric canvas.toJSON() 输出 */
  fabric: Record<string, unknown>
}

export interface Point {
  x: number
  y: number
}
