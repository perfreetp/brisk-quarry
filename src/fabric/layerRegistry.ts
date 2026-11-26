import type { FabricObject } from 'fabric'
import type { LayerId } from '@/types/doc'
import { LAYER_ORDER } from './constants'

type AnyObj = FabricObject & Record<string, unknown>

/**
 * 扁平顶层对象的图层注册表：layerId → Set<object>，id → object 双索引。
 * loadFromJSON 后通过 rebuildFromCanvas 重建；ActiveSelection 临时 reparent 不影响引用。
 */
export class LayerRegistry {
  private byLayer = new Map<LayerId, Set<AnyObj>>()
  private byId = new Map<string, AnyObj>()

  constructor() {
    for (const id of LAYER_ORDER) this.byLayer.set(id, new Set())
  }

  add(obj: AnyObj, layerId: LayerId): void {
    if (!obj.id) throw new Error('入册对象必须带 id')
    obj.layerId = layerId
    this.byLayer.get(layerId)!.add(obj)
    this.byId.set(String(obj.id), obj)
  }

  remove(obj: AnyObj): void {
    const layerId = obj.layerId as LayerId | undefined
    if (layerId) this.byLayer.get(layerId)?.delete(obj)
    if (obj.id) this.byId.delete(String(obj.id))
  }

  objects(layerId: LayerId): AnyObj[] {
    return [...(this.byLayer.get(layerId) ?? [])]
  }

  get(id: string): AnyObj | undefined {
    return this.byId.get(id)
  }

  /** 开发期审计：画布上不应存在无 layerId 的非临时业务对象 */
  audit(canvasObjects: AnyObj[]): string[] {
    const problems: string[] = []
    for (const o of canvasObjects) {
      if (!o.layerId && !o.excludeFromExport && o.type !== 'activeselection') {
        problems.push(`对象 ${o.type}/${String(o.id ?? '?')} 缺少 layerId`)
      }
    }
    return problems
  }

  /** loadFromJSON 后唯一重建入口 */
  rebuildFromCanvas(canvasObjects: AnyObj[]): void {
    this.byLayer.clear()
    this.byId.clear()
    for (const id of LAYER_ORDER) this.byLayer.set(id, new Set())
    for (const obj of canvasObjects) {
      const layerId = obj.layerId as LayerId | undefined
      if (layerId && this.byLayer.has(layerId) && obj.id) {
        this.byLayer.get(layerId)!.add(obj)
        this.byId.set(String(obj.id), obj)
      }
    }
  }

  clear(): void {
    this.byLayer.forEach((s) => s.clear())
    this.byId.clear()
  }
}

/** 模块级单例 */
export const layerRegistry = new LayerRegistry()
