import { buildOperabilityChecks } from './engine/flowEngine';
import type { AppState } from './types';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
    filename,
  );
}

export function downloadHtml(filename: string, html: string): void {
  downloadBlob(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    filename,
  );
}

function distanceRows(state: AppState): Array<{ segment: string; distanceM: number; detail: string }> {
  const lr = state.groups.am.tracks.find((track) => track.routeId === 'lr');
  const rl = state.groups.am.tracks.find((track) => track.routeId === 'rl');
  if (!lr || !rl) return [];
  const between = (track: typeof lr, fromNode: string, toNode: string) => {
    const from = track.keyframes.find((kf) => kf.nodeId === fromNode);
    const to = track.keyframes.find((kf) => kf.nodeId === toNode);
    return Math.abs((to?.distanceM ?? 0) - (from?.distanceM ?? 0));
  };
  return [
    { segment: '2号线上行站台 → 西楼梯口', distanceM: between(lr, 'p2-door', 'w-mouth'), detail: '站台及排队' },
    { segment: '西楼梯口 → 西站厅扶梯顶', distanceM: between(lr, 'w-mouth', 'w-top'), detail: '提升折算' },
    { segment: '中央双向通道', distanceM: between(lr, 'passage-w', 'passage-e'), detail: '双向嵌套组' },
    { segment: '通道东口 → G3 闸机', distanceM: between(lr, 'passage-e', 'gate-g3'), detail: '闸机缓冲' },
    { segment: 'G3 → 东扶梯顶', distanceM: between(lr, 'gate-g3', 'e-top'), detail: '闸后汇流' },
    { segment: '东扶梯 → 5号线站台', distanceM: between(lr, 'e-top', 'p5-door'), detail: '下行及站台' },
    { segment: '上行方向合计', distanceM: lr.totalDistanceM, detail: 'LR 轨道' },
    { segment: '下行方向合计', distanceM: rl.totalDistanceM, detail: 'RL 轨道' },
  ];
}

