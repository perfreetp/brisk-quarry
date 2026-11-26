import { markRaw, shallowRef } from 'vue'
import {
  Canvas,
  FabricObject,
  FabricImage,
  Point as FPoint,
  type FabricObject as TFabricObject,
} from 'fabric'
import type { LampSpec, LayerId, Point, ZoneKind } from '@/types/doc'
import { CUSTOM_PROPERTIES } from './constants'
import { setCanvas, getCanvas, tryGetCanvas } from './canvasHolder'
import { layerService } from './layerService'
import { brushService } from './brushService'
import { shapeTools } from './shapeTools'
import { lampService } from './lampService'
import { overlayService, initOverlay, disposeOverlay } from './overlayService'
import { annotationService } from './annotationService'
import { wearService } from './wearService'
import { applyTableClip } from './clipService'
import { canInteract, refreshAllFlags } from './roleService'
import { captureMany, pushAddCommand, pushTransformCommand, redo, undo, type ObjectSnapshot } from './historyService'
import { recomputeAllAlignments, snapIfClose } from './alignment'
import { pxToMm } from '@/geometry/units'
import { useDocumentStore } from '@/stores/document'
import { useUiStore, type ToolId } from '@/stores/ui'
import { uid } from '@/utils/id'

type AnyObj = TFabricObject & Record<string, unknown>

interface DrawDraft {
  start: FPoint
  polygonPoints: FPoint[]
}

// 启动一次性登记自定义属性白名单
FabricObject.customProperties = [...CUSTOM_PROPERTIES]

const disposers: Array<() => void> = []
let beforeSnapshots: Map<string, ObjectSnapshot> | null = null
let draft: DrawDraft | null = null
let rafPending = false
const colliderLast = new Map<string, { left: number; top: number }>()

/** ActiveSelection/Group 的子对象，或对象自身 */
function activeChildren(active: TFabricObject): AnyObj[] {
  if (active.type === 'activeselection' || active.type === 'group') {
    return (active as unknown as { getObjects(): TFabricObject[] }).getObjects() as AnyObj[]
  }
  return [active as AnyObj]
}

