import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import Toolbar from './components/Toolbar';
import BranchList from './components/BranchList';
import PropertyPanel from './components/PropertyPanel';
import { TreeViewer } from './three/TreeViewer';
import { parseSkeletonJson } from './lib/parseSkeleton';
import { createSampleTree } from './data/sampleTree';
import { buildTreatmentCsv, downloadBlob, downloadTextFile, safeFileStem } from './lib/exportFiles';
import {
  cancelCascade,
  confirmCascade,
  endCutGesture,
  getBranch,
  loadDataset,
  redo,
  requestSetLabel,
  selectBranch,
  setHoverInfo,
  showToast,
  beginCutGesture,
  store,
  undo,
  updateCutLive,
} from './state/store';
import { LABEL_META, LABEL_ORDER } from './types';

export default function App() {
  let viewportRef!: HTMLDivElement;
  const [viewer, setViewer] = createSignal<TreeViewer | null>(null);
  const [unit, setUnit] = createSignal<'m' | 'cm' | 'mm'>('m');
  const [exportingGlb, setExportingGlb] = createSignal(false);
  const [showHelp, setShowHelp] = createSignal(false);

  onMount(() => {
    const treeViewer = new TreeViewer(viewportRef, store.dataset.branches, {
      onSelect: (id) => selectBranch(id),
      onHover: (info) => setHoverInfo(info),
      getAnnotations: () => store.annotations,
      getMinCutDiameter: () => store.minCutDiameterMm / 1000,
      onCutGestureStart: (id) => beginCutGesture(id),
      onCutChange: (id, cut) => updateCutLive(id, cut),
      onCutGestureEnd: () => endCutGesture(),
    });
    setViewer(treeViewer);

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && (target as HTMLInputElement).type !== 'range';

      if (showHelp()) {
        if (e.key === 'Escape') setShowHelp(false);
        return;
      }
      if (store.pendingCascade) {
        if (e.key === 'Escape') cancelCascade();
        if (e.key === 'Enter') confirmCascade();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      if (e.key === 'Escape') selectBranch(null);
      if (store.selectedId && ['1', '2', '3', '4'].includes(e.key)) {
        const label = LABEL_ORDER[Number(e.key) - 1];
        if (label) {
          e.preventDefault();
          requestSetLabel(store.selectedId!, label);
        }
      }
      if (e.key.toLowerCase() === 'f' && store.selectedId) viewer()?.frameBranch(store.selectedId);
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      treeViewer.destroy();
    });
  });

  // Full visual sync after committed label / undo / import transactions.
  createEffect(() => {
    store.committedRevision;
    const v = viewer();
    if (v) {
      v.refreshColors();
      v.rebuildCutMarkers();
    }
  });

  createEffect(() => {
    store.selectedId;
    viewer()?.setSelection(store.selectedId);
  });

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const dataset = parseSkeletonJson(json, { fileName: file.name, fallbackUnit: unit() });
      loadDataset(dataset);
      viewer()?.loadTree(dataset.branches);
      if (dataset.warnings.length) {
        showToast(`已导入 ${dataset.branches.length} 枝，${dataset.warnings.length} 条数据警告（见控制台）`, 'info');
        console.warn('[骨架导入警告]', dataset.warnings);
      } else {
        showToast(`成功导入 ${dataset.branches.length.toLocaleString()} 根枝条`, 'success');
      }
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : 'JSON 导入失败', 'error');
    }
  };

  const handleSample = () => {
    const dataset = createSampleTree();
    loadDataset(dataset);
    viewer()?.loadTree(dataset.branches);
    showToast(`已生成 ${dataset.branches.length.toLocaleString()} 根枝的示例树`, 'success');
  };

  const handleCsv = () => {
    const csv = buildTreatmentCsv(store.dataset, store.annotations);
    downloadTextFile(`${safeFileStem(store.dataset.name)}_修剪处理清单.csv`, csv);
    showToast('CSV 已导出，包含剪口 X/Y/Z 与吸附芽位', 'success');
  };

  const handleGlb = async () => {
    const v = viewer();
    if (!v) return;
    setExportingGlb(true);
    try {
      const buffer = await v.exportGlb();
      downloadBlob(`${safeFileStem(store.dataset.name)}_着色修剪模型.glb`, new Blob([buffer], { type: 'model/gltf-binary' }));
      showToast('GLB 模型已导出：按处理标签着色并包含剪口环', 'success');
    } catch (error) {
      console.error(error);
      showToast('GLB 导出失败，请查看控制台', 'error');
    } finally {
      setExportingGlb(false);
    }
  };

  const hoverBranch = () => (store.hoverInfo ? getBranch(store.hoverInfo.id) : undefined);

  return (
    <div class="app-shell">
      <Toolbar
        unit={unit()}
        onUnitChange={setUnit}
        onFile={handleFile}
        onLoadSample={handleSample}
        onExportCsv={handleCsv}
        onExportGlb={handleGlb}
        onHelp={() => setShowHelp(true)}
        exportingGlb={exportingGlb()}
      />

      <main class="workspace">
        <BranchList onFocusBranch={(id) => viewer()?.frameBranch(id)} />

        <section class="viewport-panel">
          <div class="viewport-host" ref={viewportRef} />

          <div class="viewport-toolbar">
            <button class="secondary-btn compact" onClick={() => viewer()?.resetView()}>复位视角</button>
            <Show when={store.selectedId}>
              <button class="secondary-btn compact" onClick={() => viewer()?.frameBranch(store.selectedId!)}>聚焦选中枝</button>
            </Show>
            <span class="viewport-hint">左键旋转 · 滚轮缩放 · 右键平移 · 点枝选择 · 拖动黄环改剪口</span>
          </div>

          <div class="legend" aria-label="标签颜色图例">
            <For each={LABEL_ORDER}>
              {(key) => (
                <span class="legend-item">
                  <i style={{ background: LABEL_META[key].color }} />
                  {LABEL_META[key].label}
                </span>
              )}
            </For>
            <span class="legend-item"><i class="cut-legend" />剪口</span>
          </div>

          <Show when={store.hoverInfo}>
            {(info) => {
              const b = hoverBranch();
              const ann = () => store.annotations[info().id];
              return (
                <div
                  class="hover-tip"
                  style={{
                    left: `${Math.min(info().x + 14, window.innerWidth - 210)}px`,
                    top: `${Math.min(info().y + 14, window.innerHeight - 90)}px`,
                  }}
                >
                  <b>{info().id}</b>
                  <Show when={b}>
                    <span>{b ? b.length.toFixed(2) : ''} m · {b ? (b.diameter * 1000).toFixed(1) : ''} mm</span>
                  </Show>
                  <Show when={ann()}>
                    <em style={{ color: LABEL_META[ann()!.label].color }}>{LABEL_META[ann()!.label].label}</em>
                  </Show>
                </div>
              );
            }}
          </Show>
        </section>

        <PropertyPanel viewer={viewer()} />
      </main>

      <Show when={store.pendingCascade}>
        {(pending) => (
          <div class="modal-backdrop" onClick={cancelCascade}>
            <div class="modal cascade-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div class="modal-icon warning">!</div>
              <h2>父枝疏除将影响子枝</h2>
              <p>
                枝条 <b class="mono">{pending().id}</b> 下挂有 <b>{pending().directCount}</b> 个直接子枝，
                共 <b class="danger-text">{pending().descendantIds.length}</b> 个后代枝。
              </p>
              <p>父枝从基部疏除后，着生在其下级枝段上的后代也会失去保留位置。系统将把这些后代一并标记为“疏除”，旧剪口会同时清除。</p>
              <div class="modal-actions">
                <button class="secondary-btn" onClick={cancelCascade}>取消</button>
                <button class="danger-btn" onClick={confirmCascade}>一并疏除 {pending().descendantIds.length + 1} 枝</button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={showHelp()}>
        <div class="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div class="modal help-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">
              <h2>骨架 JSON 格式与操作说明</h2>
              <button class="ghost-mini large" onClick={() => setShowHelp(false)}>×</button>
            </div>
            <div class="help-content">
              <p>支持直接枝条数组，或包含 <code>branches / items / data / skeleton</code> 的对象。字段支持常见英文、拼音风格及中文键名。</p>
              <pre>{`{
  "unit": "m",            // m / cm / mm；也可放在 meta.unit
  "upAxis": "y",          // y 或 z；z-up 会自动转到 PlayCanvas 的 Y-up
  "branches": [
    {
      "id": "B0001",
      "parentId": "B0000",
      "start": [0, 1.2, 0],
      "end": [0.2, 1.8, 0.1],
      "diameter": 0.042,  // 也支持 diameter_mm / “枝径”
      "length": 0.72,
      "angle": 48,
      "buds": [
        { "id": "bud-3", "t": 0.62 }
      ]
    }
  ]
}`}</pre>
              <ul>
                <li>坐标和长度按真实单位换算为米，三维场景带 1 m 网格地面。</li>
                <li>短截 / 回缩会生成黄色剪口环；拖动时在 22 px 内吸附芽位，位置始终夹在枝条轴线内。</li>
                <li>更换标签会以新记录替换旧标注，因此旧剪口一并清除。</li>
                <li>撤销 / 重做覆盖标签、级联疏除和一次完整剪口拖动。</li>
                <li>CSV 含剪口 t、X/Y/Z、吸附芽位和剪口直径；GLB 按标签颜色导出整棵着色模型与剪口环。</li>
              </ul>
            </div>
          </div>
        </div>
      </Show>

      <Show when={store.toast}>
        {(toast) => <div class={`toast ${toast().kind}`}>{toast().message}</div>}
      </Show>
    </div>
  );
}
