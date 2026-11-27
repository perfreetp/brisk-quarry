import { For, Show } from 'solid-js';
import { LABEL_META, LABEL_ORDER, type CutMarker, type PruneLabel } from '../types';
import {
  beginCutGesture,
  endCutGesture,
  ensureCutGesture,
  getBranch,
  getChildIds,
  requestSetLabel,
  selectBranch,
  store,
  updateCutLive,
} from '../state/store';
import { diameterAtT, formatCoord, formatM, formatMm, makeCut } from '../lib/math';
import TreePreview from './TreePreview';
import type { TreeViewer } from '../three/TreeViewer';

interface Props {
  viewer: TreeViewer | null;
}

export default function PropertyPanel(props: Props) {
  const branch = () => getBranch(store.selectedId);
  const annotation = () => (store.selectedId ? store.annotations[store.selectedId] : undefined);
  const cut = () => annotation()?.cut;
  const directChildren = () => (store.selectedId ? getChildIds(store.selectedId).length : 0);

  const previewCut = (next: CutMarker) => {
    const id = store.selectedId;
    if (!id) return;
    props.viewer?.previewCut(id, next);
  };

  const onRangeInput = (value: number) => {
    const b = branch();
    const id = store.selectedId;
    if (!b || !id) return;
    ensureCutGesture(id);
    const next = makeCut(b, value / 1000, null, store.minCutDiameterMm / 1000);
    updateCutLive(id, next);
    previewCut(next);
  };

  const commitRange = () => {
    endCutGesture();
    props.viewer?.hideDragPreview();
    props.viewer?.rebuildCutMarkers();
  };

  const snapToBud = (budIndex: number) => {
    const b = branch();
    const id = store.selectedId;
    if (!b || !id) return;
    const bud = b.buds[budIndex];
    if (!bud) return;
    beginCutGesture(id);
    const next = makeCut(b, bud.t, bud.id, store.minCutDiameterMm / 1000);
    updateCutLive(id, next);
    endCutGesture();
    props.viewer?.hideDragPreview();
    props.viewer?.rebuildCutMarkers();
  };

  return (
    <aside class="right-panel panel">
      <div class="property-scroll">
        <Show
          when={branch()}
          fallback={
            <div class="empty-properties">
              <div class="panel-head">
                <h2>枝条属性</h2>
              </div>
              <div class="empty-illustration">✂</div>
              <h3>点选一根枝条开始标注</h3>
              <p>在三维视图中单击枝条，或从左侧清单选择。拖动画面可任意角度环绕，滚轮缩放，右键平移。</p>
              <div class="shortcut-grid">
                <span><kbd>1</kbd> 保留</span>
                <span><kbd>2</kbd> 疏除</span>
                <span><kbd>3</kbd> 短截</span>
                <span><kbd>4</kbd> 回缩</span>
                <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> 撤销</span>
                <span><kbd>双击</kbd> 聚焦枝</span>
              </div>
            </div>
          }
        >
          {(b) => (
            <>
              <div class="panel-head property-head">
                <div>
                  <h2>{b().id}</h2>
                  <p>
                    {b().parentId ? `父枝 ${b().parentId}` : '根枝'} · 直接子枝 {directChildren()}
                  </p>
                </div>
                <button class="secondary-btn compact" onClick={() => props.viewer?.frameBranch(b().id)} title="镜头聚焦该枝">
                  聚焦
                </button>
              </div>

              <section class="property-section">
                <h3>修剪标签</h3>
                <div class="label-grid">
                  <For each={LABEL_ORDER}>
                    {(key) => {
                      const meta = LABEL_META[key];
                      return (
                        <button
                          class="label-button"
                          classList={{ active: annotation()?.label === key }}
                          style={{
                            '--label-color': meta.color,
                            '--label-text': meta.text,
                          }}
                          onClick={() => requestSetLabel(b().id, key as PruneLabel)}
                        >
                          <kbd>{meta.key}</kbd>
                          <strong>{meta.label}</strong>
                        </button>
                      );
                    }}
                  </For>
                </div>
                <p class="label-description">
                  {annotation() ? LABEL_META[annotation()!.label].description : '尚未打标签；打标签后三维枝条和左侧清单会同步变色。'}
                </p>
                <Show when={annotation()?.label === 'remove' && directChildren() > 0}>
                  <div class="warning-box">
                    ⚠ 疏除该父枝时，{directChildren()} 个直接子枝及全部后代会一并处理；确认弹窗会列出后代总数，整批次可一次撤销。
                  </div>
                </Show>
              </section>

              <Show when={cut() && (annotation()?.label === 'heading' || annotation()?.label === 'reduction')}>
                <section class="property-section cut-section">
                  <div class="section-title-row">
                    <h3>剪口位置</h3>
                    <span class="snap-state" classList={{ snapped: !!cut()?.snappedBudId }}>
                      {cut()?.snappedBudId ? `已吸附 ${cut()!.snappedBudId}` : '未吸附芽位'}
                    </span>
                  </div>
                  <input
                    class="cut-range"
                    type="range"
                    min="5"
                    max="995"
                    step="1"
                    value={Math.round((cut()?.t ?? 0.5) * 1000)}
                    onPointerDown={() => beginCutGesture(b().id)}
                    onKeyDown={() => ensureCutGesture(b().id)}
                    onInput={(e) => onRangeInput(Number(e.currentTarget.value))}
                    onChange={commitRange}
                    onPointerUp={commitRange}
                    onBlur={commitRange}
                  />
                  <div class="range-labels">
                    <span>基部</span>
                    <span>{((cut()?.t ?? 0) * 100).toFixed(1)}%</span>
                    <span>梢端</span>
                  </div>
                  <div class="coord-grid">
                    <label>X <input readOnly value={formatCoord(cut()!.position[0])} /></label>
                    <label>Y <input readOnly value={formatCoord(cut()!.position[1])} /></label>
                    <label>Z <input readOnly value={formatCoord(cut()!.position[2])} /></label>
                  </div>
                  <div class="cut-meta">
                    <span>剪口处枝径：<b>{formatMm(cut()?.diameter ?? diameterAtT(b(), cut()?.t ?? 0))}</b></span>
                    <span>约束：仅限枝条轴线内，靠近芽位自动吸附</span>
                  </div>
                  <Show when={b().buds.length > 0}>
                    <div class="bud-list">
                      <span>吸附到芽位：</span>
                      <div>
                        <For each={b().buds.slice(0, 12)}>
                          {(bud, i) => (
                            <button
                              class="bud-chip"
                              classList={{ active: cut()?.snappedBudId === bud.id }}
                              onClick={() => snapToBud(i())}
                              title={`t=${bud.t.toFixed(3)}`}
                            >
                              {i() + 1}
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                  <p class="hint">也可以直接在三维场景拖动黄色剪口环；拖近芽位时会吸附，超出梢端会被夹回。</p>
                </section>
              </Show>

              <section class="property-section">
                <h3>骨架属性</h3>
                <dl class="property-grid">
                  <div><dt>枝 ID</dt><dd>{b().id}</dd></div>
                  <div><dt>父枝 ID</dt><dd>{b().parentId ?? '—'}</dd></div>
                  <div><dt>枝长</dt><dd>{formatM(b().length)} m</dd></div>
                  <div><dt>基部枝径</dt><dd>{formatMm(b().diameter)}</dd></div>
                  <div><dt>梢部枝径</dt><dd>{formatMm(b().tipDiameter)}</dd></div>
                  <div><dt>着生角度</dt><dd>{b().angle === null ? '—' : `${b().angle!.toFixed(1)}°`}</dd></div>
                  <div><dt>芽位数</dt><dd>{b().buds.length}</dd></div>
                  <div><dt>起点</dt><dd class="mono">{b().start.map(formatCoord).join(', ')}</dd></div>
                  <div><dt>终点</dt><dd class="mono">{b().end.map(formatCoord).join(', ')}</dd></div>
                </dl>
              </section>
            </>
          )}
        </Show>
      </div>

      <TreePreview />
    </aside>
  );
}
