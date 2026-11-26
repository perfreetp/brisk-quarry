import { reactive, computed } from 'vue'
import { createDefaultTemplates } from './lib/sections'
import { deepClone, uid } from './lib/format'
import { createSampleTerrain, createSampleRockProfile } from './lib/sampleData'

function defaultAxisPoints() {
  return [
    { id: 'cp-1', name: 'JD1', station: 0, east: 0, north: 0, elev: 42.0 },
    { id: 'cp-2', name: 'JD2', station: 42, east: 42, north: 9, elev: 43.3 },
    { id: 'cp-3', name: 'JD3', station: 88, east: 88, north: -7, elev: 46.2 },
    { id: 'cp-4', name: 'JD4', station: 134, east: 134, north: 13, elev: 47.4 },
    { id: 'cp-5', name: 'JD5', station: 180, east: 180, north: 4, elev: 49.1 }
  ]
}

const initialSnapshot = () => ({
  axisPoints: defaultAxisPoints(),
  interval: 10,
  templateId: 'tpl-hs-62',
  templates: createDefaultTemplates(),
  density: {},
  verticalEdits: {},
  autoJoin: true,
  joinTolerance: 0.03,
  maxGrade: 8,
  radialQuality: 1
})

export const store = reactive({
  ...initialSnapshot(),
  selectedPointId: 'cp-2',
  selectedSegmentId: null,
  hoveredSegmentId: null,
  dragMode: 'plan',
  activeTab: 'axis',
  bottomTab: 'quantity',
  visibility: {
    terrain: true,
    rock: true,
    axis: true,
    ticks: true,
    tunnel: true,
    labels: true,
    bvhHelper: false
  },
  geoOrigin: { east: 0, north: 0, set: false },
  terrainDataset: createSampleTerrain(),
  rockDataset: createSampleRockProfile(),
  axisImportName: '',
  terrainImportName: '',
  rockImportName: '',
  segments: [],
  intersections: [],
  issues: [],
  controlMetrics: [],
  totals: { count: 0, length: 0, netVolume: 0, excavationVolume: 0, intersectLength: 0 },
  renderStats: { fps: 0, triangles: 0, bvhMs: 0, rebuildMs: 0, dragLod: false },
  history: { canUndo: false, canRedo: false, labels: [] },
  toast: null,
  showHelp: false,
  exportMenu: false
})

const past = []
const future = []
const HISTORY_LIMIT = 80

function serializableState() {
  return {
    axisPoints: deepClone(store.axisPoints),
    interval: store.interval,
    templateId: store.templateId,
    templates: deepClone(store.templates),
    density: deepClone(store.density),
    verticalEdits: deepClone(store.verticalEdits),
    autoJoin: store.autoJoin,
    joinTolerance: store.joinTolerance,
    maxGrade: store.maxGrade,
    radialQuality: store.radialQuality
  }
}

function restoreState(snap) {
  const data = typeof snap === 'string' ? JSON.parse(snap) : snap
  Object.assign(store, deepClone(data))
  if (!store.axisPoints?.length) store.axisPoints = defaultAxisPoints()
  if (!store.templates?.length) store.templates = createDefaultTemplates()
  store.selectedSegmentId = null
  store.hoveredSegmentId = null
}

function refreshHistoryFlags(lastLabel) {
  store.history.canUndo = past.length > 0
  store.history.canRedo = future.length > 0
  store.history.labels = past.slice(-8).map(x => x.label).reverse()
  if (lastLabel) store.history.lastAction = lastLabel
}

export function recordHistory(label, mutator) {
  const before = JSON.stringify(serializableState())
  const result = mutator?.()
  past.push({ label, snap: before })
  if (past.length > HISTORY_LIMIT) past.shift()
  future.length = 0
  refreshHistoryFlags(label)
  return result
}

let pendingTransaction = null
export function beginTransaction(label) {
  pendingTransaction = { label, snap: JSON.stringify(serializableState()) }
}

export function commitTransaction() {
  if (!pendingTransaction) return
  const current = JSON.stringify(serializableState())
  if (current !== pendingTransaction.snap) {
    past.push({ label: pendingTransaction.label, snap: pendingTransaction.snap })
    if (past.length > HISTORY_LIMIT) past.shift()
    future.length = 0
    refreshHistoryFlags(pendingTransaction.label)
  }
  pendingTransaction = null
}

export function cancelTransaction() {
  pendingTransaction = null
}

export function undo() {
  const prev = past.pop()
  if (!prev) return
  future.push({ label: prev.label, snap: JSON.stringify(serializableState()) })
  restoreState(prev.snap)
  refreshHistoryFlags(`撤销：${prev.label}`)
  showToast(`已撤销：${prev.label}`)
}

export function redo() {
  const next = future.pop()
  if (!next) return
  past.push({ label: next.label, snap: JSON.stringify(serializableState()) })
  restoreState(next.snap)
  refreshHistoryFlags(`重做：${next.label}`)
  showToast(`已重做：${next.label}`)
}

