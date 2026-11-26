// 端到端冒烟测试：真实浏览器驱动完整汇报工作流。
// 运行：node test/e2e/smoke.mjs（需先启动 vite dev）
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const exeCandidates = [1255, 1254].map((v) =>
  join(homedir(), 'AppData/Local/ms-playwright', `chromium-${v}`, 'chrome-win64', 'chrome.exe')
);
const executablePath = exeCandidates.find((p) => existsSync(p));
if (!executablePath) throw new Error('未找到 Playwright Chromium');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const shots = [];
let failures = 0;
function check(name, cond) {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  if (!cond) failures++;
}

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });
page.on('pageerror', (e) => { console.log('  [pageerror]', e.message); failures++; });

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.konvajs-content canvas');
  await page.waitForTimeout(400); // 等待图片异步加载与首帧渲染

  // 1. 初始结构：5 期、角标、字幕条、轨道
  const periodCount = await page.locator('.caption-item').count();
  check('画面下方有 5 个期次字幕', periodCount === 5);
  const badge = await page.locator('.corner-badge').innerText();
  check('画面角标标出第一期与监测日期', badge.includes('第一期') && badge.includes('2025-03-12'));
  const laneCount = await page.locator('.lane').count();
  check('时间轴上每期一条轨道（5 条）', laneCount === 5);
  const kfCount = await page.locator('.kf').count();
  check('每期两个关键帧菱形（共 10 个）', kfCount === 10);
  const groupCount = await page.locator('.trans-pill').count();
  check('相邻期轨道编成 4 个过渡组', groupCount === 4);
  shots.push(await page.screenshot({ path: 'test/e2e/shot-1-overview.png' }));

  // 2. 播放：过渡与停留切换
  const total0 = await page.evaluate(() => window.__store.timeline.total);
  await page.click('text=▶ 播放');
  await page.waitForTimeout(2600); // 跨过第一期停留进入过渡
  const midState = await page.evaluate(() => ({ mode: window.__store.playState.mode, t: window.__store.currentTime, playing: window.__store.isPlaying }));
  check('播放后时间推进并进入过渡段', midState.playing && midState.t > 2000);
  await page.click('text=⏸ 暂停');
  check('暂停生效', !(await page.evaluate(() => window.__store.isPlaying)));

  // 3. 调显示范围（平移按钮）+ 调色标档位并后传
  const vBefore = await page.evaluate(() => window.__store.periods[0].key.view.x);
  await page.click('.btn-row .mini:has-text("→")');
  const vAfter = await page.evaluate(() => window.__store.periods[0].key.view.x);
  check('显示范围可调（平移后 x 变化）', vAfter > vBefore);

  const thBefore = await page.evaluate(() => window.__store.periods[2].key.scale.thresholds[0]);
  await page.locator('.threshold input[type=range]').first().fill('0.25');
  const thP1 = await page.evaluate(() => window.__store.periods[1].key.scale.thresholds[0]);
  const thP3 = await page.evaluate(() => window.__store.periods[3].key.scale.thresholds[0]);
  check('色标档位修改生效', Math.abs(thP1 - 0.25) < 0.001);
  check('本期之后的关键帧按新色标重新对齐', Math.abs(thP3 - 0.25) < 0.001 && Math.abs(thBefore - thP3) > 0.01);

  // 4. 落关键帧
  await page.click('.commit');
  const committed = await page.evaluate(() => !!window.__store.periods.find((p) => p.id === window.__store.selectedPeriodId).key.committedAt);
  check('每期调完可在轨道上落关键帧', committed);
  check('落帧后菱形变为实心', (await page.locator('.kf.committed').count()) >= 2);

  // 5. 拉长第三→四期组时长：后续关键帧整体后挪、刻度重排
  await page.click('.tabs button:has-text("轨道组")');
  const p4Before = await page.evaluate(() => window.__store.timeline.entries[3].start);
  await page.click('button:has-text("一键把第三→四期")');
  const g3 = await page.evaluate(() => window.__store.groups.find((g) => g.periodIds.join() === 'p3,p4').transitionMs);
  const p4After = await page.evaluate(() => window.__store.timeline.entries[3].start);
  const total1 = await page.evaluate(() => window.__store.timeline.total);
  check('第三→四期过渡拉长到 2.0s', g3 === 2000);
  check('后续关键帧整体后挪 1300ms（700→2000）', p4After - p4Before === 1300);
  check('时间轴总时长与刻度随之重排', total1 - total0 === 1300);
  check('偏快警示消失', (await page.locator('.group-card.fast').count()) === 0);
  await page.screenshot({ path: 'test/e2e/shot-2-tracks.png' });

  // 6. 圈选白化扩大区 → 暂停放大讲解 → 退出
  await page.click('.tabs button:has-text("关键帧")');
  // 先定位到第三期
  await page.evaluate(() => window.__store.seekPeriod('p3'));
  await page.click('button:has-text("在画面上圈出扩大区")');
  const box = await page.locator('.konva-host').boundingBox();
  const pts = [
    [box.width * 0.4, box.height * 0.4],
    [box.width * 0.6, box.height * 0.42],
    [box.width * 0.58, box.height * 0.62],
    [box.width * 0.42, box.height * 0.6]
  ];
  for (const [x, y] of pts) await page.mouse.click(box.x + x, box.y + y);
  await page.mouse.dblclick(box.x + pts[0][0], box.y + pts[0][1]);
  await page.waitForTimeout(300);
  const annCount = await page.evaluate(() => (window.__store.periods.find((p) => p.id === 'p3').annotations || []).length);
  check('在第三期帧上圈出白化扩大区并生成标注', annCount === 1);
  await page.waitForSelector('.lens-bar', { timeout: 2000 });
  check('圈选后自动暂停并放大到该区域', await page.locator('.lens-bar').isVisible());
  check('放大状态下播放已暂停', !(await page.evaluate(() => window.__store.isPlaying)));
  await page.screenshot({ path: 'test/e2e/shot-3-lens.png' });
  await page.click('.lens-bar .mini');
  check('可退出放大镜头', (await page.locator('.lens-bar').count()) === 0);

  // 7. 预览/回放一致：同一时间点两次查询结果相同
  const same = await page.evaluate(() => {
    const s = window.__store;
    s.seek(5200);
    const a = JSON.stringify(s.playState.view);
    const b = JSON.stringify(s.playState.view);
    return a === b;
  });
  check('预览查询与回放状态同源一致', same);

  // 8. 整段连续播一遍：从头走到尾，各期衔接
  await page.evaluate(() => { window.__store.seek(0); window.__store.play(); });
  const total = await page.evaluate(() => window.__store.timeline.total);
  await page.waitForFunction(() => !window.__store.isPlaying, { timeout: total + 6000 });
  const endT = await page.evaluate(() => window.__store.currentTime);
  check('连续播放完整段并在末尾停止', Math.abs(endT - total) < 50);
  const endBadge = await page.locator('.corner-badge').innerText();
  check('结束停在第五期', endBadge.includes('第五期'));
  await page.screenshot({ path: 'test/e2e/shot-4-end.png', fullPage: true });

  // 9. 工程可导出（交给项目负责人存档）
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 3000 }),
    page.click('text=导出工程存档')
  ]);
  check('可导出工程 JSON 存档', dl.suggestedFilename().includes('白化演变展示工程'));
} catch (e) {
  failures++;
  console.log('❌ 测试异常:', e.message);
  await page.screenshot({ path: 'test/e2e/shot-error.png' }).catch(() => {});
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\n全部冒烟检查通过' : `\n有 ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
