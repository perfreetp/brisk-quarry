<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCanvas } from '@/fabric/useCanvas'
import { useUiStore } from '@/stores/ui'
import { useDocumentStore } from '@/stores/document'
import { roleAllowsTool } from '@/fabric/roleService'
import { importProject, loadPersistedEnvelope } from '@/fabric/serialization'

const props = defineProps<{ calibrationMode: boolean }>()

const ui = useUiStore()
const doc = useDocumentStore()
const { canvasEl, initCanvas, setTool, refreshPermissions, dispose } = useCanvas()
const wrapEl = ref<HTMLDivElement | null>(null)
const banner = ref('')

onMounted(async () => {
  const el = canvasEl.value
  if (!el || !wrapEl.value) return
  const canvas = await initCanvas(el)
  canvas.setDimensions({ width: wrapEl.value.clientWidth, height: wrapEl.value.clientHeight })

  // 恢复上次工程（无痕/首次访问时无存档）
  const env = loadPersistedEnvelope()
  if (env) {
    try {
      await importProject(env)
      banner.value = '已恢复上次自动保存的工程'
      setTimeout(() => (banner.value = ''), 3000)
    } catch (err) {
      console.error('工程恢复失败', err)
    }
  }
  refreshPermissions()
})

onBeforeUnmount(() => void dispose())

watch(
  () => ui.activeTool,
  (tool) => {
    if (!roleAllowsTool(ui.role, tool)) return
    setTool(tool)
  },
)

watch(
  () => ui.role,
  () => refreshPermissions(),
)

watch(
  () => props.calibrationMode,
  (on) => {
    banner.value = on ? '标定模式：依次点击台面两个对角（左上→右下）' : ''
    if (!on) setTimeout(() => (banner.value = ''), 1500)
  },
)
</script>

<template>
  <div ref="wrapEl" class="stage">
    <canvas ref="canvasEl" />
    <div v-if="banner" class="banner">{{ banner }}</div>
    <div v-if="!doc.calibration.done" class="banner" style="top: 56px; background: rgba(217, 119, 6, 0.95)">
      未完成台面标定：请先在左侧输入台面尺寸并标定两点，笔刷/灯珠/碰撞测量工具将在标定后启用
    </div>
  </div>
</template>
