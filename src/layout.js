import { PAGE_PRESETS } from './store.js';

export const MM_PER_PX = 96 / 25.4;

export function pageOf(presetId) {
  return PAGE_PRESETS[presetId] || PAGE_PRESETS.A1L;
}

export function sheetPx(presetId) {
  const p = pageOf(presetId);
  return { width: p.wMm * MM_PER_PX, height: p.hMm * MM_PER_PX };
}

export function rectsOverlap(a, b, pad = 0) {
  return (
    a.x - pad < b.x + b.w + pad &&
    a.x + a.w + pad > b.x - pad &&
    a.y - pad < b.y + b.h + pad &&
    a.y + a.h + pad > b.y - pad
  );
}

function makeTemplateRects(area, gap, kind, fraction = 0.57) {
  const c = area;
  if (kind === 'hero-left') {
    const heroW = c.w * fraction;
    const sideW = c.w - heroW - gap;
    const h = (c.h - gap) / 2;
    return [
      { x: c.x, y: c.y, w: heroW, h: c.h },
      { x: c.x + heroW + gap, y: c.y, w: sideW, h },
      { x: c.x + heroW + gap, y: c.y + h + gap, w: sideW, h },
    ];
  }
  if (kind === 'hero-right') {
    const heroW = c.w * fraction;
    const sideW = c.w - heroW - gap;
    const h = (c.h - gap) / 2;
    const heroX = c.x + sideW + gap;
    return [
      { x: c.x, y: c.y, w: sideW, h },
      { x: c.x, y: c.y + h + gap, w: sideW, h },
      { x: heroX, y: c.y, w: heroW, h: c.h },
    ];
  }
  if (kind === 'hero-top') {
    const heroH = c.h * fraction;
    const bottomH = c.h - heroH - gap;
    const w = (c.w - gap) / 2;
    return [
      { x: c.x, y: c.y, w: c.w, h: heroH },
      { x: c.x, y: c.y + heroH + gap, w, h: bottomH },
      { x: c.x + w + gap, y: c.y + heroH + gap, w, h: bottomH },
    ];
  }
  if (kind === 'hero-bottom') {
    const heroH = c.h * fraction;
    const topH = c.h - heroH - gap;
    const w = (c.w - gap) / 2;
    return [
      { x: c.x, y: c.y + topH + gap, w: c.w, h: heroH },
      { x: c.x, y: c.y, w, h: topH },
      { x: c.x + w + gap, y: c.y, w, h: topH },
    ];
  }
  if (kind === 'grid-2x2') {
    const w = (c.w - gap) / 2;
    const h = (c.h - gap) / 2;
    return [
      { x: c.x, y: c.y, w, h },
      { x: c.x + w + gap, y: c.y, w, h },
      { x: c.x, y: c.y + h + gap, w, h },
    ];
  }
  if (kind === 'rows') {
    const h = (c.h - gap * 2) / 3;
    return [0, 1, 2].map((i) => ({ x: c.x, y: c.y + i * (h + gap), w: c.w, h }));
  }
  const w = (c.w - gap * 2) / 3;
  return [0, 1, 2].map((i) => ({ x: c.x + i * (w + gap), y: c.y, w, h: c.h }));
}

function validAgainstObstacles(rects, obstacles, pad) {
  return rects.every((r) => r.w > 40 && r.h > 30 && !obstacles.some((o) => rectsOverlap(r, o, pad)));
}

function fitNoteRect(candidate, obstacles, gap) {
  const minW = 90;
  const minH = 55;
  const pad = 0.5;
  const clearance = gap + 2;
  const clips = [candidate];
  obstacles.forEach((o) => {
    clips.forEach((r) => {
      if (!rectsOverlap(r, o, pad)) return;
      const rightClip = { ...r, w: o.x - clearance - r.x };
      const bottomClip = { ...r, h: o.y - clearance - r.y };
      const leftX = o.x + o.w + clearance;
      const leftClip = { ...r, x: leftX, w: r.x + r.w - leftX };
      const topY = o.y + o.h + clearance;
      const topClip = { ...r, y: topY, h: r.y + r.h - topY };
      [rightClip, bottomClip, leftClip, topClip].forEach((clip) => {
        if (clip.w >= minW && clip.h >= minH) clips.push(clip);
      });
    });
  });
  const valid = clips
    .filter((r) => r.w >= minW && r.h >= minH && !obstacles.some((o) => rectsOverlap(r, o, pad)))
    .sort((a, b) => b.w * b.h - a.w * a.h);
  return valid[0] || null;
}

function scoreRects(rects, templateIndex = 0, presetId = 'A1L') {
  const titleMm = presetId === 'A1L' ? 9 : 6;
  const mapAspect = 1400 / 900;
  let renderedArea = 0;
  let minRenderedSide = Infinity;
  let blankPenalty = 0;
  rects.forEach((r) => {
    const bodyH = Math.max(20, r.h - titleMm);
    const mapW = Math.min(r.w, bodyH * mapAspect);
    const mapH = Math.min(bodyH, r.w / mapAspect);
    renderedArea += mapW * mapH;
    minRenderedSide = Math.min(minRenderedSide, mapW, mapH);
    blankPenalty += Math.max(0, r.w * bodyH - mapW * mapH) * 0.35;
  });
  return renderedArea + minRenderedSide * 900 - blankPenalty - templateIndex * 12000;
}

