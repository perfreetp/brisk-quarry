import type { AudienceEngine } from '../pixi/AudienceEngine';
import { AUDIENCE_TYPES, SPONSOR_PRESET, ZONE_PRESETS } from '../data/presets';
import { numberToHex } from '../utils/color';
import type { FillTarget } from '../types';

interface Props {
  engineRef: React.MutableRefObject<AudienceEngine | null>;
  locked: boolean;
  onImported: () => void;
  onStatsInvalidate: () => void;
}

export default function LeftPanel({ engineRef, locked, onImported, onStatsInvalidate }: Props) {
  const eng = () => engineRef.current;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const typeIdx = Number(e.dataTransfer.getData('text/audience-type'));
    if (Number.isNaN(typeIdx)) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    eng()?.dropType(typeIdx, e.clientX - rect.left, e.clientY - rect.top);
    onStatsInvalidate();
  };

  const fill = (target: FillTarget, typeIdx: number) => {
    eng()?.fillTarget(target, typeIdx);
    onStatsInvalidate();
  };

  return (
    <aside className="side left-panel">
      <section className="card">
        <h3>① 座位图导入</h3>
        <p className="hint">企划提供场馆座位图，系统按排自动生成座位点阵</p>
        <button
          className="btn primary"
          disabled={locked}
          onClick={() => {
            eng()?.fillAllMixed();
            onImported();
            onStatsInvalidate();
          }}
        >
          导入场馆并生成观众点阵
        </button>
        <div className="btn-row">
          <button className="btn small" disabled={locked} onClick={() => fill('all', -1)}>
            全馆混合填充
          </button>
          <button className="btn small" disabled={locked} onClick={() => eng()?.clearSelection()}>
            清空选择
          </button>
        </div>
      </section>

      <section
        className={`card drop-zone ${locked ? 'disabled' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <h3>② 观众形象库</h3>
        <p className="hint">拖到看台任意位置 → 按色温区域批量填充上万观众</p>
        <div className="type-list">
          {AUDIENCE_TYPES.map((t, idx) => (
            <div
              key={t.id}
              className="type-card"
              draggable={!locked}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/audience-type', String(idx));
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <div className="type-swatch" style={{ background: t.uiColor }} />
              <div className="type-meta">
                <div className="type-name">{t.name}</div>
                <div className="type-desc">{t.desc}</div>
                <div className="type-colors">
                  {t.bodyColors.slice(0, 4).map((c, i) => (
                    <i key={i} style={{ background: numberToHex(c) }} />
                  ))}
                  <span className="stick-tag">
                    棒：
                    {t.stickColors.slice(0, 3).map((c, i) => (
                      <i key={i} style={{ background: numberToHex(c) }} />
                    ))}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="btn-row wrap">
          {ZONE_PRESETS.map((z) => (
            <button
              key={z.id}
              className="btn small"
              disabled={locked}
              onClick={() => fill(`zone:${z.id}`, -1)}
            >
              填充{z.name.split('（')[0]}
            </button>
          ))}
          <button className="btn small" disabled={locked} onClick={() => fill('sponsor', 0)}>
            赞助区块→应援团
          </button>
        </div>
      </section>

      <section className="card">
        <h3>灯光指导 · 区域色温</h3>
        <div className="zone-list">
          {ZONE_PRESETS.map((z) => (
            <div key={z.id} className="zone-row">
              <i className="zone-dot" style={{ background: numberToHex(z.tint) }} />
              <span className="zone-name">{z.name}</span>
              <span className="zone-temp">{z.colorTemp}K</span>
              <span className="zone-rows">
                第{z.rowMin}-{z.rowMax}排
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>商务 · 赞助方露出</h3>
        <div className="sponsor-row">
          <i className="zone-dot big" style={{ background: numberToHex(SPONSOR_PRESET.color) }} />
          <div>
            <div className="type-name">{SPONSOR_PRESET.name}</div>
            <div className="type-desc">
              应援色 {numberToHex(SPONSOR_PRESET.color).toUpperCase()} · 露出区块 第
              {SPONSOR_PRESET.rowMin}-{SPONSOR_PRESET.rowMax}排 中央
            </div>
          </div>
        </div>
      </section>
    </aside>
  );
}
