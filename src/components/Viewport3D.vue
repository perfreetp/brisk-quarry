<template>
  <div ref="hostRef" class="viewport-host">
    <div class="viewport-toolbar">
      <button class="map-btn" title="缩放至全部" @click="fitAll">⤢ 全图</button>
      <button class="map-btn" title="俯视图" @click="setView('top')">俯</button>
      <button class="map-btn" title="轴测图" @click="setView('iso')">轴测</button>
      <button class="map-btn" title="正视图" @click="setView('front')">纵剖</button>
    </div>
    <div class="viewport-hint">
      <b>操作：</b>拖动青色控制点改线 · <kbd>Shift</kbd>+拖动或选择“高程拖动”改坡度 · 点击洞身分段查看方量 · 滚轮缩放 / 右键平移
    </div>
    <div class="viewport-stats">
      <span>{{ store.renderStats.fps }} FPS</span>
      <span>{{ Math.round(store.renderStats.triangles / 1000) }}k 三角面</span>
      <span>BVH {{ store.renderStats.bvhMs.toFixed(1) }}ms</span>
      <span v-if="store.renderStats.dragLod" class="lod-badge">拖动LOD</span>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  MeshBVH
} from 'three-mesh-bvh'
import {
  store,
  beginTransaction,
  commitTransaction,
  showToast
} from '../store'
import { buildAlignment, pointToVector, buildControlMetrics } from '../lib/alignment'
import { buildSegmentModel } from '../lib/model'
import { createLoftGeometry } from '../lib/loft'
import { sectionProfile } from '../lib/sections'

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

const hostRef = ref(null)

let renderer, labelRenderer, scene, camera, controls, resizeObserver
let rafId = 0
let lastFrame = performance.now()
let frameCount = 0
let fpsTimer = performance.now()

const raycaster = new THREE.Raycaster()
raycaster.firstHitOnly = true
const pointer = new THREE.Vector2()
const IDENTITY = new THREE.Matrix4()

let terrainGroup, rockGroup, axisGroup, tickGroup, tunnelGroup, selectionGroup
let rockMesh = null
let rockBVH = null
let lastAlignment = null
let lastRecords = []
let controlSphereGeometry = null
const controlMeshes = []
const segmentMeshes = new Map()
const axisRefs = {
  surveyLine: null,
  smoothLine: null,
  tickLine: null,
  tickStations: [],
  cpLabels: [],
  tickLabels: []
}

let pointerStart = { x: 0, y: 0 }
let dragState = null
let dragRaf = 0
let pendingRebuild = false
let lastUiSync = 0
let cameraTween = null

function clearGroup(group) {
  if (!group) return
  group.traverse((obj) => {
    if (obj.isCSS2DObject && obj.element) obj.element.remove()
    if (obj.geometry && !obj.geometry.userData?.shared) {
      obj.geometry.dispose?.()
      obj.geometry.boundsTree = null
    }
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach(m => m.dispose?.())
    }
  })
  while (group.children.length) group.remove(group.children[0])
}

