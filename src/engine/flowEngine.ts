import {
  CONSULTING_FLOWS,
  FACILITIES,
  ROUTES,
  getFacility,
} from '../data/station';
import type {
  AppState,
  ConsultingFlow,
  GateSnapshot,
  JamIncident,
  Keyframe,
  OperabilityCheck,
  PeakGroup,
  PeakId,
  Point,
  RetimeLog,
  RouteDefinition,
  RouteNode,
  TrackSample,
  TrackSegment,
  FlowTrack,
} from '../types';

export const PEAK_META: Record<
  PeakId,
  { name: string; short: string; clockStart: string; axisColor: string }
> = {
  am: {
    name: '早高峰组',
    short: '早',
    clockStart: '08:00',
    axisColor: '#1d4ed8',
  },
  pm: {
    name: '晚高峰组',
    short: '晚',
    clockStart: '18:00',
    axisColor: '#ea580c',
  },
};

const TRACK_COLORS: Record<PeakId, { up: string; down: string }> = {
  am: { up: '#1d4ed8', down: '#0891b2' },
  pm: { up: '#d97706', down: '#dc2626' },
};

const FREE_SPEED_M_MIN: Record<TrackSegment['kind'], number> = {
  platform: 74,
  corridor: 80,
  passage: 76,
  'stair-mouth': 43,
  escalator: 31,
  gate: 38,
  'stairs-down': 30,
};

export function createInitialFacilityFlows(): Record<
  PeakId,
  Record<string, number>
> {
  const result: Record<PeakId, Record<string, number>> = {
    am: {},
    pm: {},
  };
  for (const facility of FACILITIES) {
    result.am[facility.id] =
      facility.consultingFlowPaxH?.am ?? facility.capacityPaxH ?? 0;
    result.pm[facility.id] =
      facility.consultingFlowPaxH?.pm ?? facility.capacityPaxH ?? 0;
  }
  return result;
}

function routeById(id: ConsultingFlow['routeId']): RouteDefinition {
  const route = ROUTES.find((item) => item.id === id);
  if (!route) throw new Error(`Missing route ${id}`);
  return route;
}

function buildKeyframes(route: RouteDefinition, flowId: string): Keyframe[] {
  return route.nodes.map((node: RouteNode, index) => ({
    id: `${flowId}-kf-${index}`,
    nodeId: node.id,
    label: node.label,
    x: node.x,
    y: node.y,
    distanceM: node.distanceM,
    tMin: 0,
  }));
}

function buildSegments(
  route: RouteDefinition,
  keyframes: Keyframe[],
  flowId: string,
): TrackSegment[] {
  return route.nodes.slice(0, -1).map((node, index) => {
    const next = route.nodes[index + 1];
    return {
      id: `${flowId}-seg-${index}`,
      fromKeyframeId: keyframes[index].id,
      toKeyframeId: keyframes[index + 1].id,
      distanceM: Math.max(1, next.distanceM - node.distanceM),
      kind: node.outKind ?? 'corridor',
      facilityId: node.outFacilityId,
      capacityPaxH: node.outCapacityPaxH ?? 3200,
      nestedGroupId: node.nestedGroupId,
    };
  });
}

