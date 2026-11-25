import { useEffect, useMemo, useRef, useState } from 'react';
import { AudienceEngine } from './pixi/AudienceEngine';
import { generateVenue } from './data/venue';
import { AUDIENCE_TYPES, SONG_SEGMENTS } from './data/presets';
import type { PersonInfo, Stats } from './types';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import BottomBar from './components/BottomBar';
import PerspectivePreview from './components/PerspectivePreview';

const EMPTY_STATS: Stats = {
  total: 0,
  filled: 0,
  selected: 0,
  standing: 0,
  masked: 0,
  fps: 0,
  drawnSprites: 0,
};

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<AudienceEngine | null>(null);
  const venue = useMemo(() => generateVenue(), []);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [person, setPerson] = useState<PersonInfo | null>(null);
  const [locked, setLocked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewTick, setPreviewTick] = useState(0);
  const [toast, setToast] = useState<string>('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const engine = new AudienceEngine(hostRef.current, venue, AUDIENCE_TYPES, SONG_SEGMENTS, {
      onStats: (s) => setStats(s),
      onPick: (info) => {
        setPerson(info);
        setPreviewTick((t) => t + 1);
      },
    });
    engine.attachHost(hostRef.current);
    let disposed = false;
    engine
      .init()
      .then(() => {
        if (disposed) {
          // StrictMode/快速卸载时 init 才完成，立即回收
          engine.destroy();
          return;
        }
        engineRef.current = engine;
        setReady(true);
        setStats({
          total: venue.seats.length,
          filled: 0,
          selected: 0,
          standing: 0,
          masked: 0,
          fps: 60,
          drawnSprites: 0,
        });
        setToast(`座位点阵已生成：${venue.seats.length.toLocaleString()} 个座位，${venue.rowCount} 排 — 点击左侧按钮导入观众`);
        setTimeout(() => setToast(''), 5200);
      })
      .catch((err) => {
        console.error(err);
        setToast('引擎初始化失败：' + String(err));
      });
    return () => {
      disposed = true;
      engine.destroy();
      engineRef.current = null;
    };
  }, [venue]);

  const invalidate = () => {
    const e = engineRef.current;
    if (!e) return;
    setStats((prev) => ({ ...prev, selected: e.getSelectionCount() }));
    setPreviewTick((t) => t + 1);
    if (e.getSelectionCount() === 1) {
      const id = [...(e as unknown as { selectedIds: Set<number> }).selectedIds][0];
      setPerson(e.getPersonInfo(id));
    }
  };

  const handleProgress = (v: number) => {
    setProgress(v);
    engineRef.current?.setSongProgress(v);
    setPreviewTick((t) => t + 1);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span>
          虚拟演出观众席布置工具
        </div>
        <div className="venue-name">{venue.name}</div>
        <div className="topbar-right">
          <span className={`mode-tag ${locked ? 'locked' : ''}`}>
            {locked ? '方案已锁定' : '编辑模式'}
          </span>
          <button className="btn small ghost" onClick={() => engineRef.current?.fitView()}>
            全览看台
          </button>
        </div>
      </header>

      <div className="workspace">
        <LeftPanel
          engineRef={engineRef}
          locked={locked}
          onImported={() => {
            setToast('观众已按排批量入座，每人携带服装配色、荧光棒颜色与站/坐姿态');
            setTimeout(() => setToast(''), 4200);
          }}
          onStatsInvalidate={invalidate}
        />

        <main
          className="stage-host"
          ref={hostRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const idx = Number(e.dataTransfer.getData('text/audience-type'));
            if (Number.isNaN(idx) || !engineRef.current) return;
            const rect = hostRef.current!.getBoundingClientRect();
            engineRef.current.dropType(idx, e.clientX - rect.left, e.clientY - rect.top);
            invalidate();
            setToast(`已将「${AUDIENCE_TYPES[idx].name}」按所在色温区域批量填充`);
            setTimeout(() => setToast(''), 3200);
          }}
        >
          {!ready && <div className="loading-mask">正在初始化 PixiJS 渲染引擎…</div>}
          <PerspectivePreview engineRef={engineRef} venue={venue} tick={previewTick} />
          {toast && <div className="toast">{toast}</div>}
          <div className="view-hint">滚轮缩放 · 拖拽平移 · 框选模式下拉框多选 · 单击查看观众详情</div>
        </main>

        <RightPanel
          engineRef={engineRef}
          selectedInfo={person}
          selectedCount={stats.selected}
          selectedRows={engineRef.current?.getSelectedRows() ?? []}
          locked={locked}
          onLockChange={(v) => {
            setLocked(v);
            setToast(v ? '方案已锁定并导出，灯光与机位团队可在预演中直接调用' : '方案已解锁');
            setTimeout(() => setToast(''), 4200);
          }}
          onStatsInvalidate={invalidate}
          onPreviewTick={() => setPreviewTick((t) => t + 1)}
        />
      </div>

      <BottomBar stats={stats} progress={progress} onProgress={handleProgress} />
    </div>
  );
}