function gridGeometryFromDataset(ds) {
  const origin = store.geoOrigin || { east: 0, north: 0 }
  const { cols, rows } = ds
  const positions = new Float32Array(cols * rows * 3)
  const colors = new Float32Array(cols * rows * 3)
  const indices = []
  let minY = Infinity
  let maxY = -Infinity
  let mean = 0
  let validCount = 0
  for (let i = 0; i < ds.values.length; i++) {
    if (Number.isFinite(ds.values[i])) {
      minY = Math.min(minY, ds.values[i])
      maxY = Math.max(maxY, ds.values[i])
      mean += ds.values[i]
      validCount++
    }
  }
  mean /= Math.max(1, validCount)
  if (!Number.isFinite(minY)) minY = mean - 1
  if (!Number.isFinite(maxY)) maxY = mean + 1

  const low = new THREE.Color('#6b8f4e')
  const mid = new THREE.Color('#b08968')
  const high = new THREE.Color('#e5e7eb')
  const c = new THREE.Color()

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const idx = r * cols + col
      let y = ds.values[idx]
      if (!Number.isFinite(y)) y = mean
      const east = ds.minEast + col * ds.cellEast
      const north = ds.minNorth + r * ds.cellNorth
      positions[idx * 3] = east - (origin.east || 0)
      positions[idx * 3 + 1] = y
      positions[idx * 3 + 2] = north - (origin.north || 0)
      const t = THREE.MathUtils.clamp((y - minY) / Math.max(0.1, maxY - minY), 0, 1)
      if (t < 0.55) c.copy(low).lerp(mid, t / 0.55)
      else c.copy(mid).lerp(high, (t - 0.55) / 0.45)
      colors[idx * 3] = c.r
      colors[idx * 3 + 1] = c.g
      colors[idx * 3 + 2] = c.b

      if (r < rows - 1 && col < cols - 1) {
        const a = idx
        const b = idx + 1
        const d = idx + cols
        const cc = d + 1
        indices.push(a, d, b, b, d, cc)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

function profileRockGeometry(ds, alignment, low = false) {
  const alongCount = low
    ? 24
    : Math.max(42, Math.ceil((alignment.lastStation - alignment.firstStation) / (ds.alongStep || 4)))
  const crossCount = ds.crossSegments || 12
  const width = ds.width || 70
  const positions = []
  const indices = []

  function elevAt(station) {
    const pts = ds.points
    if (station <= pts[0].station) {
      const a = pts[0], b = pts[1]
      const k = (station - a.station) / Math.max(1e-6, b.station - a.station)
      return a.elev + (b.elev - a.elev) * k
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (station <= pts[i + 1].station) {
        const k = (station - pts[i].station) / Math.max(1e-6, pts[i + 1].station - pts[i].station)
        return pts[i].elev + (pts[i + 1].elev - pts[i].elev) * k
      }
    }
    const a = pts[pts.length - 2], b = pts[pts.length - 1]
    const k = (station - b.station) / Math.max(1e-6, b.station - a.station)
    return b.elev + (b.elev - a.elev) * k
  }

  for (let i = 0; i <= alongCount; i++) {
    const station = THREE.MathUtils.lerp(alignment.firstStation, alignment.lastStation, i / alongCount)
    const sample = alignment.pointAt(station)
    const frame = alignment.frameAt(sample.tangent)
    const baseElev = elevAt(station)
    for (let j = 0; j <= crossCount; j++) {
      const u = j / crossCount
      const lateral = (u - 0.5) * width
      const p = sample.point.clone().addScaledVector(frame.side, lateral)
      p.y = baseElev + (ds.crossSlope || 0) * lateral
      positions.push(p.x, p.y, p.z)
    }
  }

  const row = crossCount + 1
  for (let i = 0; i < alongCount; i++) {
    for (let j = 0; j < crossCount; j++) {
      const a = i * row + j
      const b = a + 1
      const d = (i + 1) * row + j
      const c = d + 1
      indices.push(a, d, b, b, d, c)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

function buildTerrain() {
  clearGroup(terrainGroup)
  const ds = store.terrainDataset
  if (!ds) return
  let geometry
  if (ds.kind === 'grid') geometry = gridGeometryFromDataset(ds)
  if (!geometry) return
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.42,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'DEM地形'
  terrainGroup.add(mesh)
  terrainGroup.visible = store.visibility.terrain
}

function buildRock(alignmentOverride = null, low = false) {
  clearGroup(rockGroup)
  rockMesh = null
  rockBVH = null
  const ds = store.rockDataset
  if (!ds) return
  const alignment = alignmentOverride || buildAlignment(store.axisPoints, store.geoOrigin)
  let geometry
  if (ds.kind === 'grid') geometry = gridGeometryFromDataset(ds)
  else if (ds.kind === 'profile') geometry = profileRockGeometry(ds, alignment, low)
  if (!geometry) return

  geometry.boundsTree = new MeshBVH(geometry, { maxLeafTris: 10 })
  const material = new THREE.MeshStandardMaterial({
    color: ds.kind === 'profile' ? '#c084fc' : '#f59e0b',
    emissive: ds.kind === 'profile' ? '#3b0764' : '#7c2d12',
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: low ? 0.28 : 0.46,
    roughness: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  })
  rockMesh = new THREE.Mesh(geometry, material)
  rockMesh.name = '岩层分界面'
  rockBVH = geometry.boundsTree
  rockGroup.add(rockMesh)

  // 加一层网格线，便于辨认地质界面
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({ color: '#e9d5ff', transparent: true, opacity: low ? 0.08 : 0.16 })
  )
  rockGroup.add(wire)
  rockGroup.visible = store.visibility.rock
}

function tickStationsFor(alignment) {
  const span = alignment.lastStation - alignment.firstStation
  const major = span > 420 ? 50 : 20
  const minor = major / 2
  const start = Math.ceil(alignment.firstStation / minor) * minor
  const list = []
  for (let s = start; s <= alignment.lastStation + 1e-6; s += minor) {
    const ratio = s / major
    const isMajor = Math.abs(ratio - Math.round(ratio)) < 1e-6
    list.push({ station: s, major: isMajor })
  }
  return list
}

function buildTickGeometry(alignment, ticks) {
  const positions = []
  for (const tick of ticks) {
    const sample = alignment.pointAt(tick.station)
    const frame = alignment.frameAt(sample.tangent)
    const len = tick.major ? 3.4 : 1.9
    const a = sample.point.clone().addScaledVector(frame.side, -len)
    const b = sample.point.clone().addScaledVector(frame.side, len)
    positions.push(a.x, a.y + 0.35, a.z, b.x, b.y + 0.35, b.z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geo
}

function makeLabel(text, className) {
  const div = document.createElement('div')
  div.className = className
  div.textContent = text
  const label = new CSS2DObject(div)
  return label
}

function buildAxis() {
  clearGroup(axisGroup)
  clearGroup(tickGroup)
  controlMeshes.length = 0
  axisRefs.cpLabels = []
  axisRefs.tickLabels = []

  const alignment = buildAlignment(store.axisPoints, store.geoOrigin)
  const vecs = store.axisPoints.map(p => pointToVector(p, store.geoOrigin))

  const surveyGeo = new THREE.BufferGeometry().setFromPoints(vecs)
  const surveyLine = new THREE.Line(
    surveyGeo,
    new THREE.LineDashedMaterial({ color: '#a5f3fc', dashSize: 3.2, gapSize: 2.1, transparent: true, opacity: 0.9 })
  )
  surveyLine.computeLineDistances()
  axisGroup.add(surveyLine)
  axisRefs.surveyLine = surveyLine

  const smoothPts = []
  for (let i = 0; i <= 220; i++) {
    smoothPts.push(alignment.pointAt(
      THREE.MathUtils.lerp(alignment.firstStation, alignment.lastStation, i / 220)
    ).point)
  }
  const smoothLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(smoothPts),
    new THREE.LineBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.95 })
  )
  axisGroup.add(smoothLine)
  axisRefs.smoothLine = smoothLine

  if (!controlSphereGeometry) {
    controlSphereGeometry = new THREE.SphereGeometry(1.65, 24, 16)
    controlSphereGeometry.userData.shared = true
    controlSphereGeometry.boundsTree = new MeshBVH(controlSphereGeometry)
  }

  store.axisPoints.forEach((p) => {
    const selected = p.id === store.selectedPointId
    const material = new THREE.MeshStandardMaterial({
      color: selected ? '#fbbf24' : '#22d3ee',
      emissive: selected ? '#92400e' : '#155e75',
      emissiveIntensity: 0.7,
      roughness: 0.35,
      metalness: 0.15
    })
    const mesh = new THREE.Mesh(controlSphereGeometry, material)
    mesh.position.copy(pointToVector(p, store.geoOrigin))
    mesh.userData.pointId = p.id
    axisGroup.add(mesh)
    controlMeshes.push(mesh)

    const label = makeLabel('', 'cp-label')
    label.position.set(0, 3.4, 0)
    mesh.add(label)
    axisRefs.cpLabels.push({ id: p.id, label })
  })

  const ticks = tickStationsFor(alignment)
  axisRefs.tickStations = ticks
  const tickLine = new THREE.LineSegments(
    buildTickGeometry(alignment, ticks),
    new THREE.LineBasicMaterial({ color: '#fef08a', transparent: true, opacity: 0.95 })
  )
  tickGroup.add(tickLine)
  axisRefs.tickLine = tickLine

  ticks.forEach((tick) => {
    const sample = alignment.pointAt(tick.station)
    const label = makeLabel(
      tick.major ? `K${Math.floor(tick.station / 1000)}+${String(Math.floor(tick.station % 1000)).padStart(3, '0')}` : '',
      tick.major ? 'station-label major' : 'station-label minor'
    )
    label.position.copy(sample.point).add(new THREE.Vector3(0, 2.2, 0))
    label.visible = tick.major
    tickGroup.add(label)
    axisRefs.tickLabels.push({ station: tick.station, label, major: tick.major })
  })

  updateAxisLabelText()
  axisGroup.visible = store.visibility.axis
  tickGroup.visible = store.visibility.ticks
}

function updateAxisLabelText() {
  for (const item of axisRefs.cpLabels) {
    const p = store.axisPoints.find(x => x.id === item.id)
    if (p) item.label.element.textContent = `${p.name || 'CP'} · ${p.elev.toFixed(2)}m`
  }
}

function updateAxisLive() {
  const alignment = buildAlignment(store.axisPoints, store.geoOrigin)
  controlMeshes.forEach((mesh) => {
    const p = store.axisPoints.find(x => x.id === mesh.userData.pointId)
    if (p) mesh.position.copy(pointToVector(p, store.geoOrigin))
  })
  axisRefs.cpLabels.forEach(({ id, label }) => {
    const p = store.axisPoints.find(x => x.id === id)
    if (p) label.position.set(0, 3.4, 0)
  })

  if (axisRefs.surveyLine) {
    axisRefs.surveyLine.geometry.dispose()
    axisRefs.surveyLine.geometry = new THREE.BufferGeometry().setFromPoints(
      store.axisPoints.map(p => pointToVector(p, store.geoOrigin))
    )
    axisRefs.surveyLine.computeLineDistances()
  }
  if (axisRefs.smoothLine) {
    const pts = []
    for (let i = 0; i <= 140; i++) {
      pts.push(alignment.pointAt(
        THREE.MathUtils.lerp(alignment.firstStation, alignment.lastStation, i / 140)
      ).point)
    }
    axisRefs.smoothLine.geometry.dispose()
    axisRefs.smoothLine.geometry = new THREE.BufferGeometry().setFromPoints(pts)
  }
  if (axisRefs.tickLine && axisRefs.tickStations.length) {
    axisRefs.tickLine.geometry.dispose()
    axisRefs.tickLine.geometry = buildTickGeometry(alignment, axisRefs.tickStations)
    axisRefs.tickLabels.forEach(({ station, label }) => {
      label.position.copy(alignment.pointAt(station).point).add(new THREE.Vector3(0, 2.2, 0))
    })
  }
  updateAxisLabelText()
  store.controlMetrics = buildControlMetrics(store.axisPoints)
}

function applySegmentStyles() {
  for (const [id, mesh] of segmentMeshes) {
    const rec = lastRecords.find(r => r.id === id)
    const mat = mesh.material
    const selected = id === store.selectedSegmentId
    const hovered = id === store.hoveredSegmentId
    if (rec?.intersects) {
      mat.color.set(selected ? '#ff5c7a' : '#ff2d55')
      mat.emissive.set(selected || hovered ? '#f59e0b' : '#9f1239')
      mat.emissiveIntensity = selected ? 0.85 : hovered ? 0.65 : 0.42
    } else {
      mat.color.set(selected ? '#fbbf24' : hovered ? '#bae6fd' : '#4ea8de')
      mat.emissive.set(selected ? '#b45309' : '#0b3b55')
      mat.emissiveIntensity = selected ? 0.72 : hovered ? 0.55 : 0.28
    }
  }
  updateSelectionHelper()
}

function updateSelectionHelper() {
  clearGroup(selectionGroup)
  const id = store.selectedSegmentId
  if (!id || !lastAlignment) return
  const seg = lastRecords.find(r => r.id === id)
  const template = store.templates.find(t => t.id === store.templateId)
  if (!seg || !template) return
  const station = (seg.startStation + seg.endStation) / 2
  const t = (station - seg.startStation) / Math.max(1e-6, seg.endStation - seg.startStation)
  const sample = lastAlignment.pointAt(station)
  const frame = lastAlignment.frameAt(sample.tangent)
  const elev = THREE.MathUtils.lerp(seg.startElev, seg.endElev, t)
  sample.point.y += elev - sample.point.y
  const profile = sectionProfile(template)
  const pts = profile.map(p => sample.point.clone()
    .addScaledVector(frame.side, p.x * 1.012)
    .addScaledVector(frame.up, p.y * 1.012))
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: '#fde047', linewidth: 2, depthTest: false })
  )
  line.renderOrder = 20
  selectionGroup.add(line)

  const centerMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 16, 10),
    new THREE.MeshBasicMaterial({ color: '#fde047', depthTest: false })
  )
  centerMarker.position.copy(sample.point)
  centerMarker.renderOrder = 21
  selectionGroup.add(centerMarker)
}

