import test from 'node:test';
import assert from 'node:assert/strict';
import { solvePoster, rectsOverlap } from '../src/layout.js';
import { normalizeProject, state } from '../src/store.js';

const measured = {
  table: { w: 196, h: 132 },
  legend: { w: 150, h: 250 },
};

function collectRects(solution) {
  return {
    table: solution.tableRect,
    legend: solution.legendRect,
    maps: Object.values(solution.mapRects),
  };
}

test('A1 and A3 layouts never let maps, table and legend overlap', () => {
  const positions = [
    [null, null],
    [0, 0],
    [0.5, 0.5],
    [1, 1],
    [0.15, 0.85],
    [0.85, 0.2],
  ];
  for (const preset of ['A1L', 'A3P']) {
    for (const [tableNX, tableNY] of positions) {
      const project = {
        ...state.project,
        layout: { ...state.project.layout, preset, tableNX, tableNY },
      };
      const size = preset === 'A1L'
        ? measured
        : { table: { w: 88, h: 92 }, legend: { w: 84, h: 190 } };
      const solution = solvePoster(project, size);
      const rects = collectRects(solution);

      assert.equal(rects.maps.length, 3);
      assert.equal(rects.maps.some((r) => r.w <= 40 || r.h <= 30), false);
      assert.equal(rectsOverlap(rects.table, rects.legend, 1), false, `${preset} legend/table overlap`);
      rects.maps.forEach((map, index) => {
        assert.equal(rectsOverlap(map, rects.table, 1), false, `${preset} map ${index}/table overlaps at ${tableNX},${tableNY}`);
        assert.equal(rectsOverlap(map, rects.legend, 1), false, `${preset} map ${index}/legend overlaps at ${tableNX},${tableNY}`);
        rects.maps.forEach((other, otherIndex) => {
          if (index !== otherIndex) {
            assert.equal(rectsOverlap(map, other, 1), false, `${preset} maps ${index}/${otherIndex} overlap`);
          }
        });
      });
    }
  }
});

test('editable draft JSON round-trip keeps three-layer structures', () => {
  const payload = JSON.parse(JSON.stringify({ app: 'aquafarm-layout-studio', project: state.project }));
  const restored = normalizeProject(payload.project);
  assert.equal(restored.ponds.length, state.project.ponds.length);
  assert.equal(restored.cages.length, 12);
  assert.equal(restored.aerators.length, state.project.aerators.length);
  assert.ok(restored.pipes[0].points.length >= 2);
  assert.ok(restored.feedRoute.points.length >= 4);
  assert.equal(restored.feedPoints.length, state.project.feedPoints.length);
});
