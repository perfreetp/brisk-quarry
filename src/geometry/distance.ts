import type { Vec2 } from './units'

export interface SegmentHit {
  /** 轮廓上最近点 */
  q: Vec2
  /** p 到 q 的距离 */
  dist: number
  /** 线段参数 0..1 */
  t: number
  edgeId: string
}

export interface EdgeHit extends SegmentHit {
  /** 单位外法向（背离多边形质心） */
  outwardNormal: Vec2
}

export interface CollisionBodyMm {
  id: string
  kind: 'polygon' | 'circle'
  polygon?: Vec2[]
  center?: Vec2
  radiusMm?: number
}

export interface NearestResult {
  bodyId: string
  q: Vec2
  distMm: number
  edgeId: string
  outwardNormal: Vec2
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

function len(v: Vec2): number {
  return Math.hypot(v.x, v.y)
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s }
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

/** 点到线段最近点 */
export function pointToSegment(p: Vec2, a: Vec2, b: Vec2): { q: Vec2; dist: number; t: number } {
  const ab = sub(b, a)
  const abLen2 = dot(ab, ab)
  if (abLen2 === 0) {
    return { q: { ...a }, dist: len(sub(p, a)), t: 0 }
  }
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / abLen2))
  const q = { x: a.x + ab.x * t, y: a.y + ab.y * t }
  return { q, dist: len(sub(p, q)), t }
}

function centroid(poly: Vec2[]): Vec2 {
  const sum = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / poly.length, y: sum.y / poly.length }
}

/** 多边形上离 p 最近的边，外法向按背离质心定向（与绕向无关） */
export function nearestOnPolygon(p: Vec2, poly: Vec2[]): EdgeHit | null {
  if (poly.length < 2) return null
  const c = centroid(poly)
  let best: EdgeHit | null = null
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const hit = pointToSegment(p, a, b)
    if (!best || hit.dist < best.dist) {
      const edge = sub(b, a)
      const el = len(edge) || 1
      // 两条候选法向
      const n1 = { x: -edge.y / el, y: edge.x / el }
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const outward = dot(n1, sub(mid, c)) >= 0 ? n1 : { x: -n1.x, y: -n1.y }
      best = { ...hit, edgeId: `e${i}`, outwardNormal: outward }
    }
  }
  return best
}

function nearestOnCircle(p: Vec2, body: CollisionBodyMm): NearestResult {
  const c = body.center!
  const r = body.radiusMm!
  const dir = sub(p, c)
  const d = len(dir) || 1
  const outward = { x: dir.x / d, y: dir.y / d }
  const q = { x: c.x + outward.x * r, y: c.y + outward.y * r }
  return { bodyId: body.id, q, distMm: len(sub(p, q)), edgeId: 'circle', outwardNormal: outward }
}

/** 多碰撞体取最近者 */
export function nearestAmongBodies(p: Vec2, bodies: CollisionBodyMm[]): NearestResult | null {
  let best: NearestResult | null = null
  for (const body of bodies) {
    let hit: NearestResult | null
    if (body.kind === 'circle') {
      hit = nearestOnCircle(p, body)
    } else {
      const eh = nearestOnPolygon(p, body.polygon ?? [])
      hit = eh ? { bodyId: body.id, q: eh.q, distMm: eh.dist, edgeId: eh.edgeId, outwardNormal: eh.outwardNormal } : null
    }
    if (hit && (!best || hit.distMm < best.distMm)) best = hit
  }
  return best
}

/**
 * 有向间隙：灯珠圆边与碰撞体轮廓的偏差(mm)。
 * 外侧为正间隙，内侧为负穿透。|deviation| <= 阈值视为对齐。
 */
export function signedDeviation(lampCenter: Vec2, radiusMm: number, hit: NearestResult): number {
  const side = dot(sub(lampCenter, hit.q), hit.outwardNormal) >= 0 ? 1 : -1
  return side * hit.distMm - radiusMm
}

/** 松手磁吸目标灯心(mm)；偏差超阈值返回 null */
export function computeSnap(
  lampCenter: Vec2,
  radiusMm: number,
  hit: NearestResult,
  thresholdMm: number,
): Vec2 | null {
  const deviation = signedDeviation(lampCenter, radiusMm, hit)
  if (Math.abs(deviation) > thresholdMm) return null
  const side = dot(sub(lampCenter, hit.q), hit.outwardNormal) >= 0 ? 1 : -1
  return {
    x: hit.q.x + hit.outwardNormal.x * side * radiusMm,
    y: hit.q.y + hit.outwardNormal.y * side * radiusMm,
  }
}

export const _internals = { sub, len, scale, dot }
