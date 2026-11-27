import * as fabric from 'fabric';
import {
  WORLD_H,
  WORLD_W,
  PX_PER_M,
  SPECIES_META,
  state,
} from './store.js';

const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",system-ui,sans-serif';

export function hexToRgba(hex, alpha = 1) {
  const value = String(hex).replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const uploadedImageCache = new Map();

function getUploadedImage(dataUrl) {
  if (!dataUrl) return null;
  const cached = uploadedImageCache.get(dataUrl);
  if (cached?.complete && cached.naturalWidth > 0) return cached;
  if (!cached) {
    const img = new Image();
    img.onload = () => uploadedImageCache.set(dataUrl, img);
    img.src = dataUrl;
    uploadedImageCache.set(dataUrl, img);
  }
  return cached?.complete && cached.naturalWidth > 0 ? cached : null;
}

export function ensureBasemapReady(project, onReady) {
  const dataUrl = project.basemap?.dataUrl;
  if (!dataUrl) return;
  const img = getUploadedImage(dataUrl);
  if (img) return;
  const existing = uploadedImageCache.get(dataUrl);
  const target = existing || new Image();
  if (!existing) {
    target.onload = () => {
      uploadedImageCache.set(dataUrl, target);
      onReady?.();
    };
    target.src = dataUrl;
    uploadedImageCache.set(dataUrl, target);
  } else {
    target.addEventListener?.('load', () => onReady?.(), { once: true });
  }
}

export function createBasemapCanvas(project) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(20261127);

  const bg = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
  bg.addColorStop(0, '#587044');
  bg.addColorStop(0.45, '#6f8050');
  bg.addColorStop(1, '#425f3d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // 航拍正射里的田块、林地与裸地斑块
  const patchColors = ['#71834e', '#8a8a55', '#657a48', '#9a8b5e', '#536d42', '#789058', '#806f4d'];
  for (let i = 0; i < 210; i += 1) {
    const x = rand() * WORLD_W;
    const y = rand() * WORLD_H;
    const w = 20 + rand() * 120;
    const h = 14 + rand() * 90;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rand() - 0.5) * 0.28);
    ctx.globalAlpha = 0.18 + rand() * 0.22;
    ctx.fillStyle = patchColors[Math.floor(rand() * patchColors.length)];
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // 主干道和灌溉渠
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(196,176,126,.72)';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(30, 415);
  ctx.lineTo(1370, 415);
  ctx.moveTo(700, 70);
  ctx.lineTo(700, 835);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(35,91,104,.55)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(20, 805);
  ctx.bezierCurveTo(300, 780, 520, 835, 760, 805);
  ctx.bezierCurveTo(980, 780, 1160, 820, 1380, 790);
  ctx.stroke();

  // 按塘口坐标画水面，使示意正射与测距塘埂一致
  project.ponds.forEach((pond, index) => {
    ctx.beginPath();
    pond.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    const xs = pond.points.map((p) => p.x);
    const ys = pond.points.map((p) => p.y);
    const g = ctx.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    const waterColors = [
      ['#2c7778', '#3f9290'],
      ['#276b80', '#3b8da0'],
      ['#347a68', '#4d9b83'],
      ['#397b8e', '#55a3ad'],
    ][index % 4];
    g.addColorStop(0, waterColors[0]);
    g.addColorStop(1, waterColors[1]);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.86;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(198,174,116,.95)';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(72,55,31,.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // 树冠颗粒与航拍噪声
  for (let i = 0; i < 1500; i += 1) {
    const x = rand() * WORLD_W;
    const y = rand() * WORLD_H;
    const r = 1 + rand() * 4.5;
    ctx.fillStyle = rand() > 0.45 ? 'rgba(28,70,35,.34)' : 'rgba(126,150,78,.28)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const imageData = ctx.getImageData(0, 0, WORLD_W, WORLD_H);
  for (let i = 0; i < imageData.data.length; i += 4 * 18) {
    const n = (rand() - 0.5) * 18;
    imageData.data[i] += n;
    imageData.data[i + 1] += n;
    imageData.data[i + 2] += n;
  }
  ctx.putImageData(imageData, 0, 0);

  const uploaded = getUploadedImage(project.basemap?.dataUrl);
  if (uploaded) {
    ctx.save();
    const scale = Math.max(WORLD_W / uploaded.naturalWidth, WORLD_H / uploaded.naturalHeight);
    const w = uploaded.naturalWidth * scale;
    const h = uploaded.naturalHeight * scale;
    ctx.globalAlpha = 0.96;
    ctx.drawImage(uploaded, (WORLD_W - w) / 2, (WORLD_H - h) / 2, w, h);
    ctx.restore();
  }

  return canvas;
}

function centeredGeometry(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { cx, cy, rel: points.map((p) => ({ x: p.x - cx, y: p.y - cy })) };
}

function makePolygon(points, options) {
  const { cx, cy, rel } = centeredGeometry(points);
  return new fabric.Polygon(rel, {
    left: cx,
    top: cy,
    originX: 'center',
    originY: 'center',
    ...options,
  });
}

function makePolyline(points, options) {
  const { cx, cy, rel } = centeredGeometry(points);
  return new fabric.Polyline(rel, {
    left: cx,
    top: cy,
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    ...options,
  });
}

function labelText(text, left, top, options = {}) {
  return new fabric.Text(text, {
    left,
    top,
    originX: 'center',
    originY: 'center',
    fontFamily: FONT,
    paintFirst: 'stroke',
    stroke: 'rgba(255,255,255,.92)',
    strokeWidth: options.halo === false ? 0 : 4,
    strokeLineJoin: 'round',
    ...options,
  });
}

function tagObject(obj, kind, id) {
  obj.kind = kind;
  obj.refId = id;
  return obj;
}

function addPondScene(canvas, project, mode, interactive, selectedId) {
  const layers = project.layers;
  if (!layers.ponds) return;
  project.ponds.forEach((pond) => {
    const meta = SPECIES_META[pond.species] || SPECIES_META.mixed;
    const selected = selectedId === pond.id;
    const fillAlpha = mode === 'zone' ? 0.3 : 0.12;
    const poly = tagObject(
      makePolygon(pond.points, {
        fill: hexToRgba(meta.color, fillAlpha),
        stroke: selected ? '#f59e0b' : meta.color,
        strokeWidth: selected ? 5 : 2.2,
        strokeLineJoin: 'round',
        selectable: interactive && mode === 'zone',
        evented: interactive && mode === 'zone',
        hasControls: false,
        lockMovementX: true,
        lockMovementY: true,
        hoverCursor: 'pointer',
      }),
      'pond',
      pond.id,
    );
    canvas.add(poly);

    if (layers.labels) {
      const xs = pond.points.map((p) => p.x);
      const ys = pond.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const width = maxX - minX;
      const height = maxY - minY;
      const scale = Math.max(0.62, Math.min(1.05, Math.min(width / 260, height / 230)));
      const strong = mode === 'zone';
      const pondCages = project.cages.filter((c) => c.pondId === pond.id);

      if (!strong) {
        canvas.add(labelText(pond.code, cx, minY + 25 * scale, {
          fontSize: 22 * scale,
          fontWeight: 900,
          fill: '#0f172a',
          strokeWidth: 5 * scale,
          selectable: false,
          evented: false,
        }));
      } else if (pondCages.length) {
        canvas.add(labelText(pond.code, cx, minY + 27 * scale, {
          fontSize: 25 * scale,
          fontWeight: 800,
          fill: '#0f172a',
          strokeWidth: 5 * scale,
          selectable: false,
          evented: false,
        }));
        canvas.add(labelText(`${meta.label} · ${pond.spec}`, cx, maxY - 43 * scale, {
          fontSize: 14 * scale,
          fontWeight: 700,
          fill: '#1e293b',
          strokeWidth: 3.5 * scale,
          selectable: false,
          evented: false,
        }));
        canvas.add(labelText(`${pond.areaMu} 亩 · ${pond.density.toLocaleString('zh-CN')}${pond.densityUnit}`, cx, maxY - 21 * scale, {
          fontSize: 14.5 * scale,
          fontWeight: 800,
          fill: meta.color,
          strokeWidth: 3.5 * scale,
          selectable: false,
          evented: false,
        }));
      } else {
      canvas.add(labelText(pond.code, cx, cy - 27 * scale, {
        fontSize: 27 * scale,
        fontWeight: 800,
        fill: '#0f172a',
        strokeWidth: 5 * scale,
        selectable: false,
        evented: false,
      }));
      canvas.add(labelText(`${meta.label} · ${pond.spec}`, cx, cy - 2 * scale, {
        fontSize: 14.5 * scale,
        fontWeight: 600,
        fill: '#1e293b',
        strokeWidth: 3.5 * scale,
        selectable: false,
        evented: false,
        opacity: strong ? 1 : 0.78,
      }));
      canvas.add(labelText(`${pond.areaMu} 亩 · ${pond.density.toLocaleString('zh-CN')}${pond.densityUnit}`, cx, cy + 22 * scale, {
        fontSize: 14.5 * scale,
        fontWeight: 700,
        fill: mode === 'zone' ? meta.color : '#334155',
        strokeWidth: 3.5 * scale,
        selectable: false,
        evented: false,
      }));
      }
    }
  });
}

function addCageScene(canvas, project, mode, interactive) {
  if (!project.layers.cages || (mode !== 'zone' && mode !== 'feed')) return;
  project.cages.forEach((cage) => {
    const rect = tagObject(
      new fabric.Rect({
        left: cage.x,
        top: cage.y,
        width: cage.w,
        height: cage.h,
        rx: 2,
        ry: 2,
        fill: 'rgba(8,145,178,.16)',
        stroke: '#0e7490',
        strokeWidth: 1.6,
        selectable: interactive && mode === 'zone',
        evented: interactive && mode === 'zone',
        hasControls: false,
        lockMovementX: true,
        lockMovementY: true,
      }),
      'cage',
      cage.id,
    );
    canvas.add(rect);
  });

  const byPond = new Map();
  project.cages.forEach((c) => byPond.set(c.pondId, [...(byPond.get(c.pondId) || []), c]));
  byPond.forEach((cages, pondId) => {
    if (!project.layers.labels) return;
    const minX = Math.min(...cages.map((c) => c.x));
    const minY = Math.min(...cages.map((c) => c.y));
    const frame = cages[0]?.frameM || 6;
    canvas.add(labelText(`网箱 ${cages.length} 格 · ${frame}m 框架`, minX + 4, minY - 13, {
      fontSize: 14,
      fontWeight: 800,
      fill: '#155e75',
      textAlign: 'left',
      originX: 'left',
      strokeWidth: 4,
      selectable: false,
      evented: false,
    }));
  });
}

function addScaleBar(canvas) {
  const x = 72;
  const y = 852;
  const segmentM = 25;
  const segmentPx = segmentM * PX_PER_M;
  for (let i = 0; i < 4; i += 1) {
    canvas.add(new fabric.Rect({
      left: x + i * segmentPx,
      top: y,
      width: segmentPx,
      height: 11,
      fill: i % 2 === 0 ? '#0f172a' : '#ffffff',
      stroke: '#0f172a',
      strokeWidth: 1.5,
      selectable: false,
      evented: false,
    }));
  }
  [0, 25, 50, 75, 100].forEach((m, i) => {
    canvas.add(labelText(m === 100 ? '100 m' : String(m), x + i * segmentPx, y + 22, {
      fontSize: 13,
      fontWeight: 800,
      fill: '#0f172a',
      strokeWidth: 3,
      selectable: false,
      evented: false,
    }));
  });
  canvas.add(labelText('比例尺条 · 按实地米制坐标', x, y - 17, {
    fontSize: 13,
    fontWeight: 800,
    fill: '#0f172a',
    originX: 'left',
    textAlign: 'left',
    strokeWidth: 4,
    selectable: false,
    evented: false,
  }));
}

function addRidges(canvas, project) {
  if (!project.layers.ridges) return;
  project.ridges.forEach((ridge) => {
    const line = makePolyline(ridge.points, {
      stroke: '#8a5a24',
      strokeWidth: 4.5,
      opacity: 0.86,
      strokeDashArray: ridge.closed ? [14, 7] : undefined,
      selectable: false,
      evented: false,
    });
    tagObject(line, 'ridge', ridge.id);
    canvas.add(line);
    ridge.points.forEach((p) => {
      canvas.add(new fabric.Circle({
        left: p.x,
        top: p.y,
        radius: 3.2,
        originX: 'center',
        originY: 'center',
        fill: '#7c4a1e',
        stroke: '#fef3c7',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      }));
    });
    if (ridge.measuredM) {
      const mid = ridge.points[Math.floor(ridge.points.length / 2)];
      canvas.add(labelText(`${ridge.code} ${ridge.measuredM}m`, mid.x, mid.y - 13, {
        fontSize: 12.5,
        fontWeight: 700,
        fill: '#713f12',
        strokeWidth: 3,
        selectable: false,
        evented: false,
      }));
    }
  });
}

function makeAeratorGroup(a, interactive, selected) {
  const float1 = new fabric.Rect({
    left: 0,
    top: -12,
    width: 54,
    height: 10,
    rx: 5,
    ry: 5,
    originX: 'center',
    originY: 'center',
    fill: '#fed7aa',
    stroke: '#c2410c',
    strokeWidth: 2,
  });
  const float2 = new fabric.Rect({
    left: 0,
    top: 12,
    width: 54,
    height: 10,
    rx: 5,
    ry: 5,
    originX: 'center',
    originY: 'center',
    fill: '#fed7aa',
    stroke: '#c2410c',
    strokeWidth: 2,
  });
  const wheel = new fabric.Circle({
    left: 0,
    top: 0,
    radius: 12,
    originX: 'center',
    originY: 'center',
    fill: '#f97316',
    stroke: '#7c2d12',
    strokeWidth: 2.5,
  });
  const spokeH = new fabric.Rect({ left: 0, top: 0, width: 22, height: 3, originX: 'center', originY: 'center', fill: '#fff7ed' });
  const spokeV = new fabric.Rect({ left: 0, top: 0, width: 3, height: 22, originX: 'center', originY: 'center', fill: '#fff7ed' });
  const label = labelText(`${a.code} · ${a.powerKw}kW · 水深${a.depthM}m`, 0, 35, {
    fontSize: 14,
    fontWeight: 800,
    fill: '#7c2d12',
    strokeWidth: 4,
  });
  const group = new fabric.Group([float1, float2, wheel, spokeH, spokeV, label].filter(Boolean), {
    left: a.x,
    top: a.y,
    originX: 'center',
    originY: 'center',
    selectable: interactive,
    evented: interactive,
    hasControls: false,
    lockScalingX: true,
    lockScalingY: true,
    borderColor: '#f97316',
    cornerColor: '#f97316',
    borderScaleFactor: 2,
    opacity: selected ? 1 : 0.98,
    hoverCursor: 'move',
  });
  return tagObject(group, 'aerator', a.id);
}

function makePowerGroup(p, interactive) {
  const circle = new fabric.Circle({
    left: 0,
    top: 0,
    radius: 16,
    originX: 'center',
    originY: 'center',
    fill: '#fee2e2',
    stroke: '#dc2626',
    strokeWidth: 3,
  });
  const icon = labelText('电', 0, 1, {
    fontSize: 18,
    fontWeight: 900,
    fill: '#b91c1c',
    halo: false,
  });
  const label = labelText(`${p.code} · ${p.capacityKw}kW`, 0, 29, {
    fontSize: 13.5,
    fontWeight: 800,
    fill: '#991b1b',
    strokeWidth: 4,
  });
  const group = new fabric.Group([circle, icon, label], {
    left: p.x,
    top: p.y,
    originX: 'center',
    originY: 'center',
    selectable: interactive,
    evented: interactive,
    hasControls: false,
    hoverCursor: 'move',
  });
  return tagObject(group, 'power', p.id);
}

function addAerationScene(canvas, project, interactive, selectedId) {
  if (project.layers.coverage) {
    project.aerators.forEach((a) => {
      canvas.add(new fabric.Circle({
        left: a.x,
        top: a.y,
        radius: a.radiusM * PX_PER_M,
        originX: 'center',
        originY: 'center',
        fill: 'rgba(249,115,22,.09)',
        stroke: '#f97316',
        strokeWidth: 2,
        strokeDashArray: [11, 8],
        selectable: false,
        evented: false,
      }));
      canvas.add(labelText(`R${a.radiusM}m`, a.x + a.radiusM * PX_PER_M * 0.72, a.y - a.radiusM * PX_PER_M * 0.7, {
        fontSize: 12.5,
        fontWeight: 700,
        fill: '#c2410c',
        strokeWidth: 3,
        selectable: false,
        evented: false,
      }));
    });
  }

  if (project.layers.pipes) {
    project.pipes.forEach((pipe) => {
      if (pipe.points.length < 2) return;
      const casing = tagObject(makePolyline(pipe.points, {
        stroke: '#0f766e',
        strokeWidth: 8,
        opacity: 0.34,
        selectable: interactive,
        evented: interactive,
        hasControls: false,
        hoverCursor: 'pointer',
      }), 'pipe', pipe.id);
      const line = tagObject(makePolyline(pipe.points, {
        stroke: '#0f766e',
        strokeWidth: 3.2,
        strokeDashArray: [12, 7],
        selectable: false,
        evented: false,
      }), 'pipe', pipe.id);
      canvas.add(casing);
      canvas.add(line);
      const len = pipe.points.reduce((sum, p, i) => {
        if (!i) return 0;
        return sum + Math.hypot(p.x - pipe.points[i - 1].x, p.y - pipe.points[i - 1].y);
      }, 0) / PX_PER_M;
      const start = pipe.points[0];
      const bend = pipe.points[1] || pipe.points[0];
      const anchor = { x: (start.x + bend.x) / 2, y: (start.y + bend.y) / 2 };
      canvas.add(labelText(`${pipe.code} DN${pipe.diameterMm}\n${Math.round(len)}m`, anchor.x + 12, anchor.y, {
        fontSize: 11.5,
        fontWeight: 800,
        fill: '#115e59',
        textAlign: 'left',
        originX: 'left',
        lineHeight: 1.15,
        strokeWidth: 4,
        selectable: false,
        evented: false,
      }));
    });
  }

  if (project.layers.power) {
    project.powerPoints.forEach((p) => canvas.add(makePowerGroup(p, interactive)));
  }
  if (project.layers.aerators) {
    project.aerators.forEach((a) => canvas.add(makeAeratorGroup(a, interactive, selectedId === a.id)));
  }
}

function makeFeedPointGroup(fp, interactive) {
  const circle = new fabric.Circle({
    left: 0,
    top: 0,
    radius: 17,
    originX: 'center',
    originY: 'center',
    fill: '#0d9488',
    stroke: '#ffffff',
    strokeWidth: 4,
  });
  const order = labelText(String(fp.order), 0, 1, {
    fontSize: 18,
    fontWeight: 900,
    fill: '#ffffff',
    halo: false,
  });
  const label = labelText(`第${fp.order}点 · ${fp.durationMin}分钟`, 0, 31, {
    fontSize: 13.5,
    fontWeight: 800,
    fill: '#115e59',
    strokeWidth: 4,
  });
  const group = new fabric.Group([circle, order, label], {
    left: fp.x,
    top: fp.y,
    originX: 'center',
    originY: 'center',
    selectable: interactive,
    evented: interactive,
    hasControls: false,
    hoverCursor: 'move',
  });
  return tagObject(group, 'feedPoint', fp.id);
}

function addFeedScene(canvas, project, interactive) {
  if (project.layers.route && project.feedRoute.points.length > 1) {
    const halo = makePolyline(project.feedRoute.points, {
      stroke: '#ffffff',
      strokeWidth: 12,
      opacity: 0.82,
      selectable: false,
      evented: false,
    });
    const route = makePolyline(project.feedRoute.points, {
      stroke: '#0d9488',
      strokeWidth: 5,
      strokeDashArray: [18, 10],
      selectable: false,
      evented: false,
    });
    canvas.add(halo, route);

    const first = project.feedRoute.points[0];
    const boat = new fabric.Group([
      new fabric.Rect({ left: 0, top: 0, width: 30, height: 13, rx: 6, originX: 'center', originY: 'center', fill: '#115e59' }),
      new fabric.Polygon([{ x: -5, y: -8 }, { x: 8, y: 0 }, { x: -5, y: 8 }], { left: 2, top: 0, originX: 'center', originY: 'center', fill: '#5eead4' }),
    ], {
      left: first.x,
      top: first.y - 18,
      originX: 'center',
      originY: 'center',
      angle: 0,
      selectable: false,
      evented: false,
    });
    canvas.add(boat);
    canvas.add(labelText(`${project.feedRoute.boatModel} 行走路线`, first.x + 12, first.y - 38, {
      fontSize: 14,
      fontWeight: 800,
      fill: '#134e4a',
      textAlign: 'left',
      originX: 'left',
      selectable: false,
      evented: false,
    }));
  }

  if (project.layers.feedPoints) {
    [...project.feedPoints]
      .sort((a, b) => a.order - b.order)
      .forEach((fp) => canvas.add(makeFeedPointGroup(fp, interactive)));
  }
}

export function renderScene(canvas, project, mode, options = {}) {
  if (!canvas) return;
  const canInteract = options.interactive === true;
  const tool = options.tool || state.ui.tool;
  const interactive = canInteract && tool === 'select';
  const selectedId = options.selectedId ?? state.ui.selectedId;
  canvas.clear();
  canvas.backgroundColor = '#e8eef2';

  if (project.layers.basemap) {
    const img = new fabric.FabricImage(createBasemapCanvas(project), {
      left: 0,
      top: 0,
      selectable: false,
      evented: false,
      opacity: project.basemap?.dataUrl ? project.basemap.opacity ?? 0.88 : 1,
    });
    canvas.add(img);
  } else {
    canvas.add(new fabric.Rect({
      left: 0,
      top: 0,
      width: WORLD_W,
      height: WORLD_H,
      fill: '#eef6f2',
      selectable: false,
      evented: false,
    }));
  }

  canvas.add(new fabric.Rect({
    left: 1,
    top: 1,
    width: WORLD_W - 2,
    height: WORLD_H - 2,
    fill: 'transparent',
    stroke: '#334155',
    strokeWidth: 2,
    selectable: false,
    evented: false,
  }));

  addScaleBar(canvas);
  addRidges(canvas, project);
  addPondScene(canvas, project, mode, interactive, selectedId);
  addCageScene(canvas, project, mode, interactive);

  if (mode === 'aeration') addAerationScene(canvas, project, interactive, selectedId);
  if (mode === 'feed') addFeedScene(canvas, project, interactive);

  canvas.requestRenderAll();

  if (interactive && selectedId) {
    const obj = canvas.getObjects().find((o) => o.refId === selectedId && o.selectable);
    if (obj) {
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
    }
  }
}

export async function exportModePng(mode) {
  const currentState = state;
  ensureBasemapReady(currentState.project);
  await new Promise((resolve) => {
    if (!currentState.project.basemap.dataUrl) resolve();
    else {
      let tries = 0;
      const tick = () => {
        const img = uploadedImageCache.get(currentState.project.basemap.dataUrl);
        if (img?.complete || tries > 40) resolve();
        else {
          tries += 1;
          setTimeout(tick, 60);
        }
      };
      tick();
    }
  });
  const el = document.createElement('canvas');
  el.width = WORLD_W;
  el.height = WORLD_H;
  const canvas = new fabric.StaticCanvas(el, { width: WORLD_W, height: WORLD_H, enableRetinaScaling: false });
  renderScene(canvas, currentState.project, mode, { interactive: false, selectedId: null });
  const url = canvas.toDataURL({ format: 'png', multiplier: 2 });
  canvas.dispose();
  const a = document.createElement('a');
  a.href = url;
  a.download = `场区${mode === 'zone' ? '分区图' : mode === 'aeration' ? '增氧点位图' : '投喂路线图'}.png`;
  a.click();
}
