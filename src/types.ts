export type Vec3Tuple = [number, number, number];

export type PruneLabel = 'keep' | 'remove' | 'heading' | 'reduction';

export interface BudSite {
  id: string;
  /** Position along the branch, 0 = base, 1 = tip. */
  t: number;
  position: Vec3Tuple;
}

export interface BranchData {
  id: string;
  parentId: string | null;
  start: Vec3Tuple;
  end: Vec3Tuple;
  /** Base diameter in metres. */
  diameter: number;
  /** Tip diameter in metres, used for taper and the thin-tip guard. */
  tipDiameter: number;
  /** Branch length in metres, from JSON if supplied or endpoint distance. */
  length: number;
  /** Attachment angle in degrees. */
  angle: number | null;
  buds: BudSite[];
  /** Optional source-specific minimum cuttable diameter in metres. */
  minCutDiameter?: number;
  meta?: Record<string, unknown>;
}

export interface CutMarker {
  /** Position along the straight branch axis, 0..1 after clamping. */
  t: number;
  position: Vec3Tuple;
  snappedBudId: string | null;
  diameter: number;
}

export interface BranchAnnotation {
  label: PruneLabel;
  cut?: CutMarker;
  note?: string;
}

export interface SkeletonDataset {
  name: string;
  branches: BranchData[];
  unit: 'm' | 'cm' | 'mm';
  upAxis: 'x' | 'y' | 'z';
  warnings: string[];
  importedAt: string;
}

export const LABEL_ORDER: PruneLabel[] = ['keep', 'remove', 'heading', 'reduction'];

export const LABEL_META: Record<
  PruneLabel,
  { label: string; short: string; color: string; text: string; key: string; needsCut: boolean; description: string }
> = {
  keep: {
    label: '保留',
    short: '保',
    color: '#2f9e44',
    text: '#ffffff',
    key: '1',
    needsCut: false,
    description: '不修剪，完整保留该枝条。',
  },
  remove: {
    label: '疏除',
    short: '疏',
    color: '#e03131',
    text: '#ffffff',
    key: '2',
    needsCut: false,
    description: '从基部疏除；其后代枝条会提示一并疏除。',
  },
  heading: {
    label: '短截',
    short: '短',
    color: '#f08c00',
    text: '#1f1300',
    key: '3',
    needsCut: true,
    description: '剪去一年生枝梢的一部分，请拖动黄色剪口环。',
  },
  reduction: {
    label: '回缩',
    short: '回',
    color: '#7048e8',
    text: '#ffffff',
    key: '4',
    needsCut: true,
    description: '在多年生枝段上回缩，请拖动黄色剪口环。',
  },
};

export const UNLABELED_COLOR = '#8d7d68';
export const SELECTION_COLOR = '#22d3ee';
export const CUT_COLOR = '#ffe066';
