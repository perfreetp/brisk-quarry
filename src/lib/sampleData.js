import { markRaw } from 'vue'

export function createSampleTerrain() {
  const cols = 121
  const rows = 61
  const minEast = -35
  const minNorth = -60
  const cell = 2.5
  const values = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    const north = minNorth + r * cell
    for (let c = 0; c < cols; c++) {
      const east = minEast + c * cell
      const ridge = 5.5 * Math.exp(-((north - 18) ** 2) / 1400)
      const valley = -3.2 * Math.exp(-((north + 28) ** 2) / 650)
      const noise = 1.4 * Math.sin(east * 0.071) * Math.cos(north * 0.093)
      const broad = 2.6 * Math.sin(east * 0.026 + 0.7)
      values[r * cols + c] = 53.5 + ridge + valley + noise + broad + east * 0.012
    }
  }
  return markRaw({
    kind: 'grid',
    source: 'terrain',
    name: '示例地形DEM（低山宽谷）',
    cols, rows, minEast, minNorth, cellEast: cell, cellNorth: cell,
    values
  })
}

export function createSampleRockProfile() {
  const points = []
  for (let station = 0; station <= 180; station += 5) {
    const elev = 44.2
      + 3.0 * Math.sin(station * 0.078 + 0.4)
      + 1.35 * Math.cos(station * 0.031 - 0.8)
    points.push({ station, elev })
  }
  return markRaw({
    kind: 'profile',
    source: 'rock',
    name: '示例地质剖面 · 风化灰岩分界面',
    width: 76,
    crossSegments: 14,
    alongStep: 4,
    crossSlope: 0.018,
    points
  })
}
