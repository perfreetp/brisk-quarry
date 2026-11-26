<script>
  // 逐洞标注画布:所有洞叠在一版上,每个洞独立坐标系(码),互不影响
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import Konva from 'konva';
  import { holes, activeHoleId, role, tool, refType, snapEnabled, updateHole, selectedLandingId } from '../lib/store.js';
  import { approachMetrics, createLanding, REF_TYPES } from '../lib/model.js';
  import { ticksAlongPolyline, findSnap, resolveCollisions, yardageTier, formatYards } from '../lib/geometry.js';

  let container;
  let stage, layer, bgRect, transformer;
  let scale = 1;

  // 正在绘制中的临时点(洞局部坐标,码)
  let drawing = []; // [x,y,...]
  let tempLine = null, tempDots = null, snapDot = null;

  // 比例尺标定:两次点击
  let calibClicks = []; // [{x,y}] 洞局部坐标
  let calibPending = null; // {pxDist} 等待输入码数
  let calibYards = 100;

  const imageCache = new Map(); // src -> HTMLImageElement

  $: $holes, $tool, $snapEnabled, $activeHoleId, $role, redraw();

  onMount(() => {
    stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight, draggable: true });
    layer = new Konva.Layer();
    stage.add(layer);
    bgRect = new Konva.Rect({ x: -10000, y: -10000, width: 20000, height: 20000, fill: '#eef2e9', listening: true });
    layer.add(bgRect);
    transformer = new Konva.Transformer({ rotateEnabled: true, enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'] });
    layer.add(transformer);

    // 只有点在空白背景上才拖动画布
    stage.on('mousedown', (e) => {
      if (e.target !== bgRect && e.target !== stage) stage.stopDrag();
    });
    stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const old = scale;
      scale = Math.min(8, Math.max(0.1, scale * (e.evt.deltaY > 0 ? 0.9 : 1.1)));
      const ptr = stage.getPointerPosition();
      const origin = { x: (ptr.x - layer.x()) / old, y: (ptr.y - layer.y()) / old };
      layer.scale({ x: scale, y: scale });
      layer.position({ x: ptr.x - origin.x * scale, y: ptr.y - origin.y * scale });
      layer.batchDraw();
    });
    stage.on('click', onStageClick);
    stage.on('dblclick', finishDrawing);
    stage.on('contextmenu', (e) => {
      e.evt.preventDefault();
      if (drawing.length >= 2) { drawing.splice(drawing.length - 2, 2); redraw(); }
    });

    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', fitStage);
    redraw();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', fitStage);
    stage?.destroy();
  });

  function fitStage() {
    if (!stage) return;
    stage.width(container.clientWidth);
    stage.height(container.clientHeight);
  }

  function onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Enter') finishDrawing();
    if (e.key === 'Escape') cancelDrawing();
    if ((e.key === 'Delete' || e.key === 'Backspace')) {
      const lzId = get(selectedLandingId);
      if (lzId) {
        const hid = get(activeHoleId);
        updateHole(hid, (h) => { h.landings = h.landings.filter((l) => l.id !== lzId); return h; });
        selectedLandingId.set(null);
      }
    }
  }

  // 舞台坐标 → 洞局部坐标(码)
  function toLocal(hole) {
    const p = layer.getRelativePointerPosition();
    return { x: (p.x - hole.offset.x), y: (p.y - hole.offset.y) };
  }

  function snapTargets(hole) {
    return {
      ticks: ticksAlongPolyline(hole.centerline, hole.tickInterval),
      refLines: hole.refLines,
    };
  }

  function maybeSnap(hole, p) {
    if (!get(snapEnabled)) return p;
    const s = findSnap(p.x, p.y, snapTargets(hole), 10 / scale);
    if (s) {
      showSnap(hole, s);
      return { x: s.x, y: s.y };
    }
    showSnap(null);
    return p;
  }

  function showSnap(hole, s) {
    if (snapDot) { snapDot.destroy(); snapDot = null; }
    if (hole && s) {
      snapDot = new Konva.Circle({ x: hole.offset.x + s.x, y: hole.offset.y + s.y, radius: 5 / scale, stroke: '#e91e63', strokeWidth: 1.5 / scale, listening: false });
      layer.add(snapDot);
    }
    layer.batchDraw();
  }

  function onStageClick(e) {
    const hole = get(holes).find((h) => h.id === get(activeHoleId));
    const t = get(tool);
    if (!hole) return;
    if (e.target !== bgRect && e.target !== stage && t === 'select') return; // 点在图形上由图形自己处理
    const p = toLocal(hole);

    if (t === 'calibrate') {
      if (!hole.map) return;
      calibClicks.push(p);
      if (calibClicks.length === 2) {
        // 图像像素距离 = 局部码距离 / 当前 yardsPerPixel
        const dYards = Math.hypot(calibClicks[1].x - calibClicks[0].x, calibClicks[1].y - calibClicks[0].y);
        const pxDist = dYards / hole.map.yardsPerPixel;
        calibPending = { pxDist };
        calibClicks = [];
      }
      redraw();
      return;
    }
    if (t === 'landing') {
      const lz = createLanding(p.x - 30, p.y - 15);
      updateHole(hole.id, (h) => { h.landings.push(lz); return h; });
      selectedLandingId.set(lz.id);
      return;
    }
    if (['centerline', 'green', 'refline', 'approach'].includes(t)) {
      const sp = t === 'approach' ? maybeSnap(hole, p) : p;
      drawing.push(sp.x, sp.y);
      redraw();
    }
  }

  function finishDrawing() {
    const hole = get(holes).find((h) => h.id === get(activeHoleId));
    const t = get(tool);
    // 双击会先触发两次 click,去掉末尾重复点
    while (drawing.length >= 4) {
      const n = drawing.length;
      if (Math.hypot(drawing[n - 2] - drawing[n - 4], drawing[n - 1] - drawing[n - 3]) < 0.5) drawing.splice(n - 2, 2);
      else break;
    }
    if (!hole || drawing.length < 4) { cancelDrawing(); return; }
    const pts = drawing.slice();
    drawing = [];
    updateHole(hole.id, (h) => {
      if (t === 'centerline') h.centerline = pts;
      else if (t === 'green') h.green = pts;
      else if (t === 'refline') h.refLines.push({ id: `rl_${Date.now().toString(36)}`, type: get(refType), points: pts });
      else if (t === 'approach') h.approach.points = pts;
      return h;
    });
  }

  function cancelDrawing() {
    drawing = [];
    calibClicks = [];
    redraw();
  }

  function confirmCalibration() {
    const hole = get(holes).find((h) => h.id === get(activeHoleId));
    if (!hole || !calibPending || !(calibYards > 0)) return;
    const ypp = calibYards / calibPending.pxDist;
    // 只改当前洞的比例尺,其他洞不动
    updateHole(hole.id, (h) => { h.map.yardsPerPixel = ypp; return h; });
    calibPending = null;
  }

  function getImage(src) {
    let img = imageCache.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      img.onload = () => redraw();
      imageCache.set(src, img);
    }
    return img;
  }

  // ---------- 重绘 ----------
  function redraw() {
    if (!layer) return;
    layer.destroyChildren();
    layer.add(bgRect);
    transformer = new Konva.Transformer({ rotateEnabled: true, enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'] });
    layer.add(transformer);

    const $hs = get(holes);
    const activeId = get(activeHoleId);
    const t = get(tool);
    const isDesigner = get(role) === 'designer';
    stage.draggable(t === 'select');

    for (const hole of $hs) {
      const isActive = hole.id === activeId;
      const g = new Konva.Group({ x: hole.offset.x, y: hole.offset.y, opacity: isActive ? 1 : 0.45 });
      layer.add(g);

      // 平面图(按标定比例缩放:1 图像像素 = yardsPerPixel 码)
      if (hole.map) {
        const img = getImage(hole.map.src);
        if (img.complete && img.naturalWidth) {
          g.add(new Konva.Image({
            image: img, x: hole.map.x, y: hole.map.y,
            scaleX: hole.map.yardsPerPixel, scaleY: hole.map.yardsPerPixel,
            opacity: 0.75, listening: false,
          }));
        }
      }

      // 果岭轮廓
      if (hole.green.length >= 6) {
        g.add(new Konva.Line({ points: hole.green, closed: true, fill: 'rgba(110,190,110,0.45)', stroke: '#2d6a2d', strokeWidth: 1.5 / scale, listening: false }));
      }
      // 球道中心线
      if (hole.centerline.length >= 4) {
        g.add(new Konva.Line({ points: hole.centerline, stroke: '#888', strokeWidth: 1.2 / scale, dash: [8 / scale, 5 / scale], listening: false }));
        // 障碍距离刻度
        for (const tk of ticksAlongPolyline(hole.centerline, hole.tickInterval)) {
          g.add(new Konva.Line({ points: [tk.x - 4 / scale, tk.y, tk.x + 4 / scale, tk.y], stroke: '#c2185b', strokeWidth: 1 / scale, listening: false }));
          g.add(new Konva.Text({ x: tk.x + 5 / scale, y: tk.y - 8 / scale, text: String(tk.yard), fontSize: 8 / scale, fill: '#c2185b', listening: false }));
        }
      }
      // 参照线(沙坑唇口/水障碍岸线/草皮边)
      for (const rl of hole.refLines) {
        g.add(new Konva.Line({
          points: rl.points, stroke: (REF_TYPES[rl.type] || {}).color || '#999',
          strokeWidth: (isActive ? 2.5 : 1.5) / scale, listening: false,
        }));
      }
      // 落球区
      for (const lz of hole.landings) {
        const lg = new Konva.Group({ x: lz.x, y: lz.y, rotation: lz.rotation, draggable: isActive && t === 'select', id: `lz_${lz.id}` });
        const rect = new Konva.Rect({
          width: lz.w, height: lz.h, fill: 'rgba(255,210,77,0.35)', stroke: '#b8860b',
          strokeWidth: 1.5 / scale, dash: [5 / scale, 3 / scale], name: 'lz-rect',
        });
        rect.setAttr('lzId', lz.id);
        lg.add(rect);
        lg.add(new Konva.Text({
          width: lz.w, height: lz.h, align: 'center', verticalAlign: 'middle',
          text: `HCP ${lz.targetHandicap} · ${lz.wind}`, fontSize: Math.min(9 / scale, lz.h * 0.4), fill: '#7a5b00', listening: false,
        }));
        lg.on('dragend', () => {
          updateHole(hole.id, (h) => {
            const z = h.landings.find((l) => l.id === lz.id);
            if (z) { z.x = lg.x(); z.y = lg.y(); z.rotation = lg.rotation(); }
            return h;
          });
        });
        lg.on('click tap', (e) => {
          if (get(tool) !== 'select') return;
          e.cancelBubble = true;
          selectedLandingId.set(lz.id);
          transformer.nodes([lg]);
          transformer.moveTo(layer); // 保持 transformer 在顶层
          layer.batchDraw();
        });
        lg.on('transformend', () => {
          updateHole(hole.id, (h) => {
            const z = h.landings.find((l) => l.id === lz.id);
            if (z) {
              z.x = lg.x(); z.y = lg.y(); z.rotation = lg.rotation();
              z.w = Math.max(5, lz.w * lg.scaleX()); z.h = Math.max(5, lz.h * lg.scaleY());
            }
            return h;
          });
          lg.scale({ x: 1, y: 1 });
        });
        g.add(lg);
      }
      // 进攻折线
      if (hole.approach.points.length >= 4) {
        g.add(new Konva.Line({ points: hole.approach.points, stroke: '#d62728', strokeWidth: 2.5 / scale, listening: false }));
      }
      // 折线拐点(可拖,吸附到刻度/参照线)
      if (isActive && t === 'select' && hole.approach.points.length >= 2) {
        for (let i = 0; i < hole.approach.points.length / 2; i++) {
          const vi = i;
          const c = new Konva.Circle({
            x: hole.approach.points[vi * 2], y: hole.approach.points[vi * 2 + 1],
            radius: 4.5 / scale, fill: '#fff', stroke: '#d62728', strokeWidth: 1.5 / scale, draggable: true,
          });
          c.on('dragmove', () => {
            const s = maybeSnap(hole, { x: c.x(), y: c.y() });
            c.position(s);
          });
          c.on('dragend', () => {
            showSnap(null);
            updateHole(hole.id, (h) => {
              h.approach.points[vi * 2] = c.x();
              h.approach.points[vi * 2 + 1] = c.y();
              return h; // 码数随重绘自动重算,标注自动重排,手调偏移保留在 labelManual
            });
          });
          g.add(c);
        }
      }
      // 标注(自动排版 + 手调偏移保留)
      drawLabels(g, hole, isActive, t);
      // 洞名(拖动它移动整个洞;只动本洞)
      const nameText = new Konva.Text({
        x: 0, y: -30, text: `#${hole.number} ${hole.name} · Par ${hole.par}`,
        fontSize: 13 / scale, fontStyle: 'bold', fill: isActive ? '#111' : '#777',
        draggable: isActive && isDesigner && t === 'select',
      });
      nameText.on('dragmove', () => {
        g.move({ x: nameText.x(), y: nameText.y() + 30 });
        nameText.position({ x: 0, y: -30 });
      });
      nameText.on('dragend', () => {
        updateHole(hole.id, (h) => { h.offset = { x: g.x(), y: g.y() }; return h; });
      });
      g.add(nameText);
    }

    drawTemp();
    // 重绘后把变换手柄重新挂到当前选中的落球区上
    const selLz = get(selectedLandingId);
    if (selLz) {
      const node = layer.findOne(`#lz_${selLz}`);
      if (node) transformer.nodes([node]);
    }
    layer.batchDraw();
  }

  // 标注:码数档位分字号,密集自动错开,手调偏移保留
  function drawLabels(g, hole, isActive, t) {
    const metrics = approachMetrics(hole);
    if (!metrics.length) return;
    // 自动锚点 + 估算尺寸
    const labels = metrics.map((m, i) => {
      const tier = yardageTier(m.fromTee);
      const line2 = detailLine(m);
      const w = Math.max(tier.text.length * tier.fontSize * 0.62, line2.length * 8 * 0.55) / scale * 0 + Math.max(tier.text.length * tier.fontSize * 0.62, line2.length * 8 * 0.55);
      return { id: `ap_${i}`, x: m.x + 5, y: m.y - 16, w: w + 6, h: (tier.fontSize + 11) };
    });
    const auto = resolveCollisions(labels);
    metrics.forEach((m, i) => {
      const key = `ap_${i}`;
      const tier = yardageTier(m.fromTee);
      const a = auto[key] || { dx: 0, dy: 0 };
      const manual = hole.labelManual[key] || { dx: 0, dy: 0 };
      const base = labels[i];
      const lx = base.x + a.dx + manual.dx;
      const ly = base.y + a.dy + manual.dy;
      const lg = new Konva.Group({ x: lx, y: ly, draggable: isActive && t === 'select' });
      const line2 = detailLine(m);
      const w = base.w, h = base.h;
      lg.add(new Konva.Rect({ width: w, height: h, fill: 'rgba(255,255,255,0.88)', stroke: '#bbb', strokeWidth: 0.5 / scale, cornerRadius: 2 }));
      lg.add(new Konva.Text({ x: 3, y: 1, text: `${tier.text} y`, fontSize: tier.fontSize, fontStyle: 'bold', fill: '#b00020', listening: false }));
      lg.add(new Konva.Text({ x: 3, y: tier.fontSize + 2, text: line2, fontSize: 8, fill: '#333', listening: false }));
      // 引线:标注错开后仍指回拐点
      lg.add(new Konva.Line({ points: [0, h / 2, m.x - lx, m.y - ly], stroke: '#999', strokeWidth: 0.6 / scale, listening: false }));
      lg.on('dragend', () => {
        // 手调偏移 = 落点 - (自动锚点 + 自动错开),重排时保留
        updateHole(hole.id, (hh) => {
          hh.labelManual[key] = { dx: lg.x() - base.x - a.dx, dy: lg.y() - base.y - a.dy };
          return hh;
        });
      });
      g.add(lg);
    });
  }

  function detailLine(m) {
    const bits = [];
    if (m.toGreen !== null) bits.push(`余${formatYards(m.toGreen)}`);
    if (m.toHazard !== null) bits.push(`障${formatYards(m.toHazard)}`);
    if (m.angle !== null) bits.push(`∠${m.angle}°`);
    return bits.join(' ') || '—';
  }

  // 绘制中的临时图形 + 标定点
  function drawTemp() {
    const hole = get(holes).find((h) => h.id === get(activeHoleId));
    if (!hole) return;
    const t = get(tool);
    if (drawing.length >= 2) {
      layer.add(new Konva.Line({
        x: hole.offset.x, y: hole.offset.y, points: drawing,
        stroke: t === 'approach' ? '#d62728' : '#1565c0', strokeWidth: 2 / scale,
        dash: [6 / scale, 4 / scale], listening: false,
        closed: t === 'green' && drawing.length >= 6,
      }));
      for (let i = 0; i < drawing.length; i += 2) {
        layer.add(new Konva.Circle({ x: hole.offset.x + drawing[i], y: hole.offset.y + drawing[i + 1], radius: 3 / scale, fill: '#1565c0', listening: false }));
      }
    }
    for (const c of calibClicks) {
      layer.add(new Konva.Circle({ x: hole.offset.x + c.x, y: hole.offset.y + c.y, radius: 4 / scale, fill: '#ff9800', listening: false }));
    }
  }
</script>

<div class="canvas-wrap" bind:this={container}>
  {#if calibPending}
    <div class="calib-pop">
      <div>两点间实际距离(码):</div>
      <input type="number" bind:value={calibYards} min="1" />
      <button on:click={confirmCalibration}>确定比例尺</button>
      <button on:click={() => (calibPending = null)}>取消</button>
    </div>
  {/if}
  {#if drawing.length >= 2}
    <div class="hint">绘制中:单击加点 · 右键撤点 · 回车/双击完成 · Esc 取消</div>
  {/if}
</div>

<style>
  .canvas-wrap { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .calib-pop {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    background: #fff; border: 1px solid #ccc; border-radius: 6px; padding: 10px 14px;
    display: flex; gap: 8px; align-items: center; z-index: 10; box-shadow: 0 2px 10px rgba(0,0,0,.2);
  }
  .calib-pop input { width: 80px; }
  .hint {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,.65); color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 12px;
  }
</style>
