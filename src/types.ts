export type ID = string;

export type EasingId =
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutCubic'
  | 'easeInCubic'
  | 'easeOutCubic';

export type ToolMode = 'select' | 'range';

export interface Keyframe {
  id: ID;
  /**
   * Base curve coordinate. When the easing preset changes, the already-arranged
   * keyframes are redistributed through this coordinate via the new curve.
   */
  u: number;
  /** Absolute position on the shared timeline, in seconds. */
  time: number;
  /** Highlight opacity / intensity from 0 to 1. */
  intensity: number;
}

export interface TriggerCondition {
  event: string;
  condition: string;
  beacon: string;
  subtitle: string;
}

export interface AudioTiming {
  /** Audio group manifest asset id. */
  assetId: ID;
  /** Attack length: start -> peak, seconds. */
  attack: number;
  /** Decay/release length: end-decay -> end, seconds. */
  decay: number;
  gain: number;
  pan: number;
}

export interface VisualTiming {
  targetId: ID;
  color: string;
  /** Rise / light-up completion length: start -> full brightness. */
  rise: number;
  /** Extinguish length: end-fade -> end. */
  fade: number;
  easing: EasingId;
  keyframes: Keyframe[];
}

export interface Cue {
  id: ID;
  code: string;
  name: string;
  /** Shared linked in-point. Moving either audio or visual edge moves both. */
  start: number;
  /** Shared linked out-point. */
  end: number;
  enabled: boolean;
  audio: AudioTiming;
  visual: VisualTiming;
  trigger: TriggerCondition;
}

export interface CueGroup {
  id: ID;
  name: string;
  color: string;
  cueIds: ID[];
}

export interface LoopRegion {
  start: number;
  end: number;
  enabled: boolean;
}

export interface Project {
  name: string;
  duration: number;
  cues: Cue[];
  groups: CueGroup[];
}

export type AudioAssetType = 'ambient' | 'sfx' | 'beacon' | 'ui';

export interface SynthSpec {
  kind: 'drone' | 'door' | 'chime' | 'beacon' | 'noise';
  freqs?: number[];
  filter?: number;
  noise?: 'white' | 'brown';
  rate?: number;
  gain?: number;
}

export interface AudioAsset {
  id: ID;
  name: string;
  type: AudioAssetType;
  /** Requested delivery path for the audio team. The demo synthesizes it. */
  file: string;
  duration: number | 'loop';
  channels?: string;
  synth: SynthSpec;
  description: string;
}

export interface TargetDef {
  id: ID;
  label: string;
  kind: 'door' | 'terminal' | 'hatch';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Deviation {
  key: 'peak' | 'decay';
  label: string;
  audioAt: number;
  visualAt: number;
  delta: number;
  ok: boolean;
}
