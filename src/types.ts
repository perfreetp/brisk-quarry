// 核心领域模型:仓房、廒间、测温电缆、通风口、编号规则、工程文件
// 所有坐标单位均为米;角度为度。持久化即整个 Project 的 JSON 序列化。

export interface Vec {
  x: number;
  y: number;
}

/** 分层测点(编号表中一行) */
export interface LayerPoint {
  /** 该层后缀序号,从 1 开始,对应规则中的 startFrom */
  layer: number;
  /** 埋设深度,从粮面起算向下,米 */
  depth: number;
}

/**
 * 标注状态。pos 为标注框中心在世界坐标(米)中的位置;
 * pinned=true 表示保管员手动拖过,自动避让不得改动。
 */
export interface LabelState {
  pos: Vec;
  pinned: boolean;
}

export type EntityType = 'cable' | 'vent';

export interface BaseEntity {
  id: string;
  type: EntityType;
  /** 所属廒间 id */
  compartmentId: string;
  /** 平面位置,米(仓房平面原点在左下角) */
  pos: Vec;
  /** 平面标注(引线末端文字框) */
  label: LabelState;
  /** 剖面标注,米;x 为剖面横向位置,y 为高程(向上为正) */
  sectionLabel: LabelState;
}

export interface Cable extends BaseEntity {
  type: 'cable';
  /** 廒间内顺序号,从 1 开始(重排时重新计算) */
  seq: number;
  /** 分层测点,按 layer 升序 */
  points: LayerPoint[];
}

export type VentKind = '地槽' | '地上笼' | '侧壁' | '立筒';

export interface Vent extends BaseEntity {
  type: 'vent';
  /** 全仓风口顺序号,从 1 开始(重排时重新计算) */
  seq: number;
  kind: VentKind;
  /** 风道标高:相对仓内地坪的高度,米(负值表示地槽) */
  ductElevation: number;
  /** 风口朝向(度),仅影响平面符号开口方向 */
  angle: number;
}

export interface Compartment {
  id: string;
  name: string;
  /** 廒间矩形(米) */
  rect: { x: number; y: number; w: number; h: number };
}

export interface NumberingRules {
  cablePrefix: string;
  cableStartFrom: number;
  cablePadding: number;
  /** 分层后缀起始号(例:从 1 起 -> -1 ... -8) */
  layerStartFrom: number;
  layerPadding: number;
  ventPrefix: string;
  ventStartFrom: number;
  ventPadding: number;
}

export interface Project {
  version: 1;
  name: string;
  warehouse: {
    /** 仓房平面净尺寸,米 */
    width: number;
    depth: number;
    /** 粮堆高度,米(剖面用) */
    grainHeight: number;
  };
  compartments: Compartment[];
  cables: Cable[];
  vents: Vent[];
  rules: NumberingRules;
}

/** 平面标注显示内容 */
export type LabelTextMode = 'code' | 'codeWithPoints';
