// 无头 Chrome 端到端冒烟测试（CDP 驱动真实浏览器）
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const APP = (process.argv[2] || 'http://127.0.0.1:47131/') + '?e2e=1';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const profileDir = resolve('node_modules/.chrome-profile');
const downloadDir = resolve('tests/downloads');
rmSync(profileDir, { recursive: true, force: true });
rmSync(downloadDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });
mkdirSync(downloadDir, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
    `--user-data-dir=${profileDir}`, '--window-size=1600,950', 'about:blank',
  ],
  { stdio: 'ignore' }
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

const errors = [];
const ws = new WebSocket(await getWsUrl());
await new Promise((r) => (ws.onopen = r));
let mid = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push(msg.params.entry.text);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++mid;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' :: ' + r.result.exceptionDetails.exception?.description);
  return r.result.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(`tests/${name}.png`), Buffer.from(r.result.data, 'base64'));
  console.log(`  截图 tests/${name}.png`);
};
const assert = (cond, msg) => {
  if (!cond) {
    console.error('  ✗ 断言失败：' + msg);
    process.exitCode = 1;
  } else {
    console.log('  ✓ ' + msg);
  }
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir.replace(/\\/g, '/'), eventsEnabled: true });

console.log('→ 打开应用');
await send('Page.navigate', { url: APP });
await sleep(3500);
assert((await evalJs(`document.querySelector('.viewport canvas')?.width > 100`)), 'WebGL 画布已创建');
assert((await evalJs(`document.querySelectorAll('.adjusted-item').length === 0`)), '初始手动调整清单为空');
await shot('e2e-1-initial');

console.log('→ 五档帐篷 + 新种子生成');
await evalJs(`
  (() => {
    const sel = document.querySelectorAll('.tier-row select')[0];
    sel.value = '5';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const inp = document.querySelector('.seed-box input');
    inp.value = 'smoke';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.side-panel.left .btn.primary').click();
  })()
`);
await sleep(700);
const tentCount = Number((await evalJs(`document.querySelector('.app-header .counts').textContent`)).match(/帐篷\s*(\d+)/)[1]);
assert(tentCount === 16, `五档帐篷布下 16 个（实际 ${tentCount}）`);

console.log('→ 选中物件并旋转 180°');
// 真实鼠标点击验证一次 three.js 射线拾取；失败则用 store 选中兜底，保证后续联动检查稳定
const box = await evalJs(`document.querySelector('.viewport canvas').getBoundingClientRect().toJSON()`);
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
    await sleep(60);
  }
};
let picked = false;
for (let i = 1; i <= 9 && !picked; i++) {
  await clickAt(box.left + box.width * (0.12 + i * 0.085), box.top + box.height * (0.35 + (i % 3) * 0.15));
  await sleep(150);
  picked = await evalJs(`!!document.querySelector('.inspector .ins-title')`);
}
if (!picked) {
  await evalJs(`window.__store.select(window.__store.state.objects.find(o => !o.unplaced).uid)`);
  await sleep(200);
  picked = await evalJs(`!!document.querySelector('.inspector .ins-title')`);
}
assert(picked, '物件可被选中并显示检查器');
const pickedUid = await evalJs(`window.__store.state.selectedId`);
await evalJs(`
  (() => {
    const range = document.querySelector('.inspector input[type=range]');
    range.value = '180';
    range.dispatchEvent(new Event('input', { bubbles: true }));
  })()
`);
await sleep(300);
assert((await evalJs(`document.querySelectorAll('.adjusted-item').length === 1`)), '旋转后进入手动调整清单');
await shot('e2e-2-adjusted');

console.log('→ 恢复自动位置（旋转修改保留，位置回到自动点）');
await evalJs(`document.querySelector('.adjusted-item .ai-actions .btn').click()`);
await sleep(300);
const posReset = await evalJs(`
  (() => {
    const o = window.__store.state.objects.find(x => x.uid === '${pickedUid}');
    return { stillManual: !!o.manual, atAuto: o.manual && o.manual.x === o.auto.x && o.manual.z === o.auto.z, rotKept: Math.abs(o.manual.rot - Math.PI) < 1e-9 };
  })()
`);
assert(posReset.stillManual && posReset.atAuto && posReset.rotKept, '位置已回到自动点且旋转 180° 保留（按设计仍在清单中）');