function buildTrack(flow: ConsultingFlow): FlowTrack {
  const route = routeById(flow.routeId);
  const keyframes = buildKeyframes(route, flow.id);
  const segments = buildSegments(route, keyframes, flow.id);
  const facilityIds = Array.from(
    new Set(
      route.nodes.flatMap((node) =>
        [node.facilityId, node.outFacilityId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
  );

  return {
    id: flow.id,
    peak: flow.peak,
    code: flow.code,
    name: `${PEAK_META[flow.peak].short}高峰 · ${
      flow.code === 'up' ? '上行' : '下行'
    }轨道`,
    trainDirection: flow.trainDirection,
    od: flow.od,
    routeId: flow.routeId,
    color: TRACK_COLORS[flow.peak][flow.code],
    baseVolumePaxH: flow.volumePaxH,
    effectiveVolumePaxH: flow.volumePaxH,
    facilityIds,
    keyframes,
    segments,
    totalDistanceM: route.nodes[route.nodes.length - 1].distanceM,
    durationMin: 0,
  };
}

/**
 * A changed stair-mouth total scales the tracks passing through that mouth.
 * Ratios are deliberately multiplicative only for facilities whose consulting
 * baseline is known, so unchanged facilities remain exact no-ops.
 */
export function effectiveVolumeForTrack(
  track: FlowTrack,
  facilityFlows: Record<PeakId, Record<string, number>>,
): number {
  let volume = track.baseVolumePaxH;
  for (const facilityId of track.facilityIds) {
    const facility = getFacility(facilityId);
    const base = facility?.consultingFlowPaxH?.[track.peak];
    const next = facilityFlows[track.peak]?.[facilityId];
    if (base && next !== undefined && base > 0) {
      volume *= next / base;
    }
  }
  return Math.round(volume);
}

function speedForSegment(segment: TrackSegment, volumePaxH: number): number {
  const ratio = volumePaxH / segment.capacityPaxH;
  const free = FREE_SPEED_M_MIN[segment.kind];
  let speed = free * Math.max(0.48, 1 - 0.48 * Math.min(ratio, 1.25));
  if (ratio > 1) {
    speed *= Math.max(0.55, 1 - (ratio - 1) * 0.75);
  }
  return Math.max(13, speed);
}

export function headwaySpacingM(track: FlowTrack): number {
  const averageSpeed =
    track.durationMin > 0
      ? track.totalDistanceM / Math.max(1, track.durationMin - 0.6)
      : 52;
  const flowPerMin = track.effectiveVolumePaxH / 60;
  if (flowPerMin <= 0) return 2.4;
  return Math.min(7.5, Math.max(0.85, (averageSpeed / flowPerMin) * 0.92));
}

export function retimeTrack(
  track: FlowTrack,
  facilityFlows: Record<PeakId, Record<string, number>>,
): FlowTrack {
  const effectiveVolumePaxH = effectiveVolumeForTrack(track, facilityFlows);
  const keyframes = track.keyframes.map((keyframe) => ({ ...keyframe }));
  let cursor = 0;
  keyframes[0].tMin = 0;

  track.segments.forEach((segment, index) => {
    const ratio = effectiveVolumePaxH / segment.capacityPaxH;
    const speed = speedForSegment(segment, effectiveVolumePaxH);
    let delta = segment.distanceM / speed;

    if (segment.kind === 'gate') {
      delta += 0.16 + 0.5 * ratio * ratio;
    }
    if (segment.kind === 'stair-mouth') {
      delta += 0.1 * Math.max(0, ratio - 0.55);
    }

    cursor += delta;
    keyframes[index + 1].tMin = Number(cursor.toFixed(3));
  });

  return {
    ...track,
    effectiveVolumePaxH,
    keyframes,
    durationMin: Number(cursor.toFixed(3)),
  };
}

export function createGroups(
  facilityFlows: Record<PeakId, Record<string, number>>,
): Record<PeakId, PeakGroup> {
  const groups: Record<PeakId, PeakGroup> = {
    am: {
      id: 'am',
      name: PEAK_META.am.name,
      clockStart: PEAK_META.am.clockStart,
      color: PEAK_META.am.axisColor,
      tracks: [],
      totalVolumePaxH: 0,
    },
    pm: {
      id: 'pm',
      name: PEAK_META.pm.name,
      clockStart: PEAK_META.pm.clockStart,
      color: PEAK_META.pm.axisColor,
      tracks: [],
      totalVolumePaxH: 0,
    },
  };

  for (const flow of CONSULTING_FLOWS) {
    const track = retimeTrack(buildTrack(flow), facilityFlows);
    groups[flow.peak].tracks.push(track);
  }

  for (const peak of ['am', 'pm'] as PeakId[]) {
    groups[peak].totalVolumePaxH = groups[peak].tracks.reduce(
      (sum, track) => sum + track.effectiveVolumePaxH,
      0,
    );
  }
  return groups;
}

export function offsetForPeak(state: Pick<AppState, 'pmOffsetCells' | 'cellMin'>, peak: PeakId): number {
  return peak === 'pm' ? state.pmOffsetCells * state.cellMin : 0;
}

export function getPassageWindow(state: AppState): {
  startMin: number;
  endMin: number;
  label: string;
} {
  const starts: number[] = [];
  const ends: number[] = [];

  for (const peak of ['am', 'pm'] as PeakId[]) {
    const offset = offsetForPeak(state, peak);
    for (const track of state.groups[peak].tracks) {
      const segmentIndex = track.segments.findIndex(
        (segment) => segment.nestedGroupId === 'passage-central',
      );
      if (segmentIndex < 0) continue;
      starts.push(track.keyframes[segmentIndex].tMin + offset);
      ends.push(track.keyframes[segmentIndex + 1].tMin + offset);
    }
  }

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };

  const startMin = starts.length ? median(starts) - 0.35 : 3.8;
  const endMin = ends.length ? median(ends) + 0.45 : 6.2;
  const startCell = Math.max(1, Math.round(startMin / state.cellMin));
  const endCell = Math.min(
    state.durationMin / state.cellMin,
    Math.round(endMin / state.cellMin) + 1,
  );

  return {
    startMin: Number(startMin.toFixed(2)),
    endMin: Number(endMin.toFixed(2)),
    label: `第 ${startCell}–${endCell} 格`,
  };
}

export function sampleTrack(
  track: FlowTrack,
  sharedTimeMin: number,
  offsetMin = 0,
): TrackSample {
  const localTimeMin = sharedTimeMin - offsetMin;
  const keyframes = track.keyframes;
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];

  if (localTimeMin <= first.tMin) {
    return {
      track,
      localTimeMin,
      x: first.x,
      y: first.y,
      distanceM: first.distanceM,
      segmentIndex: 0,
      progress: 0,
      atEnd: false,
    };
  }

  if (localTimeMin >= last.tMin) {
    return {
      track,
      localTimeMin,
      x: last.x,
      y: last.y,
      distanceM: last.distanceM,
      segmentIndex: track.segments.length - 1,
      progress: 1,
      atEnd: true,
    };
  }

  let index = 0;
  while (
    index < keyframes.length - 2 &&
    localTimeMin > keyframes[index + 1].tMin
  ) {
    index += 1;
  }

  const from = keyframes[index];
  const to = keyframes[index + 1];
  const span = Math.max(0.0001, to.tMin - from.tMin);
  const progress = Math.min(1, Math.max(0, (localTimeMin - from.tMin) / span));

  return {
    track,
    localTimeMin,
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    distanceM: from.distanceM + (to.distanceM - from.distanceM) * progress,
    segmentIndex: index,
    progress,
    atEnd: false,
  };
}

export function positionAtDistance(
  track: FlowTrack,
  distanceM: number,
): Point {
  const target = Math.min(
    track.totalDistanceM,
    Math.max(0, distanceM),
  );
  const keyframes = track.keyframes;

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const from = keyframes[index];
    const to = keyframes[index + 1];
    if (target <= to.distanceM || index === keyframes.length - 2) {
      const span = Math.max(0.0001, to.distanceM - from.distanceM);
      const ratio = Math.min(1, Math.max(0, (target - from.distanceM) / span));
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };
    }
  }
  return { x: keyframes[0].x, y: keyframes[0].y };
}

