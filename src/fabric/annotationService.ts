import { Circle, FabricObject, Point as FPoint } from 'fabric'
import type { Annotation } from '@/types/doc'
import { mmToPx, pxToMm } from '@/geometry/units'
import { layerService } from './layerService'
import { useDocumentStore } from '@/stores/document'
import { uid } from '@/utils/id'

type AnyObj = FabricObject & Record<string, unknown>

const MARKER_OFFSET_MM = 6

function markerPosition(annotation: Annotation): FPoint | null {
  const doc = useDocumentStore()
  const lamp = doc.lampById(annotation.lampId)
  const cal = doc.calibration
  const anchor = lamp ? lamp.centerMm : annotation.anchorMm
  if (!anchor) return null
  return new FPoint(
    mmToPx(cal, { x: anchor.x + MARKER_OFFSET_MM, y: anchor.y - MARKER_OFFSET_MM }).x,
    mmToPx(cal, { x: anchor.x + MARKER_OFFSET_MM, y: anchor.y - MARKER_OFFSET_MM }).y,
  )
}

export const annotationService = {
  create(lampId: string, text: string, author: string, role: Annotation['role']): Annotation {
    const doc = useDocumentStore()
    const lamp = doc.lampById(lampId)
    const annotation: Annotation = {
      id: uid('anno'),
      lampId,
      text,
      author,
      role,
      createdAt: Date.now(),
      resolved: false,
      anchorMm: lamp ? { ...lamp.centerMm } : null,
    }
    doc.addAnnotation(annotation)
    this.renderMarker(annotation)
    return annotation
  },

  renderMarker(annotation: Annotation): void {
    const pos = markerPosition(annotation)
    if (!pos) return
    const existing = layerService.get(annotation.id)
    const unresolved = !annotation.resolved
    const common = {
      left: pos.x,
      top: pos.y,
      radius: 11,
      originX: 'center' as const,
      originY: 'center' as const,
      fill: unresolved ? '#2563eb' : '#9ca3af',
      stroke: '#fff',
      strokeWidth: 2,
      opacity: unresolved ? 0.95 : 0.45,
    }
    if (existing) {
      existing.set(common)
      return
    }
    // 单圆即可：fabric 命中区按半径，视觉靠 fill/opacity 区分已解决态
    const marker = new Circle(common) as unknown as AnyObj
    marker.id = annotation.id
    marker.layerId = 'annotation'
    marker.docType = 'annotation-marker'
    marker.annotationId = annotation.id
    layerService.add(marker, 'annotation')
  },

  /** 灯珠 moving/modified、导入、标定变更后同步 */
  syncOne(lampId: string): void {
    const doc = useDocumentStore()
    for (const a of doc.annotations.filter((x) => x.lampId === lampId)) this.renderMarker(a)
  },

  syncAll(): void {
    const doc = useDocumentStore()
    for (const a of doc.annotations) this.renderMarker(a)
    // 清理已删除批注的残留 marker
    const ids = new Set(doc.annotations.map((a) => a.id))
    for (const m of layerService.objects('annotation')) {
      if (!ids.has(String(m.id))) layerService.remove(m)
    }
  },

  /** 灯珠被删：批注保留，marker 落到 anchorMm 快照并标记失锚 */
  handleLampRemoved(lampId: string): void {
    this.syncOne(lampId)
  },

  resolve(id: string, resolved: boolean): void {
    const doc = useDocumentStore()
    doc.resolveAnnotation(id, resolved)
    const a = doc.annotations.find((x) => x.id === id)
    if (a) this.renderMarker(a)
  },

  remove(id: string): void {
    const doc = useDocumentStore()
    doc.removeAnnotation(id)
    const marker = layerService.get(id)
    if (marker) layerService.remove(marker)
  },

  anchorMmOf(event: { scenePoint: FPoint }): { x: number; y: number } {
    return pxToMm(useDocumentStore().calibration, event.scenePoint)
  },
}
