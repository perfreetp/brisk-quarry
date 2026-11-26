import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4317', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
// 主管选 DN25 并收紧允许压降，制造标黄段
await page.locator('.sidebar-left select').first().selectOption({ index: 2 })
await page.waitForTimeout(200)
await page.getByText('主管单段允许压降').locator('..').locator('input').fill('0.01')
await page.waitForTimeout(400)
const state = await page.evaluate(() => window.__irrigation.network)
console.log('超压降段数:', state.segments.filter((s) => s.overDrop).length)
console.log('水力告警数:', state.issues.filter((i) => i.type !== 'aisle').length)
// 点一个标黄段，验证建议文案
// 点一个标黄段（选较长的段并在段中部点击，避开两端三通手柄）
const yellow = [...state.segments].filter((s) => s.overDrop).sort((a, b) => b.length - a.length)[0]
if (yellow) {
  const box = await page.locator('canvas').boundingBox()
  const cx = box.x + 44 + ((yellow.x1 + yellow.x2) / 2) * 11
  const cy = box.y + 44 + state.params.mainOffset * 11
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(200)
  const sel = await page.evaluate(() => window.__irrigation.selection)
  console.log('选中对象:', JSON.stringify(sel), '目标段:', yellow.key)
  const insp = await page.locator('.inspector').innerText()
  console.log('--- 检查器 ---')
  console.log(insp)
  console.log('检查器含加粗建议:', /加粗/.test(insp), '| 含缩短建议:', /缩短/.test(insp))
}
await page.screenshot({ path: 'scripts/e2e-yellow-scenario.png' })
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
await browser.close()
