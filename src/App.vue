<script setup>
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import SceneManager from './lib/SceneManager';
import { useStore, generate } from './lib/store';
import { OBJ_TYPES, TYPE_ORDER } from './lib/types';
import { exportBlueprint } from './lib/blueprint';
import ControlPanel from './components/ControlPanel.vue';
import AdjustedList from './components/AdjustedList.vue';

const { state, raw, selected, adjustedList, countsByType } = useStore();
const viewport = ref(null);
let sm = null;

onMounted(() => {
  sm = new SceneManager(viewport.value, {
    get raw() {
      return raw;
    },
    select: (id) => (raw.selectedId = id),
    setHover: (id) => (raw.hoverId = id),
    commitDrag: (uid, x, z) => useStore().commitDrag(uid, x, z),
    probeDrag: (uid, x, z) => useStore().probeDrag(uid, x, z),
    eff: (o) => useStore().eff(o),
  });
  sm.rebuildEnvironment(raw.params);
  sm.sync(raw.objects, raw.selectedId);
  sm.fitView(raw.params);
  generate(); // 首次打开即按默认参数铺一版

  // 端到端测试钩子：仅在带 ?e2e=1 时暴露状态与动作
  if (new URLSearchParams(location.search).has('e2e')) {
    window.__store = useStore();
    window.__scene = sm;
    window.__exportBlueprint = () => exportBlueprint(raw.params, raw.objects, { autoDownload: false }).dataUrl;
  }
});

onBeforeUnmount(() => sm?.dispose());

// 参数变化 -> 重建环境（物件本身不重排，等用户点生成）
watch(
  () => [raw.params.width, raw.params.depth, raw.params.corridorWidth, raw.params.corridorDir],
  () => {
    sm?.rebuildEnvironment(raw.params);
    sm?.sync(raw.objects, raw.selectedId);
  }
);

// 物件 / 选中变化 -> 同步场景
watch(
  () => raw.objects,
  () => sm?.sync(raw.objects, raw.selectedId),
  { deep: true }
);
watch(
  () => raw.selectedId,
  (id) => {
    sm?.sync(raw.objects, id);
    if (id) sm?.focusOn(id);
  }
);

function fitView() {
  sm?.fitView(raw.params);
}

function doExport() {
  if (!raw.objects.length) {
    useStore().notify('请先生成布置再导出布置图', 'error');
    return;
  }
  exportBlueprint(raw.params, raw.objects);
  useStore().notify('布置图已导出为 PNG', 'ok');
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>应急演练场地布点工具</h1>
      <div class="counts">
        <template v-for="t in TYPE_ORDER" :key="t">
          <span>{{ OBJ_TYPES[t].label }} <b>{{ countsByType[t] }}</b></span>
        </template>
      </div>
      <div class="spacer"></div>
      <button class="btn small" @click="fitView">复位视角</button>
      <button class="btn small gold" @click="doExport">导出布置图</button>
    </header>

    <ControlPanel />

    <main class="viewport" ref="viewport">
      <Transition name="fade">
        <div v-if="state.message" class="toast" :class="state.messageType">{{ state.message }}</div>
      </Transition>
    </main>

    <AdjustedList />

    <footer class="app-footer">
      <span>左键拖拽：移动物件（压通道自动弹回）</span>
      <span>左键空白处：旋转视角 ｜ 滚轮：缩放 ｜ 右键：平移</span>
      <span style="margin-left: auto">手动调整物件：<b>{{ adjustedList.length }}</b> 件</span>
    </footer>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
