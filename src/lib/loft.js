import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { sectionProfile } from './sections'

function attachBVH(geometry) {
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  try {
    geometry.boundsTree = new MeshBVH(geometry, { maxLeafTris: 8 })
  } catch (err) {
    console.warn('BVH construction failed', err)
  }
  return geometry
}

/**
 * 沿轴线放样一个桩号分段。
 * subdivisions=1 表示只有首尾两个断面；2 表示中间加密一道，以此类推。
 */
export function createLoftGeometry(options) {
  const {
    alignment,
    startStation,
    endStation,
    template,
    subdivisions = 1,
    profileSegments,
    startElev,
    endElev,
    capStart = false,
    capEnd = false,
    buildBVH = true
  } = options

  const profile = sectionProfile(template, profileSegments)
  const m = profile.length
  const sub = Math.max(1, Math.floor(subdivisions))
  const ringCount = sub + 1

  const positions = []
  const uvs = []
  const indices = []
  const centers = []

  const startSample = alignment.pointAt(startStation)
  const endSample = alignment.pointAt(endStation)
  const offsetStart = Number.isFinite(startElev) ? startElev - startSample.point.y : 0
  const offsetEnd = Number.isFinite(endElev) ? endElev - endSample.point.y : 0

  for (let k = 0; k < ringCount; k++) {
    const t = k / sub
    const station = THREE.MathUtils.lerp(startStation, endStation, t)
    const sample = alignment.pointAt(station)
    const { side, up } = alignment.frameAt(sample.tangent)
    const elevOffset = THREE.MathUtils.lerp(offsetStart, offsetEnd, t)
    const center = sample.point.clone()
    center.y += elevOffset
    centers.push(center)

    for (let i = 0; i < m; i++) {
      const p = profile[i]
      const v = center.clone()
        .addScaledVector(side, p.x)
        .addScaledVector(up, p.y)
      positions.push(v.x, v.y, v.z)
      uvs.push(i / m, t)
    }
  }

  for (let k = 0; k < sub; k++) {
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m
      const a = k * m + i
      const b = k * m + j
      const c = (k + 1) * m + j
      const d = (k + 1) * m + i
      indices.push(a, b, d, b, c, d)
    }
  }

  if (capStart) {
    const centerIndex = positions.length / 3
    positions.push(centers[0].x, centers[0].y, centers[0].z)
    uvs.push(0.5, 0.5)
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m
      indices.push(centerIndex, j, i)
    }
  }

  if (capEnd) {
    const centerIndex = positions.length / 3
    const endCenter = centers[centers.length - 1]
    positions.push(endCenter.x, endCenter.y, endCenter.z)
    uvs.push(0.5, 0.5)
    const base = sub * m
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m
      indices.push(centerIndex, base + i, base + j)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.userData.ringCount = ringCount
  geometry.userData.profileCount = m
  geometry.userData.subdivisions = sub

  if (buildBVH) attachBVH(geometry)
  return geometry
}

export function createAxisTickGeometry() {
  return new THREE.BufferGeometry()
}
