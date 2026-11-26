import * as THREE from 'three'
import { clamp } from './format'

export function pointToVector(p, origin = { east: 0, north: 0 }) {
  const east = Number(p.east ?? p.x ?? p.easting ?? 0) - (origin.east || 0)
  const north = Number(p.north ?? p.n ?? p.z ?? p.northing ?? p.y ?? 0) - (origin.north || 0)
  const elev = Number(p.elev ?? p.elevation ?? p.z ?? p.y ?? 0)
  return new THREE.Vector3(east, elev, north)
}

function horizontalDistance(a, b) {
  return Math.hypot(a.east - b.east, a.north - b.north)
}

export function gradeBetween(a, b) {
  const d = horizontalDistance(a, b)
  if (d < 1e-6) return 0
  return ((Number(b.elev) - Number(a.elev)) / d) * 100
}

export function horizontalRadius(a, b, c) {
  const ab = horizontalDistance(a, b)
  const bc = horizontalDistance(b, c)
  const ca = horizontalDistance(c, a)
  const cross2 = Math.abs(
    (b.east - a.east) * (c.north - a.north) -
    (b.north - a.north) * (c.east - a.east)
  )
  if (cross2 < 1e-7) return Infinity
  return (ab * bc * ca) / (2 * cross2)
}

export function buildControlMetrics(points) {
  return points.map((p, i) => {
    const prev = points[i - 1]
    const next = points[i + 1]
    let radius = Infinity
    if (prev && next) radius = horizontalRadius(prev, p, next)
    const gradeIn = prev ? gradeBetween(prev, p) : 0
    const gradeOut = next ? gradeBetween(p, next) : 0
    return {
      id: p.id,
      name: p.name || `CP${i + 1}`,
      radius,
      gradeIn,
      gradeOut,
      maxGrade: Math.max(Math.abs(gradeIn), Math.abs(gradeOut)),
      east: p.east,
      north: p.north,
      elev: p.elev
    }
  })
}

export function buildAlignment(axisPoints, origin) {
  const vectors = axisPoints.map(p => pointToVector(p, origin))
  const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal', 0.45)
  curve.arcLengthDivisions = 400
  const length = curve.getLength()

  const firstStation = Number.isFinite(Number(axisPoints[0]?.station)) ? Number(axisPoints[0].station) : 0
  const lastProvided = Number(axisPoints[axisPoints.length - 1]?.station)
  const lastStation = Number.isFinite(lastProvided) && lastProvided > firstStation
    ? lastProvided
    : firstStation + length

  // 计算每个控制点在弧长上的位置，用于尊重导入桩号
  const spanCount = Math.max(1, axisPoints.length - 1)
  const samplesPerSpan = 32
  const divisions = spanCount * samplesPerSpan
  const arcLengths = curve.getLengths(divisions)
  const controlArcs = axisPoints.map((_, i) => {
    const idx = clamp(i * samplesPerSpan, 0, arcLengths.length - 1)
    return arcLengths[idx] ?? 0
  })
  const stations = axisPoints.map((p, i) => {
    const s = Number(p.station)
    return Number.isFinite(s) ? s : firstStation + controlArcs[i]
  })

  function stationToArc(station) {
    if (stations.length < 2) return clamp(station - firstStation, 0, length)
    if (station <= stations[0]) {
      const ds = stations[1] - stations[0]
      const da = controlArcs[1] - controlArcs[0]
      const k = ds !== 0 ? (station - stations[0]) / ds : 0
      return clamp(controlArcs[0] + k * da, 0, length)
    }
    for (let i = 0; i < stations.length - 1; i++) {
      if (station <= stations[i + 1]) {
        const ds = stations[i + 1] - stations[i]
        const k = ds !== 0 ? (station - stations[i]) / ds : 0
        return THREE.MathUtils.lerp(controlArcs[i], controlArcs[i + 1], clamp(k, -0.5, 1.5))
      }
    }
    const i = stations.length - 2
    const ds = stations[i + 1] - stations[i]
    const da = controlArcs[i + 1] - controlArcs[i]
    const k = ds !== 0 ? (station - stations[i + 1]) / ds : 0
    return clamp(controlArcs[i + 1] + k * da, 0, length)
  }

  function pointAt(station) {
    const arc = stationToArc(station)
    const u = length > 1e-8 ? arc / length : 0
    const point = curve.getPointAt(clamp(u, 0, 1))
    const tangent = curve.getTangentAt(clamp(u, 0.0001, 0.9999)).normalize()
    return { point, tangent, arc }
  }

  function frameAt(tangent) {
    const worldUp = new THREE.Vector3(0, 1, 0)
    const side = new THREE.Vector3().crossVectors(worldUp, tangent)
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0)
    side.normalize()
    const up = new THREE.Vector3().crossVectors(tangent, side).normalize()
    return { side, up }
  }

  function buildBoundaries(interval) {
    const step = Math.max(1, Number(interval) || 10)
    const end = lastStation
    const list = [firstStation]
    let s = firstStation + step
    while (end - s > step * 0.35) {
      list.push(s)
      s += step
    }
    if (Math.abs(list[list.length - 1] - end) > 1e-6) list.push(end)
    return list
  }

  const boundaryStations = buildBoundaries(10) // replaced by caller via boundaries(interval)

  return {
    curve,
    length,
    firstStation,
    lastStation,
    stations,
    controlArcs,
    stationToArc,
    pointAt,
    frameAt,
    boundaries(interval) { return buildBoundaries(interval) }
  }
}

export function sampleAxisLine(alignment, count = 240) {
  const pts = []
  for (let i = 0; i <= count; i++) {
    const s = THREE.MathUtils.lerp(alignment.firstStation, alignment.lastStation, i / count)
    pts.push(alignment.pointAt(s).point)
  }
  return pts
}
