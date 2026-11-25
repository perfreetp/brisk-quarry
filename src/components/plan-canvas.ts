import Konva from 'konva';
import {
  COLUMNS,
  FACILITIES,
  FLOORS,
  NESTED_PASSAGE,
  VIEW_H,
  VIEW_W,
} from '../data/station';
import {
  gateSnapshot,
  headwaySpacingM,
  offsetForPeak,
  sampleTrack,
} from '../engine/flowEngine';
import { store } from '../store';
import type { AppState, FlowTrack, TrackSample } from '../types';

interface ParticleRef {
  node: Konva.Circle;
  index: number;
}

interface TrackRuntime {
  track: FlowTrack;
  group: Konva.Group;
  traveledLine: Konva.Line;
  lead: Konva.Circle;
  particles: ParticleRef[];
  markers: Konva.Circle[];
}

interface NestedLaneRuntime {
  trackId: string;
  peak: FlowTrack['peak'];
  group: Konva.Group;
  from: { x: number; y: number };
  to: { x: number; y: number };
  startMin: number;
  endMin: number;
  particles: Konva.Circle[];
}

interface GateRuntime {
  group: Konva.Group;
  rect: Konva.Rect;
  countText: Konva.Text;
}

const PX_PER_M = 3.96;

// Konva's fluent API is parent.add(child); expose the small child.addTo(parent)
// helper used by the drawing code below.
(Konva.Node.prototype as unknown as {
  addTo?: (parent: Konva.Container) => Konva.Node;
}).addTo = function addTo(parent: Konva.Container) {
  parent.add(this as unknown as Konva.Node);
  return this as unknown as Konva.Node;
};

export class PlanCanvas extends HTMLElement {
  private host: HTMLDivElement | null = null;
  private stage: Konva.Stage | null = null;
  private layer: Konva.Layer | null = null;
  private root: Konva.Group | null = null;
  private passageGroup: Konva.Group | null = null;
  private passageInner: Konva.Group | null = null;
  private gatePeopleGroup: Konva.Group | null = null;
  private gatePeoplePool: Konva.Circle[] = [];
  private ghostGroup: Konva.Group | null = null;
  private ghostPeoplePool: Konva.Circle[] = [];
  private ghostTrackPool: Konva.Circle[] = [];
  private ghostLabel: Konva.Label | null = null;
  private ghostLabelText: Konva.Text | null = null;
  private tracks = new Map<string, TrackRuntime>();
  private nestedLanes: NestedLaneRuntime[] = [];
  private gateRuntimes = new Map<string, GateRuntime>();
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastGhostSignature = '';

