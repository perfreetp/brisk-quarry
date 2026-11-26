<template>
  <div class="app-shell">
    <TopBar />
    <div class="workspace">
      <LeftPanel />
      <main class="center-stage" :class="{ 'table-collapsed': bottomCollapsed }">
        <Viewport3D />
        <BottomTable :collapsed="bottomCollapsed" @toggle="bottomCollapsed = !bottomCollapsed" />
      </main>
      <RightPanel />
    </div>

    <Transition name="toast">
      <div v-if="store.toast" :key="store.toast.id" class="toast" :class="store.toast.type">
        {{ store.toast.message }}
      </div>
    </Transition>

    <div v-if="store.showHelp" class="modal-mask" @click.self="store.showHelp = false">
      <div class="help-modal">
        <header>
          <h2>隧洞轴线三维放样与岩层校核 · 使用说明</h2>
          <button class="icon-btn" @click="store.showHelp = false">×</button>
        </header>
        <div class="help-content">
          <ol>
            <li><b>导入轴线：</b>在“数据导入”中选择纵剖面导出的 CSV/TXT，至少包含 <code>桩号,east,north,elev</code>；也可直接使用内置示例。</li>
            <li><b>导入地学数据：</b>DEM 支持 XYZ/CSV、Esri <code>.asc</code>；岩层界面支持“桩号,高程”地质纵剖面或 XYZ 三维面。</li>
            <li><b>编辑轴线：</b>在三维中拖动青色控制点。默认在高程平面内移动；选择“高程拖动”或按住 <kbd>Shift</kbd> 上下拖动。转弯半径、进出口坡度实时刷新。</li>
            <li><b>分段放样：</b>松手后按桩号间隔重新生成断面，马蹄形/圆形尺寸取自“断面模板”。洞身按桩号分成独立 Mesh，可点击拾取。</li>
            <li><b>岩层穿插：</b>three-mesh-bvh 为岩层和分段建立 BVH，拖动过程中以 LOD 实时执行 Geometry 求交；穿插段显示红色并列入右侧“岩层穿插”。</li>
            <li><b>高程衔接：</b>在“高程衔接/分段属性”中加陡坡度，相邻段边界自动顺接；错台超过容差时会标明对不齐的桩号和分段。</li>
            <li><b>加密与性能：</b>可按段 ×2、×4 加密断面。拖动时自动降为 20 边单跨 LOD，松手恢复全精度，因此加密后仍跟手。</li>
            <li><b>撤销回退：</b><kbd>Ctrl/⌘ + Z</kbd> 撤销，<kbd>Ctrl + Y</kbd> 或 <kbd>Ctrl + Shift + Z</kbd> 重做；洞身、红色穿插和方量表随快照一起回退。</li>
            <li><b>成果导出：</b>顶部“导出方量 CSV”用于算量；“按桩号导出 IFC”生成 IFC4 三角面分段构件，并写入桩号、面积、方量和穿插属性。</li>
          </ol>
          <div class="help-note">所有解析、建模、BVH 求交和导出均在浏览器本地完成，不会上传测量数据。</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import TopBar from './components/TopBar.vue'
import LeftPanel from './components/LeftPanel.vue'
import RightPanel from './components/RightPanel.vue'
import BottomTable from './components/BottomTable.vue'
import Viewport3D from './components/Viewport3D.vue'
import { store } from './store'

const bottomCollapsed = ref(false)
</script>
