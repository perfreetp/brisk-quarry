import * as THREE from 'three'

export const SECTION_TYPES = {
  horseshoe: '马蹄形',
  circle: '圆形'
}

export function createDefaultTemplates() {
  return [
    {
      id: 'tpl-hs-62',
      name: '马蹄形模板 · 净宽6.2m',
      type: 'horseshoe',
      width: 6.2,
      height: 6.8,
      wallHeight: 3.05,
      invertDepth: 0.75,
      radialSegments: 56
    },
    {
      id: 'tpl-hs-74',
      name: '马蹄形模板 · 净宽7.4m',
      type: 'horseshoe',
      width: 7.4,
      height: 7.6,
      wallHeight: 3.45,
      invertDepth: 0.9,
      radialSegments: 64
    },
    {
      id: 'tpl-ci-66',
      name: '圆形模板 · DN6.6m',
      type: 'circle',
      diameter: 6.6,
      radialSegments: 64
    }
  ]
}

// 返回按断面周边闭合的二维点：x 为横向，y 为竖向（原点约在断面中心）
export function sectionProfile(template, extraSegments) {
  const points = []
  const n = Math.max(16, Math.floor(extraSegments || template.radialSegments || 48))

  if (template.type === 'circle') {
    const r = (Number(template.diameter) || 6) / 2
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      points.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r))
    }
    return points
  }

  const w = Number(template.width) || 6
  const h = Number(template.height) || w * 1.08
  const half = w / 2
  const wallH = Math.min(Number(template.wallHeight) || h - half, h - half * 0.7)
  const depth = Math.min(Number(template.invertDepth) || w * 0.12, h * 0.18)
  const archR = half

  // 右边墙
  points.push(new THREE.Vector2(half, 0))
  points.push(new THREE.Vector2(half, wallH))

  // 顶拱：右拱脚 -> 拱顶 -> 左拱脚
  const archSteps = Math.max(12, Math.floor(n * 0.42))
  for (let i = 1; i <= archSteps; i++) {
    const a = (i / archSteps) * Math.PI
    points.push(new THREE.Vector2(Math.cos(a) * archR, wallH + Math.sin(a) * archR))
  }

  // 左边墙到底
  points.push(new THREE.Vector2(-half, 0))

  // 仰拱：左底角 -> 仰拱底 -> 右底角
  const yc = (half * half - depth * depth) / (2 * depth)
  const ri = yc + depth
  const leftA = Math.atan2(-yc, -half)
  const rightA = Math.atan2(-yc, half)
  const invertSteps = Math.max(8, Math.floor(n * 0.22))
  for (let i = 1; i <= invertSteps; i++) {
    const t = i / invertSteps
    const a = leftA + (rightA - leftA) * t
    points.push(new THREE.Vector2(Math.cos(a) * ri, yc + Math.sin(a) * ri))
  }

  // 将断面原点移到包围盒中心，便于以轴线高程为中心放样
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const shift = (minY + maxY) / 2
  for (const p of points) p.y -= shift

  // 确保没有重复闭合点
  if (points[0].distanceTo(points[points.length - 1]) < 1e-6) points.pop()
  return points
}

export function polygonArea(profile) {
  let twice = 0
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]
    const b = profile[(i + 1) % profile.length]
    twice += a.x * b.y - b.x * a.y
  }
  return Math.abs(twice) / 2
}

export function sectionMetrics(template) {
  const profile = sectionProfile(template)
  const area = polygonArea(profile)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  let perimeter = 0
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]
    const q = profile[(i + 1) % profile.length]
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    perimeter += p.distanceTo(q)
  }
  // 开挖工程量可在净断面基础上计超挖/支护余量；默认模板外加 0.15m
  const overbreak = Number(template.overbreak ?? 0.15)
  let excavationArea = area
  if (template.type === 'circle') {
    const r = (Number(template.diameter) || 6) / 2 + overbreak
    excavationArea = Math.PI * r * r
  } else {
    excavationArea = area + perimeter * overbreak + Math.PI * overbreak * overbreak
  }
  return {
    profile,
    netArea: area,
    excavationArea,
    perimeter,
    width: maxX - minX,
    height: maxY - minY
  }
}
