// 全局应用状态（Svelte 5 runes）。编辑操作全部委托 project.js 的纯 reducer，
// 时间轴（timeline）与播放状态（playState）由数据派生，预览/回放共用同一查询函数。

import { buildTimeline, stateAt } from './timeline.js';
import * as R from './project.js';
import { buildDemoProject } from './demo-data.js';

const initial = buildDemoProject();

let project = $state(initial);
let selectedPeriodId = $state(initial.periods[0].id);
let currentTime = $state(0);
let isPlaying = $state(false);
let tool = $state(null); // null | 'annotate' | 'zoom'
let lens = $state(null); // { kind:'annotation', periodId, annotationId } | { kind:'region', view } | null
let propagateScale = $state(true); // 调色标档位时是否后传对齐
let draftPoints = $state([]); // 圈选过程中的临时多边形点（礁区坐标）

let rafHandle = null;
let lastTs = 0;

const timeline = $derived(buildTimeline(project));
const playState = $derived(stateAt(project, timeline, currentTime));
const periods = $derived(project.periods);
const selectedPeriod = $derived(project.periods.find((p) => p.id === selectedPeriodId) || project.periods[0]);
const selectedEntry = $derived(timeline.entries.find((e) => e.period.id === selectedPeriodId));

function tick(ts) {
  if (!isPlaying) return;
  if (!lastTs) lastTs = ts;
  const dt = Math.min(100, ts - lastTs);
  lastTs = ts;
  let t = currentTime + dt;
  if (t >= timeline.total) {
    t = timeline.total;
    currentTime = t;
    isPlaying = false;
    rafHandle = null;
    return;
  }
  currentTime = t;
  rafHandle = requestAnimationFrame(tick);
}

export function useStore() {
  return {
    // ---- 派生读取 ----
    get project() { return project; },
    get reef() { return project.reef; },
    get periods() { return periods; },
    get groups() { return project.groups; },
    get timeline() { return timeline; },
    get playState() { return playState; },
    get currentTime() { return currentTime; },
    get isPlaying() { return isPlaying; },
    get selectedPeriodId() { return selectedPeriodId; },
    get selectedPeriod() { return selectedPeriod; },
    get selectedEntry() { return selectedEntry; },
    get tool() { return tool; },
    get lens() { return lens; },
    get propagateScale() { return propagateScale; },
    get draftPoints() { return draftPoints; },

    // ---- 播放控制 ----
    play() {
      if (currentTime >= timeline.total) currentTime = 0;
      if (isPlaying) return;
      isPlaying = true;
      lastTs = 0;
      rafHandle = requestAnimationFrame(tick);
    },
    pause() {
      isPlaying = false;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      rafHandle = null;
    },
    togglePlay() {
      isPlaying ? this.pause() : this.play();
    },
    seek(t) {
      currentTime = Math.max(0, Math.min(timeline.total, t));
    },
    seekPeriod(periodId) {
      const entry = timeline.entries.find((e) => e.period.id === periodId);
      if (entry) {
        this.pause();
        currentTime = entry.start;
        selectedPeriodId = periodId;
      }
    },

    // ---- 关键帧编辑 ----
    updateView(periodId, view) {
      project = R.setView(project, periodId, view);
    },
    nudgeView(periodId, dx, dy) {
      const p = project.periods.find((x) => x.id === periodId);
      if (!p) return;
      const v = p.key.view;
      this.updateView(periodId, { x: v.x + dx, y: v.y + dy });
    },
    zoomViewAt(periodId, factor, center) {
      const p = project.periods.find((x) => x.id === periodId);
      if (!p) return;
      const v = p.key.view;
      const nw = Math.max(80, v.w / factor);
      const nh = Math.max(80, v.h / factor);
      const cx = center ? center[0] : v.x + v.w / 2;
      const cy = center ? center[1] : v.y + v.h / 2;
      const rx = (cx - v.x) / v.w;
      const ry = (cy - v.y) / v.h;
      this.updateView(periodId, {
        w: nw,
        h: nh,
        x: cx - nw * rx,
        y: cy - nh * ry
      });
    },
    setThresholdAt(periodId, levelIndex, value) {
      project = R.setThresholdAt(project, periodId, levelIndex, value, propagateScale);
    },
    setThresholds(periodId, thresholds) {
      project = R.setThresholds(project, periodId, thresholds, propagateScale);
    },
    togglePropagate() { propagateScale = !propagateScale; },

    /** 每期调完后在轨道上落一个关键帧 */
    commitKeyframe(periodId) {
      project = R.commitKeyframe(project, periodId, new Date().toISOString().slice(16));
    },
    resetDemo() {
      project = buildDemoProject();
      selectedPeriodId = project.periods[0].id;
      currentTime = 0;
      isPlaying = false;
      lens = null;
      tool = null;
      draftPoints = [];
    },

    // ---- 轨道组 ----
    setGroupTransitionMs(groupId, ms) {
      project = R.setGroupTransitionMs(project, groupId, ms);
    },

    // ---- 选择 / 工具 ----
    selectPeriod(periodId) {
      selectedPeriodId = periodId;
      const entry = timeline.entries.find((e) => e.period.id === periodId);
      if (entry && !isPlaying) currentTime = entry.start;
    },
    setTool(t) {
      tool = t;
      draftPoints = [];
      if (t) this.pause();
    },
    addDraftPoint(pt) {
      if (tool !== 'annotate') return;
      draftPoints = [...draftPoints, pt];
    },
    undoDraftPoint() {
      draftPoints = draftPoints.slice(0, -1);
    },
    cancelDraft() {
      draftPoints = [];
      tool = null;
    },
    commitDraft(label = '白化扩大区') {
      if (draftPoints.length < 3) return;
      project = R.addAnnotation(project, selectedPeriodId, {
        id: `ann-${selectedPeriodId}-${(selectedPeriod.annotations || []).length + 1}`,
        label,
        points: draftPoints,
        createdAt: new Date().toISOString().slice(0, 10)
      });
      const anns = project.periods.find((p) => p.id === selectedPeriodId).annotations;
      const ann = anns[anns.length - 1];
      draftPoints = [];
      tool = null;
      this.focusAnnotation(selectedPeriodId, ann.id);
    },
    removeAnnotation(periodId, annotationId) {
      if (lens && lens.kind === 'annotation' && lens.annotationId === annotationId) lens = null;
      project = R.removeAnnotation(project, periodId, annotationId);
    },

    // ---- 放大镜头（暂停讲解）----
    focusAnnotation(periodId, annotationId) {
      this.pause();
      lens = { kind: 'annotation', periodId, annotationId };
      selectedPeriodId = periodId;
      const entry = timeline.entries.find((e) => e.period.id === periodId);
      if (entry) currentTime = entry.start;
    },
    zoomToRegion(view) {
      this.pause();
      lens = { kind: 'region', view };
    },
    exitLens() { lens = null; },

    // ---- 导入新期 ----
    importPeriod(incoming) {
      project = R.addPeriod(project, incoming);
      selectedPeriodId = project.periods[project.periods.length - 1].id;
    }
  };
}
