<script setup lang="ts">
import { useDocumentStore } from '@/stores/document'
import { useUiStore } from '@/stores/ui'
import { refreshAllFlags } from '@/fabric/roleService'
import { getCanvas } from '@/fabric/canvasHolder'
import { brushService } from '@/fabric/brushService'
import { isCalibrated } from '@/geometry/units'
import type { ZoneKind } from '@/types/doc'

const doc = useDocumentStore()
const ui = useUiStore()

const zoneKinds: { id: ZoneKind; label: string }[] = [
  { id: 'flipper', label: '挡板' },
  { id: 'spring', label: '弹簧' },
  { id: 'target', label: '靶组' },
  { id: 'orbit', label: '轨道' },
]

function toggleVisible(id: (typeof doc.layers)[number]['id']) {
  const meta = doc.layerById(id)!
  doc.setLayerVisible(id, !meta.visible)
  refreshAllFlags(ui.role)
}

function toggleLock(id: (typeof doc.layers)[number]['id']) {
  const meta = doc.layerById(id)!
  doc.setLayerLocked(id, !meta.locked)
  refreshAllFlags(ui.role)
  getCanvas().discardActiveObject()
}

function updateBrush() {
  if (isCalibrated(doc.calibration))
    brushService.updateBrush(doc.calibration, ui.brush.widthMm, ui.brush.color, ui.brush.dashed)
}
</script>

<template>
  <div>
    <div class="section">
      <h3>图层</h3>
      <div v-for="l in doc.layers" :key="l.id" class="layer-item" :class="{ locked: l.locked }">
        <button
          style="padding: 2px 8px"
          :title="l.visible ? '隐藏' : '显示'"
          @click="toggleVisible(l.id)"
        >
          {{ l.visible ? '👁' : '—' }}
        </button>
        <span style="flex: 1">{{ l.name }}</span>
        <button
          v-if="ui.role === 'designer'"
          style="padding: 2px 8px"
          :title="l.locked ? '解锁' : '锁定'"
          @click="toggleLock(l.id)"
        >
          {{ l.locked ? '🔒' : '🔓' }}
        </button>
        <span v-if="l.locked" class="pill bad">已锁</span>
      </div>
      <p class="hint">
        碰撞体层锁定写入工程文件，锁定后任何角色都需显式解锁；运营方默认看不到分区/碰撞体/标定层。
      </p>
    </div>

    <div v-if="ui.role === 'designer'" class="section">
      <h3>分区种类</h3>
      <div class="row">
        <button
          v-for="z in zoneKinds"
          :key="z.id"
          :class="{ active: ui.zoneKind === z.id }"
          @click="ui.setZoneKind(z.id)"
        >
          {{ z.label }}
        </button>
      </div>
      <p class="hint">选择种类后用「分区」工具在草图上拖矩形。</p>
    </div>

    <div v-if="ui.role === 'designer'" class="section">
      <h3>丝印笔刷（毫米）</h3>
      <label class="field">笔宽 {{ ui.brush.widthMm }} mm（非等比标定下为几何均值近似）</label>
      <input
        type="range"
        min="0.5"
        max="20"
        step="0.5"
        :value="ui.brush.widthMm"
        @input="ui.setBrush({ widthMm: Number(($event.target as HTMLInputElement).value) }); updateBrush()"
      />
      <label class="field" style="margin-top: 8px">颜色</label>
      <input type="color" :value="ui.brush.color" @input="ui.setBrush({ color: ($event.target as HTMLInputElement).value }); updateBrush()" />
      <label class="field" style="margin-top: 8px">
        <input type="checkbox" :checked="ui.brush.dashed" @change="ui.setBrush({ dashed: ($event.target as HTMLInputElement).checked }); updateBrush()" />
        虚线（区分辅助线）
      </label>
    </div>
  </div>
</template>
