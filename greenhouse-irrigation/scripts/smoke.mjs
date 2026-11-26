import { buildNetwork, DEFAULT_PARAMS } from '../src/lib/network.js'

const params = { ...DEFAULT_PARAMS, seed: 'TEST-SEED-42' }

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exitCode = 1
  } else {
    console.log('ok  :', msg)
  }
}

// 1. 确定性：同种子同参数两次生成完全一致
const a = buildNetwork(params, {})
const b = buildNetwork({ ...params }, {})
assert(JSON.stringify(a) === JSON.stringify(b), '同种子同参数 -> 结果完全一致')

// 换种子 -> 排布可能变化（扰动不同）
const c = buildNetwork({ ...params, seed: 'OTHER-99' }, {})
const xsA = a.laterals.map((l) => l.x).join(',')
const xsC = c.laterals.map((l) => l.x).join(',')
assert(xsA !== xsC, '换种子 -> 支管位置序列变化')

// 2. 手动位置在重算后保留
const moved = buildNetwork(params, { laterals: { L1: { x: 7.77 } } })
assert(moved.laterals[0].x === 7.77 && moved.laterals[0].manualX, '手动支管位置被保留')
const moved2 = buildNetwork({ ...params, mainDn: 90 }, { laterals: { L1: { x: 7.77 } } })
assert(moved2.laterals[0].x === 7.77, '改上游主管管径后手动位置仍保留')
assert(moved2.segments.every((s) => s.dn === 90), '改主管管径 -> 各段管径更新')

// 3. 单支管间距调整不影响相邻支管
const sp = buildNetwork(params, { laterals: { L2: { emitterSpacing: 0.55 } } })
const l1 = sp.laterals.find((l) => l.id === 'L1')
const l2 = sp.laterals.find((l) => l.id === 'L2')
const l3 = sp.laterals.find((l) => l.id === 'L3')
assert(l2.emitterSpacing === 0.55 && l2.manualSpacing, 'L2 间距被手动修改')
assert(l1.emitterSpacing === params.emitterSpacing, '相邻 L1 间距不变')
assert(l3.emitterSpacing === params.emitterSpacing, '相邻 L3 间距不变')

// 4. 把支管拖入作业道 -> 红框清单（床中心 = spacing*(i+0.5)）
const bed2Center = params.lateralSpacing * 1.5
const aisle = buildNetwork(params, {
  laterals: { L2: { x: bed2Center + params.bedWidth / 2 + 0.3 } }
})
const target = aisle.laterals.find((l) => l.id === 'L2')
assert(target.crossesAisle, '拖入床间空隙 -> 判定穿作业道')
assert(aisle.issues.some((i) => i.type === 'aisle' && i.refId === 'L2'), '问题清单包含穿作业道项')

// 4b. 默认排布下所有支管都在自己苗床内（无穿道误报）
assert(
  a.laterals.every((l) => !l.crossesAisle),
  '默认种子排布 -> 无穿作业道误报'
)

// 5. 超压降标黄 + 建议（细管径 + 收紧允许压降，模拟主管选径偏小）
const strict = buildNetwork({ ...params, mainDn: 25, allowableDpMain: 0.01 }, {})
assert(strict.segments.some((s) => s.overDrop), '细管段超压降 -> 存在标黄主管段')
const warn = strict.issues.find((i) => i.type === 'main-drop')
assert(!!warn && /加粗|缩短/.test(warn.text), '标黄段给出加粗/缩短提示')
assert(
  strict.segments.find((s) => s.overDrop).recommendDnIndex >
    strict.segments.find((s) => s.overDrop).dnIndex,
  '加粗建议指向更大一档管径'
)

// 5b. 自动选径模式：同样工况下系统自动加粗并消除主管超压降
const autoFix = buildNetwork(
  { ...params, mainDn: 25, allowableDpMain: 0.01, autoMainDn: true },
  {}
)
assert(autoFix.segments.every((s) => !s.overDrop), '自动选径 -> 无超压降主管段')

// 5c. 支管选径过细 -> 支管压降告警
const latStrict = buildNetwork({ ...params, lateralDn: 12, allowableDpLateral: 0.005 }, {})
assert(latStrict.issues.some((i) => i.type === 'lateral-drop'), '细支管 -> 支管压降告警')

// 6. 自动模式下逐段选径，下游压力单调不增
const auto = buildNetwork({ ...params, autoMainDn: true }, {})
let monotonic = true
for (let i = 1; i < auto.pressureNodes.length; i++) {
  if (auto.pressureNodes[i].pressure > auto.pressureNodes[i - 1].pressure + 1e-9) monotonic = false
}
assert(monotonic, '沿程压力单调不增')
assert(auto.pressureNodes[0].pressure === params.sourcePressure, '首部压力 = 水源压力')
assert(auto.pressureNodes.at(-1).pressure === auto.endPressure, '末端节点压力 = 棚尾压力')

// 7. 流量守恒：各支管入流之和 = 首段总流量
const sumLat = a.laterals.reduce((s, l) => s + l.hydraulic.flowLps, 0)
assert(Math.abs(sumLat - a.segments[0].flowLps) < 1e-9, '流量守恒：首段流量 = 支管流量之和')

// 8. 喷头区段：喷头数 > 0 且按射程间距排布
assert(a.laterals.every((l) => l.sprinklers.length > 0), '每条支管都有喷头')
const noSp = buildNetwork({ ...params, sprinklerEnabled: false }, {})
assert(noSp.laterals.every((l) => l.sprinklers.length === 0), '关闭喷头区段后无喷头')
assert(noSp.laterals[0].emitters.length > a.laterals[0].emitters.length, '关闭喷头后滴头铺满整条支管')

// 9. 手动管径覆盖与清除
const seg0 = a.segments[0].key
const manual = buildNetwork(params, { mainSegments: { [seg0]: 10 } })
assert(manual.segments[0].dn === 125 && manual.segments[0].manualDn, '主管段可单独手动改径')
assert(manual.segments[1].dn === params.mainDn, '其余段保持全局管径')

console.log('\n概要：', {
  支管数: a.laterals.length,
  首段流量_Lh: a.totalFlowLh,
  棚尾压力_kPa: Math.round(a.endPressure * 1000),
  问题数: a.issues.length,
  穿作业道: a.issues.filter((i) => i.type === 'aisle').length
})
