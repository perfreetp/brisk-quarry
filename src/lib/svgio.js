// 矢量导出/导入:SVG 内嵌结构数据,导出去再导回来,折线和标注仍可单独选中编辑
import { approachMetrics, REF_TYPES } from './model.js';
import { ticksAlongPolyline, yardageTier, formatYards } from './geometry.js';

const NS = 'http://www.w3.org/2000/svg';
const META_ID = 'golf-yardage-data';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function ptsAttr(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 2) out.push(`${points[i]},${points[i + 1]}`);
  return out.join(' ');
}

// 单个洞的几何 → SVG 片段(在洞局部坐标系,单位码)
export function holeToSVG(hole, { withLabels = true, withTicks = true } = {}) {
  const parts = [];
  parts.push(`<g data-hole-id="${esc(hole.id)}" transform="translate(${hole.offset.x} ${hole.offset.y})">`);
  if (hole.centerline.length >= 4) {
    parts.push(`<polyline data-type="centerline" points="${ptsAttr(hole.centerline)}" fill="none" stroke="#8a8a8a" stroke-width="1.2" stroke-dasharray="6 4"/>`);
  }
  if (hole.green.length >= 6) {
    parts.push(`<polygon data-type="green" points="${ptsAttr(hole.green)}" fill="#7fc97f" fill-opacity="0.5" stroke="#2d6a2d" stroke-width="1.5"/>`);
  }
  for (const rl of hole.refLines) {
    const c = (REF_TYPES[rl.type] || {}).color || '#999';
    parts.push(`<polyline data-type="refline" data-ref="${esc(rl.type)}" points="${ptsAttr(rl.points)}" fill="none" stroke="${c}" stroke-width="2"/>`);
  }
  if (withTicks && hole.centerline.length >= 4) {
    for (const t of ticksAlongPolyline(hole.centerline, hole.tickInterval)) {
      parts.push(`<g data-type="tick"><line x1="${t.x - 4}" y1="${t.y}" x2="${t.x + 4}" y2="${t.y}" stroke="#b05" stroke-width="0.8"/><text x="${t.x + 5}" y="${t.y - 2}" font-size="7" fill="#b05">${t.yard}</text></g>`);
    }
  }
  for (const lz of hole.landings) {
    parts.push(`<g data-type="landing" transform="translate(${lz.x} ${lz.y}) rotate(${lz.rotation} ${lz.w / 2} ${lz.h / 2})"><rect width="${lz.w}" height="${lz.h}" fill="#ffd24d" fill-opacity="0.35" stroke="#b8860b" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${lz.w / 2}" y="${lz.h / 2}" font-size="9" text-anchor="middle" dominant-baseline="middle" fill="#7a5b00">HCP ${lz.targetHandicap} · ${esc(lz.wind)}</text></g>`);
  }
  if (hole.approach.points.length >= 4) {
    parts.push(`<polyline data-type="approach" points="${ptsAttr(hole.approach.points)}" fill="none" stroke="#d62728" stroke-width="2.5"/>`);
  }
  if (withLabels) {
    const metrics = approachMetrics(hole);
    metrics.forEach((m, i) => {
      const tier = yardageTier(m.fromTee);
      const key = `ap_${i}`;
      const mo = hole.labelManual[key] || { dx: 0, dy: 0 };
      const lx = m.x + 6 + mo.dx, ly = m.y - 8 + mo.dy;
      const bits = [`${tier.text}y`];
      if (m.toGreen !== null) bits.push(`余${formatYards(m.toGreen)}`);
      if (m.toHazard !== null) bits.push(`障${formatYards(m.toHazard)}`);
      if (m.angle !== null) bits.push(`${m.angle}°`);
      parts.push(`<text data-type="label" data-label-key="${key}" x="${lx}" y="${ly}" font-size="${tier.fontSize * 0.7}" fill="#111">${esc(bits.join(' '))}</text>`);
    });
  }
  parts.push(`<text data-type="hole-name" x="0" y="-30" font-size="14" font-weight="bold" fill="#111">#${hole.number} ${esc(hole.name)} · Par ${hole.par}</text>`);
  parts.push('</g>');
  return parts.join('\n');
}