function syncStoreResults(model, bvhMs, rebuildMs, force = false, drag = false) {
  const now = performance.now()
  if (!force && now - lastUiSync < 140) return
  lastUiSync = now

  const intersections = model.records
    .filter(r => r.intersects)
    .map(r => ({
      segmentId: r.id,
      name: r.name,
      stationRange: r.stationRange,
      startStation: r.startStation,
      endStation: r.endStation,
      length: r.length,
      detail: r.intersectionDetail
    }))

  const totals = model.records.reduce((acc, s) => {
    acc.count += 1
    acc.length += s.length
    acc.netVolume += s.netVolume
    acc.excavationVolume += s.excavationVolume
    if (s.intersects) acc.intersectLength += s.length
    return acc
  }, { count: 0, length: 0, netVolume: 0, excavationVolume: 0, intersectLength: 0 })

  store.segments = model.records
  store.issues = model.issues
  store.intersections = intersections
  store.totals = totals
  store.controlMetrics = buildControlMetrics(store.axisPoints)
  store.renderStats.bvhMs = bvhMs
  store.renderStats.rebuildMs = rebuildMs
  store.renderStats.dragLod = !!drag
}

function rebuildTunnel(options = {}) {
  if (!scene) return
  const drag = !!options.drag
  const started = performance.now()
  const model = buildSegmentModel(store)
  lastAlignment = model.alignment
  lastRecords = model.records

  if (store.rockDataset?.kind === 'profile') {
    buildRock(model.alignment, drag)
  }

  clearGroup(tunnelGroup)
  segmentMeshes.clear()

  const template = model.template
  for (const seg of model.records) {
    const subdivisions = drag ? 1 : Math.max(1, seg.densityFactor)
    const geometry = createLoftGeometry({
      alignment: model.alignment,
      startStation: seg.startStation,
      endStation: seg.endStation,
      template,
      subdivisions,
      profileSegments: drag ? 20 : undefined,
      startElev: seg.startElev,
      endElev: seg.endElev,
      capStart: false,
      capEnd: false,
      buildBVH: true
    })
    seg.triangles = geometry.index ? Math.round(geometry.index.count / 3) : Math.round(geometry.attributes.position.count / 3)

    const material = new THREE.MeshStandardMaterial({
      color: '#4ea8de',
      roughness: 0.62,
      metalness: 0.08,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: drag ? 0.88 : 0.94
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.segmentId = seg.id
    mesh.name = seg.name
    tunnelGroup.add(mesh)
    segmentMeshes.set(seg.id, mesh)
  }

  let bvhMs = 0
  if (rockBVH) {
    for (const seg of model.records) {
      const mesh = segmentMeshes.get(seg.id)
      const t0 = performance.now()
      try {
        seg.intersects = rockBVH.intersectsGeometry(mesh.geometry, IDENTITY)
      } catch (err) {
        console.warn('BVH geometry intersection failed', err)
        seg.intersects = false
      }
      bvhMs += performance.now() - t0
      seg.bvhHitMs = performance.now() - t0
    }
  }

  applySegmentStyles()
  tunnelGroup.visible = store.visibility.tunnel
  const rebuildMs = performance.now() - started
  store.renderStats.triangles = model.records.reduce((sum, s) => sum + s.triangles, 0)
  syncStoreResults(model, bvhMs, rebuildMs, options.forceUi === true, drag)
  if (options.forceUi) store.renderStats.dragLod = false
}

function fullRebuild() {
  if (!scene) return
  buildAxis()
  // 三维固定界面已由数据集 watcher 构建；这里仅兜底首次挂载，避免大 DEM 重复建 BVH
  if (store.rockDataset?.kind !== 'profile' && !rockMesh) buildRock(lastAlignment)
  rebuildTunnel({ forceUi: true })
}

function scheduleDragRebuild() {
  pendingRebuild = true
  if (dragRaf) return
  dragRaf = requestAnimationFrame(() => {
    dragRaf = 0
    if (!pendingRebuild) return
    pendingRebuild = false
    updateAxisLive()
    rebuildTunnel({ drag: true, forceUi: false })
  })
}

function updateRayFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
}

function pickControlPoint() {
  if (!store.visibility.axis) return null
  const hits = raycaster.intersectObjects(controlMeshes, false)
  return hits[0]?.object?.userData?.pointId || null
}

function pickSegmentMesh() {
  if (!store.visibility.tunnel) return null
  const hits = raycaster.intersectObjects(Array.from(segmentMeshes.values()), false)
  return hits[0]?.object || null
}

function onPointerDown(event) {
  if (event.button !== 0) return
  pointerStart = { x: event.clientX, y: event.clientY }
  updateRayFromEvent(event)
  const pointId = pickControlPoint()
  if (pointId) {
    store.selectedPointId = pointId
    beginTransaction('拖动轴线控制点')
    dragState = {
      type: 'control',
      pointId,
      pointerId: event.pointerId,
      moved: false
    }
    controls.enabled = false
    renderer.domElement.style.cursor = 'grabbing'
    try { renderer.domElement.setPointerCapture(event.pointerId) } catch {}
    event.preventDefault()
    event.stopPropagation()
  }
}

function onPointerMove(event) {
  updateRayFromEvent(event)
  if (dragState?.type === 'control') {
    const p = store.axisPoints.find(x => x.id === dragState.pointId)
    if (!p) return
    if (!dragState.moved && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 3) {
      dragState.moved = true
      // 轴线拖动以曲线放样结果作为高程基准；历史快照仍保留旧的手工高程覆盖
      store.verticalEdits = {}
    }
    if (!dragState.moved) return

    const origin = store.geoOrigin || { east: 0, north: 0 }
    const cp = pointToVector(p, origin)
    const vertical = store.dragMode === 'elevation' || event.shiftKey
    const hit = new THREE.Vector3()

    if (vertical) {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      right.y = 0
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
      right.normalize()
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(right, cp)
      if (raycaster.ray.intersectPlane(plane, hit)) {
        p.elev = THREE.MathUtils.clamp(hit.y, -80, 220)
      }
    } else {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -cp.y)
      if (raycaster.ray.intersectPlane(plane, hit)) {
        p.east = Number((hit.x + (origin.east || 0)).toFixed(3))
        p.north = Number((hit.z + (origin.north || 0)).toFixed(3))
      }
    }
    scheduleDragRebuild()
    return
  }

  const pointId = pickControlPoint()
  if (pointId) {
    renderer.domElement.style.cursor = 'grab'
    if (store.hoveredSegmentId) {
      store.hoveredSegmentId = null
      applySegmentStyles()
    }
    return
  }
  const mesh = pickSegmentMesh()
  const nextHover = mesh?.userData.segmentId || null
  renderer.domElement.style.cursor = nextHover ? 'pointer' : 'default'
  if (nextHover !== store.hoveredSegmentId) {
    store.hoveredSegmentId = nextHover
    applySegmentStyles()
  }
}

