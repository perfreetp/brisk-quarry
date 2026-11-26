import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.env.VERIFY_URL ?? 'http://127.0.0.1:5173/';

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-device-scale-factor=1'],
});

const errors = [];
const consoleErrors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1900, height: 1100, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console.error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`);
  });

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => Boolean(window.__atlasStore), { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 3500));

  const initial = await page.evaluate(() => {
    const store = window.__atlasStore;
    const q = store.computed.quantities;
    const canvas = document.querySelector('paper-sheet').shadowRoot.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) nonWhite += 1;
    }
    return {
      defined: ['atlas-app', 'paper-sheet', 'number-field'].map((tag) => [tag, customElements.get(tag) !== undefined]),
      pageCount: store.computed.pages.length,
      currentPage: store.doc.currentPageId,
      stations: store.computed.stations.length,
      issues: q.issues.map((i) => i.title),
      selfBands: q.bands.map((b) => ({ id: b.band.id, self: b.geometry.selfIntersectionCount, area: Math.round(b.areaM2), outer: b.geometry.outerLoops.length, holes: b.geometry.holes.length })),
      grassArea: q.grassAreaM2,
      grassCells: q.grassCells,
      plantCount: q.plantCount,
      seedlingCount: q.seedlingCount,
      species: q.species.length,
      furniture: store.doc.furniture.length,
      layers: store.doc.layers.length,
      nonWhite,
      materialText: document.querySelector('[data-material-summary]')?.textContent.includes('草料汇总'),
      pageButtons: document.querySelectorAll('[data-page-id]').length,
    };
  });

  console.log('initial', JSON.stringify(initial, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  if (consoleErrors.length) throw new Error(consoleErrors.join('\n'));
  if (!initial.defined.every(([, ok]) => ok)) throw new Error('some custom elements are not defined');
  if (initial.nonWhite < 5000) throw new Error(`canvas appears blank: ${initial.nonWhite}`);
  if (!initial.issues.length) throw new Error('expected K5 self-intersection issue');
  if (!initial.selfBands.some((b) => b.self > 0 && b.outer > 0 && b.area > 0)) throw new Error('self-intersection repair did not produce area/loops');

  const changed = await page.evaluate(() => {
    const store = window.__atlasStore;
    const before = { cells: store.computed.quantities.grassCells, seedlings: store.computed.quantities.seedlingCount };
    store.update('verify spec', (doc) => {
      doc.grass.cellAlong = 2;
      doc.grass.cellAcross = 2;
      doc.forest.rowSpacing = 5;
      doc.forest.plantSpacing = 3;
    });
    const after = { cells: store.computed.quantities.grassCells, seedlings: store.computed.quantities.seedlingCount };
    return { before, after, dom: document.querySelector('[data-material-summary]').textContent };
  });
  console.log('changed', JSON.stringify(changed));
  if (!(changed.after.cells < changed.before.cells)) throw new Error('grass spec did not reduce cell count');
  if (!(changed.after.seedlings < changed.before.seedlings)) throw new Error('spacing did not reduce seedling count');

  // Restore dense defaults for interaction/drag.
  await page.evaluate(() => {
    const store = window.__atlasStore;
    store.update('restore', (doc) => {
      doc.grass.cellAlong = 1;
      doc.grass.cellAcross = 1;
      doc.forest.rowSpacing = 3;
      doc.forest.plantSpacing = 2;
      doc.currentPageId = 'plan-3';
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Click the explicit third-page legend continuation action.
  await page.click('[data-action="add-legend-k5"]');
  await new Promise((resolve) => setTimeout(resolve, 300));
  const legendState = await page.evaluate(() => {
    const store = window.__atlasStore;
    const block = store.doc.furniture.find((f) => f.id === 'legend-cont-k5');
    return { page: store.doc.currentPageId, entries: block?.entryIds.length, currentPageHasBlock: store.doc.furniture.some((f) => f.pageId === 'plan-3' && f.type === 'legend') };
  });
  console.log('legend', legendState);
  if (legendState.page !== 'plan-3' || legendState.entries < 4) throw new Error('page 3 legend continuation failed');

  // Drag the K5 continuation legend by a small amount.
  const rect = await page.evaluate(() => {
    const canvas = document.querySelector('paper-sheet').shadowRoot.querySelector('canvas');
    const box = canvas.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const start = { x: rect.x + (200 + 20) / 420 * rect.width, y: rect.y + (42 + 12) / 297 * rect.height };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 45, start.y + 35, { steps: 6 });
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const drag = await page.evaluate(() => {
    const item = window.__atlasStore.doc.furniture.find((f) => f.id === 'legend-cont-k5');
    return { x: item.xMm, y: item.yMm };
  });
  console.log('drag', drag);
  if (drag.x === 200 && drag.y === 42) throw new Error('legend drag did not persist a new position');

  const saved = await page.evaluate(() => {
    const file = window.__atlasStore.buildFile();
    localStorage.setItem('verify-file', JSON.stringify(file));
    const reparsed = JSON.parse(localStorage.getItem('verify-file'));
    return {
      app: file.app,
      pages: file.document.currentPageId,
      layers: file.document.layers.length,
      furniture: file.document.furniture.length,
      stationsSnapshot: file.snapshot.stationCount,
      hasComputedMaterial: Boolean(file.snapshot.grassAreaM2),
      roundtrip: reparsed.document.schemaVersion === 'atlas.structured.v1',
    };
  });
  console.log('saved', saved);
  if (!saved.roundtrip || saved.layers < 6 || saved.furniture < 10) throw new Error('save structure incomplete');

  const htmlCheck = await page.evaluate(() => {
    const sheet = document.querySelector('paper-sheet');
    const html = sheet.exportAtlasHtml();
    return {
      sections: (html.match(/<section class="sheet"/g) ?? []).length,
      hasVectorPath: html.includes('<path'),
      hasTitle: html.includes('图册导出'),
      restoredPage: window.__atlasStore.doc.currentPageId,
    };
  });
  console.log('htmlExport', htmlCheck);
  if (htmlCheck.sections !== initial.pageCount || !htmlCheck.hasVectorPath || !htmlCheck.hasTitle) {
    throw new Error('atlas HTML export incomplete');
  }

  if (errors.length) throw new Error(errors.join('\n'));
  if (consoleErrors.length) throw new Error(consoleErrors.join('\n'));
  console.log('VERIFY_OK');
} finally {
  await browser.close();
}
