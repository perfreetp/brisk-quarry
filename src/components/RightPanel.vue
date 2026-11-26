<template>
  <aside class="side-panel right-panel">
    <nav class="tab-bar right-tabs">
      <button :class="{ active: tab === 'clash' }" @click="tab = 'clash'">
        岩层穿插 <i v-if="store.intersections.length" class="badge red">{{ store.intersections.length }}</i>
      </button>
      <button :class="{ active: tab === 'align' }" @click="tab = 'align'">
        高程衔接 <i v-if="errorIssues.length" class="badge amber">{{ errorIssues.length }}</i>
      </button>
      <button :class="{ active: tab === 'segment' }" @click="tab = 'segment'">分段属性</button>
      <button :class="{ active: tab === 'history' }" @click="tab = 'history'">历史</button>
    </nav>

    <div class="panel-scroll">
      <!-- 穿插列表 -->
      <section v-if="tab === 'clash'" class="tab-page">
        <div class="summary-grid">
          <div><span>穿插段数</span><b class="danger-text">{{ store.intersections.length }}</b></div>
          <div><span>穿插长度</span><b class="danger-text">{{ store.totals.intersectLength.toFixed(1) }} m</b></div>
          <div><span>校核方式</span><b class="small">BVH Triangle</b></div>
        </div>

        <div v-if="!store.rockDataset" class="empty-state">尚未导入岩层分界面，可先在“数据导入”中载入。</div>
        <div v-else-if="!store.intersections.length" class="success-banner">
          ✓ BVH 实时求交未发现洞身与岩层分界面穿插。
        </div>

        <button
          v-for="item in store.intersections"
          :key="item.segmentId"
          class="clash-row"
          :class="{ active: item.segmentId === store.selectedSegmentId }"
          @click="focusSegment(item.segmentId, 'clash')"
        >
          <span class="clash-icon">⚠</span>
          <span class="clash-main">
            <b>{{ item.name }} · 与岩层界面相交</b>
            <em>{{ item.stationRange }}</em>
          </span>
          <span class="clash-length">{{ item.length.toFixed(1) }}m</span>
        </button>

        <div class="card subtle">
          <h3>醒目规则</h3>
          <p class="muted small-text">相交分段使用高饱和红色材质；选中后叠加黄色断面轮廓。拖动控制点时以粗放样 LOD 连续执行 <code>MeshBVH.intersectsGeometry</code>。</p>
        </div>
      </section>

      <!-- 高程衔接 -->
      <section v-else-if="tab === 'align'" class="tab-page">
        <div class="card">
          <h3>联动设置</h3>
          <label class="check-line">
            <input type="checkbox" v-model="store.autoJoin" />
            <span>坡度改陡后自动调整相邻段边界高程</span>
          </label>
          <div class="field-grid">
            <label class="field"><span>容差 m</span><input type="number" step="0.01" min="0.005" :value="store.joinTolerance" @change="updateTolerance" /></label>
            <label class="field"><span>限坡 %</span><input type="number" step="0.1" min="1" :value="store.maxGrade" @change="updateMaxGrade" /></label>
          </div>
          <button class="btn primary wide" @click="joinAll">一键顺接所有相邻段</button>
        </div>

        <div v-if="!store.issues.length" class="success-banner">
          ✓ 所有相邻段边界高程一致，未发现错台或超坡。
        </div>

        <button
          v-for="issue in store.issues"
          :key="issue.id"
          class="issue-row"
          :class="[issue.severity, { active: issue.segmentId === store.selectedSegmentId }]"
          @click="focusSegment(issue.segmentId, 'align')"
        >
          <b>{{ issue.severity === 'error' ? '✕ 对不齐' : '▲ 坡度预警' }} · {{ issue.stationLabel }}</b>
          <span>{{ issue.title }}</span>
          <em>{{ issue.message }}</em>
        </button>
      </section>

      <!-- 分段属性 -->
      <section v-else-if="tab === 'segment'" class="tab-page">
        <div v-if="!segment" class="empty-state">
          在三维视图或下方方量表中点击一个洞身分段，即可查看断面面积、坡度和开挖方量。
        </div>

        <template v-else>
          <div class="card highlight-card">
            <h3>{{ segment.name }}</h3>
            <div class="station-range">{{ segment.stationRange }}</div>
            <div class="tag-row">
              <span class="tag">{{ segment.sectionTypeLabel }}</span>
              <span class="tag blue">{{ segment.templateName }}</span>
              <span v-if="segment.intersects" class="tag red">岩层穿插</span>
            </div>

            <div class="metric-grid two">
              <div><span>段长</span><b>{{ segment.length.toFixed(2) }} m</b></div>
              <div><span>纵坡</span><b :class="Math.abs(segment.grade) > store.maxGrade ? 'danger-text' : ''">{{ segment.grade.toFixed(3) }}%</b></div>
              <div><span>净面积</span><b>{{ segment.netArea.toFixed(2) }} m²</b></div>
              <div><span>开挖面积</span><b class="accent">{{ segment.excavationArea.toFixed(2) }} m²</b></div>
              <div><span>净方量</span><b>{{ segment.netVolume.toFixed(1) }} m³</b></div>
              <div><span>开挖方量</span><b class="accent">{{ segment.excavationVolume.toFixed(1) }} m³</b></div>
            </div>
          </div>

          <div class="card">
            <h3>纵坡与高程联动</h3>
            <label class="field">
              <span>目标坡度（%，正为上坡）</span>
              <input v-model.number="gradeDraft" type="number" step="0.1" placeholder="输入坡度后应用" />
            </label>
            <div class="button-row">
              <button class="btn secondary" @click="applyDraftGrade">应用并顺接</button>
              <button class="mini-btn" @click="quickGrade(0.5)">+0.5%</button>
              <button class="mini-btn" @click="quickGrade(1)">+1%</button>
              <button class="mini-btn" @click="quickGrade(-0.5)">-0.5%</button>
            </div>
            <div class="field-grid">
              <label class="field"><span>起点高程 m</span><input type="number" step="0.01" :value="segment.startElev.toFixed(3)" @change="setElev('startElev', $event)" /></label>
              <label class="field"><span>终点高程 m</span><input type="number" step="0.01" :value="segment.endElev.toFixed(3)" @change="setElev('endElev', $event)" /></label>
            </div>
            <p v-if="segment.joinGap !== undefined && Math.abs(segment.joinGap) > store.joinTolerance" class="error-text">
              与下一段起点错台 {{ segment.joinGap.toFixed(3) }} m，请顺接。
            </p>
          </div>

          <div class="card">
            <h3>按段加密断面</h3>
            <div class="density-status">
              <span>当前加密倍数 <b>{{ segment.densityFactor }}×</b></span>
              <span>断面间距 <b>{{ segment.sectionSpacing.toFixed(2) }} m</b></span>
              <span>分段三角面 <b>{{ segment.triangles.toLocaleString() }}</b></span>
            </div>
            <div class="button-row">
              <button class="btn primary" @click="densify(2)">加密 ×2</button>
              <button class="btn secondary" @click="densify(4)">加密到 ×4</button>
              <button class="btn ghost" @click="densify(0)">恢复</button>
            </div>
            <p class="hint">加密只增加该段放样环数和实体面数；拖动时仍切换到轻量 LOD，松手后恢复全精度。</p>
          </div>
        </template>
      </section>

      <!-- 历史 -->
      <section v-else class="tab-page">
        <div class="card">
          <h3>撤销 / 重做</h3>
          <div class="button-row">
            <button class="btn secondary" :disabled="!store.history.canUndo" @click="undo">↶ 撤销</button>
            <button class="btn secondary" :disabled="!store.history.canRedo" @click="redo">↷ 重做</button>
          </div>
          <p class="hint">历史快照包含轴线、模板、桩号间隔、加密倍数和高程联动；回退后洞身、穿插红色标记和方量表一起恢复。</p>
        </div>
        <div class="card">
          <h3>最近步骤</h3>
          <ul v-if="store.history.labels.length" class="history-list">
            <li v-for="(label, i) in store.history.labels" :key="i">{{ label }}</li>
          </ul>
          <div v-else class="empty-state small">暂无可显示的历史步骤。</div>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  store, selectedSegment, undo, redo,
  densifySegment, applySegmentGrade, setSegmentElevation, joinAllElevations,
  recordHistory
} from '../store'

