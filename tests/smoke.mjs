// 端到端冒烟测试:node tests/smoke.mjs(需先启动 dev server)
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE || 'http://localhost:5179/';
const runtimeErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') runtimeErrors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => runtimeErrors.push(`pageerror: ${e.message}`));

const rootShadow = () =>
  page.evaluateHandle(() => document.querySelector('app-root').shadowRoot);

async function clickNav(label) {
  const sr = await rootShadow();
  await sr.evaluate(
    (node, t) => [...node.querySelectorAll('nav button')].find((b) => b.textContent.includes(t)).click(),
    label
  );
}
async function waitForTag(tag, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await page.evaluate(
      (t) => document.querySelector('app-root').shadowRoot.querySelector('main').firstElementChild?.tagName.toLowerCase() === t,
      tag
    );
    if (ok) return;
    await page.waitForTimeout(80);
  }
  throw new Error(`等待组件 ${tag} 超时`);
}
async function pageShadow(tag) {
  await waitForTag(tag);
  await page.waitForTimeout(150);
  return page.evaluateHandle(
    (t) => document.querySelector('app-root').shadowRoot.querySelector(t).shadowRoot,
    tag
  );
}
async function countIn(sr, selector, predicate) {
  return sr.evaluate(
    (root, [sel, predSrc]) => [...root.querySelectorAll(sel)].filter(new Function('t', `return ${predSrc}`)).length,
    [selector, predicate]
  );
}
const readProject = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('granary-layout/project/v1')));
function check(name, cond, extra = '') {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    console.log(`  ❌ ${name} ${extra}`);
    process.exitCode = 1;
  }
}

// 1. 首屏平面页(先清掉历史调试残留,保证从示例工程干净起步)
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
const planSr = await pageShadow('plan-page');
await page.waitForTimeout(400);
check('平面页 Two.js SVG 已挂载', (await planSr.evaluate((r) => r.querySelectorAll('.canvas-wrap svg').length)) === 1);
check(
  '24 个电缆标注',
  (await countIn(planSr, 'svg text', '(/^C\\d+$/.test(t.textContent))')) === 24
);
check(
  '6 个风口标注',
  (await countIn(planSr, 'svg text', '(/^F\\d+$/.test(t.textContent))')) === 6
);

// 2. 剖面页:粮面/地坪/风口标高
await clickNav('剖面布点');
const secSr = await pageShadow('section-page');
await page.waitForTimeout(300);
const secTexts = await secSr.evaluate((r) => [...r.querySelectorAll('svg text')].map((t) => t.textContent));
check('剖面有粮面标注', secTexts.some((t) => t.includes('粮面')));
check('剖面有地坪标注', secTexts.some((t) => t.includes('地坪')));
check('风口按 -0.5m 标高落位', secTexts.some((t) => /-0\.5m/.test(t)));

// 3. 拖电缆符号,坐标变化并持久化
await clickNav('平面布点');
const planSr2 = await pageShadow('plan-page');
const before = await readProject();
const target = await planSr2.evaluateHandle((r) =>
  [...r.querySelectorAll('.canvas-wrap svg path')].find(
    (p) => p.getAttribute('stroke') === '#1f6feb' && p.getBoundingClientRect().width > 12
  )
);
const box = await target.boundingBox();
if (!box) throw new Error('找不到电缆符号');
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 70, cy + 50, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await readProject();
check(
  '拖动后某根电缆坐标变化',
  after.cables.some((c, i) => Math.abs(c.pos.x - before.cables[i].pos.x) > 0.5 || Math.abs(c.pos.y - before.cables[i].pos.y) > 0.5)
);

// 4. 编号规则 C -> T,重排后平面与剖面同步
await clickNav('编号规则');
const rulesSr = await pageShadow('rules-page');
await rulesSr.evaluate((r) => {
  const input = [...r.querySelectorAll('input')].find((i) => i.dataset.actionInput === 'rule:cablePrefix');
  input.value = 'T';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
});
await rulesSr.evaluate((r) =>
  [...r.querySelectorAll('button')].find((b) => b.textContent.includes('按新规则重排')).click()
);
await page.waitForTimeout(500);
await clickNav('平面布点');
const planSr3 = await pageShadow('plan-page');
check(
  '平面出现 24 个 T 前缀标注',
  (await countIn(planSr3, 'svg text', '(/^T\\d+$/.test(t.textContent))')) === 24
);
await clickNav('剖面布点');
const secSr2 = await pageShadow('section-page');
await page.waitForTimeout(300);
check(
  '剖面编号跟随为 T 前缀',
  (await countIn(secSr2, 'svg text', '(/^T\\d+$/.test(t.textContent))')) === 24
);

// 5. 撤销恢复 C
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check('撤销后规则恢复为 C', (await readProject()).rules.cablePrefix === 'C');

// 6. 局部放大:只剩 1 号廒间 12 电缆 / 3 风口
await clickNav('局部放大');
const zoomSr = await pageShadow('zoom-page');
await page.waitForTimeout(500);
check(
  '局部页只有 12 个电缆标注',
  (await countIn(zoomSr, 'svg text', '(/^C\\d+$/.test(t.textContent))')) === 12
);
check(
  '局部页只有 3 个风口标注',
  (await countIn(zoomSr, 'svg text', '(/^F\\d+$/.test(t.textContent))')) === 3
);
// 回总图
await zoomSr.evaluate((r) => [...r.querySelectorAll('button')].find((b) => b.textContent.includes('回总图')).click());
await waitForTag('plan-page');

