<script>
  import { legendGradient } from '../lib/color.js';
  import ImportPanel from './ImportPanel.svelte';

  let { store } = $props();
  let tab = $state('key'); // key | group | import

  const p = $derived(store.selectedPeriod);
  const v = $derived(p.key.view);
  const bins = $derived(store.reef.bins);
</script>

<div class="panel">
  <div class="tabs">
    <button class:on={tab === 'key'} onclick={() => (tab = 'key')}>关键帧</button>
    <button class:on={tab === 'group'} onclick={() => (tab = 'group')}>轨道组</button>
    <button class:on={tab === 'import'} onclick={() => (tab = 'import')}>导入</button>
  </div>

  {#if tab === 'key'}
    <div class="section">
      <label class="field">
        <span>监测期次</span>
        <select value={p.id} onchange={(e) => store.selectPeriod(e.target.value)}>
          {#each store.periods as per (per.id)}
            <option value={per.id}>{per.name}（{per.date}）</option>
          {/each}
        </select>
      </label>

      <h4>显示范围（框住展示礁体）</h4>
      <div class="view-grid">
        <label><span>X</span><input type="number" value={Math.round(v.x)}
          onchange={(e) => store.updateView(p.id, { x: +e.target.value })} /></label>
        <label><span>Y</span><input type="number" value={Math.round(v.y)}
          onchange={(e) => store.updateView(p.id, { y: +e.target.value })} /></label>
        <label><span>宽</span><input type="number" value={Math.round(v.w)}
          onchange={(e) => store.updateView(p.id, { w: Math.max(80, +e.target.value) })} /></label>
        <label><span>高</span><input type="number" value={Math.round(v.h)}
          onchange={(e) => store.updateView(p.id, { h: Math.max(80, +e.target.value) })} /></label>
      </div>
      <div class="btn-row">
        <button class="mini" onclick={() => store.nudgeView(p.id, -30, 0)}>←</button>
        <button class="mini" onclick={() => store.nudgeView(p.id, 0, -30)}>↑</button>
        <button class="mini" onclick={() => store.nudgeView(p.id, 0, 30)}>↓</button>
        <button class="mini" onclick={() => store.nudgeView(p.id, 30, 0)}>→</button>
        <button class="mini" onclick={() => store.zoomViewAt(p.id, 1.2)}>放大</button>
        <button class="mini" onclick={() => store.zoomViewAt(p.id, 1 / 1.2)}>缩小</button>
        <button class="mini" onclick={() => store.updateView(p.id, { x: 0, y: 0, w: store.reef.width, h: store.reef.height })}>全礁</button>
      </div>
      <p class="tip">也可在画面上直接拖拽平移、滚轮缩放。</p>

      <h4>色标档位（白化等级分档）</h4>
      <div class="legend" style={`background:${legendGradient(bins)}`}></div>
      <div class="bin-labels">
        {#each bins as b (b.level)}<span>{b.label}</span>{/each}
      </div>
      {#each p.key.scale.thresholds as th, idx (idx)}
        <label class="threshold">
          <span>{bins[idx].label} → {bins[idx + 1].label} 分界 <b>{th.toFixed(2)}</b></span>
          <input type="range" min="0.05" max="0.95" step="0.01" value={th}
            oninput={(e) => store.setThresholdAt(p.id, idx, +e.target.value)} />
        </label>
      {/each}
      <label class="check">
        <input type="checkbox" checked={store.propagateScale} onchange={() => store.togglePropagate()} />
        改档后将本期之后的关键帧按新色标重新对齐
      </label>

      <button class="commit" onclick={() => store.commitKeyframe(p.id)}>
        {p.key.committedAt ? `更新关键帧（上次落帧 ${p.key.committedAt}）` : '落本期关键帧（显示范围 + 色标）'}
      </button>

      <h4>讲解标注（白化扩大区）</h4>
      <button class="mini wide" class:armed={store.tool === 'annotate'} onclick={() => store.setTool(store.tool === 'annotate' ? null : 'annotate')}>
        {store.tool === 'annotate' ? '正在圈选…双击完成' : '在画面上圈出扩大区'}
      </button>
      {#each p.annotations || [] as ann (ann.id)}
        <div class="ann-row">
          <button class="link" onclick={() => store.focusAnnotation(p.id, ann.id)}>🔍 {ann.label}{ann.createdAt ? `（${ann.createdAt}）` : ''}</button>
          <button class="mini danger" onclick={() => store.removeAnnotation(p.id, ann.id)}>删</button>
        </div>
      {/each}
    </div>
  {/if}

  {#if tab === 'group'}
    <div class="section">
      <p class="tip">相邻期轨道编为一组，组上设过渡时长；色块与显示范围在过渡段一起渐变。</p>
      {#each store.groups as g (g.id)}
        {@const names = g.periodIds.map((id) => store.periods.find((x) => x.id === id)?.name).join(' → ')}
        <div class="group-card" class:fast={g.transitionMs < 900}>
          <div class="group-head">
            <strong>{g.name}</strong>
            {#if g.transitionMs < 900}<span class="warn">偏快</span>{/if}
          </div>
          <div class="group-sub">{names}</div>
          <label class="threshold">
            <span>过渡时长 <b>{(g.transitionMs / 1000).toFixed(1)}s</b></span>
            <input type="range" min="300" max="4000" step="100" value={g.transitionMs}
              oninput={(e) => store.setGroupTransitionMs(g.id, +e.target.value)} />
          </label>
        </div>
      {/each}
      <button class="mini wide" onclick={() => {
        const g3 = store.groups.find((g) => g.periodIds.join() === 'p3,p4');
        if (g3) store.setGroupTransitionMs(g3.id, 2000);
      }}>一键把第三→四期过渡拉长到 2.0s（汇报演示用）</button>
      <p class="tip">拉长后该组之后的关键帧整体后挪，时间轴刻度自动重排。</p>
    </div>
  {/if}

  {#if tab === 'import'}
    <ImportPanel {store} />
  {/if}
</div>

<style>
  .panel { display: flex; flex-direction: column; min-height: 0; }
  .tabs { display: flex; gap: 4px; margin-bottom: 10px; }
  .tabs button {
    flex: 1; padding: 8px 0; border-radius: 8px; border: 1px solid var(--border);
    background: #123044; color: #9fd3e8; cursor: pointer; font-size: 13px;
  }
  .tabs button.on { background: #1f5f83; color: #fff; border-color: #57b6e0; font-weight: 700; }
  .section { overflow-y: auto; padding-right: 4px; }
  h4 { margin: 14px 0 8px; font-size: 13px; color: #cfe3ee; }
  .field select, .view-grid input {
    width: 100%; background: #0e2738; border: 1px solid var(--border); color: #e8f2f8;
    border-radius: 6px; padding: 6px 8px; font-size: 12.5px;
  }
  .view-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .view-grid label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: #8fb9cc; }
  .btn-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .mini {
    border: 1px solid var(--border); background: #1d3a4d; color: #e8f2f8;
    border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer;
  }
  .mini:hover { border-color: #57b6e0; }
  .mini.wide { width: 100%; margin: 6px 0; }
  .mini.armed { background: #7a2e26; border-color: #ff8a65; }
  .mini.danger { background: #4a201c; border-color: #d9532b; }
  .tip { font-size: 11.5px; color: #6f93a6; line-height: 1.5; }
  .legend { height: 14px; border-radius: 4px; border: 1px solid var(--border); }
  .bin-labels { display: flex; justify-content: space-between; font-size: 10.5px; color: #9fd3e8; margin: 3px 0 8px; }
  .threshold { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: #b8d4e2; margin-bottom: 8px; }
  .threshold b { color: #ffd166; }
  .threshold input[type='range'] { width: 100%; accent-color: #57b6e0; }
  .check { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; color: #cfe3ee; margin: 6px 0 10px; }
  .commit {
    width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #7fd1a8;
    background: #1d4d3a; color: #d8f5e6; font-weight: 700; cursor: pointer; font-size: 13px;
  }
  .commit:hover { background: #256b50; }
  .ann-row { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; gap: 6px; }
  .link { background: none; border: none; color: #8fd0f0; cursor: pointer; font-size: 12.5px; text-align: left; }
  .group-card {
    border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;
    background: #102c3f;
  }
  .group-card.fast { border-color: #ff8a65; }
  .group-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  .group-sub { font-size: 11.5px; color: #8fb9cc; margin: 2px 0 6px; }
  .warn { font-size: 10.5px; background: #7a2e26; color: #ffd0c4; border-radius: 6px; padding: 1px 7px; }
</style>