function onPointerUp(event) {
  if (dragState?.type === 'control') {
    try { renderer.domElement.releasePointerCapture(dragState.pointerId) } catch {}
    controls.enabled = true
    renderer.domElement.style.cursor = 'default'
    if (dragState.moved) {
      commitTransaction()
      showToast('控制点已更新，洞身分段和岩层穿插已重新放样校核')
    } else {
      commitTransaction()
    }
    dragState = null
    updateControlMaterialSelection()
    fullRebuild()
    return
  }

  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
  if (moved < 6 && event.button === 0) {
    updateRayFromEvent(event)
    const controlId = pickControlPoint()
    if (controlId) {
      store.selectedPointId = controlId
      updateControlMaterialSelection()
      return
    }
    const mesh = pickSegmentMesh()
    if (mesh) {
      store.selectedSegmentId = mesh.userData.segmentId
    } else {
      store.selectedSegmentId = null
    }
  }
}

function onPointerCancel() {
  if (dragState?.type === 'control') {
    controls.enabled = true
    commitTransaction()
    fullRebuild()
  }
  dragState = null
}

function updateControlMaterialSelection() {
  for (const mesh of controlMeshes) {
    const selected = mesh.userData.pointId === store.selectedPointId
    mesh.material.color.set(selected ? '#fbbf24' : '#22d3ee')
    mesh.material.emissive.set(selected ? '#92400e' : '#155e75')
  }
}

