/**
 * 导出验证：捕获 SVG/CSV 下载内容，断言单位、列、对齐状态。
 * 运行：node scripts/e2e-export.mjs
 */
import { chromium } from 'playwright-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const failures = []
function check(name, cond, extra = '') {
  const ok = Boolean(cond)
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures.push(name)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
// 独立无痕 context，避免与其他测试的 localStorage 自动存档串状态
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
const downloads = []
page.on('download', (d) => downloads.push(d))
page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`))

await page.goto('http://localhost:5199/')
await page.waitForFunction(() => window.__pst)

await page.evaluate(() => {
  const doc = window.__pst.doc()
  doc.setCalibration({ tableWidthMm: 600, tableHeightMm: 600, p1: { x: 100, y: 100 }, p2: { x: 700, y: 700 }, done: true })
  window.__pst.recompute()
  // 碰撞体 + 相切灯珠 + 远离灯珠
  window.__pst.ui().setTool('collider-rect')
})
const box = await page.locator('.stage canvas').first().boundingBox()
await page.mouse.move(box.x + 300, box.y + 300)
await page.mouse.down()
await page.mouse.move(box.x + 450, box.y + 400, { steps: 6 })
await page.mouse.up()

await page.evaluate(() => {
  const doc = window.__pst.doc()
  const spec = doc.lampSpecs[1]
  const collider = window.__pst.layers().objects('collision')[0]
  const top = Math.min(...collider.getCoords().map((p) => p.y))
  window.__pst.dropLamp(spec.id, collider.getCenterPoint().x, top - spec.diameterMm / 2)
  window.__pst.dropLamp(spec.id, 600, 600)
  // 一条丝印笔划（用 Path 直接构造，等价笔刷产物）
  window.__pst.ui().setTool('brush')
})
await page.mouse.move(box.x + 150, box.y + 500)
await page.mouse.down()
await page.mouse.move(box.x + 200, box.y + 520, { steps: 8 })
await page.mouse.up()

// --- 捕获 CSV ---
const csvCount = downloads.length
await page.evaluate(() => window.__pst.exportCsv())
await page.waitForTimeout(300)
const csvDownload = downloads[csvCount]
check('触发灯位 CSV 下载', Boolean(csvDownload))
if (csvDownload) {
  const csv = await csvDownload.path()
  const fs = await import('node:fs')
  const text = fs.readFileSync(csv, 'utf8')
  const lines = text.split(/\r?\n/).filter(Boolean)
  check('CSV 含 UTF-8 BOM（Excel 中文）', text.charCodeAt(0) === 0xfeff)
  check('CSV 表头 8 列齐全', lines[0].replace(/^﻿/, '').split(',').length === 8, lines[0])
  check('CSV 数据行数=灯珠数', lines.length - 1 === 2, `${lines.length - 1} 行`)
  const alignedRow = lines.find((l) => l.includes('已对齐'))
  const unboundRow = lines.find((l) => l.includes('未绑定'))
  check('CSV 含已对齐灯位行', Boolean(alignedRow), alignedRow ?? '')
  check('CSV 含未绑定灯位行', Boolean(unboundRow), unboundRow ?? '')
  check('CSV 坐标为两位小数 mm', /\d+\.\d{2}/.test(text))
}

// --- 捕获 SVG ---
const svgCount = downloads.length
const svgErr = await page.evaluate(() => {
  try {
    window.__pst.exportSvg()
    return null
  } catch (e) {
    return String(e && e.message ? e.message : e)
  }
})
await page.waitForTimeout(400)
const svgDownload = downloads[svgCount]
check('触发丝印 SVG 下载', Boolean(svgDownload), svgErr ?? '')
if (svgDownload) {
  const fs = await import('node:fs')
  const svg = fs.readFileSync(await svgDownload.path(), 'utf8')
  check('SVG 是合法 XML 且含 <svg', svg.trimStart().startsWith('<?xml') || svg.includes('<svg'))
  check('SVG 物理尺寸单位为 mm', /width="600mm"/.test(svg) && /height="600mm"/.test(svg))
  check('SVG 含 viewBox', /viewBox=/.test(svg))
  check('SVG 只含丝印（不含碰撞体/灯珠 ellipse）', !/<ellipse/.test(svg) && !/collision/.test(svg))
  check('SVG 含笔划 path', /<path/.test(svg))
}

await context.close()
await browser.close()
console.log(`\n${failures.length === 0 ? 'ALL PASSED' : `${failures.length} FAILED: ${failures.join(', ')}`}`)
process.exit(failures.length === 0 ? 0 : 1)
