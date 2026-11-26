import { parseStation, uid } from './format'

function splitLine(line, delimiter) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (ch === delimiter && !quoted) {
      out.push(cur.trim()); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur.trim())
  return out
}

export function parseTable(text) {
  const clean = String(text).replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'))
  if (!lines.length) return { headers: [], rows: [], objects: [] }
  const first = lines[0]
  let delimiter = ','
  if (first.includes('\t')) delimiter = '\t'
  else if ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) delimiter = ';'
  else if (!first.includes(',') && /\s+/.test(first.trim())) delimiter = /\s+/
  const split = (line) => delimiter instanceof RegExp
    ? line.trim().split(delimiter).filter(Boolean)
    : splitLine(line, delimiter)
  const headers = split(first).map(h => h.replace(/^["']|["']$/g, ''))
  const rows = lines.slice(1).map(line => split(line))
  const objects = rows.map(cells => {
    const o = {}
    headers.forEach((h, i) => { o[h] = cells[i] })
    return o
  })
  return { headers, rows, objects }
}

function normKey(k) {
  return String(k || '').trim().toLowerCase()
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[\s_\-./\\]/g, '')
}

function getField(row, aliases) {
  const map = {}
  for (const k of Object.keys(row)) map[normKey(k)] = row[k]
  for (const alias of aliases) {
    const key = normKey(alias)
    if (map[key] !== undefined && map[key] !== '') return map[key]
  }
  // 包含匹配，例如“轴线东坐标(m)”
  for (const alias of aliases) {
    const key = normKey(alias)
    const found = Object.keys(map).find(k => k.includes(key))
    if (found && map[found] !== '') return map[found]
  }
  return undefined
}

function num(v) {
  if (v === undefined || v === null || v === '') return NaN
  return Number(String(v).replace(/[^\d.\-+eE]/g, ''))
}

const EAST_KEYS = ['east', 'easting', 'x', 'xcoordinate', '东坐标', '横坐标']
const NORTH_KEYS = ['north', 'northing', 'n', 'y', 'ycoordinate', '北坐标', '纵坐标']
const ELEV_KEYS = ['elev', 'elevation', 'z', 'height', 'h', '高程', '海拔', '地面高程']
const STATION_KEYS = ['station', 'chainage', 'ch', 'stake', 'mileage', '桩号', '里程', '中心桩号']

export function parseAxisText(text, filename = '') {
  if (filename.toLowerCase().endsWith('.json')) {
    const json = JSON.parse(text)
    const arr = Array.isArray(json) ? json : json.axis || json.points || json.data || []
    return finalizeAxis(arr.map((p, i) => normalizeAxisRow(p, i)))
  }
  const { objects } = parseTable(text)
  const points = objects.map((row, i) => normalizeAxisRow(row, i)).filter(Boolean)
  return finalizeAxis(points)
}

function normalizeAxisRow(row, index) {
  const east = num(getField(row, EAST_KEYS))
  const north = num(getField(row, NORTH_KEYS))
  const elev = num(getField(row, ELEV_KEYS))
  if (![east, north, elev].every(Number.isFinite)) return null
  const stationRaw = getField(row, STATION_KEYS)
  const station = stationRaw === undefined ? NaN : parseStation(stationRaw, NaN)
  const name = getField(row, ['name', 'id', '编号', '点名', '控制点']) || `CP${index + 1}`
  return {
    id: uid('cp'),
    name: String(name),
    station: Number.isFinite(station) ? station : null,
    east, north, elev
  }
}

function finalizeAxis(points) {
  if (points.length < 2) throw new Error('轴线至少需要两个包含东坐标、北坐标和高程的控制点')
  let needStations = points.some(p => p.station === null || !Number.isFinite(p.station))
  if (needStations) {
    let acc = points[0].station ?? 0
    points[0].station = acc
    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(points[i].east - points[i - 1].east, points[i].north - points[i - 1].north)
      acc += d
      points[i].station = acc
    }
  }
  points.sort((a, b) => a.station - b.station)
  return { points, warnings: [] }
}

export function parseSurfaceText(text, filename = '', source = 'terrain') {
  const name = filename || (source === 'rock' ? '岩层分界面' : '地形DEM')
  if (filename.toLowerCase().endsWith('.json')) {
    const json = JSON.parse(text)
    if (json.points && !json.cols) return pointsToGrid(json.points, name, source)
    return gridFromJson(json, name, source)
  }

  const head = text.slice(0, 1200)
  if (/ncols/i.test(head) && /nrows/i.test(head)) return parseAsc(text, name, source)

  const { objects } = parseTable(text)
  if (!objects.length) throw new Error('未识别到有效的表面数据行')

  const first = objects[0]
  const hasStation = getField(first, STATION_KEYS) !== undefined
  const east0 = num(getField(first, EAST_KEYS))
  const north0 = num(getField(first, NORTH_KEYS))

  if (hasStation && (!Number.isFinite(east0) || !Number.isFinite(north0))) {
    const pts = objects.map(row => ({
      station: parseStation(getField(row, STATION_KEYS), NaN),
      elev: num(getField(row, ELEV_KEYS))
    })).filter(p => Number.isFinite(p.station) && Number.isFinite(p.elev))
      .sort((a, b) => a.station - b.station)
    if (pts.length < 2) throw new Error('地质剖面至少需要两行“桩号,高程”数据')
    return {
      kind: 'profile', source, name,
      width: source === 'rock' ? 76 : 60,
      crossSegments: 14,
      alongStep: Math.max(2, (pts[pts.length - 1].station - pts[0].station) / 48),
      crossSlope: 0,
      points: pts
    }
  }

  const pts = objects.map(row => ({
    east: num(getField(row, EAST_KEYS)),
    north: num(getField(row, NORTH_KEYS)),
    elev: num(getField(row, ELEV_KEYS))
  })).filter(p => [p.east, p.north, p.elev].every(Number.isFinite))
  if (pts.length < 4) throw new Error('表面XYZ数据不足，至少需要4个点')
  return pointsToGrid(pts, name, source)
}