export function buildConfirmationPackage(state: AppState): Record<string, unknown> {
  const checks = buildOperabilityChecks(state);
  const distances = distanceRows(state);
  return {
    packageName: '换乘流线早晚高峰动画与关键距离确认包',
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    dataBasis: '交通咨询高峰小时换乘量、流向（内置脱敏示例，可替换为项目咨询表）',
    timeline: {
      domainMin: state.durationMin,
      cellMin: state.cellMin,
      pmOffsetCells: state.pmOffsetCells,
      pmOffsetMin: state.pmOffsetCells * state.cellMin,
      syncRule: '播放从当前预览时间继续；预览时间与动画采样共用 timeMin',
    },
    keyDistancesM: distances,
    peaks: {
      am: {
        name: state.groups.am.name,
        clockStart: state.groups.am.clockStart,
        totalVolumePaxH: state.groups.am.totalVolumePaxH,
        tracks: state.groups.am.tracks,
      },
      pm: {
        name: state.groups.pm.name,
        clockStart: state.groups.pm.clockStart,
        totalVolumePaxH: state.groups.pm.totalVolumePaxH,
        tracks: state.groups.pm.tracks,
      },
    },
    nestedGroup: {
      id: 'passage-central',
      childLayer: 'passage-lanes',
      behavior: '早晚、上下行四条通道子层随父组和时间轴采样一起更新',
    },
    jamComparison: state.jam,
    operabilityChecks: checks,
    signoffs: state.signoffs,
    finalized: state.finalized,
    revisionLogs: state.logs,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const DECISION_TEXT: Record<string, string> = {
  pending: '待确认',
  operable: '确认可运营',
  conditional: '有条件可运营',
  rework: '需整改后复核',
};

export function buildHtmlReport(state: AppState): string {
  const pkg = buildConfirmationPackage(state);
  const distances = distanceRows(state);
  const checks = buildOperabilityChecks(state);
  const trackRows = (['am', 'pm'] as const).flatMap((peak) =>
    state.groups[peak].tracks.map(
      (track) => `
      <tr>
        <td>${peak === 'am' ? '早高峰' : '晚高峰'}</td>
        <td>${escapeHtml(track.name)}</td>
        <td>${escapeHtml(track.trainDirection)}</td>
        <td class="num">${track.baseVolumePaxH}</td>
        <td class="num"><b>${track.effectiveVolumePaxH}</b></td>
        <td class="num">${track.keyframes.length}</td>
        <td class="num">${track.durationMin.toFixed(2)}′</td>
        <td class="num">${track.totalDistanceM} m</td>
      </tr>`,
    ),
  );

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<title>换乘流线可运营性确认单</title>
<style>
body{font-family:"Microsoft YaHei",system-ui,sans-serif;margin:40px;color:#0f172a;line-height:1.55}
h1{margin:0 0 4px} h2{margin-top:32px;border-left:5px solid #1d4ed8;padding-left:10px}
.meta{color:#64748b} table{border-collapse:collapse;width:100%;font-size:13px;margin:12px 0}
th,td{border:1px solid #cbd5e1;padding:7px 9px;text-align:left;vertical-align:top}
th{background:#eff6ff}.num{text-align:right;font-variant-numeric:tabular-nums}
.pass{color:#15803d;font-weight:700}.watch{color:#b45309;font-weight:700}.fail{color:#b91c1c;font-weight:700}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:18px}.sign div{border:1px solid #94a3b8;border-radius:10px;padding:16px;min-height:130px}
.badge{display:inline-block;border-radius:999px;padding:3px 10px;background:#dbeafe;color:#1e40af;font-weight:700}
pre{white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px}
@media print{button{display:none}body{margin:18mm}}
</style></head><body>
<h1>换乘流线早晚高峰动画及关键换乘距离确认单</h1>
<p class="meta">导出时间：${escapeHtml(pkg.exportedAt)} ｜ 数据基础：${escapeHtml(pkg.dataBasis)}</p>
<p><span class="badge">${state.finalized ? '已定稿' : '待定稿'}</span> 晚高峰时间轴偏移：${state.pmOffsetCells} 格 / ${state.pmOffsetCells * state.cellMin} 分钟</p>

<h2>1. 两组流线动画轨道</h2>
<table><thead><tr><th>高峰组</th><th>轨道</th><th>方向/OD</th><th>咨询流量</th><th>重排后流量</th><th>关键帧</th><th>走查时长</th><th>距离</th></tr></thead>
<tbody>${trackRows.join('')}</tbody></table>
<p>完整关键帧时间、坐标、分段和动画 JSON 见同名 <code>.json</code> 确认包；可随附应用导出的 WebM 回放。</p>

<h2>2. 关键换乘距离</h2>
<table><thead><tr><th>关键段</th><th>距离</th><th>说明</th></tr></thead><tbody>
${distances.map((row) => `<tr><td>${escapeHtml(row.segment)}</td><td class="num"><b>${row.distanceM}</b> m</td><td>${escapeHtml(row.detail)}</td></tr>`).join('')}
</tbody></table>

<h2>3. 闸机卡顿叠帧</h2>
${
  state.jam
    ? `<p>${escapeHtml(state.jam.gateName)}：上一帧 ${state.jam.previous.totalPeople} 人，卡顿帧 ${state.jam.jam.totalPeople} 人，<b class="fail">增加 ${state.jam.deltaPeople} 人</b>。建议配置铁马、限流人员并复核闸机通行能力。</p>`
    : '<p>本次导出未保留卡顿叠帧结论。</p>'
}

<h2>4. 可运营性检查</h2>
<table><tbody>
${checks.map((check) => `<tr><td><b>${escapeHtml(check.label)}</b></td><td class="${check.status}">${check.status === 'pass' ? '通过' : check.status === 'watch' ? '关注' : '需整改'}</td><td>${escapeHtml(check.detail)}</td></tr>`).join('')}
</tbody></table>

<h2>5. 业主与运营方确认</h2>
<div class="sign">
  <div><b>业主方</b><br/>代表：${escapeHtml(state.signoffs.owner.name || '＿＿＿＿＿')}<br/>结论：${escapeHtml(DECISION_TEXT[state.signoffs.owner.decision] ?? state.signoffs.owner.decision)}<br/>意见：${escapeHtml(state.signoffs.owner.note || '＿＿＿＿＿＿＿＿＿＿')}<br/><br/>签字/日期：＿＿＿＿＿＿＿＿</div>
  <div><b>运营方</b><br/>代表：${escapeHtml(state.signoffs.operator.name || '＿＿＿＿＿')}<br/>结论：${escapeHtml(DECISION_TEXT[state.signoffs.operator.decision] ?? state.signoffs.operator.decision)}<br/>意见：${escapeHtml(state.signoffs.operator.note || '＿＿＿＿＿＿＿＿＿＿')}<br/><br/>签字/日期：＿＿＿＿＿＿＿＿</div>
</div>
<p><button onclick="window.print()">打印 / 另存 PDF</button></p>
<script id="confirmation-data" type="application/json">${escapeHtml(JSON.stringify(pkg))}</script>
</body></html>`;
}
