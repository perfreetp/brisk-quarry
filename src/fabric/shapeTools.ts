import { Ellipse, FabricObject, Group, Line, Polygon, Rect, Triangle, type Point as FPoint } from 'fabric'
import type { LayerId, ZoneKind } from '@/types/doc'
import type { Vec2 } from '@/geometry/units'
import { layerService } from './layerService'
import { uid } from '@/utils/id'

type AnyObj = FabricObject & Record<string, unknown>

const ZONE_COLORS: Record<ZoneKind, string> = {
  flipper: '#0ea5e9',
  spring: '#a855f7',
  target: '#f97316',
  orbit: '#22c55e',
}

function tag(obj: AnyObj, docType: string, layerId: LayerId, extra: Record<string, unknown> = {}): AnyObj {
  obj.id = uid(docType)
  obj.layerId = layerId
  obj.docType = docType
  Object.assign(obj, extra)
  return obj
}

export const shapeTools = {
  zoneRect(from: FPoint, to: FPoint, kind: ZoneKind): AnyObj {
    const obj = new Rect({
      left: Math.min(from.x, to.x),
      top: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
      originX: 'left',
      originY: 'top',
      fill: `${ZONE_COLORS[kind]}22`,
      stroke: ZONE_COLORS[kind],
      strokeWidth: 2,
      selectable: true,
    }) as unknown as AnyObj
    tag(obj, 'zone', 'zones', { zoneKind: kind })
    layerService.add(obj, 'zones')
    return obj
  },

  colliderRect(from: FPoint, to: FPoint): AnyObj {
    const obj = new Rect({
      left: Math.min(from.x, to.x),
      top: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
      originX: 'left',
      originY: 'top',
      fill: 'rgba(239,68,68,0.08)',
      stroke: '#dc2626',
      strokeWidth: 2,
      strokeDashArray: [6, 4],
    }) as unknown as AnyObj
    tag(obj, 'collider', 'collision', { collisionId: uid('col') })
    layerService.add(obj, 'collision')
    return obj
  },

  colliderPolygon(points: FPoint[]): AnyObj | null {
    if (points.length < 3) return null
    const obj = new Polygon(points, {
      fill: 'rgba(239,68,68,0.08)',
      stroke: '#dc2626',
      strokeWidth: 2,
      strokeDashArray: [6, 4],
    }) as unknown as AnyObj
    tag(obj, 'collider', 'collision', { collisionId: uid('col') })
    layerService.add(obj, 'collision')
    return obj
  },

  /** shot 指示线：线段 + 末端三角，虚线与品牌图案区分 */
  arrow(from: FPoint, to: FPoint): AnyObj {
    const line = new Line([from.x, from.y, to.x, to.y], {
      stroke: '#1d4ed8',
      strokeWidth: 3,
      strokeDashArray: [10, 6],
      selectable: true,
      evented: true,
    })
    const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
    const head = new Triangle({
      left: to.x,
      top: to.y,
      width: 14,
      height: 14,
      fill: '#1d4ed8',
      angle: angle + 90,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    })
    const group = new Group([line, head], {
      selectable: true,
      evented: true,
    }) as unknown as AnyObj
    tag(group, 'arrow', 'silkscreen', { arrowHead: true })
    layerService.add(group, 'silkscreen')
    return group
  },

  /** 磨损圈（mm 空间参数，px 渲染） */
  wearCircle(centerPx: Vec2, radiusPx: number, note = ''): AnyObj {
    const obj = new Ellipse({
      left: centerPx.x,
      top: centerPx.y,
      rx: radiusPx,
      ry: radiusPx,
      originX: 'center',
      originY: 'center',
      fill: 'rgba(239,68,68,0.12)',
      stroke: '#ef4444',
      strokeWidth: 2,
    }) as unknown as AnyObj
    tag(obj, 'wear', 'wear', { wearId: uid('wear'), wearNote: note })
    layerService.add(obj, 'wear')
    return obj
  },
}
