<script>
  import { onMount } from 'svelte';
  import Konva from 'konva';
  import { colorForValue } from '../lib/color.js';
  import { loadImage } from '../lib/images.js';

  let { store } = $props();

  let container = $state(null);
  let stageSize = $state({ w: 800, h: 520 });
  let displayView = $state(null);
  let structureTick = $state(0); // 期次节点异步创建/销毁后驱动渲染效应重跑

  let stage, layer, draftLayer, bgRect;
  const groupNodes = new Map(); // periodId -> { group, img, patchGroup, annGroup, patches:Map, anns:Map }
  let draftLine, draftCircles;
  let resizeObs;
  let rafId = null;
  let tween = null; // 放大镜头的视窗补间
  let dragStart = null;

  const reef = $derived(store.reef);

  function createAnnotationNodes(entry, ann) {
    const g = new Konva.Group({ name: 'ann' });
    const flat = ann.points.flat();
    const line = new Konva.Line({
      points: flat,
      closed: true,
      stroke: '#ff3b30',
      strokeWidth: 3 / Math.max(0.0001, 1),
      dash: [10, 6],
      fillRadialGradientStartPoint: { x: 0, y: 0 },
      listening: false
    });
    const first = ann.points[0] || [0, 0];
    const text = new Konva.Text({
      x: first[0] + 8,
      y: first[1] - 26,
      text: ann.label,
      fontSize: 18,
      fontStyle: 'bold',
      fill: '#ff3b30',
      stroke: '#ffffff',
      strokeWidth: 2,
      listening: false
    });
    g.add(line, text);
    entry.annGroup.add(g);
    entry.anns.set(ann.id, g);
  }

  async function ensurePeriod(period) {
    const group = new Konva.Group({ visible: false });
    let destroyed = false;
    const img = new Konva.Image({ width: reef.width, height: reef.height });
    const patchGroup = newKonvaPatchGroup(period);
    const annGroup = new Konva.Group();
    group.add(img, patchGroup, annGroup);
    layer.add(group);
    const entry = { group, img, patchGroup, annGroup, patches: new Map(), anns: new Map() };
    for (const patch of period.patches) entry.patches.set(patch.id, patchGroup.findOne(`#${patch.id}`));
    for (const ann of period.annotations || []) createAnnotationNodes(entry, ann);
    groupNodes.set(period.id, entry);
    structureTick++; // 节点已入表，触发渲染效应设置可见性/上色

    const imageEl = await loadImage(period.ortho);
    if (!destroyed && imageEl) {
      img.image(imageEl);
      structureTick++;
      layer.batchDraw();
    }
    entry.markDestroyed = () => { destroyed = true; };
  }

  function newKonvaPatchGroup(period) {
    const g = new Konva.Group();
    for (const patch of period.patches) {
      const line = new Konva.Line({
        id: patch.id,
        points: patch.points.flat(),
        closed: true,
        stroke: 'rgba(255,255,255,0.35)',
        strokeWidth: 1
      });
      g.add(line);
    }
    return g;
  }

  // 结构同步：期次/斑块/标注增删（按 id 复用，已存在的节点不抖动）
  $effect(() => {
    if (!stage) return;
    void structureTick;
    const periods = store.periods;
    for (const period of periods) {
      if (!groupNodes.has(period.id)) ensurePeriod(period);
    }
    for (const [id, entry] of groupNodes) {
      const period = periods.find((p) => p.id === id);
      if (!period) {
        entry.markDestroyed?.();
        entry.group.destroy();
        groupNodes.delete(id);
        structureTick++;
        continue;
      }
      // 标注增量同步
      const have = entry.anns;
      for (const ann of period.annotations || []) {
        if (!have.has(ann.id)) createAnnotationNodes(entry, ann);
      }
      for (const [annId, node] of have) {
        if (!(period.annotations || []).some((a) => a.id === annId)) {
          node.destroy();
          have.delete(annId);
        }
      }
    }
    layer.batchDraw();
  });

  function applyView(view) {
    if (!stage || !view) return;
    const { w: W, h: H } = stageSize;
    const scale = Math.min(W / view.w, H / view.h);
    const config = { scale: { x: scale, y: scale }, offset: { x: view.x + view.w / 2, y: view.y + view.h / 2 }, position: { x: W / 2, y: H / 2 } };
    stage.scale(config.scale);
    stage.offset(config.offset);
    stage.position(config.position);
    // 草稿图层与主图层保持同一变换，圈选点与礁区坐标对齐
    draftLayer.scale(config.scale);
    draftLayer.offset(config.offset);
    draftLayer.position(config.position);
  }

  // 放大镜头：进入/切换时对显示范围做 450ms 补间
  $effect(() => {
    const l = store.lens;
    if (l) {
      const target = l.kind === 'region' ? l.view : viewOfAnnotation(l.periodId, l.annotationId);
      // 响应式 Proxy 不能 structuredClone，浅拷贝出普通对象（view 仅含 4 个数值字段）
      const from = displayView ? { ...displayView } : { ...target };
      tween = { from, to: { ...target }, start: performance.now(), dur: 450 };
      if (rafId == null) rafId = requestAnimationFrame(stepTween);
    } else {
      tween = null;
      displayView = null;
    }
  });

  function viewOfAnnotation(periodId, annotationId) {
    const p = store.periods.find((x) => x.id === periodId);
    const ann = (p?.annotations || []).find((a) => a.id === annotationId);
    if (!ann) return p.key.view;
    const xs = ann.points.map((pt) => pt[0]);
    const ys = ann.points.map((pt) => pt[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = Math.max(maxX - minX, maxY - minY) * 0.9 + 60;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return { x: cx - pad / 2, y: cy - pad / 2, w: pad, h: pad };
  }

  function stepTween(ts) {
    if (!tween) { rafId = null; return; }
    const t = Math.min(1, (ts - tween.start) / tween.dur);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const lerp = (a, b) => a + (b - a) * e;
    displayView = {
      x: lerp(tween.from.x, tween.to.x),
      y: lerp(tween.from.y, tween.to.y),
      w: lerp(tween.from.w, tween.to.w),
      h: lerp(tween.from.h, tween.to.h)
    };
    if (t < 1) rafId = requestAnimationFrame(stepTween);
    else { tween = null; rafId = null; }
  }

  // 逐帧渲染：可见期次、交叉淡入、斑块按各自色标上色、视窗变换、草稿多边形
  $effect(() => {
    if (!stage) return;
    void structureTick;
    const ps = store.playState;
    const periods = store.periods;
    const bins = reef.bins;

    periods.forEach((period, i) => {
      const entry = groupNodes.get(period.id);
      if (!entry) return;
      let alpha = 0;
      if (ps.mode === 'hold') {
        alpha = i === ps.periodIndex ? 1 : 0;
      } else {
        if (i === ps.periodIndex) alpha = ps.fromAlpha;
        else if (i === ps.nextIndex) alpha = ps.toAlpha;
      }
      entry.group.visible(alpha > 0.01);
      entry.group.opacity(alpha);
      // 每期斑块按本期色标档位上色，过渡时随图层透明度交叉淡化
      for (const patch of period.patches) {
        const node = entry.patches.get(patch.id);
        if (node) node.fill(colorForValue(patch.bleaching, period.key.scale, bins));
      }
    });

    applyView(store.lens && displayView ? displayView : ps.view);
    renderDraft();
    layer.batchDraw();
  });

  function renderDraft() {
    if (!draftLayer) return;
    const pts = store.draftPoints;
    draftLine.points(pts.flat());
    draftLine.visible(pts.length >= 2);
    draftCircles.destroyChildren();
    for (const [x, y] of pts) {
      draftCircles.add(new Konva.Circle({ x, y, radius: 5, fill: '#ff3b30', stroke: '#fff', strokeWidth: 1.5, listening: false }));
    }
    draftLayer.batchDraw();
  }

  // ---- 交互：平移 / 滚轮缩放 / 圈选 ----
  function onWheel(e) {
    if (store.lens) return;
    e.evt.preventDefault();
    e.evt.stopPropagation();
    const pos = stage.getRelativePointerPosition();
    const factor = e.evt.deltaY < 0 ? 1.12 : 1 / 1.12;
    store.zoomViewAt(store.selectedPeriodId, factor, [pos.x, pos.y]);
  }

  function onPointerDown(e) {
    if (store.lens) return;
    const pos = stage.getRelativePointerPosition();
    dragStart = { x: e.evt.clientX, y: e.evt.clientY, reef: pos, moved: false };
  }

  function onPointerMove(e) {
    if (!dragStart || store.lens) return;
    const cur = { x: e.evt.clientX, y: e.evt.clientY };
    const dxScreen = cur.x - dragStart.x;
    const dyScreen = cur.y - dragStart.y;
    if (Math.abs(dxScreen) + Math.abs(dyScreen) > 3) dragStart.moved = true;
    if (dragStart.moved && store.tool !== 'annotate') {
      // 以按下时的礁区锚点为基准平移显示范围
      const s = stage.scaleX();
      const v = store.selectedPeriod.key.view;
      store.updateView(store.selectedPeriodId, {
        x: dragStart.reef.x - dxScreen / s - v.w / 2,
        y: dragStart.reef.y - dyScreen / s - v.h / 2
      });
    }
  }

  function onPointerUp() {
    if (!dragStart) return;
    const wasClick = !dragStart.moved;
    if (wasClick && store.tool === 'annotate') {
      const pos = stage.getRelativePointerPosition();
      store.addDraftPoint([Math.round(pos.x), Math.round(pos.y)]);
    }
    dragStart = null;
  }

  function onDblClick() {
    if (store.tool === 'annotate' && store.draftPoints.length >= 3) store.commitDraft();
  }

  function onKey(e) {
    if (e.key === 'Escape') store.cancelDraft();
    if (e.key === 'Enter' && store.tool === 'annotate' && store.draftPoints.length >= 3) store.commitDraft();
  }

  onMount(() => {
    stage = new Konva.Stage({ container, width: stageSize.w, height: stageSize.h });
    layer = new Konva.Layer();
    draftLayer = new Konva.Layer();
    bgRect = new Konva.Rect({ x: 0, y: 0, width: reef.width, height: reef.height, fillRadialGradientStartPoint: { x: reef.width / 2, y: reef.height / 2 }, fillRadialGradientStartRadius: 80, fillRadialGradientEndPoint: { x: reef.width / 2, y: reef.height / 2 }, fillRadialGradientEndRadius: 700, fillRadialGradientColorStops: [0, '#155e75', 1, '#0b2f44'] });
    layer.add(bgRect);
    draftLine = new Konva.Line({ stroke: '#ff3b30', strokeWidth: 2.5, dash: [8, 5], closed: false, visible: false, listening: false });
    draftCircles = new Konva.Group({ listening: false });
    draftLayer.add(draftLine, draftCircles);
    stage.add(layer, draftLayer);
    stage.on('wheel', onWheel);
    stage.on('mousedown', onPointerDown);
    stage.on('mousemove', onPointerMove);
    stage.on('mouseup', onPointerUp);
    stage.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKey);

    resizeObs = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      stageSize = { w: Math.round(r.width), h: Math.round(r.height) };
      if (stage) { stage.width(r.width); stage.height(r.height); layer.batchDraw(); }
    });
    resizeObs.observe(container);
    structureTick++; // 挂载完成，驱动结构/渲染 effect 重跑
    if (import.meta.env.DEV) window.__konva = { stage, layer, groupNodes };
    return () => {
      window.removeEventListener('keydown', onKey);
      resizeObs?.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      stage.destroy();
    };
  });

  // 角标/字幕所需的当前期信息
  const caption = $derived.by(() => {
    const ps = store.playState;
    if (ps.mode === 'transition') {
      return { from: store.periods[ps.periodIndex], to: store.periods[ps.nextIndex], progress: ps.progress };
    }
    return { current: store.periods[ps.periodIndex] };
  });

  const lensAnn = $derived.by(() => {
    if (!store.lens || store.lens.kind !== 'annotation') return null;
    const p = store.periods.find((x) => x.id === store.lens.periodId);
    return (p?.annotations || []).find((a) => a.id === store.lens.annotationId) || null;
  });
