import type { FabricObject } from 'fabric'
import type { LayerId, Role } from '@/types/doc'
import type { DocObjectType } from './constants'
import { getCanvas } from './canvasHolder'
import { useDocumentStore } from '@/stores/document'
import { useUiStore } from '@/stores/ui'

type AnyObj = FabricObject & Record<string, unknown>

export interface EffectiveFlags {
  selectable: boolean
  evented: boolean
  visible: boolean
}

/** 运营方工具白名单 */
const OPERATOR_TOOLS = new Set(['select', 'annotation', 'wear'])

export function roleAllowsTool(role: Role, tool: string): boolean {
  return role === 'designer' || OPERATOR_TOOLS.has(tool)
}

/**
 * 权限唯一收口：fabric 对象上的 selectable/evented/visible 都是派生物，
 * 事实源是 Pinia 的角色与 LayerMeta。
 */
export function effectiveFlags(role: Role, layerId: LayerId, docType?: DocObjectType): EffectiveFlags {
  const doc = useDocumentStore()
  const meta = doc.layerById(layerId)
  if (!meta) return { selectable: false, evented: false, visible: false }

  const visible = role === 'operator' ? meta.visible && meta.operatorVisible : meta.visible

  if (role === 'operator') {
    // 运营方：只有灯珠（挂批注）、批注 marker、磨损圈可交互
    const interactive = docType === 'lamp' || docType === 'annotation-marker' || docType === 'wear'
    return { visible, selectable: interactive, evented: interactive }
  }

  // 主设：文档级锁定层不可交互；底图不可选中
  if (layerId === 'base') return { visible, selectable: false, evented: false }
  return { visible, selectable: !meta.locked, evented: !meta.locked }
}

export function applyFlags(obj: AnyObj): void {
  const role = useUiStore().role
  const flags = effectiveFlags(role, obj.layerId as LayerId, obj.docType as DocObjectType)
  obj.visible = flags.visible
  obj.selectable = flags.selectable
  obj.evented = flags.evented
}

/** mouse:down 入口断言，防快捷键绕过工具按钮态 */
export function canInteract(obj: FabricObject | null | undefined, role: Role): boolean {
  if (!obj) return false
  const o = obj as AnyObj
  if (!o.layerId) return false
  return effectiveFlags(role, o.layerId as LayerId, o.docType as DocObjectType).evented
}

/** 角色切换 / 层 locked|visible 变更 / 导入后统一刷新 */
export function refreshAllFlags(role: Role): void {
  void role
  const canvas = getCanvas()
  for (const obj of canvas.getObjects() as AnyObj[]) {
    if (obj.layerId) applyFlags(obj)
  }
  canvas.requestRenderAll()
}
