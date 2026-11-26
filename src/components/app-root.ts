import { BaseComponent } from './base';
import { store } from '../state/store';
import { createSampleProject } from '../lib/sample';
import { toast } from '../lib/toast';

type Route = 'data' | 'plan' | 'section' | 'rules' | 'zoom';

const NAV: Array<{ route: Route; label: string }> = [
  { route: 'data', label: '数据录入' },
  { route: 'plan', label: '平面布点' },
  { route: 'section', label: '剖面布点' },
  { route: 'rules', label: '编号规则' },
  { route: 'zoom', label: '局部放大' }
];

export class AppRoot extends BaseComponent {
  static route: Route = 'plan';

  protected template(): string {
    return `
      <div class="app-shell">
        <style>
          :host { display: block; height: 100vh; }
          .app-shell { display: flex; flex-direction: column; height: 100%; }
          header.topbar {
            display: flex; align-items: center; gap: 14px;
            padding: 0 16px; height: 52px;
            background: #1d2733; color: #fff; flex: none;
          }
          .brand { font-weight: 700; font-size: 15px; white-space: nowrap; }
          .brand small { color: #9fb0c3; font-weight: 400; margin-left: 8px; }
          nav { display: flex; gap: 4px; }
          nav button {
            background: transparent; border: none; color: #c4d0de;
            padding: 8px 14px; border-radius: 6px;
          }
          nav button:hover { color: #fff; background: rgba(255,255,255,0.08); }
          nav button.active { background: #1f6feb; color: #fff; font-weight: 700; }
          .top-actions { margin-left: auto; display: flex; gap: 8px; }
          .top-actions button { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25); color: #fff; }
          .top-actions button:hover { background: rgba(255,255,255,0.2); }
          main { flex: 1; min-height: 0; }
          main > * { display: block; height: 100%; }
        </style>
        <header class="topbar">
          <div class="brand">测温电缆与风口布点排版工具<small>符号与标注联动 · 平面/剖面同编号</small></div>
          <nav>
            ${NAV.map(
              (n) =>
                `<button data-action="nav:${n.route}" class="${
                  AppRoot.route === n.route ? 'active' : ''
                }">${n.label}</button>`
            ).join('')}
          </nav>
          <div class="top-actions">
            <button data-action="undo" title="撤销 Ctrl+Z">撤销</button>
            <button data-action="redo" title="重做 Ctrl+Y">重做</button>
            <button data-action="export">导出工程</button>
            <button data-action="import">打开工程</button>
            <button data-action="sample">载入示例</button>
          </div>
          <input type="file" data-ref="fileInput" accept=".json,application/json" hidden />
        </header>
        <main data-ref="viewport"></main>
      </div>`;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.onKeyDown);
    this.refs.fileInput.addEventListener('change', this.onFileChosen);
    this.root.addEventListener('navigate', this.onNavigate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKeyDown);
    this.refs.fileInput.removeEventListener('change', this.onFileChosen);
    this.root.removeEventListener('navigate', this.onNavigate);
  }

  private onNavigate = (ev: Event): void => {
    const route = (ev as CustomEvent<Route>).detail;
    if (route) {
      AppRoot.route = route;
      this.render();
    }
  };

  private onKeyDown = (ev: KeyboardEvent): void => {
    const tag = (ev.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      ev.shiftKey ? store.redo() : store.undo();
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
      ev.preventDefault();
      store.redo();
    }
  };

  private onFileChosen = (ev: Event): void => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importJSON(String(reader.result));
        toast('工程已打开,符号与标注对应关系已恢复');
      } catch (err) {
        toast(`打开失败:${(err as Error).message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
    input.value = '';
  };

  protected onAction(action: string): void {
    if (action.startsWith('nav:')) {
      AppRoot.route = action.slice(4) as Route;
      this.render();
      return;
    }
    switch (action) {
      case 'undo':
        store.undo();
        break;
      case 'redo':
        store.redo();
        break;
      case 'export':
        store.exportFile();
        toast('工程 JSON 已导出,可随时再打开续改');
        break;
      case 'import':
        this.refs.fileInput.click();
        break;
      case 'sample':
        store.loadProject(createSampleProject());
        toast('示例工程已载入');
        break;
    }
  }

  protected render(): void {
    // 顶部导航高亮
    this.root.querySelectorAll('nav button').forEach((btn, i) => {
      btn.classList.toggle('active', NAV[i].route === AppRoot.route);
    });
    const viewport = this.refs.viewport;
    const tagMap: Record<Route, string> = {
      data: 'data-page',
      plan: 'plan-page',
      section: 'section-page',
      rules: 'rules-page',
      zoom: 'zoom-page'
    };
    const tag = tagMap[AppRoot.route];
    if (viewport.firstElementChild?.tagName.toLowerCase() !== tag) {
      viewport.innerHTML = `<${tag}></${tag}>`;
    }
  }
}
