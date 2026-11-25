import { store } from '../store';
import './plan-canvas';
import './inspector-panel';
import './timeline-panel';
import './review-dialog';

export class StationApp extends HTMLElement {
  private frameId = 0;
  private lastFrameTime = 0;

  connectedCallback(): void {
    this.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand">
            <div class="brand-mark">换</div>
            <div>
              <h1>换乘流线走查动画工作台</h1>
              <p>原生 TypeScript · Web Components · Konva ｜ 站厅/站台平面、楼扶梯、闸机与高峰流线关键帧</p>
            </div>
          </div>
          <div class="top-actions">
            <span class="status-pill" data-role="sync-pill">时间轴已同步</span>
            <button class="btn primary" data-action="open-review" type="button">定稿与运营确认</button>
          </div>
        </header>

        <main class="workspace">
          <section class="canvas-card panel">
            <plan-canvas></plan-canvas>
          </section>
          <inspector-panel></inspector-panel>
        </main>

        <timeline-panel></timeline-panel>
        <review-dialog></review-dialog>
      </div>
    `;

    this.querySelector('[data-action="open-review"]')?.addEventListener('click', () => {
      store.setReviewOpen(true);
    });

    this.lastFrameTime = performance.now();
    const loop = (now: number) => {
      const delta = Math.min(64, now - this.lastFrameTime);
      this.lastFrameTime = now;
      store.tick(delta);
      const pill = this.querySelector<HTMLElement>('[data-role="sync-pill"]');
      if (pill) {
        pill.textContent = store.state.playing
          ? `回放中 · ${store.state.timeMin.toFixed(2)}′`
          : `预览帧 · ${store.state.timeMin.toFixed(2)}′（播放从此开始）`;
      }
      this.frameId = requestAnimationFrame(loop);
    };
    this.frameId = requestAnimationFrame(loop);
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.frameId);
  }
}

customElements.define('station-app', StationApp);
