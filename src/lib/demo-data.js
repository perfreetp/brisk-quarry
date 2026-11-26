// 合成演示数据：同一礁区多期「正射底图 + 白化色块」。
// 真实使用时由导入流程替换为各期正射图（Image）与白化斑块 GeoJSON/多边形数据，
// 数据结构保持不变（period.ortho 为画布底图来源，period.patches 为带 bleaching 值的多边形）。

export const REEF_W = 1000;
export const REEF_H = 700;

export const BLEACH_BINS = [
  { level: 0, label: '正常', color: '#2e8b6f' },
  { level: 1, label: '轻度白化', color: '#c9d66a' },
  { level: 2, label: '中度白化', color: '#e8a24a' },
  { level: 3, label: '重度白化', color: '#d9532b' },
  { level: 4, label: '死亡', color: '#f2f2ea' }
];

// 默认色标档位阈值（5 档 4 个阈值），各期关键帧可分别调整
export const DEFAULT_THRESHOLDS = [0.15, 0.35, 0.55, 0.75];

// 监测期次（同一礁区，按监测日期排序）
export const DEMO_PERIOD_META = [
  { id: 'p1', name: '第一期', date: '2025-03-12' },
  { id: 'p2', name: '第二期', date: '2025-06-08' },
  { id: 'p3', name: '第三期', date: '2025-09-15' },
  { id: 'p4', name: '第四期', date: '2025-12-02' },
  { id: 'p5', name: '第五期', date: '2026-03-20' }
];

// 固定斑块位置：同一批礁体斑块跨期可比，白化值随期次演变
const PATCH_DEFS = buildPatchDefs();

function buildPatchDefs() {
  const defs = [];
  const cols = 7;
  const rows = 5;
  const cellW = REEF_W / cols;
  const cellH = REEF_H / rows;
  let n = 0;
  // 简单确定性伪随机
  let seed = 20250312;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = cellW * (c + 0.5) + (rand() - 0.5) * 40;
      const cy = cellH * (r + 0.5) + (rand() - 0.5) * 40;
      const rad = 34 + rand() * 30;
      const pts = [];
      const verts = 9;
      for (let k = 0; k < verts; k++) {
        const ang = (k / verts) * Math.PI * 2;
        const rr = rad * (0.72 + rand() * 0.42);
        pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.82]);
      }
      // 白化基础值：右上区域（迎风向）更脆弱，随期次上升
      const base = (c / cols) * 0.35 + (1 - r / rows) * 0.18 + rand() * 0.12;
      defs.push({ id: `patch-${n++}`, points: pts, base });
    }
  }
  return defs;
}

/** 各期白化值：基础值随期次加深，并在第 3→4 期出现一次加速（对应过渡拉长的叙事点） */
function bleachingValue(def, periodIndex) {
  const growth = [0.0, 0.1, 0.22, 0.5, 0.62][periodIndex] ?? periodIndex * 0.15;
  return Math.min(0.98, def.base * 0.55 + growth);
}

/** 生成一张正射风格底图（canvas → dataURL，Konva.Image 可直接使用） */
export function makeOrthoCanvas(periodIndex) {
  const canvas = document.createElement('canvas');
  canvas.width = REEF_W;
  canvas.height = REEF_H;
  const ctx = canvas.getContext('2d');

  // 海水深浅渐变
  const g = ctx.createLinearGradient(0, 0, REEF_W, REEF_H);
  g.addColorStop(0, '#0d3b57');
  g.addColorStop(1, '#155e75');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, REEF_W, REEF_H);

  // 礁盘底（浅色大片），各期位置一致、色调微变
  let seed = 99171 + periodIndex * 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  ctx.fillStyle = 'rgba(120, 160, 150, 0.28)';
  ctx.beginPath();
  ctx.ellipse(REEF_W * 0.5, REEF_H * 0.52, REEF_W * 0.42, REEF_H * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 沙纹/珊瑚纹理
  for (let i = 0; i < 260; i++) {
    const x = rand() * REEF_W;
    const y = rand() * REEF_H;
    const rr = 1 + rand() * 3.5;
    ctx.fillStyle = `rgba(210, 225, 220, ${0.05 + rand() * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** 生成完整演示项目数据（在浏览器环境调用，需要 document.createElement） */
export function buildDemoProject() {
  const periods = DEMO_PERIOD_META.map((meta, i) => ({
    ...meta,
    ortho: makeOrthoCanvas(i).toDataURL('image/png'),
    patches: PATCH_DEFS.map((d) => ({
      id: d.id,
      points: d.points,
      bleaching: bleachingValue(d, i)
    })),
    key: {
      // 显示范围：礁区坐标空间下的视窗（x,y,w,h）
      view: { x: 40, y: 30, w: REEF_W - 80, h: REEF_H - 60 },
      scale: { thresholds: [...DEFAULT_THRESHOLDS] },
      committedAt: null
    },
    annotations: []
  }));

  return {
    reef: { width: REEF_W, height: REEF_H, bins: BLEACH_BINS },
    periods,
    // 相邻期轨道默认编为一组；第三期→第四期先给一个偏短的过渡，供后续「拉长」演示
    groups: [
      { id: 'g1', name: '一组（1-2期）', periodIds: ['p1', 'p2'], transitionMs: 1200 },
      { id: 'g2', name: '二组（2-3期）', periodIds: ['p2', 'p3'], transitionMs: 1200 },
      { id: 'g3', name: '三组（3-4期）', periodIds: ['p3', 'p4'], transitionMs: 700 },
      { id: 'g4', name: '四组（4-5期）', periodIds: ['p4', 'p5'], transitionMs: 1200 }
    ]
  };
}
