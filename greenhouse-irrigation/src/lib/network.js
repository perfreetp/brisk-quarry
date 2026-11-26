// 管网模型：几何生成（种子驱动）+ 水力分段计算
// 坐标系：米。x 沿棚宽（主管方向），y 沿棚长（支管/苗床方向），首部在主管左端
import { subRand } from './rng.js'
import {
  PIPE_CATALOG,
  headLossMPa,
  flowVelocity,
  minDnForLoss,
  nextDnIndex
} from './pipes.js'

export const DEFAULT_PARAMS = {
  // 棚体
  houseWidth: 60, // 棚宽 m（主管长度方向）
  houseLength: 48, // 棚长 m（支管/苗床方向）
  mainOffset: 4, // 主管距侧墙（首部侧）距离 m
  mainJitter: 0.1, // 种子驱动的支管位置扰动幅度 m（模拟放线偏差）
  // 主管
  mainDn: 63, // 主管公称直径 DN
  autoMainDn: false, // 自动按压降选主管分段管径
  // 支管
  lateralSpacing: 3.6, // 支管/苗床中心间距 m
  bedWidth: 2.6, // 苗床宽度 m
  lateralDn: 16, // 支管管径 DN（内径取 catalog 中同档）
  // 滴头
  emitterSpacing: 0.3, // 滴头间距 m
  emitterFlow: 2.0, // 单滴头流量 L/h
  emitterStartMargin: 0.2, // 首端留白 m
  // 喷头
  sprinklerEnabled: true,
  sprinklerStart: 34, // 喷头区段起点（距主管的支管长度）m
  sprinklerThrow: 1.8, // 喷头射程 m（按射程排布，间距≈2R×0.8）
  sprinklerFlow: 40, // 单喷头流量 L/h
  // 水力
  sourcePressure: 0.25, // 水源出口压力 MPa
  allowableDpMain: 0.02, // 单段主管允许压降 MPa
  allowableDpLateral: 0.02, // 单条支管允许压降 MPa
  maxVelocity: 1.5 // 管内流速上限 m/s
}

const LATERAL_ID_PREFIX = 'L'

function innerDiamOf(dn) {
  const hit = PIPE_CATALOG.find((p) => p.dn === dn)
  return hit ? hit.id : dn * 0.92
}

function fmt(n, digits = 3) {
  return Number(n.toFixed(digits))
}

// 生成支管几何（位置、苗床归属、滴头/喷头排布），不做水力
function buildLaterals(params, lateralOverrides) {
  const {
    houseWidth,
    houseLength,
    mainOffset,
    mainJitter,
    lateralSpacing,
    bedWidth,
    emitterSpacing,
    emitterFlow,
    emitterStartMargin,
    sprinklerEnabled,
    sprinklerStart,
    sprinklerThrow,
    sprinklerFlow
  } = params

  const usableLength = houseLength - mainOffset
  // 每条支管对应一条苗床，名义位置 = 苗床中心线；床间空隙即作业道
  const count = Math.max(1, Math.floor(houseWidth / lateralSpacing))
  const rand = subRand(params.seed, 'lateral-geometry')
  const laterals = []

  for (let i = 0; i < count; i++) {
    const id = `${LATERAL_ID_PREFIX}${i + 1}`
    // 苗床 i 的中心线：spacing*(i+0.5)，与画布上的苗床绘制保持同一公式
    const baseX = lateralSpacing * (i + 0.5)
    if (baseX > houseWidth - 0.3) break
    // 种子驱动的放线扰动；手动接管后以手动位置为准
    const jitter = (rand() * 2 - 1) * mainJitter
    const ov = lateralOverrides[id] || {}
    const x = Number.isFinite(ov.x) ? ov.x : fmt(baseX + jitter, 2)

    // 苗床归属与作业道穿越判定：偏离本床中心线超过床宽一半即落入床间作业道
    const bedIndex = i
    const bedCenterX = baseX
    const bedHalf = bedWidth / 2

    // 作业道穿越判定：作业道 = 相邻苗床之间的纵向空隙（沿 y 贯通）
    const inBed = Math.abs(x - bedCenterX) <= bedHalf

    // 支管上的滴头/喷头（沿 y 排布，贴苗床走向）
    const emitters = []
    const sprinklers = []
    const spStart = sprinklerEnabled ? Math.min(sprinklerStart, usableLength) : usableLength
    // 滴头区段：主管到喷头区段起点
    const dripLen = spStart
    const eSpacing = Number.isFinite(ov.emitterSpacing) ? ov.emitterSpacing : emitterSpacing
    if (eSpacing > 0) {
      const n = Math.max(0, Math.floor((dripLen - emitterStartMargin) / eSpacing) + 1)
      for (let k = 0; k < n; k++) {
        const y = mainOffset + emitterStartMargin + k * eSpacing
        if (y <= mainOffset + dripLen + 1e-9) {
          emitters.push({
            id: `${id}-E${k + 1}`,
            y: fmt(y, 2),
            flowLh: emitterFlow,
            kind: 'drip'
          })
        }
      }
    }
    if (sprinklerEnabled && usableLength - spStart > 0.1) {
      // 按射程排布：间距取 0.8×2R（喷灌常用方形布置系数）
      const spSpacing = Math.max(0.4, sprinklerThrow * 2 * 0.8)
      const n = Math.max(1, Math.round((usableLength - spStart) / spSpacing))
      for (let k = 0; k < n; k++) {
        const y = mainOffset + spStart + (k + 0.5) * ((usableLength - spStart) / n)
        sprinklers.push({
          id: `${id}-S${k + 1}`,
          y: fmt(y, 2),
          flowLh: sprinklerFlow,
          throw: sprinklerThrow,
          kind: 'sprinkler'
        })
      }
    }

    laterals.push({
      id,
      index: i,
      x,
      baseX: fmt(baseX, 2),
      bedIndex,
      bedCenterX: fmt(bedCenterX, 2),
      bedHalf,
      crossesAisle: !inBed,
      length: fmt(usableLength, 2),
      emitterSpacing: fmt(eSpacing, 3),
      emitters,
      sprinklers,
      manualX: Number.isFinite(ov.x),
      manualSpacing: Number.isFinite(ov.emitterSpacing)
    })
  }
  return laterals
}

