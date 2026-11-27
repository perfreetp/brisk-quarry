import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const downloadDir = path.resolve('test-downloads');
fs.mkdirSync(downloadDir, { recursive: true });

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

const client = await page.target().createCDPSession();
await client.send('Browser.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: downloadDir,
  eventsEnabled: true,
});

await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('保存可编辑稿')).click());
let filePath = '';
for (let i = 0; i < 50; i += 1) {
  await new Promise((r) => setTimeout(r, 100));
  const file = fs.readdirSync(downloadDir).find((name) => name.endsWith('.aquafarm.json') && !name.endsWith('.crdownload'));
  if (file) {
    filePath = path.join(downloadDir, file);
    break;
  }
}
if (!filePath) throw new Error('draft download did not complete');
const draft = JSON.parse(fs.readFileSync(filePath, 'utf8'));
console.log('downloaded draft', path.basename(filePath));
console.log('draft counts', {
  ponds: draft.project.ponds.length,
  cages: draft.project.cages.length,
  aerators: draft.project.aerators.length,
  pipes: draft.project.pipes.length,
  routePoints: draft.project.feedRoute.points.length,
});

const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile(filePath);
await new Promise((r) => setTimeout(r, 1000));
const saveState = await page.$eval('.save-state', (el) => el.textContent);
console.log('import state:', saveState);

await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.includes('增氧点位')).click());
await new Promise((r) => setTimeout(r, 800));
const aeroHeading = await page.evaluate(() => [...document.querySelectorAll('.panel-card h3')].map((h) => h.textContent).find((t) => t.includes('已布机位')));
console.log('after reopen', aeroHeading);

const structuralOk = draft.project.ponds.length >= 8
  && draft.project.cages.length === 12
  && draft.project.pipes.every((p) => Array.isArray(p.points) && p.points.length >= 2);
console.log('draft errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length || !structuralOk || !saveState.includes('稿子已打开') || !aeroHeading.includes('6')) process.exit(1);
