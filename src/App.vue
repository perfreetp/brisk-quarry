<script setup lang="ts">
import { ref } from 'vue'
import Toolbar from '@/components/Toolbar.vue'
import CanvasStage from '@/components/CanvasStage.vue'
import LayerPanel from '@/components/LayerPanel.vue'
import LampLibrary from '@/components/LampLibrary.vue'
import LampListPanel from '@/components/LampListPanel.vue'
import AnnotationPanel from '@/components/AnnotationPanel.vue'
import CalibrationPanel from '@/components/CalibrationPanel.vue'
import { useCanvas } from '@/fabric/useCanvas'
import { usePersistence } from '@/composables/usePersistence'
import { importProject } from '@/fabric/serialization'
import { putImage } from '@/utils/imageDb'
import { useDocumentStore } from '@/stores/document'
import { uid } from '@/utils/id'

const showCalibration = ref(false)
const imageInput = ref<HTMLInputElement | null>(null)
const doc = useDocumentStore()

const { importBaseImage } = useCanvas()
usePersistence()

async function onImageFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const imageId = uid('img')
  await putImage(imageId, file)
  doc.baseImageId = imageId
  await importBaseImage(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function onProjectFile(file: File) {
  const text = await file.text()
  await importProject(JSON.parse(text))
}
</script>

<template>
  <div class="app-shell">
    <Toolbar
      @calibrate="showCalibration = true"
      @import-image="imageInput?.click()"
      @import-project="onProjectFile"
    />
    <input ref="imageInput" type="file" accept="image/*" style="display: none" @change="onImageFile" />

    <aside class="panel panel-left">
      <LayerPanel />
    </aside>

    <CanvasStage :calibration-mode="showCalibration" />

    <aside class="panel panel-right">
      <LampLibrary />
      <LampListPanel />
      <AnnotationPanel />
    </aside>

    <CalibrationPanel v-if="showCalibration" @close="showCalibration = false" />
  </div>
</template>