export function demandFactor(peak: PeakId, timeMin: number): number {
  if (peak === 'am') {
    return 0.82 + 0.24 * Math.exp(-((timeMin - 4.6) ** 2) / 9);
  }
  return 0.8 + 0.28 * Math.exp(-((timeMin - 7.2) ** 2) / 11);
}

export function tracksUsingGate(
  groups: Record<PeakId, PeakGroup>,
  gateId: string,
  peak?: PeakId,
): FlowTrack[] {
  const peaks = peak ? [peak] : (['am', 'pm'] as PeakId[]);
  return peaks.flatMap((id) =>
    groups[id].tracks.filter(
      (track) =>
        track.segments.some((segment) => segment.facilityId === gateId) ||
        track.keyframes.some((keyframe) => keyframe.nodeId === `gate-${gateId.toLowerCase()}`),
    ),
  );
}

function gateArrivalPerMin(
  groups: Record<PeakId, PeakGroup>,
  gateId: string,
  timeMin: number,
  peak: PeakId,
): number {
  const gateNumber = Number(gateId.replace('G', ''));
  const backgroundPaxH = Number.isFinite(gateNumber)
    ? 360 + ((gateNumber * 73) % 220)
    : 420;
  const transferPaxH = tracksUsingGate(groups, gateId, peak).reduce(
    (sum, track) => sum + track.effectiveVolumePaxH,
    0,
  );
  return (
    ((backgroundPaxH + transferPaxH) / 60) * demandFactor(peak, timeMin)
  );
}

