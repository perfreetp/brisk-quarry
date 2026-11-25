import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.env.SMOKE_URL ?? 'http://127.0.0.1:4173/';

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1680,1200'],
  defaultViewport: { width: 1680, height: 1200 },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
});

try {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForSelector('.timeline-grid', { timeout: 15000 });

  // Rubber-band a loop range in an empty part of the group lane.
  await page.click('.tool-group button:nth-child(2)');
  const timeColumn = await page.$('.time-column');
  const timeBox = await timeColumn.boundingBox();
  const rangeY = timeBox.y + 31;
  const rangeX0 = timeBox.x + 16 * 38;
  await page.mouse.move(rangeX0, rangeY);
  await page.mouse.down();
  await page.mouse.move(rangeX0 + 2 * 38, rangeY, { steps: 5 });
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const rubberLoop = await page.$eval('.loop-label', (el) => el.textContent).catch(() => '');
  if (!rubberLoop.includes('16.00') || !rubberLoop.includes('18.00')) {
    throw new Error(`Rubber-band loop failed: ${rubberLoop}`);
  }

  await page.click('.acceptance-btn');
  await new Promise((resolve) => setTimeout(resolve, 900));

  const numberValues = await page.$$eval('.inspector input[type="number"]', (inputs) => inputs.map((input) => Number(input.value)));
  if (!numberValues.some((value) => Math.abs(value - 10.5) < 0.001) || !numberValues.some((value) => Math.abs(value - 12.7) < 0.001)) {
    throw new Error(`Door 5 acceptance values missing: ${numberValues.join(', ')}`);
  }

  const loopLabel = await page.$eval('.loop-label', (el) => el.textContent).catch(() => '');
  if (!loopLabel.includes('10.25') || !loopLabel.includes('13.15')) {
    throw new Error(`Loop region missing or wrong: ${loopLabel}`);
  }

  await page.screenshot({ path: 'smoke-acceptance.png' });

  // Open handoff and ensure exported JSON contains triggers and subtitles.
  const tabs = await page.$$('.side-tabs button');
  await tabs[2].click();
  await page.waitForSelector('.json-box');
  const jsonText = await page.$eval('.json-box', (el) => el.value);
  const handoff = JSON.parse(jsonText);
  if (!handoff.cues?.length || !handoff.audioTeam?.length || !handoff.uiTeam?.length) {
    throw new Error('Handoff package is incomplete');
  }
  if (!JSON.stringify(handoff).includes('proximity.enter(door-5')) {
    throw new Error('Door 5 trigger condition missing from handoff');
  }

  // Drag the selected C05 body right by 40px and ensure its numeric start changes.
  await tabs[0].click();
  const clip = await page.$('.audio-clip.selected');
  const box = await clip.boundingBox();
  if (!box) throw new Error('Selected audio clip has no bounding box');
  const before = await page.$eval('.inspector input[type="number"]', (input) => input.value);

  // Changing the easing must redistribute existing keyframe positions.
  const visualClip = await page.$('.visual-clip.selected');
  const easingBefore = await visualClip.$$eval('.keyframe-diamond', (nodes) => nodes.map((node) => node.style.left).join('|'));
  const inspectorSelects = await page.$$('.inspector select');
  await inspectorSelects[1].select('linear');
  await new Promise((resolve) => setTimeout(resolve, 120));
  const easingAfter = await visualClip.$$eval('.keyframe-diamond', (nodes) => nodes.map((node) => node.style.left).join('|'));
  if (easingBefore === easingAfter) throw new Error('Easing change did not rearrange keyframes');

  const dragX = box.x + box.width / 2;
  const dragY = box.y + 28;
  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragX + 42, dragY, { steps: 6 });
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const after = await page.$eval('.inspector input[type="number"]', (input) => input.value);
  if (before === after) throw new Error(`Cue drag did not change start value (${before} -> ${after})`);

  // Drag the active group strip; pointer-down selects its first cue, whose start must move.
  const groupClip = await page.$('.group-clip.selected');
  const groupBox = await groupClip.boundingBox();
  if (!groupBox) throw new Error('Selected group clip has no bounding box');
  const groupY = groupBox.y + groupBox.height / 2;
  await page.mouse.move(groupBox.x + 28, groupY);
  await page.mouse.down();
  await page.mouse.move(groupBox.x + 66, groupY, { steps: 4 });
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const groupPrimaryTitle = await page.$eval('.inspector-head h3', (el) => el.textContent);
  const groupStart = await page.$eval('.inspector input[type="number"]', (input) => Number(input.value));
  if (!groupPrimaryTitle?.includes('4号门') || Math.abs(groupStart - 9.1) > 0.011) {
    throw new Error(`Group drag did not move nested cues: ${groupPrimaryTitle} start=${groupStart}`);
  }

  console.log(JSON.stringify({ ok: true, before, after, groupStart, loopLabel, cueCount: handoff.cues.length, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: 'smoke-error.png' }).catch(() => {});
  console.error(JSON.stringify({ ok: false, error: error.message, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