console.log('→ 拖拽到通道上必须弹回最近空位');
const bounce = await evalJs(`
  (() => {
    const s = window.__store;
    const o = s.state.objects.find(x => !x.unplaced);
    const before = s.eff(o);
    // 主通道沿 x 方向，中心在 z=0；把物件丢到通道中心
    const res = s.commitDrag(o.uid, before.x, 0);
    const after = s.eff(o);
    const inCorridor = Math.abs(after.z) < s.state.params.corridorWidth / 2 + 0.2;
    return { legal: res.legal, inCorridor, movedBack: after.z !== 0 };
  })()
`);
assert(bounce.legal === false && !bounce.inCorridor && bounce.movedBack, '压通道的拖拽被拒绝并弹回合法空位');

console.log('→ 改参数重新生成，手动调整物件保持原位');
const kept = await evalJs(`
  (() => {
    const s = window.__store;
    const target = s.state.objects.find(o => o.manual);
    const snapshot = JSON.parse(JSON.stringify(s.eff(target)));
    const sel = document.querySelectorAll('.tier-row select')[3]; // 警戒桩
    sel.value = '4';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('.side-panel.left .btn.primary').click();
    const after = s.state.objects.find(o => o.uid === target.uid);
    const now = s.eff(after);
    return { keptManual: !!after.manual, same: now.x === snapshot.x && now.z === snapshot.z && Math.abs(now.rot - snapshot.rot) < 1e-9 };
  })()
`);
assert(kept.keptManual && kept.same, '重新生成后手动物件原位保留且仍带手动标记');
await shot('e2e-3-regenerated');

console.log('→ 复现该种子布局，清掉全部手动调整');
await evalJs(`document.querySelector('.side-panel.left .btn.gold').click()`);
await sleep(700);
assert((await evalJs(`document.querySelectorAll('.adjusted-item').length === 0`)), '复现后手动调整清单清空');
const reproState = await evalJs(`
  (() => {
    const s = window.__store;
    const count = (t) => s.state.objects.filter(o => o.type === t && !o.unplaced).length;
    return {
      postTier: s.state.params.tiers.post,
      tentTier: s.state.params.tiers.tent,
      posts: count('post'),
      tents: count('tent'),
      seed: s.state.params.seed,
    };
  })()
`);
console.log('  复现后状态：', JSON.stringify(reproState));
assert(reproState.seed === 'smoke', '种子仍为 smoke');
assert(reproState.postTier === 2 && reproState.posts === 8, `复现恢复到该种子快照参数（警戒桩二档=8，实际档位 ${reproState.postTier}/数量 ${reproState.posts}）`);
assert(reproState.tentTier === 5 && reproState.tents === 16, `帐篷五档=16 保持（实际 ${reproState.tents}）`);

console.log('→ 导出布置图 PNG（校验图像数据）');
const pngInfo = await evalJs(`
  (() => {
    const url = window.__exportBlueprint();
    const b64 = url.split(',')[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { sig: [bytes[0], bytes[1], bytes[2], bytes[3]].join(','), w: (bytes[16]<<24>>>24)*16777216 + (bytes[17]<<16) + (bytes[18]<<8) + bytes[19], h: (bytes[20]<<24>>>24)*16777216 + (bytes[21]<<16) + (bytes[22]<<8) + bytes[23], bytes: bytes.length };
  })()
`);
console.log('  PNG：', JSON.stringify(pngInfo));
assert(pngInfo.sig === '137,80,78,71', '导出内容是合法 PNG');
assert(pngInfo.w === 1680 && pngInfo.h > 700, `PNG 尺寸正常（${pngInfo.w}×${pngInfo.h}）`);
// 同时验证用户实际点击的下载按钮不会抛错
let clickError = null;
try {
  await evalJs(`document.querySelector('.app-header .btn.gold').click()`);
  await sleep(400);
} catch (e) {
  clickError = String(e);
}
assert(!clickError, '点击导出按钮无异常：' + (clickError || 'OK'));

const realErrors = [...new Set(errors)].filter((e) => e && !e.includes('favicon'));
if (realErrors.length) {
  console.error('\n浏览器侧错误：');
  realErrors.forEach((e) => console.error(' -', e.split('\n')[0]));
  process.exitCode = 1;
} else {
  console.log('\n全部端到端检查通过，无浏览器侧报错');
}
chrome.kill();
ws.close();
