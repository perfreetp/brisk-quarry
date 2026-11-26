<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Point as FPoint } from 'fabric'
import type { Point } from '@/types/doc'
import { useDocumentStore } from '@/stores/document'
import { getCanvas } from '@/fabric/canvasHolder'
import { overlayService } from '@/fabric/overlayService'
import { isCalibrated, pxPerMm } from '@/geometry/units'
import { applyTableClip } from '@/fabric/clipService'
import { recomputeAllAlignments } from '@/fabric/alignment'
import { lampService } from '@/fabric/lampService'
import { wearService } from '@/fabric/wearService'
import { annotationService } from '@/fabric/annotationService'

const emit = defineEmits<{ (e: 'close'): void }>()
const doc = useDocumentStore()

const widthMm = ref(doc.calibration.tableWidthMm || 500)
const heightMm = ref(doc.calibration.tableHeightMm || 800)
const p1 = ref<Point | null>(doc.calibration.p1)
const p2 = ref<Point | null>(doc.calibration.p2)
const picking = ref<0 | 1 | 2>(0)
let disposer: (() => void) | null = null

const canConfirm = () => widthMm.value > 0 && heightMm.value > 0 && p1.value && p2.value

watch([p1, p2], () => {
  const pts: Point[] = []
  if (p1.value) pts.push(p1.value)
  if (p2.value) pts.push(p2.value)
  overlayService.setCalibrationHandles(pts.map((p) => new FPoint(p.x, p.y)))
  getCanvas().requestRenderAll()
})

onMounted(() => {
  const canvas = getCanvas()
  disposer = canvas.on('mouse:down', (opt) => {
    if (picking.value === 0) return
    const p = { x: opt.scenePoint.x, y: opt.scenePoint.y }
    if (picking.value === 1) p1.value = p
    else p2.value = p
    picking.value = picking.value === 1 ? 2 : 0
  })
})

onBeforeUnmount(() => {
  disposer?.()
  overlayService.setCalibrationHandles([])
  getCanvas().requestRenderAll()
})

function pick(point: 1 | 2) {
  picking.value = point
}

function confirm() {
  if (!canConfirm()) return
  doc.setCalibration({
    tableWidthMm: widthMm.value,
    tableHeightMm: heightMm.value,
    p1: p1.value,
    p2: p2.value,
    done: true,
  })
  const canvas = getCanvas()
  applyTableClip(canvas, doc.calibration)
  wearService.rebuildAll()
  lampService.rebuildFromDocs()
  annotationService.syncAll()
  recomputeAllAlignments(doc.calibration)
  emit('close')
}

function scaleInfo() {
  if (!isCalibrated({ ...doc.calibration, p1: p1.value, p2: p2.value, tableWidthMm: widthMm.value, tableHeightMm: heightMm.value, done: true }))
    return null
  try {
    return pxPerMm({ ...doc.calibration, p1: p1.value!, p2: p2.value!, tableWidthMm: widthMm.value, tableHeightMm: heightMm.value, done: true })
  } catch {
    return null
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal">
      <h2>台面尺寸标定（像素 ↔ 毫米）</h2>
      <p class="hint">
        输入台面实际宽高，并在画布上依次点取台面的两个对角点（轴对齐，无旋转/透视；草图若倾斜请先转正）。
        标定后笔刷毫米宽度、灯珠真实直径、2mm 偏差判定全部基于该比例。
      </p>
      <div class="row">
        <div style="flex: 1">
          <label class="field">台面宽 (mm)</label>
          <input type="number" v-model.number="widthMm" min="1" />
        </div>
        <div style="flex: 1">
          <label class="field">台面高 (mm)</label>
          <input type="number" v-model.number="heightMm" min="1" />
        </div>
      </div>
      <div class="row">
        <button :class="{ active: picking === 1 }" @click="pick(1)">点取角点 1（左上）</button>
        <span class="pill" :class="p1 ? 'ok' : 'gray'">{{ p1 ? `(${Math.round(p1.x)}, ${Math.round(p1.y)})` : '未取' }}</span>
      </div>
      <div class="row">
        <button :class="{ active: picking === 2 }" @click="pick(2)">点取角点 2（右下）</button>
        <span class="pill" :class="p2 ? 'ok' : 'gray'">{{ p2 ? `(${Math.round(p2.x)}, ${Math.round(p2.y)})` : '未取' }}</span>
      </div>
      <div v-if="scaleInfo()" class="hint">
        换算比例：sx = {{ scaleInfo()!.sx.toFixed(3) }} px/mm，sy = {{ scaleInfo()!.sy.toFixed(3) }} px/mm
        <span v-if="Math.abs(scaleInfo()!.sx - scaleInfo()!.sy) > 0.01">（非等比，笔宽将取几何均值近似）</span>
      </div>
      <p v-if="picking !== 0" class="hint" style="color: var(--primary)">→ 请在画布上点击对应角点</p>
      <div class="row" style="justify-content: flex-end; margin-top: 12px">
        <button @click="emit('close')">取消</button>
        <button class="active" :disabled="!canConfirm()" @click="confirm">确认标定</button>
      </div>
    </div>
  </div>
</template>
