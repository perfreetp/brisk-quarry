import type { FabricObject } from 'fabric'
import type { LayerId } from '@/types/doc'
import { LAYER_ORDER } from './constants'
import { getCanvas } from './canvasHolder'
import { layerRegistry } from './layerRegistry'
import { applyFlags } from './roleService'

type AnyObj = FabricObject & Record<string, unknown>

/**
 * 所有对象进出画布的唯一收口：注册表、z-order 连续块、权限、审计。
 * 组件与其他 service 禁止直接调 canvas.add/remove。
 */
export const layerService = {
  /** 插入到指定图层块的末尾；空层则插到第一个更高层对象之前，保证层块连续 */
  add(obj: AnyObj, layerId: LayerId): void {
    const canvas = getCanvas()
    // 先算目标下标（此时新对象还不在画布数组中）
    const index = this.layerInsertIndex(layerId)
    layerRegistry.add(obj, layerId)
    canvas.add(obj)
    canvas.moveObjectTo(obj, Math.min(index, canvas.getObjects().length - 1))
    applyFlags(obj)
  },

  /** 不经 z-order 调整的入册（loadFromJSON 重建时用，对象顺序已在 JSON 中） */
  registerExisting(obj: AnyObj): void {
    if (obj.layerId && obj.id) {
      layerRegistry.add(obj, obj.layerId as LayerId)
      applyFlags(obj)
    }
  },

  /** 历史栈恢复：按快照原 index 插回，保持 z-order */
  reinsertAt(obj: AnyObj, layerId: LayerId, index: number): void {
    const canvas = getCanvas()
    layerRegistry.add(obj, layerId)
    canvas.insertAt(index, obj)
    applyFlags(obj)
  },

  remove(obj: AnyObj): void {
    const canvas = getCanvas()
    layerRegistry.remove(obj)
    canvas.remove(obj)
  },

  objects(layerId: LayerId): AnyObj[] {
    return layerRegistry.objects(layerId)
  },

  get(id: string): AnyObj | undefined {
    return layerRegistry.get(id)
  },

  /** 该层新对象在画布对象数组中的目标下标（调用时新对象尚未加入画布） */
  layerInsertIndex(layerId: LayerId): number {
    const canvas = getCanvas()
    const objs = canvas.getObjects() as AnyObj[]
    let lastIndexOfLayer = -1
    let firstHigherIndex = objs.length
    const layerRank = LAYER_ORDER.indexOf(layerId)
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i]
      const rank = LAYER_ORDER.indexOf(o.layerId as LayerId)
      if (rank === layerRank) lastIndexOfLayer = i
      if (rank > layerRank && i < firstHigherIndex) firstHigherIndex = i
    }
    if (lastIndexOfLayer >= 0) return lastIndexOfLayer + 1
    return firstHigherIndex
  },

  rebuildFromCanvas(): void {
    const canvas = getCanvas()
    layerRegistry.rebuildFromCanvas(canvas.getObjects() as AnyObj[])
    if (import.meta.env.DEV) {
      const problems = layerRegistry.audit(canvas.getObjects() as AnyObj[])
      for (const p of problems) console.warn('[LayerRegistry]', p)
    }
  },

  clearRegistry(): void {
    layerRegistry.clear()
  },

  /** 开发期审计断言 */
  audit(): string[] {
    return layerRegistry.audit(getCanvas().getObjects() as AnyObj[])
  },
}
