import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1680,1050'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
const messages = [];
page.on('console', (msg) => messages.push(`[console.${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => messages.push(`[pageerror] ${err.stack || err.message}`));

await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle0' });
await new Promise((resolve) => setTimeout(resolve, 1200));
console.log('zone canvas count', await page.$$eval('canvas', (els) => els.length));
await page.screenshot({ path: 'check-zone.png' });

async function clickTab(label) {
  await page.evaluate((text) => {
    const btn = [...document.querySelectorAll('.tab')].find((b) => b.textContent.includes(text));
    if (!btn) throw new Error(`tab not found: ${text}`);
    btn.click();
  }, label);
  await new Promise((resolve) => setTimeout(resolve, 900));
}

await clickTab('增氧点位');
console.log('aeration canvas count', await page.$$eval('canvas', (els) => els.length));
await page.screenshot({ path: 'check-aeration.png' });

await clickTab('投喂路线');
console.log('feed canvas count', await page.$$eval('canvas', (els) => els.length));
await page.screenshot({ path: 'check-feed.png' });

await clickTab('排版出图');
await new Promise((resolve) => setTimeout(resolve, 1800));
console.log('layout canvas count', await page.$$eval('.poster-map-body canvas', (els) => els.length));
await page.screenshot({ path: 'check-layout-a1.png' });

const firstCode = await page.$eval('.poster-table tbody tr:first-child input', (el) => el.value);
await page.$eval('.poster-table tbody tr:first-child input', (el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, '01');
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise((resolve) => setTimeout(resolve, 500));
const zoneLabelHasNewCode = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('.poster-map-body canvas')];
  return canvases.length === 3;
});
const legendFollowsRename = await page.$eval('.poster-legend', (el) => el.textContent.includes('01'));
console.log('renamed', firstCode, 'to 01; legend follows:', legendFollowsRename);

const overlap = await page.evaluate(() => {
  function rectsOverlap(a, b) {
    return !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
  }
  const table = document.querySelector('.poster-table').getBoundingClientRect();
  const legend = document.querySelector('.poster-legend').getBoundingClientRect();
  const cards = [...document.querySelectorAll('.poster-map-card')].map((el) => el.getBoundingClientRect());
  return {
    tableLegend: rectsOverlap(table, legend),
    tableCards: cards.map((r) => rectsOverlap(table, r)),
    legendCards: cards.map((r) => rectsOverlap(legend, r)),
    cardPairs: cards.map((a, i) => cards.some((b, j) => i !== j && rectsOverlap(a, b))),
  };
});
console.log('overlap report', JSON.stringify(overlap));

const beforeDrag = await page.$eval('.poster-table', (el) => el.getBoundingClientRect().toJSON());
const handle = await page.$('.table-drag-bar');
const box = await handle.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let i = 1; i <= 12; i += 1) {
  await page.mouse.move(box.x + box.width / 2 - 180 + i * 14, box.y + box.height / 2 - 80 + i * 5, { steps: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
}
await page.mouse.up();
await new Promise((resolve) => setTimeout(resolve, 500));
const afterDrag = await page.$eval('.poster-table', (el) => el.getBoundingClientRect().toJSON());
const dragOverlap = await page.evaluate((beforeX) => {
  function hit(a, b) { return !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1); }
  const tableRect = document.querySelector('.poster-table').getBoundingClientRect();
  const legend = document.querySelector('.poster-legend').getBoundingClientRect();
  const cards = [...document.querySelectorAll('.poster-map-card')].map((el) => el.getBoundingClientRect());
  const note = document.querySelector('.poster-note-card')?.getBoundingClientRect();
  return { moved: Math.abs(tableRect.x - beforeX) > 5, tableLegend: hit(tableRect, legend), tableCards: cards.map((r) => hit(tableRect, r)), noteOverlaps: note ? [hit(note, tableRect), hit(note, legend), ...cards.map((r) => hit(note, r))] : [] };
}, beforeDrag.x);
console.log('drag report', JSON.stringify({ beforeX: Math.round(beforeDrag.x), afterX: Math.round(afterDrag.x), ...dragOverlap }));
await page.screenshot({ path: 'check-layout-drag.png' });

await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.paper-card')].find((b) => b.textContent.includes('A3'));
  btn.click();
});
await new Promise((resolve) => setTimeout(resolve, 1000));
await page.screenshot({ path: 'check-layout-a3.png' });
const overlapA3 = await page.evaluate(() => {
  function hit(a, b) { return !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1); }
  const table = document.querySelector('.poster-table').getBoundingClientRect();
  const legend = document.querySelector('.poster-legend').getBoundingClientRect();
  const cards = [...document.querySelectorAll('.poster-map-card')].map((el) => el.getBoundingClientRect());
  return { tableLegend: hit(table, legend), tableCards: cards.map((r) => hit(table, r)), legendCards: cards.map((r) => hit(legend, r)) };
});
console.log('A3 overlap report', JSON.stringify(overlapA3));

const serious = messages.filter((m) => m.includes('[pageerror]') || m.includes('[console.error]'));
console.log('browser errors:', serious.length ? `\n${ serious.join('\n')}` : 'none');
await browser.close();
if (serious.length || !legendFollowsRename) process.exit(1);
