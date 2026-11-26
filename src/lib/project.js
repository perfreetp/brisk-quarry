// 项目数据的纯函数 reducer：所有编辑都返回新项目对象，stores 层只做薄封装。
// 不依赖 DOM / Svelte，可在 Node 下直接单测。

import { DEFAULT_THRESHOLDS } from './demo-data.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

export function setView(project, periodId, view) {
  const next = clone(project);
  const p = next.periods.find((x) => x.id === periodId);
  if (!p) return project;
  p.key.view = { ...p.key.view, ...view };
  return next;
}

/**
 * 调整某一期色标档位。
 * propagate=true（默认）：这一期之后的关键帧按新色标重新对齐（阈值整体后传）。
 */
export function setThresholds(project, periodId, thresholds, propagate = true) {
  const next = clone(project);
  const idx = next.periods.findIndex((x) => x.id === periodId);
  if (idx === -1) return project;
  const clean = [...thresholds].map((v) => Math.round(v * 1000) / 1000);
  next.periods[idx].key.scale.thresholds = clean;
  if (propagate) {
    for (let i = idx + 1; i < next.periods.length; i++) {
      next.periods[i].key.scale.thresholds = [...clean];
    }
  }
  return next;
}

/** 修改单个阈值档（其余档保持），可选后传 */
export function setThresholdAt(project, periodId, levelIndex, value, propagate = true) {
  const p = project.periods.find((x) => x.id === periodId);
  if (!p) return project;
  const thresholds = [...p.key.scale.thresholds];
  thresholds[levelIndex] = value;
  // 保持阈值单调递增
  for (let i = 1; i < thresholds.length; i++) {
    if (thresholds[i] <= thresholds[i - 1]) thresholds[i] = thresholds[i - 1] + 0.01;
  }
  return setThresholds(project, periodId, thresholds, propagate);
}

/**
 * 改组过渡时长。时间轴是派生数据：下一次 buildTimeline 时，
 * 该组之后的关键帧（停留段）整体后挪，刻度自动重排。
 */
export function setGroupTransitionMs(project, groupId, ms) {
  const next = clone(project);
  const g = next.groups.find((x) => x.id === groupId);
  if (!g) return project;
  g.transitionMs = Math.max(100, Math.round(ms));
  return next;
}

/**
 * 落关键帧：确认本期已调好的显示范围 + 色标档位，记录落帧时间（轨道上菱形变为实心）。
 */
export function commitKeyframe(project, periodId, at) {
  const next = clone(project);
  const p = next.periods.find((x) => x.id === periodId);
  if (!p) return project;
  p.key.committedAt = at || new Date().toISOString().slice(16);
  return next;
}

export function addAnnotation(project, periodId, annotation) {
  const next = clone(project);
  const p = next.periods.find((x) => x.id === periodId);
  if (!p) return project;
  if (!p.annotations) p.annotations = [];
  p.annotations.push({
    id: annotation.id || `ann-${p.annotations.length + 1}-${periodId}`,
    label: annotation.label || '白化扩大区',
    points: clone(annotation.points),
    createdAt: annotation.createdAt || null
  });
  return next;
}

export function removeAnnotation(project, periodId, annotationId) {
  const next = clone(project);
  const p = next.periods.find((x) => x.id === periodId);
  if (!p) return project;
  p.annotations = (p.annotations || []).filter((a) => a.id !== annotationId);
  return next;
}

/**
 * 导入新一期（正射图 dataURL + 白化斑块），按监测日期插入序列，
 * 并与相邻期补建默认轨道组。
 */
export function addPeriod(project, incoming) {
  const next = clone(project);
  const id = incoming.id || `p${Date.now()}`;
  const period = {
    id,
    name: incoming.name,
    date: incoming.date,
    ortho: incoming.ortho,
    patches: incoming.patches || [],
    annotations: incoming.annotations || [],
    key: {
      view: incoming.view || { x: 0, y: 0, w: next.reef.width, h: next.reef.height },
      scale: { thresholds: incoming.thresholds || [...DEFAULT_THRESHOLDS] }
    }
  };
  next.periods.push(period);
  next.periods.sort((a, b) => a.date.localeCompare(b.date));

  // 为新产生的相邻关系补默认组（不覆盖已有组）
  for (let i = 0; i < next.periods.length - 1; i++) {
    const a = next.periods[i].id;
    const b = next.periods[i + 1].id;
    const exists = next.groups.some((g) => g.periodIds.includes(a) && g.periodIds.includes(b));
    if (!exists) {
      next.groups.push({
        id: `g-${a}-${b}`,
        name: `组（${next.periods[i].name}→${next.periods[i + 1].name}）`,
        periodIds: [a, b],
        transitionMs: 1200
      });
    }
  }
  return next;
}

/** 解析 GeoJSON FeatureCollection（多边形 + bleaching 属性）为内部 patches 结构 */
export function parsePatchGeoJSON(geoJson) {
  const fc = typeof geoJson === 'string' ? JSON.parse(geoJson) : geoJson;
  const patches = [];
  let n = 0;
  for (const feature of fc.features || []) {
    const geom = feature.geom || feature.geometry;
    if (!geom || geom.type !== 'Polygon') continue;
    const ring = geom.coordinates[0] || [];
    const points = ring.slice(0, -1).map(([x, y]) => [Number(x), Number(y)]);
    const props = feature.properties || {};
    patches.push({
      id: props.id || `imp-patch-${n++}`,
      points,
      bleaching: Number(props.bleaching ?? props.value ?? 0)
    });
  }
  return patches;
}
