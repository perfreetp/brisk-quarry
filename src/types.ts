export type ID = string;

export interface Vec2 {
  x: number;
  y: number;
}

export interface CurveRange {
  /** 绝对里程，m */
  startChainage: number;
  endChainage: number;
  radius: number;
  direction: 'left' | 'right';
}

export interface AlignmentModel {
  /** 起点绝对里程，m，例如 K4+000 为 4000 */
  startChainage: number;
  /** 线路中线测量点，工程坐标 m */
  points: Vec2[];
  curveRanges: CurveRange[];
}

export type BandKind = 'grass' | 'forest';
export type Side = -1 | 1;

export interface BandModel {
  id: ID;
  kind: BandKind;
  name: string;
  /** -1 / 1 为红线两侧，方向按里程前进方向确定 */
  side: Side;
  /** 距红线的起始偏距，m */
  offsetStart: number;
  /** 带宽，m */
  width: number;
}

export interface OpeningModel {
  id: ID;
  bandId: ID;
  chainage: number;
  /** 相对该带中线的偏距，m；0 为带中央 */
  lateralOffset: number;
  radiusAlong: number;
  radiusAcross: number;
  label: string;
}

export interface GrassSettings {
  cellAlong: number;
  cellAcross: number;
  ridgeWidth: number;
  /** 每延米格埂耗草量，kg/m */
  kgPerGridMeter: number;
}

export interface SpeciesSpec {
  id: ID;
  name: string;
  share: number;
  color: string;
  specification: string;
}

export interface ForestSettings {
  rowSpacing: number;
  plantSpacing: number;
  edgeMargin: number;
  lossRatePct: number;
  species: SpeciesSpec[];
}

export interface LayerState {
  id: ID;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export type LegendSymbol =
  | 'alignment'
  | 'redline'
  | 'station'
  | 'grass'
  | 'grid'
  | 'forest'
  | 'seedling'
  | 'hole'
  | 'repair'
  | 'note';

export interface LegendEntry {
  id: ID;
  symbol: LegendSymbol;
  label: string;
  /** 绑定动态规格文字 */
  bind?: 'grassSpec' | 'forestSpec' | 'scale' | 'none';
}

export interface FurnitureBase {
  id: ID;
  pageId: ID;
  /** A3 横向纸面坐标，mm，左上角原点 */
  xMm: number;
  yMm: number;
  locked?: boolean;
}

export interface LegendBlock extends FurnitureBase {
  type: 'legend';
  title: string;
  entryIds: ID[];
  widthMm: number;
  continuation?: boolean;
}

export interface NorthArrow extends FurnitureBase {
  type: 'north';
  sizeMm: number;
}

export interface ScaleBar extends FurnitureBase {
  type: 'scale';
  widthMm: number;
}

export type FurnitureItem = LegendBlock | NorthArrow | ScaleBar;

export interface ProjectDocument {
  schemaVersion: 'atlas.structured.v1';
  id: ID;
  name: string;
  lineName: string;
  sectionName: string;
  engineer: string;
  date: string;
  scaleDenominator: number;
  /** 每张平面页包含的里程长度，m */
  pageSpanM: number;
  alignment: AlignmentModel;
  bands: BandModel[];
  openings: OpeningModel[];
  grass: GrassSettings;
  forest: ForestSettings;
  legend: LegendEntry[];
  furniture: FurnitureItem[];
  layers: LayerState[];
  currentPageId: ID;
  autoAvoidLegend: boolean;
}

export interface StationMark {
  id: ID;
  chainage: number;
  relChainage: number;
  k: number;
  meter: number;
  label: string;
  kind: 'km' | 'hm' | 'curve';
  position: Vec2;
  tangent: Vec2;
}

export interface BandGeometry {
  bandId: ID;
  rawBoundary: Vec2[];
  loops: Vec2[][];
  outerLoops: Vec2[][];
  holes: Vec2[][];
  areaM2: number;
  centerLengthM: number;
  selfIntersectionCount: number;
  repaired: boolean;
  booleanEngine: string;
}

export interface BandQuantity {
  band: BandModel;
  geometry: BandGeometry;
  areaM2: number;
  rowCount: number;
  plantCount: number;
  seedlingCount: number;
  gridLineLengthM: number;
  cellCount: number;
}

export interface SpeciesQuantity {
  species: SpeciesSpec;
  designCount: number;
  seedlingCount: number;
}

export interface SegmentQuantityRow {
  id: ID;
  startChainage: number;
  endChainage: number;
  label: string;
  grassAreaM2: number;
  grassCells: number;
  grassKg: number;
  plantCount: number;
  seedlingCount: number;
}

export interface QuantityReport {
  bands: BandQuantity[];
  grassAreaM2: number;
  grassAreaHa: number;
  grassCells: number;
  grassLineM: number;
  grassKg: number;
  grassT: number;
  forestAreaM2: number;
  rowCount: number;
  plantCount: number;
  seedlingCount: number;
  species: SpeciesQuantity[];
  segments: SegmentQuantityRow[];
  issues: AtlasIssue[];
}

export interface AtlasIssue {
  id: ID;
  severity: 'warning' | 'info';
  bandId?: ID;
  pageId?: ID;
  chainage?: number;
  title: string;
  detail: string;
}

export type PageKind = 'plan' | 'quantity';

export interface AtlasPageInfo {
  id: ID;
  index: number;
  kind: PageKind;
  title: string;
  shortTitle: string;
  startChainage?: number;
  endChainage?: number;
  tableStartRow?: number;
  tableRows?: number;
}

export interface ComputedAtlas {
  alignmentLengthM: number;
  stations: StationMark[];
  quantities: QuantityReport;
  pages: AtlasPageInfo[];
  generatedAt: string;
}

export interface AtlasFile {
  app: 'grass-forest-atlas-studio';
  schemaVersion: 1;
  savedAt: string;
  document: ProjectDocument;
  snapshot?: {
    alignmentLengthM: number;
    stationCount: number;
    pageCount: number;
    grassAreaM2: number;
    seedlingCount: number;
    issues: number;
    stations?: StationMark[];
    pages?: AtlasPageInfo[];
    segments?: SegmentQuantityRow[];
  };
}
