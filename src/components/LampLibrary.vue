<script setup lang="ts">
import { ref } from 'vue'
import { useDocumentStore } from '@/stores/document'
import type { LampSpec } from '@/types/doc'
import { isCalibrated } from '@/geometry/units'

const doc = useDocumentStore()
const showForm = ref(false)
const name = ref('')
const diameter = ref(5)
const color = ref('#ef4444')

function onDragStart(e: DragEvent, spec: LampSpec) {
  e.dataTransfer?.setData('application/x-lamp-spec', spec.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}

function addSpec() {
  if (!name.value.trim()) return
  doc.addLampSpec({ name: name.value.trim(), diameterMm: diameter.value, color: color.value })
  name.value = ''
  showForm.value = false
}

function inUse(id: string): boolean {
  return doc.lamps.some((l) => l.specId === id)
}
</script>

<template>
  <div class="section">
    <h3>灯位库（拖入画布）</h3>
    <p v-if="!isCalibrated(doc.calibration)" class="hint" style="color: var(--warn)">
      完成标定后才能拖入灯珠（按真实直径 mm 摆放）
    </p>
    <div
      v-for="spec in doc.lampSpecs"
      :key="spec.id"
      class="lamp-card"
      :class="{ 'muted': !isCalibrated(doc.calibration) }"
      draggable="true"
      @dragstart="onDragStart($event, spec)"
    >
      <span class="lamp-dot" :style="{ background: spec.color }" />
      <div style="flex: 1">
        <div>{{ spec.name }}</div>
        <div class="hint">Ø {{ spec.diameterMm }} mm</div>
      </div>
      <button
        class="danger"
        style="padding: 2px 7px"
        :title="inUse(spec.id) ? '已有灯珠使用该预设，不可删除' : '删除预设'"
        :disabled="inUse(spec.id)"
        @click="doc.removeLampSpec(spec.id)"
      >
        ✕
      </button>
    </div>

    <button v-if="!showForm" @click="showForm = true">+ 新增灯珠预设</button>
    <div v-else class="section" style="border: 1px solid var(--border); border-radius: 8px; padding: 10px">
      <label class="field">名称</label>
      <input type="text" v-model="name" placeholder="如：LED 草帽灯 5mm" />
      <label class="field" style="margin-top: 8px">直径 (mm)</label>
      <input type="number" v-model.number="diameter" min="0.5" step="0.5" />
      <label class="field" style="margin-top: 8px">颜色</label>
      <input type="color" v-model="color" />
      <div class="row" style="margin-top: 10px">
        <button class="active" @click="addSpec">保存</button>
        <button @click="showForm = false">取消</button>
      </div>
    </div>
  </div>
</template>
