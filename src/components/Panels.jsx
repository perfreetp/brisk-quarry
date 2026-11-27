import { Show, For } from 'solid-js';
import {
  AERATOR_CATALOG,
  SPECIES_META,
  addAerator,
  addCageGrid,
  deleteAerator,
  deleteFeedPoint,
  deletePipe,
  deletePond,
  exportEditableDraft,
  pathLengthM,
  recalcPondArea,
  selectObject,
  setLayer,
  setTool,
  state,
  updateAerator,
  updateFeedPoint,
  updatePowerPoint,
  updateProject,
  updatePond,
  moveFeedPointOrder,
} from '../store.js';
import { exportModePng } from '../mapScene.js';
import { sortedPonds } from '../legend.js';

export function Field(props) {
  return (
    <label class="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

export function NumberInput(props) {
  return (
    <input
      type="number"
      step={props.step ?? 'any'}
      min={props.min}
      value={props.value}
      onInput={(e) => props.onInput?.(Number(e.currentTarget.value))}
    />
  );
}

export function LayerToggles(props) {
  const keys = props.keys;
  const labels = props.labels;
  return (
    <section class="panel-card">
      <h3>图层与图例联动</h3>
      <div class="toggle-grid">
        <For each={keys}>
          {(key) => (
            <label class="toggle">
              <input
                type="checkbox"
                checked={state.project.layers[key]}
                onChange={(e) => setLayer(key, e.currentTarget.checked)}
              />
              <span>{labels[key] || key}</span>
            </label>
          )}
        </For>
      </div>
    </section>
  );
}

function BasemapCard() {
  function onUpload(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateProject({
        basemap: { ...state.project.basemap, dataUrl: String(reader.result), source: file.name },
      });
    };
    reader.readAsDataURL(file);
  }
  return (
    <section class="panel-card">
      <h3>底图与测距来源</h3>
      <p class="muted small">{state.project.aerialDate}</p>
      <p class="muted small">{state.project.surveyNote}</p>
      <input class="file-input" type="file" accept="image/*" onChange={onUpload} />
      <div class="button-row">
        <button class="btn subtle" onClick={() => updateProject({ basemap: { ...state.project.basemap, dataUrl: '', source: 'procedural' } })}>
          恢复示意正射
        </button>
      </div>
      <Field label={`底图不透明度 ${Math.round((state.project.basemap.opacity || 0) * 100)}%`}>
        <input
          type="range"
          min="0.35"
          max="1"
          step="0.01"
          value={state.project.basemap.opacity}
          onInput={(e) => updateProject({ basemap: { ...state.project.basemap, opacity: Number(e.currentTarget.value) } })}
        />
      </Field>
    </section>
  );
}

function PondEditor(props) {
  const pond = () => state.project.ponds.find((p) => p.id === state.ui.selectedId) || props.pond;
  return (
    <section class="panel-card editor-card">
      <div class="card-title-row">
        <h3>塘口台账 / 标注</h3>
        <button class="btn danger tiny" onClick={() => deletePond(pond().id)}>删除塘口</button>
      </div>
      <Field label="塘口编号（改后分区、表格、图例联动）">
        <input value={pond().code} onInput={(e) => updatePond(pond().id, { code: e.currentTarget.value })} />
      </Field>
      <Field label="塘口名称">
        <input value={pond().name} onInput={(e) => updatePond(pond().id, { name: e.currentTarget.value })} />
      </Field>
      <div class="field-grid">
        <Field label="品种">
          <select value={pond().species} onChange={(e) => updatePond(pond().id, { species: e.currentTarget.value })}>
            <For each={Object.entries(SPECIES_META).filter(([key]) => key !== 'cage')}>
              {([key, meta]) => <option value={key}>{meta.label}</option>}
            </For>
          </select>
        </Field>
        <Field label="放养密度">
          <NumberInput value={pond().density} onInput={(v) => updatePond(pond().id, { density: v })} />
        </Field>
      </div>
      <Field label="规格">
        <input value={pond().spec} onInput={(e) => updatePond(pond().id, { spec: e.currentTarget.value })} />
      </Field>
      <div class="field-grid">
        <Field label="台账面积（亩）">
          <NumberInput value={pond().areaMu} onInput={(v) => updatePond(pond().id, { areaMu: v })} />
        </Field>
        <Field label="密度单位">
          <input value={pond().densityUnit} onInput={(e) => updatePond(pond().id, { densityUnit: e.currentTarget.value })} />
        </Field>
      </div>
      <p class="muted small">台账来源：{pond().ledgerSource}；放养时间：{pond().stockedAt || '待补'}</p>
      <div class="button-row">
        <button class="btn" onClick={() => recalcPondArea(pond().id)}>按测距坐标重算面积</button>
        <button class="btn primary" onClick={() => addCageGrid(pond().id, { cols: 4, rows: 3, frameM: 6 })}>
          加 4×3 网箱
        </button>
      </div>
    </section>
  );
}

export function ZonePanel() {
  const selectedPond = () => state.project.ponds.find((p) => p.id === state.ui.selectedId);
  return (
    <aside class="side-panel">
      <section class="panel-card">
        <h3>分区绘制</h3>
        <div class="button-grid">
          <button class={`btn ${state.ui.tool === 'draw-pond' ? 'primary active' : ''}`} onClick={() => setTool('draw-pond')}>
            拖画塘口
          </button>
          <button class="btn" onClick={() => addCageGrid(state.ui.selectedId || 'pond-3', { cols: 4, rows: 3, frameM: 6 })}>
            给选中/3#加网箱
          </button>
        </div>
        <p class="muted small">先铺航拍正射与塘埂测距线，再按品种、规格划分塘口和网箱；面积、密度从塘口台账带入。</p>
      </section>

      <Show when={selectedPond()} fallback={
        <section class="panel-card">
          <h3>塘口台账（{state.project.ponds.length} 块）</h3>
          <div class="object-list">
            <For each={sortedPonds(state.project.ponds)}>
              {(pond) => (
                <button class="list-row pond-row" onClick={() => selectObject('pond', pond.id)}>
                  <span class="color-dot" style={{ background: SPECIES_META[pond.species]?.color }} />
                  <span class="row-main">
                    <strong>{pond.code}</strong>
                    <small>{SPECIES_META[pond.species]?.label} · {pond.spec}</small>
                  </span>
                  <span class="row-value">{pond.areaMu}亩<br />{pond.density}{pond.densityUnit}</span>
                </button>
              )}
            </For>
          </div>
        </section>
      }>
        <PondEditor pond={selectedPond()} />
      </Show>

      <BasemapCard />
      <LayerToggles keys={['basemap', 'ridges', 'ponds', 'cages', 'labels']} labels={{
        basemap: '航拍底图', ridges: '测距塘埂', ponds: '塘口分区', cages: '网箱框架', labels: '面积密度标注',
      }} />
    </aside>
  );
}

function CatalogCard(props) {
  const cat = props.cat;
  function addToCenter() {
    const pond = state.project.ponds.find((p) => p.id === state.ui.selectedId) || state.project.ponds[0];
    const xs = pond.points.map((p) => p.x);
    const ys = pond.points.map((p) => p.y);
    addAerator(cat.id, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
  }
  return (
    <div
      class="catalog-card"
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData('text/aerator-model', cat.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <div class="catalog-icon">⚙</div>
      <div class="row-main">
        <strong>{cat.model}</strong>
        <small>{cat.vendor}</small>
        <small>{cat.powerKw}kW · R{cat.radiusM}m · 水深{cat.depthM}m</small>
      </div>
      <button class="btn tiny primary" onClick={addToCenter}>放入</button>
    </div>
  );
}

function AeratorEditor() {
  const aerator = () => state.project.aerators.find((a) => a.id === state.ui.selectedId);
  const power = () => state.project.powerPoints.find((p) => p.id === aerator()?.powerId);
  const pipe = () => state.project.pipes.find((p) => p.aeratorId === aerator()?.id);
  return (
    <Show when={aerator()}>
      {(a) => (
        <section class="panel-card editor-card">
          <div class="card-title-row">
            <h3>增氧机参数</h3>
            <button class="btn danger tiny" onClick={() => deleteAerator(a().id)}>移除</button>
          </div>
          <Field label="机位编号">
            <input value={a().code} onInput={(e) => updateAerator(a().id, { code: e.currentTarget.value })} />
          </Field>
          <Field label="厂商型号">
            <select
              value={a().catalogId}
              onChange={(e) => {
                const cat = AERATOR_CATALOG.find((c) => c.id === e.currentTarget.value);
                updateAerator(a().id, {
                  catalogId: cat.id,
                  model: cat.model,
                  powerKw: cat.powerKw,
                  radiusM: cat.radiusM,
                  depthM: cat.depthM,
                });
              }}
            >
              <For each={AERATOR_CATALOG}>{(cat) => <option value={cat.id}>{cat.model}</option>}</For>
            </select>
          </Field>
          <div class="field-grid">
            <Field label="功率 kW"><NumberInput value={a().powerKw} onInput={(v) => updateAerator(a().id, { powerKw: v })} /></Field>
            <Field label="安装水深 m"><NumberInput value={a().depthM} step="0.1" onInput={(v) => updateAerator(a().id, { depthM: v })} /></Field>
          </div>
          <Field label="覆盖半径 m"><NumberInput value={a().radiusM} onInput={(v) => updateAerator(a().id, { radiusM: v })} /></Field>
          <Field label="电源点 / 管路">
            <select value={a().powerId || ''} onChange={(e) => updateAerator(a().id, { powerId: e.currentTarget.value })}>
              <For each={state.project.powerPoints}>{(p) => <option value={p.id}>{p.code} · {p.capacityKw}kW</option>}</For>
            </select>
          </Field>
          <Show when={pipe()}>
            <p class="muted small">
              {pipe().code} · DN{pipe().diameterMm} · 约 {Math.round(pathLengthM(pipe().points))}m
              <button class="link danger" onClick={() => deletePipe(pipe().id)}>删除管路</button>
            </p>
          </Show>
        </section>
      )}
    </Show>
  );
}

function PowerEditor() {
  const point = () => state.project.powerPoints.find((p) => p.id === state.ui.selectedId);
  return (
    <Show when={state.ui.selectedKind === 'power' && point()}>
      {(p) => (
        <section class="panel-card editor-card">
          <h3>电源点</h3>
          <Field label="编号"><input value={p().code} onInput={(e) => updatePowerPoint(p().id, { code: e.currentTarget.value })} /></Field>
          <Field label="容量 kW"><NumberInput value={p().capacityKw} onInput={(v) => updatePowerPoint(p().id, { capacityKw: v })} /></Field>
        </section>
      )}
    </Show>
  );
}

export function AerationPanel() {
  return (
    <aside class="side-panel">
      <section class="panel-card construction-card">
        <h3>施工队取图</h3>
        <p class="muted small">拉走点位图前，先保存可再编辑稿子；下周打开仍可拆回分区、增氧、投喂三张图层。</p>
        <div class="button-row wrap">
          <button class="btn primary" onClick={exportEditableDraft}>存可编辑稿</button>
          <button class="btn" onClick={() => exportModePng('aeration')}>导出增氧 PNG</button>
        </div>
      </section>

      <section class="panel-card">
        <h3>机厂商目录</h3>
        <p class="muted small">按住型号卡片，拖到塘里松开；系统按所在塘口归档并自动接电源管路。</p>
        <div class="catalog-list">
          <For each={AERATOR_CATALOG}>{(cat) => <CatalogCard cat={cat} />}</For>
        </div>
      </section>

      <section class="panel-card">
        <h3>管路工具</h3>
        <div class="button-grid">
          <button class={`btn ${state.ui.tool === 'power' ? 'primary active' : ''}`} onClick={() => setTool('power')}>加电源点</button>
          <button class={`btn ${state.ui.tool === 'pipe' ? 'primary active' : ''}`} onClick={() => setTool('pipe')}>拉管路到电源</button>
        </div>
      </section>

      <AeratorEditor />
      <PowerEditor />

      <section class="panel-card">
        <h3>已布机位（{state.project.aerators.length}）</h3>
        <div class="object-list compact">
          <For each={state.project.aerators}>
            {(a) => (
              <button class="list-row" classList={{ selected: state.ui.selectedId === a.id }} onClick={() => selectObject('aerator', a.id)}>
                <span class="color-dot" style={{ background: '#f97316' }} />
                <span class="row-main"><strong>{a.code}</strong><small>{a.model} · {a.powerKw}kW · 水深{a.depthM}m</small></span>
              </button>
            )}
          </For>
        </div>
      </section>

      <LayerToggles keys={['coverage', 'aerators', 'pipes', 'power', 'labels']} labels={{
        coverage: '覆盖半径', aerators: '增氧机', pipes: '管路结构', power: '电源点', labels: '参数标注',
      }} />
    </aside>
  );
}

function FeedPointEditor() {
  const fp = () => state.project.feedPoints.find((p) => p.id === state.ui.selectedId);
  return (
    <Show when={fp()}>
      {(point) => (
        <section class="panel-card editor-card">
          <div class="card-title-row">
            <h3>投喂点 #{point().order}</h3>
            <button class="btn danger tiny" onClick={() => deleteFeedPoint(point().id)}>删除</button>
          </div>
          <Field label="单次投喂时长（分钟）">
            <NumberInput value={point().durationMin} onInput={(v) => updateFeedPoint(point().id, { durationMin: v })} />
          </Field>
          <Field label="饲料 / 投喂内容">
            <input value={point().feedType} onInput={(e) => updateFeedPoint(point().id, { feedType: e.currentTarget.value })} />
          </Field>
          <div class="button-row">
            <button class="btn" onClick={() => moveFeedPointOrder(point().id, -1)}>顺序前移</button>
            <button class="btn" onClick={() => moveFeedPointOrder(point().id, 1)}>顺序后移</button>
          </div>
        </section>
      )}
    </Show>
  );
}

export function FeedPanel() {
  const routeLength = () => pathLengthM(state.project.feedRoute.points);
  const totalMinutes = () => state.project.feedPoints.reduce((s, p) => s + Number(p.durationMin || 0), 0);
  return (
    <aside class="side-panel">
      <section class="panel-card">
        <h3>投喂路线</h3>
        <div class="button-grid">
          <button class={`btn ${state.ui.tool === 'route' ? 'primary active' : ''}`} onClick={() => setTool('route')}>沿堤埂画路线</button>
          <button class={`btn ${state.ui.tool === 'feed-point' ? 'primary active' : ''}`} onClick={() => setTool('feed-point')}>顺序点投喂点</button>
        </div>
        <Field label="投喂船型号">
          <input
            value={state.project.feedRoute.boatModel}
            onInput={(e) => updateProject({ feedRoute: { ...state.project.feedRoute, boatModel: e.currentTarget.value } })}
          />
        </Field>
        <p class="muted small">路线约 {Math.round(routeLength())}m；共 {state.project.feedPoints.length} 个点，单次时长合计 {totalMinutes()} 分钟。</p>
      </section>

      <FeedPointEditor />

      <section class="panel-card">
        <h3>投喂顺序与时长</h3>
        <div class="object-list">
          <For each={[...state.project.feedPoints].sort((a, b) => a.order - b.order)}>
            {(fp) => (
              <div class={`feed-row ${state.ui.selectedId === fp.id ? 'selected' : ''}`}>
                <button class="feed-order" onClick={() => selectObject('feedPoint', fp.id)}>{fp.order}</button>
                <div class="row-main">
                  <input value={fp.feedType} onInput={(e) => updateFeedPoint(fp.id, { feedType: e.currentTarget.value })} />
                  <small>坐标 {Math.round(fp.x)}, {Math.round(fp.y)}</small>
                </div>
                <label class="duration-input">
                  <NumberInput value={fp.durationMin} onInput={(v) => updateFeedPoint(fp.id, { durationMin: v })} />
                  <span>分</span>
                </label>
              </div>
            )}
          </For>
        </div>
      </section>

      <LayerToggles keys={['ridges', 'ponds', 'cages', 'route', 'feedPoints', 'labels']} labels={{
        ridges: '塘埂线', ponds: '塘口底图', cages: '网箱', route: '行船路线', feedPoints: '投喂点', labels: '顺序时长',
      }} />
    </aside>
  );
}