  connectedCallback(): void {
    this.innerHTML = `
      <div class="plan-host" aria-label="站厅层与站台层 Konva 平面图"></div>
      <div class="plan-legend" aria-hidden="true">
        <span><i class="legend-dot am-up"></i>早高峰</span>
        <span><i class="legend-dot pm-down"></i>晚高峰</span>
        <span><i class="legend-gate"></i>闸机/楼扶梯可点击</span>
      </div>
      <div class="plan-canvas-tip">点击闸机或楼扶梯口可选中；拖动下方时间轴逐帧走查</div>
      <div class="ghost-badge" data-role="ghost-badge" hidden></div>
    `;

    this.host = this.querySelector<HTMLDivElement>('.plan-host');
    if (!this.host) return;

    this.stage = new Konva.Stage({
      container: this.host,
      width: this.host.clientWidth || 900,
      height: this.host.clientHeight || 620,
    });
    this.layer = new Konva.Layer({ id: 'plan-layer' });
    this.stage.add(this.layer);
    this.root = new Konva.Group({ id: 'fit-root' });
    this.layer.add(this.root);

    this.renderStructure();

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.host);
    this.unsubscribe = store.subscribe(() => this.update());
    this.fit();
    this.update();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.resizeObserver?.disconnect();
    this.stage?.destroy();
    this.stage = null;
    this.layer = null;
    this.root = null;
  }

  private fit(): void {
    if (!this.stage || !this.root || !this.host) return;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width === 0 || height === 0) return;
    this.stage.width(width);
    this.stage.height(height);
    const scale = Math.min(width / VIEW_W, height / VIEW_H);
    this.root.scale({ x: scale, y: scale });
    this.root.position({
      x: (width - VIEW_W * scale) / 2,
      y: (height - VIEW_H * scale) / 2,
    });
    this.layer?.batchDraw();
  }

  private renderStructure(): void {
    if (!this.root || !this.layer) return;
    this.root.destroyChildren();
    this.tracks.clear();
    this.nestedLanes = [];
    this.gateRuntimes.clear();
    this.gatePeoplePool = [];
    this.ghostPeoplePool = [];
    this.ghostTrackPool = [];
    this.lastGhostSignature = '';

    this.drawBase();
    this.drawFacilities();
    this.drawPassageGroup();
    this.drawTracks();
    this.drawGateLayer();
    this.drawPeoplePools();
  }

  private text(
    parent: Konva.Group | Konva.Layer,
    config: Konva.TextConfig,
  ): Konva.Text {
    const text = new Konva.Text({
      fontFamily:
        '"Microsoft YaHei", "PingFang SC", system-ui, -apple-system, sans-serif',
      ...config,
    });
    parent.add(text);
    return text;
  }

  private drawBase(): void {
    if (!this.root) return;
    new Konva.Rect({
      x: 0,
      y: 0,
      width: VIEW_W,
      height: VIEW_H,
      fill: '#eaf0f7',
    }).addTo(this.root);

    // Schematic drawing grid.
    const grid = new Konva.Group({ listening: false });
    this.root.add(grid);
    for (let x = 40; x <= VIEW_W - 40; x += 40) {
      new Konva.Line({
        points: [x, 54, x, 856],
        stroke: '#cbd5e1',
        strokeWidth: 0.5,
        opacity: 0.35,
      }).addTo(grid);
    }
    for (let y = 64; y <= 844; y += 40) {
      new Konva.Line({
        points: [40, y, 1240, y],
        stroke: '#cbd5e1',
        strokeWidth: 0.5,
        opacity: 0.35,
      }).addTo(grid);
    }

    for (const floor of FLOORS) {
      new Konva.Rect({
        x: floor.x,
        y: floor.y,
        width: floor.w,
        height: floor.h,
        cornerRadius: 20,
        fill: '#f8fafc',
        stroke: '#94a3b8',
        strokeWidth: 2,
        shadowColor: '#0f172a',
        shadowBlur: 18,
        shadowOpacity: 0.08,
        shadowOffsetY: 6,
      }).addTo(this.root);

      this.text(this.root, {
        x: floor.x + 24,
        y: floor.y + 18,
        text: floor.name,
        fontSize: 25,
        fontStyle: '700',
        fill: '#0f172a',
      });
      this.text(this.root, {
        x: floor.x + 24,
        y: floor.y + 52,
        text: floor.english,
        fontSize: 12,
        letterSpacing: 1.5,
        fill: '#64748b',
      });
    }

    // Concourse rooms and paid area.
    const rooms: Array<[number, number, number, number, string]> = [
      [70, 126, 120, 210, '出入口\n集散厅'],
      [1100, 126, 110, 210, '设备与\n管理用房'],
      [390, 326, 150, 34, '客服中心'],
      [742, 326, 128, 34, '应急汇流区'],
    ];
    for (const [x, y, w, h, label] of rooms) {
      new Konva.Rect({
        x,
        y,
        width: w,
        height: h,
        cornerRadius: 10,
        fill: '#e2e8f0',
        stroke: '#94a3b8',
        strokeWidth: 1,
      }).addTo(this.root);
      this.text(this.root, {
        x: x + 10,
        y: y + h / 2 - 16,
        width: w - 20,
        align: 'center',
        text: label,
        fontSize: 13,
        lineHeight: 1.25,
        fill: '#475569',
        fontStyle: '600',
      });
    }

    new Konva.Rect({
      x: 430,
      y: 248,
      width: 410,
      height: 116,
      cornerRadius: 14,
      fill: 'rgba(219,234,254,0.42)',
      stroke: '#60a5fa',
      strokeWidth: 1.5,
      dash: [8, 6],
    }).addTo(this.root);
    this.text(this.root, {
      x: 444,
      y: 252,
      text: '付费区 / 换乘核验闸机组',
      fontSize: 12,
      fill: '#2563eb',
      fontStyle: '700',
    });

    // Platforms and trains.
    const platforms: Array<[number, string, string]> = [
      [110, '2号线岛式站台', '#0284c7'],
      [810, '5号线岛式站台', '#7c3aed'],
    ];
    for (const [x, label, color] of platforms) {
      new Konva.Rect({
        x,
        y: 610,
        width: 360,
        height: 180,
        cornerRadius: 18,
        fill: '#e0f2fe',
        stroke: color,
        strokeWidth: 2,
      }).addTo(this.root);
      new Konva.Rect({
        x: x - 10,
        y: 802,
        width: 380,
        height: 28,
        cornerRadius: 12,
        fill: '#94a3b8',
      }).addTo(this.root);
      for (let i = 0; i < 8; i += 1) {
        new Konva.Rect({
          x: x + 18 + i * 43,
          y: 807,
          width: 24,
          height: 18,
          cornerRadius: 4,
          fill: '#e2e8f0',
        }).addTo(this.root);
      }
      this.text(this.root, {
        x: x + 18,
        y: 626,
        text: label,
        fontSize: 17,
        fontStyle: '700',
        fill: color,
      });
      new Konva.Line({
        points: [x + 18, 782, x + 342, 782],
        stroke: '#f59e0b',
        strokeWidth: 5,
        dash: [14, 10],
      }).addTo(this.root);
    }

    for (const column of COLUMNS) {
      new Konva.Rect({
        ...column,
        cornerRadius: 4,
        fill: '#64748b',
        stroke: '#334155',
        strokeWidth: 1,
      }).addTo(this.root);
    }
  }

  private drawFacilities(): void {
    if (!this.root) return;

    for (const facility of FACILITIES) {
      if (facility.kind === 'gate' || facility.kind === 'passage') continue;

      if (facility.points && facility.points.length >= 4) {
        const points = facility.points;
        new Konva.Line({
          points,
          stroke: '#cbd5e1',
          strokeWidth: 18,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(this.root);
        new Konva.Line({
          points,
          stroke: facility.kind === 'escalator' ? '#0369a1' : '#475569',
          strokeWidth: 4,
          lineCap: 'round',
          dash: facility.kind === 'escalator' ? [2, 10] : undefined,
        }).addTo(this.root);

        const [x1, y1, x2, y2] = points;
        for (let i = 1; i < 8; i += 1) {
          const ratio = i / 8;
          const x = x1 + (x2 - x1) * ratio;
          const y = y1 + (y2 - y1) * ratio;
          new Konva.Circle({
            x,
            y,
            radius: 2.5,
            fill: '#64748b',
          }).addTo(this.root);
        }
      } else if (facility.w && facility.h) {
        new Konva.Rect({
          x: facility.x,
          y: facility.y,
          width: facility.w,
          height: facility.h,
          cornerRadius: 8,
          fill: facility.kind === 'mouth' ? '#fed7aa' : '#e2e8f0',
          stroke: facility.kind === 'mouth' ? '#c2410c' : '#475569',
          strokeWidth: 1.6,
        }).addTo(this.root);
      }

      const labelX = facility.points
        ? (facility.points[0] + facility.points[2]) / 2 - 54
        : facility.x - 28;
      const labelY = facility.points
        ? (facility.points[1] + facility.points[3]) / 2 - 34
        : facility.y - 22;
      this.text(this.root, {
        x: labelX,
        y: labelY,
        width: 108,
        align: 'center',
        text: facility.name,
        fontSize: 12,
        fontStyle: '700',
        fill: facility.kind === 'mouth' ? '#9a3412' : '#334155',
        stroke: '#f8fafc',
        strokeWidth: 3,
      });
    }
  }

  private drawPassageGroup(): void {
    if (!this.root) return;
    this.passageGroup = new Konva.Group({
      id: NESTED_PASSAGE.id,
      name: NESTED_PASSAGE.id,
      x: NESTED_PASSAGE.x,
      y: NESTED_PASSAGE.y,
    });
    this.root.add(this.passageGroup);

    new Konva.Rect({
      name: 'passage-background',
      width: NESTED_PASSAGE.w,
      height: NESTED_PASSAGE.h,
      cornerRadius: 15,
      fill: 'rgba(186,230,253,0.62)',
      stroke: '#0284c7',
      strokeWidth: 1.8,
      dash: [7, 5],
    }).addTo(this.passageGroup);

    this.text(this.passageGroup, {
      x: 12,
      y: 7,
      text: '中央双向通道 · 嵌套组 passage-central / lanes',
      fontSize: 11.5,
      fontStyle: '700',
      fill: '#075985',
    });

    this.passageInner = new Konva.Group({
      id: 'passage-lanes',
      name: 'passage-lanes',
    });
    this.passageGroup.add(this.passageInner);
  }

  private drawTracks(): void {
    if (!this.root || !this.passageInner) return;
    const state = store.state;
    const allTracks = [...state.groups.am.tracks, ...state.groups.pm.tracks];

    for (const track of allTracks) {
      const group = new Konva.Group({ id: `track-${track.id}` });
      this.root.add(group);

      const flatPoints = track.keyframes.flatMap((keyframe) => [
        keyframe.x,
        keyframe.y,
      ]);

      new Konva.Line({
        points: flatPoints,
        stroke: '#ffffff',
        strokeWidth: 10,
        lineCap: 'round',
        lineJoin: 'round',
        opacity: 0.88,
      }).addTo(group);

      new Konva.Line({
        points: flatPoints,
        stroke: track.color,
        strokeWidth: 3.5,
        lineCap: 'round',
        lineJoin: 'round',
        opacity: 0.42,
      }).addTo(group);

      const traveledLine = new Konva.Line({
        points: [flatPoints[0], flatPoints[1], flatPoints[0], flatPoints[1]],
        stroke: track.color,
        strokeWidth: 6,
        lineCap: 'round',
        lineJoin: 'round',
        shadowColor: track.color,
        shadowBlur: 8,
        shadowOpacity: 0.28,
      }).addTo(group);

      const markers = track.keyframes.map((keyframe, index) => {
        const marker = new Konva.Circle({
          x: keyframe.x,
          y: keyframe.y,
          radius: index === 0 || index === track.keyframes.length - 1 ? 5.5 : 4,
          fill: '#ffffff',
          stroke: track.color,
          strokeWidth: 2.2,
          listening: false,
        });
        group.add(marker);
        if (index % 2 === 0 || index === track.keyframes.length - 1) {
          this.text(group, {
            x: keyframe.x + 7,
            y: keyframe.y - 18,
            text: `${index}`,
            fontSize: 10,
            fontStyle: '700',
            fill: track.color,
            stroke: '#ffffff',
            strokeWidth: 3,
            listening: false,
          });
        }
        return marker;
      });

      const particles: ParticleRef[] = [];
      for (let index = 0; index < 18; index += 1) {
        const node = new Konva.Circle({
          radius: 3.4,
          fill: track.color,
          stroke: '#ffffff',
          strokeWidth: 1,
          opacity: 0.82,
          listening: false,
        });
        group.add(node);
        particles.push({ node, index });
      }

      const lead = new Konva.Circle({
        radius: 8,
        fill: track.color,
        stroke: '#ffffff',
        strokeWidth: 3,
        shadowColor: track.color,
        shadowBlur: 12,
        shadowOpacity: 0.55,
        listening: false,
      }).addTo(group);

      this.text(group, {
        x: track.keyframes[0].x - 8,
        y: track.keyframes[0].y + 12,
        text: track.name,
        fontSize: 11.5,
        fontStyle: '800',
        fill: track.color,
        stroke: '#ffffff',
        strokeWidth: 3.5,
        listening: false,
      });

      this.tracks.set(track.id, {
        track,
        group,
        traveledLine,
        lead,
        particles,
        markers,
      });

      track.segments.forEach((segment, segmentIndex) => {
        if (!segment.nestedGroupId || !this.passageGroup || !this.passageInner) return;
        const fromKf = track.keyframes[segmentIndex];
        const toKf = track.keyframes[segmentIndex + 1];
        const origin = { x: NESTED_PASSAGE.x, y: NESTED_PASSAGE.y };
        const from = { x: fromKf.x - origin.x, y: fromKf.y - origin.y };
        const to = { x: toKf.x - origin.x, y: toKf.y - origin.y };
        const laneGroup = new Konva.Group({
          id: `nested-${track.id}-${segment.id}`,
          name: 'nested-flow-lane',
        });
        this.passageInner.add(laneGroup);

        new Konva.Line({
          points: [from.x, from.y, to.x, to.y],
          stroke: '#ffffff',
          strokeWidth: 9,
          lineCap: 'round',
        }).addTo(laneGroup);
        new Konva.Line({
          points: [from.x, from.y, to.x, to.y],
          stroke: track.color,
          strokeWidth: 4.5,
          lineCap: 'round',
        }).addTo(laneGroup);

        const particles: Konva.Circle[] = [];
        for (let p = 0; p < 6; p += 1) {
          const circle = new Konva.Circle({
            radius: 4,
            fill: track.color,
            stroke: '#ffffff',
            strokeWidth: 1.4,
            listening: false,
          });
          laneGroup.add(circle);
          particles.push(circle);
        }

        this.nestedLanes.push({
          trackId: track.id,
          peak: track.peak,
          group: laneGroup,
          from,
          to,
          startMin: fromKf.tMin,
          endMin: toKf.tMin,
          particles,
        });
      });
    }
  }

  private drawGateLayer(): void {
    if (!this.root) return;
    const gateLayer = new Konva.Group({ id: 'gate-layer' });
    this.root.add(gateLayer);

    for (const facility of FACILITIES.filter((item) => item.kind === 'gate')) {
      const group = new Konva.Group({
        id: facility.id,
        x: facility.x,
        y: facility.y,
      });
      gateLayer.add(group);

      const selected = store.state.selectedFacilityId === facility.id;
      const rect = new Konva.Rect({
        width: facility.w ?? 44,
        height: facility.h ?? 36,
        cornerRadius: 7,
        fill: selected ? '#fed7aa' : '#e2e8f0',
        stroke: selected ? '#c2410c' : '#475569',
        strokeWidth: selected ? 2.6 : 1.5,
      }).addTo(group);

      new Konva.Rect({
        x: 7,
        y: 7,
        width: 4,
        height: 22,
        cornerRadius: 2,
        fill: '#64748b',
        listening: false,
      }).addTo(group);
      new Konva.Rect({
        x: (facility.w ?? 44) - 11,
        y: 7,
        width: 4,
        height: 22,
        cornerRadius: 2,
        fill: '#64748b',
        listening: false,
      }).addTo(group);

      this.text(group, {
        x: 0,
        y: 11,
        width: facility.w ?? 44,
        align: 'center',
        text: facility.id,
        fontSize: 11,
        fontStyle: '800',
        fill: '#0f172a',
        listening: false,
      });

      const countText = this.text(group, {
        x: -18,
        y: -19,
        width: (facility.w ?? 44) + 36,
        align: 'center',
        text: '',
        fontSize: 11,
        fontStyle: '800',
        fill: '#b91c1c',
        listening: false,
      });

      group.on('click tap', () => store.selectFacility(facility.id));
      group.on('mouseenter', () => {
        const container = this.stage?.container();
        if (container) container.style.cursor = 'pointer';
        rect.strokeWidth(2.8);
        this.layer?.batchDraw();
      });
      group.on('mouseleave', () => {
        const container = this.stage?.container();
        if (container) container.style.cursor = 'default';
        rect.strokeWidth(store.state.selectedFacilityId === facility.id ? 2.6 : 1.5);
        this.layer?.batchDraw();
      });

      this.gateRuntimes.set(facility.id, { group, rect, countText });
    }
  }

  private drawPeoplePools(): void {
    if (!this.root) return;
    this.gatePeopleGroup = new Konva.Group({
      id: 'selected-gate-people',
      listening: false,
    });
    this.root.add(this.gatePeopleGroup);
    for (let i = 0; i < 72; i += 1) {
      const dot = new Konva.Circle({
        radius: 3.4,
        stroke: '#ffffff',
        strokeWidth: 0.8,
        visible: false,
      });
      this.gatePeopleGroup.add(dot);
      this.gatePeoplePool.push(dot);
    }

    this.ghostGroup = new Konva.Group({
      id: 'jam-ghost-overlay',
      listening: false,
      visible: false,
    });
    this.root.add(this.ghostGroup);
    for (let i = 0; i < 72; i += 1) {
      const dot = new Konva.Circle({
        radius: 4,
        fill: '#dc2626',
        stroke: '#ffffff',
        strokeWidth: 1,
        opacity: 0.38,
        visible: false,
      });
      this.ghostGroup.add(dot);
      this.ghostPeoplePool.push(dot);
    }
    for (let i = 0; i < 8; i += 1) {
      const token = new Konva.Circle({
        radius: 7,
        fill: '#dc2626',
        stroke: '#fecaca',
        strokeWidth: 2,
        opacity: 0.42,
        visible: false,
      });
      this.ghostGroup.add(token);
      this.ghostTrackPool.push(token);
    }
    this.ghostLabel = new Konva.Label({ x: 0, y: 0, listening: false });
    this.ghostLabel.add(
      new Konva.Tag({
        fill: 'rgba(127,29,29,0.9)',
        cornerRadius: 8,
        padding: 8,
      }),
    );
    this.ghostLabelText = new Konva.Text({
      text: '',
      fontSize: 13,
      fontStyle: '800',
      fill: '#ffffff',
      padding: 7,
      lineHeight: 1.35,
    });
    this.ghostLabel.add(this.ghostLabelText);
    this.ghostLabel.visible(false);
    this.ghostGroup.add(this.ghostLabel);
  }

  private traveledPoints(track: FlowTrack, sample: TrackSample): number[] {
    const points: number[] = [];
    const segmentIndex = Math.min(
      sample.segmentIndex,
      track.keyframes.length - 2,
    );
    for (let i = 0; i <= segmentIndex; i += 1) {
      points.push(track.keyframes[i].x, track.keyframes[i].y);
    }
    points.push(sample.x, sample.y);
    return points;
  }

  private updateTracks(state: AppState): void {
    for (const runtime of this.tracks.values()) {
      const { track } = runtime;
      const visible =
        state.viewMode === 'compare' || state.viewMode === track.peak;
      runtime.group.visible(visible);
      if (!visible) continue;

      const offset = offsetForPeak(state, track.peak);
      const sample = sampleTrack(track, state.timeMin, offset);
      runtime.traveledLine.points(this.traveledPoints(track, sample));
      runtime.lead.position({ x: sample.x, y: sample.y });
      runtime.lead.radius(7.5 + Math.sin(state.timeMin * Math.PI * 2) * 0.8);

      runtime.particles.forEach(({ node, index }) => {
        const distance = sample.distanceM - (index + 1) * headwaySpacingM(track);
        if (distance < 0 || distance > track.totalDistanceM) {
          node.visible(false);
          return;
        }
        const position = this.positionAtDistance(track, distance);
        node.visible(true);
        node.position(position);
        node.opacity(Math.max(0.18, 0.86 - index * 0.035));
      });

      runtime.markers.forEach((marker, index) => {
        const active = index === sample.segmentIndex || index === sample.segmentIndex + 1;
        marker.radius(active ? 6.2 : index === 0 || index === track.keyframes.length - 1 ? 5.2 : 3.8);
      });
    }

    for (const lane of this.nestedLanes) {
      const runtime = this.tracks.get(lane.trackId);
      const visible =
        Boolean(runtime) &&
        (state.viewMode === 'compare' || state.viewMode === lane.peak);
      lane.group.visible(visible);
      if (!visible || !runtime) continue;

      const offset = offsetForPeak(state, lane.peak);
      const sample = sampleTrack(runtime.track, state.timeMin, offset);
      const span = Math.max(0.08, lane.endMin - lane.startMin);
      let base = ((sample.localTimeMin - lane.startMin) % span) / span;
      if (base < 0) base += 1;

      lane.particles.forEach((particle, index) => {
        const phase = (base + index / lane.particles.length) % 1;
        particle.x(lane.from.x + (lane.to.x - lane.from.x) * phase);
        particle.y(lane.from.y + (lane.to.y - lane.from.y) * phase);
      });
    }
  }

  private positionAtDistance(track: FlowTrack, distanceM: number): { x: number; y: number } {
    // Local import would create a cycle in the module layout; delegate through
    // the engine function attached below via a small inline interpolation.
    const target = Math.min(track.totalDistanceM, Math.max(0, distanceM));
    for (let i = 0; i < track.keyframes.length - 1; i += 1) {
      const from = track.keyframes[i];
      const to = track.keyframes[i + 1];
      if (target <= to.distanceM || i === track.keyframes.length - 2) {
        const span = Math.max(0.001, to.distanceM - from.distanceM);
        const ratio = Math.min(1, Math.max(0, (target - from.distanceM) / span));
        return {
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio,
        };
      }
    }
    return { x: track.keyframes[0].x, y: track.keyframes[0].y };
  }

  private gatePeakForDisplay(state: AppState, gateId: string): 'am' | 'pm' {
    if (state.viewMode === 'am' || state.viewMode === 'pm') return state.viewMode;
    const am = gateSnapshot(state.groups, gateId, state.timeMin, 'am');
    const pm = gateSnapshot(state.groups, gateId, state.timeMin, 'pm');
    return pm.totalPeople > am.totalPeople ? 'pm' : 'am';
  }

  private updateGates(state: AppState): void {
    for (const [gateId, runtime] of this.gateRuntimes) {
      const selected = state.selectedFacilityId === gateId;
      runtime.rect.fill(selected ? '#fdba74' : '#e2e8f0');
      runtime.rect.stroke(selected ? '#c2410c' : '#475569');
      runtime.rect.strokeWidth(selected ? 2.6 : 1.5);

      const peak = this.gatePeakForDisplay(state, gateId);
      const snapshot = gateSnapshot(state.groups, gateId, state.timeMin, peak);
      if (selected) {
        runtime.countText.text(
          `${peak === 'am' ? '早' : '晚'} ${snapshot.totalPeople}人`,
        );
        runtime.countText.fill(peak === 'am' ? '#1d4ed8' : '#c2410c');
      } else {
        runtime.countText.text('');
      }
    }

    if (!this.gatePeopleGroup) return;
    const selectedGate = FACILITIES.find(
      (facility) =>
        facility.id === state.selectedFacilityId && facility.kind === 'gate',
    );

    this.gatePeoplePool.forEach((dot) => dot.visible(false));
    if (!selectedGate) return;

    const peak = this.gatePeakForDisplay(state, selectedGate.id);
    const snapshot = gateSnapshot(
      state.groups,
      selectedGate.id,
      state.timeMin,
      peak,
    );
    const columns = 12;
    const startX = selectedGate.x - 4;
    const startY = selectedGate.y + (selectedGate.h ?? 36) + 16;
    this.gatePeoplePool.slice(0, Math.min(snapshot.totalPeople, this.gatePeoplePool.length)).forEach((dot, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      dot.visible(true);
      dot.x(startX + col * 9);
      dot.y(startY + row * 9);
      dot.fill(index < snapshot.inside ? '#2563eb' : '#dc2626');
      dot.opacity(0.92);
    });
  }

  private gateDotPosition(
    gateX: number,
    gateY: number,
    index: number,
  ): { x: number; y: number } {
    const columns = 12;
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: gateX - 4 + col * 9,
      y: gateY + 52 + row * 9,
    };
  }

  private updateGhost(state: AppState): void {
    if (!this.ghostGroup || !this.ghostLabel || !this.ghostLabelText) return;
    const signature = JSON.stringify({
      jam: state.jam,
      overlay: state.compareOverlay,
      version: state.structureVersion,
    });
    if (signature === this.lastGhostSignature) return;
    this.lastGhostSignature = signature;

    this.ghostPeoplePool.forEach((dot) => dot.visible(false));
    this.ghostTrackPool.forEach((token) => token.visible(false));
    const badge = this.querySelector<HTMLElement>('[data-role="ghost-badge"]');
    if (!state.jam || !state.compareOverlay) {
      this.ghostGroup.visible(false);
      if (badge) badge.hidden = true;
      return;
    }

    this.ghostGroup.visible(true);
    if (badge) {
      badge.hidden = false;
      badge.innerHTML = `
        <b>${state.jam.gateName} · 上一帧叠层对比</b>
        <span>上一帧 ${state.jam.previous.totalPeople} 人 → 卡顿帧 ${state.jam.jam.totalPeople} 人，差 <strong>+${state.jam.deltaPeople}</strong> 人</span>`;
    }

    const gate = FACILITIES.find((item) => item.id === state.jam?.gateId);
    if (!gate || gate.x === undefined || gate.y === undefined) return;

    const jamCount = Math.min(state.jam.jam.totalPeople, this.ghostPeoplePool.length);
    for (let i = 0; i < jamCount; i += 1) {
      const dot = this.ghostPeoplePool[i];
      dot.visible(true);
      dot.position(this.gateDotPosition(gate.x, gate.y, i));
    }

    const peak =
      state.viewMode === 'pm' ? 'pm' : state.jam.jam.arrivalPerMin > 40 ? 'am' : 'pm';
    const offset = offsetForPeak(state, peak);
    const affectedTracks = state.groups[peak].tracks.filter((track) =>
      track.segments.some((segment) => segment.facilityId === state.jam?.gateId),
    );
    affectedTracks.slice(0, this.ghostTrackPool.length).forEach((track, index) => {
      const sample = sampleTrack(track, state.jam?.recordedAtMin ?? state.timeMin, offset);
      const token = this.ghostTrackPool[index];
      token.visible(true);
      token.position({ x: sample.x, y: sample.y });
    });

    this.ghostLabelText.text(
      `卡顿帧 ${state.jam.recordedAtMin.toFixed(1)}′：${state.jam.jam.totalPeople}人\n上一帧 ${state.jam.compareAtMin.toFixed(1)}′：${state.jam.previous.totalPeople}人  差 +${state.jam.deltaPeople}人`,
    );
    this.ghostLabel.x(gate.x - 72);
    this.ghostLabel.y(gate.y - 82);
  }

  private update(): void {
    if (!this.stage) return;
    const state = store.state;
    this.updateTracks(state);
    this.updateGates(state);
    this.updateGhost(state);
    this.layer?.batchDraw();
  }

  /** Used by the inspector's nesting self-check. */
  verifyNestedAlignment(): { driftPx: number; driftM: number; groupId: string } {
    if (!this.passageGroup || !this.root || this.nestedLanes.length === 0) {
      return { driftPx: 0, driftM: 0, groupId: NESTED_PASSAGE.id };
    }
    const lane = this.nestedLanes[0];
    const particle = lane.particles[0];
    const localPoint = { x: particle.x(), y: particle.y() };
    const viaParent = this.passageGroup.getAbsoluteTransform().point(localPoint);
    const viaRoot = this.root.getAbsoluteTransform().point({
      x: NESTED_PASSAGE.x + localPoint.x,
      y: NESTED_PASSAGE.y + localPoint.y,
    });
    const driftPx = Math.hypot(viaParent.x - viaRoot.x, viaParent.y - viaRoot.y);
    const fitScale = this.root.scaleX() || 1;
    const driftVirtualPx = driftPx / fitScale;
    return {
      driftPx: Number(driftPx.toFixed(4)),
      driftM: Number((driftVirtualPx / PX_PER_M).toFixed(3)),
      groupId: NESTED_PASSAGE.id,
    };
  }

  captureCanvas(): HTMLCanvasElement | null {
    return this.host?.querySelector('canvas') ?? null;
  }

  exportPng(): void {
    if (!this.stage) return;
    const dataUrl = this.stage.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `换乘流线走查-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    link.click();
  }
}

customElements.define('plan-canvas', PlanCanvas);
