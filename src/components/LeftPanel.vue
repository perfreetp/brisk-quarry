<template>
  <aside class="side-panel left-panel">
    <nav class="tab-bar">
      <button :class="{ active: store.activeTab === 'data' }" @click="store.activeTab = 'data'">数据导入</button>
      <button :class="{ active: store.activeTab === 'axis' }" @click="store.activeTab = 'axis'">轴线编辑</button>
      <button :class="{ active: store.activeTab === 'section' }" @click="store.activeTab = 'section'">断面模板</button>
      <button :class="{ active: store.activeTab === 'view' }" @click="store.activeTab = 'view'">显示</button>
    </nav>

    <div class="panel-scroll">
      <!-- 数据导入 -->
      <section v-if="store.activeTab === 'data'" class="tab-page">
        <div class="card">
          <h3>1. 纵剖面图轴线</h3>
          <p class="muted">导入含桩号、东坐标、北坐标、高程的 CSV/TXT/JSON。桩号支持 <code>K1+200</code>。</p>
          <label class="file-drop">
            <input type="file" accept=".csv,.txt,.json,.xyz" @change="onAxisFile" hidden />
            <span>选择轴线坐标和桩号文件</span>
          </label>
          <div class="file-meta">当前：{{ store.axisImportName || '内置示例纵剖轴线' }}</div>
          <button class="link-btn" @click="downloadAxisTemplate">下载轴线 CSV 模板</button>
        </div>

        <div class="card">
          <h3>2. 地形 DEM</h3>
          <p class="muted">支持规则 XYZ/CSV、Esri ASCII Grid（.asc）或 JSON 栅格；散点会自动 IDW 栅格化。</p>
          <label class="file-drop terrain">
            <input type="file" accept=".csv,.txt,.xyz,.asc,.json" @change="onTerrainFile" hidden />
            <span>导入地形 DEM</span>
          </label>
          <div class="file-meta">{{ store.terrainImportName || store.terrainDataset?.name || '示例DEM' }}</div>
        </div>

        <div class="card">
          <h3>3. 地质剖面岩层界面</h3>
          <p class="muted">优先识别“桩号,界面高程”的纵剖面曲线，并沿海道横向展布；也支持 XYZ 三维界面。</p>
          <label class="file-drop rock">
            <input type="file" accept=".csv,.txt,.xyz,.json" @change="onRockFile" hidden />
            <span>导入岩层分界面</span>
          </label>
          <div class="file-meta">{{ store.rockImportName || store.rockDataset?.name || '示例岩层界面' }}</div>
          <button class="link-btn" @click="downloadRockTemplate">下载地质剖面模板</button>
        </div>

        <div class="card compact">
          <h3>坐标基准</h3>
          <div class="kv"><span>东坐标原点</span><b>{{ store.geoOrigin.east?.toFixed?.(2) ?? 0 }}</b></div>
          <div class="kv"><span>北坐标原点</span><b>{{ store.geoOrigin.north?.toFixed?.(2) ?? 0 }}</b></div>
          <p class="hint">大坐标会在三维场景中自动平移到局部原点，IFC 仍使用该局部工程坐标。</p>
        </div>
      </section>

      <!-- 轴线编辑 -->
      <section v-else-if="store.activeTab === 'axis'" class="tab-page">
        <div class="card">
          <h3>拖动方式</h3>
          <div class="segmented">
            <button :class="{ active: store.dragMode === 'plan' }" @click="store.dragMode = 'plan'">平面拖动</button>
            <button :class="{ active: store.dragMode === 'elevation' }" @click="store.dragMode = 'elevation'">高程拖动</button>
          </div>
          <p class="hint">平面模式改变转弯半径；高程模式或按住 Shift 上下拖动改变坡度。</p>
        </div>

        <div class="card">
          <h3>放样参数</h3>
          <label class="field">
            <span>标准桩号间隔（m）</span>
            <input type="number" min="2" max="100" step="1" :value="store.interval" @change="updateInterval" />
          </label>
          <label class="field">
            <span>纵坡预警限值（%）</span>
            <input type="number" min="0.5" max="30" step="0.1" :value="store.maxGrade" @change="updateNumber('maxGrade', $event, 0.1)" />
          </label>
          <label class="field">
            <span>高程衔接容差（m）</span>
            <input type="number" min="0.005" max="1" step="0.005" :value="store.joinTolerance" @change="updateNumber('joinTolerance', $event, 0.01)" />
          </label>
          <label class="check-line">
            <input type="checkbox" v-model="store.autoJoin" />
            <span>调整坡度/高程时自动顺接相邻段</span>
          </label>
        </div>

        <div v-if="selectedPoint" class="card highlight-card">
          <h3>选中控制点</h3>
          <div class="control-title">
            <span class="dot cyan"></span>
            <b>{{ selectedPoint.name }}</b>
            <button class="mini-btn" @click="addPointAfter">+ 插入</button>
            <button class="mini-btn danger" :disabled="store.axisPoints.length <= 2" @click="deletePoint">删除</button>
          </div>
          <label class="field"><span>名称</span><input :value="selectedPoint.name" @change="editPoint('name', $event)" /></label>
          <label class="field"><span>桩号（m）</span><input type="number" step="1" :value="selectedPoint.station" @change="editPoint('station', $event, true)" /></label>
          <div class="field-grid">
            <label class="field"><span>东坐标</span><input type="number" step="0.1" :value="selectedPoint.east" @change="editPoint('east', $event, true)" /></label>
            <label class="field"><span>北坐标</span><input type="number" step="0.1" :value="selectedPoint.north" @change="editPoint('north', $event, true)" /></label>
          </div>
          <label class="field"><span>高程（m）</span><input type="number" step="0.01" :value="selectedPoint.elev" @change="editPoint('elev', $event, true)" /></label>

          <div v-if="selectedMetric" class="metric-grid">
            <div><span>转弯半径</span><b>{{ Number.isFinite(selectedMetric.radius) ? selectedMetric.radius.toFixed(1) + ' m' : '直线 ∞' }}</b></div>
            <div><span>入口坡</span><b :class="gradeClass(selectedMetric.gradeIn)">{{ selectedMetric.gradeIn.toFixed(2) }}%</b></div>
            <div><span>出口坡</span><b :class="gradeClass(selectedMetric.gradeOut)">{{ selectedMetric.gradeOut.toFixed(2) }}%</b></div>
          </div>
        </div>

        <div class="card">
          <h3>控制点列表</h3>
          <div class="point-list">
            <button
              v-for="(p, i) in store.axisPoints"
              :key="p.id"
              class="point-row"
              :class="{ active: p.id === store.selectedPointId }"
              @click="store.selectedPointId = p.id"
            >
              <span>{{ i + 1 }}. {{ p.name }}</span>
              <em>K{{ Math.floor(p.station / 1000) }}+{{ String(Math.round(p.station % 1000)).padStart(3, '0') }}</em>
              <b>{{ p.elev.toFixed(2) }}m</b>
            </button>
          </div>
        </div>
      </section>

      <!-- 断面模板 -->
      <section v-else-if="store.activeTab === 'section'" class="tab-page">
        <div class="card">
          <h3>断面型式</h3>
          <div class="type-switch">
            <button :class="{ active: selectedTemplate?.type === 'horseshoe' }" @click="toggleTemplateType('horseshoe')">
              <span class="section-icon horseshoe"></span>马蹄形
            </button>
            <button :class="{ active: selectedTemplate?.type === 'circle' }" @click="toggleTemplateType('circle')">
              <span class="section-icon circle"></span>圆形
            </button>
          </div>
        </div>

        <div class="card">
          <h3>尺寸模板</h3>
          <label class="field">
            <span>选用模板</span>
            <select :value="store.templateId" @change="changeTemplate">
              <option v-for="t in store.templates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>

          <template v-if="selectedTemplate?.type === 'horseshoe'">
            <label class="field"><span>开挖/净宽（m）</span><input type="number" min="2" max="20" step="0.1" :value="selectedTemplate.width" @change="editTemplate('width', $event)" /></label>
            <label class="field"><span>总高（m）</span><input type="number" min="2" max="20" step="0.1" :value="selectedTemplate.height" @change="editTemplate('height', $event)" /></label>
            <label class="field"><span>边墙高度（m）</span><input type="number" min="0.5" max="12" step="0.05" :value="selectedTemplate.wallHeight" @change="editTemplate('wallHeight', $event)" /></label>
            <label class="field"><span>仰拱深度（m）</span><input type="number" min="0" max="4" step="0.05" :value="selectedTemplate.invertDepth" @change="editTemplate('invertDepth', $event)" /></label>
          </template>
          <template v-else>
            <label class="field"><span>直径（m）</span><input type="number" min="2" max="20" step="0.1" :value="selectedTemplate.diameter" @change="editTemplate('diameter', $event)" /></label>
          </template>
          <label class="field"><span>超挖/支护余量（m）</span><input type="number" min="0" max="1" step="0.01" :value="selectedTemplate.overbreak ?? 0.15" @change="editTemplate('overbreak', $event)" /></label>
          <label class="field"><span>周边离散数</span><input type="number" min="16" max="128" step="4" :value="selectedTemplate.radialSegments" @change="editTemplate('radialSegments', $event, true)" /></label>

          <div v-if="templateMetrics" class="metric-grid">
            <div><span>净面积</span><b>{{ templateMetrics.netArea.toFixed(2) }} m²</b></div>
            <div><span>开挖面积</span><b class="accent">{{ templateMetrics.excavationArea.toFixed(2) }} m²</b></div>
            <div><span>周长</span><b>{{ templateMetrics.perimeter.toFixed(2) }} m</b></div>
          </div>
          <p class="hint">切换型式后自动选择对应模板；所有分段尺寸均从当前模板读取。</p>
        </div>
      </section>

      <!-- 显示 -->
      <section v-else class="tab-page">
        <div class="card">
          <h3>图层显示</h3>
          <label v-for="key in layerKeys" :key="key" class="check-line big">
            <input type="checkbox" v-model="store.visibility[key]" />
            <span>{{ layerNames[key] }}</span>
          </label>
        </div>
        <div class="card">
          <h3>性能策略</h3>
          <p class="muted">拖动控制点时自动使用 20 边、单跨粗放样 LOD；松手后按模板周边精度和分段加密倍数重建 BVH 与实体。</p>
          <div class="kv"><span>当前三角面</span><b>{{ store.renderStats.triangles.toLocaleString() }}</b></div>
          <div class="kv"><span>BVH求交耗时</span><b>{{ store.renderStats.bvhMs.toFixed(2) }} ms</b></div>
          <div class="kv"><span>重建耗时</span><b>{{ store.renderStats.rebuildMs.toFixed(1) }} ms</b></div>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import {
  store, selectedPoint, selectedTemplate, recordHistory,
  toggleTemplateType, showToast
} from '../store'
import { sectionMetrics } from '../lib/sections'
import { importAxisFile, importTerrainFile, importRockFile, downloadAxisTemplate, downloadRockTemplate } from '../actions/io'
import { uid } from '../lib/format'

