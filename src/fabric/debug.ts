/**
 * 开发/自动化调试门面，仅 DEV 构建挂到 window.__pst。
 * 生产构建不注册，不暴露任何内部接口。
 */
import { useDocumentStore } from '@/stores/document'
import { useUiStore } from '@/stores/ui'
import { lampService } from './lampService'
import { layerService } from './layerService'
import { getCanvas } from './canvasHolder'
import { exportLampCsv, exportSilkscreenSvg } from './exportSvgCsv'
import { recomputeAllAlignments } from './alignment'
import { annotationService } from './annotationService'
import { wearService } from './wearService'

export function registerDebugFacade(): void {
  if (!import.meta.env.DEV) return
  const facade = {
    doc: () => useDocumentStore(),
    ui: () => useUiStore(),
    canvas: () => getCanvas(),
    layers: () => layerService,
    lamp: () => lampService,
    annotation: () => annotationService,
    wear: () => wearService,
    recompute: () => recomputeAllAlignments(useDocumentStore().calibration),
    exportCsv: () => exportLampCsv(),
    exportSvg: () => exportSilkscreenSvg(),    /** 模拟从灯位库拖入（自动化用）；参数为预设 id */
    dropLamp(specId: string, x: number, y: number) {
      const spec = useDocumentStore().lampSpecs.find((s) => s.id === specId)
      if (!spec) {
        console.warn(`[debug] dropLamp: 找不到灯珠预设 id=${String(specId)}（注意这里要传 id 字符串，不是 spec 对象）`)
        return null
      }
      return lampService.createLamp(spec, { x, y })
    },
  }
  ;(window as unknown as { __pst: typeof facade }).__pst = facade
}
