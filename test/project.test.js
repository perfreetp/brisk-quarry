import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setView,
  setThresholds,
  setThresholdAt,
  setGroupTransitionMs,
  addAnnotation,
  removeAnnotation,
  addPeriod,
  parsePatchGeoJSON
} from '../src/lib/project.js';

function makeProject() {
  return {
    reef: { width: 1000, height: 700 },
    periods: [1, 2, 3].map((n) => ({
      id: `p${n}`,
      name: `第${n}期`,
      date: `2025-0${n}-01`,
      ortho: 'img',
      patches: [],
      key: { view: { x: 0, y: 0, w: 100, h: 100 }, scale: { thresholds: [0.2, 0.4, 0.6, 0.8] } }
    })),
    groups: [
      { id: 'g1', periodIds: ['p1', 'p2'], transitionMs: 1000 },
      { id: 'g2', periodIds: ['p2', 'p3'], transitionMs: 1000 }
    ]
  };
}

test('setView 只改目标期显示范围且不突变原对象', () => {
  const p = makeProject();
  const next = setView(p, 'p2', { x: 50, w: 300 });
  assert.deepEqual(next.periods[1].key.view, { x: 50, y: 0, w: 300, h: 100 });
  assert.equal(p.periods[1].key.view.x, 0); // 原项目不变
});

test('调色标档位后，本期及之后的关键帧按新色标重新对齐', () => {
  const p = makeProject();
  const next = setThresholds(p, 'p2', [0.1, 0.3, 0.5, 0.7], true);
  assert.deepEqual(next.periods[0].key.scale.thresholds, [0.2, 0.4, 0.6, 0.8]); // 之前不动
  assert.deepEqual(next.periods[1].key.scale.thresholds, [0.1, 0.3, 0.5, 0.7]);
  assert.deepEqual(next.periods[2].key.scale.thresholds, [0.1, 0.3, 0.5, 0.7]); // 后续对齐
});

test('propagate=false 时只改本期', () => {
  const p = makeProject();
  const next = setThresholds(p, 'p2', [0.1, 0.3, 0.5, 0.7], false);
  assert.deepEqual(next.periods[2].key.scale.thresholds, [0.2, 0.4, 0.6, 0.8]);
});

test('setThresholdAt 保持阈值单调递增', () => {
  const p = makeProject();
  const next = setThresholdAt(p, 'p1', 2, 0.05, false);
  const t = next.periods[0].key.scale.thresholds;
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
});

test('setGroupTransitionMs 带下限保护', () => {
  const p = makeProject();
  const next = setGroupTransitionMs(p, 'g1', 50);
  assert.equal(next.groups[0].transitionMs, 100);
});

test('标注可增删，且不影响其他期', () => {
  const p = makeProject();
  const added = addAnnotation(p, 'p2', { label: '白化扩大区', points: [[0, 0], [1, 0], [1, 1]] });
  assert.equal(added.periods[1].annotations.length, 1);
  const removed = removeAnnotation(added, 'p2', added.periods[1].annotations[0].id);
  assert.equal(removed.periods[1].annotations.length, 0);
});

test('addPeriod 按监测日期插入并为相邻关系补默认组', () => {
  const p = makeProject();
  const next = addPeriod(p, { id: 'p4', name: '第四期', date: '2024-12-01', ortho: 'x' });
  assert.deepEqual(next.periods.map((x) => x.id), ['p4', 'p1', 'p2', 'p3']);
  // 新相邻对 p4-p1 自动建组，原有组不重复
  const pairGroup = next.groups.find((g) => g.periodIds.includes('p4') && g.periodIds.includes('p1'));
  assert.ok(pairGroup);
  assert.equal(next.groups.filter((g) => g.periodIds.join() === 'p1,p2').length, 1);
});

test('parsePatchGeoJSON 解析多边形与 bleaching 属性', () => {
  const geo = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
        properties: { id: 'a', bleaching: 0.72 }
      }
    ]
  };
  const patches = parsePatchGeoJSON(geo);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].id, 'a');
  assert.equal(patches[0].bleaching, 0.72);
  assert.equal(patches[0].points.length, 4); // 闭合环的首点重复被去掉
});
