import { buildAlignment } from './alignment'
import { sectionMetrics, SECTION_TYPES } from './sections'
import { formatStation } from './format'

export function buildSegmentModel(state) {
  const origin = state.geoOrigin || { east: 0, north: 0 }
  const alignment = buildAlignment(state.axisPoints, origin)
  const template = state.templates.find(t => t.id === state.templateId) || state.templates[0]
  const metrics = sectionMetrics(template)
  const boundaries = alignment.boundaries(state.interval)

  const records = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startStation = boundaries[i]
    const endStation = boundaries[i + 1]
    const startSample = alignment.pointAt(startStation)
    const endSample = alignment.pointAt(endStation)
    const baseStartElev = startSample.point.y
    const baseEndElev = endSample.point.y
    const edit = state.verticalEdits?.[`seg-${i + 1}`]
    const startElev = Number.isFinite(edit?.startElev) ? edit.startElev : baseStartElev
    const endElev = Number.isFinite(edit?.endElev) ? edit.endElev : baseEndElev
    const length = Math.max(
      0.1,
      alignment.stationToArc(endStation) - alignment.stationToArc(startStation)
    )
    const densityFactor = Math.max(1, Number(state.density?.[`seg-${i + 1}`] || 1))
    const grade = ((endElev - startElev) / length) * 100

    records.push({
      id: `seg-${i + 1}`,
      index: i,
      name: `第${i + 1}段`,
      startStation,
      endStation,
      startLabel: formatStation(startStation),
      endLabel: formatStation(endStation),
      stationRange: `${formatStation(startStation)}–${formatStation(endStation)}`,
      length,
      chainageLength: endStation - startStation,
      baseStartElev,
      baseEndElev,
      startElev,
      endElev,
      grade,
      densityFactor,
      sectionSpacing: (endStation - startStation) / densityFactor,
      templateId: template.id,
      templateName: template.name,
      sectionType: template.type,
      sectionTypeLabel: SECTION_TYPES[template.type] || template.type,
      netArea: metrics.netArea,
      excavationArea: metrics.excavationArea,
      perimeter: metrics.perimeter,
      netVolume: metrics.netArea * length,
      excavationVolume: metrics.excavationArea * length,
      triangles: 0,
      intersects: false,
      intersectionDetail: null,
      bvhHitMs: 0
    })
  }

  const issues = []
  const tolerance = Number(state.joinTolerance ?? 0.03)
  const maxGrade = Number(state.maxGrade ?? 8)

  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1]
    const cur = records[i]
    const gap = prev.endElev - cur.startElev
    cur.joinGap = gap
    if (Math.abs(gap) > tolerance) {
      issues.push({
        id: `join-${prev.id}-${cur.id}`,
        type: 'join',
        severity: 'error',
        segmentId: cur.id,
        anchorSegmentIds: [prev.id, cur.id],
        station: cur.startStation,
        stationLabel: formatStation(cur.startStation),
        title: `${prev.name} 与 ${cur.name} 高程对不齐`,
        message: `交界 ${formatStation(cur.startStation)} 处错台 ${gap >= 0 ? '+' : ''}${gap.toFixed(3)} m，超过 ${tolerance.toFixed(2)} m 容差。`,
        gap
      })
    }
  }

  for (const seg of records) {
    if (Math.abs(seg.grade) > maxGrade) {
      issues.push({
        id: `grade-${seg.id}`,
        type: 'grade',
        severity: 'warning',
        segmentId: seg.id,
        station: seg.startStation,
        stationLabel: seg.stationRange,
        title: `${seg.name} 纵坡偏陡`,
        message: `坡度 ${seg.grade.toFixed(2)}%，超过控制限值 ${maxGrade.toFixed(1)}%；相邻段需按共享边界顺接。`,
        grade: seg.grade
      })
    }
  }

  const totals = records.reduce((acc, s) => {
    acc.count += 1
    acc.length += s.length
    acc.netVolume += s.netVolume
    acc.excavationVolume += s.excavationVolume
    if (s.intersects) acc.intersectLength += s.length
    return acc
  }, { count: 0, length: 0, netVolume: 0, excavationVolume: 0, intersectLength: 0 })

  return { alignment, template, metrics, boundaries, records, issues, totals }
}