// 整版导出:所有洞 + 内嵌 JSON 结构
export function exportSVG(holes) {
  const minX = Math.min(...holes.map((h) => h.offset.x), 0) - 60;
  const minY = Math.min(...holes.map((h) => h.offset.y), 0) - 80;
  const maxX = Math.max(...holes.map((h) => h.offset.x + 400), 400);
  const maxY = Math.max(...holes.map((h) => h.offset.y + 500), 500);
  const payload = JSON.stringify({ app: 'golf-yardage-annotator', version: 1, holes });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${NS}" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}">
<metadata id="${META_ID}"><![CDATA[${payload}]]></metadata>
<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#f4f7f0"/>
${holes.map((h) => holeToSVG(h)).join('\n')}
</svg>`;
}

// 码数本单页导出(A4 竖版比例的独立 SVG)
export function exportBookPageSVG(hole) {
  const W = 794, H = 1123; // A4 @96dpi
  const metrics = approachMetrics(hole);
  const rows = metrics.map((m, i) => {
    const y = 640 + i * 26;
    return `<text x="60" y="${y}" font-size="13" fill="#111">P${i + 1}</text>
<text x="140" y="${y}" font-size="13" fill="#111">${formatYards(m.fromTee)} y</text>
<text x="260" y="${y}" font-size="13" fill="#111">${m.toGreen === null ? '—' : formatYards(m.toGreen) + ' y'}</text>
<text x="400" y="${y}" font-size="13" fill="#111">${m.toHazard === null ? '—' : formatYards(m.toHazard) + ' y'}</text>
<text x="540" y="${y}" font-size="13" fill="#111">${m.angle === null ? '—' : m.angle + '°'}</text>`;
  }).join('\n');
  const lzRows = hole.landings.map((lz, i) =>
    `<text x="60" y="${660 + metrics.length * 26 + i * 24}" font-size="12" fill="#333">落球区 ${i + 1}:目标差点 ${lz.targetHandicap} · 风向 ${esc(lz.wind)} · ${Math.round(lz.w)}×${Math.round(lz.h)} y</text>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<metadata id="${META_ID}"><![CDATA[${JSON.stringify({ app: 'golf-yardage-annotator', version: 1, holes: [hole] })}]]></metadata>
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="60" y="70" font-size="28" font-weight="bold" fill="#111">HOLE ${hole.number} · ${esc(hole.name)}</text>
<text x="60" y="100" font-size="15" fill="#444">Par ${hole.par} · 差点 ${hole.handicap}</text>
<g transform="translate(220 140) scale(0.9)">${holeToSVG(hole)}</g>
<g font-weight="bold" font-size="13" fill="#333">
<text x="60" y="610">点位</text><text x="140" y="610">距发球台</text><text x="260" y="610">距果岭前沿</text><text x="400" y="610">最近障碍</text><text x="540" y="610">进攻角度</text>
</g>
<line x1="60" y1="620" x2="700" y2="620" stroke="#999"/>
${rows}
${lzRows}
</svg>`;
}

// 导入:从 SVG 文本或 JSON 文本还原结构
export function importVectorFile(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const obj = JSON.parse(trimmed);
    if (!obj.holes) throw new Error('JSON 中缺少 holes');
    return obj.holes;
  }
  const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
  const meta = doc.getElementById(META_ID);
  if (!meta || !meta.textContent.trim()) throw new Error('SVG 中未找到内嵌结构数据(metadata)');
  const obj = JSON.parse(meta.textContent.trim());
  if (!obj.holes) throw new Error('metadata 中缺少 holes');
  return obj.holes;
}

export function download(filename, text, mime = 'image/svg+xml') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
