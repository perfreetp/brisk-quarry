<script>
  import { buildTicks, formatMs } from '../lib/timeline.js';

  let { store } = $props();

  let svgEl = $state(null);
  let width = $state(900);
  const HEIGHT = 232;
  const LABEL_W = 92;
  const LANE_H = 34;
  const TOP = 8;

  const tl = $derived(store.timeline);
  const ticks = $derived(buildTicks(tl, 1000));
  const xOf = (t) => LABEL_W + (t / Math.max(1, tl.total)) * (width - LABEL_W - 16);

  let resizeObs;
  $effect(() => {
    if (!svgEl) return;
    resizeObs = new ResizeObserver((es) => { width = Math.round(es[0].contentRect.width); });
    resizeObs.observe(svgEl);
    return () => resizeObs?.disconnect();
  });

  let draggingHead = false;
  function seekFromEvent(e) {
    const rect = svgEl.getBoundingClientRect();
    const x = ((e.clientX ?? e.touches?.[0]?.clientX) - rect.left);
    const t = ((x - LABEL_W) / (width - LABEL_W - 16)) * tl.total;
    store.seek(t);
  }
  function onHeadDown(e) { draggingHead = true; e.stopPropagation(); window.addEventListener('mousemove', onWinMove); window.addEventListener('mouseup', onWinUp); }
  function onWinMove(e) { if (draggingHead) seekFromEvent(e); }
  function onWinUp() {
    draggingHead = false;
    window.removeEventListener('mousemove', onWinMove);
    window.removeEventListener('mouseup', onWinUp);
  }
</script>

