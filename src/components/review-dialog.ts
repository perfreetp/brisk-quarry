import {
  buildConfirmationPackage,
  buildHtmlReport,
  downloadHtml,
  downloadJson,
} from '../exporter';
import { store } from '../store';
import type { Signoff } from '../types';
import type { PlanCanvas } from './plan-canvas';

const DECISION_LABELS: Record<Signoff['decision'], string> = {
  pending: '待确认',
  operable: '确认可运营',
  conditional: '有条件可运营',
  rework: '需整改后复核',
};

export class ReviewDialog extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private recording = false;

  connectedCallback(): void {
    this.innerHTML = `
      <div class="review-overlay" data-role="overlay" hidden>
        <section class="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
          <header class="review-header">
            <div>
              <h2 id="review-title">定稿确认：早晚高峰流线动画 + 关键换乘距离</h2>
              <p>提交业主与运营方确认可运营性；本地浏览器可导出确认包、HTML 确认单和 WebM 动画。</p>
            </div>
            <button class="btn icon" data-action="close" type="button" aria-label="关闭">×</button>
          </header>

          <div class="review-body">
            <div class="review-summary" data-role="summary"></div>

            <section class="export-grid">
              <button class="btn primary" data-action="export-json" type="button">下载 JSON 确认包（含两组关键帧）</button>
              <button class="btn" data-action="export-html" type="button">下载 HTML 会签确认单</button>
              <button class="btn" data-action="export-png" type="button">导出当前平面帧 PNG</button>
              <button class="btn warning" data-action="record-webm" type="button">录制早晚叠加动画 WebM</button>
            </section>
            <p class="record-status" data-role="record-status">WebM 将自动从 0′ 播放到 12′，并录制当前 Konva 画布。</p>

            <div class="signoff-grid">
              ${this.renderSignoffForm('owner', '业主方确认')}
              ${this.renderSignoffForm('operator', '运营方确认')}
            </div>

            <div class="review-actions">
              <button class="btn primary large" data-action="finalize" type="button">标记定稿并更新确认状态</button>
              <span class="final-state" data-role="final-state"></span>
            </div>
          </div>
        </section>
      </div>
    `;

    this.bindEvents();
    this.unsubscribe = store.subscribe(() => this.update());
    this.update();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private renderSignoffForm(role: 'owner' | 'operator', title: string): string {
    const signoff = store.state.signoffs[role];
    return `
      <fieldset class="signoff-form">
        <legend>${title}</legend>
        <label>代表姓名
          <input type="text" data-signoff="${role}.name" value="${signoff.name}" placeholder="填写姓名" />
        </label>
        <label>可运营性结论
          <select data-signoff="${role}.decision">
            ${Object.entries(DECISION_LABELS)
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${value === signoff.decision ? 'selected' : ''}>${label}</option>`,
              )
              .join('')}
          </select>
        </label>
        <label>确认意见 / 附加措施
          <textarea rows="4" data-signoff="${role}.note" placeholder="例如：同意；开业前完成 G3 铁马和导流岗演练">${signoff.note}</textarea>
        </label>
        <p class="signed-at" data-role="${role}-signed"></p>
      </fieldset>`;
  }

  private bindEvents(): void {
    this.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      if (target.matches('[data-role="overlay"]')) {
        store.setReviewOpen(false);
        return;
      }
      const actionEl = target.closest<HTMLElement>('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;

      if (action === 'close') store.setReviewOpen(false);
      if (action === 'finalize') store.finalize();
      if (action === 'export-json') {
        downloadJson('换乘流线可运营性确认包.json', buildConfirmationPackage(store.state));
      }
      if (action === 'export-html') {
        downloadHtml('换乘流线会签确认单.html', buildHtmlReport(store.state));
      }
      if (action === 'export-png') {
        this.planCanvas()?.exportPng();
      }
      if (action === 'record-webm') {
        await this.recordWebm();
      }
    });

    this.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      '[data-signoff]',
    ).forEach((input) => {
      input.addEventListener('input', () => {
        const [role, field] = (input.dataset.signoff ?? '').split('.') as [
          'owner' | 'operator',
          keyof Signoff,
        ];
        if (field === 'decision') {
          store.updateSignoff(role, {
            decision: input.value as Signoff['decision'],
          });
        } else if (field === 'name') {
          store.updateSignoff(role, { name: input.value });
        } else {
          store.updateSignoff(role, { note: input.value });
        }
      });
    });
  }

  private planCanvas(): PlanCanvas | null | undefined {
    return document.querySelector<PlanCanvas>('plan-canvas');
  }

  private async recordWebm(): Promise<void> {
    if (this.recording) return;
    const status = this.querySelector<HTMLElement>('[data-role="record-status"]');
    const canvas = this.planCanvas()?.captureCanvas();
    const captureable = canvas as
      | (HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream })
      | null
      | undefined;

    if (!captureable?.captureStream || typeof MediaRecorder === 'undefined') {
      if (status) status.textContent = '当前浏览器不支持 canvas.captureStream/MediaRecorder；可使用 JSON 关键帧或 PNG 快照交接。';
      return;
    }

    this.recording = true;
    if (status) status.textContent = '正在从 0′ 录制早晚叠加动画…';
    const previousSpeed = store.state.speed;
    const stream = captureable.captureStream(30);
    const mimeType = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, videoBitsPerSecond: 7_000_000 } : undefined,
    );
    const chunks: BlobPart[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
    });

    recorder.start(200);
    store.setSpeed(2);
    store.restart();

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        unsubscribe();
        resolve();
      };
      const unsubscribe = store.subscribe(() => {
        if (!store.state.playing && store.state.timeMin >= store.state.durationMin - 0.02) {
          window.setTimeout(finish, 350);
        }
      });
      window.setTimeout(finish, 24_000);
    });

    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '早晚高峰换乘流线对比.webm';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.setSpeed(previousSpeed);
    this.recording = false;
    if (status) status.textContent = `已录制并下载 ${(blob.size / 1024 / 1024).toFixed(2)} MB WebM。`;
  }

  private update(): void {
    const overlay = this.querySelector<HTMLElement>('[data-role="overlay"]');
    if (overlay) overlay.hidden = !store.state.reviewOpen;
    if (!store.state.reviewOpen) return;

    const summary = this.querySelector<HTMLElement>('[data-role="summary"]');
    if (summary) {
      const state = store.state;
      const trackCount = state.groups.am.tracks.length + state.groups.pm.tracks.length;
      const keyframeCount = [...state.groups.am.tracks, ...state.groups.pm.tracks].reduce(
        (sum, track) => sum + track.keyframes.length,
        0,
      );
      const maxDistance = Math.max(
        ...[...state.groups.am.tracks, ...state.groups.pm.tracks].map(
          (track) => track.totalDistanceM,
        ),
      );
      summary.innerHTML = `
        <div class="stat"><span>流线轨道</span><b>${trackCount} 条</b><small>早晚各上行/下行一条</small></div>
        <div class="stat"><span>关键帧</span><b>${keyframeCount} 个</b><small>流量变化后自动重排</small></div>
        <div class="stat"><span>晚高峰偏移</span><b>${state.pmOffsetCells} 格</b><small>${state.pmOffsetCells * state.cellMin} 分钟</small></div>
        <div class="stat"><span>最长换乘距离</span><b>${maxDistance} m</b><small>关键距离表可导出</small></div>
        <div class="stat ${state.jam ? 'warn' : ''}"><span>卡顿叠帧</span><b>${state.jam ? `+${state.jam.deltaPeople}人` : '未记录'}</b><small>${state.jam ? state.jam.gateName : '走查闸机段生成'}</small></div>
      `;
    }

    const finalState = this.querySelector<HTMLElement>('[data-role="final-state"]');
    if (finalState) {
      const { owner, operator } = store.state.signoffs;
      const ready = owner.decision !== 'pending' && operator.decision !== 'pending';
      finalState.textContent = store.state.finalized
        ? ready
          ? '✓ 已定稿且双方已选择结论，可随附 WebM/JSON/HTML 发出'
          : '已定稿；请补齐业主与运营方结论后发出会签'
        : '尚未定稿';
      finalState.className = `final-state ${store.state.finalized ? 'done' : ''}`;
    }

    for (const role of ['owner', 'operator'] as const) {
      const signed = this.querySelector<HTMLElement>(`[data-role="${role}-signed"]`);
      if (signed) {
        const signoff = store.state.signoffs[role];
        signed.textContent = signoff.signedAt
          ? `最近结论时间：${new Date(signoff.signedAt).toLocaleString('zh-CN', { hour12: false })}`
          : '尚未选择结论';
      }
    }
  }
}

customElements.define('review-dialog', ReviewDialog);
