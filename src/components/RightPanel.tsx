import { useState } from 'react';
import type { AudienceEngine } from '../pixi/AudienceEngine';
import type { PersonInfo } from '../types';
import { SPONSOR_PRESET } from '../data/presets';
import { numberToHex } from '../utils/color';

interface Props {
  engineRef: React.MutableRefObject<AudienceEngine | null>;
  selectedInfo: PersonInfo | null;
  selectedCount: number;
  selectedRows: number[];
  locked: boolean;
  onLockChange: (locked: boolean) => void;
  onStatsInvalidate: () => void;
  onPreviewTick: () => void;
}

export default function RightPanel({
  engineRef,
  selectedInfo,
  selectedCount,
  selectedRows,
  locked,
  onLockChange,
  onStatsInvalidate,
  onPreviewTick,
}: Props) {
  const [maskInput, setMaskInput] = useState('33-35');
  const [placement, setPlacement] = useState<{ aisle: number[]; stageEdge: number[]; masked: number } | null>(null);

  const eng = () => engineRef.current;

  const parseRows = (text: string): number[] => {
    const out = new Set<number>();
    for (const part of text.split(/[,，\s]+/).filter(Boolean)) {
      const m = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) continue;
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      for (let r = Math.min(a, b); r <= Math.max(a, b); r++) out.add(r);
    }
    return [...out].sort((x, y) => x - y);
  };

  const applyMask = () => {
    eng()?.setMaskedRows(parseRows(maskInput));
    onStatsInvalidate();
    onPreviewTick();
  };

  const restoreMask = () => {
    eng()?.setMaskedRows([]);
    setMaskInput('');
    onStatsInvalidate();
    onPreviewTick();
  };

  const toggleLock = () => {
    const e = eng();
    if (!e) return;
    if (e.isLocked()) {
      e.unlockPlan();
      onLockChange(false);
    } else {
      e.lockPlan();
      onLockChange(true);
      doExport(e);
    }
  };

  const doExport = (e: AudienceEngine) => {
    const blob = new Blob([e.exportPlan()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stage-audience-plan-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runPlacementCheck = () => {
    const r = eng()?.checkPlacement();
    if (r) setPlacement(r);
  };

  return (
    <aside className="side right-panel">
      <section className="card">
        <h3>③ 框选与应援色</h3>
        <p className="hint">开启框选后在俯视图拉框；也可一键选中第 12-18 排</p>
        <div className="btn-row">
          <button
            className="btn small"
            disabled={locked}
            onClick={() => {
              const e = eng();
              if (!e) return;
              e.setSelectMode(true);
              e.selectRows(12, 18);
              onStatsInvalidate();
            }}
          >
            框选第 12-18 排
          </button>
          <button
            className="btn small"
            disabled={locked}
            onClick={() => {
              eng()?.setSelectMode(false);
              onStatsInvalidate();
            }}
          >
            退出框选
          </button>
        </div>
        <div className="selection-summary">
          <div>
            选中 <b>{selectedCount.toLocaleString()}</b> 个座位
          </div>
          {selectedRows.length > 0 && (
            <div className="hint">
              覆盖排号：{selectedRows[0]}–{selectedRows[selectedRows.length - 1]}（共 {selectedRows.length} 排）
            </div>
          )}
        </div>
        <button
          className="btn sponsor-btn"
          disabled={locked || selectedCount === 0}
          onClick={() => {
            const n = eng()?.paintSelectedSticks(SPONSOR_PRESET.color);
            if (n) {
              onStatsInvalidate();
              onPreviewTick();
            }
          }}
        >
          <i style={{ background: numberToHex(SPONSOR_PRESET.color) }} />
          荧光棒统一改为赞助方橙色
        </button>
      </section>

      <section className="card">
        <h3>④ 道具遮挡 · 区域遮罩</h3>
        <p className="hint">输入排号（如 33-35 或 28,41-42），遮罩后渲染量随之降低</p>
        <div className="btn-row">
          <input
            className="text-input"
            value={maskInput}
            disabled={locked}
            onChange={(e) => setMaskInput(e.target.value)}
            placeholder="如 33-35"
          />
        </div>
        <div className="btn-row">
          <button className="btn small" disabled={locked} onClick={applyMask}>
            遮罩这几排
          </button>
          <button className="btn small" disabled={locked} onClick={restoreMask}>
            按原位置恢复
          </button>
        </div>
      </section>

      <section className="card">
        <h3>⑤ 摆位核查</h3>
        <button className="btn small" onClick={runPlacementCheck}>
          检查过道 / 舞台边摆位
        </button>
        {placement && (
          <div className="placement-result">
            <div className={placement.aisle.length ? 'warn' : 'ok'}>
              过道异常座位：{placement.aisle.length} 个
            </div>
            <div className={placement.stageEdge.length ? 'warn' : 'ok'}>
              舞台边过近座位：{placement.stageEdge.length} 个
            </div>
            <div className="hint">当前遮罩排数：{placement.masked}</div>
          </div>
        )}
      </section>

      <section className="card">
        <h3>观众详情</h3>
        {selectedInfo ? (
          <div className="person-detail">
            <div className="person-code">{selectedInfo.code}</div>
            <dl>
              <dt>分区 / 排号</dt>
              <dd>
                {selectedInfo.sectionName} · 第 {selectedInfo.row} 排 {selectedInfo.seatInRow} 号
              </dd>
              <dt>观众形象</dt>
              <dd>{selectedInfo.typeName}</dd>
              <dt>服装配色</dt>
              <dd>
                <i className="chip" style={{ background: numberToHex(selectedInfo.bodyColor) }} />
                {numberToHex(selectedInfo.bodyColor).toUpperCase()}
              </dd>
              <dt>荧光棒</dt>
              <dd>
                <i className="chip" style={{ background: numberToHex(selectedInfo.stickColor) }} />
                {numberToHex(selectedInfo.stickColor).toUpperCase()}
              </dd>
              <dt>当前姿态</dt>
              <dd>{selectedInfo.standing ? '站立' : '坐下'}</dd>
              <dt>赞助露出位</dt>
              <dd>{selectedInfo.sponsor ? '是' : '否'}</dd>
            </dl>
            <p className="hint">该观众已在右上角透视预览中高亮</p>
          </div>
        ) : (
          <p className="hint">在俯视模式下点选任意观众查看座位号、服装与姿态</p>
        )}
      </section>

      <section className="card">
        <h3>⑥ 方案锁定交付</h3>
        <p className="hint">锁定整套布置与各区域配色，导出 JSON 供灯光与机位团队预演调用</p>
        <button className={`btn ${locked ? 'unlock' : 'primary'}`} onClick={toggleLock}>
          {locked ? '解锁方案（继续编辑）' : '锁定并导出舞台观众方案'}
        </button>
        {locked && <div className="lock-badge">方案已锁定 · 已交付预演环境</div>}
      </section>
    </aside>
  );
}
