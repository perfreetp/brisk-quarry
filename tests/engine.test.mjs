// 引擎逻辑测试：node 运行（经 esbuild 打包以支持无扩展名导入）
import assert from 'node:assert';
import { generateLayout, findNearestValid, overlaps, respectsGap, centerLineGap, corridorRect, inBounds, hitsCorridor, makeRect } from '../src/lib/layout.js';
import { OBJ_TYPES, TYPE_ORDER, CORRIDOR_BUFFER } from '../src/lib/types.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const baseParams = {
  width: 60,
  depth: 40,
  corridorDir: 'x',
  corridorWidth: 4,
  tiers: { tent: 3, assembly: 2, supply: 2, post: 3 },
  seed: '2026',
};

function rectsOf(objects, params) {
  return objects
    .filter((o) => !o.unplaced)
    .map((o) => {
      const m = o.manual;
      const a = o.auto;
      const meta = OBJ_TYPES[o.type];
      const x = m ? m.x : a.x;
      const z = m ? m.z : a.z;
      const rot = m ? m.rot : a.rot;
      const w = m?.size?.w ?? meta.w;
      const d = m?.size?.d ?? meta.d;
      return { uid: o.uid, type: o.type, rect: makeRect(x, z, w, d, rot) };
    });
}

function assertLayoutLegal(objects, params) {
  const items = rectsOf(objects, params);
  for (const it of items) {
    assert.ok(inBounds(it.rect, params, 0.2), `${it.uid} 超出场地边界`);
    assert.ok(!hitsCorridor(it.rect, params, CORRIDOR_BUFFER - 0.01), `${it.uid} 压到主通道`);
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const gap = items[i].type === items[j].type ? OBJ_TYPES[items[i].type].spacing : 1;
      assert.ok(respectsGap(items[i].rect, items[j].rect, gap), `${items[i].uid} 与 ${items[j].uid} 中心连线净距不足 ${gap}m（实测 ${centerLineGap(items[i].rect, items[j].rect).toFixed(2)}m）`);
    }
  }
}

test('同一种子同一参数生成完全相同的布局', () => {
  const a = generateLayout(baseParams, '2026');
  const b = generateLayout(baseParams, '2026');
  assert.deepStrictEqual(
    a.map((o) => [o.uid, o.auto?.x, o.auto?.z, o.auto?.rot]),
    b.map((o) => [o.uid, o.auto?.x, o.auto?.z, o.auto?.rot])
  );
});

test('不同种子产生不同布局', () => {
  const a = generateLayout(baseParams, 'seed-A');
  const b = generateLayout(baseParams, 'seed-B');
  const key = (list) => JSON.stringify(list.map((o) => [o.auto?.x, o.auto?.z]));
  assert.notStrictEqual(key(a), key(b));
});

test('所有自动物件满足边界、通道净距与同类间距规则', () => {
  for (const dir of ['x', 'z']) {
    for (const cw of [3, 6]) {
      assertLayoutLegal(generateLayout({ ...baseParams, corridorDir: dir, corridorWidth: cw }, 's1'), {
        ...baseParams,
        corridorDir: dir,
        corridorWidth: cw,
      });
    }
  }
});

test('五档数量与类型定义一致且全部可布下', () => {
  const p = { ...baseParams, tiers: { tent: 5, assembly: 5, supply: 5, post: 5 } };
  const out = generateLayout(p, 'big');
  const expected = TYPE_ORDER.reduce((n, t) => n + OBJ_TYPES[t].tierCounts[5], 0);
  assert.strictEqual(out.length, expected);
  assert.strictEqual(out.filter((o) => o.unplaced).length, 0);
  assertLayoutLegal(out, p);
});

test('关闭档位（0）时该类型不出现', () => {
  const p = { ...baseParams, tiers: { tent: 0, assembly: 0, supply: 0, post: 1 } };
  const out = generateLayout(p, 's2');
  assert.ok(out.every((o) => o.type === 'post'));
});

test('手动调整过的物件在重新生成时保留原位并作为障碍', () => {
  const first = generateLayout(baseParams, '2026');
  const moved = first.find((o) => o.type === 'tent');
  const preserved = [
    {
      uid: moved.uid,
      type: moved.type,
      x: moved.auto.x + 5,
      z: moved.auto.z + 3,
      rot: Math.PI / 2,
      effW: OBJ_TYPES.tent.w,
      effD: OBJ_TYPES.tent.d,
      manual: {},
    },
  ];
  const next = generateLayout({ ...baseParams, corridorWidth: 6 }, '2026', preserved);
  const kept = next.find((o) => o.uid === moved.uid);
  assert.ok(kept.manual, '保留物件仍带手动标记');
  assert.strictEqual(kept.manual.x, moved.auto.x + 5);
  assert.strictEqual(kept.manual.z, moved.auto.z + 3);
  assertLayoutLegal(next, { ...baseParams, corridorWidth: 6 });
});