</script>

<div class="stage-wrap" class:annotating={store.tool === 'annotate'}>
  <div class="konva-host" bind:this={container}></div>

  <!-- 画面角标：期次名 + 监测日期 -->
  <div class="corner-badge">
    {#if caption.current}
      <span class="badge-name">{caption.current.name}</span>
      <span class="badge-date">监测日期 {caption.current.date}</span>
    {:else}
      <span class="badge-name">{caption.from.name} → {caption.to.name}</span>
      <span class="badge-date">{caption.from.date} → {caption.to.date}</span>
    {/if}
  </div>

  {#if store.tool === 'annotate'}
    <div class="annotate-hint">
      圈选模式：单击逐点圈出白化扩大区，双击或 Enter 完成，Esc 取消
      <button class="mini" onclick={() => store.commitDraft()} disabled={store.draftPoints.length < 3}>完成圈选</button>
      <button class="mini" onclick={() => store.undoDraftPoint()} disabled={store.draftPoints.length === 0}>回退一点</button>
      <button class="mini" onclick={() => store.cancelDraft()}>取消</button>
    </div>
  {/if}

  {#if lensAnn}
    <div class="lens-bar">
      <strong>放大讲解 · {lensAnn.label}</strong>
      <span>{store.periods.find((p) => p.id === store.lens.periodId).name} · {store.periods.find((p) => p.id === store.lens.periodId).date}（已暂停）</span>
      <button class="mini primary" onclick={() => store.exitLens()}>退出放大</button>
    </div>
  {/if}

  <!-- 画面下方滚动字幕条 -->
  <div class="caption-strip">
    {#each store.periods as p, i (p.id)}
      <button
        class="caption-item"
        class:active={store.playState.periodIndex === i || store.playState.nextIndex === i}
        onclick={() => store.seekPeriod(p.id)}
      >
        <span class="cap-name">{p.name}</span>
        <span class="cap-date">{p.date}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .stage-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    overflow: hidden;
    background: #0b2f44;
    border: 1px solid var(--border);
  }
  .konva-host { flex: 1; min-height: 0; }
  .annotating :global(.konvajs-content) { cursor: crosshair; }
  .corner-badge {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(8, 24, 36, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    padding: 8px 12px;
    pointer-events: none;
    backdrop-filter: blur(4px);
  }
  .badge-name { font-size: 16px; font-weight: 700; color: #fff; }
  .badge-date { font-size: 12px; color: #9fd3e8; }
  .annotate-hint, .lens-bar {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(20, 30, 40, 0.9);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12.5px;
  }
  .lens-bar { left: 12px; right: auto; top: auto; bottom: 58px; border-color: #ff3b30; }
  .mini {
    border: 1px solid var(--border);
    background: #1d3a4d;
    color: #e8f2f8;
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .mini:disabled { opacity: 0.4; cursor: not-allowed; }
  .mini.primary { background: #2f7fa6; border-color: #3b95c2; }
  .caption-strip {
    display: flex;
    gap: 6px;
    padding: 8px 10px;
    background: rgba(8, 24, 36, 0.92);
    border-top: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .caption-item {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    border: 1px solid var(--border);
    background: #123044;
    color: #cfe3ee;
    border-radius: 8px;
    padding: 6px 14px;
    cursor: pointer;
    transition: all 0.25s ease;
  }
  .caption-item.active {
    background: #1f5f83;
    border-color: #57b6e0;
    transform: translateY(-2px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  }
  .cap-name { font-weight: 700; font-size: 13px; }
  .cap-date { font-size: 11.5px; color: #9fd3e8; }
</style>
