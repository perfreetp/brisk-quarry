import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import manifestData from './data/audio-manifest.json';
import { createInitialProject } from './data/initialProject';
import type { AudioAsset, Cue, ID, LoopRegion, Project, ToolMode } from './types';
import { Transport } from './transport/Transport';
import { AudioEngine } from './audio/AudioEngine';
import { StageCanvas } from './pixi/StageCanvas';
import { Timeline } from './timeline/Timeline';
import { Inspector } from './panels/Inspector';
import { ManifestPanel } from './panels/ManifestPanel';
import { HandoffPanel } from './panels/HandoffPanel';
import { GuidePanel } from './panels/GuidePanel';
import { formatTime, rippleLaterCues } from './lib/projectOps';
import { retimeKeyframesWithEasing } from './lib/easing';

const AUDIO_ASSETS = (manifestData as unknown as { assets: AudioAsset[] }).assets;

type TabId = 'inspect' | 'manifest' | 'handoff' | 'guide';

export default function App() {
  const [project, setProject] = useState<Project>(() => createInitialProject());
  const projectRef = useRef<Project>(project);
  const transport = useMemo(() => new Transport(), []);
  const audioRef = useRef<AudioEngine | null>(null);
  if (!audioRef.current) audioRef.current = new AudioEngine();

  const [selectedIds, setSelectedIds] = useState<ID[]>(['cue-5']);
  const [primaryCueId, setPrimaryCueId] = useState<ID | null>('cue-5');
  const [loop, setLoop] = useState<LoopRegion>({ start: 10.3, end: 13.1, enabled: false });
  const [tool, setTool] = useState<ToolMode>('select');
  const [snap, setSnap] = useState(true);
  const [ripple, setRipple] = useState(true);
  const [pxPerSecond, setPxPerSecond] = useState(38);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ambientEnabled, setAmbientEnabled] = useState(false);
  const [tab, setTab] = useState<TabId>('inspect');
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const firedCuesRef = useRef<Set<ID>>(new Set());
  const lastFrameTimeRef = useRef(0);

  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5200);
  }, []);

  const mutate = useCallback((recipe: (draft: Project) => void) => {
    const draft: Project = structuredClone(projectRef.current);
    recipe(draft);
    projectRef.current = draft;
    setProject(draft);
  }, []);

  const handleSelectionChange = useCallback((ids: ID[], primary: ID | null = null) => {
    setSelectedIds(ids);
    setPrimaryCueId(primary ?? ids[ids.length - 1] ?? null);
  }, []);

  useEffect(() => {
    transport.duration = project.duration;
  }, [transport, project.duration]);

  useEffect(() => {
    transport.setLoop(loop);
  }, [transport, loop]);

  useEffect(() => transport.subscribePlayState((playing) => {
    setIsPlaying(playing);
    if (!playing) audioRef.current?.suspend();
  }), [transport]);

  useEffect(() => transport.subscribeSeek(() => {
    audioRef.current?.stopCueSounds();
    firedCuesRef.current.clear();
    lastFrameTimeRef.current = transport.time;
  }), [transport]);

  useEffect(() => transport.subscribeFrame((time, info) => {
    const audio = audioRef.current;
    if (info.loopWrapped || time + 0.04 < lastFrameTimeRef.current) {
      firedCuesRef.current.clear();
      audio?.stopCueSounds();
    }

    const last = lastFrameTimeRef.current;
    projectRef.current.cues.forEach((cue) => {
      if (!cue.enabled || firedCuesRef.current.has(cue.id)) return;
      const crossedForward = last < cue.start && time >= cue.start;
      const wrappedOnto = info.loopWrapped && cue.start >= loop.start - 0.02 && cue.start <= time + 0.08;
      if (crossedForward || wrappedOnto) {
        firedCuesRef.current.add(cue.id);
        const asset = AUDIO_ASSETS.find((item) => item.id === cue.audio.assetId);
        audio?.playCue(cue, asset);
      }
    });

    // Re-arm a cue after the playhead has clearly left it (supports repeated loops/seeks).
    projectRef.current.cues.forEach((cue) => {
      if (time < cue.start - 0.18) firedCuesRef.current.delete(cue.id);
    });

    lastFrameTimeRef.current = time;
  }), [transport, loop.start]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (transport.playing) {
      transport.pause();
      audio?.suspend();
      return;
    }
    await audio?.resume();
    transport.play();
  }, [transport]);

  const startPlayback = useCallback(() => {
    void audioRef.current?.resume().then(() => {
      if (!transport.playing) transport.play();
    });
  }, [transport]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
      if (event.code === 'Space' && !editable) {
        event.preventDefault();
        void togglePlay();
        return;
      }
      if (event.key.toLowerCase() === 'l' && !editable) {
        event.preventDefault();
        setLoop((current) => ({ ...current, enabled: !current.enabled }));
        return;
      }
      if (tag === 'BUTTON') return;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay]);

  const handleScrubStart = useCallback(() => {
    transport.pause();
    audioRef.current?.stopCueSounds();
    audioRef.current?.suspend();
  }, [transport]);

  async function handlePreviewAsset(asset: AudioAsset): Promise<void> {
    await audioRef.current?.previewAsset(asset);
  }

  async function handleToggleAmbient(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) return;
    if (ambientEnabled) {
      audio.stopAmbient();
      setAmbientEnabled(false);
      return;
    }
    const ambient = AUDIO_ASSETS.find((asset) => asset.id === 'amb-corridor');
    if (ambient) await audio.startAmbient(ambient);
    setAmbientEnabled(true);
  }

  function handleToggleMute(): void {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  }

  function resetProject(): void {
    transport.pause();
    audioRef.current?.stopCueSounds();
    audioRef.current?.suspend();
    const fresh = createInitialProject();
    projectRef.current = fresh;
    setProject(fresh);
    setSelectedIds(['cue-5']);
    setPrimaryCueId('cue-5');
    setLoop({ start: 10.3, end: 13.1, enabled: false });
    transport.seek(0);
    notify('已恢复初始示例工程');
  }

  function runDoorFiveAcceptance(): void {
    const fresh = createInitialProject();
    const cue = fresh.cues.find((item) => item.id === 'cue-5');
    if (!cue) return;

    const originalEnd = cue.end;
    cue.start = 10.5; // 亮起提前 0.50s
    cue.end = 12.7;   // 熄灭延后 0.50s
    cue.audio.attack = 0.1;
    cue.audio.decay = 0.55;
    cue.visual.rise = 0.1;
    cue.visual.fade = 0.55;
    cue.visual.easing = 'easeOutCubic';
    cue.visual.keyframes = retimeKeyframesWithEasing(cue.visual.keyframes, cue.start, cue.end, cue.visual.easing);

    // 右边缘延长 0.5s：后续提示点整体波纹顺移。
    rippleLaterCues(fresh, cue.id, originalEnd, cue.end - originalEnd);

    projectRef.current = fresh;
    setProject(fresh);
    handleSelectionChange(['cue-5'], 'cue-5');
    setLoop({ start: 10.25, end: 13.15, enabled: true });
    setTool('select');
    setRipple(true);
    setTab('inspect');
    transport.duration = fresh.duration;
    transport.setLoop({ start: 10.25, end: 13.15, enabled: true });
    transport.seek(10.25);
    notify('第5门：亮起提前 0.50s、熄灭延后 0.50s；C06–C08 已波纹顺移，开始循环回放');
    startPlayback();
  }

  const primaryCue = project.cues.find((cue) => cue.id === primaryCueId) ?? null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden>◉</div>
          <div>
            <h1>双提示时间轴工作台</h1>
            <p>React 状态与交互 · PixiJS 高亮预览 · WebAudio 音轨预览 · 音画偏差/编组/循环/交付</p>
          </div>
        </div>
        <div className="transport-bar" aria-label="播放控制">
          <button type="button" className="ghost-btn" onClick={resetProject}>重置示例</button>
          <button type="button" className="transport-btn" onClick={() => { transport.pause(); transport.seek(0); audioRef.current?.stopCueSounds(); }} title="回到开头">⏮</button>
          <button type="button" className="transport-btn play" onClick={() => void togglePlay()}>{isPlaying ? '❚❚' : '▶'}</button>
          <TimeReadout transport={transport} />
          <button type="button" className={`secondary-btn ${loop.enabled ? 'active' : ''}`} onClick={() => setLoop((l) => ({ ...l, enabled: !l.enabled }))} title="快捷键 L">
            ↻ 循环 {loop.enabled ? '开' : '关'}
          </button>
          <button type="button" className="ghost-btn" onClick={handleToggleMute}>{muted ? '🔇 已静音' : '🔊 声音开'}</button>
        </div>
      </header>

      <main className="workspace">
        <div className="center-column">
          <section className="preview-card">
            <div className="panel-head preview-head">
              <div>
                <h2>PixiJS 场景预览</h2>
                <p>播放头走到提示点时，目标门/终端/舱门会按关键帧强度闪烁；点击场景目标可选中提示点。</p>
              </div>
              <button type="button" className="primary-btn acceptance-btn" onClick={runDoorFiveAcceptance}>
                听障验收：修复第5门
              </button>
            </div>
            <div className="stage-wrap">
              <StageCanvas project={project} transport={transport} selectedCueId={primaryCueId} onSelectCue={(cueId) => handleSelectionChange([cueId], cueId)} />
              <PreviewOverlay project={project} transport={transport} />
              <div className="stage-badge">PixiJS Canvas · 60fps</div>
            </div>
            <div className="preview-legend">
              <span><i className="dot audio" /> 音频起音/衰减</span>
              <span><i className="dot visual" /> 视觉亮起/熄灭</span>
              <span><i className="dot sync-bad" /> 同步偏差 &gt; 35ms</span>
              <span className="muted">空格播放/暂停 · L 切换循环</span>
            </div>
          </section>

          <Timeline
            project={project}
            transport={transport}
            selectedIds={selectedIds}
            primaryCueId={primaryCueId}
            onSelectionChange={handleSelectionChange}
            loop={loop}
            onLoopChange={setLoop}
            tool={tool}
            onToolChange={setTool}
            snap={snap}
            onSnapChange={setSnap}
            ripple={ripple}
            onRippleChange={setRipple}
            pxPerSecond={pxPerSecond}
            onPxPerSecondChange={setPxPerSecond}
            mutate={mutate}
            onScrubStart={handleScrubStart}
            onRequestPlay={startPlayback}
            onNotify={notify}
          />
        </div>

        <aside className="side-panel">
          <nav className="side-tabs" aria-label="右侧面板">
            <button type="button" className={tab === 'inspect' ? 'active' : ''} onClick={() => setTab('inspect')}>检查器</button>
            <button type="button" className={tab === 'manifest' ? 'active' : ''} onClick={() => setTab('manifest')}>音频清单</button>
            <button type="button" className={tab === 'handoff' ? 'active' : ''} onClick={() => setTab('handoff')}>交付</button>
            <button type="button" className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}>步骤</button>
          </nav>
          <div className="tab-body">
            {tab === 'inspect' && (
              <Inspector cue={primaryCue} project={project} assets={AUDIO_ASSETS} ripple={ripple} mutate={mutate} onNotify={notify} />
            )}
            {tab === 'manifest' && (
              <ManifestPanel assets={AUDIO_ASSETS} ambientEnabled={ambientEnabled} onToggleAmbient={() => void handleToggleAmbient()} onPreview={(asset) => void handlePreviewAsset(asset)} />
            )}
            {tab === 'handoff' && <HandoffPanel project={project} assets={AUDIO_ASSETS} loop={loop} onNotify={notify} />}
            {tab === 'guide' && <GuidePanel onRunAcceptance={runDoorFiveAcceptance} />}
          </div>
        </aside>
      </main>

      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function TimeReadout({ transport }: { transport: Transport }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const update = (time: number) => {
      if (ref.current) ref.current.textContent = `${formatTime(time)} / ${formatTime(transport.duration)}`;
    };
    update(transport.time);
    const offFrame = transport.subscribeFrame(update);
    const offSeek = transport.subscribeSeek(update);
    return () => { offFrame(); offSeek(); };
  }, [transport]);
  return <span ref={ref} className="time-readout mono">00:00.00 / 00:24.00</span>;
}

function PreviewOverlay({ project, transport }: { project: Project; transport: Transport }) {
  const projectRef = useRef(project);
  projectRef.current = project;
  const [activeCues, setActiveCues] = useState<Cue[]>([]);

  useEffect(() => {
    const update = (time: number) => {
      const next = projectRef.current.cues.filter((cue) => cue.enabled && time >= cue.start - 0.08 && time <= cue.end + 0.08);
      setActiveCues((previous) => {
        const previousIds = previous.map((cue) => cue.id).join('|');
        const nextIds = next.map((cue) => cue.id).join('|');
        return previousIds === nextIds ? previous : next;
      });
    };
    update(transport.time);
    const offFrame = transport.subscribeFrame(update);
    const offSeek = transport.subscribeSeek(update);
    return () => { offFrame(); offSeek(); };
  }, [transport]);

  return (
    <div className="subtitle-stack" aria-live="polite">
      {activeCues.map((cue) => (
        <div key={cue.id} className="subtitle-cue" style={{ borderColor: cue.visual.color }}>
          <span className="subtitle-code" style={{ background: cue.visual.color, color: '#111827' }}>{cue.code}</span>
          <span>{cue.trigger.subtitle}</span>
        </div>
      ))}
    </div>
  );
}
