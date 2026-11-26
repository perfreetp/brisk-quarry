import { AtlasStore } from '../state/store';
import { downloadJson, parseAtlasFile } from '../state/persistence';
import { createDefaultProject } from '../model/defaultProject';
import { formatChainage, parseChainage } from '../geometry/alignment';
import type { LegendSymbol, ProjectDocument } from '../types';
import './paper-sheet';
import type { PaperSheetElement } from './paper-sheet';
import './number-field';
import type { NumberFieldElement } from './number-field';
import paper from 'paper';

const SYMBOL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'custom', label: '通用说明块' },
  { value: 'alignment', label: '铁路红线' },
  { value: 'station', label: '桩号' },
  { value: 'grass', label: '草方格带' },
  { value: 'grid', label: '方格网格' },
  { value: 'forest', label: '林带' },
  { value: 'seedling', label: '苗木' },
  { value: 'hole', label: '孔洞' },
  { value: 'repair', label: '自交修复' },
  { value: 'note', label: '注释' },
];

const template = document.createElement('template');
template.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">草</div>
        <div>
          <h1>草格林带图册排版工作室</h1>
          <p>原生 TypeScript · Web Components · Paper.js 矢量排版 · opentype.js 工程字</p>
        </div>
      </div>
      <div class="top-actions">
        <button data-action="k5" class="btn accent">定位 K5 弯道</button>
        <button data-action="add-legend-k5" class="btn">到第 3 页补图例</button>
        <button data-action="relayout" class="btn">整版重排</button>
        <span class="divider"></span>
        <button data-action="new" class="btn ghost">新建示例</button>
        <button data-action="open" class="btn ghost">打开图册</button>
        <button data-action="save" class="btn primary">保存图册</button>
        <button data-action="svg" class="btn ghost">本页 SVG</button>
        <button data-action="export-html" class="btn ghost">图册 HTML/打印</button>
        <input type="file" accept=".json,application/json" hidden data-file />
      </div>
    </header>

    <div class="workspace">
      <aside class="panel left-panel">
        <section class="card">
          <h2>防护对象 / 红线</h2>
          <label class="text-field"><span>图册名称</span><input data-field="name" type="text" /></label>
          <label class="text-field"><span>线路名称</span><input data-field="lineName" type="text" /></label>
          <label class="text-field"><span>段落</span><input data-field="sectionName" type="text" /></label>
          <label class="text-field"><span>设计</span><input data-field="engineer" type="text" /></label>
          <div class="field-grid two">
            <number-field path="scaleDenominator" label="比例尺分母" unit="" min="500" max="5000" step="100"></number-field>
            <number-field path="pageSpanM" label="每页里程" unit="m" min="180" max="600" step="20"></number-field>
          </div>
          <div class="chainage-jump">
            <input data-chainage-input type="text" placeholder="输入 K5+000 后回车" />
            <button class="btn small" data-action="jump-chainage">定位桩号</button>
          </div>
        </section>

        <section class="card">
          <h2>图册页面</h2>
          <div class="page-list" data-page-list></div>
        </section>

        <section class="card">
          <h2>图层结构</h2>
          <div class="layer-list" data-layer-list></div>
        </section>

        <section class="card issue-card">
          <h2>路径 / 排版检查</h2>
          <div data-issue-list class="issue-list"></div>
        </section>
      </aside>

      <main class="canvas-panel">
        <paper-sheet data-sheet></paper-sheet>
        <div class="statusbar">
          <span data-status>就绪</span>
          <span data-saved></span>
        </div>
      </main>

      <aside class="panel right-panel">
        <section class="card">
          <h2>草方格规格</h2>
          <div class="field-grid">
            <number-field path="grass.cellAlong" label="纵向方格边长" unit="m" min="0.5" max="3" step="0.1"></number-field>
            <number-field path="grass.cellAcross" label="横向方格边长" unit="m" min="0.5" max="3" step="0.1"></number-field>
            <number-field path="grass.ridgeWidth" label="格埂宽度" unit="m" min="0.1" max="0.8" step="0.05"></number-field>
            <number-field path="grass.kgPerGridMeter" label="每延米格草量" unit="kg/m" min="0.1" max="1.5" step="0.01"></number-field>
          </div>
          <p class="formula">网格按修复后的带状多边形裁剪；方格数、格埂延长米和草料吨数同步重算。</p>
        </section>

        <section class="card">
          <h2>林带株行距 / 苗木</h2>
          <div class="field-grid">
            <number-field path="forest.rowSpacing" label="行距" unit="m" min="1" max="8" step="0.1"></number-field>
            <number-field path="forest.plantSpacing" label="株距" unit="m" min="0.5" max="6" step="0.1"></number-field>
            <number-field path="forest.edgeMargin" label="林缘留白" unit="m" min="0" max="4" step="0.1"></number-field>
            <number-field path="forest.lossRatePct" label="损耗率" unit="%" min="0" max="25" step="1"></number-field>
          </div>
        </section>

        <section class="card">
          <h2>带宽 / 偏距约束</h2>
          <div data-band-editor class="band-editor"></div>
        </section>

        <section class="card">
          <h2>图例管理</h2>
          <div class="legend-add">
            <input data-legend-text type="text" placeholder="新增图例文字，例如：芦苇沙障" />
            <select data-legend-symbol>
              ${SYMBOL_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
            <div class="legend-target">
              <label><input type="radio" name="legend-target" value="current" checked /> 加到当前页图例</label>
              <label><input type="radio" name="legend-target" value="page3" /> 固定补到第 3 页续图例</label>
            </div>
            <button class="btn primary small" data-action="add-legend">添加图例并重排</button>
          </div>
          <div data-legend-list class="legend-manager-list"></div>
          <label class="check-line"><input type="checkbox" data-auto-avoid /> 图例压图时自动就近避让</label>
        </section>

        <section class="card material-card">
          <h2>材料表（实时）</h2>
          <div data-material-summary></div>
          <h3>苗木表</h3>
          <div data-seedling-table></div>
        </section>
      </aside>
    </div>
    <div class="toast" data-toast></div>
  </div>
`;

function setPathValue(doc: ProjectDocument, path: string, value: number): void {
  if (path.startsWith('bands.')) {
    const [, id, key] = path.split('.');
    const band = doc.bands.find((item) => item.id === id);
    if (band && (key === 'width' || key === 'offsetStart')) {
      band[key] = value;
      if (band.width < 2) band.width = 2;
    }
    return;
  }
  const parts = path.split('.');
  let target: Record<string, unknown> = doc as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i += 1) target = target[parts[i]] as Record<string, unknown>;
  target[parts[parts.length - 1]] = value;
}

export class AtlasApp extends HTMLElement {
  private store = new AtlasStore();
  private toastTimer: number | null = null;

  connectedCallback(): void {
    this.appendChild(template.content.cloneNode(true));
    (window as unknown as { __atlasStore?: AtlasStore }).__atlasStore = this.store;
    const sheet = this.querySelector<PaperSheetElement>('paper-sheet')!;
    sheet.setStore(this.store);

    this.bindStaticFields();
    this.bindEvents();
    this.refreshAll();

    this.store.addEventListener('change', ((event: CustomEvent<{ reason: string }>) => {
      this.refreshAll();
      this.setStatus(event.detail.reason);
    }) as EventListener);
  }

  private $(selector: string): HTMLElement {
    return this.querySelector(selector) as HTMLElement;
  }

  private bindStaticFields(): void {
    const doc = this.store.doc;
    (this.$('[data-field="name"]') as HTMLInputElement).value = doc.name;
    (this.$('[data-field="lineName"]') as HTMLInputElement).value = doc.lineName;
    (this.$('[data-field="sectionName"]') as HTMLInputElement).value = doc.sectionName;
    (this.$('[data-field="engineer"]') as HTMLInputElement).value = doc.engineer;
    (this.$('[data-auto-avoid]') as HTMLInputElement).checked = doc.autoAvoidLegend;

    this.querySelectorAll<NumberFieldElement>('number-field[path]').forEach((field) => {
      const path = field.getAttribute('path')!;
      const value = this.getValueByPath(path);
      field.value = value;
    });

    if (this.dataset.fieldsBound === 'true') return;
    this.dataset.fieldsBound = 'true';

    this.querySelectorAll<HTMLInputElement>('input[data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.field as keyof ProjectDocument;
        this.store.update(`修改${key}`, (d) => {
          (d[key] as string) = input.value;
        }, false);
      });
    });

    this.addEventListener('value-change', ((event: CustomEvent<{ path: string; value: number }>) => {
      const { path, value } = event.detail;
      this.store.update(`修改 ${path}`, (doc) => setPathValue(doc, path, value));
    }) as EventListener);

    (this.$('[data-auto-avoid]') as HTMLInputElement).addEventListener('change', (event) => {
      const checked = (event.target as HTMLInputElement).checked;
      this.store.update('切换图例避让', (doc) => {
        doc.autoAvoidLegend = checked;
      }, false);
    });
  }

  private getValueByPath(path: string): number {
    if (path.startsWith('bands.')) {
      const [, id, key] = path.split('.');
      const band = this.store.doc.bands.find((item) => item.id === id);
      return Number(band?.[key as 'width'] ?? 0);
    }
    return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], this.store.doc) as number;
  }

  private bindEvents(): void {
    this.addEventListener('click', (event) => {
      const actionEl = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === 'save') this.saveAtlas();
      if (action === 'open') (this.$('[data-file]') as HTMLInputElement).click();
      if (action === 'new') this.newProject();
      if (action === 'svg') this.exportSvg();
      if (action === 'export-html') this.exportAtlasHtml();
      if (action === 'k5') this.locateChainage(5000);
      if (action === 'jump-chainage') {
        const input = this.$('[data-chainage-input]') as HTMLInputElement;
        const value = parseChainage(input.value);
        if (value === null) this.showToast('桩号格式示例：K5+020');
        else this.locateChainage(value);
      }
      if (action === 'add-legend-k5') this.addLegendEntry(true);
      if (action === 'add-legend') this.addLegendEntry(false);
      if (action === 'relayout') this.relayout();
    });

    this.$('[data-file]').addEventListener('change', async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = parseAtlasFile(text);
        this.store.replaceDocument(parsed.document, `打开 ${file.name}`);
        this.bindStaticFields();
        this.showToast(`已打开 ${file.name}，图层、桩号和材料表结构已恢复`);
      } catch (error) {
        console.error(error);
        this.showToast('打开失败：文件不是有效的图册 JSON');
      } finally {
        input.value = '';
      }
    });

    this.$('[data-chainage-input]').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        const value = parseChainage((event.target as HTMLInputElement).value);
        if (value !== null) this.locateChainage(value);
      }
    });
  }

  private refreshAll(): void {
    this.renderPages();
    this.renderLayers();
    this.renderBandEditor();
    this.renderTables();
    this.renderIssues();
    this.renderLegendManager();
    this.updateHeaderFields();
    this.$('[data-saved]').textContent = this.store.lastSavedAt
      ? `本地草稿已保存 ${new Date(this.store.lastSavedAt).toLocaleTimeString('zh-CN')}`
      : '';
  }

  private updateHeaderFields(): void {
    const doc = this.store.doc;
    const mapping: Record<string, string> = {
      name: doc.name,
      lineName: doc.lineName,
      sectionName: doc.sectionName,
      engineer: doc.engineer,
    };
    Object.entries(mapping).forEach(([key, value]) => {
      const input = this.querySelector<HTMLInputElement>(`[data-field="${key}"]`);
      if (input && document.activeElement !== input) input.value = value;
    });
  }

  private renderPages(): void {
    const container = this.$('[data-page-list]');
    container.innerHTML = this.store.computed.pages.map((page) => `
      <button class="page-item ${page.id === this.store.doc.currentPageId ? 'active' : ''}" data-page-id="${page.id}">
        <span class="page-no">${page.index + 1}</span>
        <span class="page-meta">
          <strong>${page.shortTitle}</strong>
          <small>${page.startChainage !== undefined ? `${formatChainage(page.startChainage)}–${formatChainage(page.endChainage!)}` : `续 ${page.tableRows ?? 0} 行`}</small>
        </span>
      </button>
    `).join('');
    container.querySelectorAll<HTMLButtonElement>('[data-page-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.pageId!;
        this.store.update(`翻到${id}`, (doc) => { doc.currentPageId = id; }, false);
      });
    });
  }

  private renderLayers(): void {
    const container = this.$('[data-layer-list]');
    container.innerHTML = this.store.doc.layers.map((layer) => `
      <div class="layer-row">
        <label><input type="checkbox" data-layer-visible="${layer.id}" ${layer.visible ? 'checked' : ''}/> 显</label>
        <label><input type="checkbox" data-layer-lock="${layer.id}" ${layer.locked ? 'checked' : ''}/> 锁</label>
        <span>${layer.name}</span>
      </div>
    `).join('');
    container.querySelectorAll<HTMLInputElement>('[data-layer-visible]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.layerVisible!;
        this.store.update('切换图层可见性', (doc) => {
          const layer = doc.layers.find((item) => item.id === id);
          if (layer) layer.visible = input.checked;
        }, false);
      });
    });
    container.querySelectorAll<HTMLInputElement>('[data-layer-lock]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.layerLock!;
        this.store.update('切换图层锁定', (doc) => {
          const layer = doc.layers.find((item) => item.id === id);
          if (layer) layer.locked = input.checked;
        }, false);
      });
    });
  }

  private renderBandEditor(): void {
    const container = this.$('[data-band-editor]');
    container.innerHTML = this.store.doc.bands.map((band) => `
      <div class="band-row" data-band="${band.id}">
        <strong>${band.name}</strong>
        <label>起偏距<input type="number" min="0" max="80" step="0.5" data-band-key="offsetStart" value="${band.offsetStart}"/></label>
        <label>带宽<input type="number" min="2" max="80" step="0.5" data-band-key="width" value="${band.width}"/></label>
      </div>
    `).join('');
    container.querySelectorAll<HTMLDivElement>('.band-row').forEach((row) => {
      const id = row.dataset.band!;
      row.querySelectorAll<HTMLInputElement>('input[data-band-key]').forEach((input) => {
        input.addEventListener('input', () => {
          const key = input.dataset.bandKey as 'offsetStart' | 'width';
          const value = Number(input.value);
          if (!Number.isFinite(value)) return;
          this.store.update(`调整${key}`, (doc) => {
            const band = doc.bands.find((item) => item.id === id);
            if (band) band[key] = value;
          });
        });
      });
    });
  }

  private renderTables(): void {
    const q = this.store.computed.quantities;
    this.$('[data-material-summary]').innerHTML = `
      <table class="data-table">
        <tbody>
          <tr><td>草方格净面积</td><th>${q.grassAreaM2.toFixed(1)} ㎡</th></tr>
          <tr><td>草方格面积</td><th>${q.grassAreaHa.toFixed(3)} ha</th></tr>
          <tr><td>方格数量</td><th>${q.grassCells.toLocaleString('zh-CN')} 格</th></tr>
          <tr><td>格埂延长米</td><th>${q.grassLineM.toFixed(0)} m</th></tr>
          <tr><td>草料汇总</td><th>${q.grassT.toFixed(2)} t</th></tr>
          <tr><td>林带净面积</td><th>${q.forestAreaM2.toFixed(1)} ㎡</th></tr>
          <tr><td>设计株数</td><th>${q.plantCount.toLocaleString('zh-CN')} 株</th></tr>
          <tr><td>含损耗需苗量</td><th class="strong">${q.seedlingCount.toLocaleString('zh-CN')} 株</th></tr>
        </tbody>
      </table>`;
    this.$('[data-seedling-table]').innerHTML = `
      <table class="data-table">
        <thead><tr><th>树种</th><th>设计</th><th>需苗</th><th>规格</th></tr></thead>
        <tbody>
          ${q.species.map((s) => `
            <tr>
              <td><span class="dot" style="background:${s.species.color}"></span>${s.species.name}</td>
              <td>${s.designCount.toLocaleString('zh-CN')}</td>
              <td><b>${s.seedlingCount.toLocaleString('zh-CN')}</b></td>
              <td class="spec">${s.species.specification}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  private renderIssues(): void {
    const issues = this.store.computed.quantities.issues;
    this.$('[data-issue-list]').innerHTML = issues.length
      ? issues.map((issue) => `
        <div class="issue warning">
          <b>${issue.title}</b>
          <p>${issue.detail}</p>
        </div>`).join('')
      : '<div class="issue ok"><b>检查通过</b><p>路径闭合，无未处理自交。</p></div>';
  }

  private renderLegendManager(): void {
    const container = this.$('[data-legend-list]');
    if (!container) return;
    container.innerHTML = this.store.doc.legend.map((entry) => `
      <div class="legend-manager-row">
        <span class="legend-symbol" data-symbol="${entry.symbol}"></span>
        <span>${entry.label}</span>
      </div>
    `).join('');
  }

  private locateChainage(chainage: number): void {
    const rel = chainage - this.store.doc.alignment.startChainage;
    if (rel < 0 || rel > this.store.computed.alignmentLengthM) {
      this.showToast(`桩号超出当前防护段 ${formatChainage(this.store.doc.alignment.startChainage)}–${formatChainage(this.store.doc.alignment.startChainage + this.store.computed.alignmentLengthM)}`);
      return;
    }
    const page = this.store.computed.pages.find((p) => p.kind === 'plan' && chainage >= (p.startChainage ?? -Infinity) && chainage <= (p.endChainage ?? Infinity));
    if (page) {
      this.store.update(`定位 ${formatChainage(chainage)}`, (doc) => { doc.currentPageId = page.id; }, false);
      this.showToast(`已沿里程定位到第 ${page.index + 1} 页，弯道桩号已按 20m 加密`);
    }
  }

  private addLegendEntry(forcePage3: boolean): void {
    const input = this.$('[data-legend-text]') as HTMLInputElement | null;
    const symbolSelect = this.$('[data-legend-symbol]') as HTMLSelectElement;
    const target = forcePage3 ? 'page3' : (this.querySelector('input[name="legend-target"]:checked') as HTMLInputElement)?.value ?? 'current';
    const label = input?.value.trim() || (forcePage3 ? '补充沙障材料图例与施工说明' : '新增图例说明');
    const symbol = (symbolSelect?.value && symbolSelect.value !== 'custom' ? symbolSelect.value : 'note') as LegendSymbol;
    const id = `legend-custom-${Date.now()}`;

    this.store.update('新增图例并整版重排', (doc) => {
      doc.legend.push({ id, symbol, label });
      const targetPageId = target === 'page3' ? 'plan-3' : doc.currentPageId;
      let block = doc.furniture.find((item) => item.type === 'legend' && item.pageId === targetPageId) as Extract<ProjectDocument['furniture'][number], { type: 'legend' }> | undefined;
      if (!block) {
        block = {
          id: `legend-block-${Date.now()}`,
          type: 'legend',
          pageId: targetPageId,
          xMm: 24,
          yMm: 42,
          widthMm: 66,
          title: targetPageId === 'plan-3' ? '图例（续）' : '图例',
          continuation: targetPageId === 'plan-3',
          entryIds: [],
        };
        doc.furniture.push(block);
      }
      block.entryIds.push(id);
      doc.currentPageId = targetPageId;
    });
    if (input) input.value = '';
    this.showToast('图例已加入，纸面与材料表完成同步重排');
  }

  private relayout(): void {
    this.store.update('整版重排', (doc) => {
      // 约束变更后的重排入口：恢复续图例的可见入口，并触发所有 Paper 矢量层重建。
      if (!doc.furniture.some((item) => item.id === 'legend-cont-k5')) {
        const fallback = createDefaultProject().furniture.find((item) => item.id === 'legend-cont-k5');
        if (fallback) doc.furniture.push(fallback);
      }
    });
    this.showToast('已按最新规格、桩号和分页约束整版重排');
  }

  private saveAtlas(): void {
    const file = this.store.buildFile();
    const filename = `${this.store.doc.name.replace(/[\\/:*?"<>|\s]+/g, '_')}.atlas.json`;
    downloadJson(filename, file);
    this.showToast('图册 JSON 已保存：图层、桩号、家具位置和材料快照均在文件中');
  }

  private newProject(): void {
    if (!window.confirm('将用内置 K5 示例替换当前内容，浏览器本地草稿也会被覆盖。是否继续？')) return;
    const doc = createDefaultProject();
    this.store.replaceDocument(doc, '新建 K5 示例');
    this.bindStaticFields();
    this.showToast('已重建 K5 弯道自交示例');
  }

  private exportAtlasHtml(): void {
    try {
      const sheet = this.querySelector<PaperSheetElement>('paper-sheet')!;
      const html = sheet.exportAtlasHtml();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${this.store.doc.name.replace(/[\\/:*?"<>|\s]+/g, '_')}.html`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.showToast(`已导出全部 ${this.store.computed.pages.length} 页矢量图册 HTML，可在浏览器中直接打印为 PDF`);
    } catch (error) {
      console.error(error);
      this.showToast('图册 HTML 导出失败，请等待纸面加载后重试');
    }
  }

  private exportSvg(): void {
    try {
      const svg = paper.project.exportSVG({ asString: true }) as string;
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `atlas-${this.store.doc.currentPageId}.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.showToast('本页 SVG 已导出，文字已转为 opentype 矢量路径');
    } catch (error) {
      console.error(error);
      this.showToast('SVG 导出失败，请先等待纸面加载');
    }
  }

  private setStatus(text: string): void {
    const status = this.$('[data-status]');
    if (status) status.textContent = `最近变更：${text} · 已按单一数据源重算并重绘`;
  }

  private showToast(message: string): void {
    const toast = this.$('[data-toast]');
    toast.textContent = message;
    toast.classList.add('show');
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3600);
  }
}

customElements.define('atlas-app', AtlasApp);

declare global {
  interface HTMLElementTagNameMap {
    'atlas-app': AtlasApp;
  }
}
