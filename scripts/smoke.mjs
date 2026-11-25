// 运行时冒烟测试：验证万级精灵渲染、框选、涂色、遮罩、缩放、段落滑块均无报错
import { chromium } from 'playwright';

const URL = process.env.APP_URL ?? 'http://127.0.0.1:5174/';
const errors = [];
const results = [];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 1. 导入场馆并填充
await page.getByRole('button', { name: '导入场馆并生成观众点阵' }).click();
await page.waitForTimeout(2000);

const statsText = await page.locator('.stats-strip').innerText();
results.push(['填充后统计条', statsText.replace(/\n/g, ' | ')]);

const filled = await page.locator('.stat').nth(1).innerText();
results.push(['已布置观众', filled.replace(/\n/g, ' ')]);

// 2. 框选 12-18 排
await page.getByRole('button', { name: '框选第 12-18 排' }).click();
await page.waitForTimeout(400);
const selected = await page.locator('.stat').nth(2).innerText();
results.push(['框选后选中人数', selected.replace(/\n/g, ' ')]);
const selSummary = await page.locator('.selection-summary').innerText();
results.push(['选择摘要', selSummary.replace(/\n/g, ' ')]);

// 3. 荧光棒改赞助方橙色
await page.getByRole('button', { name: /荧光棒统一改为赞助方橙色/ }).click();
await page.waitForTimeout(400);
results.push(['涂色操作', '已点击，无异常']);

// 4. 滚轮缩放 + 平移（验证 viewport 插件）
const canvas = page.locator('.stage-host canvas').first();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, -600);
await page.waitForTimeout(600);
await page.mouse.wheel(0, 900);
await page.waitForTimeout(400);
await page.mouse.down();
await page.mouse.move(box.x + 400, box.y + 300, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
results.push(['滚轮缩放/平移', '操作完成']);

// 5. 点选单个观众（退出框选，用引擎坐标换算精确点中一个真实座位）
await page.getByRole('button', { name: '退出框选' }).click();
await page.waitForTimeout(300);
const pickPoint = await page.evaluate(() => {
  const eng = window.__audienceEngine;
  const target = eng.venue.seats.find((s) => s.row === 25 && s.sectionId === 'C');
  const sp = eng.viewport.toScreen(target.x, target.y);
  const rect = eng.app.canvas.getBoundingClientRect();
  return { x: rect.left + sp.x, y: rect.top + sp.y, code: target.code };
});
await page.mouse.click(pickPoint.x, pickPoint.y);
await page.waitForTimeout(500);
const detail = await page.locator('.person-detail').count();
results.push(['点选观众详情面板', detail > 0 ? `已显示（目标 ${pickPoint.code}）` : '未显示']);
if (detail > 0) {
  results.push(['详情内容', (await page.locator('.person-detail').innerText()).replace(/\n/g, ' | ').slice(0, 200)]);
}

// 6. 遮罩 33-35 排
await page.getByRole('button', { name: '遮罩这几排' }).click();
await page.waitForTimeout(500);
const masked = await page.locator('.stat').nth(4).innerText();
results.push(['遮罩座位数', masked.replace(/\n/g, ' ')]);

// 7. 恢复遮罩
await page.getByRole('button', { name: '按原位置恢复' }).click();
await page.waitForTimeout(400);
const masked2 = await page.locator('.stat').nth(4).innerText();
results.push(['恢复后遮罩座位', masked2.replace(/\n/g, ' ')]);

// 8. 曲目段落滑块拖到副歌（60%）
await page.locator('.segment-slider').fill('60');
await page.waitForTimeout(800);
const standing = await page.locator('.stat').nth(3).innerText();
results.push(['副歌站立人数', standing.replace(/\n/g, ' ')]);
const segName = await page.locator('.seg-name').innerText();
results.push(['当前段落', segName.trim()]);

// 9. 摆位核查
await page.getByRole('button', { name: '检查过道 / 舞台边摆位' }).click();
await page.waitForTimeout(300);
results.push(['摆位核查', (await page.locator('.placement-result').innerText()).replace(/\n/g, ' | ')]);

// 10. 截图（全览 + 透视预览）
await page.getByRole('button', { name: '全览看台' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'test-results/smoke-overview.png' });

// 10b. 放大到局部，截图看单个观众姿态
await page.evaluate(() => {
  const eng = window.__audienceEngine;
  const target = eng.venue.seats.find((s) => s.row === 25 && s.sectionId === 'C');
  eng.viewport.animate({ scale: 2.2, position: { x: target.x, y: target.y }, duration: 200 });
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'test-results/smoke-zoom.png' });

// 10c. 锁定并导出方案
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: '锁定并导出舞台观众方案' }).click(),
]);
results.push(['方案导出文件', download.suggestedFilename()]);
const modeTag = await page.locator('.mode-tag').innerText();
results.push(['锁定状态', modeTag]);

// 11. FPS
const fps = await page.locator('.stat').nth(6).innerText();
results.push(['实测帧率', fps.replace(/\n/g, ' ')]);
const drawn = await page.locator('.stat').nth(5).innerText();
results.push(['实际渲染精灵', drawn.replace(/\n/g, ' ')]);

console.log('\n===== 冒烟测试结果 =====');
for (const [k, v] of results) console.log(`${k}: ${v}`);
console.log('\n===== 页面错误 =====');
console.log(errors.length ? errors.join('\n') : '无错误');

await browser.close();
process.exit(errors.length ? 1 : 0);