function animate(now) {
  rafId = requestAnimationFrame(animate)
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now

  if (cameraTween) {
    cameraTween.t += dt / 0.55
    const k = 1 - Math.pow(1 - Math.min(1, cameraTween.t), 3)
    camera.position.lerpVectors(cameraTween.startPos, cameraTween.toPos, k)
    controls.target.lerpVectors(cameraTween.startTarget, cameraTween.toTarget, k)
    if (cameraTween.t >= 1) cameraTween = null
  }

  controls.update()
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)

  frameCount++
  if (now - fpsTimer > 700) {
    store.renderStats.fps = Math.round((frameCount * 1000) / (now - fpsTimer))
    frameCount = 0
    fpsTimer = now
  }
}

function cameraTo(position, target) {
  cameraTween = {
    t: 0,
    startPos: camera.position.clone(),
    startTarget: controls.target.clone(),
    toPos: new THREE.Vector3(...position),
    toTarget: new THREE.Vector3(...target)
  }
}

function fitAll() {
  const box = new THREE.Box3()
  if (tunnelGroup?.children.length) box.expandByObject(tunnelGroup)
  if (axisGroup?.children.length) box.expandByObject(axisGroup)
  if (terrainGroup?.children.length) box.expandByObject(terrainGroup)
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(80, 45, 0), new THREE.Vector3(220, 80, 140))
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const radius = Math.max(size.length() * 0.55, 60)
  const dir = new THREE.Vector3(0.72, 0.52, 0.82).normalize()
  cameraTo(center.clone().add(dir.multiplyScalar(radius * 1.65)).toArray(), center.toArray())
}

