<script setup>
import { computed } from 'vue';
import { useStore, generate, reproduce, notify } from '../lib/store';
import { OBJ_TYPES, TYPE_ORDER, TIER_LABELS } from '../lib/types';

const { state } = useStore();
const p = computed(() => state.params);

const tierOptions = TIER_LABELS.map((label, value) => ({ value, label }));

function countOf(type) {
  return OBJ_TYPES[type].tierCounts[p.value.tiers[type]] ?? 0;
}

function clampParams() {
  const q = state.params;
  q.width = Math.min(200, Math.max(20, Number(q.width) || 60));
  q.depth = Math.min(200, Math.max(20, Number(q.depth) || 40));
  q.corridorWidth = Math.min(
    Math.min(q.width, q.depth) - 4,
    Math.max(2, Number(q.corridorWidth) || 4)
  );
}

function onGenerate() {
  clampParams();
  if (!String(state.params.seed).trim()) {
    notify('请先填写种子', 'error');
    return;
  }
  generate();
}

function onReproduce() {
  clampParams();
  if (!String(state.params.seed).trim()) {
    notify('请先填写种子', 'error');
    return;
  }
  reproduce();
}

const hasSnapshot = computed(() => !!state.snapshots[state.params.seed]);
</script>

<template>
  <div class="side-panel left">
    <div class="section">
      <h3>场地参数</h3>
      <div class="field-row">
        <div class="field">
          <label>场地长度（米）</label>
          <input v-model.number="p.width" type="number" min="20" max="200" step="1" />
        </div>
        <div class="field">
          <label>场地宽度（米）</label>
          <input v-model.number="p.depth" type="number" min="20" max="200" step="1" />
        </div>
      </div>
      <div class="field">
        <label>主通道走向</label>
        <div class="seg">
          <label>
            <input type="radio" value="x" v-model="p.corridorDir" />
            <span>沿长度（东西）</span>
          </label>
          <label>
            <input type="radio" value="z" v-model="p.corridorDir" />
            <span>沿宽度（南北）</span>
          </label>
        </div>
      </div>
      <div class="field">
        <label>主通道宽度（米）</label>
        <input v-model.number="p.corridorWidth" type="number" min="2" step="0.5" />
      </div>
    </div>

    <div class="section">
      <h3>物件数量档位（共五档）</h3>
      <div v-for="t in TYPE_ORDER" :key="t" class="tier-row">
        <span class="dot" :style="{ background: OBJ_TYPES[t].cssColor }"></span>
        <span class="tname">{{ OBJ_TYPES[t].label }}</span>
        <select v-model.number="p.tiers[t]">
          <option v-for="opt in tierOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}（{{ OBJ_TYPES[t].tierCounts[opt.value] }} 个）
          </option>
        </select>
        <span class="tcount">{{ countOf(t) }} 件</span>
      </div>
    </div>

    <div class="section">
      <h3>种子与生成</h3>
      <div class="field">
        <label>布局种子（同一种子可复现同一次布局）</label>
        <div class="seed-box">
          <input v-model="p.seed" type="text" placeholder="例如 2026" />
        </div>
      </div>
      <div class="action-stack" style="margin-top: 10px">
        <button class="btn primary" @click="onGenerate">生成布置</button>
        <button
          class="btn gold"
          @click="onReproduce"
          :disabled="!hasSnapshot"
          :style="{ opacity: hasSnapshot ? 1 : 0.45 }"
        >
          复现该种子布局
        </button>
      </div>
      <div class="hint">
        已手动拖过 / 旋转 / 改尺寸的物件，重新生成时会留在原处并作为障碍；
        点「复现」则回到该种子当时的完整自动布局，清掉全部手动调整。
      </div>
    </div>
  </div>
</template>
