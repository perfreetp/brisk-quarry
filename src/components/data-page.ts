import { BaseComponent } from './base';
import { store } from '../state/store';
import {
  CABLE_TABLE_TEMPLATE,
  VENT_TABLE_TEMPLATE,
  importCableTable,
  importVentTable
} from '../lib/import-table';
import { cableCode, ventCode } from '../lib/numbering';
import { toast } from '../lib/toast';
import type { VentKind } from '../types';

const VENT_KINDS: VentKind[] = ['地槽', '地上笼', '侧壁', '立筒'];

export class DataPage extends BaseComponent {
  private tab: 'warehouse' | 'cables' | 'vents' | 'import' = 'cables';

  protected template(): string {
    return `
      <div class="layout" style="background:var(--bg);padding:16px;overflow:auto">
        <div class="page-card">
          <div class="toolbar" style="padding:0 0 12px;border-bottom:none">
            <button data-action="tab:cables" class="active" data-ref="tabCables">测温电缆分层测点表 (${0})</button>
            <button data-action="tab:vents" data-ref="tabVents">通风口清单 (${0})</button>
            <button data-action="tab:warehouse" data-ref="tabWarehouse">仓房与廒间</button>
            <button data-action="tab:import" data-ref="tabImport">粘贴表导入</button>
          </div>
          <div data-ref="content"></div>
        </div>
      </div>`;
  }

  protected onAction(action: string, el: HTMLElement): void {
    if (action.startsWith('tab:')) {
      this.tab = action.slice(4) as DataPage['tab'];
      this.root.querySelectorAll('.toolbar button').forEach((b) => b.classList.remove('active'));
      el.classList.add('active');
      this.render();
      return;
    }
    switch (action) {
      case 'add-cable': {
        const compId = store.focusedCompartmentId ?? store.state.compartments[0]?.id;
        if (compId) store.addCable(compId, { x: 2, y: 2 });
        break;
      }
      case 'add-vent': {
        const compId = store.focusedCompartmentId ?? store.state.compartments[0]?.id;
        if (compId) store.addVent(compId, { x: 2, y: 2 });
        break;
      }
      case 'add-comp':
        store.addCompartment();
        break;
      case 'import-cables':
        this.runImport('cable');
        break;
      case 'import-vents':
        this.runImport('vent');
        break;
      case 'fill-template-cable':
        this.setImportArea(CABLE_TABLE_TEMPLATE);
        break;
      case 'fill-template-vent':
        this.setImportArea(VENT_TABLE_TEMPLATE);
        break;
      default:
        if (action.startsWith('del-entity:')) {
          store.removeEntity(action.slice('del-entity:'.length));
        } else if (action.startsWith('del-comp:')) {
          store.removeCompartment(action.slice('del-comp:'.length));
        }
        break;
    }
  }

  private setImportArea(value: string): void {
    const area = this.root.querySelector<HTMLTextAreaElement>('[data-ref="importArea"]');
    if (area) area.value = value;
  }

  private runImport(kind: 'cable' | 'vent'): void {
    // 实时查询,避免 refs 在多次 render 后与 DOM 错位
    const area = this.root.querySelector<HTMLTextAreaElement>('[data-ref="importArea"]');
    // 不能用全局 trim():它会删掉首行开头的 Tab(缺省编号列),导致整列错位
    const text = area?.value ?? '';
    if (text.trim().length === 0) {
      toast('请先把 Excel 里的表粘贴到文本框');
      return;
    }
    // 先压导入前快照,解析函数在当前工程上就地追加,整次导入可一次撤销
    const project = store.beginBulkImport();
    const result =
      kind === 'cable'
        ? importCableTable(project, text)
        : importVentTable(project, text);
    store.endBulkImport();
    if (result.cablesAdded + result.ventsAdded === 0) {
      toast(`没有可导入的有效行${result.errors[0] ? `:${result.errors[0]}` : ''}`);
      return;
    }
    const errors = result.errors.length ? `,${result.errors.length} 行被跳过` : '';
    toast(
      kind === 'cable'
        ? `已导入 ${result.cablesAdded} 根电缆${errors}`
        : `已导入 ${result.ventsAdded} 个风口${errors}`
    );
    if (result.errors.length) console.warn(result.errors);
  }

