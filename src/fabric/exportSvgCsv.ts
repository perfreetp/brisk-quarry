import type { Envelope } from '@/types/doc'
import { tableRectPx } from '@/geometry/units'
import { getCanvas } from './canvasHolder'
import { layerService } from './layerService'
import { useDocumentStore } from '@/stores/document'
import { downloadText } from '@/utils/download'

const SVG_PREAMBLE = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
`

/**
 * 丝印层 SVG：直接对丝印对象逐个 toSVG() 再包外层 <svg>。
 * 不走 StaticCanvas 重建（Path 经 fromObject 反序列化会丢路径命令），
 * 也不改主画布显隐/clipPath。viewBox 用台面 px、width/height 用 mm 建立物理缩放。
 */
export function exportSilkscreenSvg(): void {
  const doc = useDocumentStore()
  const cal = doc.calibration
  if (!cal.done) throw new Error('请先完成台面标定再导出丝印图')

  const rect = tableRectPx(cal)
  const inner = layerService
    .objects('silkscreen')
    .map((o) => o.toSVG())
    .join('\n')
  const svg =
    SVG_PREAMBLE +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `version="1.1" width="${cal.tableWidthMm}mm" height="${cal.tableHeightMm}mm" ` +
    `viewBox="${rect.left} ${rect.top} ${rect.width} ${rect.height}" xml:space="preserve">\n` +
    `<desc>Playfield silkscreen export</desc>\n${inner}\n</svg>`
  downloadText(svg, `silkscreen_${Date.now()}.svg`, 'image/svg+xml;charset=utf-8')
}

/** 灯位坐标 CSV（UTF-8 BOM，Excel 中文不乱码） */
export function exportLampCsv(): void {
  const doc = useDocumentStore()
  const header = ['编号', 'X(mm)', 'Y(mm)', '直径(mm)', '绑定碰撞体', '偏差(mm)', '对齐状态', '未解决批注数']
  const stateText = { aligned: '已对齐', misaligned: '偏差', unbound: '未绑定' } as const
  const rows = doc.lamps.map((l) => [
    String(l.code),
    l.centerMm.x.toFixed(2),
    l.centerMm.y.toFixed(2),
    l.diameterMm.toFixed(2),
    l.boundCollisionId ?? '',
    l.deviationMm === null ? '' : l.deviationMm.toFixed(2),
    stateText[l.alignState],
    String(doc.annotationCountForLamp(l.id)),
  ])
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n')
  downloadText(`﻿${csv}`, `lamps_${Date.now()}.csv`, 'text/csv;charset=utf-8')
}

function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function buildEnvelope(fabricJson: Record<string, unknown>): Envelope {
  const doc = useDocumentStore()
  return {
    version: 1,
    calibration: JSON.parse(JSON.stringify(doc.calibration)),
    layers: JSON.parse(JSON.stringify(doc.layers)),
    lamps: JSON.parse(JSON.stringify(doc.lamps)),
    annotations: JSON.parse(JSON.stringify(doc.annotations)),
    wears: JSON.parse(JSON.stringify(doc.wears)),
    settings: JSON.parse(JSON.stringify(doc.settings)),
    baseImageId: doc.baseImageId,
    nextLampCode: doc.nextLampCode,
    fabric: fabricJson,
  }
}

export function serializeCanvas(): Record<string, unknown> {
  return getCanvas().toObject() as unknown as Record<string, unknown>
}

export function assertNoTempObjects(env: Envelope): string[] {
  const json = env.fabric as { objects?: Record<string, unknown>[] }
  const problems: string[] = []
  for (const o of json.objects ?? []) {
    if (!o.layerId) problems.push(`导出 JSON 含无 layerId 的临时对象: ${String(o.type)}`)
  }
  void layerService
  return problems
}
