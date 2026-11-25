import {
  createGroups,
  createInitialFacilityFlows,
  createJamIncident,
  makeRetimeLog,
} from './engine/flowEngine';
import type {
  AppState,
  PeakId,
  Signoff,
} from './types';

const TIME_DOMAIN_MIN = 12;

function emptySignoff(role: string): Signoff {
  return {
    name: '',
    role,
    decision: 'pending',
    note: '',
    signedAt: null,
  };
}

function createInitialState(): AppState {
  const facilityFlows = createInitialFacilityFlows();
  const groups = createGroups(facilityFlows);
  return {
    ready: true,
    viewMode: 'compare',
    timeMin: 3.2,
    durationMin: TIME_DOMAIN_MIN,
    cellMin: 1,
    playing: false,
    speed: 1,
    pmOffsetCells: 0.5,
    structureVersion: 1,
    groups,
    facilityFlows,
    selectedFacilityId: 'G3',
    jam: null,
    compareOverlay: false,
    reviewOpen: false,
    finalized: false,
    logs: [
      {
        id: 'build-1',
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        message:
          '已铺入站厅/站台平面、楼扶梯与闸机，并按咨询高峰小时流向生成早晚高峰各 2 条轨道',
        affectedTracks: 4,
        affectedKeyframes: groups.am.tracks.reduce(
          (sum, track) => sum + track.keyframes.length,
          groups.pm.tracks.reduce((inner, track) => inner + track.keyframes.length, 0),
        ),
        beforeDuration: {},
        afterDuration: Object.fromEntries(
          [...groups.am.tracks, ...groups.pm.tracks].map((track) => [
            track.id,
            track.durationMin,
          ]),
        ),
      },
    ],
    signoffs: {
      owner: emptySignoff('业主代表'),
      operator: emptySignoff('运营方代表'),
    },
  };
}

export class WalkthroughStore extends EventTarget {
  state: AppState = createInitialState();

  private emit(): void {
    this.dispatchEvent(new CustomEvent('change'));
  }

  subscribe(listener: () => void): () => void {
    this.addEventListener('change', listener);
    return () => this.removeEventListener('change', listener);
  }

  private patch(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  setViewMode(viewMode: AppState['viewMode']): void {
    this.patch({ viewMode });
  }

  seek(timeMin: number, pause = false): void {
    const clamped = Math.min(
      this.state.durationMin,
      Math.max(0, Number.isFinite(timeMin) ? timeMin : 0),
    );
    this.patch({
      timeMin: Number(clamped.toFixed(3)),
      playing: pause ? false : this.state.playing,
    });
  }

  scrub(timeMin: number): void {
    this.seek(timeMin, true);
  }

  togglePlay(): void {
    if (!this.state.playing && this.state.timeMin >= this.state.durationMin) {
      this.patch({ timeMin: 0, playing: true });
      return;
    }
    this.patch({ playing: !this.state.playing });
  }

  restart(): void {
    this.patch({ timeMin: 0, playing: true });
  }

  tick(realDeltaMs: number): void {
    if (!this.state.playing) return;
    const minutesPerSecond = this.state.speed;
    const next =
      this.state.timeMin + (realDeltaMs / 1000) * minutesPerSecond;
    if (next >= this.state.durationMin) {
      this.patch({
        timeMin: this.state.durationMin,
        playing: false,
      });
      return;
    }
    this.patch({ timeMin: next });
  }

  setSpeed(speed: 1 | 2 | 4): void {
    this.patch({ speed });
  }

  togglePmHalfCell(): void {
    const next = this.state.pmOffsetCells === 0.5 ? 0 : 0.5;
    this.patch({ pmOffsetCells: next });
  }

  setPmOffsetCells(value: number): void {
    this.patch({ pmOffsetCells: Math.min(1, Math.max(0, value)) });
  }

  selectFacility(id: string): void {
    this.patch({ selectedFacilityId: id });
  }

  updateFacilityFlow(peak: PeakId, facilityId: string, flow: number): void {
    const safeFlow = Math.max(0, Math.round(Number.isFinite(flow) ? flow : 0));
    const facilityFlows: AppState['facilityFlows'] = {
      am: { ...this.state.facilityFlows.am },
      pm: { ...this.state.facilityFlows.pm },
    };
    const previousGroups = this.state.groups;
    facilityFlows[peak][facilityId] = safeFlow;
    const groups = createGroups(facilityFlows);
    const facilityName = facilityId;
    const log = makeRetimeLog(
      previousGroups,
      groups,
      `${peak === 'am' ? '早高峰' : '晚高峰'} ${facilityName} 流量改为 ${safeFlow} pax/h，关键帧保持原点位并按新流量重排时间间距`,
    );
    this.patch({
      facilityFlows,
      groups,
      structureVersion: this.state.structureVersion + 1,
      jam: null,
      compareOverlay: false,
      logs: [log, ...this.state.logs].slice(0, 12),
    });
  }

  recordJamAtCurrentFrame(): void {
    const result = createJamIncident(this.state);
    this.patch({
      jam: result.incident,
      compareOverlay: false,
      timeMin: result.seekTo,
      playing: false,
    });
  }

  showPreviousOverlay(): void {
    if (!this.state.jam) return;
    this.patch({
      compareOverlay: true,
      timeMin: this.state.jam.compareAtMin,
      playing: false,
    });
  }

  showJamFrame(): void {
    if (!this.state.jam) return;
    this.patch({
      compareOverlay: true,
      timeMin: this.state.jam.recordedAtMin,
      playing: false,
    });
  }

  toggleOverlay(): void {
    if (!this.state.jam) return;
    this.patch({ compareOverlay: !this.state.compareOverlay });
  }

  clearJam(): void {
    this.patch({ jam: null, compareOverlay: false });
  }

  setReviewOpen(reviewOpen: boolean): void {
    this.patch({ reviewOpen });
  }

  updateSignoff(role: 'owner' | 'operator', patch: Partial<Signoff>): void {
    const current = this.state.signoffs[role];
    const nextSignoff: Signoff = { ...current, ...patch };
    if (patch.decision && patch.decision !== 'pending' && !nextSignoff.signedAt) {
      nextSignoff.signedAt = new Date().toISOString();
    }
    if (patch.decision === 'pending') {
      nextSignoff.signedAt = null;
    }
    this.patch({
      signoffs: { ...this.state.signoffs, [role]: nextSignoff },
    });
  }

  finalize(): void {
    this.patch({ finalized: true, reviewOpen: true });
  }
}

export const store = new WalkthroughStore();