export function showToast(message, type = 'success', timeout = 2600) {
  store.toast = { id: uid('toast'), message, type }
  if (typeof window === 'undefined') return
  window.clearTimeout(showToast._timer)
  showToast._timer = window.setTimeout(() => { store.toast = null }, timeout)
}

export const selectedTemplate = computed(() =>
  store.templates.find(t => t.id === store.templateId) || store.templates[0]
)

export const selectedPoint = computed(() =>
  store.axisPoints.find(p => p.id === store.selectedPointId) || null
)

export const selectedSegment = computed(() =>
  store.segments.find(s => s.id === store.selectedSegmentId) || null
)

export function ensureGeoOrigin(east, north) {
  if (!store.geoOrigin.set) {
    store.geoOrigin.east = Number(east) || 0
    store.geoOrigin.north = Number(north) || 0
    store.geoOrigin.set = true
  }
}

export function resetProject() {
  recordHistory('重置示例工程', () => {
    const d = initialSnapshot()
    Object.assign(store, d)
    store.geoOrigin = { east: 0, north: 0, set: false }
    store.terrainDataset = createSampleTerrain()
    store.rockDataset = createSampleRockProfile()
    store.axisImportName = ''
    store.terrainImportName = ''
    store.rockImportName = ''
    store.selectedPointId = 'cp-2'
    store.selectedSegmentId = null
  })
  showToast('已恢复内置示例轴线、DEM和岩层界面')
}

export function densifySegment(segmentId, factor = 2) {
  recordHistory('按段加密断面', () => {
    const current = Number(store.density[segmentId] || 1)
    if (factor === 0) {
      delete store.density[segmentId]
    } else if (factor === 2) {
      store.density[segmentId] = Math.min(16, current * 2)
    } else {
      store.density[segmentId] = Math.max(1, Math.min(16, Number(factor) || 1))
    }
  })
  showToast('该段断面已加密，拖动控制点时自动使用轻量LOD保持跟手')
}

export function applySegmentGrade(segmentId, gradePercent) {
  const seg = store.segments.find(s => s.id === segmentId)
  if (!seg) return
  recordHistory('调整分段坡度并联动高程', () => {
    ensureVerticalEditsFromModel()
    const idx = store.segments.findIndex(s => s.id === segmentId)
    const edit = store.verticalEdits[segmentId]
    const length = seg.chainageLength || seg.length || 1
    edit.endElev = edit.startElev + (Number(gradePercent) / 100) * length

    if (store.autoJoin) {
      const next = store.segments[idx + 1]
      if (next) {
        ensureSegmentEdit(next)
        store.verticalEdits[next.id].startElev = edit.endElev
      }
      const prev = store.segments[idx - 1]
      // 若从下端反推，也保证本端与上段一致
      if (prev) {
        ensureSegmentEdit(prev)
        // 不强行改上段终点；衔接检查会显示差值。这里将本段起点贴合上段终点。
        edit.startElev = store.verticalEdits[prev.id].endElev
        edit.endElev = edit.startElev + (Number(gradePercent) / 100) * length
        if (next) store.verticalEdits[next.id].startElev = edit.endElev
      }
    }
  })
}

export function setSegmentElevation(segmentId, field, value) {
  const seg = store.segments.find(s => s.id === segmentId)
  if (!seg) return
  recordHistory('编辑分段高程', () => {
    ensureVerticalEditsFromModel()
    const edit = store.verticalEdits[segmentId]
    edit[field] = Number(value)
    if (store.autoJoin) {
      const idx = store.segments.findIndex(s => s.id === segmentId)
      if (field === 'endElev') {
        const next = store.segments[idx + 1]
        if (next) {
          ensureSegmentEdit(next)
          store.verticalEdits[next.id].startElev = edit.endElev
        }
      } else {
        const prev = store.segments[idx - 1]
        if (prev) {
          ensureSegmentEdit(prev)
          store.verticalEdits[prev.id].endElev = edit.startElev
        }
      }
    }
  })
}

function ensureSegmentEdit(seg) {
  if (!store.verticalEdits[seg.id]) {
    store.verticalEdits[seg.id] = { startElev: seg.startElev, endElev: seg.endElev }
  }
  return store.verticalEdits[seg.id]
}

export function ensureVerticalEditsFromModel() {
  for (const seg of store.segments) ensureSegmentEdit(seg)
}

export function joinAllElevations() {
  recordHistory('一键顺接相邻段高程', () => {
    ensureVerticalEditsFromModel()
    for (let i = 1; i < store.segments.length; i++) {
      const prev = store.segments[i - 1]
      const cur = store.segments[i]
      ensureSegmentEdit(cur)
      store.verticalEdits[cur.id].startElev = store.verticalEdits[prev.id].endElev
    }
  })
  showToast('相邻分段边界高程已按容差顺接')
}

export function toggleTemplateType(type) {
  recordHistory(`切换为${type === 'circle' ? '圆形' : '马蹄形'}断面`, () => {
    const tpl = store.templates.find(t => t.type === type)
    if (tpl) store.templateId = tpl.id
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault(); undo()
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault(); redo()
    }
  })
}
