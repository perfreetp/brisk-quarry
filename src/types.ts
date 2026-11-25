export type PeakId = 'am' | 'pm';
export type ViewMode = 'compare' | PeakId;
export type DirectionCode = 'up' | 'down';
export type FacilityKind =
  | 'stairs'
  | 'escalator'
  | 'gate'
  | 'passage'
  | 'platform'
  | 'hall'
  | 'mouth';

export type SegmentKind =
  | 'platform'
  | 'corridor'
  | 'passage'
  | 'stair-mouth'
  | 'escalator'
  | 'gate'
  | 'stairs-down';

export interface Point {
  x: number;
  y: number;
}

export interface Facility {
  id: string;
  name: string;
  kind: FacilityKind;
  floor: 'B1' | 'B2' | 'connector';
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: number[];
  capacityPaxH?: number;
  consultingFlowPaxH?: Partial<Record<PeakId, number>>;
  note?: string;
}

export interface FloorPlate {
  id: 'B1' | 'B2';
  name: string;
  english: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ColumnRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RouteNode extends Point {
  id: string;
  label: string;
  /** Cumulative real transfer distance in metres. */
  distanceM: number;
  /** Facility represented by this node itself. */
  facilityId?: string;
  outKind?: SegmentKind;
  outFacilityId?: string;
  outCapacityPaxH?: number;
  /** The segment leaving this node is rendered inside a nested Konva group. */
  nestedGroupId?: string;
}

export interface RouteDefinition {
  id: 'lr' | 'rl';
  name: string;
  nodes: RouteNode[];
}

export interface ConsultingFlow {
  id: string;
  peak: PeakId;
  code: DirectionCode;
  trainDirection: string;
  od: string;
  volumePaxH: number;
  routeId: RouteDefinition['id'];
}

export interface Keyframe extends Point {
  id: string;
  nodeId: string;
  label: string;
  distanceM: number;
  tMin: number;
}

export interface TrackSegment {
  id: string;
  fromKeyframeId: string;
  toKeyframeId: string;
  distanceM: number;
  kind: SegmentKind;
  facilityId?: string;
  capacityPaxH: number;
  nestedGroupId?: string;
}

export interface FlowTrack {
  id: string;
  peak: PeakId;
  code: DirectionCode;
  name: string;
  trainDirection: string;
  od: string;
  routeId: RouteDefinition['id'];
  color: string;
  baseVolumePaxH: number;
  effectiveVolumePaxH: number;
  facilityIds: string[];
  keyframes: Keyframe[];
  segments: TrackSegment[];
  totalDistanceM: number;
  durationMin: number;
}

export interface PeakGroup {
  id: PeakId;
  name: string;
  clockStart: string;
  color: string;
  tracks: FlowTrack[];
  totalVolumePaxH: number;
}

export interface GateSnapshot {
  gateId: string;
  timeMin: number;
  arrivalPerMin: number;
  capacityPerMin: number;
  inside: number;
  queue: number;
  totalPeople: number;
  jammed: boolean;
  elapsedJamMin: number;
}

export interface JamIncident {
  gateId: string;
  gateName: string;
  recordedAtMin: number;
  compareAtMin: number;
  previous: GateSnapshot;
  jam: GateSnapshot;
  deltaPeople: number;
  keyframeLabel: string;
}

export interface RetimeLog {
  id: string;
  time: string;
  message: string;
  affectedTracks: number;
  affectedKeyframes: number;
  beforeDuration: Record<string, number>;
  afterDuration: Record<string, number>;
}

export interface Signoff {
  name: string;
  role: string;
  decision: 'pending' | 'operable' | 'conditional' | 'rework';
  note: string;
  signedAt: string | null;
}

export interface OperabilityCheck {
  id: string;
  label: string;
  status: 'pass' | 'watch' | 'fail';
  detail: string;
}

export interface AppState {
  ready: boolean;
  viewMode: ViewMode;
  timeMin: number;
  durationMin: number;
  cellMin: number;
  playing: boolean;
  speed: 1 | 2 | 4;
  pmOffsetCells: number;
  structureVersion: number;
  groups: Record<PeakId, PeakGroup>;
  facilityFlows: Record<PeakId, Record<string, number>>;
  selectedFacilityId: string;
  jam: JamIncident | null;
  compareOverlay: boolean;
  reviewOpen: boolean;
  finalized: boolean;
  logs: RetimeLog[];
  signoffs: {
    owner: Signoff;
    operator: Signoff;
  };
}

export interface TrackSample {
  track: FlowTrack;
  localTimeMin: number;
  x: number;
  y: number;
  distanceM: number;
  segmentIndex: number;
  progress: number;
  atEnd: boolean;
}
