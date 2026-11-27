import { createEffect, onCleanup } from 'solid-js';
import MapStage from './components/MapStage.jsx';
import LayoutBoard from './components/LayoutBoard.jsx';
import { AerationPanel, FeedPanel, ZonePanel } from './components/Panels.jsx';
import { exportEditableDraft, importEditableDraft, persistLocal, setPage, setState, state, updatePond } from './store.js';

const TABS = [
  { id: 'zone', label: '① 场区 / 分区', icon: '▦' },
  { id: 'aeration', label: '② 增氧点位', icon: '✺' },
  { id: 'feed', label: '③ 投喂路线', icon: '∿' },
  { id: 'layout', label: '④ 排版出图', icon: '▣' },
];

export default function App() {
  let fileInput;
  let autoTimer;

  createEffect(() => {
    JSON.stringify(state.project);
    clearTimeout(autoTimer);
    autoTimer = window.setTimeout(() => persistLocal(), 900);
  });

  onCleanup(() => window.clearTimeout(autoTimer));

  async function onFileChange(event) {
    const file = event.currentTarget.files?.[0];
    const input = event.currentTarget;
    if (!file) return;
    try {
      await importEditableDraft(file);
    } catch (err) {
      console.error(err);
      setState('ui', 'saveState', '稿子打开失败：请选择本系统导出的 .aquafarm.json');
    } finally {
      input.value = '';
    }
  }

  function demoManagerRename() {
    const pond = state.project.ponds.find((p) => p.code === '3#' || p.id === 'pond-3') || state.project.ponds[2];
    if (!pond) return;
    updatePond(pond.id, { code: pond.code === '3#' ? '3-1#' : '3#' });
    setPage('layout');
  }

  return (
    <div class="app-shell">
      <header class="topbar no-print">
        <div class="brand">
          <div class="brand-mark">塘</div>
          <div>
            <h1>塘图 · 场区出图工作台</h1>
            <p>SolidJS × Fabric.js｜分区、增氧、投喂三图联动排版</p>
          </div>
        </div>

        <nav class="tabs" aria-label="工作步骤">
          {TABS.map((tab) => (
            <button
              class={`tab ${state.ui.page === tab.id ? 'active' : ''}`}
              onClick={() => setPage(tab.id)}
            >
              <span class="tab-icon">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </nav>

        <div class="header-actions">
          <span class="save-state" title="项目会自动保存到当前浏览器">{state.ui.saveState}</span>
          <button class="btn subtle" onClick={demoManagerRename}>场长改号演练</button>
          <button class="btn" onClick={() => fileInput?.click()}>打开稿子</button>
          <button class="btn primary" onClick={exportEditableDraft}>保存可编辑稿</button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={onFileChange} />
        </div>
      </header>

      <main class="app-main">
        {state.ui.page === 'zone' && (
          <div class="workbench">
            <section class="map-column">
              <div class="map-meta-bar">
                <div>
                  <strong>进入场区：先铺底图与塘埂测距</strong>
                  <span>{state.project.aerialDate}；坐标单位为图纸单位，3 单位 = 1m</span>
                </div>
                <span class="badge ok">底图已定位</span>
              </div>
              <div class="map-canvas-wrap">
                <MapStage mode="zone" />
              </div>
            </section>
            <ZonePanel />
          </div>
        )}

        {state.ui.page === 'aeration' && (
          <div class="workbench">
            <section class="map-column">
              <div class="map-meta-bar aeration">
                <div>
                  <strong>增氧层：厂商机型拖入塘口，覆盖半径 + 管路到电源</strong>
                  <span>机器标注功率与安装水深；拖动机器后管路自动跟随重算</span>
                </div>
                <span class="badge warn">施工版可存稿</span>
              </div>
              <div class="map-canvas-wrap">
                <MapStage mode="aeration" />
              </div>
            </section>
            <AerationPanel />
          </div>
        )}

        {state.ui.page === 'feed' && (
          <div class="workbench">
            <section class="map-column">
              <div class="map-meta-bar feed">
                <div>
                  <strong>投喂层：沿塘埂画船路，按顺序落点并填单次时长</strong>
                  <span>双击完成路线；投喂点编号即投喂顺序</span>
                </div>
                <span class="badge feed">路线 {Math.round(state.project.feedRoute.points.length)} 折点</span>
              </div>
              <div class="map-canvas-wrap">
                <MapStage mode="feed" />
              </div>
            </section>
            <FeedPanel />
          </div>
        )}

        {state.ui.page === 'layout' && <LayoutBoard />}
      </main>
    </div>
  );
}
