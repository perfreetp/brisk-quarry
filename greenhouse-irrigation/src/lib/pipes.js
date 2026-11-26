// PE/PVC 管材目录（常用灌溉管，内径为参考值，单位 mm）
// id 用于在手动调径时稳定标识某一档管径
export const PIPE_CATALOG = [
  { dn: 16, id: 14.4 },
  { dn: 20, id: 18.2 },
  { dn: 25, id: 22.8 },
  { dn: 32, id: 29.4 },
  { dn: 40, id: 36.8 },
  { dn: 50, id: 46.0 },
  { dn: 63, id: 58.0 },
  { dn: 75, id: 69.0 },
  { dn: 90, id: 83.0 },
  { dn: 110, id: 101.6 },
  { dn: 125, id: 115.4 },
  { dn: 160, id: 147.6 },
  { dn: 200, id: 184.4 }
].map((p) => ({ ...p, key: `DN${p.dn}`, label: `DN${p.dn}（内径${p.id.toFixed(1)}mm）` }))

// 支管（毛管）可选管径
export const LATERAL_DN_OPTIONS = [12, 16, 20, 25]

// 海曾-威廉系数（PE/PVC 取 150）
export const HW_C = 150

// 水的运动粘度近似（20℃，m²/s），用于流速校核仅作展示
export const WATER_KINEMATIC_VISCOSITY = 1.004e-6

// 海曾-威廉沿程水头损失（MPa）
// SI 形式：h_f (m) = 10.67 * Q^1.852 * L / (C^1.852 * d^4.8704)
// Q: m³/s, L: m, d: m；再按 0.00981 MPa/m 换算
export function headLossMPa(flowLps, lengthM, innerDiamMm, c = HW_C) {
  if (flowLps <= 0 || lengthM <= 0) return 0
  const q = flowLps / 1000
  const d = innerDiamMm / 1000
  const hfMeters =
    (10.67 * Math.pow(q, 1.852) * lengthM) /
    (Math.pow(c, 1.852) * Math.pow(d, 4.8704))
  return hfMeters * 0.00981
}

// 管内流速 m/s
export function flowVelocity(flowLps, innerDiamMm) {
  if (flowLps <= 0) return 0
  const d = innerDiamMm / 1000
  return flowLps / 1000 / (Math.PI * (d * d) / 4)
}

// 给定流量与长度，求满足允许压降的最小一档管径（返回 catalog 索引，找不到返回最后一档）
export function minDnForLoss(flowLps, lengthM, allowableMPa) {
  for (let i = 0; i < PIPE_CATALOG.length; i++) {
    if (headLossMPa(flowLps, lengthM, PIPE_CATALOG[i].id) <= allowableMPa) return i
  }
  return PIPE_CATALOG.length - 1
}

// 推荐的加粗一档索引
export function nextDnIndex(index) {
  return Math.min(index + 1, PIPE_CATALOG.length - 1)
}
