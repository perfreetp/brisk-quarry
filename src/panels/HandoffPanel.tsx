import { useMemo, useState } from 'react';
import type { AudioAsset, LoopRegion, Project } from '../types';
import { buildHandoff } from '../lib/projectOps';

interface HandoffPanelProps {
  project: Project;
  assets: AudioAsset[];
  loop: LoopRegion;
  onNotify: (message: string) => void;
}

export function HandoffPanel({ project, assets, loop, onNotify }: HandoffPanelProps) {
  const packageData = useMemo(() => buildHandoff(project, assets, loop), [project, assets, loop]);
  const json = useMemo(() => JSON.stringify(packageData, null, 2), [packageData]);
  const [copied, setCopied] = useState(false);

  async function copyJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      onNotify('交付 JSON 已复制');
    } catch {
      onNotify('剪贴板不可用，请选择 JSON 文本手动复制');
    }
  }

  function downloadJson(): void {
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dual-cue-timeline-handoff.json';
    a.click();
    URL.revokeObjectURL(url);
    onNotify('已下载音画时间轴与触发条件 JSON');
  }

  return (
    <div className="handoff-panel">
      <section className="inspector-section">
        <h4>交付音频组 / UI 组</h4>
        <p className="section-sub">每个提示点包含共享时间、包络、关键帧、同步偏差、触发事件、声音信标和字幕。</p>
        <div className="button-row">
          <button type="button" className="primary-btn" onClick={() => void copyJson()}>{copied ? '已复制 ✓' : '复制 JSON'}</button>
          <button type="button" className="secondary-btn" onClick={downloadJson}>下载 JSON</button>
        </div>
      </section>

      <section className="inspector-section">
        <h4>音频组视图 · 声音信标</h4>
        <div className="handoff-list">
          {packageData.audioTeam.map((item) => (
            <article className="handoff-card audio" key={String(item.cueId)}>
              <header><b>{String(item.code)}</b><span>{String(item.asset)}</span></header>
              <p><strong>触发：</strong>{String(item.trigger)}</p>
              <p><strong>条件：</strong>{String(item.precondition)}</p>
              <p><strong>信标：</strong>{String(item.soundBeacon)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <h4>UI 组视图 · 高亮与字幕</h4>
        <div className="handoff-list">
          {packageData.uiTeam.map((item) => (
            <article className="handoff-card ui" key={String(item.cueId)}>
              <header><b>{String(item.code)}</b><span>{String(item.target)}</span></header>
              <p><strong>触发：</strong>{String(item.trigger)}</p>
              <p><strong>字幕：</strong>{String((item.accessibility as { subtitle: string }).subtitle)}</p>
              <p className="muted">缓动 {String((item.highlight as { easing: string }).easing)} · {String((item.highlight as { keyframes: unknown[] }).keyframes.length)} 个关键帧</p>
            </article>
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <h4>原始 JSON</h4>
        <textarea className="json-box" readOnly value={json} onFocus={(e) => e.currentTarget.select()} />
      </section>
    </div>
  );
}
