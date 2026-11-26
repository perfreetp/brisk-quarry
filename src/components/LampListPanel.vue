<script setup lang="ts">
import { useDocumentStore } from '@/stores/document'
import { getCanvas } from '@/fabric/canvasHolder'
import { layerService } from '@/fabric/layerService'

const doc = useDocumentStore()

const stateMeta = {
  aligned: { text: '已对齐', cls: 'ok' },
  misaligned: { text: '偏差超 2mm', cls: 'bad' },
  unbound: { text: '未绑定', cls: 'gray' },
} as const

function focusLamp(id: string) {
  const obj = layerService.get(id)
  if (!obj) return
  const canvas = getCanvas()
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
}
</script>

<template>
  <div class="section">
    <h3>灯位坐标与对齐（{{ doc.lamps.length }}）</h3>
    <div v-if="doc.lamps.length === 0" class="hint">从灯位库拖入灯珠，按真实直径摆放并与碰撞体轮廓对齐。</div>
    <div
      v-for="l in doc.lamps"
      :key="l.id"
      class="annotation-item"
      style="cursor: pointer"
      @click="focusLamp(l.id)"
    >
      <div class="row" style="justify-content: space-between">
        <strong>#{{ l.code }} · Ø{{ l.diameterMm }}mm</strong>
        <span class="pill" :class="stateMeta[l.alignState].cls">{{ stateMeta[l.alignState].text }}</span>
      </div>
      <div class="hint">
        X {{ l.centerMm.x.toFixed(2) }} / Y {{ l.centerMm.y.toFixed(2) }} mm
        <template v-if="l.deviationMm !== null"> · 偏差 {{ l.deviationMm >= 0 ? '+' : '' }}{{ l.deviationMm.toFixed(2) }} mm</template>
      </div>
    </div>
  </div>
</template>
