import { createEffect, onCleanup, onMount } from 'solid-js';
import { LABEL_META } from '../types';
import { selectBranch, store } from '../state/store';
import { UNLABELED_COLOR } from '../types';

interface FitTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

let transform: FitTransform | null = null;

function project(x: number, y: number): [number, number] {
  if (!transform) return [0, 0];
  return [transform.offsetX + x * transform.scale, transform.offsetY - y * transform.scale];
}

export default function TreePreview() {
  let canvasRef: HTMLCanvasElement | undefined;
  let wrapRef: HTMLDivElement | undefined;
  let observer: ResizeObserver | undefined;
  let drawQueued = false;

  const scheduleDraw = () => {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      draw();
    });
  };

  const draw = () => {
    const canvas = canvasRef;
    const wrap = wrapRef;
    if (!canvas || !wrap) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w < 10 || h < 10) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const branches = store.dataset.branches;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const b of branches) {
      minX = Math.min(minX, b.start[0], b.end[0]);
      maxX = Math.max(maxX, b.start[0], b.end[0]);
      minY = Math.min(minY, b.start[1], b.end[1]);
      maxY = Math.max(maxY, b.start[1], b.end[1]);
    }
    if (!Number.isFinite(minX)) return;
    const pad = 18;
    const scale = Math.min((w - pad * 2) / Math.max(0.1, maxX - minX), (h - pad * 2) / Math.max(0.1, maxY - minY));
    const centerX = (minX + maxX) / 2;
    transform = {
      scale,
      offsetX: w / 2 - centerX * scale,
      offsetY: h - pad + minY * scale,
      width: w,
      height: h,
    };

    // Ground line.
    const [gx1, gy] = project(minX - 0.4, 0);
    const [gx2] = project(maxX + 0.4, 0);
    ctx.strokeStyle = 'rgba(72, 99, 70, .35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx1, gy);
    ctx.lineTo(gx2, gy);
    ctx.stroke();

    const paths = new Map<string, Path2D>();
    const ensurePath = (color: string) => {
      let p = paths.get(color);
      if (!p) {
        p = new Path2D();
        paths.set(color, p);
      }
      return p;
    };

    for (const b of branches) {
      const label = store.annotations[b.id]?.label;
      const color = label ? LABEL_META[label].color : UNLABELED_COLOR;
      const p = ensurePath(color);
      const [x1, y1] = project(b.start[0], b.start[1]);
      const [x2, y2] = project(b.end[0], b.end[1]);
      p.moveTo(x1, y1);
      p.lineTo(x2, y2);
    }
    ctx.lineCap = 'round';
    for (const [color, path] of paths) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = color === UNLABELED_COLOR ? 0.42 : 0.95;
      ctx.lineWidth = color === UNLABELED_COLOR ? 0.8 : 1.35;
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;

    // Cut markers.
    for (const b of branches) {
      const cut = store.annotations[b.id]?.cut;
      if (!cut) continue;
      const [x, y] = project(cut.position[0], cut.position[1]);
      ctx.fillStyle = '#ffe066';
      ctx.strokeStyle = '#7c4a03';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const selected = store.selectedId;
    const sb = selected ? branches.find((b) => b.id === selected) : undefined;
    if (sb) {
      const [x1, y1] = project(sb.start[0], sb.start[1]);
      const [x2, y2] = project(sb.end[0], sb.end[1]);
      ctx.strokeStyle = '#0891b2';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.fillStyle = '#06b6d4';
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  onMount(() => {
    observer = new ResizeObserver(draw);
    if (wrapRef) observer.observe(wrapRef);
    draw();
  });
  onCleanup(() => observer?.disconnect());
  createEffect(() => {
    store.revision;
    store.selectedId;
    scheduleDraw();
  });

  const handleClick = (event: MouseEvent) => {
    if (!transform || !canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    let best: string | null = null;
    let bestDistance = 9;
    for (const b of store.dataset.branches) {
      const [x1, y1] = project(b.start[0], b.start[1]);
      const [x2, y2] = project(b.end[0], b.end[1]);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / len2));
      const x = x1 + t * dx;
      const y = y1 + t * dy;
      const d = Math.hypot(mx - x, my - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = b.id;
      }
    }
    selectBranch(best);
  };

  return (
    <div class="preview-block">
      <div class="panel-subhead">
        <span>树形预览 · 正视投影</span>
        <span class="muted">{store.dataset.branches.length.toLocaleString()} 枝</span>
      </div>
      <div class="tree-preview" ref={wrapRef}>
        <canvas ref={canvasRef} onClick={handleClick} title="点击选择最近枝条" />
      </div>
    </div>
  );
}