test('拖到通道中心会弹回最近的合法空位', () => {
  const out = generateLayout(baseParams, '2026');
  const items = rectsOf(out, baseParams);
  const victim = items[0];
  const others = items.filter((i) => i.uid !== victim.uid);
  const corridorCenter = baseParams.corridorDir === 'x' ? { x: victim.rect.x + 2, z: 0 } : { x: 0, z: victim.rect.z + 2 };
  const landed = findNearestValid(corridorCenter, victim.type, victim.rect.w, victim.rect.d, victim.rect.rot, baseParams, others);
  assert.ok(landed, '必须能找到弹回空位');
  const landedRect = makeRect(landed.x, landed.z, victim.rect.w, victim.rect.d, victim.rect.rot);
  assert.ok(!hitsCorridor(landedRect, baseParams, 0.3), '弹回点不得在通道内');
  assert.ok(inBounds(landedRect, baseParams, 0.3), '弹回点不得越界');
  for (const o of others) {
    const gap = o.type === victim.type ? OBJ_TYPES[victim.type].spacing : 1;
    assert.ok(respectsGap(landedRect, o.rect, gap), '弹回点不得与其它物件冲突');
  }
  // 弹回点应比远处点更近
  const far = { x: baseParams.width / 2 - 4, z: baseParams.depth / 2 - 4 };
  assert.ok(
    Math.hypot(landed.x - corridorCenter.x, landed.z - corridorCenter.z) <
      Math.hypot(far.x - corridorCenter.x, far.z - corridorCenter.z)
  );
});

test('通道改向后落在新通道里的手动物件会被就近挪出', () => {
  const first = generateLayout(baseParams, '2026');
  const target = first.find((o) => o.type === 'supply');
  const switched = { ...baseParams, corridorDir: 'z' };
  // 把物件强制放到新通道（南北向）中心
  const preserved = [
    { uid: target.uid, type: target.type, x: 0, z: target.auto.z, rot: 0, effW: OBJ_TYPES.supply.w, effD: OBJ_TYPES.supply.d, manual: {} },
  ];
  const out = generateLayout(switched, '2026', preserved);
  const kept = out.find((o) => o.uid === target.uid);
  assert.ok(!hitsCorridor(makeRect(kept.manual.x, kept.manual.z, OBJ_TYPES.supply.w, OBJ_TYPES.supply.d, kept.manual.rot), switched, 0.3));
  assertLayoutLegal(out, switched);
});

test('旋转 90° 改变占地包围盒并参与碰撞判定', () => {
  const r1 = makeRect(0, 0, 6, 2, 0);
  const r2 = makeRect(3.5, 0, 2, 2, 0);
  assert.ok(overlaps(r1, r2, 0), '两个矩形应重叠');
  const r3 = makeRect(0, 5, 6, 2, Math.PI / 2);
  assert.ok(!overlaps(makeRect(0, 0, 6, 2, 0), r3, 0.9), '旋转后垂直排布应满足间距');
});

test('中心连线净距口径：斜向布置时仍满足同类间距', () => {
  // 两个 4x4 帐篷沿 45° 方向；单矩形在该方向支撑半宽 = 2√2+2√2 = 4√2
  // 边缘净距 3m 时中心距 = 4√2 + 3 + 4√2 = 8√2 + 3
  // 4x4 矩形沿 45° 的支撑半宽 = 2√2，两个合计 4√2；留 3m 净距时中心距 = 4√2 + 3
  const d = 4 * Math.SQRT2 + 3;
  const a = makeRect(0, 0, 4, 4, 0);
  // 45° 方向、中心距恰为 d：每轴分量 = d/√2
  const comp = d / Math.SQRT2;
  const b = makeRect(comp, comp, 4, 4, 0);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - d) < 1e-9);
  assert.ok(Math.abs(centerLineGap(a, b) - 3) < 1e-9, '45° 方向边缘净距应为 3m');
  assert.ok(respectsGap(a, b, 3), '应判定满足 3m 间距');
  const close = makeRect(5, 5, 4, 4, 0);
  assert.ok(!respectsGap(a, close, 3), '更近的斜向位置应判定不满足间距');
});

test('场地过小放不下时记录 unplaced 而不是丢弃数量', () => {
  const tiny = { width: 12, depth: 10, corridorDir: 'x', corridorWidth: 3, tiers: { tent: 5, assembly: 5, supply: 5, post: 5 }, seed: 'x' };
  const out = generateLayout(tiny, 'x');
  assert.ok(out.some((o) => o.unplaced), '应存在未放置物件');
  const expected = TYPE_ORDER.reduce((n, t) => n + OBJ_TYPES[t].tierCounts[5], 0);
  assert.strictEqual(out.length, expected, '总数仍等于档位要求');
});

console.log(`\n全部 ${passed} 项测试通过`);