export function useCanvas() {
  const canvasEl = shallowRef<HTMLCanvasElement | null>(null)
  const ready = shallowRef(false)
  const ui = useUiStore()
  const doc = useDocumentStore()

  async function initCanvas(el: HTMLCanvasElement) {
    // HMR/重复初始化防护
    const existing = tryGetCanvas()
    if (existing) {
      await existing.dispose()
      setCanvas(null)
    }
    const canvas = markRaw(new Canvas(el, { preserveObjectStacking: true, selection: true }))
    setCanvas(canvas)
    initOverlay(canvas)
    wireEvents(canvas)
    wireKeyboard()
    ready.value = true
    return canvas
  }

  function wireKeyboard() {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', handler)
    disposers.push(() => window.removeEventListener('keydown', handler))
  }

  function wireEvents(canvas: Canvas) {
    disposers.push(
      canvas.on('path:created', (e) => {
        brushService.registerStroke(e.path as unknown as Parameters<typeof brushService.registerStroke>[0])
      }),
    )

    disposers.push(
      canvas.on('mouse:down', (opt) => onMouseDown(canvas, opt)),
      canvas.on('mouse:move', (opt) => onMouseMove(canvas, opt)),
      canvas.on('mouse:up', (opt) => onMouseUp(canvas, opt)),
      canvas.on('mouse:dblclick', (opt) => onDblClick(canvas, opt)),
    )

    // 变换前拍快照（含选区全部子对象与联动对象）
    disposers.push(
      canvas.on('mouse:down', (opt) => {
        const active = canvas.getActiveObject()
        if (active && opt.target) {
          const children = activeChildren(active)
          beforeSnapshots = captureMany(children)
        }
      }),
    )

    disposers.push(
      canvas.on('object:moving', (opt) => onObjectMoving(canvas, opt.target as AnyObj)),
      canvas.on('object:modified', (opt) => onObjectModified(canvas, opt.target as AnyObj)),
    )

    disposers.push(
      canvas.on('selection:created', (e) => ui.setSelectedIds((e.selected ?? []).map((o) => String((o as AnyObj).id)))),
      canvas.on('selection:updated', (e) => ui.setSelectedIds((e.selected ?? []).map((o) => String((o as AnyObj).id)))),
      canvas.on('selection:cleared', () => ui.setSelectedIds([])),
    )

    // HTML5 拖放：外部灯位库拖入
    const upper = canvas.upperCanvasEl
    const dragover = (e: DragEvent) => e.preventDefault()
    upper.addEventListener('dragover', dragover)
    disposers.push(() => upper.removeEventListener('dragover', dragover))
    disposers.push(
      canvas.on('drop', (opt) => {
        const specId = opt.e.dataTransfer?.getData('application/x-lamp-spec')
        if (!specId) return
        const spec = doc.lampSpecs.find((s) => s.id === specId)
        if (!spec || !doc.calibration.done) return
        lampService.createLamp(spec, opt.scenePoint)
      }),
    )

    disposers.push(
      canvas.on('mouse:wheel', (opt) => {
        const e = opt.e as WheelEvent
        e.preventDefault()
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        const next = Math.min(4, Math.max(0.2, canvas.getZoom() * delta))
        canvas.zoomToPoint(opt.scenePoint, next)
        ui.setZoom(next)
      }),
    )
  }

  /* ---------------- 工具交互 ---------------- */

  function onMouseDown(canvas: Canvas, opt: { scenePoint: FPoint; target?: TFabricObject | null }) {
    const target = (opt.target ?? null) as AnyObj | null
    if (ui.role === 'operator' && !canInteract(target, ui.role) && ui.activeTool === 'select') {
      // 运营方点空白：清选择
      if (!target) canvas.discardActiveObject()
    }
    if (ui.role === 'operator' && ui.activeTool === 'annotation' && target) {
      if (target.docType === 'lamp') {
        window.dispatchEvent(new CustomEvent('pst:annotate-lamp', { detail: String(target.id) }))
      }
      return
    }

    switch (ui.activeTool) {
      case 'zone-rect':
      case 'collider-rect':
      case 'arrow':
      case 'wear':
        draft = { start: opt.scenePoint, polygonPoints: [] }
        break
      case 'collider-polygon':
        draft = draft ?? { start: opt.scenePoint, polygonPoints: [] }
        draft.polygonPoints.push(opt.scenePoint)
        overlayService.setCalibrationHandles(draft.polygonPoints)
        canvas.requestRenderAll()
        break
      default:
        break
    }
  }

  function onMouseMove(canvas: Canvas, opt: { scenePoint: FPoint }) {
    if (!draft) return
    // 矩形/箭头/磨损圈的实时预览由 mouseup 落地，这里只在多边形时刷新手柄
    if (ui.activeTool === 'collider-polygon') {
      overlayService.setCalibrationHandles([...draft.polygonPoints, opt.scenePoint])
      scheduleRender(canvas)
    }
  }

  function onMouseUp(canvas: Canvas, opt: { scenePoint: FPoint }) {
    if (!draft) return
    // 多边形逐点绘制，mouseup 不清草稿，双击才提交
    if (ui.activeTool === 'collider-polygon') return
    const d = draft
    draft = null
    const tool = ui.activeTool
    const moved = Math.hypot(opt.scenePoint.x - d.start.x, opt.scenePoint.y - d.start.y)

    if (tool === 'zone-rect' && moved > 4) {
      const obj = shapeTools.zoneRect(d.start, opt.scenePoint, (ui.zoneKind ?? 'flipper') as ZoneKind)
      pushAddCommand('分区矩形', [obj])
    } else if (tool === 'collider-rect' && moved > 4) {
      const obj = shapeTools.colliderRect(d.start, opt.scenePoint)
      pushAddCommand('碰撞体', [obj])
      recomputeAllAlignments(doc.calibration)
    } else if (tool === 'arrow' && moved > 4) {
      const obj = shapeTools.arrow(d.start, opt.scenePoint)
      pushAddCommand('shot 指示线', [obj])
    } else if (tool === 'wear' && moved > 4) {
      wearService.create(
        { x: d.start.x, y: d.start.y },
        moved,
        '',
        ui.role === 'operator' ? '运营方' : '主设',
      )
    }
    overlayService.setCalibrationHandles([])
    canvas.requestRenderAll()
  }

  function onDblClick(canvas: Canvas, _opt: unknown) {
    if (ui.activeTool === 'collider-polygon' && draft && draft.polygonPoints.length >= 3) {
      const obj = shapeTools.colliderPolygon(draft.polygonPoints)
      draft = null
      overlayService.setCalibrationHandles([])
      if (obj) {
        pushAddCommand('碰撞体多边形', [obj])
        recomputeAllAlignments(doc.calibration)
      }
      canvas.requestRenderAll()
    }
  }

  /* ---------------- 移动：对齐实时评估 + 联动 ---------------- */

  function onObjectMoving(canvas: Canvas, target: AnyObj) {
    if (!target) return
    const lampDoc = target.docType === 'lamp' ? doc.lampById(String(target.id)) : undefined
    if (lampDoc) {
      overlayService.setMovingLamp(target, doc.calibration, lampDoc.diameterMm / 2)
      annotationService.syncOne(String(target.id))
      scheduleRender(canvas)
      return
    }
    if (target.docType === 'collider') {
      // 碰撞体平移 → 绑定灯珠按同源 px 偏移联动；联动灯珠补入变换快照
      const prev = colliderLast.get(String(target.id))
      const left = Number(target.left)
      const top = Number(target.top)
      if (prev) {
        const dx = left - prev.left
        const dy = top - prev.top
        if (dx !== 0 || dy !== 0) {
          const moved = lampService.moveBoundLamps(String(target.collisionId ?? target.id), dx, dy)
          if (beforeSnapshots)
            for (const m of moved)
              if (!beforeSnapshots.has(String(m.id))) beforeSnapshots.set(String(m.id), captureMany([m]).get(String(m.id))!)
          for (const m of moved) annotationService.syncOne(String(m.id))
        }
      }
      colliderLast.set(String(target.id), { left, top })
      scheduleRender(canvas)
    }
  }

  function onObjectModified(canvas: Canvas, target: AnyObj) {
    overlayService.setMovingLamp(null, doc.calibration, 0)
    if (!target) return

    if (target.docType === 'lamp') {
      const lampDoc = doc.lampById(String(target.id))
      if (lampDoc) {
        const result = snapIfClose(target, doc.calibration, lampDoc.diameterMm / 2)
        if (result) lampService.applySnapResult(target, result.centerMm)
        else doc.updateLampCenter(String(target.id), pxToMm(doc.calibration, target.getCenterPoint()))
      }
      annotationService.syncOne(String(target.id))
    }

    if (target.docType === 'collider') {
      colliderLast.delete(String(target.id))
      recomputeAllAlignments(doc.calibration)
    }

    // 变换命令（before/after 快照）
    if (beforeSnapshots) {
      const children = activeChildren(target)
      const after = captureMany(children)
      pushTransformCommand('变换对象', beforeSnapshots, after)
      beforeSnapshots = null
    }
    canvas.requestRenderAll()
  }

  function scheduleRender(canvas: Canvas) {
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      canvas.requestRenderAll()
    })
  }

  /* ---------------- 对外命令 ---------------- */

  async function importBaseImage(file: File) {
    const url = URL.createObjectURL(file)
    try {
      const img = await FabricImage.fromURL(url)
      URL.revokeObjectURL(url)
      const canvas = getCanvas()
      // 适配画布尺寸
      const scale = Math.min(canvas.getWidth() / (img.width || 1), canvas.getHeight() / (img.height || 1), 1)
      img.set({ scaleX: scale, scaleY: scale, left: 20, top: 20 })
      const tagged = img as unknown as AnyObj
      tagged.id = uid('base')
      tagged.layerId = 'base'
      tagged.docType = 'base-image'
      layerService.add(tagged, 'base')
      canvas.sendObjectToBack(img)
      doc.baseImageId = file.name
      doc.markDirty()
    } catch (err) {
      URL.revokeObjectURL(url)
      throw err
    }
  }

  function applyCalibration() {
    const canvas = getCanvas()
    applyTableClip(canvas, doc.calibration)
    wearService.rebuildAll()
    lampService.rebuildFromDocs()
    annotationService.syncAll()
    recomputeAllAlignments(doc.calibration)
  }

  function setTool(tool: ToolId) {
    const canvas = getCanvas()
    if (tool === 'brush') {
      canvas.isDrawingMode = true
      brushService.ensureBrush(canvas, doc.calibration, ui.brush.widthMm, ui.brush.color, ui.brush.dashed)
    } else {
      canvas.isDrawingMode = false
    }
    canvas.discardActiveObject()
    canvas.requestRenderAll()
  }

  function dropLampSpec(spec: LampSpec, point: Point) {
    lampService.createLamp(spec, new FPoint(point.x, point.y))
  }

  function refreshPermissions() {
    refreshAllFlags(ui.role)
  }

  async function dispose() {
    for (const d of disposers.splice(0)) d()
    overlayService.clear()
    disposeOverlay()
    const canvas = tryGetCanvas()
    if (canvas) {
      await canvas.dispose()
      setCanvas(null)
    }
    ready.value = false
  }

  // 注意：不在此处注册 onMounted/onBeforeUnmount。
  // useCanvas() 会被多个组件调用，生命周期只能由持有 <canvas> 的 CanvasStage 注册一次，
  // 否则 App 的组件作用域卸载时会误 dispose 掉正在使用的画布。

  return {
    canvasEl,
    ready,
    initCanvas,
    importBaseImage,
    applyCalibration,
    setTool,
    dropLampSpec,
    refreshPermissions,
    dispose,
    layerId: (id: LayerId) => id,
  }
}
