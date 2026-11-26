<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useDocumentStore } from '@/stores/document'
import { useUiStore } from '@/stores/ui'
import { annotationService } from '@/fabric/annotationService'
import { wearService } from '@/fabric/wearService'

const doc = useDocumentStore()
const ui = useUiStore()

const annotatingLampId = ref<string | null>(null)
const draftText = ref('')

function startAnnotate(lampId: string) {
  annotatingLampId.value = lampId
  draftText.value = ''
}

function submitAnnotation() {
  if (!annotatingLampId.value || !draftText.value.trim()) return
  annotationService.create(
    annotatingLampId.value,
    draftText.value.trim(),
    ui.role === 'operator' ? '运营方' : '主设',
    ui.role,
  )
  annotatingLampId.value = null
  draftText.value = ''
}

function onCustom(e: Event) {
  startAnnotate((e as CustomEvent<string>).detail)
}

onMounted(() => window.addEventListener('pst:annotate-lamp', onCustom))
onBeforeUnmount(() => window.removeEventListener('pst:annotate-lamp', onCustom))

function lampLabel(lampId: string): string {
  const lamp = doc.lampById(lampId)
  return lamp ? `#${lamp.code}` : '（灯珠已删除）'
}
</script>

<template>
  <div>
    <div class="section">
      <h3>灯位现场批注</h3>
      <p class="hint">
        运营方选择「灯位批注」工具后点击灯珠即可挂批注（如：弯道出口晃眼）。批注锚定灯珠，灯珠移动自动跟随。
      </p>
      <div v-if="doc.annotations.length === 0" class="hint">暂无批注</div>
      <div
        v-for="a in doc.annotations"
        :key="a.id"
        class="annotation-item"
        :class="{ resolved: a.resolved }"
      >
        <div class="row" style="justify-content: space-between">
          <strong>灯位 {{ lampLabel(a.lampId) }}</strong>
          <span class="pill" :class="a.resolved ? 'gray' : 'ok'">{{ a.resolved ? '已解决' : '待处理' }}</span>
        </div>
        <p style="margin: 6px 0">{{ a.text }}</p>
        <div class="hint">{{ a.author }} · {{ new Date(a.createdAt).toLocaleString() }}</div>
        <div class="row" style="margin-top: 6px">
          <button @click="annotationService.resolve(a.id, !a.resolved)">
            {{ a.resolved ? '重新打开' : '标记解决' }}
          </button>
          <button class="danger" @click="annotationService.remove(a.id)">删除</button>
        </div>
      </div>
    </div>

    <div class="section">
      <h3>磨损记录（卡球位置）</h3>
      <p class="hint">运营方用「磨损圈」工具在画布上拖出圈注，mm 坐标保存，标定变更后自动重建。</p>
      <div v-if="doc.wears.length === 0" class="hint">暂无磨损记录</div>
      <div v-for="w in doc.wears" :key="w.id" class="annotation-item">
        <div class="row" style="justify-content: space-between">
          <strong>Ø {{ w.radiusMm.toFixed(1) }} mm 卡球圈</strong>
          <button class="danger" style="padding: 2px 7px" @click="wearService.remove(w.id)">✕</button>
        </div>
        <div class="hint">
          中心 ({{ w.centerMm.x.toFixed(1) }}, {{ w.centerMm.y.toFixed(1) }}) mm · {{ w.author }}
        </div>
      </div>
    </div>

    <div v-if="annotatingLampId" class="modal-backdrop" @click.self="annotatingLampId = null">
      <div class="modal">
        <h2>给灯位 {{ lampLabel(annotatingLampId) }} 加现场批注</h2>
        <textarea v-model="draftText" rows="4" placeholder="例如：这个灯位在弯道出口晃眼" />
        <div class="row" style="justify-content: flex-end; margin-top: 10px">
          <button @click="annotatingLampId = null">取消</button>
          <button class="active" :disabled="!draftText.trim()" @click="submitAnnotation">提交批注</button>
        </div>
      </div>
    </div>
  </div>
</template>
