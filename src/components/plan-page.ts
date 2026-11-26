import { BaseComponent } from './base';
import { CanvasHost } from './canvas-host';
import { store } from '../state/store';
import { buildPlanScene, defaultPlanLabel, detailedPlanLabel } from '../lib/two-scene';
import { cableCode, pointCode, ventCode } from '../lib/numbering';
import type { Cable, Vent, VentKind } from '../types';
import { toast } from '../lib/toast';

const VENT_KINDS: VentKind[] = ['地槽', '地上笼', '侧壁', '立筒'];

export class PlanPage extends BaseComponent {
  private host: CanvasHost | null = null;
  private detailed = false;

  protected template(): string {
    return `
      <div class="layout">
        <div class="toolbar">
          <button data-action="tool:select" class="active" data-ref="toolSelect">选择/拖动</button>
          <button data-action="tool:add-cable" data-ref="toolCable">＋ 测温电缆</button>
          <button data-action="tool:add-vent" data-ref="toolVent">＋ 通风口</button>
          <span style="width:1px;height:22px;background:var(--line)"></span>
          <button data-action="relayout">标注整体让一遍</button>
          <button data-action="unpin">解除全部固定</button>
          <button data-action="toggle-detail" data-ref="detailBtn">显示分层编号段</button>
          <span class="spacer"></span>
          <div class="legend">
            <span><i class="sw" style="background:#1f6feb;border-radius:50%"></i>测温电缆</span>
            <span><i class="sw" style="background:#d9480f"></i>通风口</span>
            <span><i class="sw" style="background:#7048e8"></i>已固定标注</span>
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
    // 等 shadow DOM 布局完成再挂 Two,保证容器有尺寸
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
      compartmentFilter: () => null,
      labelKey: 'label',
      build: (two, cam, project) =>
        buildPlanScene(two, cam, project, {
          labelText: this.detailed
            ? detailedPlanLabel(project)
            : defaultPlanLabel(project),
          selectedId: store.selectedId
        }),
      layoutBounds: (p) => ({
        minX: -1.5,
        minY: -1.5,
        maxX: p.warehouse.width + 1.5,
        maxY: p.warehouse.depth + 2.5
      })
    });
  }

  protected onAction(action: string, el: HTMLElement): void {
    if (action.startsWith('tool:')) {
      const tool = action.slice(5);
      this.host?.setTool(tool as 'select' | 'add-cable' | 'add-vent');
      this.root.querySelectorAll('.toolbar button').forEach((b) => b.classList.remove('active'));
      el.classList.add('active');
      return;
    }
    switch (action) {
      case 'relayout':
        this.host?.relayoutAll();
        toast('标注已按避让规则整体重排');
        break;
      case 'unpin':
        store.unpinAllLabels('label');
        this.host?.relayoutLoose();
        break;
      case 'toggle-detail':
        this.detailed = !this.detailed;
        this.refs.detailBtn.classList.toggle('active', this.detailed);
        this.host?.refresh();
        break;
      case 'fit':
        this.host?.fit();
        break;
      case 'zoom-in':
        this.host?.zoom(1.2);
        break;
      case 'zoom-out':
        this.host?.zoom(1 / 1.2);
        break;
      case 'delete-entity':
        if (store.selectedId) {
          store.removeEntity(store.selectedId);
          this.host?.relayoutLoose();
        }
        break;
      case 'pin-toggle':
        this.togglePin();
        break;
    }
  }

  private togglePin(): void {
    const id = store.selectedId;
    const e = store.getEntity(id);
    if (!e || !id) return;
    store.updateEntity(id, () => {
      e.label.pinned = !e.label.pinned;
    });
  }

  protected onChangeAction(action: string, el: HTMLInputElement): void {
    const id = store.selectedId;
    if (!id) return;
    const value = el.value;
    store.updateEntity(id, (e) => {
      switch (action) {
        case 'vent-kind':
          if (e.type === 'vent') e.kind = value as VentKind;
          break;
        case 'vent-angle':
          if (e.type === 'vent') e.angle = Number(value);
          break;
        case 'vent-elev':
          if (e.type === 'vent') e.ductElevation = Number(value);
          break;
        case 'compartment':
          e.compartmentId = value;
          break;
      }
    });
  }

  protected onInputAction(action: string, el: HTMLInputElement): void {
    const id = store.selectedId;
    if (!id) return;
    const n = Number(el.value);
    if (Number.isNaN(n)) return;
    store.updateEntity(id, (e) => {
      if (action === 'pos-x') e.pos.x = n;
      if (action === 'pos-y') e.pos.y = n;
      if (action === 'elev' && e.type === 'vent') e.ductElevation = n;
    });
  }

  protected render(): void {
    this.host?.refresh();
    this.renderPanel();
  }

  private renderPanel(): void {
    const panel = this.refs.panel;
    if (!panel) return;
    const e = store.getEntity(store.selectedId);
    const p = store.state;
    if (!e) {
      panel.innerHTML = `
        <h3 class="panel-title">属性面板</h3>
        <p style="color:var(--muted);line-height:1.8">
          未选中符号。<br>
          · 左键拖动符号调整埋设/开孔位置<br>
          · 拖动标注框把引线拉开,自动固定<br>
          · 右键标注切换固定/自动避让<br>
          · 滚轮缩放,中键/右键拖动画布<br>
          · 双击空白按当前工具新增符号
        </p>
        <div class="hint">
          当前工程:<b>${p.name}</b><br>
          电缆 ${p.cables.length} 根 · 风口 ${p.vents.length} 个 · 廒间 ${p.compartments.length} 个
        </div>`;
      return;
    }

    if (e.type === 'cable') {
      const c = e as Cable;
      const code = cableCode(c, p.rules);
      const rows = c.points
        .map(
          (pt) => `<tr><td>${pointCode(c, pt, p.rules)}</td><td>${pt.depth.toFixed(2)} m</td></tr>`
        )
        .join('');
      panel.innerHTML = `
        <h3 class="panel-title"><span class="tag cable">测温电缆</span> ${code}</h3>
        <div class="field"><label>所属廒间</label>
          <select data-action-change="compartment">
            ${p.compartments
              .map(
                (cmp) =>
                  `<option value="${cmp.id}" ${cmp.id === c.compartmentId ? 'selected' : ''}>${cmp.name}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field"><label>平面位置(米)</label>
          <div class="row">
            <input type="number" step="0.1" data-action-input="pos-x" value="${c.pos.x.toFixed(2)}" placeholder="X">
            <input type="number" step="0.1" data-action-input="pos-y" value="${c.pos.y.toFixed(2)}" placeholder="Y">
          </div>
        </div>
        <div class="field"><label>分层测点(编号 / 埋设深度)</label>
          <div class="table-scroll"><table>
            <thead><tr><th>测点编号</th><th>深度</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        </div>
        <div class="field"><label>测点深度在"数据录入"页维护</label></div>
        <div style="display:flex;gap:8px">
          <button data-action="pin-toggle" class="${c.label.pinned ? 'active' : ''}">
            ${c.label.pinned ? '取消标注固定' : '固定标注位置'}
          </button>
          <button data-action="delete-entity" class="danger">删除电缆</button>
        </div>
        ${c.label.pinned ? '<p style="margin-top:10px"><span class="tag pinned">已固定</span> 自动避让不会移动该标注</p>' : ''}`;
    } else {
      const v = e as Vent;
      const code = ventCode(v, p.rules);
      panel.innerHTML = `
        <h3 class="panel-title"><span class="tag vent">通风口</span> ${code}</h3>
        <div class="field"><label>所属廒间</label>
          <select data-action-change="compartment">
            ${p.compartments
              .map(
                (cmp) =>
                  `<option value="${cmp.id}" ${cmp.id === v.compartmentId ? 'selected' : ''}>${cmp.name}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field"><label>风口形式</label>
          <select data-action-change="vent-kind">
            ${VENT_KINDS.map(
              (k) => `<option ${k === v.kind ? 'selected' : ''}>${k}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field"><label>平面位置(米)</label>
          <div class="row">
            <input type="number" step="0.1" data-action-input="pos-x" value="${v.pos.x.toFixed(2)}" placeholder="X">
            <input type="number" step="0.1" data-action-input="pos-y" value="${v.pos.y.toFixed(2)}" placeholder="Y">
          </div>
        </div>
        <div class="field"><label>风道标高(米,相对地坪,负为地槽)</label>
          <input type="number" step="0.1" data-action-input="elev" value="${v.ductElevation}">
        </div>
        <div class="field"><label>朝向(度,0=朝向仓内上方)</label>
          <input type="number" step="15" data-action-change="vent-angle" value="${v.angle}">
        </div>
        <div style="display:flex;gap:8px">
          <button data-action="pin-toggle" class="${v.label.pinned ? 'active' : ''}">
            ${v.label.pinned ? '取消标注固定' : '固定标注位置'}
          </button>
          <button data-action="delete-entity" class="danger">删除风口</button>
        </div>`;
    }
  }
}
