<script>
  import { formatMs } from '../lib/timeline.js';

  let { store } = $props();

  const tl = $derived(store.timeline);
  const ps = $derived(store.playState);
  const pct = $derived((store.currentTime / Math.max(1, tl.total)) * 100);

  function runThrough() {
    // 连续播一遍：回到起点从头走，确认各期衔接
    store.seek(0);
    store.play();
  }
</script>

<div class="playbar">
  <button class="ctl" onclick={() => store.togglePlay()} title="播放/暂停（空格键）">
    {store.isPlaying ? '⏸ 暂停' : '▶ 播放'}
  </button>
  <button class="ctl" onclick={runThrough} title="回到时间轴起点连续播放一遍">⏮ 连续播一遍</button>
  <button class="ctl" onclick={() => store.seek(0)}>⏮ 起点</button>

  <div class="time-readout">
    <span class="now">{formatMs(store.currentTime)}</span>
    <span class="sep">/</span>
    <span>{formatMs(tl.total)}</span>
  </div>

  <input
    class="scrub"
    type="range"
    min="0"
    max={tl.total}
    step="20"
    value={store.currentTime}
    oninput={(e) => store.seek(+e.target.value)}
    style={`--pct:${pct}%`}
  />

  <div class="mode-chip" class:hold={ps.mode === 'hold'} class:trans={ps.mode === 'transition'}>
    {ps.mode === 'hold'
      ? `停留 · ${store.periods[ps.periodIndex].name}（2s）`
      : `过渡 → ${store.periods[ps.nextIndex].name}（${(ps.progress * 100).toFixed(0)}%）`}
  </div>
</div>

<style>
  .playbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .ctl {
    border: 1px solid var(--border);
    background: #1d3a4d;
    color: #e8f2f8;
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }
  .ctl:hover { border-color: #57b6e0; }
  .time-readout {
    font-variant-numeric: tabular-nums;
    font-size: 13px;
    color: #cfe3ee;
    white-space: nowrap;
  }
  .time-readout .now { color: #ffd166; font-weight: 700; }
  .time-readout .sep { color: #6f93a6; margin: 0 2px; }
  .scrub { flex: 1; accent-color: #57b6e0; min-width: 120px; }
  .mode-chip {
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 999px;
    white-space: nowrap;
    background: rgba(87, 182, 224, 0.15);
    color: #9fd3e8;
    border: 1px solid rgba(87, 182, 224, 0.35);
  }
  .mode-chip.hold { background: rgba(127, 209, 168, 0.14); border-color: rgba(127, 209, 168, 0.4); color: #b8e6cf; }
</style>
