import type { LayerId, LayerMeta } from '@/types/doc'

/** z 序自下而上 */
export const LAYER_ORDER: LayerId[] = [
  'base',
  'calibration',
  'zones',
  'collision',
  'silkscreen',
  'lamps',
  'annotation',
  'wear',
]

export const DEFAULT_LAYERS: LayerMeta[] = [
  { id: 'base', name: '底图（手绘草图）', visible: true, locked: false, operatorVisible: true },
  { id: 'calibration', name: '标定', visible: true, locked: false, operatorVisible: false },
  { id: 'zones', name: '分区（挡板/弹簧/靶组/轨道）', visible: true, locked: false, operatorVisible: false },
  { id: 'collision', name: '碰撞体', visible: true, locked: false, operatorVisible: false },
  { id: 'silkscreen', name: '丝印（品牌图案 / shot 线）', visible: true, locked: false, operatorVisible: true },
  { id: 'lamps', name: '灯位', visible: true, locked: false, operatorVisible: true },
  { id: 'annotation', name: '批注', visible: true, locked: false, operatorVisible: true },
  { id: 'wear', name: '磨损记录（卡球）', visible: true, locked: false, operatorVisible: true },
]

/** fabric 对象自定义属性白名单（不过 toJSON/loadFromJSON 会丢字段） */
export const CUSTOM_PROPERTIES = [
  'id',
  'layerId',
  'docType',
  'lampId',
  'collisionId',
  'annotationId',
  'wearId',
  'boundCollisionId',
  'deviationMm',
  'alignState',
  'lampSpecId',
  'lampCode',
  'zoneKind',
  'arrowHead',
] as const

export type DocObjectType =
  | 'base-image'
  | 'zone'
  | 'collider'
  | 'stroke'
  | 'arrow'
  | 'lamp'
  | 'annotation-marker'
  | 'wear'

export const STORAGE_KEYS = {
  envelope: 'pst.document.envelope',
  lampSpecs: 'pst.lampSpecs',
  imageDb: 'pst-image-store',
  imageStore: 'images',
} as const

export const DEFAULT_LAMP_SPECS = [
  { name: '小灯珠 3mm', diameterMm: 3, color: '#f59e0b' },
  { name: '标准灯珠 5mm', diameterMm: 5, color: '#ef4444' },
  { name: '大灯珠 8mm', diameterMm: 8, color: '#3b82f6' },
  { name: '排灯 10mm', diameterMm: 10, color: '#10b981' },
]
