<script setup>
import { computed } from 'vue';
import { useStore, select, setRotation, setSize, resetAuto, eff } from '../lib/store';
import { OBJ_TYPES } from '../lib/types';

const { state } = useStore();
const obj = computed(() => state.objects.find((o) => o.uid === state.selectedId) ?? null);

const rotDeg = computed({
  get() {
    if (!obj.value) return 0;
    return Math.round((eff(obj.value).rot * 180) / Math.PI);
  },
  set(v) {
    setRotation(obj.value.uid, Number(v));
  },
});

const wVal = computed({
  get: () => (obj.value ? eff(obj.value).w : 0),
  set: (v) => setSize(obj.value.uid, Number(v), dVal.value),
});
const dVal = computed({
  get: () => (obj.value ? eff(obj.value).d : 0),
  set: (v) => setSize(obj.value.uid, wVal.value, Number(v)),
});

function snap90() {
  if (!obj.value) return;
  const cur = rotDeg.value;
  const next = (Math.round(cur / 90) * 90 + 90) % 360;
  setRotation(obj.value.uid, next);
}
</script>

<template>
  <div v-if="obj && !obj.unplaced" class="inspector">
    <div class="ins-title">
      {{ obj.name }}
      <span class="tag" v-if="obj.manual">已手动调整</span>
    </div>
    <div class="ins-sub">
      {{ OBJ_TYPES[obj.type].label }} ｜ 默认占地 {{ OBJ_TYPES[obj.type].w }}×{{ OBJ_TYPES[obj.type].d }}m
    </div>

    <label>
      <span>旋转角度</span>
      <span>{{ rotDeg }}°</span>
    </label>
    <input type="range" min="0" max="359" step="1" v-model.number="rotDeg" />
    <button class="btn small" @click="snap90">旋转 90°</button>

    <label style="margin-top: 10px"><span>长度 X（米）</span></label>
    <input type="number" min="0.5" step="0.1" v-model.number="wVal" />
    <label><span>宽度 Z（米）</span></label>
    <input type="number" min="0.5" step="0.1" v-model.number="dVal" />

    <button class="btn small" @click="resetAuto(obj.uid)">恢复自动位置</button>
  </div>
  <div v-else class="empty-tip">
    在三维场地上点击任一物件，<br />可单独旋转、改尺寸或恢复自动位置
  </div>
</template>
