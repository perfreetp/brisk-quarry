import { onScopeDispose, watch } from 'vue'
import { useDocumentStore } from '@/stores/document'
import { persistEnvelope } from '@/fabric/serialization'

/** 防抖自动保存到 localStorage（底图 blob 在 IndexedDB，不占配额） */
export function usePersistence(intervalMs = 1500) {
  const doc = useDocumentStore()
  let timer: ReturnType<typeof setTimeout> | null = null

  const stop = watch(
    () => [doc.dirty, doc.lamps.length, doc.annotations.length, doc.wears.length, doc.layers, doc.calibration],
    () => {
      if (!doc.dirty) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        persistEnvelope()
        timer = null
      }, intervalMs)
    },
    { deep: true },
  )

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
    stop()
  })

  return { flush: persistEnvelope }
}
