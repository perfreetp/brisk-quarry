// 时间轴布局与状态查询（纯函数，预览与回放共用同一套，保证结果一致）

export const HOLD_MS = 2000; // 每期停留 2 秒
export const DEFAULT_TRANSITION_MS = 1200;

/**
 * 计算每期在时间轴上的起点/停留区间，以及相邻期间的过渡段。
 * 相邻期之间的过渡时长由包含这两期的「轨道组」决定（组上设过渡时长）。
 *
 * 返回:
 * {
 *   total,
 *   entries: [{ periodIndex, start, holdEnd, end, key, period }],
 *   transitions: [{ from, to, start, end, duration, fromKey, toKey, groupId }],
 * }
 */
export function buildTimeline(project) {
  const periods = project.periods;
  const entries = [];
  const transitions = [];
  let cursor = 0;

  for (let i = 0; i < periods.length; i++) {
    const start = cursor;
    const holdEnd = start + HOLD_MS;
    const end = holdEnd; // 该期停留段结束；过渡段从 end 开始
    entries.push({ periodIndex: i, start, holdEnd, end, key: periods[i].key, period: periods[i] });

    if (i < periods.length - 1) {
      const duration = transitionDurationFor(project, periods[i].id, periods[i + 1].id);
      transitions.push({
        from: i,
        to: i + 1,
        start: holdEnd,
        end: holdEnd + duration,
        duration,
        fromKey: periods[i].key,
        toKey: periods[i + 1].key,
        groupId: groupIdForPair(project, periods[i].id, periods[i + 1].id)
      });
      cursor = holdEnd + duration;
    } else {
      cursor = holdEnd;
    }
  }

  return { total: cursor, entries, transitions };
}

/** 找到包含某期的组（按期 id 匹配，取第一个命中的组） */
export function groupOfPeriod(project, periodId) {
  return project.groups.find((g) => g.periodIds.includes(periodId)) || null;
}

/** 相邻两期共同所属的组 id；没有共同组则为 null（使用默认过渡时长） */
export function groupIdForPair(project, fromId, toId) {
  const g = project.groups.find((gp) => gp.periodIds.includes(fromId) && gp.periodIds.includes(toId));
  return g ? g.id : null;
}

/** 某对相邻期之间的过渡时长：共同组上的设置优先，否则用默认值 */
export function transitionDurationFor(project, fromId, toId) {
  const g = project.groups.find((gp) => gp.periodIds.includes(fromId) && gp.periodIds.includes(toId));
  return g ? g.transitionMs : DEFAULT_TRANSITION_MS;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function lerpView(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t)
  };
}

function lerpScale(a, b, t) {
  // 色标档位（白化分级阈值）逐档插值，分档数量保持一致
  const len = Math.max(a.thresholds.length, b.thresholds.length);
  const thresholds = [];
  for (let i = 0; i < len; i++) {
    const av = a.thresholds[i] ?? a.thresholds[a.thresholds.length - 1];
    const bv = b.thresholds[i] ?? b.thresholds[b.thresholds.length - 1];
    thresholds.push(lerp(av, bv, t));
  }
  return { thresholds };
}

/**
 * 查询时间 t 的画面状态。预览拖动与正式播放都调用本函数 → 两者结果天然一致。
 * 返回 { mode:'hold'|'transition', periodIndex, nextIndex, progress, view, scale, fromAlpha, toAlpha, entry, transition }
 */
export function stateAt(project, timeline, t) {
  const time = Math.max(0, Math.min(t, timeline.total));
  const trans = timeline.transitions.find((tr) => time >= tr.start && time < tr.end);

  if (trans) {
    const p = easeInOut(clamp01((time - trans.start) / trans.duration));
    return {
      mode: 'transition',
      periodIndex: trans.from,
      nextIndex: trans.to,
      progress: p,
      view: lerpView(trans.fromKey.view, trans.toKey.view, p),
      scale: lerpScale(trans.fromKey.scale, trans.toKey.scale, p),
      fromAlpha: 1 - p,
      toAlpha: p,
      entry: timeline.entries[trans.from],
      transition: trans
    };
  }

  // 停留段（含最后一期结束点）
  let idx = timeline.entries.findIndex((e) => time >= e.start && time < e.end);
  if (idx === -1) idx = timeline.entries.length - 1;
  const entry = timeline.entries[idx];
  return {
    mode: 'hold',
    periodIndex: idx,
    nextIndex: idx,
    progress: 0,
    view: entry.key.view,
    scale: entry.key.scale,
    fromAlpha: 1,
    toAlpha: 0,
    entry,
    transition: null
  };
}

/** 时间轴刻度：按固定间隔生成，刻度随总时长重排 */
export function buildTicks(timeline, intervalMs = 1000) {
  const ticks = [];
  for (let t = 0; t <= timeline.total + 0.5; t += intervalMs) {
    ticks.push({ time: Math.round(t), label: `${(t / 1000).toFixed(0)}s` });
  }
  return ticks;
}

export function formatMs(ms) {
  const s = ms / 1000;
  return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`;
}