const tab = ref('clash')
const gradeDraft = ref(0)
const segment = selectedSegment
const errorIssues = computed(() => store.issues.filter(i => i.severity === 'error'))

watch(() => store.selectedSegmentId, (id) => {
  if (id) {
    const seg = store.segments.find(s => s.id === id)
    gradeDraft.value = seg ? Number(seg.grade.toFixed(2)) : 0
  }
})

function focusSegment(id, targetTab) {
  if (!id) return
  store.selectedSegmentId = id
  if (targetTab === 'segment') tab.value = 'segment'
  window.dispatchEvent(new CustomEvent('focus-segment', { detail: id }))
}
function densify(factor) {
  if (!segment.value) return
  densifySegment(segment.value.id, factor)
}
function applyDraftGrade() {
  if (!segment.value || !Number.isFinite(gradeDraft.value)) return
  applySegmentGrade(segment.value.id, gradeDraft.value)
}
function quickGrade(delta) {
  if (!segment.value) return
  const g = Number((segment.value.grade + delta).toFixed(2))
  gradeDraft.value = g
  applySegmentGrade(segment.value.id, g)
}
function setElev(field, event) {
  if (!segment.value) return
  const value = Number(event.target.value)
  if (Number.isFinite(value)) setSegmentElevation(segment.value.id, field, value)
}
function joinAll() { joinAllElevations(); tab.value = 'align' }
function updateTolerance(e) {
  const value = Number(e.target.value)
  if (Number.isFinite(value)) recordHistory('修改衔接容差', () => { store.joinTolerance = value })
}
function updateMaxGrade(e) {
  const value = Number(e.target.value)
  if (Number.isFinite(value)) recordHistory('修改限坡', () => { store.maxGrade = value })
}
</script>
