import type { AudioAsset, Cue, CueGroup, Deviation, Project } from '../types';
import { retimeKeyframesWithEasing } from './easing';

export const MIN_CUE_DURATION = 0.55;
export const SNAP_GRID = 0.05;
export const SYNC_TOLERANCE = 0.035;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snapTime(time: number, enabled = true, grid = SNAP_GRID): number {
  if (!enabled) return Number(time.toFixed(3));
  return Number((Math.round(time / grid) * grid).toFixed(3));
}

export function formatTime(time: number): string {
  const sign = time < 0 ? '-' : '';
  const t = Math.abs(time);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${sign}${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

export function shiftCue(cue: Cue, delta: number): void {
  cue.start = Number((cue.start + delta).toFixed(3));
  cue.end = Number((cue.end + delta).toFixed(3));
  cue.visual.keyframes.forEach((k) => {
    k.time = Number((k.time + delta).toFixed(3));
  });
}

export function moveCueTo(cue: Cue, newStart: number): number {
  const target = Math.max(0, newStart);
  const delta = Number((target - cue.start).toFixed(3));
  shiftCue(cue, delta);
  return delta;
}

export function resizeCueStart(cue: Cue, newStart: number): void {
  const start = clamp(newStart, 0, cue.end - MIN_CUE_DURATION);
  cue.start = Number(start.toFixed(3));
  normalizeKeyframesAfterResize(cue);
}

export function resizeCueEnd(cue: Cue, newEnd: number, maxDuration = 600): void {
  const end = clamp(newEnd, cue.start + MIN_CUE_DURATION, maxDuration);
  cue.end = Number(end.toFixed(3));
  normalizeKeyframesAfterResize(cue);
}

function normalizeKeyframesAfterResize(cue: Cue): void {
  const duration = Math.max(0.001, cue.end - cue.start);
  cue.visual.keyframes.forEach((k) => {
    k.time = Number(clamp(k.time, cue.start, cue.end).toFixed(3));
    k.u = Number(clamp((k.time - cue.start) / duration, 0, 1).toFixed(4));
  });
}

export function moveKeyframe(cue: Cue, keyId: string, time: number): void {
  const key = cue.visual.keyframes.find((k) => k.id === keyId);
  if (!key) return;
  key.time = Number(clamp(time, cue.start, cue.end).toFixed(3));
  key.u = Number(clamp((key.time - cue.start) / (cue.end - cue.start), 0, 1).toFixed(4));
}

export function changeEasing(cue: Cue, easingId: Cue['visual']['easing']): void {
  cue.visual.easing = easingId;
  cue.visual.keyframes = retimeKeyframesWithEasing(
    cue.visual.keyframes,
    cue.start,
    cue.end,
    easingId,
  );
}

export function getDeviations(cue: Cue): Deviation[] {
  const audioPeak = cue.start + cue.audio.attack;
  const visualPeak = cue.start + cue.visual.rise;
  const audioDecay = cue.end - cue.audio.decay;
  const visualExtinguish = cue.end - cue.visual.fade;

  const peakDelta = Number((visualPeak - audioPeak).toFixed(3));
  const decayDelta = Number((visualExtinguish - audioDecay).toFixed(3));

  return [
    {
      key: 'peak',
      label: '起音峰 ↔ 全亮',
      audioAt: Number(audioPeak.toFixed(3)),
      visualAt: Number(visualPeak.toFixed(3)),
      delta: peakDelta,
      ok: Math.abs(peakDelta) <= SYNC_TOLERANCE,
    },
    {
      key: 'decay',
      label: '衰减起点 ↔ 熄灭起点',
      audioAt: Number(audioDecay.toFixed(3)),
      visualAt: Number(visualExtinguish.toFixed(3)),
      delta: decayDelta,
      ok: Math.abs(decayDelta) <= SYNC_TOLERANCE,
    },
  ];
}

export function alignDeviation(cue: Cue, key: Deviation['key'], direction: 'visual-to-audio' | 'audio-to-visual'): void {
  const d = getDeviations(cue).find((item) => item.key === key);
  if (!d) return;
  if (key === 'peak') {
    if (direction === 'visual-to-audio') cue.visual.rise = cue.audio.attack;
    else cue.audio.attack = cue.visual.rise;
  } else if (direction === 'visual-to-audio') {
    cue.visual.fade = cue.audio.decay;
  } else {
    cue.audio.decay = cue.visual.fade;
  }
}

export function getGroupBounds(project: Project, group: CueGroup): { start: number; end: number } | null {
  const members = group.cueIds
    .map((id) => project.cues.find((cue) => cue.id === id))
    .filter((cue): cue is Cue => Boolean(cue));
  if (members.length === 0) return null;
  return {
    start: Math.min(...members.map((cue) => cue.start)),
    end: Math.max(...members.map((cue) => cue.end)),
  };
}

export function moveGroup(project: Project, groupId: string, requestedMinStart: number): number {
  const group = project.groups.find((g) => g.id === groupId);
  if (!group) return 0;
  const bounds = getGroupBounds(project, group);
  if (!bounds) return 0;
  const delta = requestedMinStart - bounds.start;
  if (bounds.start + delta < 0) {
    const safeDelta = -bounds.start;
    group.cueIds.forEach((id) => {
      const cue = project.cues.find((c) => c.id === id);
      if (cue) shiftCue(cue, safeDelta);
    });
    return safeDelta;
  }
  group.cueIds.forEach((id) => {
    const cue = project.cues.find((c) => c.id === id);
    if (cue) shiftCue(cue, delta);
  });
  return delta;
}

export function createGroupFromIds(project: Project, cueIds: string[], name?: string): CueGroup | null {
  const ids = Array.from(new Set(cueIds));
  if (ids.length < 2) return null;

  // Keep the model easy to reason about: one cue belongs to one editable group.
  project.groups.forEach((group) => {
    group.cueIds = group.cueIds.filter((id) => !ids.includes(id));
  });
  project.groups = project.groups.filter((group) => group.cueIds.length > 0);

  const group: CueGroup = {
    id: `group-${Math.random().toString(36).slice(2, 8)}`,
    name: name ?? `编组 ${project.groups.length + 1}`,
    color: '#22d3ee',
    cueIds: ids,
  };
  project.groups.push(group);
  return group;
}

export function rippleLaterCues(
  project: Project,
  changedCueId: string,
  pivotStart: number,
  delta: number,
): string[] {
  if (Math.abs(delta) < 0.001) return [];
  const shifted: string[] = [];
  project.cues.forEach((cue) => {
    if (cue.id === changedCueId) return;
    if (cue.start >= pivotStart - SYNC_TOLERANCE) {
      shiftCue(cue, delta);
      shifted.push(cue.code);
    }
  });
  return shifted;
}

export interface HandoffPackage {
  schema: string;
  name: string;
  duration: number;
  loop?: { start: number; end: number };
  groups: Project['groups'];
  cues: Array<Record<string, unknown>>;
  audioTeam: Array<Record<string, unknown>>;
  uiTeam: Array<Record<string, unknown>>;
}

export function buildHandoff(
  project: Project,
  assets: AudioAsset[],
  loop?: { start: number; end: number; enabled: boolean },
): HandoffPackage {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const cues = project.cues.map((cue) => {
    const deviations = getDeviations(cue);
    const asset = assetById.get(cue.audio.assetId);
    return {
      id: cue.id,
      code: cue.code,
      name: cue.name,
      targetId: cue.visual.targetId,
      enabled: cue.enabled,
      timeline: {
        start: cue.start,
        end: cue.end,
        duration: Number((cue.end - cue.start).toFixed(3)),
        linkedEdges: true,
      },
      audio: {
        assetId: cue.audio.assetId,
        requestedFile: asset?.file ?? null,
        attackFrom: cue.start,
        attackPeakAt: Number((cue.start + cue.audio.attack).toFixed(3)),
        decayFrom: Number((cue.end - cue.audio.decay).toFixed(3)),
        end: cue.end,
        gain: cue.audio.gain,
        pan: cue.audio.pan,
      },
      visual: {
        lightOnAt: cue.start,
        fullBrightAt: Number((cue.start + cue.visual.rise).toFixed(3)),
        extinguishFrom: Number((cue.end - cue.visual.fade).toFixed(3)),
        offAt: cue.end,
        easing: cue.visual.easing,
        color: cue.visual.color,
        keyframes: cue.visual.keyframes.map((k) => ({
          time: k.time,
          intensity: Number(k.intensity.toFixed(3)),
          curveU: k.u,
        })),
      },
      syncChecks: [
        { pair: '起音头 ↔ 亮起头', deltaSeconds: 0, aligned: true, linkedEdge: true },
        ...deviations.map((d) => ({ pair: d.label, deltaSeconds: d.delta, aligned: d.ok })),
      ],
      trigger: cue.trigger,
    };
  });

  return {
    schema: 'dual-cue-timeline/v1',
    name: project.name,
    duration: project.duration,
    loop: loop?.enabled ? { start: loop.start, end: loop.end } : undefined,
    groups: project.groups,
    cues,
    audioTeam: project.cues.map((cue) => ({
      cueId: cue.id,
      code: cue.code,
      trigger: cue.trigger.event,
      precondition: cue.trigger.condition,
      asset: cue.audio.assetId,
      file: assetById.get(cue.audio.assetId)?.file,
      soundBeacon: cue.trigger.beacon,
      envelope: {
        attack: cue.audio.attack,
        decay: cue.audio.decay,
        gain: cue.audio.gain,
        pan: cue.audio.pan,
      },
    })),
    uiTeam: project.cues.map((cue) => ({
      cueId: cue.id,
      code: cue.code,
      trigger: cue.trigger.event,
      precondition: cue.trigger.condition,
      target: cue.visual.targetId,
      highlight: {
        start: cue.start,
        end: cue.end,
        color: cue.visual.color,
        easing: cue.visual.easing,
        keyframes: cue.visual.keyframes.map((k) => ({ time: k.time, intensity: k.intensity })),
      },
      accessibility: {
        subtitle: cue.trigger.subtitle,
        requiresFlashAndSubtitle: true,
        maxFlashHz: 3,
      },
    })),
  };
}
