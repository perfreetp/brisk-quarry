<template>
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">隧</div>
      <div>
        <h1>隧洞轴线放样与岩层穿插校核</h1>
        <p>Vue 3 · Three.js · three-mesh-bvh · 桩号分段算量 · IFC4</p>
      </div>
    </div>

    <div class="top-actions">
      <button class="btn ghost" :disabled="!store.history.canUndo" @click="undo" title="Ctrl+Z">↶ 撤销</button>
      <button class="btn ghost" :disabled="!store.history.canRedo" @click="redo" title="Ctrl+Y">↷ 回退</button>
      <button class="btn ghost" @click="resetProject">示例工程</button>
      <button class="btn ghost" @click="store.showHelp = true">说明</button>
      <button class="btn secondary" @click="exportCsvAction">导出方量 CSV</button>
      <button class="btn primary" @click="exportIfcAction">按桩号导出 IFC</button>
    </div>
  </header>
</template>

<script setup>
import { store, undo, redo, resetProject } from '../store'
import { exportCsvAction, exportIfcAction } from '../actions/io'
</script>
