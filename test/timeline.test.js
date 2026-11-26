import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, stateAt, HOLD_MS, DEFAULT_TRANSITION_MS } from '../src/lib/timeline.js';

function makeProject(groups) {
  const periods = [1, 2, 3, 4].map((n) => ({
    id: `p${n}`,
    name: `第${n}期`,
    date: `2025-0${n}-01`,
    key: {
      view: { x: n * 10, y: 0, w: 100, h: 100 },
      scale: { thresholds: [0.2, 0.4, 0.6, 0.8] }
    }
  }));
  return {
    reef: { width: 1000, height: 700 },
    periods,
    groups: groups || [
      { id: 'g1', periodIds: ['p1', 'p2'], transitionMs: 1000 },
      { id: 'g2', periodIds: ['p2', 'p3'], transitionMs: 1000 },
      { id: 'g3', periodIds: ['p3', 'p4'], transitionMs: 500 }
    ]
  };
}

test('每期停留 2 秒，过渡时长取自轨道组', () => {
  const tl = buildTimeline(makeProject());
  assert.equal(tl.entries[0].start, 0);
  assert.equal(tl.entries[0].holdEnd, HOLD_MS);
  assert.equal(tl.transitions[0].duration, 1000);
  assert.equal(tl.transitions[0].start, HOLD_MS);
  assert.equal(tl.transitions[0].end, HOLD_MS + 1000);
  assert.equal(tl.transitions[2].duration, 500);
  // total = 4*2000 + 1000+1000+500
  assert.equal(tl.total, 8000 + 2500);
});

test('无共同组的相邻期使用默认过渡时长', () => {
  const p = makeProject([{ id: 'g1', periodIds: ['p1', 'p2'], transitionMs: 900 }]);
  const tl = buildTimeline(p);
  assert.equal(tl.transitions[0].duration, 900);
  assert.equal(tl.transitions[1].duration, DEFAULT_TRANSITION_MS);
});

test('停留段查询返回该期关键帧', () => {
  const p = makeProject();
  const tl = buildTimeline(p);
  const s = stateAt(p, tl, 500);
  assert.equal(s.mode, 'hold');
  assert.equal(s.periodIndex, 0);
  assert.deepEqual(s.view, p.periods[0].key.view);
  assert.deepEqual(s.scale.thresholds, p.periods[0].key.scale.thresholds);
});

test('过渡段在两期关键帧之间插值，端点精确收敛', () => {
  const p = makeProject();
  const tl = buildTimeline(p);
  const tr = tl.transitions[0]; // 2000 → 3000
  const s0 = stateAt(p, tl, tr.start);
  assert.equal(s0.mode, 'transition');
  assert.equal(s0.view.x, p.periods[0].key.view.x);
  assert.equal(s0.fromAlpha, 1);

  const sEnd = stateAt(p, tl, tr.end - 0.01);
  assert.ok(Math.abs(sEnd.view.x - p.periods[1].key.view.x) < 0.01);
  assert.ok(sEnd.toAlpha > 0.99);

  const mid = stateAt(p, tl, (tr.start + tr.end) / 2);
  // easeInOut 中点 progress = 0.5
  assert.ok(Math.abs(mid.progress - 0.5) < 1e-9);
  assert.ok(Math.abs(mid.view.x - (10 + 20) / 2) < 1e-9);
});

test('越界时间钳制到首/末帧', () => {
  const p = makeProject();
  const tl = buildTimeline(p);
  assert.equal(stateAt(p, tl, -999).periodIndex, 0);
  assert.equal(stateAt(p, tl, tl.total + 999).periodIndex, 3);
});

test('拉长第三→四期组时长后，后续关键帧整体后挪、刻度重排', () => {
  const project = makeProject();
  const before = buildTimeline(project);
  const p3Start = before.entries[2].start;
  const p4Start = before.entries[3].start;

  project.groups.find((g) => g.id === 'g3').transitionMs = 500; // 原值
  const baseline = buildTimeline(project);
  project.groups.find((g) => g.id === 'g3').transitionMs = 1500; // 拉长 1000ms
  const after = buildTimeline(project);

  // 第三期及之前不受影响
  assert.equal(after.entries[2].start, p3Start);
  // 第四期整体后挪 1000ms
  assert.equal(after.entries[3].start, p4Start + 1000);
  assert.equal(after.total, baseline.total + 1000);
});
