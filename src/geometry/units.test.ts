import { describe, expect, it } from 'vitest'
import type { Calibration } from '@/types/doc'
import { formatMm, isCalibrated, mmToPx, mmToPxScalar, pxPerMm, pxToMm, tableRectPx } from './units'

const cal: Calibration = {
  tableWidthMm: 100,
  tableHeightMm: 200,
  p1: { x: 10, y: 20 },
  p2: { x: 210, y: 420 },
  done: true,
}

describe('units 标定换算', () => {
  it('计算 px/mm（含非等比）', () => {
    expect(pxPerMm(cal)).toEqual({ sx: 2, sy: 2 })
    const nonUniform: Calibration = { ...cal, p2: { x: 210, y: 620 } }
    expect(pxPerMm(nonUniform)).toEqual({ sx: 2, sy: 3 })
  })

  it('mm→px→mm 往返一致', () => {
    const px = mmToPx(cal, { x: 25, y: 75 })
    expect(px).toEqual({ x: 60, y: 170 })
    expect(pxToMm(cal, px)).toEqual({ x: 25, y: 75 })
  })

  it('支持反向角点（带符号比例）', () => {
    const flipped: Calibration = { ...cal, p1: { x: 210, y: 420 }, p2: { x: 10, y: 20 } }
    const { sx, sy } = pxPerMm(flipped)
    expect(sx).toBe(-2)
    expect(sy).toBe(-2)
    const px = mmToPx(flipped, { x: 0, y: 0 })
    expect(px).toEqual({ x: 210, y: 420 })
    const back = pxToMm(flipped, px)
    expect(back.x).toBeCloseTo(0)
    expect(back.y).toBeCloseTo(0)
  })

  it('未完成标定抛错并被 isCalibrated 识别', () => {
    expect(isCalibrated({ ...cal, done: false })).toBe(false)
    expect(isCalibrated({ ...cal, tableWidthMm: 0 })).toBe(false)
    expect(() => pxPerMm({ ...cal, p1: null })).toThrow()
  })

  it('标量换算用几何均值；台面矩形归一化方向', () => {
    const nonUniform: Calibration = { ...cal, p2: { x: 210, y: 620 } }
    expect(mmToPxScalar(nonUniform, 10)).toBeCloseTo(10 * Math.sqrt(6), 6)
    const rect = tableRectPx(cal)
    expect(rect).toEqual({ left: 10, top: 20, width: 200, height: 400 })
    const flippedRect = tableRectPx({ ...cal, p1: { x: 210, y: 420 }, p2: { x: 10, y: 20 } })
    expect(flippedRect.left).toBe(10)
    expect(flippedRect.top).toBe(20)
  })

  it('formatMm 保留两位', () => {
    expect(formatMm(2.3456)).toBe('2.35')
  })
})
