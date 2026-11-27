import { Show } from 'solid-js';
import { store, undo, redo } from '../state/store';

interface Props {
  unit: 'm' | 'cm' | 'mm';
  onUnitChange: (u: 'm' | 'cm' | 'mm') => void;
  onFile: (file: File) => void;
  onLoadSample: () => void;
  onExportCsv: () => void;
  onExportGlb: () => void;
  onHelp: () => void;
  exportingGlb: boolean;
}

export default function Toolbar(props: Props) {
  let fileInput: HTMLInputElement | undefined;

  return (
    <header class="toolbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="28" height="28">
            <path d="M16 28V12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            <path d="M16 17C11 16 8 13 7 8c5 0 8 3 9 9Z" fill="currentColor" opacity=".85" />
            <path d="M16 13c5-1 8-4 9-9-5 0-8 3-9 9Z" fill="currentColor" opacity=".62" />
            <circle cx="16" cy="28" r="2.2" fill="currentColor" />
          </svg>
        </div>
        <div class="brand-text">
          <h1>果树修剪标注台</h1>
          <span>SolidJS × PlayCanvas · 枝条骨架逐枝处理</span>
        </div>
      </div>

      <div class="toolbar-group">
        <button class="secondary-btn" onClick={() => fileInput?.click()}>
          导入骨架 JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) props.onFile(file);
            e.currentTarget.value = '';
          }}
        />
        <select
          class="unit-select"
          value={props.unit}
          onChange={(e) => props.onUnitChange(e.currentTarget.value as 'm' | 'cm' | 'mm')}
          title="JSON 未声明 unit 时使用的长度单位"
        >
          <option value="m">单位 m</option>
          <option value="cm">单位 cm</option>
          <option value="mm">单位 mm</option>
        </select>
        <button class="ghost-btn" onClick={props.onLoadSample}>
          重新生成示例
        </button>
      </div>

      <div class="toolbar-group">
        <button class="icon-btn" onClick={undo} disabled={!store.canUndo} title="撤销 Ctrl/Cmd+Z">
          ↶ 撤销
        </button>
        <button class="icon-btn" onClick={redo} disabled={!store.canRedo} title="重做 Ctrl/Cmd+Shift+Z">
          ↷ 重做
        </button>
      </div>

      <div class="toolbar-spacer" />

      <div class="dataset-name" title={store.dataset.name}>
        <b>{store.dataset.name}</b>
        <span>{store.dataset.branches.length.toLocaleString()} 枝 · {store.dataset.unit}</span>
      </div>

      <button class="ghost-btn" onClick={props.onHelp}>格式/帮助</button>
      <button class="secondary-btn" onClick={props.onExportCsv}>导出 CSV</button>
      <button class="primary-btn" onClick={props.onExportGlb} disabled={props.exportingGlb}>
        <Show when={!props.exportingGlb} fallback="GLB 生成中…">
          导出 GLB
        </Show>
      </button>
    </header>
  );
}
