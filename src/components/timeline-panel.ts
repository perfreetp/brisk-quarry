import { PEAK_META, formatClock, getPassageWindow, offsetForPeak } from '../engine/flowEngine';
import { store } from '../store';
import type { FlowTrack, PeakId } from '../types';

export class TimelinePanel extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private renderedVersion = -1;

  connectedCallback(): void {
    this.innerHTML = `
      <section class="timeline panel" aria-label="早晚高峰共用时间轴">
        <div class="timeline-toolbar">
          <div class="play-controls">
            <button class="btn primary" data-action="toggle-play" type="button" aria-label="播放或暂停">
              <span class="play-icon">▶</span><span class="play-label">从当前预览点回放</span>
            </button>
            <button class="btn" data-action="restart" type="button" title="回到 0 分钟并播放">⟲ 从头</button>
            <div class="speed-group" role="group" aria-label="回放速度">
              ${[1, 2, 4]
                .map(
                  (speed) =>
                    `<button class="btn small speed-btn" data-speed="${speed}" type="button">${speed}×</button>`,
                )
                .join('')}
            </div>
          </div>
          <div class="time-readout">
            <strong data-role="time-min">3.20′</strong>
            <span class="clock am" data-role="clock-am">08:03:12</span>
            <span class="clock pm" data-role="clock-pm">18:02:42</span>
          </div>
          <div class="timeline-tools">
            <div class="segmented" role="group" aria-label="画布显示高峰组">
              <button class="seg-btn" data-view="compare" type="button">早晚叠加</button>
              <button class="seg-btn" data-view="am" type="button">仅早高峰</button>
              <button class="seg-btn" data-view="pm" type="button">仅晚高峰</button>
            </div>
            <button class="btn warning" data-action="shift-pm" type="button"></button>
          </div>
        </div>

        <div class="ruler-row">
          <div class="ruler-label">共用时间轴</div>
          <div class="ruler" data-role="ruler"></div>
        </div>

        <div class="scrub-row">
          <div class="ruler-label">拖动预览</div>
          <div class="scrub-wrap">
            <input class="scrub" data-role="scrub" type="range" min="0" max="12" step="0.01" value="3.2"
              aria-label="拖动时间轴预览流线" />
            <div class="playhead" data-role="playhead"><span></span></div>
          </div>
        </div>

        <div class="lanes" data-role="lanes"></div>
        <div class="kf-detail" data-role="kf-detail">关键帧：悬停圆点可看“时刻 / 位置 / 里程”，点击圆点可精确跳转。</div>
        <div class="timeline-footnote" data-role="flip-note"></div>
      </section>
    `;

    this.bindEvents();
    this.renderRuler();
    this.renderLanes(true);
    this.unsubscribe = store.subscribe(() => this.update());
    this.update();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private bindEvents(): void {
    this.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const actionEl = target.closest<HTMLElement>('[data-action]');
      if (actionEl) {
        const action = actionEl.dataset.action;
        if (action === 'toggle-play') store.togglePlay();
        if (action === 'restart') store.restart();
        if (action === 'shift-pm') store.togglePmHalfCell();
        return;
      }

      const speedEl = target.closest<HTMLElement>('[data-speed]');
      if (speedEl?.dataset.speed) {
        store.setSpeed(Number(speedEl.dataset.speed) as 1 | 2 | 4);
        return;
      }

      const viewEl = target.closest<HTMLElement>('[data-view]');
      if (viewEl?.dataset.view) {
        store.setViewMode(viewEl.dataset.view as 'compare' | PeakId);
        return;
      }

      const kfEl = target.closest<HTMLElement>('[data-seek]');
      if (kfEl?.dataset.seek) {
        store.scrub(Number(kfEl.dataset.seek));
        this.showKeyframeDetail(kfEl.dataset);
      }
    });

    const scrub = this.querySelector<HTMLInputElement>('[data-role="scrub"]');
    scrub?.addEventListener('input', () => {
      store.scrub(Number(scrub.value));
    });
  }

  private showKeyframeDetail(dataset: DOMStringMap): void {
    const detail = this.querySelector<HTMLElement>('[data-role="kf-detail"]');
    if (!detail) return;
    detail.innerHTML = `
      <b>${dataset.track ?? '轨道'}</b>
      <span>关键位置：${dataset.label ?? '—'}</span>
      <span>本峰时刻 ${Number(dataset.local ?? 0).toFixed(2)}′ · 轴上 ${Number(dataset.seek ?? 0).toFixed(2)}′</span>
      <span>距起点 ${dataset.distance ?? '—'} m</span>`;
  }

  private renderRuler(): void {
    const ruler = this.querySelector<HTMLElement>('[data-role="ruler"]');
    if (!ruler) return;
    const cellCount = store.state.durationMin / store.state.cellMin;
    ruler.innerHTML = Array.from({ length: cellCount + 1 }, (_, index) => {
      const left = (index / cellCount) * 100;
      return `<span class="tick" style="left:${left}%">${index}′</span>`;
    }).join('');
  }

  private absoluteKeyframeTime(track: FlowTrack, tMin: number): number {
    return tMin + offsetForPeak(store.state, track.peak);
  }

  private renderLanes(force = false): void {
    const lanes = this.querySelector<HTMLElement>('[data-role="lanes"]');
    if (!lanes) return;
    if (!force && this.renderedVersion === store.state.structureVersion) return;
    this.renderedVersion = store.state.structureVersion;

    const state = store.state;
    const flipWindow = getPassageWindow(state);
    const flipLeftPct = (flipWindow.startMin / state.durationMin) * 100;
    const flipWidthPct =
      ((flipWindow.endMin - flipWindow.startMin) / state.durationMin) * 100;
    lanes.innerHTML = (['am', 'pm'] as PeakId[])
      .map((peak) => {
        const group = state.groups[peak];
        const offset = offsetForPeak(state, peak);
        const offsetPct = (offset / state.durationMin) * 100;
        return `
          <div class="peak-lane peak-${peak}">
            <div class="peak-lane-head">
              <strong>${group.name}</strong>
              <span>${PEAK_META[peak].clockStart} 起 · ${group.totalVolumePaxH.toLocaleString()} pax/h</span>
              <em>整体偏移 ${state.pmOffsetCells && peak === 'pm' ? `+${state.pmOffsetCells} 格` : '0 格'}</em>
            </div>
            <div class="peak-lane-body">
              <div class="grid-cells">
                ${Array.from({ length: state.durationMin / state.cellMin }, () => `<i style="width:${100 / (state.durationMin / state.cellMin)}%"></i>`).join('')}
              </div>
              <div class="flip-window" style="left:${flipLeftPct}%;width:${flipWidthPct}%" title="中央通道主次流向反转对位窗">
                <span>流向翻转</span>
              </div>
              <div class="offset-bracket" style="left:${offsetPct}%" hidden="${peak !== 'pm' || offset === 0}">
                <span>晚高峰整体挪 ${state.pmOffsetCells} 格</span>
              </div>
              ${group.tracks
                .map((track) => {
                  const rowIndex = track.code === 'up' ? 0 : 1;
                  const chips = track.keyframes
                    .map((keyframe, index) => {
                      const absolute = this.absoluteKeyframeTime(track, keyframe.tMin);
                      const left = (absolute / state.durationMin) * 100;
                      return `
                        <button type="button" class="kf-chip kf-${index}" data-seek="${absolute}"
                          data-label="${keyframe.label}" data-distance="${keyframe.distanceM}"
                          data-track="${track.name}" data-local="${keyframe.tMin}"
                          style="left:${left}%; --chip:${track.color}"
                          title="${track.name}｜${keyframe.label} · 轴上 ${absolute.toFixed(2)} min（本峰 ${keyframe.tMin.toFixed(2)}′）· 里程 ${keyframe.distanceM} m">
                          <i></i><span>${index}</span>
                        </button>`;
                    })
                    .join('');
                  return `
                    <div class="track-row track-${track.id}" style="top:${4 + rowIndex * 31}px; --track-color:${track.color}">
                      <span class="track-name">${track.code === 'up' ? '上行' : '下行'} · ${track.effectiveVolumePaxH}/h</span>
                      <div class="track-rail">
                        <div class="track-line" style="background:${track.color}"></div>
                        ${chips}
                      </div>
                    </div>`;
                })
                .join('')}
              <div class="lane-playhead" data-role="lane-playhead-${peak}"></div>
            </div>
          </div>`;
      })
      .join('');
  }

  private update(): void {
    if (!this.isConnected) return;
    this.renderLanes();
    const state = store.state;
    const pct = (state.timeMin / state.durationMin) * 100;

    const scrub = this.querySelector<HTMLInputElement>('[data-role="scrub"]');
    if (scrub && document.activeElement !== scrub) scrub.value = String(state.timeMin);
    const playhead = this.querySelector<HTMLElement>('[data-role="playhead"]');
    if (playhead) playhead.style.left = `${pct}%`;

    this.querySelectorAll<HTMLElement>('.lane-playhead').forEach((el) => {
      el.style.left = `${pct}%`;
    });

    const timeMin = this.querySelector<HTMLElement>('[data-role="time-min"]');
    if (timeMin) timeMin.textContent = `${state.timeMin.toFixed(2)}′`;
    const clockAm = this.querySelector<HTMLElement>('[data-role="clock-am"]');
    if (clockAm) clockAm.textContent = formatClock('am', state.timeMin);
    const clockPm = this.querySelector<HTMLElement>('[data-role="clock-pm"]');
    if (clockPm) {
      clockPm.textContent = formatClock(
        'pm',
        state.timeMin - offsetForPeak(state, 'pm'),
      );
    }

    const playButton = this.querySelector<HTMLButtonElement>('[data-action="toggle-play"]');
    if (playButton) {
      playButton.classList.toggle('is-playing', state.playing);
      const icon = playButton.querySelector('.play-icon');
      const label = playButton.querySelector('.play-label');
      if (icon) icon.textContent = state.playing ? '❚❚' : '▶';
      if (label) label.textContent = state.playing ? '暂停（回放跟随当前轴）' : '从当前预览点回放';
    }

    this.querySelectorAll<HTMLButtonElement>('.speed-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.speed) === state.speed);
    });
    this.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === state.viewMode);
    });
    const shiftBtn = this.querySelector<HTMLButtonElement>('[data-action="shift-pm"]');
    if (shiftBtn) {
      shiftBtn.textContent =
        state.pmOffsetCells === 0.5
          ? '↶ 晚高峰复位半格'
          : '↷ 晚高峰整体挪半格';
      shiftBtn.classList.toggle('is-on', state.pmOffsetCells === 0.5);
    }

    this.querySelectorAll<HTMLElement>('.kf-chip').forEach((chip) => {
      const seek = Number(chip.dataset.seek);
      chip.classList.toggle('current', Math.abs(seek - state.timeMin) < 0.18);
    });

    const note = this.querySelector<HTMLElement>('[data-role="flip-note"]');
    if (note) {
      const flipWindow = getPassageWindow(state);
      note.innerHTML = `
        <strong>流向翻转对位：</strong>
        中央通道内早高峰高流量为左→右（1,860 pax/h），晚高峰高流量反转为右→左（2,240 pax/h）；
        晚高峰整组右移 <b>${state.pmOffsetCells} 格 = ${state.pmOffsetCells * state.cellMin} min</b>，
        两向箭头在 ${flipWindow.label}（${flipWindow.startMin.toFixed(1)}–${flipWindow.endMin.toFixed(1)}′）错开，可读出流向在高峰中段完成主次翻转。
        <span class="sync-ok">✓ 拖到哪，回放从哪开始；画布与时间轴共用 ${state.timeMin.toFixed(2)}′</span>`;
    }
  }
}

customElements.define('timeline-panel', TimelinePanel);
