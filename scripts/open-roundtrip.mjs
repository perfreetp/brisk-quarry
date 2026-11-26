import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const file = 'scripts/roundtrip-test.atlas.json';
const atlas = JSON.parse(fs.readFileSync('samples/k5-protection-atlas.atlas.json', 'utf8'));
atlas.document.name = 'ROUNDTRIP 结构回收测试';
atlas.document.currentPageId = 'quantity-2';
fs.writeFileSync(file, JSON.stringify(atlas));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.stack || error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text());
});
await page.goto(process.env.VERIFY_URL ?? 'http://127.0.0.1:5174/', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => Boolean(window.__atlasStore));
const input = await page.$('input[data-file]');
await input.uploadFile(file);
await new Promise((resolve) => setTimeout(resolve, 1500));
const state = await page.evaluate(() => ({
  name: window.__atlasStore.doc.name,
  page: window.__atlasStore.doc.currentPageId,
  layers: window.__atlasStore.doc.layers.length,
  stations: window.__atlasStore.computed.stations.length,
  materialRows: window.__atlasStore.computed.quantities.segments.length,
}));
console.log(state);
await browser.close();
fs.rmSync(file, { force: true });
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
if (!state.name.includes('ROUNDTRIP') || state.page !== 'quantity-2' || state.layers !== 6) process.exit(1);
console.log('OPEN_ROUNDTRIP_OK');
