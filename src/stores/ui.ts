import { defineStore } from 'pinia'
import type { LayerId, Role, ZoneKind } from '@/types/doc'

export type ToolId =
  | 'select'
  | 'brush'
  | 'arrow'
  | 'zone-rect'
  | 'collider-rect'
  | 'collider-polygon'
  | 'annotation'
  | 'wear'

export interface BrushSettings {
  widthMm: number
  color: string
  dashed: boolean
}

interface UiState {
  role: Role
  activeTool: ToolId
  activeLayer: LayerId
  zoneKind: ZoneKind
  brush: BrushSettings
  selectedIds: string[]
  undoDepth: number
  redoDepth: number
  lastCommandLabel: string
  historyDirty: boolean
  /** 缩放百分比（仅显示与滚轮缩放用） */
  zoom: number
}

export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    role: 'designer',
    activeTool: 'select',
    activeLayer: 'silkscreen',
    zoneKind: 'flipper',
    brush: { widthMm: 2, color: '#111827', dashed: false },
    selectedIds: [],
    undoDepth: 0,
    redoDepth: 0,
    lastCommandLabel: '',
    historyDirty: false,
    zoom: 1,
  }),

  actions: {
    setRole(role: Role) {
      this.role = role
      this.activeTool = 'select'
    },
    setTool(tool: ToolId) {
      this.activeTool = tool
    },
    setActiveLayer(layer: LayerId) {
      this.activeLayer = layer
    },
    setZoneKind(kind: ZoneKind) {
      this.zoneKind = kind
    },
    setBrush(patch: Partial<BrushSettings>) {
      this.brush = { ...this.brush, ...patch }
    },
    setSelectedIds(ids: string[]) {
      this.selectedIds = ids
    },
    setHistory(undoDepth: number, redoDepth: number, label: string) {
      this.undoDepth = undoDepth
      this.redoDepth = redoDepth
      this.lastCommandLabel = label
    },
    setHistoryDirty(dirty: boolean) {
      this.historyDirty = dirty
    },
    setZoom(z: number) {
      this.zoom = z
    },
  },
})
