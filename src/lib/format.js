export function parseStation(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value).trim().toUpperCase().replace(/\s+/g, '')
  if (!text) return fallback
  // K12+345.6 / DK1+200 / CK0+012
  const match = text.match(/(?:[A-Z]*K)?(-?\d+)\+(\d+(?:\.\d+)?)/)
  if (match) return Number(match[1]) * 1000 + Number(match[2])
  const n = Number(text.replace(/[KKM]/g, ''))
  return Number.isFinite(n) ? n : fallback
}

export function formatStation(meters, withSign = false) {
  const sign = meters < 0 ? '-' : ''
  const abs = Math.abs(meters)
  const km = Math.floor(abs / 1000)
  const m = abs - km * 1000
  const mText = m >= 999.995 ? '1000.00' : m.toFixed(2).padStart(6, '0')
  const prefix = withSign ? sign : ''
  return `${prefix}K${km}+${mText}`
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`
}

export function deepClone(value) {
  // 统一走 JSON：既能解开 Vue reactive Proxy，也避免 structuredClone 对代理对象抛 DataCloneError
  return JSON.parse(JSON.stringify(value))
}

export function downloadText(filename, text, mime = 'text/plain;charset=utf-8', addBom = true) {
  const blob = new Blob([addBom ? '﻿' + text : text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
