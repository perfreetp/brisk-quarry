import { BaseComponent } from './base';
import { CanvasHost } from './canvas-host';
import { store } from '../state/store';
import { buildPlanScene, defaultPlanLabel } from '../lib/two-scene';
import type { Compartment } from '../types';

export class ZoomPage extends BaseComponent {
  private host: CanvasHost | null = null;

  protected template(): string {
    return `
      <div class="layout">
        <div class="toolbar">
          <label>局部廒间:</label>
          <select data-action-change="pick" data-ref="pick"></select>
          <span style="width:1px;height:22px;background:var(--line)"></span>
          <button data-action="tool:select" class="active" data-ref="toolSelect">选择/拖动</button>
          <button data-action="tool:add-cable" data-ref="toolCable">＋ 电缆</button>
          <button data-action="tool:add-vent" data-ref="toolVent">＋ 风口</button>
          <button data-action="relayout">标注让一遍</button>
          <button data-action="fit">适应窗口</button>
          <span class="spacer"></span>
          <button class="primary" data-action="back">排好回总图(平面布点)</button>
        </div>
        <div class="canvas-wrap" data-ref="canvas">
          <div class="zoom-btns">
            <button data-action="zoom-in">＋</button>
            <button data-action="zoom-out">－</button>
          </div>
          <div class="overlay-tip">
            本页只显示并编辑当前廒间的符号,其他廒间与全仓编号不受干扰;<br>
            标注、固定状态随工程一起保存,回总图后原样保留。
          </div>
        </div>
      </div>`;
  }

  private currentComp(): Compartment | null {
    const p = store.state;
    const id = store.focusedCompartmentId ?? p.compartments[0]?.id;
    return p.compartments.find((c) => c.id === id) ?? null;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // 每次进入局部放大都明确选一个廒间,避免被其他页面遗留的聚焦状态污染
    store.focusedCompartmentId =
      store.focusedCompartmentId &&
      store.state.compartments.some((c) => c.id === store.focusedCompartmentId)
        ? store.focusedCompartmentId
        : store.state.compartments[0]?.id ?? null;
    requestAnimationFrame(() => this.mountHost());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.host?.dispose();
    this.host = null;
  }

  private mountHost(): void {
    const container = this.refs.canvas;
    if (!container || this.host) return;
    this.host = new CanvasHost(container, {
      mode: 'plan',
      compartmentFilter: () => this.currentComp()?.id ?? null,
      labelKey: 'label',
      build: (two, cam, project) =>
        buildPlanScene(two, cam, project, {
          labelText: defaultPlanLabel(project),
          selectedId: store.selectedId,
          compartmentFilter: this.currentComp()?.id ?? null
        }),
      layoutBounds: (p) => {
        const comp =
          p.compartments.find((c) => c.id === store.focusedCompartmentId) ??
          p.compartments[0];
        if (!comp) {
          return { minX: 0, minY: 0, maxX: p.warehouse.width, maxY: p.warehouse.depth };
        }
        return {
          minX: comp.rect.x - 1,
          minY: comp.rect.y - 1,
          maxX: comp.rect.x + comp.rect.w + 1,
          maxY: comp.rect.y + comp.rect.h + 1.5
        };
      }
    });
    this.host.fit();
  }

  protected onAction(action: string, el: HTMLElement): void {
    if (action.startsWith('tool:')) {
      this.host?.setTool(action.slice(5) as 'select' | 'add-cable' | 'add-vent');
      this.root.querySelectorAll('.toolbar button').forEach((b) => b.classList.remove('active'));
      el.classList.add('active');
      return;
    }
    switch (action) {
      case 'relayout':
        this.host?.relayoutAll();
        break;
      case 'fit':
      case 'zoom-in':
      case 'zoom-out':
        if (action === 'fit') this.host?.fit();
        else this.host?.zoom(action === 'zoom-in' ? 1.25 : 1 / 1.25);
        break;
      case 'back':
        this.dispatchEvent(
          new CustomEvent('navigate', {
            bubbles: true,
            composed: true,
            detail: 'plan'
          })
        );
        break;
    }
  }

  protected onChangeAction(action: string, el: HTMLInputElement): void {
    if (action === 'pick') {
      store.focusedCompartmentId = el.value;
      store.select(null);
      this.host?.fit();
    }
  }

  protected render(): void {
    const sel = this.refs.pick;
    if (sel) {
      const current = this.currentComp()?.id ?? '';
      const options = store.state.compartments
        .map((c) => `<option value="${c.id}" ${c.id === current ? 'selected' : ''}>${c.name}</option>`)
        .join('');
      if (sel.innerHTML !== options) sel.innerHTML = options;
    }
    this.host?.refresh();
  }
}