// 支管水力：把滴头/喷头流量折算为沿程均布流量，用海曾-威廉估算整条支管压降
function calcLateralHydraulics(lateral, params) {
  const diam = innerDiamOf(params.lateralDn)
  const totalLh =
    lateral.emitters.reduce((s, e) => s + e.flowLh, 0) +
    lateral.sprinklers.reduce((s, e) => s + e.flowLh, 0)
  const flowLps = totalLh / 3600
  // 多点出流毛管的等效沿程损失 ≈ 0.6 倍同流量直通管损失（规范常用折减）
  const fullLoss = headLossMPa(flowLps, lateral.length, diam)
  const loss = fullLoss * (totalLh > 0 ? 0.6 : 0)
  const inletVel = flowVelocity(flowLps, diam)
  const overDrop = loss > params.allowableDpLateral
  return {
    diam,
    totalLh: fmt(totalLh, 1),
    flowLps: fmt(flowLps, 4),
    loss: fmt(loss, 4),
    inletVelocity: fmt(inletVel, 2),
    overDrop,
    // 缩短到允许压降时对应的最大支管长度（提示用）
    maxLengthForAllow:
      totalLh > 0 && loss > 0
        ? fmt((lateral.length * params.allowableDpLateral) / loss, 1)
        : lateral.length
  }
}

