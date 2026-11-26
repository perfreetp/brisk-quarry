// 布置图导出：Canvas 2D 俯视平面图，含场地尺寸、通道宽度、同类物件间距标注
import { OBJ_TYPES, TYPE_ORDER, CORRIDOR_BUFFER } from './types';
import { eff } from './store';
import { centerLineGap } from './layout';

function dimLine(ctx, x1, y1, x2, y2, text, invScale, color = '#374151') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = invScale;
  ctx.font = `${13 * invScale}px Microsoft YaHei`;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const ah = 2.2 * invScale * 0.5;
  for (const [x, y, dir] of [
    [x1, y1, ang],
    [x2, y2, ang + Math.PI],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(dir - 0.45) * ah * 2, y + Math.sin(dir - 0.45) * ah * 2);
    ctx.lineTo(x + Math.cos(dir + 0.45) * ah * 2, y + Math.sin(dir + 0.45) * ah * 2);
    ctx.closePath();
    ctx.fill();
  }
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  ctx.save();
  ctx.translate(mx, my);
  let t = ang;
  if (t > Math.PI / 2 || t < -Math.PI / 2) t += Math.PI;
  ctx.rotate(t);
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(-tw / 2 - 4 * invScale, -10 * invScale, tw + 8 * invScale, 20 * invScale);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.restore();
}