function parseAsc(text, name, source) {
  const tokens = text.trim().split(/\s+/)
  let cursor = 0
  const header = {}
  const numberToken = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/
  while (cursor < tokens.length) {
    const keyToken = tokens[cursor]
    // 到达栅格数据后立即停止；数据值和下一个值也都是数字，不能按 header key/value 解析
    if (numberToken.test(keyToken)) break
    const key = keyToken.toLowerCase()
    const valueToken = tokens[cursor + 1]
    if (valueToken !== undefined && numberToken.test(valueToken)) {
      header[key] = Number(valueToken)
      cursor += 2
    } else {
      cursor += 1
    }
  }
  const cols = header.ncols
  const rows = header.nrows
  const cell = header.cellsize
  if (!cols || !rows || !cell) throw new Error('ASC DEM头信息不完整')
  const data = tokens.slice(cursor).map(Number).filter(Number.isFinite)
  if (data.length < cols * rows) throw new Error('ASC DEM栅格数据行数不足')
  const raw = data.slice(0, cols * rows)
  const values = new Float32Array(cols * rows)
  const noData = header.nodata_value ?? -9999
  // ASC 第一行对应最北侧；转成 r=0 为南侧
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = raw[(rows - 1 - r) * cols + c]
      values[r * cols + c] = v === noData ? NaN : v
    }
  }
  return {
    kind: 'grid', source, name, cols, rows,
    minEast: header.xllcorner ?? 0,
    minNorth: header.yllcorner ?? 0,
    cellEast: cell, cellNorth: cell,
    values
  }
}

function gridFromJson(json, name, source) {
  const cols = json.cols || json.ncols || json.width
  const rows = json.rows || json.nrows || json.height
  if (!cols || !rows || !json.values) throw new Error('JSON栅格需包含 cols、rows、values')
  return {
    kind: 'grid', source, name, cols, rows,
    minEast: json.minEast ?? json.xllcorner ?? 0,
    minNorth: json.minNorth ?? json.yllcorner ?? 0,
    cellEast: json.cellEast ?? json.cellSize ?? json.cellsize ?? 1,
    cellNorth: json.cellNorth ?? json.cellSize ?? json.cellsize ?? 1,
    values: new Float32Array(json.values)
  }
}

function pointsToGrid(points, name, source) {
  const eastVals = [...new Set(points.map(p => Math.round(p.east * 1000) / 1000))].sort((a, b) => a - b)
  const northVals = [...new Set(points.map(p => Math.round(p.north * 1000) / 1000))].sort((a, b) => a - b)
  const regular = eastVals.length * northVals.length === points.length && eastVals.length > 1 && northVals.length > 1

  if (regular) {
    const cols = eastVals.length
    const rows = northVals.length
    const eastIndex = new Map(eastVals.map((v, i) => [v, i]))
    const northIndex = new Map(northVals.map((v, i) => [v, i]))
    const values = new Float32Array(cols * rows).fill(NaN)
    for (const p of points) {
      const c = eastIndex.get(Math.round(p.east * 1000) / 1000)
      const r = northIndex.get(Math.round(p.north * 1000) / 1000)
      if (c !== undefined && r !== undefined) values[r * cols + c] = p.elev
    }
    return {
      kind: 'grid', source, name, cols, rows,
      minEast: eastVals[0], minNorth: northVals[0],
      cellEast: eastVals[1] - eastVals[0],
      cellNorth: northVals[1] - northVals[0],
      values
    }
  }

  // 散点DEM：构建约 110 列的 IDW 栅格
  const minEast = Math.min(...points.map(p => p.east))
  const maxEast = Math.max(...points.map(p => p.east))
  const minNorth = Math.min(...points.map(p => p.north))
  const maxNorth = Math.max(...points.map(p => p.north))
  const cols = 110
  const rows = Math.max(24, Math.round(cols * (maxNorth - minNorth) / Math.max(1, maxEast - minEast)))
  const cellEast = (maxEast - minEast) / (cols - 1)
  const cellNorth = (maxNorth - minNorth) / (rows - 1)
  const values = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = minEast + c * cellEast
      const y = minNorth + r * cellNorth
      let wsum = 0, vsum = 0
      for (const p of points) {
        const d2 = (p.east - x) ** 2 + (p.north - y) ** 2
        if (d2 < 1e-8) { wsum = 1; vsum = p.elev; break }
        const w = 1 / d2
        wsum += w; vsum += w * p.elev
      }
      values[r * cols + c] = vsum / Math.max(1e-9, wsum)
    }
  }
  return { kind: 'grid', source, name, cols, rows, minEast, minNorth, cellEast, cellNorth, values }
}
