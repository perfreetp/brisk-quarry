import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import MapStage from './MapStage.jsx';
import { buildLegendGroups, sortedPonds } from '../legend.js';
import { MM_PER_PX, sheetPx, solvePoster } from '../layout.js';
import { exportEditableDraft, setLayer, setPage, state, updateLayout, updatePond, updateProject } from '../store.js';

function NorthArrow({ small }) {
  return (
    <div class={`north-arrow ${small ? 'small' : ''}`} aria-label="指北针">
      <svg viewBox="0 0 60 82" role="img">
        <text x="30" y="15" text-anchor="middle" font-size="16" font-weight="800" fill="#0f172a">N</text>
        <polygon points="30,20 45,66 30,56 15,66" fill="#0f172a" />
        <polygon points="30,20 30,56 15,66" fill="#ffffff" stroke="#0f172a" stroke-width="1.4" />
        <line x1="30" y1="56" x2="30" y2="76" stroke="#0f172a" stroke-width="2" />
      </svg>
    </div>
  );
}

function LegendSwatch(props) {
  const item = props.item;
  if (item.shape === 'line') {
    return <span class="swatch line" style={{ '--swatch-color': item.color, borderTopStyle: item.dash ? 'dashed' : 'solid' }} />;
  }
  if (item.shape === 'circle-outline') {
    return <span class="swatch circle-outline" style={{ borderColor: item.color }} />;
  }
  if (item.shape === 'rect-outline') {
    return <span class="swatch rect-outline" style={{ borderColor: item.color }} />;
  }
  if (item.shape === 'power') {
    return <span class="swatch power" style={{ background: '#fee2e2', borderColor: item.color, color: item.color }}>电</span>;
  }
  if (item.shape === 'feed') {
    return <span class="swatch feed" style={{ background: item.color }}>1</span>;
  }
  if (item.shape === 'aerator') {
    return <span class="swatch aerator" style={{ borderColor: item.color }}><i style={{ background: item.color }} /></span>;
  }
  if (item.shape === 'image') {
    return <span class="swatch image" />;
  }
  return <span class="swatch rect" style={{ background: item.color }} />;
}

