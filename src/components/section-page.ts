import { BaseComponent } from './base';
import { CanvasHost } from './canvas-host';
import { store } from '../state/store';
import { buildSectionScene } from '../lib/section-scene';
import type { BaseEntity, Vent } from '../types';
import { cableCode, ventCode } from '../lib/numbering';
import { toast } from '../lib/toast';

export class SectionPage extends BaseComponent {
  private host: CanvasHost | null = null;
  /** 剖面页自身的筛选状态,null=全仓剖面;不与局部放大页共享 focusedCompartmentId */
  private filter: string | null = null;

  protected template(): string {
    return `
      <div class="layout">
        <div class="toolbar">
          <label>廒间筛选:</label>
          <select data-action-change="comp-filter" data-ref="compFilter"></select>
          <span style="width:1px;height:22px;background:var(--line)"></span>
          <button data-action="relayout">剖面标注整体让一遍</button>
          <button data-action="unpin">解除全部固定</button>
          <span class="spacer"></span>
          <div class="legend">
            <span><i class="sw" style="background:#1f6feb"></i>电缆测杆与分层测点</span>
            <span><i class="sw" style="background:#d9480f"></i>风口/风道(按标高落位)</span>
          </div>
        </div>
        <div class="main-split">
          <div class="canvas-wrap" data-ref="canvas"></div>
          <aside class="side-panel" data-ref="panel"></aside>
        </div>
      </div>`;
  }

  connectedCallback(): void {
    super.connectedCallback();
    requestAnimationFrame(() => this.mountHost());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.host?.dispose();
    this.host = null;
  }

  private currentFilter(): string | null {
    return this.filter;
  }

  private mountHost(): void {
    const container = this.refs.canvas;
    if (!container || this.host) return;
    this.host = new CanvasHost(container, {
      mode: 'section',
      compartmentFilter: () => this.currentFilter(),
      labelKey: 'sectionLabel',
      anchorOf: (e: BaseEntity) =>
        e.type === 'vent'
          ? { x: e.pos.x, y: (e as Vent).ductElevation }
          : { x: e.pos.x, y: store.state.warehouse.grainHeight },
      build: (two, cam, project) =>
        buildSectionScene(two, cam, project, {
          selectedId: store.selectedId,
          compartmentFilter: this.currentFilter()
        }),
      layoutBounds: (p) => ({
        minX: -2,
        minY: -2,
        maxX: p.warehouse.width + 2,
        maxY: p.warehouse.grainHeight + 2
      })
    });
  }

  protected onAction(action: string): void {
    switch (action) {
      case 'relayout':
        this.host?.relayoutAll();
        toast('剖面标注已整体重排');
        break;
      case 'unpin':
        store.unpinAllLabels('sectionLabel');
        this.host?.relayoutLoose();
        break;
      case 'pin-toggle': {
        const e = store.getEntity(store.selectedId);
        if (e) {
          store.updateEntity(e.id, () => {
            e.sectionLabel.pinned = !e.sectionLabel.pinned;
          });
        }
        break;
      }
    }
  }

  protected onChangeAction(action: string, el: HTMLInputElement): void {
    if (action === 'comp-filter') {
      this.filter = el.value || null;
      this.host?.fit();
      store.select(null);
      return;
    }
    const id = store.selectedId;
    const e = store.getEntity(id);
    if (!e || !id) return;
    if (action === 'section-elev') {
      const n = Number(el.value);
      if (Number.isNaN(n)) return;
      store.updateEntity(id, () => {
        if (e.type === 'vent') e.ductElevation = n;
      });
    }
  }

  protected render(): void {
    const sel = this.refs.compFilter;
    if (sel) {
      const current = this.currentFilter() ?? '';
      const options =
        `<option value="">全仓剖面</option>` +
        store.state.compartments
          .map((c) => `<option value="${c.id}" ${c.id === current ? 'selected' : ''}>${c.name}</option>`)
          .join('');
      if (sel.innerHTML !== options) sel.innerHTML = options;
    }    this.host?.refresh();
    this.renderPanel();
  }

  private renderPanel(): void {
    const panel = this.refs.panel;
    if (!panel) return;
    const p = store.state;
    const e = store.getEntity(store.selectedId);
    if (!e) {
      panel.innerHTML = `
        <h3 class="panel-title">剖面说明</h3>
        <p style="color:var(--muted);line-height:1.9">
          · 电缆按埋设深度把分层测点竖向排在粮堆内<br>
          · 风口按风道标高达落到剖面对应高程<br>
          · 平面与剖面共用同一编号,平面改编号剖面自动跟随<br>
          · 上下拖动风口符号可改风道标高<br>
          · 标注可拖动、右键固定,避让规则与平面一致
        </p>
        <div class="hint">粮堆高度 ${p.warehouse.grainHeight} m,地坪为 ±0.00m</div>`;
      return;
    }
    const pinned = e.sectionLabel.pinned;
    if (e.type === 'cable') {
      const maxDepth = e.points.reduce((m, pt) => Math.max(m, pt.depth), 0);
      panel.innerHTML = `
        <h3 class="panel-title"><span class="tag cable">电缆</span> ${cableCode(e, p.rules)}</h3>
        <div class="field"><label>平面位置 X = ${e.pos.x.toFixed(2)} m(横移请回平面页)</label></div>
        <div class="field"><label>分层测点数</label><div>${e.points.length} 个,最深 ${maxDepth.toFixed(2)} m</div></div>
        <button data-action="pin-toggle" class="${pinned ? 'active' : ''}">
          ${pinned ? '取消剖面标注固定' : '固定剖面标注'}
        </button>`;
    } else {
      panel.innerHTML = `
        <h3 class="panel-title"><span class="tag vent">风口</span> ${ventCode(e, p.rules)}</h3>
        <div class="field"><label>风道标高(米)</label>
          <input type="number" step="0.1" data-action-change="section-elev" value="${e.ductElevation}">
        </div>
        <div class="hint">在图上上下拖动风口符号同样可以调整标高;平面位置与风口形式在平面页修改。</div>
        <div style="margin-top:10px">
          <button data-action="pin-toggle" class="${pinned ? 'active' : ''}">
            ${pinned ? '取消剖面标注固定' : '固定剖面标注'}
          </button>
        </div>`;
    }
  }
}
