import { FabricObject, Point as FPoint, type Canvas } from 'fabric'
import type { Calibration } from '@/types/doc'
import { mmToPx, type Vec2 } from '@/geometry/units'
import { evaluateMoving, type LampAlignInfo } from './alignment'
import { layerService } from './layerService'

type AnyObj = FabricObject & Record<string, unknown>

interface OverlayState {
  movingLamp: AnyObj | null
  info: LampAlignInfo | null
  calibrationHandles: FPoint[]
}

const state: OverlayState = { movingLamp: null, info: null, calibrationHandles: [] }
let disposeHandler: (() => void) | null = null

/**
 * after:render 手绘辅助：灯珠十字中心线、最近碰撞体边高亮、偏差文本、标定手柄。
 * 不进对象图、不参与命中/序列化、不受台面 clipPath 裁剪。
 */
export function initOverlay(canvas: Canvas): void {
  disposeHandler = canvas.on('after:render', () => draw(canvas))
}

export function disposeOverlay(): void {
  disposeHandler?.()
  disposeHandler = null
}

export const overlayService = {
  setMovingLamp(lamp: AnyObj | null, cal: Calibration, radiusMm: number) {
    if (!lamp) {
      state.movingLamp = null
      state.info = null
    } else {
      state.movingLamp = lamp
      state.info = evaluateMoving(lamp, cal, radiusMm)
    }
  },
  setCalibrationHandles(points: FPoint[]) {
    state.calibrationHandles = points
  },
  clear() {
    state.movingLamp = null
    state.info = null
    state.calibrationHandles = []
  },
}

export function mmAnchorToPx(cal: Calibration, m: Vec2): FPoint {
  const px = mmToPx(cal, m)
  return new FPoint(px.x, px.y)
}

function draw(canvas: Canvas) {
  const ctx = canvas.contextTop
  if (!ctx) return
  ctx.save()
  ctx.transform(...canvas.viewportTransform)
  drawCalibrationHandles(ctx)
  if (state.movingLamp && state.info) drawLampGuides(ctx, canvas, state.movingLamp, state.info)
  ctx.restore()
}

function drawCalibrationHandles(ctx: CanvasRenderingContext2D) {
  if (state.calibrationHandles.length === 0) return
  for (const p of state.calibrationHandles) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#2563eb'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  if (state.calibrationHandles.length === 2) {
    const [a, b] = state.calibrationHandles
    ctx.beginPath()
    ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    ctx.strokeStyle = 'rgba(37,99,235,0.6)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function drawLampGuides(ctx: CanvasRenderingContext2D, canvas: Canvas, lamp: AnyObj, info: LampAlignInfo) {
  const center = lamp.getCenterPoint()
  const half = 40
  const color = info.state === 'aligned' ? '#16a34a' : info.state === 'misaligned' ? '#dc2626' : '#9ca3af'

  // 十字中心线
  ctx.beginPath()
  ctx.moveTo(center.x - half, center.y)
  ctx.lineTo(center.x + half, center.y)
  ctx.moveTo(center.x, center.y - half)
  ctx.lineTo(center.x, center.y + half)
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  ctx.stroke()
  ctx.setLineDash([])

  if (info.hit) highlightBody(ctx, canvas, info.hit.bodyId)

  const label =
    info.deviationMm === null
      ? '未绑定'
      : `偏差 ${info.deviationMm >= 0 ? '+' : ''}${info.deviationMm.toFixed(2)} mm`
  ctx.font = '13px system-ui, sans-serif'
  const textWidth = ctx.measureText(label).width
  ctx.fillStyle = color
  ctx.fillRect(center.x + half, center.y - 22, textWidth + 12, 20)
  ctx.fillStyle = '#fff'
  ctx.fillText(label, center.x + half + 6, center.y - 8)
}

function highlightBody(ctx: CanvasRenderingContext2D, canvas: Canvas, bodyId: string) {
  const body = layerService.objects('collision').find((o) => String(o.collisionId ?? o.id) === bodyId)
  if (!body) return
  ctx.save()
  ctx.transform(...body.calcTransformMatrix())
  ctx.beginPath()
  const w = Number(body.width ?? 0) * Number(body.scaleX ?? 1)
  const h = Number(body.height ?? 0) * Number(body.scaleY ?? 1)
  const pts = (body.points as { x: number; y: number }[] | undefined) ?? [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ]
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 3 / canvas.getZoom()
  ctx.stroke()
  ctx.restore()
}
