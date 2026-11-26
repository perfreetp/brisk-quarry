import { describe, expect, it } from 'vitest'
import { computeSnap, nearestAmongBodies, nearestOnPolygon, pointToSegment, signedDeviation, type CollisionBodyMm } from './distance'
import type { Vec2 } from './units'

// 正方形碰撞体 (0,0)-(10,10)
const square: Vec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('distance 对齐几何', () => {
  it('点到线段：内部投影与端点退化', () => {
    const mid = pointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    expect(mid.q).toEqual({ x: 5, y: 0 })
    expect(mid.dist).toBe(3)
    expect(mid.t).toBeCloseTo(0.5)
    const end = pointToSegment({ x: 15, y: 2 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    expect(end.q).toEqual({ x: 10, y: 0 })
    expect(end.t).toBe(1)
    const zero = pointToSegment({ x: 1, y: 1 }, { x: 3, y: 3 }, { x: 3, y: 3 })
    expect(zero.dist).toBeCloseTo(Math.hypot(2, 2))
  })

  it('多边形最近边与外法向（顺时针/逆时针均背离质心）', () => {
    const hit = nearestOnPolygon({ x: 5, y: -4 }, square)!
    expect(hit.q).toEqual({ x: 5, y: 0 })
    expect(hit.outwardNormal.y).toBe(-1)
    expect(hit.outwardNormal.x).toBeCloseTo(0)
    const reversed = nearestOnPolygon({ x: 5, y: -4 }, [...square].reverse())!
    expect(reversed.outwardNormal.y).toBe(-1)
  })

  it('多体取最近', () => {
    const bodies: CollisionBodyMm[] = [
      { id: 'a', kind: 'polygon', polygon: square },
      { id: 'b', kind: 'circle', center: { x: 30, y: 5 }, radiusMm: 5 },
    ]
    const hit = nearestAmongBodies({ x: 5, y: -3 }, bodies)!
    expect(hit.bodyId).toBe('a')
    expect(hit.distMm).toBe(3)
    const hit2 = nearestAmongBodies({ x: 30, y: 12 }, bodies)!
    expect(hit2.bodyId).toBe('b')
    expect(hit2.distMm).toBe(2)
  })

  it('有向间隙：外侧正、穿透负、相切为 0', () => {
    const bodies: CollisionBodyMm[] = [{ id: 'a', kind: 'polygon', polygon: square }]
    const lamp: Vec2 = { x: 5, y: -8 }
    const hit = nearestAmongBodies(lamp, bodies)!
    expect(signedDeviation(lamp, 3, hit)).toBeCloseTo(5) // 间距8 - 半径3
    const touching: Vec2 = { x: 5, y: -3 }
    expect(signedDeviation(touching, 3, nearestAmongBodies(touching, bodies)!)).toBeCloseTo(0)
    const inside: Vec2 = { x: 5, y: 2 }
    expect(signedDeviation(inside, 3, nearestAmongBodies(inside, bodies)!)).toBeLessThan(0)
  })

  it('磁吸：阈值内吸到相切点，超阈值不吸', () => {
    const bodies: CollisionBodyMm[] = [{ id: 'a', kind: 'polygon', polygon: square }]
    const near: Vec2 = { x: 5, y: -4 } // 偏差 1mm（半径3）
    const snap = computeSnap(near, 3, nearestAmongBodies(near, bodies)!, 2)
    expect(snap).toEqual({ x: 5, y: -3 })
    const far: Vec2 = { x: 5, y: -10 } // 偏差 7mm
    expect(computeSnap(far, 3, nearestAmongBodies(far, bodies)!, 2)).toBeNull()
  })

  it('空多边形安全返回 null', () => {
    expect(nearestOnPolygon({ x: 0, y: 0 }, [])).toBeNull()
    expect(nearestAmongBodies({ x: 0, y: 0 }, [])).toBeNull()
  })
})