  protected onInputAction(action: string, el: HTMLInputElement): void {
    const p = store.state;
    const n = Number(el.value);
    store.updateProject(() => {
      switch (action) {
        case 'wh-name':
          p.name = el.value;
          break;
        case 'wh-width':
          if (!Number.isNaN(n)) p.warehouse.width = n;
          break;
        case 'wh-depth':
          if (!Number.isNaN(n)) p.warehouse.depth = n;
          break;
        case 'wh-grain':
          if (!Number.isNaN(n)) p.warehouse.grainHeight = n;
          break;
      }
    });
  }

  protected onChangeAction(action: string, el: HTMLInputElement): void {
    const [kind, id, field] = action.split(':');
    if (kind === 'comp') {
      const comp = store.state.compartments.find((c) => c.id === id);
      if (!comp) return;
      store.updateCompartment(id, (c) => {
        const n = Number(el.value);
        if (field === 'name') c.name = el.value;
        else if (!Number.isNaN(n)) {
          if (field === 'x') c.rect.x = n;
          if (field === 'y') c.rect.y = n;
          if (field === 'w') c.rect.w = n;
          if (field === 'h') c.rect.h = n;
        }
      });
      return;
    }
    const entity = store.getEntity(id ?? null);
    if (!entity) return;
    store.updateEntity(entity.id, (e) => {
      if (kind === 'vent' && e.type === 'vent') {
        if (field === 'kind') e.kind = el.value as VentKind;
        else if (field === 'comp') e.compartmentId = el.value;
        else {
          const n = Number(el.value);
          if (!Number.isNaN(n)) {
            if (field === 'elev') e.ductElevation = n;
            if (field === 'angle') e.angle = n;
          }
        }
      }
      if (kind === 'cable' && e.type === 'cable' && field === 'comp') {
        e.compartmentId = el.value;
      }
    });
  }

  protected render(): void {
    const p = store.state;
    this.refs.tabCables.textContent = `测温电缆分层测点表 (${p.cables.length})`;
    this.refs.tabVents.textContent = `通风口清单 (${p.vents.length})`;
    const content = this.refs.content;
    if (this.tab === 'warehouse') content.innerHTML = this.warehouseTemplate();
    else if (this.tab === 'cables') content.innerHTML = this.cablesTemplate();
    else if (this.tab === 'vents') content.innerHTML = this.ventsTemplate();
    else content.innerHTML = this.importTemplate();
  }

  private warehouseTemplate(): string {
    const p = store.state;
    const compRows = p.compartments
      .map(
        (c) => `
        <tr>
          <td><input value="${c.name}" data-action-input="comp:${c.id}:name" style="min-width:90px"></td>
          <td><input type="number" step="0.1" value="${c.rect.x}" data-action-change="comp:${c.id}:x"></td>
          <td><input type="number" step="0.1" value="${c.rect.y}" data-action-change="comp:${c.id}:y"></td>
          <td><input type="number" step="0.1" value="${c.rect.w}" data-action-change="comp:${c.id}:w"></td>
          <td><input type="number" step="0.1" value="${c.rect.h}" data-action-change="comp:${c.id}:h"></td>
          <td><button class="danger" data-action="del-comp:${c.id}">删除</button></td>
        </tr>`
      )
      .join('');
    return `
      <div style="max-width:980px">
        <h3 class="panel-title">工程与仓房</h3>
        <div class="form-grid">
          <div class="field"><label>工程名称</label>
            <input type="text" value="${p.name}" data-action-input="wh-name"></div>
          <div class="field"><label>仓房平面长 X(米)</label>
            <input type="number" step="0.1" value="${p.warehouse.width}" data-action-input="wh-width"></div>
          <div class="field"><label>仓房平面宽 Y(米)</label>
            <input type="number" step="0.1" value="${p.warehouse.depth}" data-action-input="wh-depth"></div>
          <div class="field"><label>粮堆高度(米,剖面用)</label>
            <input type="number" step="0.1" value="${p.warehouse.grainHeight}" data-action-input="wh-grain"></div>
        </div>
        <h3 class="panel-title" style="margin-top:18px">廒间划分</h3>
        <div class="table-scroll">
          <table>
            <thead><tr><th>廒间名称</th><th>X</th><th>Y</th><th>宽</th><th>高</th><th></th></tr></thead>
            <tbody>${compRows || '<tr><td colspan="6" style="color:var(--muted)">暂无廒间</td></tr>'}</tbody>
          </table>
        </div>
        <div style="margin-top:10px"><button class="primary" data-action="add-comp">＋ 新增廒间</button></div>
        <div class="hint">坐标原点在仓房左下角;局部放大页按廒间过滤符号。删除廒间会一并删除其内符号。</div>
      </div>`;
  }

