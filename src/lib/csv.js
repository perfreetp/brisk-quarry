import { formatStation, downloadText } from './format'

function csvCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' && !Number.isFinite(value)) return ''
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function exportQuantityCsv(segments, totals, project = {}) {
  const headers = [
    '段编号', '起点桩号', '终点桩号', '段长_m', '起点高程_m', '终点高程_m', '纵坡_pct',
    '断面型式', '断面模板', '净面积_m2', '开挖面积_m2', '净方量_m3', '开挖方量_m3',
    '加密倍数', '是否穿插岩层', '穿插桩号范围', 'BVH干涉'
  ]
  const rows = segments.map(s => [
    s.name,
    formatStation(s.startStation),
    formatStation(s.endStation),
    s.length?.toFixed(3),
    s.startElev?.toFixed(3),
    s.endElev?.toFixed(3),
    s.grade?.toFixed(3),
    s.sectionTypeLabel,
    s.templateName,
    s.netArea?.toFixed(3),
    s.excavationArea?.toFixed(3),
    s.netVolume?.toFixed(2),
    s.excavationVolume?.toFixed(2),
    s.densityFactor || 1,
    s.intersects ? '是' : '否',
    s.intersects ? `${formatStation(s.startStation)}-${formatStation(s.endStation)}` : '',
    s.intersects ? 'true' : 'false'
  ])
  rows.push([])
  rows.push([
    '合计', '', '', totals.length?.toFixed(3), '', '', '', '', '', '', '',
    totals.netVolume?.toFixed(2), totals.excavationVolume?.toFixed(2), '', '',
    `穿插长度 ${totals.intersectLength?.toFixed(2)}m`, ''
  ])
  rows.push([])
  rows.push(['导出时间', new Date().toLocaleString('zh-CN')])
  rows.push(['轴线点数', project.pointCount])
  rows.push(['放样桩号间隔_m', project.interval])

  const csv = [headers, ...rows]
    .map(row => row.map(csvCell).join(','))
    .join('\r\n')
  downloadText(`隧洞开挖方量表_${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8')
}
