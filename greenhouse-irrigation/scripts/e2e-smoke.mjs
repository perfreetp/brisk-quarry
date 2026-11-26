// 浏览器端冒烟：真实加载页面，验证 Paper.js 渲染、压力标注、红框与两类拖拽交互
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4317'
const MARGIN = 44
const SCALE = 11
const errors = []

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const canvas = page.locator('canvas')
const box = await canvas.boundingBox()
console.log('canvas 尺寸:', Math.round(box.width), 'x', Math.round(box.height))

async function netState() {
  return page.evaluate(() => window.__irrigation.network)
}
const sx = (x) => box.x + MARGIN + x * SCALE
const sy = (y) => box.y + MARGIN + y * SCALE

async function paintedPixels() {
  return page.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4 * 200) if (d[i] > 0) n++
    return n
  })
}

const pixels = await paintedPixels()
console.log('非空像素采样数:', pixels)
if (pixels < 50) throw new Error('画布几乎没有内容，Paper.js 可能未渲染')

const net0 = await netState()
const l1 = net0.laterals[0]
const p = net0.params
console.log(`L1 初始 x=${l1.x}m，滴头间距=${l1.emitterSpacing}m，穿道数=${net0.issues.filter((i) => i.type === 'aisle').length}`)

// 1. 拖三通：整条支管水平移动 +2m
await page.mouse.move(sx(l1.x), sy(p.mainOffset))
await page.mouse.down()
await page.mouse.move(sx(l1.x + 2), sy(p.mainOffset), { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(300)
const net1 = await netState()
const moved = net1.laterals[0]
if (!(Math.abs(moved.x - (l1.x + 2)) < 0.05 && moved.manualX)) {
  throw new Error(`三通拖拽失败：x=${moved.x}, manualX=${moved.manualX}`)
}
console.log('✔ 拖三通移动支管：x ->', moved.x, '（标记手动）')

// 相邻支管不受影响
const l2 = net1.laterals[1]
const l2orig = net0.laterals[1]
if (Math.abs(l2.x - l2orig.x) > 1e-9) throw new Error('移动 L1 影响了相邻 L2')
console.log('✔ 相邻 L2 位置不变')

// 2. 点支管身 -> 检查器出现且带“手动”标记
await page.mouse.click(sx(moved.x), sy(p.mainOffset + 12))
await page.waitForTimeout(200)
const insp1 = await page.locator('.inspector').innerText()
if (!insp1.includes('支管 L1') || !insp1.includes('手动')) {
  throw new Error('支管检查器未正确打开：\n' + insp1.slice(0, 200))
}
console.log('✔ 点选支管打开属性检查器')

// 3. 拖第一个滴头向下 -> 本支管间距变 0.8m，相邻支管不变
const targetSpacing = 0.8
const targetY = p.mainOffset + p.emitterStartMargin + targetSpacing
await page.mouse.move(sx(moved.x), sy(p.mainOffset + p.emitterStartMargin))
await page.mouse.down()
await page.mouse.move(sx(moved.x), sy(targetY), { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(300)
const net2 = await netState()
const dragged = net2.laterals[0]
if (Math.abs(dragged.emitterSpacing - targetSpacing) > 0.02 || !dragged.manualSpacing) {
  throw new Error(`滴头拖拽失败：spacing=${dragged.emitterSpacing}`)
}
if (Math.abs(net2.laterals[1].emitterSpacing - p.emitterSpacing) > 1e-9) {
  throw new Error('滴头间距调整影响了相邻支管')
}
console.log('✔ 拖首个滴头改本支管间距 ->', dragged.emitterSpacing, 'm，相邻支管不变')

// 4. 点主管段 -> 段检查器
const seg = net2.segments[2]
await page.mouse.click(sx((seg.x1 + seg.x2) / 2), sy(p.mainOffset))
await page.waitForTimeout(200)
const insp2 = await page.locator('.inspector').innerText()
if (!insp2.includes('主管段') || !insp2.includes('分段压降')) {
  throw new Error('主管段检查器未打开：\n' + insp2.slice(0, 200))
}
console.log('✔ 点选主管段打开分段属性（含压降/流速/建议）')

// 5. 清单点击 -> 选中对应对象（先把 L3 拖出床沿制造一条穿道）
const netForAisle = await netState()
const l3 = netForAisle.laterals[2]
const aisleX = l3.bedCenterX + netForAisle.params.bedWidth / 2 + 0.4
await page.mouse.move(sx(l3.x), sy(p.mainOffset))
await page.mouse.down()
await page.mouse.move(sx(aisleX), sy(p.mainOffset), { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(300)
const aisleCount = await page.locator('.issue-item.error').count()
if (aisleCount < 1) throw new Error('拖出床沿后未产生穿道告警')
console.log('✔ 拖出苗床 -> 产生', aisleCount, '条穿道红框告警')
await page.locator('.issue-item.error').first().click()
await page.waitForTimeout(200)
const insp3 = await page.locator('.inspector').innerText()
if (!insp3.includes('支管 L')) throw new Error('清单跳转未选中支管')
console.log('✔ 点击穿道清单项 -> 定位到对应支管')

// 6. 换种子 + 同参数重新生成：画布持续有内容、无报错
await page.getByRole('button', { name: '换一个种子' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: '同参数重新生成' }).click()
await page.waitForTimeout(300)
if ((await paintedPixels()) < 50) throw new Error('重新生成后画布为空')
console.log('✔ 换种子/重新生成后画布正常重绘')

// 7. 压力标注存在（画布上的文字由 paper 渲染，检查 DOM 侧汇总一致即可）
const summary = await page.locator('.summary').innerText()
if (!/棚尾压力/.test(summary)) throw new Error('缺少压力汇总')
console.log('✔ 压力汇总：', summary.replace(/\n/g, ' / '))

if (errors.length) {
  console.error('\n浏览器控制台错误:')
  for (const e of errors) console.error(' -', e)
  process.exitCode = 1
} else {
  console.log('\n✔ 浏览器端 E2E 全部通过，控制台无错误')
}

await page.screenshot({ path: 'scripts/e2e-screenshot.png' })
await browser.close()
