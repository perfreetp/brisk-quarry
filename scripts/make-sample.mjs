import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(process.env.VERIFY_URL ?? 'http://127.0.0.1:5174/', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => Boolean(window.__atlasStore));
await new Promise((resolve) => setTimeout(resolve, 1500));
const json = await page.evaluate(() => JSON.stringify(window.__atlasStore.buildFile(), null, 2));
fs.mkdirSync('samples', { recursive: true });
fs.writeFileSync('samples/k5-protection-atlas.atlas.json', json);
console.log('wrote samples/k5-protection-atlas.atlas.json', json.length);
await browser.close();
