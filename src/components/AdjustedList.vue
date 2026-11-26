<script setup>
import { useStore, select, resetAuto, eff } from '../lib/store';
import { OBJ_TYPES } from '../lib/types';
import Inspector from './Inspector.vue';

const { state, adjustedList } = useStore();

function desc(o) {
  const e = eff(o);
  const parts = [];
  if (o.manual.x !== o.auto?.x || o.manual.z !== o.auto?.z) parts.push('位置已移动');
  if (o.manual.rot !== o.auto?.rot) parts.push(`旋转 ${Math.round((o.manual.rot * 180) / Math.PI)}°`);
  if (o.manual.size) parts.push(`尺寸 ${e.w}×${e.d}m`);
  return parts.join(' ｜ ') || '已调整';
}

function pick(uid) {
  select(uid);
}
</script>

<template>
  <div class="side-panel right">
    <Inspector />

    <div class="section">
      <h3>手动调整清单（{{ adjustedList.length }}）</h3>
      <div v-if="!adjustedList.length" class="empty-tip">
        还没有手动调整过的物件。<br />
        拖拽物件可改位置，压到通道会自动弹回最近空位。
      </div>
      <div
        v-for="o in adjustedList"
        :key="o.uid"
        class="adjusted-item"
        :class="{ active: state.selectedId === o.uid }"
        @click="pick(o.uid)"
      >
        <div class="ai-head">
          <span class="dot" :style="{ background: OBJ_TYPES[o.type].cssColor, width: 10, height: 10, borderRadius: 3, display: 'inline-block' }"></span>
          {{ o.name }}
          <span class="tag">◆改</span>
        </div>
        <div class="ai-desc">{{ desc(o) }}</div>
        <div class="ai-actions">
          <button class="btn small" @click.stop="resetAuto(o.uid)">恢复自动位置</button>
        </div>
      </div>
    </div>
  </div>
</template>
