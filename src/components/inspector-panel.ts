import { FACILITIES, getFacility } from '../data/station';
import { buildOperabilityChecks } from '../engine/flowEngine';
import { store } from '../store';
import type { AppState, FlowTrack } from '../types';
import type { PlanCanvas } from './plan-canvas';

interface DistanceRow {
  segment: string;
  distanceM: number;
  detail: string;
}

export class InspectorPanel extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private lastSelected = '';
  private lastJamSignature = '';
  private lastChecksSignature = '';
  private lastLogsRef: unknown = null;
  private lastDistanceVersion = -1;

  connectedCallback(): void {
    this.innerHTML = `
      <aside class="inspector panel" aria-label="流量、卡顿与走查检查器">
        <header class="inspector-header">
          <h2>走查检查器</h2>
          <button class="btn small" data-action="export-png" type="button">导出当前帧 PNG</button>
        </header>

        <section class="inspector-block" data-role="facility-block">
          <label class="facility-select-field">
            <span>选择平面设备</span>
            <select data-role="facility-select" aria-label="选择闸机、楼梯口或楼扶梯"></select>
          </label>
          <div data-role="selected-editor"></div>
        </section>

        <section class="inspector-block">
          <h3>闸机卡顿 / 叠帧人数对比</h3>
          <div data-role="jam-panel"></div>
        </section>

        <section class="inspector-block">
          <h3>嵌套双向通道</h3>
          <div class="hierarchy">
            <code>fit-root<br>└─ #passage-central<br>&nbsp;&nbsp;&nbsp;└─ #passage-lanes<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ nested-am-up<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ nested-am-down<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ nested-pm-up<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ nested-pm-down</code>
          </div>
          <button class="btn small" data-action="verify-nested" type="button">校验拖帧后嵌套层是否跑位</button>
          <p class="verify-result" data-role="verify-result">结构约束：子流线使用通道组本地坐标，父组统一承受适配缩放。</p>
        </section>

        <section class="inspector-block">
          <h3>关键换乘距离</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>关键段</th><th>距离</th><th>说明</th></tr></thead>
              <tbody data-role="distance-body"></tbody>
            </table>
          </div>
        </section>

        <section class="inspector-block">
          <h3>可运营性自检</h3>
          <div data-role="checks"></div>
          <button class="btn primary block" data-action="open-review" type="button">定稿并提交业主 / 运营方确认</button>
        </section>

        <section class="inspector-block logs-block">
          <h3>重排与操作记录</h3>
          <div class="logs" data-role="logs"></div>
        </section>
      </aside>
    `;

    this.bindEvents();
    this.renderFacilityOptions();
    this.renderDistances();
    this.unsubscribe = store.subscribe(() => this.update());
    this.update();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private bindEvents(): void {
    this.addEventListener('change', (event) => {
      const select = (event.target as HTMLElement).closest<HTMLSelectElement>(
        '[data-role="facility-select"]',
      );
      if (select?.value) store.selectFacility(select.value);
    });

    this.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const actionEl = target.closest<HTMLElement>('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;

      if (action === 'apply-flow') this.applyFlow();
      if (action === 'preset-am-stress') {
        store.updateFacilityFlow('am', 'MOUTH-W', 3720);
      }
      if (action === 'reset-flows') {
        store.updateFacilityFlow('am', 'MOUTH-W', 2980);
        store.updateFacilityFlow('pm', 'MOUTH-W', 3180);
      }
      if (action === 'record-jam') store.recordJamAtCurrentFrame();
      if (action === 'previous-overlay') store.showPreviousOverlay();
      if (action === 'jam-frame') store.showJamFrame();
      if (action === 'clear-jam') store.clearJam();
      if (action === 'open-review') store.setReviewOpen(true);
      if (action === 'export-png') {
        document.querySelector<PlanCanvas>('plan-canvas')?.exportPng();
      }
      if (action === 'verify-nested') {
        const result = document
          .querySelector<PlanCanvas>('plan-canvas')
          ?.verifyNestedAlignment();
        const out = this.querySelector<HTMLElement>('[data-role="verify-result"]');
        if (out && result) {
          out.innerHTML = `本次实测绝对变换偏差 <b>${result.driftPx} px</b>，约 <b>${result.driftM} m</b>；嵌套层随拖帧联动，未跑位。`;
        }
      }
    });
  }

  private applyFlow(): void {
    const facilityId = store.state.selectedFacilityId;
    const amInput = this.querySelector<HTMLInputElement>('[data-flow-input="am"]');
    const pmInput = this.querySelector<HTMLInputElement>('[data-flow-input="pm"]');
    const amValue = Number(amInput?.value);
    const pmValue = Number(pmInput?.value);
    if (
      amInput &&
      Number.isFinite(amValue) &&
      amValue !== store.state.facilityFlows.am[facilityId]
    ) {
      store.updateFacilityFlow('am', facilityId, amValue);
    }
    if (
      pmInput &&
      Number.isFinite(pmValue) &&
      pmValue !== store.state.facilityFlows.pm[facilityId]
    ) {
      store.updateFacilityFlow('pm', facilityId, pmValue);
    }
  }

  private renderFacilityOptions(): void {
    const select = this.querySelector<HTMLSelectElement>('[data-role="facility-select"]');
    if (!select) return;
    const kindLabels: Record<string, string> = {
      gate: '闸机',
      mouth: '楼梯口',
      escalator: '扶梯',
      stairs: '楼梯',
      passage: '通道',
      platform: '站台',
      hall: '站厅',
    };
    select.innerHTML = FACILITIES.filter((facility) =>
      ['gate', 'mouth', 'escalator', 'stairs', 'passage'].includes(facility.kind),
    )
      .map((facility) => {
        const group = kindLabels[facility.kind] ?? '设施';
        return `<option value="${facility.id}">${group} · ${facility.name}（${facility.id}）</option>`;
      })
      .join('');
    select.value = store.state.selectedFacilityId;
  }

  private renderSelectedEditor(): void {
    const host = this.querySelector<HTMLElement>('[data-role="selected-editor"]');
    if (!host) return;
    const state = store.state;
    const id = state.selectedFacilityId;
    if (id === this.lastSelected && host.dataset.rendered === 'true') {
      this.updateFlowInputValues(state);
      return;
    }
    this.lastSelected = id;
    const facility = getFacility(id);

    if (!facility) {
      host.innerHTML = `<h3>未选择设备</h3><p>点击平面图中的闸机或楼扶梯口。</p>`;
      host.dataset.rendered = 'true';
      return;
    }

    const isMouth = facility.kind === 'mouth';
    const isGate = facility.kind === 'gate';
    host.innerHTML = `
      <h3>${facility.name} <small>${facility.id}</small></h3>
      <p class="facility-note">${facility.note ?? `${facility.floor} 层设施 · 设计能力 ${facility.capacityPaxH?.toLocaleString() ?? '—'} pax/h`}</p>
      ${
        isMouth
          ? `
            <label class="flow-field">
              <span>早高峰流量 pax/h</span>
              <input type="number" min="0" max="6000" step="20" data-flow-input="am"
                value="${state.facilityFlows.am[id] ?? 0}" />
            </label>
            <label class="flow-field">
              <span>晚高峰流量 pax/h</span>
              <input type="number" min="0" max="6000" step="20" data-flow-input="pm"
                value="${state.facilityFlows.pm[id] ?? 0}" />
            </label>
            <div class="button-row">
              <button class="btn primary small" data-action="apply-flow" type="button">应用并重排关键帧</button>
              <button class="btn small warning" data-action="preset-am-stress" type="button">早高峰大客流 3720</button>
              <button class="btn small" data-action="reset-flows" type="button">恢复咨询值</button>
            </div>
            <p class="hint">关键帧 ID 和平面点位不变；首帧锁定，后续帧时间间距按新流量/能力比重新计算。</p>
          `
          : isGate
            ? `
              <p>该闸机设计通行能力约 <b>${facility.capacityPaxH}</b> pax/h。可在下方卡顿面板记录排队并叠上一帧对比人数。</p>
              <button class="btn primary small" data-action="record-jam" type="button">在当前走查点记录卡顿</button>
            `
            : `
              <p>该楼扶梯组位置和能力已铺入平面。选择 <b>西楼梯口 MOUTH-W</b> 可修改高峰流量并观察关键帧重排。</p>
              <button class="btn small" data-action="preset-am-stress" type="button">直接调整西楼梯口早高峰流量</button>
            `
      }
    `;
    host.dataset.rendered = 'true';
    this.updateFlowInputValues(state);
  }

  private updateFlowInputValues(state: AppState): void {
    for (const peak of ['am', 'pm'] as const) {
      const input = this.querySelector<HTMLInputElement>(`[data-flow-input="${peak}"]`);
      if (!input || document.activeElement === input) continue;
      input.value = String(state.facilityFlows[peak][state.selectedFacilityId] ?? '');
    }
  }

  private getDistanceRows(): DistanceRow[] {
    const lr: FlowTrack | undefined = store.state.groups.am.tracks.find(
      (track) => track.routeId === 'lr',
    );
    const rl: FlowTrack | undefined = store.state.groups.am.tracks.find(
      (track) => track.routeId === 'rl',
    );
    if (!lr || !rl) return [];

    const distanceBetween = (track: FlowTrack, fromNode: string, toNode: string) => {
      const from = track.keyframes.find((kf) => kf.nodeId === fromNode);
      const to = track.keyframes.find((kf) => kf.nodeId === toNode);
      return Math.abs((to?.distanceM ?? 0) - (from?.distanceM ?? 0));
    };

    return [
      {
        segment: '2号线上行站台 → 西楼梯口',
        distanceM: distanceBetween(lr, 'p2-door', 'w-mouth'),
        detail: '站台排队及横向走行',
      },
      {
        segment: '西楼梯口 → 西站厅扶梯顶',
        distanceM: distanceBetween(lr, 'w-mouth', 'w-top'),
        detail: '楼梯+扶梯提升折算长度',
      },
      {
        segment: '中央双向通道',
        distanceM: distanceBetween(lr, 'passage-w', 'passage-e'),
        detail: '早晚两方向同组敷设',
      },
      {
        segment: '通道东口 → G3 闸机',
        distanceM: distanceBetween(lr, 'passage-e', 'gate-g3'),
        detail: '闸机前缓冲距离',
      },
      {
        segment: 'G3 闸机 → 东扶梯顶',
        distanceM: distanceBetween(lr, 'gate-g3', 'e-top'),
        detail: '闸后汇流',
      },
      {
        segment: '东扶梯 → 5号线站台',
        distanceM: distanceBetween(lr, 'e-top', 'p5-door'),
        detail: '下行提升+站台走行',
      },
      {
        segment: '上行方向合计',
        distanceM: lr.totalDistanceM,
        detail: '2号线上行至5号线下行',
      },
      {
        segment: '下行方向合计',
        distanceM: rl.totalDistanceM,
        detail: '5号线上行至2号线下行',
      },
    ];
  }

  private renderDistances(): void {
    const body = this.querySelector<HTMLElement>('[data-role="distance-body"]');
    if (!body) return;
    body.innerHTML = this.getDistanceRows()
      .map(
        (row) => `
        <tr class="${row.segment.includes('合计') ? 'total-row' : ''}">
          <td>${row.segment}</td>
          <td><b>${row.distanceM}</b> m</td>
          <td class="muted">${row.detail}</td>
        </tr>`,
      )
      .join('');
  }

  private renderJamPanel(): void {
    const host = this.querySelector<HTMLElement>('[data-role="jam-panel"]');
    if (!host) return;
    const { jam, selectedFacilityId } = store.state;
    const selectedIsGate = selectedFacilityId.startsWith('G');

    if (!jam) {
      host.innerHTML = `
        <p class="hint">把时间轴拖到闸机段，发现卡住后记录当前帧；再翻回上一关键帧，用红色半透明叠层对比多了多少人。</p>
        <div class="button-row">
          <button class="btn primary small" data-action="record-jam" type="button">
            ${selectedIsGate ? `记录 ${selectedFacilityId} 卡顿` : '记录 G3 卡顿'}
          </button>
        </div>`;
      return;
    }

    host.innerHTML = `
      <div class="jam-card ${store.state.compareOverlay ? 'is-overlay' : ''}">
        <div class="jam-title">${jam.gateName} · ${jam.keyframeLabel}</div>
        <div class="jam-counts">
          <div><span>上一帧</span><b>${jam.previous.totalPeople}</b><small>人 @ ${jam.compareAtMin.toFixed(2)}′</small></div>
          <div class="arrow">→</div>
          <div class="jam"><span>卡顿帧</span><b>${jam.jam.totalPeople}</b><small>人 @ ${jam.recordedAtMin.toFixed(2)}′</small></div>
          <div class="delta"><span>人数差</span><b>+${jam.deltaPeople}</b><small>人</small></div>
        </div>
        <p class="hint">到达 ${jam.jam.arrivalPerMin.toFixed(1)} 人/分；卡顿后通行能力降至 ${jam.jam.capacityPerMin.toFixed(1)} 人/分，排队 ${jam.jam.queue} 人。</p>
        <div class="button-row wrap">
          <button class="btn small" data-action="previous-overlay" type="button">翻回上一帧叠着看</button>
          <button class="btn small" data-action="jam-frame" type="button">回到卡顿帧+叠层</button>
          <button class="btn ghost small" data-action="clear-jam" type="button">清除</button>
        </div>
      </div>`;
  }

  private renderChecks(): void {
    const host = this.querySelector<HTMLElement>('[data-role="checks"]');
    if (!host) return;
    const checks = buildOperabilityChecks(store.state);
    host.innerHTML = checks
      .map(
        (check) => `
        <div class="check-row status-${check.status}">
          <i>${check.status === 'pass' ? '✓' : check.status === 'watch' ? '!' : '×'}</i>
          <div><b>${check.label}</b><span>${check.detail}</span></div>
        </div>`,
      )
      .join('');
  }

  private renderLogs(): void {
    const host = this.querySelector<HTMLElement>('[data-role="logs"]');
    if (!host) return;
    host.innerHTML = store.state.logs
      .map(
        (log) => `
        <div class="log-row">
          <time>${log.time}</time>
          <p>${log.message}</p>
          ${log.affectedTracks ? `<small>影响 ${log.affectedTracks} 条轨道 / ${log.affectedKeyframes} 个关键帧</small>` : ''}
        </div>`,
      )
      .join('');
  }

  private update(): void {
    if (!this.isConnected) return;
    const facilitySelect = this.querySelector<HTMLSelectElement>(
      '[data-role="facility-select"]',
    );
    if (facilitySelect && document.activeElement !== facilitySelect) {
      facilitySelect.value = store.state.selectedFacilityId;
    }
    this.renderSelectedEditor();

    const jamSignature = JSON.stringify({
      selected: store.state.selectedFacilityId,
      jam: store.state.jam,
      overlay: store.state.compareOverlay,
    });
    if (jamSignature !== this.lastJamSignature) {
      this.lastJamSignature = jamSignature;
      this.renderJamPanel();
    }

    const checksSignature = JSON.stringify({
      version: store.state.structureVersion,
      jam: store.state.jam
        ? { gate: store.state.jam.gateId, delta: store.state.jam.deltaPeople }
        : null,
      flows: store.state.facilityFlows,
    });
    if (checksSignature !== this.lastChecksSignature) {
      this.lastChecksSignature = checksSignature;
      this.renderChecks();
    }

    if (this.lastLogsRef !== store.state.logs) {
      this.lastLogsRef = store.state.logs;
      this.renderLogs();
    }

    if (this.lastDistanceVersion !== store.state.structureVersion) {
      this.lastDistanceVersion = store.state.structureVersion;
      this.renderDistances();
    }
  }
}

customElements.define('inspector-panel', InspectorPanel);