function templateSolutions(content, obstacles, gap, presetId) {
  const solutions = [];
  const kinds = ['grid-2x2', 'hero-left', 'hero-right', 'hero-top', 'hero-bottom', 'rows', 'columns'];
  const fractions = [0.52, 0.58, 0.64];

  const areas = [{ area: content, label: 'content' }];

  const rightObs = obstacles.filter((o) => o.x > content.x + content.w * 0.52);
  if (rightObs.length === obstacles.length && rightObs.length) {
    const railX = Math.min(...rightObs.map((o) => o.x));
    areas.push({ area: { x: content.x, y: content.y, w: Math.max(120, railX - gap - content.x), h: content.h }, label: 'right-rail' });
  }
  const leftObs = obstacles.filter((o) => o.x + o.w < content.x + content.w * 0.48);
  if (leftObs.length === obstacles.length && leftObs.length) {
    const endX = Math.max(...leftObs.map((o) => o.x + o.w));
    areas.push({ area: { x: endX + gap, y: content.y, w: Math.max(120, content.x + content.w - endX - gap), h: content.h }, label: 'left-rail' });
  }
  const topObs = obstacles.filter((o) => o.y <= content.y + 1);
  if (topObs.length && topObs.length === obstacles.length) {
    const bottom = Math.max(...topObs.map((o) => o.y + o.h));
    areas.push({ area: { x: content.x, y: bottom + gap, w: content.w, h: Math.max(90, content.y + content.h - bottom - gap) }, label: 'below-top' });
  }
  const bottomObs = obstacles.filter((o) => o.y + o.h >= content.y + content.h - 1);
  if (bottomObs.length && bottomObs.length === obstacles.length) {
    const top = Math.min(...bottomObs.map((o) => o.y));
    areas.push({ area: { x: content.x, y: content.y, w: content.w, h: Math.max(90, top - gap - content.y) }, label: 'above-bottom' });
  }
  obstacles.forEach((o) => {
    const leftW = o.x - gap - content.x;
    if (leftW > 70) areas.push({ area: { x: content.x, y: content.y, w: leftW, h: content.h }, label: 'obstacle-left' });
    const rightX = o.x + o.w + gap;
    const rightW = content.x + content.w - rightX;
    if (rightW > 70) areas.push({ area: { x: rightX, y: content.y, w: rightW, h: content.h }, label: 'obstacle-right' });
    const topH = o.y - gap - content.y;
    if (topH > 70) areas.push({ area: { x: content.x, y: content.y, w: content.w, h: topH }, label: 'obstacle-top' });
    const bottomY = o.y + o.h + gap;
    const bottomH = content.y + content.h - bottomY;
    if (bottomH > 70) areas.push({ area: { x: content.x, y: bottomY, w: content.w, h: bottomH }, label: 'obstacle-bottom' });
  });

  areas.forEach(({ area }) => {
    kinds.forEach((kind, ki) => {
      fractions.forEach((f) => {
        const rects = makeTemplateRects(area, gap, kind, f);
        if (validAgainstObstacles(rects, obstacles, Math.max(1.5, gap * 0.35))) {
          let noteRect = null;
          if (kind === 'grid-2x2') {
            const w = (area.w - gap) / 2;
            const h = (area.h - gap) / 2;
            const candidate = { x: area.x + w + gap, y: area.y + h + gap, w, h };
            noteRect = fitNoteRect(candidate, obstacles, Math.max(1.5, gap * 0.35));
          }
          solutions.push({ rects, noteRect, score: scoreRects(rects, ki, presetId), engine: `template-${kind}` });
        }
      });
    });
  });
  return solutions;
}