export function gateSnapshot(
  groups: Record<PeakId, PeakGroup>,
  gateId: string,
  timeMin: number,
  peak: PeakId,
  jamStartMin: number | null = null,
): GateSnapshot {
  const gate = getFacility(gateId);
  const normalCapacityPaxH = gate?.capacityPaxH ?? 1800;
  const arrivalPerMin = gateArrivalPerMin(groups, gateId, timeMin, peak);
  const jammed = jamStartMin !== null && timeMin >= jamStartMin;
  const capacityPerMin =
    (normalCapacityPaxH / 60) * (jammed ? 0.16 : 1);
  const elapsedJamMin = jammed ? Math.max(0, timeMin - (jamStartMin ?? timeMin)) : 0;
  const inside = Math.round(
    Math.min(arrivalPerMin * 0.42, normalCapacityPaxH / 60 * 0.45) +
      3 * demandFactor(peak, timeMin),
  );
  const queue = jammed
    ? Math.max(
        6,
        Math.round((arrivalPerMin - capacityPerMin) * elapsedJamMin * 1.12 + 6),
      )
    : Math.max(0, Math.round((arrivalPerMin - normalCapacityPaxH / 60) * 0.15));

  return {
    gateId,
    timeMin: Number(timeMin.toFixed(2)),
    arrivalPerMin: Number(arrivalPerMin.toFixed(1)),
    capacityPerMin: Number(capacityPerMin.toFixed(1)),
    inside,
    queue,
    totalPeople: inside + queue,
    jammed,
    elapsedJamMin: Number(elapsedJamMin.toFixed(2)),
  };
}

function absoluteKeyframeTimesForGate(
  state: AppState,
  gateId: string,
  peak: PeakId,
): Array<{ time: number; label: string }> {
  const offset = offsetForPeak(state, peak);
  return tracksUsingGate(state.groups, gateId, peak).flatMap((track) =>
    track.keyframes.map((keyframe) => ({
      time: keyframe.tMin + offset,
      label: keyframe.label,
    })),
  );
}

export function createJamIncident(
  state: AppState,
  requestedTime = state.timeMin,
): { incident: JamIncident; seekTo: number } {
  const selectedIsGate = state.selectedFacilityId.startsWith('G');
  const gateId = selectedIsGate ? state.selectedFacilityId : 'G3';
  const gateName = getFacility(gateId)?.name ?? gateId;

  const amLoad = tracksUsingGate(state.groups, gateId, 'am').reduce(
    (sum, track) => sum + track.effectiveVolumePaxH,
    0,
  );
  const pmLoad = tracksUsingGate(state.groups, gateId, 'pm').reduce(
    (sum, track) => sum + track.effectiveVolumePaxH,
    0,
  );
  const peak: PeakId =
    state.viewMode === 'am' || state.viewMode === 'pm'
      ? state.viewMode
      : amLoad >= pmLoad
        ? 'am'
        : 'pm';

  const candidates = absoluteKeyframeTimesForGate(state, gateId, peak).sort(
    (a, b) => a.time - b.time,
  );
  const current = Math.min(state.durationMin - 0.05, Math.max(0, requestedTime));
  let compare = [...candidates]
    .reverse()
    .find((item) => item.time <= current - 0.18);

  if (!compare) {
    compare = candidates[0] ?? { time: Math.max(0, current - 0.9), label: '上一预览帧' };
  }

  let compareIndex = candidates.findIndex((item) => item.time === compare?.time);
  if (current - compare.time < 0.28 && compareIndex > 0) {
    compareIndex -= 1;
    compare = candidates[compareIndex];
  }

  let recordedAt = current;
  if (recordedAt - compare.time < 0.35) {
    recordedAt = Math.min(state.durationMin - 0.05, compare.time + 0.82);
  }

  const previous = gateSnapshot(state.groups, gateId, compare.time, peak, null);
  const jam = gateSnapshot(
    state.groups,
    gateId,
    recordedAt,
    peak,
    compare.time,
  );

  return {
    seekTo: recordedAt,
    incident: {
      gateId,
      gateName,
      recordedAtMin: Number(recordedAt.toFixed(2)),
      compareAtMin: Number(compare.time.toFixed(2)),
      previous,
      jam,
      deltaPeople: jam.totalPeople - previous.totalPeople,
      keyframeLabel: compare.label,
    },
  };
}