// 7. 导出 -> 打开,实体与双标注关系保留
const [download] = await Promise.all([
  page.waitForEvent('download'),
  (await rootShadow()).evaluate((sr) =>
    [...sr.querySelectorAll('header button')].find((b) => b.textContent === '导出工程').click()
  )
]);
const filePath = await download.path();
const fileInput = await (await rootShadow()).evaluateHandle((sr) => sr.querySelector('input[type=file]'));
await fileInput.setInputFiles(filePath);
await page.waitForTimeout(500);
const reopened = await readProject();
check('工程往返后实体数量不变', reopened.cables.length === 24 && reopened.vents.length === 6);
check(
  '往返后双视图标注关系保留',
  reopened.cables.every((c) => c.label && c.sectionLabel) && reopened.vents.every((v) => v.label && v.sectionLabel)
);

// 8. 数据录入页表格行数
await clickNav('数据录入');
const dataSr = await pageShadow('data-page');
check('数据页电缆表至少 24 行', (await dataSr.evaluate((r) => r.querySelectorAll('tbody tr').length)) >= 24);

// 9. 刷新后 localStorage 恢复
await page.reload();
await page.waitForTimeout(700);
check('刷新后工程自动恢复', (await readProject()).cables.length === 24);

// 10. 标注拖动后自动固定(pinned),且实体坐标不变、标注坐标变化
await clickNav('平面布点');
const planSr4 = await pageShadow('plan-page');
const labelBefore = await readProject();
const labelEl = await planSr4.evaluateHandle((r) =>
  // 标注框:白色填充的矩形(two.js 渲染为 path)
  [...r.querySelectorAll('.canvas-wrap svg path')].find(
    (el) => el.getAttribute('fill') === '#ffffff'
  )
);
const lb = await labelEl.boundingBox();
if (lb) {
  const lx = lb.x + lb.width / 2;
  const ly = lb.y + lb.height / 2;
  await page.mouse.move(lx, ly);
  await page.mouse.down();
  // 移开足够远,避开符号热区,确保命中的是标注框
  await page.mouse.move(lx + 90, ly - 70, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
const labelAfter = await readProject();
const pinnedCable = labelAfter.cables.find((c) => c.label.pinned);
check('拖动标注后该标注被固定', !!pinnedCable);
if (pinnedCable) {
  const beforeOne = labelBefore.cables.find((c) => c.id === pinnedCable.id);
  check(
    '标注固定不改变符号本体坐标',
    beforeOne.pos.x === pinnedCable.pos.x && beforeOne.pos.y === pinnedCable.pos.y
  );
}

// 11. 粘贴表导入:在空位新增一根带 3 层测点的电缆
await clickNav('数据录入');
const dataSr2 = await pageShadow('data-page');
await dataSr2.evaluate((r) => [...r.querySelectorAll('button')].find((b) => b.textContent.includes('粘贴表导入')).click());
await page.waitForTimeout(200);
const IMPORT_X = 13.7;
const IMPORT_Y = 11.3;
const tsv = [
  `\t1号廒间\t${IMPORT_X}\t${IMPORT_Y}\t1\t0.5`,
  `\t1号廒间\t${IMPORT_X}\t${IMPORT_Y}\t2\t2.0`,
  `\t1号廒间\t${IMPORT_X}\t${IMPORT_Y}\t3\t3.5`
].join('\n');
await dataSr2.evaluate((r, text) => {
  const area = r.querySelector('textarea');
  area.value = text;
  area.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}, tsv);
await dataSr2.evaluate((r) => [...r.querySelectorAll('button')].find((b) => b.textContent.includes('导入电缆表')).click());
await page.waitForTimeout(300);
const imported = await readProject();
const added = imported.cables.find(
  (c) => Math.abs(c.pos.x - IMPORT_X) < 1e-6 && Math.abs(c.pos.y - IMPORT_Y) < 1e-6
);
check('粘贴导入新增电缆', !!added);
check('导入电缆归并为 3 个分层测点', added?.points.length === 3);
check('导入后总数变为 25', imported.cables.length === 25);

// 12. 删除实体后数量回落(先切回电缆表子页,删除按钮在该页)
if (added) {
  await dataSr2.evaluate((r) => [...r.querySelectorAll('button')].find((b) => b.textContent.includes('测温电缆分层测点表')).click());
  await page.waitForTimeout(200);
  const deleted = await page.evaluate((id) => {
    const sr = document.querySelector('app-root').shadowRoot;
    const dsr = sr.querySelector('data-page').shadowRoot;
    const btn = [...dsr.querySelectorAll('button')].find((b) => b.dataset.action === `del-entity:${id}`);
    if (!btn) return false;
    btn.click();
    return true;
  }, added.id);
  check('找到并点击删除按钮', deleted);
  await page.waitForTimeout(300);
  check('删除后电缆数回到 24', (await readProject()).cables.length === 24);
}

if (runtimeErrors.length) {
  console.error('\n运行时错误:');
  runtimeErrors.forEach((e) => console.error(' -', e));
  process.exitCode = 1;
}
console.log(process.exitCode ? '\n存在失败断言 ❌' : '\n全部冒烟断言通过 ✅');
await browser.close();
