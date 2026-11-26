import { defineStore } from 'pinia'
import type {
  AlignState,
  Annotation,
  Calibration,
  DocSettings,
  Envelope,
  LampDoc,
  LampSpec,
  LayerMeta,
  Point,
  Role,
  WearDoc,
} from '@/types/doc'
import { DEFAULT_LAMP_SPECS, DEFAULT_LAYERS, STORAGE_KEYS } from '@/fabric/constants'
import { uid } from '@/utils/id'

export function emptyCalibration(): Calibration {
  return { tableWidthMm: 0, tableHeightMm: 0, p1: null, p2: null, done: false }
}

function loadLampSpecs(): LampSpec[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.lampSpecs)
    if (raw) return JSON.parse(raw) as LampSpec[]
  } catch {
    /* ignore */
  }
  return DEFAULT_LAMP_SPECS.map((s) => ({ id: uid('spec'), ...s }))
}

interface DocState {
  calibration: Calibration
  layers: LayerMeta[]
  lamps: LampDoc[]
  annotations: Annotation[]
  wears: WearDoc[]
  settings: DocSettings
  baseImageId: string | null
  nextLampCode: number
  lampSpecs: LampSpec[]
  dirty: boolean
}

export const useDocumentStore = defineStore('document', {
  state: (): DocState => ({
    calibration: emptyCalibration(),
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    lamps: [],
    annotations: [],
    wears: [],
    settings: { snapThresholdMm: 2 },
    baseImageId: null,
    nextLampCode: 1,
    lampSpecs: loadLampSpecs(),
    dirty: false,
  }),

  getters: {
    layerById: (state) => (id: LayerMeta['id']) => state.layers.find((l) => l.id === id),
    lampById: (state) => (id: string) => state.lamps.find((l) => l.id === id),
    annotationCountForLamp: (state) => (lampId: string) =>
      state.annotations.filter((a) => a.lampId === lampId && !a.resolved).length,
  },

  actions: {
    markDirty(v = true) {
      this.dirty = v
    },

    setCalibration(patch: Partial<Calibration>) {
      this.calibration = { ...this.calibration, ...patch }
      this.markDirty()
    },

    setCalibrationPoints(p1: Point | null, p2: Point | null, done: boolean) {
      this.calibration = { ...this.calibration, p1, p2, done }
      this.markDirty()
    },

    setLayerVisible(id: LayerMeta['id'], visible: boolean) {
      const l = this.layers.find((x) => x.id === id)
      if (l) l.visible = visible
      this.markDirty()
    },

    setLayerLocked(id: LayerMeta['id'], locked: boolean) {
      const l = this.layers.find((x) => x.id === id)
      if (l) l.locked = locked
      this.markDirty()
    },

    takeLampCode(): number {
      const code = this.nextLampCode
      this.nextLampCode += 1
      return code
    },

    addLamp(doc: LampDoc) {
      this.lamps.push(doc)
      this.markDirty()
    },

    removeLamp(id: string) {
      this.lamps = this.lamps.filter((l) => l.id !== id)
      this.markDirty()
    },

    updateLampAlignment(id: string, patch: { boundCollisionId: string | null; deviationMm: number | null; alignState: AlignState; centerMm: Point }) {
      const lamp = this.lamps.find((l) => l.id === id)
      if (!lamp) return
      lamp.boundCollisionId = patch.boundCollisionId
      lamp.deviationMm = patch.deviationMm
      lamp.alignState = patch.alignState
      lamp.centerMm = patch.centerMm
      this.markDirty()
    },

    updateLampCenter(id: string, centerMm: Point) {
      const lamp = this.lamps.find((l) => l.id === id)
      if (lamp) lamp.centerMm = centerMm
    },

    addAnnotation(a: Annotation) {
      this.annotations.push(a)
      this.markDirty()
    },

    resolveAnnotation(id: string, resolved: boolean) {
      const a = this.annotations.find((x) => x.id === id)
      if (a) a.resolved = resolved
      this.markDirty()
    },

    removeAnnotation(id: string) {
      this.annotations = this.annotations.filter((a) => a.id !== id)
      this.markDirty()
    },

    addWear(w: WearDoc) {
      this.wears.push(w)
      this.markDirty()
    },

    removeWear(id: string) {
      this.wears = this.wears.filter((w) => w.id !== id)
      this.markDirty()
    },

    /* ---------- 灯位库预设 ---------- */
    addLampSpec(spec: Omit<LampSpec, 'id'>): LampSpec {
      const full: LampSpec = { id: uid('spec'), ...spec }
      this.lampSpecs.push(full)
      this.persistLampSpecs()
      return full
    },

    removeLampSpec(id: string) {
      this.lampSpecs = this.lampSpecs.filter((s) => s.id !== id)
      this.persistLampSpecs()
    },

    persistLampSpecs() {
      localStorage.setItem(STORAGE_KEYS.lampSpecs, JSON.stringify(this.lampSpecs))
    },

    /* ---------- 工程信封装载（fabric JSON 由 serialization 服务处理） ---------- */
    loadEnvelopeData(env: Envelope) {
      this.calibration = env.calibration
      this.layers = env.layers.map((l) => ({ ...l }))
      this.lamps = env.lamps.map((l) => ({ ...l }))
      this.annotations = env.annotations.map((a) => ({ ...a }))
      this.wears = env.wears.map((w) => ({ ...w }))
      this.settings = { ...env.settings }
      this.baseImageId = env.baseImageId
      this.nextLampCode = env.nextLampCode
      this.dirty = false
    },

    resetDocument() {
      this.calibration = emptyCalibration()
      this.layers = DEFAULT_LAYERS.map((l) => ({ ...l }))
      this.lamps = []
      this.annotations = []
      this.wears = []
      this.settings = { snapThresholdMm: 2 }
      this.baseImageId = null
      this.nextLampCode = 1
      this.dirty = false
    },
  },
})

export type { Role }
