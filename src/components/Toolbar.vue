<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore, type ToolId } from '@/stores/ui'
import { useDocumentStore } from '@/stores/document'
import { redo, undo } from '@/fabric/historyService'
import { roleAllowsTool } from '@/fabric/roleService'
import { exportLampCsv, exportSilkscreenSvg } from '@/fabric/exportSvgCsv'
import { exportProject } from '@/fabric/serialization'
import { isCalibrated } from '@/geometry/units'

const ui = useUiStore()
const doc = useDocumentStore()
const emit = defineEmits<{ (e: 'calibrate'): void; (e: 'import-image'): void; (e: 'import-project', file: File): void }>()

const designerTools: { id: ToolId; label: string; title: string }[] = [
  { id: 'select', label: '选择', title: '选择/变换（V）' },
  { id: 'brush', label: '丝印笔刷', title: '按毫米笔宽画品牌图案' },
  { id: 'arrow', label: 'shot 线', title: '带箭头的 shot 指示线' },
  { id: 'zone-rect', label: '分区', title: '挡板/弹簧/靶组/轨道分区' },
  { id: 'collider-rect', label: '碰撞矩形', title: '碰撞体轮廓（矩形）' },
  { id: 'collider-polygon', label: '碰撞多边形', title: '逐点绘制，双击闭合' },
]

const operatorTools: { id: ToolId; label: string }[] = [
  { id: 'select', label: '选择灯位' },
  { id: 'annotation', label: '灯位批注' },
  { id: 'wear', label: '磨损圈' },
]

const needsCalibration = new Set<ToolId>(['brush', 'arrow', 'collider-rect', 'collider-polygon'])

function pickTool(id: ToolId) {
  if (!roleAllowsTool(ui.role, id)) return
  ui.setTool(id)
}

function onProjectFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('import-project', file)
  input.value = ''
}

const fileInput = ref<HTMLInputElement | null>(null)
</script>

<template>
  <div class="toolbar">
    <div class="role-switch">
      <button :class="{ active: ui.role === 'designer' }" @click="ui.setRole('designer')">主设</button>
      <button :class="{ active: ui.role === 'operator' }" @click="ui.setRole('operator')">运营方</button>
    </div>

    <div class="tool-group">
      <template v-if="ui.role === 'designer'">
        <button
          v-for="t in designerTools"
          :key="t.id"
          :class="{ active: ui.activeTool === t.id }"
          :disabled="needsCalibration.has(t.id) && !isCalibrated(doc.calibration)"
          :title="t.title + (needsCalibration.has(t.id) && !isCalibrated(doc.calibration) ? '（需先标定）' : '')"
          @click="pickTool(t.id)"
        >
          {{ t.label }}
        </button>
      </template>
      <template v-else>
        <button
          v-for="t in operatorTools"
          :key="t.id"
          :class="{ active: ui.activeTool === t.id }"
          @click="pickTool(t.id)"
        >
          {{ t.label }}
        </button>
      </template>
    </div>

    <div class="tool-group">
      <button :disabled="ui.undoDepth === 0" title="撤销一笔/一步 (Ctrl+Z)" @click="undo()">↶ 撤销</button>
      <button :disabled="ui.redoDepth === 0" title="重做 (Ctrl+Shift+Z)" @click="redo()">↷ 重做</button>
    </div>

    <div class="tool-group">
      <button @click="emit('import-image')" :disabled="ui.role === 'operator'">导入草图</button>
      <button @click="emit('calibrate')">标定</button>
    </div>

    <div class="tool-group">
      <button :disabled="!isCalibrated(doc.calibration)" @click="exportSilkscreenSvg()">丝印 SVG</button>
      <button :disabled="doc.lamps.length === 0" @click="exportLampCsv()">灯位 CSV</button>
      <button @click="exportProject()">工程 JSON</button>
      <input ref="fileInput" type="file" accept="application/json" style="display: none" @change="onProjectFile" />
      <button @click="fileInput?.click()">打开工程</button>
    </div>

    <span class="pill gray">缩放 {{ Math.round(ui.zoom * 100) }}%</span>
  </div>
</template>
