import { markRaw } from 'vue'
import { store, recordHistory, ensureGeoOrigin, showToast } from '../store'
import { parseAxisText, parseSurfaceText } from '../lib/parsers'
import { exportQuantityCsv } from '../lib/csv'
import { exportIfcByChainage } from '../lib/ifc'
import { downloadText } from '../lib/format'

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

export async function importAxisFile(file) {
  try {
    const text = await readFileText(file)
    const { points } = parseAxisText(text, file.name)
    ensureGeoOrigin(points[0].east, points[0].north)
    recordHistory(`导入轴线 ${file.name}`, () => {
      store.axisPoints = points
      store.selectedPointId = points[1]?.id || points[0].id
      store.selectedSegmentId = null
      store.density = {}
      store.verticalEdits = {}
      store.axisImportName = file.name
    })
    showToast(`已导入轴线：${points.length} 个控制点`)
    window.dispatchEvent(new CustomEvent('fit-view'))
  } catch (err) {
    console.error(err)
    showToast(`轴线导入失败：${err.message}`, 'error', 5000)
  }
}

export async function importTerrainFile(file) {
  try {
    const text = await readFileText(file)
    const ds = markRaw(parseSurfaceText(text, file.name, 'terrain'))
    if (ds.kind === 'grid') ensureGeoOrigin(ds.minEast, ds.minNorth)
    store.terrainDataset = ds
    store.terrainImportName = file.name
    showToast(`DEM已导入：${file.name}`)
    window.dispatchEvent(new CustomEvent('fit-view'))
  } catch (err) {
    console.error(err)
    showToast(`DEM导入失败：${err.message}`, 'error', 5000)
  }
}

export async function importRockFile(file) {
  try {
    const text = await readFileText(file)
    const ds = markRaw(parseSurfaceText(text, file.name, 'rock'))
    if (ds.kind === 'grid') ensureGeoOrigin(ds.minEast, ds.minNorth)
    store.rockDataset = ds
    store.rockImportName = file.name
    showToast(`岩层分界面已导入：${file.name}`)
  } catch (err) {
    console.error(err)
    showToast(`地质界面导入失败：${err.message}`, 'error', 5000)
  }
}

export function exportCsvAction() {
  try {
    exportQuantityCsv(store.segments, store.totals, {
      pointCount: store.axisPoints.length,
      interval: store.interval
    })
    showToast('开挖方量表 CSV 已导出')
  } catch (err) {
    console.error(err)
    showToast(`CSV导出失败：${err.message}`, 'error', 5000)
  }
}

export function exportIfcAction() {
  try {
    exportIfcByChainage(store)
    showToast('IFC4 已按桩号分段导出，可交由 BIM 深化软件打开')
  } catch (err) {
    console.error(err)
    showToast(`IFC导出失败：${err.message}`, 'error', 6000)
  }
}

export function downloadAxisTemplate() {
  const csv = [
    '桩号,east,north,elev,name',
    'K0+000,0,0,42.0,JD1',
    'K0+042,42,9,43.3,JD2',
    'K0+088,88,-7,46.2,JD3',
    'K0+134,134,13,47.4,JD4',
    'K0+180,180,4,49.1,JD5'
  ].join('\n')
  downloadText('隧洞轴线导入模板.csv', csv, 'text/csv;charset=utf-8')
}

export function downloadRockTemplate() {
  const csv = [
    '桩号,岩层界面高程',
    'K0+000,44.2',
    'K0+020,46.1',
    'K0+040,45.0',
    'K0+060,42.4',
    'K0+080,41.5',
    'K0+100,44.8',
    'K0+120,47.0',
    'K0+140,45.6',
    'K0+160,42.8',
    'K0+180,43.5'
  ].join('\n')
  downloadText('地质剖面岩层界面模板.csv', csv, 'text/csv;charset=utf-8')
}
