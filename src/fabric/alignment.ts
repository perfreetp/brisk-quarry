import { FabricObject, util } from 'fabric'
import type { AlignState, Calibration } from '@/types/doc'
import { pxToMm, type Vec2 } from '@/geometry/units'
import {
  computeSnap,
  nearestAmongBodies,
  signedDeviation,
  type CollisionBodyMm,
  type NearestResult,
} from '@/geometry/distance'
import { layerService } from './layerService'
import { useDocumentStore } from '@/stores/document'

type AnyObj = FabricObject & Record<string, unknown>

export interface LampAlignInfo {
  hit: NearestResult | null
  deviationMm: number | null
  state: AlignState
}

/** 超出该距离(mm)视为未绑定，不再吸附/标红 */
export const BIND_GAP_MM = 20

/** 碰撞体轮廓 → mm 空间多边形 */
function bodyToMm(obj: AnyObj, cal: Calibration): CollisionBodyMm | null {
  if (obj.type === 'circle' || obj.type === 'ellipse') {
    const center = pxToMm(cal, obj.getCenterPoint())
    const rxPx = Number((obj as { rx?: number }).rx ?? 0) * Number(obj.scaleX ?? 1)
    const ryPx = Number((obj as { ry?: number }).ry ?? rxPx) * Number(obj.scaleY ?? 1)
    const { sx, sy } = pxPerMmSafe(cal)
    return {
      id: String(obj.collisionId ?? obj.id),
      kind: 'circle',
      center,
      radiusMm: (Math.abs(rxPx / sx) + Math.abs(ryPx / sy)) / 2,
    }
  }
  // 矩形等：getCoords() 返回绝对场景角点（与 origin 无关），直接归一化到 mm
  // 多边形：本地 points + 绝对矩阵
  let scenePoints: { x: number; y: number }[]
  if (obj.points) {
    const matrix = obj.calcTransformMatrix()
    scenePoints = (obj.points as { x: number; y: number }[]).map((p) => util.transformPoint(p, matrix))
  } else {
    scenePoints = obj.getCoords().map((p) => ({ x: p.x, y: p.y }))
  }
  if (scenePoints.length === 0) return null
  const polygon = scenePoints.map((p) => pxToMm(cal, p))
  return { id: String(obj.collisionId ?? obj.id), kind: 'polygon', polygon }
}

function pxPerMmSafe(cal: Calibration): { sx: number; sy: number } {
  if (!cal.p1 || !cal.p2) return { sx: 1, sy: 1 }
  return {
    sx: (cal.p2.x - cal.p1.x) / cal.tableWidthMm,
    sy: (cal.p2.y - cal.p1.y) / cal.tableHeightMm,
  }
}

export function collectBodies(cal: Calibration): CollisionBodyMm[] {
  return layerService
    .objects('collision')
    .map((o) => bodyToMm(o, cal))
    .filter((b): b is CollisionBodyMm => b !== null)
}

/** 计算单个灯珠当前对齐信息（mm 空间，非等比标定天然成立） */
export function evaluateLamp(lamp: AnyObj, cal: Calibration, radiusMm: number): LampAlignInfo {
  const doc = useDocumentStore()
  const centerMm = pxToMm(cal, lamp.getCenterPoint())
  const hit = nearestAmongBodies(centerMm, collectBodies(cal))
  if (!hit) return { hit: null, deviationMm: null, state: 'unbound' }
  const deviationMm = signedDeviation(centerMm, radiusMm, hit)
  // 最近碰撞体也离得太远 → 未绑定（灰），不参与吸附/标红
  if (Math.abs(deviationMm) > BIND_GAP_MM) return { hit: null, deviationMm: null, state: 'unbound' }
  const state: AlignState = Math.abs(deviationMm) <= doc.settings.snapThresholdMm ? 'aligned' : 'misaligned'
  return { hit, deviationMm, state }
}

/** object:moving 实时评估（不磁吸，只返回信息供 overlay 画中心线/红绿） */
export function evaluateMoving(lamp: AnyObj, cal: Calibration, radiusMm: number): LampAlignInfo {
  return evaluateLamp(lamp, cal, radiusMm)
}

/** object:modified 松手：阈值内磁吸到相切点，返回新灯心(mm)；超阈返回 null */
export function snapIfClose(lamp: AnyObj, cal: Calibration, radiusMm: number): { centerMm: Vec2; info: LampAlignInfo } | null {
  const doc = useDocumentStore()
  const centerMm = pxToMm(cal, lamp.getCenterPoint())
  const hit = nearestAmongBodies(centerMm, collectBodies(cal))
  if (!hit) return null
  const snap = computeSnap(centerMm, radiusMm, hit, doc.settings.snapThresholdMm)
  const info = evaluateLamp(lamp, cal, radiusMm)
  if (!snap) return { centerMm, info }
  return { centerMm: snap, info }
}

/** 碰撞体编辑/重标定/导入后全量重算，防绿态过期 */
export function recomputeAllAlignments(cal: Calibration): void {
  const doc = useDocumentStore()
  for (const lamp of layerService.objects('lamps')) {
    const lampDoc = doc.lampById(String(lamp.id))
    if (!lampDoc) continue
    const info = evaluateLamp(lamp, cal, lampDoc.diameterMm / 2)
    lamp.alignState = info.state
    lamp.deviationMm = info.deviationMm
    lamp.boundCollisionId = info.hit ? info.hit.bodyId : null
    doc.updateLampAlignment(String(lamp.id), {
      boundCollisionId: info.hit ? info.hit.bodyId : null,
      deviationMm: info.deviationMm,
      alignState: info.state,
      centerMm: pxToMm(cal, lamp.getCenterPoint()),
    })
    paintLampState(lamp, info.state)
  }
}

const STATE_COLORS: Record<AlignState, string> = {
  aligned: '#16a34a',
  misaligned: '#dc2626',
  unbound: '#9ca3af',
}

export function paintLampState(lamp: AnyObj, state: AlignState): void {
  lamp.set({ stroke: STATE_COLORS[state], strokeWidth: state === 'unbound' ? 1 : 3 })
}