// 主管分段 + 全系统水力
export function buildNetwork(rawParams, overrides = {}) {
  const params = { ...DEFAULT_PARAMS, ...rawParams }
  const lateralOverrides = overrides.laterals || {}
  const mainDnOverrides = overrides.mainSegments || {}

  const laterals = buildLaterals(params, lateralOverrides)

  // 主管分段：以每个支管三通为界，最后一段延伸到棚尾
  const mainDn = params.mainDn
  const tailX = params.houseWidth
  const junctionXs = laterals.map((l) => l.x)
  const boundaries = [0, ...junctionXs, tailX]

  const segments = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    segments.push({
      key: `seg-${i}`,
      index: i,
      x1: fmt(boundaries[i], 2),
      x2: fmt(boundaries[i + 1], 2),
      length: fmt(boundaries[i + 1] - boundaries[i], 2),
      lateralId: i < laterals.length ? laterals[i].id : null
    })
  }

  // 先算各支管入流
  const lateralHydro = {}
  let totalDemandLps = 0
  for (const l of laterals) {
    const h = calcLateralHydraulics(l, params)
    lateralHydro[l.id] = h
    totalDemandLps += h.flowLps
  }

  // 从棚尾往首部推各段流量（直通流量 + 本段三通接出的支管流量）
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]
    const through = i + 1 < segments.length ? segments[i + 1].flowLps : 0
    const branch = seg.lateralId ? lateralHydro[seg.lateralId].flowLps : 0
    seg.flowLps = fmt(through + branch, 4)
  }

  // 各段管径：自动模式按允许压降选；手动模式用全局 DN，可逐段覆盖
  laterals.forEach((l) => (l.hydraulic = lateralHydro[l.id]))
  for (const seg of segments) {
    let dnIndex
    if (params.autoMainDn) {
      dnIndex = minDnForLoss(seg.flowLps, seg.length, params.allowableDpMain)
    } else {
      const baseIndex = PIPE_CATALOG.findIndex((p) => p.dn === mainDn)
      dnIndex = Number.isFinite(mainDnOverrides[seg.key])
        ? mainDnOverrides[seg.key]
        : Math.max(0, baseIndex)
    }
    const pipe = PIPE_CATALOG[dnIndex]
    seg.dnIndex = dnIndex
    seg.dn = pipe.dn
    seg.innerDiam = pipe.id
    seg.loss = fmt(headLossMPa(seg.flowLps, seg.length, pipe.id), 4)
    seg.velocity = fmt(flowVelocity(seg.flowLps, pipe.id), 2)
    seg.overDrop = seg.loss > params.allowableDpMain
    seg.overVelocity = seg.velocity > params.maxVelocity
    seg.recommendDnIndex = seg.overDrop ? nextDnIndex(dnIndex) : dnIndex
    // 缩短建议：当前管径下满足允许压降的最大管长
    seg.maxLengthForAllow =
      seg.loss > 0
        ? fmt((seg.length * params.allowableDpMain) / seg.loss, 1)
        : seg.length
    seg.manualDn = !params.autoMainDn && Number.isFinite(mainDnOverrides[seg.key])
  }

  // 从首部沿程压力：水源压力 -> 各三通节点压力 -> 各支管入口压力
  let p = params.sourcePressure
  const pressureNodes = [{ x: 0, pressure: fmt(p, 3), label: '水源' }]
  for (const seg of segments) {
    p = Math.max(0, p - seg.loss)
    pressureNodes.push({
      x: seg.x2,
      pressure: fmt(p, 3),
      label: seg.lateralId ? `${seg.lateralId}三通` : '棚尾'
    })
  }
  // 支管入口压力 = 对应三通节点压力；末端压力再扣支管损失
  for (let i = 0; i < laterals.length; i++) {
    const l = laterals[i]
    const nodePressure = pressureNodes[i + 1] ? pressureNodes[i + 1].pressure : 0
    l.inletPressure = fmt(nodePressure, 3)
    l.endPressure = fmt(Math.max(0, nodePressure - l.hydraulic.loss), 3)
  }

  // 问题清单
  const issues = []
  for (const l of laterals) {
    if (l.crossesAisle) {
      issues.push({
        type: 'aisle',
        severity: 'error',
        refId: l.id,
        text: `${l.id} 穿过作业道（x=${l.x}m，苗床中心 x=${l.bedCenterX}m，床宽 ${params.bedWidth}m）`
      })
    }
    if (l.hydraulic.overDrop) {
      issues.push({
        type: 'lateral-drop',
        severity: 'warn',
        refId: l.id,
        text: `${l.id} 压降 ${l.hydraulic.loss}MPa 超允许值 ${params.allowableDpLateral}MPa，建议加粗支管或缩短至 ${l.hydraulic.maxLengthForAllow}m 以内`
      })
    }
  }
  for (const seg of segments) {
    if (seg.overDrop) {
      issues.push({
        type: 'main-drop',
        severity: 'warn',
        refId: seg.key,
        text:
          `主管段 ${seg.key}（${seg.x1}~${seg.x2}m，DN${seg.dn}）压降 ${seg.loss}MPa ` +
          `超允许值 ${params.allowableDpMain}MPa，建议加粗到 ${PIPE_CATALOG[seg.recommendDnIndex].label} 或缩短至 ${seg.maxLengthForAllow}m`
      })
    }
    if (seg.overVelocity) {
      issues.push({
        type: 'velocity',
        severity: 'warn',
        refId: seg.key,
        text: `主管段 ${seg.key} 流速 ${seg.velocity}m/s 超过上限 ${params.maxVelocity}m/s，建议加粗管径`
      })
    }
  }

  return {
    params,
    laterals,
    segments,
    pressureNodes,
    issues,
    totalFlowLps: fmt(totalDemandLps, 4),
    totalFlowLh: fmt(totalDemandLps * 3600, 0),
    endPressure: fmt(p, 3),
    totalLoss: fmt(params.sourcePressure - p, 4)
  }
}
