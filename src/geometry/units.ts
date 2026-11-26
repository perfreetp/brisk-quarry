import type { Calibration, Point } from '@/types/doc'

export interface Vec2 {
  x: number
  y: number
}

export function isCalibrated(cal: Calibration): boolean {
  return (
    cal.done &&
    cal.p1 !== null &&
    cal.p2 !== null &&
    cal.tableWidthMm > 0 &&
    cal.tableHeightMm > 0
  )
}

/** px/mm，带符号（允许角点反向拖取） */
export function pxPerMm(cal: Calibration): { sx: number; sy: number } {
  if (!cal.p1 || !cal.p2 || cal.tableWidthMm <= 0 || cal.tableHeightMm <= 0) {
    throw new Error('标定未完成，无法计算 px/mm 比例')
  }
  return {
    sx: (cal.p2.x - cal.p1.x) / cal.tableWidthMm,
    sy: (cal.p2.y - cal.p1.y) / cal.tableHeightMm,
  }
}

export function mmToPx(cal: Calibration, m: Vec2): Point {
  const { sx, sy } = pxPerMm(cal)
  return { x: cal.p1!.x + m.x * sx, y: cal.p1!.y + m.y * sy }
}

export function pxToMm(cal: Calibration, p: Vec2): Vec2 {
  const { sx, sy } = pxPerMm(cal)
  return { x: (p.x - cal.p1!.x) / sx, y: (p.y - cal.p1!.y) / sy }
}

/** 标量 mm→px，非等比标定下取几何均值（笔宽近似，UI 需注明） */
export function mmToPxScalar(cal: Calibration, mm: number): number {
  const { sx, sy } = pxPerMm(cal)
  return mm * Math.sqrt(Math.abs(sx * sy))
}

/** 台面四角（场景 px），用于 clipPath 与 SVG viewBox */
export function tableRectPx(cal: Calibration): { left: number; top: number; width: number; height: number } {
  const { sx, sy } = pxPerMm(cal)
  const width = Math.abs(sx * cal.tableWidthMm)
  const height = Math.abs(sy * cal.tableHeightMm)
  return {
    left: Math.min(cal.p1!.x, cal.p2!.x),
    top: Math.min(cal.p1!.y, cal.p2!.y),
    width,
    height,
  }
}

export function formatMm(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2)
}
