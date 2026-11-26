import { mmToPx, pxToMm, type Vec2 } from '@/geometry/units'
import type { WearDoc } from '@/types/doc'
import { layerService } from './layerService'
import { shapeTools } from './shapeTools'
import { useDocumentStore } from '@/stores/document'
import { uid } from '@/utils/id'
import { pushDocCommand } from './historyService'

export const wearService = {
  /** 以场景 px 拖圈创建，内部转 mm 存储 */
  create(centerPx: Vec2, radiusPx: number, note: string, author: string): WearDoc {
    const doc = useDocumentStore()
    const cal = doc.calibration
    const centerMm = pxToMm(cal, centerPx)
    const edgeMm = pxToMm(cal, { x: centerPx.x + radiusPx, y: centerPx.y })
    const radiusMm = Math.abs(edgeMm.x - centerMm.x)
    const wear: WearDoc = {
      id: uid('wear'),
      centerMm,
      radiusMm,
      note,
      author,
      createdAt: Date.now(),
    }
    const snapshot = JSON.parse(JSON.stringify(doc.wears)) as WearDoc[]
    doc.addWear(wear)
    pushDocCommand(
      '磨损圈',
      () => {
        doc.wears = [...snapshot, wear]
      },
      () => {
        doc.wears = snapshot
      },
    )
    this.renderOne(wear)
    return wear
  },

  renderOne(wear: WearDoc): void {
    const doc = useDocumentStore()
    const cal = doc.calibration
    const centerPx = mmToPx(cal, wear.centerMm)
    const edgePx = mmToPx(cal, { x: wear.centerMm.x + wear.radiusMm, y: wear.centerMm.y })
    const radiusPx = Math.abs(edgePx.x - centerPx.x)
    const existing = layerService.get(wear.id)
    if (existing) {
      existing.set({ left: centerPx.x, top: centerPx.y, rx: radiusPx, ry: radiusPx, wearNote: wear.note })
      return
    }
    const obj = shapeTools.wearCircle(centerPx, radiusPx, wear.note)
    obj.id = wear.id
    obj.wearId = wear.id
  },

  /** 标定变更/导入后按 mm 整体重建 */
  rebuildAll(): void {
    const doc = useDocumentStore()
    for (const w of doc.wears) {
      if (!layerService.get(w.id)) this.renderOne(w)
      else this.renderOne(w)
    }
    const ids = new Set(doc.wears.map((w) => w.id))
    for (const m of layerService.objects('wear')) {
      if (!ids.has(String(m.id))) layerService.remove(m)
    }
  },

  remove(id: string): void {
    const doc = useDocumentStore()
    const snapshot = JSON.parse(JSON.stringify(doc.wears)) as WearDoc[]
    doc.removeWear(id)
    pushDocCommand(
      '删除磨损圈',
      () => {
        doc.wears = snapshot.filter((w) => w.id !== id)
      },
      () => {
        doc.wears = snapshot
      },
    )
    const obj = layerService.get(id)
    if (obj) layerService.remove(obj)
  },
}