function LayoutSidebar(props) {
  return (
    <aside class="side-panel layout-side">
      <section class="panel-card">
        <h3>出图幅面</h3>
        <div class="paper-options">
          <button class={`paper-card ${state.project.layout.preset === 'A1L' ? 'active' : ''}`} onClick={() => updateLayout({ preset: 'A1L' })}>
            <strong>A1 横版</strong>
            <span>841 × 594 mm</span>
            <em>值班室张贴</em>
          </button>
          <button class={`paper-card ${state.project.layout.preset === 'A3P' ? 'active' : ''}`} onClick={() => updateLayout({ preset: 'A3P' })}>
            <strong>A3 竖版</strong>
            <span>297 × 420 mm</span>
            <em>施工折叠册</em>
          </button>
        </div>
        <div class="button-row wrap">
          <button class="btn primary" onClick={() => window.print()}>打印 / 另存 PDF</button>
          <button class="btn" onClick={exportEditableDraft}>存可编辑稿</button>
        </div>
      </section>

      <section class="panel-card">
        <h3>版面文字</h3>
        <label class="field"><span>主标题</span><input value={state.project.mapTitle} onInput={(e) => updateProject({ mapTitle: e.currentTarget.value })} /></label>
        <label class="field"><span>副标题</span><input value={state.project.mapSubtitle} onInput={(e) => updateProject({ mapSubtitle: e.currentTarget.value })} /></label>
        <div class="field-grid">
          <label class="field"><span>场长署名</span><input value={state.project.manager} onInput={(e) => updateProject({ manager: e.currentTarget.value })} /></label>
          <label class="field"><span>制图</span><input value={state.project.draftsman} onInput={(e) => updateProject({ draftsman: e.currentTarget.value })} /></label>
        </div>
      </section>

      <section class="panel-card">
        <h3>版面元素</h3>
        <div class="toggle-grid">
          <label class="toggle"><input type="checkbox" checked={state.project.layout.showLegend} onChange={(e) => updateLayout({ showLegend: e.currentTarget.checked })} /><span>图例</span></label>
          <label class="toggle"><input type="checkbox" checked={state.project.layout.showTable} onChange={(e) => updateLayout({ showTable: e.currentTarget.checked })} /><span>塘口编号表</span></label>
          <label class="toggle"><input type="checkbox" checked={state.project.layout.showNorth} onChange={(e) => updateLayout({ showNorth: e.currentTarget.checked })} /><span>指北针</span></label>
        </div>
        <button class="btn subtle" onClick={() => updateLayout({ tableNX: null, tableNY: null })}>编号表归位并自动避让</button>
        <p class="muted small">直接在版面编号表中改塘口号，分区标注、图例品种编号和表格顺序使用同一数据源。拖动编号表时三张图自动重排。</p>
      </section>

      <section class="panel-card">
        <h3>图层增减 / 图例联动</h3>
        <div class="toggle-grid layout-layer-grid">
          {[
            ['basemap', '航拍底图'],
            ['ridges', '塘埂测距'],
            ['ponds', '塘口分区'],
            ['cages', '网箱'],
            ['labels', '标注'],
            ['coverage', '覆盖半径'],
            ['aerators', '增氧机'],
            ['pipes', '管路'],
            ['power', '电源'],
            ['route', '投喂路线'],
            ['feedPoints', '投喂点'],
          ].map(([key, label]) => (
            <label class="toggle">
              <input type="checkbox" checked={state.project.layers[key]} onChange={(e) => setLayer(key, e.currentTarget.checked)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section class="panel-card">
        <h3>返回图层继续改</h3>
        <div class="button-grid">
          <button class="btn" onClick={() => setPage('zone')}>改分区</button>
          <button class="btn" onClick={() => setPage('aeration')}>改增氧</button>
          <button class="btn" onClick={() => setPage('feed')}>改投喂</button>
        </div>
      </section>
    </aside>
  );
}

export default function LayoutBoard() {
  let viewportRef;
  let tableRef;
  let legendRef;
  let pageStyleEl;
  const [viewportWidth, setViewportWidth] = createSignal(1200);
  const [tableHeightMm, setTableHeightMm] = createSignal(104);
  const [legendHeightMm, setLegendHeightMm] = createSignal(210);
  const [userZoom, setUserZoom] = createSignal(1);
  const [dragging, setDragging] = createSignal(false);

  const preset = () => state.project.layout.preset;
  const isA1 = () => preset() === 'A1L';
  const tableWidthMm = () => (isA1() ? 196 : 88);
  const legendWidthMm = () => (isA1() ? 150 : 84);

  const poster = () => solvePoster(state.project, {
    table: { w: tableWidthMm(), h: tableHeightMm() },
    legend: { w: legendWidthMm(), h: legendHeightMm() },
  });
  const legendGroups = () => buildLegendGroups(state.project);
  const ponds = () => sortedPonds(state.project.ponds);

  const fitScale = () => {
    const available = Math.max(320, viewportWidth() - 28);
    return Math.min(1, available / sheetPx(preset()).width);
  };
  const scale = () => fitScale() * userZoom();
  const scaledWidth = () => sheetPx(preset()).width * scale();
  const scaledHeight = () => sheetPx(preset()).height * scale();

  onMount(() => {
    const ro = new ResizeObserver(() => setViewportWidth(viewportRef?.clientWidth || 1200));
    if (viewportRef) {
      ro.observe(viewportRef);
      setViewportWidth(viewportRef.clientWidth);
    }
    const measure = () => {
      if (tableRef) setTableHeightMm(Math.max(40, tableRef.offsetHeight / MM_PER_PX));
      if (legendRef) setLegendHeightMm(Math.max(50, legendRef.offsetHeight / MM_PER_PX));
    };
    const tableRo = new ResizeObserver(measure);
    if (tableRef) tableRo.observe(tableRef);
    if (legendRef) tableRo.observe(legendRef);
    measure();
    const timer = window.setTimeout(measure, 350);

    pageStyleEl = document.createElement('style');
    pageStyleEl.id = 'aquafarm-print-page-style';
    document.head.appendChild(pageStyleEl);

    onCleanup(() => {
      ro.disconnect();
      tableRo.disconnect();
      window.clearTimeout(timer);
      pageStyleEl?.remove();
    });
  });

  createEffect(() => {
    const p = poster().preset;
    if (!pageStyleEl) return;
    pageStyleEl.textContent = `@page { size: ${p.wMm}mm ${p.hMm}mm; margin: 0; }`;
  });

  function startDragTable(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const rect = poster().tableRect;
    const content = poster().content;
    const currentScale = scale();
    setDragging(true);

    const onMove = (ev) => {
      const dxMm = (ev.clientX - startClientX) / currentScale / MM_PER_PX;
      const dyMm = (ev.clientY - startClientY) / currentScale / MM_PER_PX;
      const denomX = Math.max(1, content.w - rect.w);
      const denomY = Math.max(1, content.h - rect.h);
      const nx = (rect.x + dxMm - content.x) / denomX;
      const ny = (rect.y + dyMm - content.y) / denomY;
      updateLayout({ tableNX: Math.max(0, Math.min(1, nx)), tableNY: Math.max(0, Math.min(1, ny)) });
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const mapCards = [
    { key: 'zone', title: '01 · 场区配分区图', sub: '品种 / 规格 / 面积 / 密度', mode: 'zone' },
    { key: 'aeration', title: '02 · 增氧点位图', sub: '机型 / 功率水深 / 覆盖半径 / 管路电源', mode: 'aeration' },
    { key: 'feeding', title: '03 · 投喂路线图', sub: '堤埂路线 / 顺序点位 / 单次时长', mode: 'feed' },
  ];

  return (
    <div class="layout-workbench">
      <LayoutSidebar />
      <main class="layout-preview-column">
        <div class="layout-toolbar no-print">
          <div>
            <strong>排版出图版</strong>
            <span class="muted small">{poster().preset.label} · 避让：{poster().engine}</span>
          </div>
          <div class="button-row">
            <button class="btn tiny" onClick={() => setUserZoom((z) => Math.max(0.6, z / 1.2))}>缩小</button>
            <button class="btn tiny" onClick={() => setUserZoom(1)}>适应宽度</button>
            <button class="btn tiny" onClick={() => setUserZoom((z) => Math.min(4, z * 1.2))}>放大</button>
            <button class="btn tiny primary" onClick={() => window.print()}>打印 A1/A3</button>
          </div>
        </div>

        <div class="layout-viewport" ref={viewportRef}>
          <div class="sheet-scaler" style={{ width: `${scaledWidth()}px`, height: `${scaledHeight()}px` }}>
            <section
              class={`poster-sheet ${isA1() ? 'format-a1' : 'format-a3'} ${dragging() ? 'is-dragging-table' : ''}`}
              style={{
                width: `${poster().preset.wMm}mm`,
                height: `${poster().preset.hMm}mm`,
                transform: `scale(${scale()})`,
              }}
            >
              <header class="poster-header">
                <div>
                  <h1>{state.project.mapTitle}</h1>
                  <p>{state.project.mapSubtitle}　|　{state.project.aerialDate}</p>
                </div>
                <Show when={state.project.layout.showNorth}>
                  <NorthArrow />
                </Show>
              </header>

              <For each={mapCards}>
                {(card) => {
                  const rect = () => poster().mapRects[card.key];
                  return (
                    <article class="poster-map-card" style={{
                      left: `${rect().x}mm`,
                      top: `${rect().y}mm`,
                      width: `${rect().w}mm`,
                      height: `${rect().h}mm`,
                    }}>
                      <div class="map-card-title">
                        <strong>{card.title}</strong>
                        <span>{card.sub}</span>
                      </div>
                      <div class="poster-map-body">
                        <MapStage mode={card.mode} readonly />
                      </div>
                    </article>
                  );
                }}
              </For>

              <Show when={poster().noteRect}>
                <aside
                  class="poster-note-card"
                  style={{
                    left: `${poster().noteRect.x}mm`,
                    top: `${poster().noteRect.y}mm`,
                    width: `${poster().noteRect.w}mm`,
                    height: `${poster().noteRect.h}mm`,
                  }}
                >
                  <h3>出图说明与施工交接</h3>
                  <div class="note-metrics">
                    <div><b>{state.project.ponds.length}</b><span>塘口</span></div>
                    <div><b>{state.project.cages.length}</b><span>网箱格</span></div>
                    <div><b>{state.project.aerators.length}</b><span>增氧机</span></div>
                    <div><b>{state.project.feedPoints.length}</b><span>投喂点</span></div>
                  </div>
                  <div class="note-grid">
                    <section>
                      <h4>底图 / 量测</h4>
                      <p>{state.project.aerialDate}；塘埂采用手持激光测距闭合校核，网箱外框 {state.project.cages[0]?.frameM || 6}m。</p>
                    </section>
                    <section>
                      <h4>台账联动</h4>
                      <p>面积与放养密度来自塘口台账。修改编号后，图面标注、图例与编号表使用同一数据源同步更新。</p>
                    </section>
                    <section>
                      <h4>增氧 / 投喂</h4>
                      <p>{state.project.pipes.length} 组管路至电源点；{state.project.feedPoints.length} 个顺序投喂点，单次时长合计 {state.project.feedPoints.reduce((s, p) => s + Number(p.durationMin || 0), 0)} 分钟。</p>
                    </section>
                    <section>
                      <h4>可编辑稿子</h4>
                      <p>交接导出 <b>.aquafarm.json</b>；下周打开可拆回分区、增氧、投喂三层，塘口、网箱和管路结构继续编辑。</p>
                    </section>
                  </div>
                  <div class="note-sign">
                    <span>场长：{state.project.manager.replace('场长：', '')}</span>
                    <span>制图：{state.project.draftsman.replace('制图：', '')}</span>
                    <span>施工签收：____________</span>
                  </div>
                </aside>
              </Show>

              <Show when={state.project.layout.showLegend}>
                <section
                  class="poster-legend"
                  ref={legendRef}
                  style={{
                    left: `${poster().legendRect.x}mm`,
                    top: `${poster().legendRect.y}mm`,
                    width: `${legendWidthMm()}mm`,
                  }}
                >
                  <h3>图　例</h3>
                  <For each={legendGroups()}>
                    {(group) => (
                      <div class="legend-group">
                        <h4>{group.title}</h4>
                        <For each={group.items}>
                          {(item) => (
                            <div class="legend-item">
                              <LegendSwatch item={item} />
                              <span>{item.label}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </section>
              </Show>

              <Show when={state.project.layout.showTable}>
                <section
                  class="poster-table"
                  ref={tableRef}
                  style={{
                    left: `${poster().tableRect.x}mm`,
                    top: `${poster().tableRect.y}mm`,
                    width: `${tableWidthMm()}mm`,
                  }}
                >
                  <div class="table-drag-bar" onPointerDown={startDragTable}>
                    <span>⠿ 塘口编号表</span>
                    <small>可拖动</small>
                  </div>
                  <table>
                    <thead>
                      <tr><th>塘口号</th><th>品种/规格</th><th>面积</th><th>密度</th></tr>
                    </thead>
                    <tbody>
                      <For each={ponds()}>
                        {(pond) => (
                          <tr>
                            <td class="code-cell">
                              <input
                                value={pond.code}
                                aria-label={`修改 ${pond.code} 塘口编号`}
                                onInput={(e) => updatePond(pond.id, { code: e.currentTarget.value })}
                              />
                            </td>
                            <td><b>{(SPECIES_LABEL[pond.species]) || pond.species}</b><small>{pond.spec}</small></td>
                            <td>{pond.areaMu}亩</td>
                            <td>{pond.density}<small>{pond.densityUnit}</small></td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </section>
              </Show>

              <footer class="poster-footer">
                <span>{state.project.projectName} · {state.project.manager}</span>
                <span>比例尺：各图左下角条尺为准（100m）· 3 图纸单位 = 1m</span>
                <span>{state.project.draftsman} · {new Date().toISOString().slice(0, 10)}</span>
              </footer>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

const SPECIES_LABEL = {
  grass: '草鱼',
  shrimp: '南美白对虾',
  bass: '加州鲈',
  crab: '河蟹',
  filter: '鲢鳙',
  mixed: '草鲫混养',
  cage: '网箱',
};
