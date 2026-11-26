<template>
  <section class="bottom-panel" :class="{ collapsed }">
    <header class="bottom-header">
      <div class="bottom-title">
        <b>桩号分段 / 开挖方量表</b>
        <span>{{ store.segments.length }} 段</span>
        <span>总长 {{ store.totals.length.toFixed(1) }} m</span>
        <span>开挖 {{ store.totals.excavationVolume.toFixed(0) }} m³</span>
        <span v-if="store.intersections.length" class="danger-text">穿插 {{ store.intersections.length }} 段</span>
      </div>
      <div class="bottom-actions">
        <button class="mini-btn" @click="exportCsvAction">导出 CSV</button>
        <button class="mini-btn" @click="$emit('toggle')">{{ collapsed ? '展开表' : '收起表' }}</button>
      </div>
    </header>

    <div v-if="!collapsed" class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>段</th>
            <th>桩号范围</th>
            <th>段长 m</th>
            <th>起/终高程 m</th>
            <th>坡度 %</th>
            <th>断面</th>
            <th>净面积 m²</th>
            <th>开挖面积 m²</th>
            <th>开挖方量 m³</th>
            <th>加密</th>
            <th>岩层穿插</th>
            <th>定位</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in store.segments"
            :key="s.id"
            :class="{
              selected: s.id === store.selectedSegmentId,
              clash: s.intersects,
              issue: hasJoinIssue(s.id)
            }"
            @click="selectRow(s.id)"
          >
            <td><b>{{ s.name }}</b></td>
            <td class="station-cell">{{ s.stationRange }}</td>
            <td>{{ s.length.toFixed(2) }}</td>
            <td>{{ s.startElev.toFixed(2) }} / {{ s.endElev.toFixed(2) }}</td>
            <td :class="Math.abs(s.grade) > store.maxGrade ? 'danger-text' : ''">{{ s.grade.toFixed(2) }}</td>
            <td>{{ s.sectionTypeLabel }}</td>
            <td>{{ s.netArea.toFixed(2) }}</td>
            <td class="accent">{{ s.excavationArea.toFixed(2) }}</td>
            <td><b>{{ s.excavationVolume.toFixed(1) }}</b></td>
            <td>
              <button class="mini-btn" @click.stop="densifySegment(s.id, 2)">×{{ s.densityFactor }} 加密</button>
            </td>
            <td>
              <span v-if="s.intersects" class="tag red">穿插</span>
              <span v-else class="tag green">无</span>
            </td>
            <td><button class="mini-btn" @click.stop="selectRow(s.id, true)">聚焦</button></td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><b>合计</b></td>
            <td><b>{{ store.totals.length.toFixed(2) }}</b></td>
            <td colspan="4"></td>
            <td></td>
            <td><b class="accent">{{ store.totals.excavationVolume.toFixed(1) }}</b></td>
            <td colspan="3">净方量 {{ store.totals.netVolume.toFixed(1) }} m³</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>

<script setup>
import { store, densifySegment } from '../store'
import { exportCsvAction } from '../actions/io'

defineProps({ collapsed: Boolean })
defineEmits(['toggle'])

function selectRow(id, focus = false) {
  store.selectedSegmentId = id
  if (focus) window.dispatchEvent(new CustomEvent('focus-segment', { detail: id }))
}
function hasJoinIssue(id) {
  return store.issues.some(i => i.segmentId === id && i.type === 'join')
}
</script>
