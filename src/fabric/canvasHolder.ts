import { markRaw, shallowRef } from 'vue'
import type { Canvas } from 'fabric'

/**
 * fabric Canvas 实例的模块级持有者。
 * fabric 对象图绝不进 Pinia/深响应式，只用 shallowRef + markRaw。
 */
const canvasRef = shallowRef<Canvas | null>(null)

export function setCanvas(canvas: Canvas | null): void {
  canvasRef.value = canvas ? markRaw(canvas) : null
}

export function getCanvas(): Canvas {
  const c = canvasRef.value
  if (!c) throw new Error('Canvas 尚未初始化')
  return c
}

export function tryGetCanvas(): Canvas | null {
  return canvasRef.value
}

export function canvasState(): typeof canvasRef {
  return canvasRef
}
