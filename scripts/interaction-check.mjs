import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050 });
const errors = [];
page.on('pageerror', (err) => errors.push(err.stack || err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
});

await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));

async function clickByText(selector, text) {
  await page.evaluate((sel, label) => {
    const el = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(label));
    if (!el) throw new Error(`not found ${sel}:${label}`);
    el.click();
  }, selector, text);
}

async function canvasBox() {
  const handle = await page.$('.map-page, .map-canvas-wrap .upper-canvas') || await page.$('.upper-canvas');
  return handle.boundingBox();
}

const beforePonds = await page.$eval('.panel-card h3', (el) => el.textContent).catch(() => '');
console.log('first panel heading', beforePonds);
await clickByText('button', '拖画塘口');
let box = await canvasBox();
await page.mouse.move(box.x + 260, box.y + 220);
await page.mouse.down();
await page.mouse.move(box.x + 350, box.y + 290, { steps: 6 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 500));
const pondHeading = await page.evaluate(() => [...document.querySelectorAll('.panel-card h3')].map((h) => h.textContent).find((t) => t.includes('塘口台账')));
console.log('pond heading after draw', pondHeading);

await clickByText('.tab', '增氧点位');
await new Promise((r) => setTimeout(r, 700));
const beforeAero = await page.evaluate(() => [...document.querySelectorAll('.panel-card h3')].map((h) => h.textContent).find((t) => t.includes('已布机位')));
await page.evaluate(() => document.querySelector('.catalog-card .btn').click());
await new Promise((r) => setTimeout(r, 500));
const afterAero = await page.evaluate(() => [...document.querySelectorAll('.panel-card h3')].map((h) => h.textContent).find((t) => t.includes('已布机位')));
console.log('aerator count', beforeAero, '=>', afterAero);

await clickByText('.tab', '投喂路线');
await new Promise((r) => setTimeout(r, 700));
const beforeFeeds = await page.$$eval('.feed-row', (els) => els.length);
await clickByText('button', '顺序点投喂点');
box = await canvasBox();
await page.mouse.click(box.x + 360, box.y + 500);
await new Promise((r) => setTimeout(r, 400));
const afterFeeds = await page.$$eval('.feed-row', (els) => els.length);
console.log('feed rows', beforeFeeds, '=>', afterFeeds);

await clickByText('button', '沿堤埂画路线');
await page.mouse.click(box.x + 180, box.y + 430);
await page.mouse.click(box.x + 500, box.y + 430);
await page.mouse.click(box.x + 700, box.y + 650);
await page.mouse.click(box.x + 700, box.y + 650, { clickCount: 2 });
await page.mouse.click(box.x + 700, box.y + 650, { clickCount: 2 });
await new Promise((r) => setTimeout(r, 500));
console.log('route tool completed');

await new Promise((r) => setTimeout(r, 1200));
const storedPondCount = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('aquafarm-layout-studio-v1'))?.project?.ponds?.length || 0; } catch { return 0; }
});

console.log('interaction errors:', errors.length ? `\n${errors.join('\n')}` : 'none');
await page.screenshot({ path: 'check-interaction-feed.png' });
await browser.close();
if (errors.length || storedPondCount < 9 || afterAero === beforeAero || afterFeeds !== beforeFeeds + 1) {
  console.error('check state', { storedPondCount, beforeAero, afterAero, beforeFeeds, afterFeeds });
  process.exit(1);
}