  private cablesTemplate(): string {
    const p = store.state;
    const compOptions = (id: string) =>
      p.compartments
        .map(
          (c) =>
            `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${c.name}</option>`
        )
        .join('');
    const rows = p.cables
      .map((c) => {
        const layers = c.points
          .map((pt) => `${pt.layer}层@${pt.depth.toFixed(1)}m`)
          .join('、');
        return `
        <tr>
          <td><b>${cableCode(c, p.rules)}</b></td>
          <td><select data-action-change="cable:${c.id}:comp">${compOptions(c.compartmentId)}</select></td>
          <td>${c.pos.x.toFixed(2)}</td>
          <td>${c.pos.y.toFixed(2)}</td>
          <td>${c.points.length}</td>
          <td style="white-space:normal;max-width:320px">${layers || '<span style="color:var(--muted)">无测点</span>'}</td>
          <td><button class="danger" data-action="del-entity:${c.id}">删除</button></td>
        </tr>`;
      })
      .join('');
    return `
      <div style="margin:10px 0"><button class="primary" data-action="add-cable">＋ 手工新增电缆(默认2个测点,可在平面页继续调整)</button></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>编号</th><th>廒间</th><th>X(m)</th><th>Y(m)</th><th>测点数</th><th>分层深度</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" style="color:var(--muted)">暂无电缆,可用"粘贴表导入"批量录入</td></tr>'}</tbody>
        </table>
      </div>
      <div class="hint">分层测点深度可通过导入表批量维护;位置微调与引线标注在"平面布点"页完成。</div>`;
  }

  private ventsTemplate(): string {
    const p = store.state;
    const compOptions = (id: string) =>
      p.compartments
        .map(
          (c) =>
            `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${c.name}</option>`
        )
        .join('');
    const rows = p.vents
      .map((v) => `
        <tr>
          <td><b>${ventCode(v, p.rules)}</b></td>
          <td><select data-action-change="vent:${v.id}:comp">${compOptions(v.compartmentId)}</select></td>
          <td>${v.pos.x.toFixed(2)}</td>
          <td>${v.pos.y.toFixed(2)}</td>
          <td><select data-action-change="vent:${v.id}:kind">
            ${VENT_KINDS.map((k) => `<option ${k === v.kind ? 'selected' : ''}>${k}</option>`).join('')}
          </select></td>
          <td><input type="number" step="0.1" value="${v.ductElevation}" data-action-change="vent:${v.id}:elev" style="width:80px"></td>
          <td><input type="number" step="15" value="${v.angle}" data-action-change="vent:${v.id}:angle" style="width:70px"></td>
          <td><button class="danger" data-action="del-entity:${v.id}">删除</button></td>
        </tr>`)
      .join('');
    return `
      <div style="margin:10px 0"><button class="primary" data-action="add-vent">＋ 手工新增风口</button></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>编号</th><th>廒间</th><th>X(m)</th><th>Y(m)</th><th>形式</th><th>风道标高</th><th>朝向°</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8" style="color:var(--muted)">暂无风口</td></tr>'}</tbody>
        </table>
      </div>
      <div class="hint">风道标高为相对地坪的米数,负值即地槽;剖面页按此标高把风口落到粮堆剖面里。</div>`;
  }

  private importTemplate(): string {
    return `
      <div style="max-width:900px">
        <h3 class="panel-title">粘贴 Excel 表批量导入</h3>
        <p style="color:var(--muted)">从 Excel 选中编号表整块复制,粘贴到下面文本框。同一根电缆的多层测点写多行,按编号与坐标自动归并;已存在的实体不会重复,导入结果按当前编号规则重排。</p>
        <textarea data-ref="importArea" rows="10" style="width:100%;font-family:Consolas,monospace;font-size:12px"
          placeholder="电缆编号&#9;廒间&#9;X(m)&#9;Y(m)&#9;层号&#9;深度(m)"></textarea>
        <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
          <button data-action="fill-template-cable">填入电缆表示例</button>
          <button data-action="fill-template-vent">填入风口表示例</button>
          <span style="flex:1"></span>
          <button class="primary" data-action="import-cables">导入电缆表</button>
          <button class="primary" data-action="import-vents">导入风口表</button>
        </div>
      </div>`;
  }
}
