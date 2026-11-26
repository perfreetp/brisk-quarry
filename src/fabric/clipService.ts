import { Rect, type Canvas } from 'fabric'
import type { Calibration } from '@/types/doc'
import { tableRectPx } from '@/geometry/units'

/**
 * 台面边界蒙版：canvas 级 absolutePositioned clipPath，固定在场景(mm)空间。
 * 对象任意 move/rotate/scale 都被同一台面边界实时裁切 —— “蒙版跟着走”由固定场景空间天然满足。
 * 标定变更/导入后重新调用；不依赖 toJSON 还原，重建更可控。
 */
export function applyTableClip(canvas: Canvas, cal: Calibration): void {
  if (!cal.done || !cal.p1 || !cal.p2) {
    canvas.clipPath = undefined
    canvas.requestRenderAll()
    return
  }
  const r = tableRectPx(cal)
  canvas.clipPath = new Rect({
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    originX: 'left',
    originY: 'top',
    absolutePositioned: true,
    selectable: false,
    evented: false,
  })
  canvas.controlsAboveOverlay = true
  canvas.requestRenderAll()
}

export function clearTableClip(canvas: Canvas): void {
  canvas.clipPath = undefined
}
