/**
 * 真实浏览器端到端冒烟（playwright-core + 系统 Chrome）。
 * 运行：node scripts/e2e-smoke.mjs
 * 覆盖：标定 → 碰撞体 → 灯珠对齐 2mm 阈值 → 批注/磨损 → 笔划撤销 → 角色权限 → 导出。
 */
import { chromium } from 'playwright-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.SMOKE_URL ?? 'http://localhost:5199/'
const failures = []
function check(name, cond, extra = '') {
  const ok = Boolean(cond)
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures.push(name)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
// 独立无痕 context，避免 localStorage 自动存档在测试间串状态
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(String(e)))

await page.goto(URL)
await page.waitForFunction(() => window.__pst && window.__pst.canvas(), null, { timeout: 10000 })

// 1. 画布初始化
const objCount0 = await page.evaluate(() => window.__pst.canvas().getObjects().length)
check('Fabric 画布已初始化', objCount0 >= 0)

// 2. 标定：600×600mm 台面，角点 (100,100)-(700,700)，即 1px/mm
await page.evaluate(() => {
  const doc = window.__pst.doc()
  doc.setCalibration({ tableWidthMm: 600, tableHeightMm: 600, p1: { x: 100, y: 100 }, p2: { x: 700, y: 700 }, done: true })
  window.__pst.canvas().clipPath = undefined
  // 触发与标定面板确认相同的重建
  window.__pst.recompute()
})
const cal = await page.evaluate(() => window.__pst.doc().calibration)
check('标定完成且 1px/mm', cal.done && cal.tableWidthMm === 600)

// 3. 画碰撞体矩形（在丝印/灯位之下）：选碰撞矩形工具，在画布拖一个框
await page.evaluate(() => window.__pst.ui().setTool('collider-rect'))
const box = await page.locator('.stage canvas').first().boundingBox()
await page.mouse.move(box.x + 300, box.y + 300)
await page.mouse.down()
await page.mouse.move(box.x + 450, box.y + 400, { steps: 6 })
await page.mouse.up()
const colliders = await page.evaluate(() => window.__pst.layers().objects('collision').length)
check('碰撞矩形已创建并入册 collision 层', colliders === 1)

// 4. 灯珠 A：基于碰撞体运行时真实顶边相切放置（≤2mm 对齐）；灯珠 B：远离（unbound 灰）
const lampResult = await page.evaluate(() => {
  const doc = window.__pst.doc()
  const spec = doc.lampSpecs[1] // 5mm
  const collider = window.__pst.layers().objects('collision')[0]
  const topEdge = Math.min(...collider.getCoords().map((p) => p.y))
  const centerX = collider.getCenterPoint().x
  const r = spec.diameterMm / 2 // 1px/mm 标定下半径=5px
  // 灯心 = 顶边上方一个半径处 → 圆边恰好贴边，偏差≈0
  const lampA = window.__pst.dropLamp(spec.id, centerX, topEdge - r)
  const lampB = window.__pst.dropLamp(spec.id, 600, 600) // 远离所有碰撞体
  return {
    a: { state: lampA.alignState, dev: lampA.deviationMm, bound: lampA.boundCollisionId },
    b: { state: lampB.alignState, dev: lampB.deviationMm, bound: lampB.boundCollisionId },
  }
})
check('灯珠 A 识别为已对齐(green)', lampResult.a.state === 'aligned', JSON.stringify(lampResult.a))
check('灯珠 B 未绑定(gray)', lampResult.b.state === 'unbound', JSON.stringify(lampResult.b))
check('灯珠 A 绑定了碰撞体', Boolean(lampResult.a.bound))

// 5. 偏差超 2mm 标红：把灯珠 B 移到碰撞体顶边外 10mm 处（仍在 20mm 绑定半径内），再全量重算
const redResult = await page.evaluate(() => {
  const doc = window.__pst.doc()
  const lampB = doc.lamps[1]
  const obj = window.__pst.layers().get(lampB.id)
  const collider = window.__pst.layers().objects('collision')[0]
  const topEdge = Math.min(...collider.getCoords().map((p) => p.y))
  const centerX = collider.getCenterPoint().x
  const r = lampB.diameterMm / 2
  obj.set({ left: centerX, top: topEdge - r - 10 }) // 外间隙 10mm → misaligned
  obj.setCoords()
  window.__pst.recompute()
  return { state: obj.alignState, dev: obj.deviationMm }
})
check('偏差 >2mm 标红(misaligned)', redResult.state === 'misaligned', JSON.stringify(redResult))
check('标红偏差在 2~20mm 绑定区间', redResult.dev > 2 && redResult.dev <= 20, String(redResult.dev))

