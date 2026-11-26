<script>
  import StageCanvas from './components/StageCanvas.svelte';
  import TimelineTracks from './components/TimelineTracks.svelte';
  import KeyframePanel from './components/KeyframePanel.svelte';
  import PlaybackBar from './components/PlaybackBar.svelte';
  import { useStore } from './lib/stores.svelte.js';

  const store = useStore();
  if (import.meta.env.DEV) window.__store = store;

  function onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); store.togglePlay(); }
  }

  function fullscreen() {
    const el = document.querySelector('.app-shell');
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }

  // 交给项目负责人：导出当前工程 JSON（可随汇报材料存档/复现）
  function exportProject() {
    const data = JSON.stringify(store.project, (k, v) => (k === 'ortho' && typeof v === 'string' && v.length > 200 ? '[ortho-dataURL]' : v), 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `白化演变展示工程-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app-shell">
  <header class="topbar">
    <div class="brand">
      <span class="logo">🐚</span>
      <div>
        <h1>珊瑚礁白化演变时间轴展示</h1>
        <p>同一礁区多期模型 · 按监测日期排序 · 预览与回放同源一致</p>
      </div>
    </div>
    <div class="top-actions">
      <button class="hdr-btn" onclick={fullscreen}>汇报全屏</button>
      <button class="hdr-btn" onclick={exportProject}>导出工程存档</button>
      <button class="hdr-btn warn" onclick={() => store.resetDemo()}>重置演示数据</button>
    </div>
  </header>

  <main class="layout">
    <section class="center-col">
      <StageCanvas {store} />
      <PlaybackBar {store} />
      <TimelineTracks {store} />
    </section>
    <aside class="side-col">
      <KeyframePanel {store} />
    </aside>
  </main>
</div>
