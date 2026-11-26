import { FabricObject } from 'fabric'
import { useUiStore } from '@/stores/ui'
import { getCanvas } from './canvasHolder'
import { layerService } from './layerService'
import type { LayerId } from '@/types/doc'

type AnyObj = FabricObject & Record<string, unknown>

export interface ObjectSnapshot {
  id: string
  layerId: LayerId
  json: Record<string, unknown>
  /** 删除态：undo 时需要恢复，redo 时移除 */
  existed: boolean
  index: number
}

export interface Command {
  type: string
  label: string
  undo(): void | Promise<void>
  redo(): void | Promise<void>
}

const LIMIT = 100
const stack: Command[] = []
let pointer = 0
let checkpoint = 0

function syncUi(label: string) {
  const ui = useUiStore()
  ui.setHistory(pointer, stack.length - pointer, label)
  ui.setHistoryDirty(pointer !== checkpoint)
}

/** 捕获单个对象几何 + 白名单业务属性的快照 */
export function captureSnapshot(obj: AnyObj): ObjectSnapshot {
  const canvas = getCanvas()
  return {
    id: String(obj.id),
    layerId: obj.layerId as LayerId,
    json: obj.toObject() as Record<string, unknown>,
    existed: true,
    index: canvas.getObjects().indexOf(obj),
  }
}

export function captureMany(objs: AnyObj[]): Map<string, ObjectSnapshot> {
  const map = new Map<string, ObjectSnapshot>()
  for (const o of objs) map.set(String(o.id), captureSnapshot(o))
  return map
}

/** 唯一恢复入口：存在则 set 几何，不存在则 fromObject 重建并按原 index 入册 */
async function restoreSnapshot(snap: ObjectSnapshot): Promise<void> {
  const existing = layerService.get(snap.id)
  if (existing) {
    existing.set(snap.json)
    existing.setCoords()
  } else {
    const obj = (await FabricObject.fromObject(snap.json)) as AnyObj
    obj.id = snap.id
    layerService.reinsertAt(obj, snap.layerId, snap.index)
  }
}

function makeObjectCommand(label: string, before: ObjectSnapshot[], after: ObjectSnapshot[]): Command {
  return {
    type: 'objects',
    label,
    async undo() {
      for (const snap of before) {
        const obj = layerService.get(snap.id)
        if (snap.existed) {
          await restoreSnapshot(snap)
        } else if (obj) {
          layerService.remove(obj)
        }
      }
    },
    async redo() {
      for (const snap of after) {
        if (snap.existed) await restoreSnapshot(snap)
      }
    },
  }
}

/** 笔划/灯珠等新增对象的命令 */
export function pushAddCommand(label: string, added: AnyObj[]): void {
  const canvas = getCanvas()
  const after: ObjectSnapshot[] = added.map((o) => ({
    id: String(o.id),
    layerId: o.layerId as LayerId,
    json: o.toObject() as Record<string, unknown>,
    existed: true,
    index: canvas.getObjects().indexOf(o),
  }))
  const before: ObjectSnapshot[] = after.map((s) => ({ ...s, existed: false }))
  execute(makeObjectCommand(label, before, after))
}

/** 变换（移动/缩放/旋转，含选区与联动对象）的 before/after 快照对 */
export function pushTransformCommand(
  label: string,
  before: Map<string, ObjectSnapshot>,
  after: Map<string, ObjectSnapshot>,
): void {
  const ids = new Set([...before.keys(), ...after.keys()])
  const b: ObjectSnapshot[] = []
  const a: ObjectSnapshot[] = []
  for (const id of ids) {
    const bs = before.get(id)
    const asnap = after.get(id)
    if (bs && asnap && JSON.stringify(bs.json) === JSON.stringify(asnap.json)) continue
    if (bs) b.push(bs)
    if (asnap) a.push(asnap)
  }
  if (b.length === 0) return
  execute(makeObjectCommand(label, b, a))
}

/** 纯 store 数据命令（批注/磨损） */
export function pushDocCommand(label: string, doRedo: () => unknown, doUndo: () => unknown): void {
  execute({
    type: 'doc',
    label,
    redo: () => {
      doRedo()
    },
    undo: () => {
      doUndo()
    },
  })
}

export function execute(cmd: Command): void {
  stack.splice(pointer)
  stack.push(cmd)
  if (stack.length > LIMIT) stack.shift()
  pointer = stack.length
  syncUi(cmd.label)
}

export function undo(): void {
  if (pointer <= 0) return
  pointer -= 1
  const cmd = stack[pointer]
  void Promise.resolve(cmd.undo()).then(() => {
    getCanvas().requestRenderAll()
    syncUi(cmd.label)
  })
}

export function redo(): void {
  if (pointer >= stack.length) return
  const cmd = stack[pointer]
  pointer += 1
  void Promise.resolve(cmd.redo()).then(() => {
    getCanvas().requestRenderAll()
    syncUi(cmd.label)
  })
}

export function clearHistory(savedCheckpoint = true): void {
  stack.length = 0
  pointer = 0
  checkpoint = savedCheckpoint ? 0 : -1
  syncUi('')
}

export function markCheckpoint(): void {
  checkpoint = pointer
  useUiStore().setHistoryDirty(false)
}

export const historyService = {
  execute,
  undo,
  redo,
  clearHistory,
  markCheckpoint,
  get pointer() {
    return pointer
  },
}
