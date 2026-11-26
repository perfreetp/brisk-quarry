import { Ellipse, FabricObject } from 'fabric'
import type { LampDoc, LampSpec, Point } from '@/types/doc'
import { mmToPx, pxPerMm, pxToMm } from '@/geometry/units'
import { layerService } from './layerService'
import { evaluateLamp, paintLampState } from './alignment'
import { pushAddCommand } from './historyService'
import { useDocumentStore } from '@/stores/document'
import { uid } from '@/utils/id'

type AnyObj = FabricObject & Record<string, unknown>

export const lampService = {
  /** 按灯珠真实直径(mm)生成椭圆；非等比像素空间里物理圆本就显椭圆 */
  createLamp(spec: LampSpec, atScenePx: Point): AnyObj {
    const doc = useDocumentStore()
    const cal = doc.calibration
    const centerMm = pxToMm(cal, atScenePx)
    const { sx, sy } = pxPerMm(cal)
    const lamp = new Ellipse({
      left: atScenePx.x,
      top: atScenePx.y,
      rx: Math.abs((spec.diameterMm / 2) * sx),
      ry: Math.abs((spec.diameterMm / 2) * sy),
      originX: 'center',
      originY: 'center',
      fill: `${spec.color}55`,
      stroke: '#9ca3af',
      strokeWidth: 2,
      // 真实物理直径：禁止缩放与旋转，只留移动
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hasRotatingPoint: false,
    }) as unknown as AnyObj
    const code = doc.takeLampCode()
    lamp.id = uid('lamp')
    lamp.layerId = 'lamps'
    lamp.docType = 'lamp'
    lamp.lampSpecId = spec.id
    lamp.lampCode = code
    layerService.add(lamp, 'lamps')

    const info = evaluateLamp(lamp, cal, spec.diameterMm / 2)
    lamp.alignState = info.state
    lamp.deviationMm = info.deviationMm
    lamp.boundCollisionId = info.hit ? info.hit.bodyId : null
    paintLampState(lamp, info.state)

    const lampDoc: LampDoc = {
      id: String(lamp.id),
      code,
      specId: spec.id,
      diameterMm: spec.diameterMm,
      color: spec.color,
      centerMm,
      boundCollisionId: info.hit ? info.hit.bodyId : null,
      deviationMm: info.deviationMm,
      alignState: info.state,
    }
    doc.addLamp(lampDoc)
    pushAddCommand('放入灯珠', [lamp])
    return lamp
  },

  /** 松手磁吸后回写位置与对齐状态 */
  applySnapResult(lamp: AnyObj, centerMm: { x: number; y: number }): void {
    const doc = useDocumentStore()
    const cal = doc.calibration
    const px = mmToPx(cal, centerMm)
    // 灯珠 originX/Y 均为 center，直接 set left/top 即设定灯心
    lamp.set({ left: px.x, top: px.y })
    const info = evaluateLamp(lamp, cal, doc.lampById(String(lamp.id))!.diameterMm / 2)
    lamp.alignState = info.state
    lamp.deviationMm = info.deviationMm
    lamp.boundCollisionId = info.hit ? info.hit.bodyId : null
    paintLampState(lamp, info.state)
    doc.updateLampAlignment(String(lamp.id), {
      boundCollisionId: info.hit ? info.hit.bodyId : null,
      deviationMm: info.deviationMm,
      alignState: info.state,
      centerMm,
    })
  },

  /** 碰撞体移动时按同源 px 偏移平移绑定灯珠（旋转/缩放场景由 transform 快照兜底） */
  moveBoundLamps(collisionId: string, dxPx: number, dyPx: number): AnyObj[] {
    const moved: AnyObj[] = []
    for (const lamp of layerService.objects('lamps')) {
      if (String(lamp.boundCollisionId) === collisionId) {
        lamp.set({ left: Number(lamp.left) + dxPx, top: Number(lamp.top) + dyPx })
        moved.push(lamp)
      }
    }
    return moved
  },

  removeLamp(lamp: AnyObj): void {
    const doc = useDocumentStore()
    doc.removeLamp(String(lamp.id))
    layerService.remove(lamp)
  },

  /** 加载工程后按 LampDoc 重建灯珠视图 */
  rebuildFromDocs(): void {
    const doc = useDocumentStore()
    const cal = doc.calibration
    for (const ld of doc.lamps) {
      if (layerService.get(ld.id)) continue
      const px = mmToPx(cal, ld.centerMm)
      const { sx, sy } = pxPerMm(cal)
      const lamp = new Ellipse({
        left: px.x,
        top: px.y,
        rx: Math.abs((ld.diameterMm / 2) * sx),
        ry: Math.abs((ld.diameterMm / 2) * sy),
        originX: 'center',
        originY: 'center',
        fill: `${ld.color}55`,
        strokeWidth: 2,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasRotatingPoint: false,
      }) as unknown as AnyObj
      lamp.id = ld.id
      lamp.layerId = 'lamps'
      lamp.docType = 'lamp'
      lamp.lampSpecId = ld.specId
      lamp.lampCode = ld.code
      lamp.alignState = ld.alignState
      lamp.deviationMm = ld.deviationMm
      lamp.boundCollisionId = ld.boundCollisionId
      layerService.add(lamp, 'lamps')
      paintLampState(lamp, ld.alignState)
    }
  },
}