const selectedMetric = computed(() =>
  store.controlMetrics.find(m => m.id === store.selectedPointId) || null
)
const templateMetrics = computed(() => selectedTemplate.value ? sectionMetrics(selectedTemplate.value) : null)
const layerKeys = ['terrain', 'rock', 'axis', 'ticks', 'tunnel', 'labels']
const layerNames = {
  terrain: '地形 DEM',
  rock: '岩层分界面',
  axis: '轴线折线/控制点',
  ticks: '桩号刻度',
  tunnel: '放样洞身实体',
  labels: '文字标注'
}

function onAxisFile(e) { const f = e.target.files?.[0]; if (f) importAxisFile(f); e.target.value = '' }
function onTerrainFile(e) { const f = e.target.files?.[0]; if (f) importTerrainFile(f); e.target.value = '' }
function onRockFile(e) { const f = e.target.files?.[0]; if (f) importRockFile(f); e.target.value = '' }

function updateInterval(e) {
  const value = Math.max(2, Math.min(100, Number(e.target.value) || 10))
  recordHistory('修改桩号间隔', () => { store.interval = value })
}
function updateNumber(key, e, fallback = 0) {
  const value = Number(e.target.value)
  if (!Number.isFinite(value)) return
  recordHistory('修改校核参数', () => { store[key] = value })
}
function editPoint(field, event, numeric = false) {
  const p = store.axisPoints.find(x => x.id === store.selectedPointId)
  if (!p) return
  let value = event.target.value
  if (numeric) value = Number(value)
  if (numeric && !Number.isFinite(value)) return
  recordHistory('编辑控制点', () => { p[field] = value })
}
function addPointAfter() {
  recordHistory('插入控制点', () => {
    const idx = store.axisPoints.findIndex(p => p.id === store.selectedPointId)
    const base = store.axisPoints[idx] || store.axisPoints[store.axisPoints.length - 1]
    const next = store.axisPoints[idx + 1]
    const p = {
      id: uid('cp'),
      name: `CP${store.axisPoints.length + 1}`,
      station: Math.round((base.station + (next ? (next.station - base.station) * 0.5 : 20)) * 10) / 10,
      east: next ? (base.east + next.east) / 2 : base.east + 20,
      north: next ? (base.north + next.north) / 2 : base.north + 8,
      elev: next ? (base.elev + next.elev) / 2 : base.elev + 0.5
    }
    store.axisPoints.splice(idx + 1, 0, p)
    store.selectedPointId = p.id
  })
  showToast('已插入控制点，可在三维视图中拖动')
}
function deletePoint() {
  if (store.axisPoints.length <= 2) return
  recordHistory('删除控制点', () => {
    const idx = store.axisPoints.findIndex(p => p.id === store.selectedPointId)
    store.axisPoints.splice(idx, 1)
    store.selectedPointId = store.axisPoints[Math.max(0, idx - 1)].id
  })
}
function changeTemplate(e) {
  recordHistory('切换断面模板', () => { store.templateId = e.target.value })
}
function editTemplate(field, event, integer = false) {
  const tpl = selectedTemplate.value
  if (!tpl) return
  let value = Number(event.target.value)
  if (!Number.isFinite(value)) return
  if (integer) value = Math.round(value)
  recordHistory('修改模板尺寸', () => { tpl[field] = value })
}
function gradeClass(g) {
  return Math.abs(g) > store.maxGrade ? 'danger-text' : Math.abs(g) > store.maxGrade * 0.75 ? 'warning-text' : 'ok-text'
}
</script>
