import { PencilBrush, type Canvas, type FabricObject, type Path } from 'fabric'
import type { Calibration } from '@/types/doc'
import { mmToPxScalar } from '@/geometry/units'
import { getCanvas } from './canvasHolder'
import { layerService } from './layerService'
import { pushAddCommand } from './historyService'
import { uid } from '@/utils/id'

type AnyObj = FabricObject & Record<string, unknown>

/**
 * 丝印笔刷：物理毫米笔宽（非等比标定下取几何均值，面板需注明近似）。
 * 视口缩放不改场景坐标，物理尺寸恒定；每条笔划独立 Path，一笔一撤销。
 */
export const brushService = {
  ensureBrush(canvas: Canvas, cal: Calibration, widthMm: number, color: string, dashed: boolean): PencilBrush {
    if (!(canvas.freeDrawingBrush instanceof PencilBrush)) {
      canvas.freeDrawingBrush = new PencilBrush(canvas)
    }
    const brush = canvas.freeDrawingBrush as PencilBrush
    brush.width = mmToPxScalar(cal, widthMm)
    brush.color = color
    brush.strokeDashArray = dashed ? [brush.width * 3, brush.width * 2] : null
    return brush
  },

  updateBrush(cal: Calibration, widthMm: number, color: string, dashed: boolean): void {
    const canvas = getCanvas()
    if (canvas.freeDrawingBrush) this.ensureBrush(canvas, cal, widthMm, color, dashed)
  },

  /** path:created 收口：打白名单属性、入册丝印层、压入历史栈 */
  registerStroke(path: Path): void {
    const obj = path as unknown as AnyObj
    obj.id = uid('stroke')
    obj.layerId = 'silkscreen'
    obj.docType = 'stroke'
    // PencilBrush 已先 canvas.add，这里补注册并校正到丝印层块
    layerService.registerExisting(obj)
    const canvas = getCanvas()
    const index = layerService.layerInsertIndex('silkscreen')
    canvas.moveObjectTo(obj, Math.min(index, canvas.getObjects().length - 1))
    pushAddCommand('丝印笔划', [obj])
  },
}