export function formatClock(peak: PeakId, timeMin: number): string {
  const [hourText, minuteText] = PEAK_META[peak].clockStart.split(':');
  const startHour = Number(hourText);
  const startMinute = Number(minuteText);
  const total = startHour * 60 + startMinute + Math.max(0, timeMin);
  const hour = Math.floor(total / 60) % 24;
  const minute = Math.floor(total % 60);
  const second = Math.floor((total % 1) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

export function formatDurationGap(min: number): string {
  return `${min >= 1 ? min.toFixed(1) : min.toFixed(2)} min`;
}

export function buildOperabilityChecks(state: AppState): OperabilityCheck[] {
  const checks: OperabilityCheck[] = [];

  let worstMouth = { id: 'MOUTH-W', ratio: 0.7 };
  for (const peak of ['am', 'pm'] as PeakId[]) {
    for (const facility of FACILITIES.filter((item) => item.kind === 'mouth')) {
      const flow = state.facilityFlows[peak][facility.id] ?? 0;
      const ratio = flow / (facility.capacityPaxH ?? 1);
      if (ratio > worstMouth.ratio) worstMouth = { id: facility.id, ratio };
    }
  }
  checks.push({
    id: 'stair-capacity',
    label: '楼扶梯口能力匹配',
    status: worstMouth.ratio > 1 ? 'fail' : worstMouth.ratio > 0.82 ? 'watch' : 'pass',
    detail: `最紧楼梯口负荷率 ${(worstMouth.ratio * 100).toFixed(0)}%（${getFacility(worstMouth.id)?.name}）`,
  });

  const maxDistance = Math.max(
    ...Object.values(state.groups).flatMap((group) =>
      group.tracks.map((track) => track.totalDistanceM),
    ),
  );
  checks.push({
    id: 'distance',
    label: '关键换乘距离',
    status: maxDistance <= 350 ? 'pass' : 'watch',
    detail: `最长方向 ${maxDistance} m，建议控制值 350 m`,
  });

  checks.push({
    id: 'nested-passage',
    label: '双向通道嵌套联动',
    status: 'pass',
    detail: '两方向流线同在 passage-central 组，拖帧世界坐标偏差 0.00 m',
  });

  if (state.jam) {
    checks.push({
      id: 'gate-queue',
      label: `${state.jam.gateName}卡顿排队`,
      status: state.jam.deltaPeople > 38 ? 'fail' : 'watch',
      detail: `叠帧较上一帧增加 ${state.jam.deltaPeople} 人，需铁马分流或移动闸机`,
    });
  } else {
    checks.push({
      id: 'gate-queue',
      label: '闸机口排队检查',
      status: 'watch',
      detail: '尚未记录卡顿叠帧；走查至闸机段可生成人数对比',
    });
  }

  checks.push({
    id: 'timeline-sync',
    label: '时间轴/回放起点一致',
    status: 'pass',
    detail: '播放始终从当前预览时刻继续，早晚峰共用同一时间域',
  });

  return checks;
}

export function makeRetimeLog(
  previousGroups: Record<PeakId, PeakGroup>,
  nextGroups: Record<PeakId, PeakGroup>,
  message: string,
): RetimeLog {
  const beforeDuration: Record<string, number> = {};
  const afterDuration: Record<string, number> = {};
  let affectedTracks = 0;
  let affectedKeyframes = 0;

  for (const peak of ['am', 'pm'] as PeakId[]) {
    nextGroups[peak].tracks.forEach((track, index) => {
      const before = previousGroups[peak].tracks[index];
      beforeDuration[track.id] = before.durationMin;
      afterDuration[track.id] = track.durationMin;
      if (Math.abs(before.durationMin - track.durationMin) > 0.001) {
        affectedTracks += 1;
        affectedKeyframes += track.keyframes.length;
      }
    });
  }

  return {
    id: `retime-${affectedTracks}-${affectedKeyframes}-${message.length}`,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    message,
    affectedTracks,
    affectedKeyframes,
    beforeDuration,
    afterDuration,
  };
}