<div class="tracks-card">
  <div class="tracks-title">
    时间轴 · 每期一条轨道（◆ 显示范围关键帧 / ◆ 色标档位关键帧）· 组过渡带可拉宽
  </div>
  <svg
    bind:this={svgEl}
    viewBox="0 0 {width} {HEIGHT}"
    width="100%"
    height={HEIGHT}
    onmousedown={seekFromEvent}
    class="tracks-svg"
  >
    <!-- 刻度（随总时长自动重排） -->
    {#each ticks as tick (tick.time)}
      <g class="tick">
        <line x1={xOf(tick.time)} y1={TOP} x2={xOf(tick.time)} y2={HEIGHT - 26} stroke="rgba(255,255,255,0.14)" stroke-width="1" />
        <text x={xOf(tick.time)} y={HEIGHT - 10} text-anchor="middle" class="tick-label">{tick.label}</text>
      </g>
    {/each}

    <!-- 期次轨道 -->
    {#each tl.entries as entry, i (entry.period.id)}
      {@const y = TOP + i * LANE_H}
      {@const p = entry.period}
      <g class="lane" onmousedown={(e) => { e.stopPropagation(); store.seekPeriod(p.id); }}>
        <rect x="4" y={y + 2} width={LABEL_W - 10} height={LANE_H - 6} rx="6"
          class="lane-label" class:selected={store.selectedPeriodId === p.id} />
        <text x="12" y={y + LANE_H / 2 - 2} class="lane-name">{p.name}</text>
        <text x="12" y={y + LANE_H / 2 + 12} class="lane-date">{p.date}</text>

        <!-- 停留段 -->
        <rect x={xOf(entry.start)} y={y + 6} width={Math.max(2, xOf(entry.holdEnd) - xOf(entry.start))}
          height={LANE_H - 14} rx="5" class="hold-band" class:selected={store.selectedPeriodId === p.id} />
        <text x={xOf(entry.start) + 6} y={y + LANE_H / 2 + 4} class="hold-text">停留 2s</text>

        <!-- 两个关键帧菱形 -->
        <g transform="translate({xOf(entry.start) + 14},{y + LANE_H / 2 - 1})">
          <rect x="-6" y="-6" width="12" height="12" transform="rotate(45)"
            class="kf kf-view" class:committed={!!p.key.committedAt}
            onmousedown={(e) => { e.stopPropagation(); store.selectPeriod(p.id); }} />
          <title>显示范围关键帧{p.key.committedAt ? ` · 已落帧 ${p.key.committedAt}` : ' · 未落帧'}</title>
        </g>
        <g transform="translate({xOf(entry.start) + 34},{y + LANE_H / 2 - 1})">
          <rect x="-6" y="-6" width="12" height="12" transform="rotate(45)"
            class="kf kf-scale" class:committed={!!p.key.committedAt}
            onmousedown={(e) => { e.stopPropagation(); store.selectPeriod(p.id); }} />
          <title>色标档位关键帧（阈值 {p.key.scale.thresholds.map((v) => v.toFixed(2)).join(' / ')}）</title>
        </g>
      </g>
    {/each}

    <!-- 组过渡带：跨相邻两期轨道 -->
    {#each tl.transitions as tr (tr.groupId || `t-${tr.from}`)}
      {@const y1 = TOP + tr.from * LANE_H + LANE_H - 8}
      {@const x1 = xOf(tr.start)}
      {@const x2 = xOf(tr.end)}
      <g class="trans">
        <path
          d="M {x1} {y1} C {x1 + 26} {y1 + 12}, {x2 - 26} {y1 + 12}, {x2} {y1}"
          fill="none" class="trans-band" class:fast={tr.duration < 900}
        />
        <rect x={(x1 + x2) / 2 - 34} y={y1 - 1} width="68" height="16" rx="8"
          class="trans-pill" class:fast={tr.duration < 900}
          onmousedown={(e) => e.stopPropagation()} />
        <text x={(x1 + x2) / 2} y={y1 + 11} text-anchor="middle"
          class="trans-text" onmousedown={(e) => e.stopPropagation()}>{formatMs(tr.duration)}</text>
      </g>
    {/each}

    <!-- 播放头 -->
    <g class="playhead" transform="translate({xOf(store.currentTime)},0)" onmousedown={onHeadDown}>
      <line x1="0" y1={TOP - 2} x2="0" y2={HEIGHT - 24} stroke="#ffd166" stroke-width="2" />
      <polygon points="-6,0 6,0 0,9" fill="#ffd166" />
    </g>
  </svg>
  <div class="tracks-foot">总时长 {formatMs(tl.total)} · 播放头可拖动预览，点击轨道选择期次，过渡带时长在右侧组面板调整</div>
</div>

<style>
  .tracks-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px 6px;
  }
  .tracks-title { font-size: 12.5px; color: #9fd3e8; margin-bottom: 4px; }
  .tracks-svg { user-select: none; }
  .lane-label { fill: #123044; stroke: var(--border); cursor: pointer; }
  .lane-label.selected { fill: #1f5f83; stroke: #57b6e0; }
  .lane-name { fill: #e8f2f8; font-size: 12px; font-weight: 700; pointer-events: none; }
  .lane-date { fill: #8fb9cc; font-size: 10px; pointer-events: none; }
  .hold-band { fill: rgba(87, 182, 224, 0.16); stroke: rgba(87, 182, 224, 0.45); cursor: pointer; }
  .hold-band.selected { fill: rgba(87, 182, 224, 0.32); }
  .hold-text { fill: #9fd3e8; font-size: 10px; pointer-events: none; }
  .kf { stroke-width: 2; cursor: pointer; }
  .kf-view { fill: #22384a; stroke: #57b6e0; }
  .kf-scale { fill: #22384a; stroke: #e8a24a; }
  .kf.committed { fill: #57b6e0; }
  .kf-scale.committed { fill: #e8a24a; }
  .trans-band { stroke: #7fd1a8; stroke-width: 3; }
  .trans-band.fast { stroke: #ff8a65; }
  .trans-pill { fill: #14364a; stroke: #7fd1a8; cursor: default; }
  .trans-pill.fast { stroke: #ff8a65; }
  .trans-text { fill: #cfead9; font-size: 10.5px; font-weight: 700; cursor: default; }
  .tick-label { fill: #6f93a6; font-size: 10px; }
  .playhead line { cursor: ew-resize; }
  .playhead polygon { cursor: ew-resize; }
  .tracks-foot { font-size: 11.5px; color: #6f93a6; padding: 2px 2px 6px; }
</style>
