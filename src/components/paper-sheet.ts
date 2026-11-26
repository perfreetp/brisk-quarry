import paper from 'paper';
import type { AtlasStore } from '../state/store';
import type { SheetRenderResult } from '../render/sheetRenderer';
import { renderSheet } from '../render/sheetRenderer';
import { loadEngineeringFont } from '../render/engineeringFont';
import { FRAME, nearestNonOverlappingPosition, type MmRect } from '../render/layout';
import type { FurnitureItem } from '../types';

interface DragState {
  id: string;
  pointerId: number;
  startMm: { x: number; y: number };
  startPosition: paper.Point;
  moved: boolean;
}

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; min-width: 0; }
    .sheet-shell {
      position: relative;
      background: #e2e8f0;
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      padding: 14px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.6);
    }
    canvas {
      display: block;
      width: 100%;
      height: auto;
      background: white;
      border-radius: 4px;
      box-shadow: 0 18px 45px rgba(15, 23, 42, .22);
      touch-action: none;
      cursor: default;
    }
    canvas.dragging { cursor: grabbing !important; }
    .hint {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      color: #475569;
      font-size: 12px;
      align-items: center;
    }
    .hint b { color: #0f172a; }
    .pill { background: rgba(255,255,255,.75); border: 1px solid #cbd5e1; border-radius: 999px; padding: 3px 9px; }
  </style>
  <div class="sheet-shell">
    <div class="sheet-shell">
    <canvas width="1680" height="1188" data-paper-hidpi="off" aria-label="图册纸面"></canvas>
    <div class="hint">
      <span class="pill"><b>拖拽</b> 图例块 / 指北针 / 比例尺</span>
      <span class="pill">图例压到布线时会自动就近避让</span>
      <span class="pill" data-font>opentype 工程字体加载中…</span>
    </div>
  </div>
`;

export class PaperSheetElement extends HTMLElement {
  private store?: AtlasStore;
  private canvas!: HTMLCanvasElement;
  private fontLabel!: HTMLSpanElement;
  private result?: SheetRenderResult;
  private drag: DragState | null = null;

  connectedCallback(): void {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
    this.canvas = this.shadowRoot!.querySelector('canvas')!;
    this.fontLabel = this.shadowRoot!.querySelector('[data-font]')!;

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);

    loadEngineeringFont()
      .then(() => {
        this.fontLabel.textContent = 'opentype.js：FZFangSong 矢量文字已启用';
        this.fontLabel.style.color = '#166534';
        this.render();
      })
      .catch(() => {
        this.fontLabel.textContent = 'opentype 字体未加载，已使用系统仿宋回退';
        this.fontLabel.style.color = '#9a3412';
        this.render();
      });
  }

  disconnectedCallback(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
  }

  setStore(store: AtlasStore): void {
    this.store = store;
    store.addEventListener('change', () => this.render());
    this.render();
  }

  render(): void {
    if (!this.store || !this.canvas) return;
    this.result = renderSheet(this.canvas, this.store.doc, this.store.computed);
  }

  /** 逐页重绘到离屏 canvas 并导出内嵌矢量 SVG 的可打印 HTML。 */
  exportAtlasHtml(): string {
    if (!this.store) throw new Error('图册尚未就绪');
    const exportCanvas = document.createElement('canvas');
    const originalPageId = this.store.doc.currentPageId;
    const pages: string[] = [];

    for (const page of this.store.computed.pages) {
      this.store.doc.currentPageId = page.id;
      renderSheet(exportCanvas, this.store.doc, this.store.computed);
      const svg = paper.project.exportSVG({ asString: true, precision: 2 }) as string;
      pages.push(`<section class="sheet" aria-label="${page.title}">${svg}</section>`);
    }

    this.store.doc.currentPageId = originalPageId;
    this.render();

    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<title>${this.store.doc.name} - 图册导出</title>
<style>
  @page { size: A3 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e5e7eb; font-family: "Microsoft YaHei", sans-serif; }
  .sheet { width: 420mm; height: 297mm; margin: 8mm auto; background: white; box-shadow: 0 10px 35px rgba(0,0,0,.2); overflow: hidden; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  svg { display: block; width: 100%; height: 100%; }
  @media print { body { background: white; } .sheet { margin: 0; box-shadow: none; } }
</style></head><body>${pages.join('\n')}</body></html>`;
  }

  private eventToMm(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 420,
      y: ((event.clientY - rect.top) / rect.height) * 297,
    };
  }

  private findFurnitureId(point: { x: number; y: number }): string | null {
    const hit = paper.project.hitTest(new paper.Point(point.x * 4, point.y * 4), {
      fill: true,
      stroke: true,
      tolerance: 7,
    });
    let item: paper.Item | null = hit?.item ?? null;
    while (item) {
      if (item.data?.furnitureId) return String(item.data.furnitureId);
      item = item.parent;
    }
    return null;
  }

  private findDocItem(id: string): FurnitureItem | undefined {
    return this.store?.doc.furniture.find((item) => item.id === id);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.store) return;
    const point = this.eventToMm(event);
    const id = this.findFurnitureId(point);
    if (!id) return;
    const docItem = this.findDocItem(id);
    const furnitureLayer = this.store.doc.layers.find((layer) => layer.id === 'layer-legend');
    if (!docItem || docItem.locked || furnitureLayer?.locked) return;
    const group = this.result?.furnitureGroups.get(id);
    if (!group) return;

    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('dragging');
    this.drag = {
      id,
      pointerId: event.pointerId,
      startMm: point,
      startPosition: group.position.clone(),
      moved: false,
    };
  };

  private onPointerMove = (event: PointerEvent): void => {
    const point = this.eventToMm(event);
    if (!this.drag) {
      const id = this.findFurnitureId(point);
      this.canvas.style.cursor = id ? 'move' : 'default';
      return;
    }

    const group = this.result?.furnitureGroups.get(this.drag.id);
    if (!group) return;
    const dx = (point.x - this.drag.startMm.x) * 4;
    const dy = (point.y - this.drag.startMm.y) * 4;
    if (Math.abs(dx) + Math.abs(dy) > 2) this.drag.moved = true;
    group.position = this.drag.startPosition.add(new paper.Point(dx, dy));
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.drag || !this.store) return;
    const drag = this.drag;
    this.drag = null;
    this.canvas.classList.remove('dragging');
    try {
      this.canvas.releasePointerCapture(drag.pointerId);
    } catch {
      /* pointer capture may already be released */
    }
    if (!drag.moved) return;

    const group = this.result?.furnitureGroups.get(drag.id);
    const docItem = this.findDocItem(drag.id);
    if (!group || !docItem) return;

    const bounds = group.bounds;
    let xMm = bounds.left / 4;
    let yMm = bounds.top / 4;
    const wMm = bounds.width / 4;
    const hMm = bounds.height / 4;
    let reason = '移动图面整饰位置';

    if (docItem.type === 'legend' && this.store.doc.autoAvoidLegend) {
      const obstacles: MmRect[] = [
        { x: FRAME.side.x, y: FRAME.side.y, width: FRAME.side.w, height: FRAME.side.h },
        { x: FRAME.title.x, y: FRAME.title.y, width: FRAME.title.w, height: FRAME.title.h },
      ];
      if (this.result?.mapContentBoundsMm) obstacles.push(this.result.mapContentBoundsMm);
      const solved = nearestNonOverlappingPosition(xMm, yMm, wMm, hMm, obstacles);
      xMm = solved.x;
      yMm = solved.y;
      if (solved.moved) reason = '图例压住布线，已自动避让重排';
    }

    this.store.update(reason, (doc) => {
      const item = doc.furniture.find((furniture) => furniture.id === drag.id);
      if (item) {
        item.xMm = Math.round(xMm * 10) / 10;
        item.yMm = Math.round(yMm * 10) / 10;
      }
    }, false);
  };

  private onPointerCancel = (): void => {
    this.drag = null;
    this.canvas.classList.remove('dragging');
    this.render();
  };
}

customElements.define('paper-sheet', PaperSheetElement);