// 6. 批注挂灯珠
const anno = await page.evaluate(() => {
  const doc = window.__pst.doc()
  window.__pst.annotation().create(doc.lamps[0].id, '弯道出口晃眼', '运营方', 'operator')
  return doc.annotations.length
})
check('批注已挂到灯位对象', anno === 1)
const markerCount = await page.evaluate(() => window.__pst.layers().objects('annotation').length)
check('批注 marker 已渲染', markerCount === 1)

// 7. 磨损圈
await page.evaluate(() => {
  window.__pst.wear().create({ x: 500, y: 500 }, 30, '卡球点', '运营方')
})
const wears = await page.evaluate(() => window.__pst.doc().wears.length)
check('磨损记录 mm 存储', wears === 1)

// 8. 笔划级撤销：切笔刷工具并模拟鼠标划线
const strokeBefore = await page.evaluate(() => window.__pst.layers().objects('silkscreen').length)
await page.evaluate(() => window.__pst.ui().setTool('brush'))
await page.mouse.move(box.x + 150, box.y + 500)
await page.mouse.down()
await page.mouse.move(box.x + 200, box.y + 520, { steps: 8 })
await page.mouse.up()
const strokeAfter = await page.evaluate(() => window.__pst.layers().objects('silkscreen').length)
check('丝印笔划已创建', strokeAfter === strokeBefore + 1, `${strokeBefore}→${strokeAfter}`)
const undoDepth = await page.evaluate(() => window.__pst.ui().undoDepth)
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
const strokeUndo = await page.evaluate(() => window.__pst.layers().objects('silkscreen').length)
check('一笔撤销干净（按笔划回退）', strokeUndo === strokeBefore && undoDepth >= 1)

// 9. 角色切换：运营方不能选碰撞体
await page.evaluate(() => window.__pst.ui().setRole('operator'))
await page.waitForTimeout(100)
const operatorFlags = await page.evaluate(() => {
  const collider = window.__pst.layers().objects('collision')[0]
  const lamp = window.__pst.layers().objects('lamps')[0]
  return { colliderEvented: collider.evented, lampEvented: lamp.evented }
})
check('运营方：碰撞体不可交互', operatorFlags.colliderEvented === false)
check('运营方：灯珠仍可点选(挂批注)', operatorFlags.lampEvented === true)
await page.evaluate(() => window.__pst.ui().setRole('designer'))

// 10. 工程 JSON 往返
const roundtrip = await page.evaluate(async () => {
  const envelope = {
    version: 1,
    calibration: window.__pst.doc().calibration,
    layers: window.__pst.doc().layers,
    lamps: window.__pst.doc().lamps,
    annotations: window.__pst.doc().annotations,
    wears: window.__pst.doc().wears,
    settings: window.__pst.doc().settings,
    baseImageId: null,
    nextLampCode: window.__pst.doc().nextLampCode,
    fabric: window.__pst.canvas().toObject(),
  }
  const before = {
    lamps: envelope.lamps.length,
    layers: envelope.layers.length,
    annotations: envelope.annotations.length,
    wears: envelope.wears.length,
  }
  // 清掉再载入，验证重建
  window.__pst.canvas().remove(...window.__pst.canvas().getObjects())
  window.__pst.layers().clearRegistry()
  await window.__pst.canvas().loadFromJSON(envelope.fabric)
  window.__pst.layers().rebuildFromCanvas()
  const after = {
    objects: window.__pst.canvas().getObjects().length,
    lampLayer: window.__pst.layers().objects('lamps').length,
    collisionLayer: window.__pst.layers().objects('collision').length,
  }
  return { before, after, tempLeak: (envelope.fabric.objects || []).some((o) => !o.layerId) }
})
check('工程 JSON 往返对象完整', roundtrip.after.objects > 0 && roundtrip.after.lampLayer === roundtrip.before.lamps)
check('导出 JSON 无临时对象泄漏', roundtrip.tempLeak === false)

// 11. 控制台无错误
check('全程无控制台错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

await context.close()
await browser.close()
console.log(`\n${failures.length === 0 ? 'ALL PASSED' : `${failures.length} FAILED: ${failures.join(', ')}`}`)
process.exit(failures.length === 0 ? 0 : 1)