export function exportBlueprint(params, objects, { autoDownload = true } = {}) {
  const W = 1680;
  const sidePad = 90; // 左右留白（放竖向尺寸标注）
  const titleH = 100; // 标题区
  const planAreaH = 640; // 平面图区域上限
  const legendH = 110; // 图例/比例尺区
  const bottomPad = 30;

  const planW = W - sidePad * 2;
  const scale = Math.min(planW / params.width, planAreaH / params.depth);
  const drawW = params.width * scale;
  const drawH = params.depth * scale;
  const H = Math.ceil(titleH + planAreaH + legendH + bottomPad);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const inv = 1 / scale;

  // ---- 标题区 ----
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 34px Microsoft YaHei';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('应急演练场地布置图', 40, 48);
  ctx.font = '18px Microsoft YaHei';
  ctx.fillStyle = '#4b5563';
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const summary =
    `场地 ${params.width}m × ${params.depth}m ｜ 主通道：${params.corridorDir === 'x' ? '东西向' : '南北向'}，宽 ${params.corridorWidth}m` +
    ` ｜ 种子：${params.seed} ｜ 出图日期：${dateStr}`;
  ctx.fillText(summary, 40, 82);

  // ---- 平面图坐标系（世界坐标 x→右，z→下） ----
  // 注意：平移原点对应世界原点（场地中心），所以要对齐平面图区域的中心，不是上边缘
  const ox = sidePad + planW / 2;
  const oy = titleH + planAreaH / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.lineWidth = inv;

  // 场地
  ctx.fillStyle = '#e8e2d3';
  ctx.fillRect(-params.width / 2, -params.depth / 2, params.width, params.depth);
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 2.5 * inv;
  ctx.strokeRect(-params.width / 2, -params.depth / 2, params.width, params.depth);

  // 主通道
  const cw = params.corridorDir === 'x' ? params.width : params.corridorWidth;
  const cd = params.corridorDir === 'x' ? params.corridorWidth : params.depth;
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(-cw / 2, -cd / 2, cw, cd);
  ctx.save();
  ctx.fillStyle = '#f5d76e';
  ctx.font = `bold ${16 * inv}px Microsoft YaHei`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`主通道 ${params.corridorWidth}m`, 0, 0);
  ctx.restore();

  // 物件
  const placed = objects.filter((o) => !o.unplaced);
  for (const obj of placed) {
    const e = eff(obj);
    const meta = OBJ_TYPES[obj.type];
    ctx.save();
    ctx.translate(e.x, e.z);
    ctx.rotate(e.rot);
    const css = meta.cssColor;
    ctx.fillStyle = css;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = inv;
    if (obj.type === 'post') {
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(e.w, e.d) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-e.w / 2, -e.d / 2, e.w, e.d);
      ctx.strokeRect(-e.w / 2, -e.d / 2, e.w, e.d);
    }
    ctx.restore();

    // 名称
    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.font = `${11 * inv}px Microsoft YaHei`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = e.z - (e.d / 2 + 3.2 * inv);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const tw = ctx.measureText(obj.name).width;
    ctx.fillRect(e.x - tw / 2 - 2 * inv, labelY - 7 * inv, tw + 4 * inv, 14 * inv);
    ctx.fillStyle = '#111827';
    ctx.fillText(obj.name, e.x, labelY);
    if (obj.manual) {
      ctx.fillStyle = '#b45309';
      ctx.font = `bold ${12 * inv}px Microsoft YaHei`;
      ctx.fillText('◆改', e.x + tw / 2 + 5 * inv, labelY);
    }
    ctx.restore();
  }

  // ---- 场地尺寸标注 ----
  const { width, depth, corridorWidth, corridorDir } = params;
  dimLine(ctx, -width / 2, depth / 2 + 8 * inv, width / 2, depth / 2 + 8 * inv, `场地长度 ${width}m`, inv);
  dimLine(ctx, -width / 2 - 8 * inv, -depth / 2, -width / 2 - 8 * inv, depth / 2, `场地宽度 ${depth}m`, inv);

  // ---- 通道宽度标注 ----
  if (corridorDir === 'x') {
    dimLine(ctx, width / 2 + 8 * inv, -corridorWidth / 2, width / 2 + 8 * inv, corridorWidth / 2, `通道宽 ${corridorWidth}m`, inv, '#b45309');
  } else {
    dimLine(ctx, -corridorWidth / 2, depth / 2 + 8 * inv, corridorWidth / 2, depth / 2 + 8 * inv, `通道宽 ${corridorWidth}m`, inv, '#b45309');
  }

  // ---- 同类物件间距标注（每类取最近一对） ----
  for (const type of TYPE_ORDER) {
    const list = placed.filter((o) => o.type === type).map((o) => ({ obj: o, r: eff(o) }));
    if (list.length < 2) continue;
    let best = null;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = Math.hypot(list[i].r.x - list[j].r.x, list[i].r.z - list[j].r.z);
        if (!best || d < best.d) best = { a: list[i].r, b: list[j].r, d };
      }
    }
    const gap = centerLineGap(best.a, best.b);
    const mx = (best.a.x + best.b.x) / 2;
    const my = (best.a.z + best.b.z) / 2;
    dimLine(
      ctx,
      best.a.x,
      best.a.z,
      best.b.x,
      best.b.z,
      `${OBJ_TYPES[type].label}同类净距 ≥${OBJ_TYPES[type].spacing}m（实测 ${gap.toFixed(1)}m）`,
      inv,
      '#1d4ed8'
    );
    void mx;
    void my;
  }

  // 指北针
  ctx.save();
  ctx.translate(width / 2 - 7 * inv, -depth / 2 + 7 * inv);
  ctx.fillStyle = '#1f2937';
  ctx.font = `bold ${14 * inv}px Microsoft YaHei`;
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -5 * inv);
  ctx.beginPath();
  ctx.moveTo(0, -3.5 * inv);
  ctx.lineTo(2 * inv, 2 * inv);
  ctx.lineTo(0, 0.8 * inv);
  ctx.lineTo(-2 * inv, 2 * inv);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // ---- 图例与统计（屏幕坐标系） ----
  const fy = titleH + planAreaH + 34;
  ctx.font = '16px Microsoft YaHei';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1f2937';
  let lx = 40;
  for (const type of TYPE_ORDER) {
    const meta = OBJ_TYPES[type];
    const n = placed.filter((o) => o.type === type).length;
    ctx.fillStyle = meta.cssColor;
    ctx.fillRect(lx, fy - 13, 20, 20);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeRect(lx, fy - 13, 20, 20);
    ctx.fillStyle = '#1f2937';
    ctx.fillText(`${meta.label} ×${n}（占地 ${meta.w}×${meta.d}m，间距≥${meta.spacing}m）`, lx + 28, fy + 3);
    lx += ctx.measureText(`${meta.label} ×${n}（占地 ${meta.w}×${meta.d}m，间距≥${meta.spacing}m）`).width + 34;
  }
  ctx.fillStyle = '#6b7280';
  ctx.font = '14px Microsoft YaHei';
  ctx.fillText(
    `规则：同类物件按设定间距排布，物件距通道净距≥${CORRIDOR_BUFFER}m，◆改 表示手动调整过的物件；比例 1:${Math.round(1 / scale)}（图上 ${(10 * scale).toFixed(0)}px = 实地 10m）`,
    40,
    fy + 40
  );
  // 比例尺
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 2;
  const sx = W - 200;
  const sy = fy;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + 10 * scale, sy);
  ctx.moveTo(sx, sy - 6);
  ctx.lineTo(sx, sy + 6);
  ctx.moveTo(sx + 10 * scale, sy - 6);
  ctx.lineTo(sx + 10 * scale, sy + 6);
  ctx.stroke();
  ctx.fillStyle = '#1f2937';
  ctx.font = '14px Microsoft YaHei';
  ctx.textAlign = 'center';
  ctx.fillText('10m', sx + 5 * scale, sy + 24);

  const url = cv.toDataURL('image/png');
  if (autoDownload) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `应急演练场地布置图_${params.seed}.png`;
    a.click();
  }
  return { canvas: cv, dataUrl: url };
}
