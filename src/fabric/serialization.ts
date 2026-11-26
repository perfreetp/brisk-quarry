import type { Envelope } from '@/types/doc'
import { STORAGE_KEYS } from './constants'
import { getCanvas } from './canvasHolder'
import { layerService } from './layerService'
import { applyTableClip } from './clipService'
import { buildEnvelope, assertNoTempObjects } from './exportSvgCsv'
import { clearHistory, markCheckpoint } from './historyService'
import { lampService } from './lampService'
import { annotationService } from './annotationService'
import { wearService } from './wearService'
import { useDocumentStore } from '@/stores/document'
import { blobToDataUrl, dataUrlToBlob, getImage, putImage } from '@/utils/imageDb'
import { downloadText } from '@/utils/download'

/** 导出工程 JSON：底图从 IndexedDB 取出内嵌为 dataURL，单文件可流转 */
export async function exportProject(): Promise<void> {
  const doc = useDocumentStore()
  const envelope = buildEnvelope(getCanvas().toObject() as unknown as Record<string, unknown>)
  if (doc.baseImageId) {
    const blob = await getImage(doc.baseImageId)
    if (blob) envelope.baseImageDataUrl = await blobToDataUrl(blob)
  }
  const problems = assertNoTempObjects(envelope)
  if (problems.length) console.warn('[serialization]', problems.join('; '))
  downloadText(JSON.stringify(envelope, null, 2), `playfield_${Date.now()}.json`, 'application/json;charset=utf-8')
}

/** 导入工程：清画布 → loadFromJSON → 重建注册表/视图/权限/蒙版/历史 */
export async function importProject(envelope: Envelope): Promise<void> {
  const doc = useDocumentStore()
  const canvas = getCanvas()

  // 内嵌图片先落 IndexedDB
  if (envelope.baseImageDataUrl) {
    const id = envelope.baseImageId ?? `img_${Date.now()}`
    await putImage(id, dataUrlToBlob(envelope.baseImageDataUrl))
    envelope.baseImageId = id
    delete envelope.baseImageDataUrl
  }

  canvas.remove(...canvas.getObjects())
  layerService.clearRegistry()
  await canvas.loadFromJSON(envelope.fabric)
  layerService.rebuildFromCanvas()

  doc.loadEnvelopeData(envelope)
  lampService.rebuildFromDocs()
  wearService.rebuildAll()
  annotationService.syncAll()
  applyTableClip(canvas, doc.calibration)
  clearHistory(true)
  markCheckpoint()
  canvas.requestRenderAll()
}

/** localStorage 自动保存（不含底图 blob；fabric JSON 可能较大，做配额保护） */
export function persistEnvelope(): void {
  const doc = useDocumentStore()
  try {
    const envelope = buildEnvelope(getCanvas().toObject() as unknown as Record<string, unknown>)
    localStorage.setItem(STORAGE_KEYS.envelope, JSON.stringify(envelope))
    doc.markDirty(false)
  } catch (err) {
    console.error('自动保存失败（可能超出 localStorage 配额），请用工程 JSON 导出备份', err)
  }
}

export function loadPersistedEnvelope(): Envelope | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.envelope)
    return raw ? (JSON.parse(raw) as Envelope) : null
  } catch {
    return null
  }
}

export function clearPersistedEnvelope(): void {
  localStorage.removeItem(STORAGE_KEYS.envelope)
}