function setView(kind) {
  const target = controls.target.clone()
  const dist = Math.max(camera.position.distanceTo(target), 120)
  if (kind === 'top') cameraTo([target.x, target.y + dist * 1.25, target.z + 0.01], [target.x, target.y, target.z])
  if (kind === 'front') cameraTo([target.x, target.y + 18, target.z + dist * 1.25], [target.x, target.y, target.z])
  if (kind === 'iso') cameraTo([target.x + dist * 0.72, target.y + dist * 0.52, target.z + dist * 0.82], target.toArray())
}

function focusSegment(event) {
  const id = event.detail
  const mesh = segmentMeshes.get(id)
  if (!mesh) return
  const box = new THREE.Box3().setFromObject(mesh)
  if (box.isEmpty()) return
  const center = box.getCenter(new THREE.Vector3())
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const dir = camera.position.clone().sub(controls.target).normalize()
  if (dir.lengthSq() < 0.1) dir.set(0.7, 0.5, 0.8)
  const dist = Math.max(24, sphere.radius * 3.2)
  cameraTo(center.clone().add(dir.multiplyScalar(dist)).toArray(), center.toArray())
}

function onFitEvent() { fitAll() }

onMounted(() => {
  const el = hostRef.value
  const width = el.clientWidth || 800
  const height = el.clientHeight || 600

  scene = new THREE.Scene()
  scene.background = new THREE.Color('#0b1526')
  scene.fog = new THREE.Fog('#0b1526', 260, 620)

  camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 1200)
  camera.position.set(96, 82, 132)

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  el.appendChild(renderer.domElement)

  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(width, height)
  labelRenderer.domElement.className = 'label-layer'
  el.appendChild(labelRenderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(86, 45, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 8
  controls.maxDistance = 420
  controls.maxPolarAngle = Math.PI * 0.92
  controls.update()

  scene.add(new THREE.HemisphereLight('#dbeafe', '#334155', 1.65))
  const sun = new THREE.DirectionalLight('#ffffff', 2.2)
  sun.position.set(70, 150, 80)
  scene.add(sun)
  const fill = new THREE.DirectionalLight('#7dd3fc', 0.65)
  fill.position.set(-90, 60, -80)
  scene.add(fill)

  const grid = new THREE.GridHelper(280, 56, '#475569', '#1e293b')
  grid.position.set(85, 33.5, 0)
  grid.material.transparent = true
  grid.material.opacity = 0.42
  scene.add(grid)

  terrainGroup = new THREE.Group(); terrainGroup.name = 'terrain'; scene.add(terrainGroup)
  rockGroup = new THREE.Group(); rockGroup.name = 'rock'; scene.add(rockGroup)
  axisGroup = new THREE.Group(); axisGroup.name = 'axis'; scene.add(axisGroup)
  tickGroup = new THREE.Group(); tickGroup.name = 'ticks'; scene.add(tickGroup)
  tunnelGroup = new THREE.Group(); tunnelGroup.name = 'tunnel'; scene.add(tunnelGroup)
  selectionGroup = new THREE.Group(); selectionGroup.name = 'selection'; scene.add(selectionGroup)

  buildTerrain()
  fullRebuild()

  renderer.domElement.addEventListener('pointerdown', onPointerDown, true)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('focus-segment', focusSegment)
  window.addEventListener('fit-view', onFitEvent)

  resizeObserver = new ResizeObserver(() => {
    const w = el.clientWidth
    const h = el.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    labelRenderer.setSize(w, h)
  })
  resizeObserver.observe(el)
  rafId = requestAnimationFrame(animate)
})

watch(
  () => JSON.stringify({
    p: store.axisPoints,
    i: store.interval,
    t: store.templateId,
    tpl: store.templates,
    d: store.density,
    v: store.verticalEdits,
    j: store.joinTolerance,
    m: store.maxGrade,
    q: store.radialQuality
  }),
  () => {
    // 拖动期间由 requestAnimationFrame 走轻量 LOD，避免监听触发全精度重建
    if (dragState?.type === 'control') return
    fullRebuild()
  }
)

watch(
  () => [store.terrainDataset, store.rockDataset],
  () => {
    buildTerrain()
    buildRock()
    fullRebuild()
  }
)

watch(
  () => ({ ...store.visibility }),
  (v) => {
    if (terrainGroup) terrainGroup.visible = v.terrain
    if (rockGroup) rockGroup.visible = v.rock
    if (axisGroup) axisGroup.visible = v.axis
    if (tickGroup) tickGroup.visible = v.ticks
    if (tunnelGroup) tunnelGroup.visible = v.tunnel
    if (labelRenderer) labelRenderer.domElement.style.display = v.labels ? 'block' : 'none'
  },
  { deep: true }
)

watch(() => store.selectedSegmentId, () => applySegmentStyles())
watch(() => store.selectedPointId, () => updateControlMaterialSelection())

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  if (dragRaf) cancelAnimationFrame(dragRaf)
  resizeObserver?.disconnect()
  window.removeEventListener('focus-segment', focusSegment)
  window.removeEventListener('fit-view', onFitEvent)
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown, true)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointercancel', onPointerCancel)
    controls?.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
  labelRenderer?.domElement.remove()
})

defineExpose({ fitAll, setView })
</script>