function gridPack(content, obstacles, presetId, gap) {
  const isA1 = presetId === 'A1L';
  const cols = isA1 ? 18 : 10;
  const rows = isA1 ? 12 : 15;
  const xs = [content.x, content.x + content.w];
  const ys = [content.y, content.y + content.h];
  for (let i = 1; i < cols; i += 1) xs.push(content.x + (content.w * i) / cols);
  for (let i = 1; i < rows; i += 1) ys.push(content.y + (content.h * i) / rows);
  obstacles.forEach((o) => {
    if (o.x > content.x && o.x < content.x + content.w) xs.push(o.x);
    if (o.x + o.w > content.x && o.x + o.w < content.x + content.w) xs.push(o.x + o.w);
    if (o.y > content.y && o.y < content.y + content.h) ys.push(o.y);
    if (o.y + o.h > content.y && o.y + o.h < content.y + content.h) ys.push(o.y + o.h);
  });
  const ux = [...new Set(xs.map((v) => Math.round(v * 10) / 10))].sort((a, b) => a - b);
  const uy = [...new Set(ys.map((v) => Math.round(v * 10) / 10))].sort((a, b) => a - b);
  const minW = isA1 ? 145 : 76;
  const minH = isA1 ? 92 : 54;
  const candidates = [];
  const inset = gap / 2;

  for (let i = 0; i < ux.length - 1; i += 1) {
    for (let j = i + 1; j < ux.length; j += 1) {
      const rawW = ux[j] - ux[i];
      if (rawW < minW + gap) continue;
      for (let k = 0; k < uy.length - 1; k += 1) {
        for (let l = k + 1; l < uy.length; l += 1) {
          const rawH = uy[l] - uy[k];
          if (rawH < minH + gap) continue;
          const rect = { x: ux[i] + inset, y: uy[k] + inset, w: rawW - gap, h: rawH - gap };
          if (rect.w < minW || rect.h < minH) continue;
          if (obstacles.some((o) => rectsOverlap(rect, o, 2))) continue;
          const aspect = rect.w / rect.h;
          const aspectScore = Math.max(0, 1 - Math.min(1, Math.abs(Math.log(aspect / 1.45)) / 1.1));
          candidates.push({ rect, score: rect.w * rect.h * (0.72 + aspectScore * 0.55) });
        }
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, isA1 ? 150 : 110);
  let best = null;
  for (let i = 0; i < Math.min(top.length, 70); i += 1) {
    for (let j = 0; j < Math.min(top.length, 70); j += 1) {
      if (rectsOverlap(top[i].rect, top[j].rect, gap)) continue;
      for (let k = 0; k < Math.min(top.length, 140); k += 1) {
        if (rectsOverlap(top[i].rect, top[k].rect, gap)) continue;
        if (rectsOverlap(top[j].rect, top[k].rect, gap)) continue;
        const score = top[i].score + top[j].score + top[k].score;
        if (!best || score > best.score) best = { score, rects: [top[i].rect, top[j].rect, top[k].rect], engine: 'grid-pack' };
      }
    }
  }
  if (!best) {
    const rects = makeTemplateRects(content, gap, 'hero-left', 0.58);
    best = { rects, score: 0, engine: 'fallback' };
  }
  best.rects.sort((a, b) => b.w * b.h - a.w * a.h);
  return best;
}

function solveMaps(content, obstacles, presetId, gap) {
  const template = templateSolutions(content, obstacles, gap, presetId).sort((a, b) => b.score - a.score)[0];
  if (template?.score > 0) return template;
  return gridPack(content, obstacles, presetId, gap);
}

export function solvePoster(project, measured = {}) {
  const preset = pageOf(project.layout.preset);
  const isA1 = preset.id === 'A1L';
  const gap = isA1 ? 6 : 3.2;
  const content = {
    x: preset.marginMm,
    y: preset.marginMm + preset.headerMm,
    w: preset.wMm - preset.marginMm * 2,
    h: preset.hMm - preset.marginMm * 2 - preset.headerMm - preset.footerMm,
  };

  const tableSize = measured.table || (isA1 ? { w: 188, h: 104 } : { w: 88, h: 78 });
  const legendSize = measured.legend || (isA1 ? { w: 142, h: 214 } : { w: 82, h: 188 });

  let tableRect;
  const lx = project.layout.tableNX;
  const ly = project.layout.tableNY;
  if (lx === null || lx === undefined || ly === null || ly === undefined) {
    tableRect = {
      x: content.x + content.w - tableSize.w,
      y: content.y + content.h - tableSize.h,
      w: tableSize.w,
      h: tableSize.h,
    };
  } else {
    tableRect = {
      x: content.x + Math.max(0, Math.min(1, lx)) * Math.max(0, content.w - tableSize.w),
      y: content.y + Math.max(0, Math.min(1, ly)) * Math.max(0, content.h - tableSize.h),
      w: tableSize.w,
      h: tableSize.h,
    };
  }

  const legendCandidates = [
    { id: 'tr', x: content.x + content.w - legendSize.w, y: content.y },
    { id: 'tl', x: content.x, y: content.y },
    { id: 'br', x: content.x + content.w - legendSize.w, y: content.y + content.h - legendSize.h },
    { id: 'bl', x: content.x, y: content.y + content.h - legendSize.h },
  ].map((r) => ({ ...r, w: legendSize.w, h: legendSize.h }));

  let best = null;
  legendCandidates.forEach((legendRect, index) => {
    if (rectsOverlap(legendRect, tableRect, 2.5)) return;
    const maps = solveMaps(content, [tableRect, legendRect], preset.id, gap);
    const score = maps.score - index * 50000;
    if (!best || score > best.score) best = { legendRect, maps, score };
  });

  if (!best) {
    const legendRect = { ...legendCandidates[0], y: content.y };
    const maps = solveMaps(content, [tableRect], preset.id, gap);
    best = { legendRect, maps, score: -1 };
  }

  const [zone, aeration, feeding] = best.maps.rects;
  return {
    preset,
    content,
    gap,
    tableRect,
    legendRect: best.legendRect,
    mapRects: { zone, aeration, feeding },
    noteRect: best.maps.noteRect || null,
    engine: best.maps.engine,
  };
}
