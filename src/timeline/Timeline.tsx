import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { Cue, ID, LoopRegion, Project, ToolMode } from '../types';
import {
  alignDeviation,
  createGroupFromIds,
  formatTime,
  getDeviations,
  getGroupBounds,
  MIN_CUE_DURATION,
  moveGroup,
  moveKeyframe,
  moveCueTo,
  resizeCueEnd,
  resizeCueStart,
  snapTime,
} from '../lib/projectOps';
import { curvePath } from '../lib/easing';
import type { Transport } from '../transport/Transport';

const LABEL_W = 196;
const GROUP_H = 62;
const AUDIO_H = 98;
const VISUAL_H = 112;
const TOTAL_LANE_H = GROUP_H + AUDIO_H + VISUAL_H;

type DragState =
  | {
      kind: 'cue';
      cueId: ID;
      startClientX: number;
      origStart: number;
      snap: boolean;
    }
  | {
      kind: 'edge';
      cueId: ID;
      edge: 'start' | 'end';
      startClientX: number;
      origStart: number;
      origEnd: number;
      snap: boolean;
      ripple: boolean;
      later: Array<{
        id: ID;
        start: number;
        end: number;
        keys: Array<{ id: ID; time: number }>;
      }>;
    }
  | { kind: 'key'; cueId: ID; keyId: ID; origTime: number; startClientX: number; snap: boolean }
  | {
      kind: 'anchor';
      cueId: ID;
      anchor: 'attack' | 'decay' | 'rise' | 'fade';
      origTime: number;
      startClientX: number;
      snap: boolean;
    }
  | { kind: 'group'; groupId: ID; origMin: number; startClientX: number; snap: boolean }
  | {
      kind: 'loop';
      edge: 'start' | 'end' | 'move';
      startClientX: number;
      orig: LoopRegion;
      snap: boolean;
    }
  | { kind: 'rubber'; rectLeft: number; x0: number }
  | { kind: 'scrub'; rectLeft: number };

interface RubberRect {
  x0: number;
  x1: number;
}

export interface TimelineProps {
  project: Project;
  transport: Transport;
  selectedIds: ID[];
  primaryCueId: ID | null;
  onSelectionChange: (ids: ID[], primary?: ID | null) => void;
  loop: LoopRegion;
  onLoopChange: (loop: LoopRegion) => void;
  tool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  snap: boolean;
  onSnapChange: (value: boolean) => void;
  ripple: boolean;
  onRippleChange: (value: boolean) => void;
  pxPerSecond: number;
  onPxPerSecondChange: (value: number) => void;
  mutate: (recipe: (draft: Project) => void) => void;
  onScrubStart: () => void;
  onRequestPlay: () => void;
  onNotify: (message: string) => void;
}

export function Timeline(props: TimelineProps) {
  const {
    project,
    transport,
    selectedIds,
    primaryCueId,
    onSelectionChange,
    loop,
    onLoopChange,
    tool,
    onToolChange,
    snap,
    onSnapChange,
    ripple,
    onRippleChange,
    pxPerSecond: pps,
    onPxPerSecondChange,
    mutate,
    onScrubStart,
    onRequestPlay,
    onNotify,
  } = props;

  const timeWidth = project.duration * pps + 56;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timeColRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [rubber, setRubber] = useState<RubberRect | null>(null);

  const cueById = (id: ID): Cue | undefined => project.cues.find((cue) => cue.id === id);

  function beginDrag(event: ReactPointerEvent<HTMLElement>, drag: DragState): void {
    event.stopPropagation();
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is progressive enhancement */
    }
    dragRef.current = drag;
  }

  function handleRootPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    const gridSnap = 'snap' in drag ? drag.snap : snap;
    const disableSnap = event.altKey || !gridSnap;

    if (drag.kind === 'rubber') {
      const x1 = Math.max(0, Math.min(project.duration, (event.clientX - drag.rectLeft) / pps));
      setRubber({ x0: drag.x0, x1 });
      return;
    }

    if (drag.kind === 'scrub') {
      const t = Math.max(0, Math.min(project.duration, (event.clientX - drag.rectLeft) / pps));
      transport.seek(t);
      return;
    }

    if (drag.kind === 'loop') {
      const delta = (event.clientX - drag.startClientX) / pps;
      const raw = drag.orig;
      if (drag.edge === 'start') {
        const start = snapTime(raw.start + delta, !disableSnap);
        onLoopChange({ ...raw, enabled: true, start: Math.max(0, Math.min(start, raw.end - 0.2)) });
      } else if (drag.edge === 'end') {
        const end = snapTime(raw.end + delta, !disableSnap);
        onLoopChange({ ...raw, enabled: true, end: Math.min(project.duration, Math.max(end, raw.start + 0.2)) });
      } else {
        const length = raw.end - raw.start;
        const start = snapTime(raw.start + delta, !disableSnap);
        const safeStart = Math.max(0, Math.min(start, project.duration - length));
        onLoopChange({ ...raw, enabled: true, start: safeStart, end: safeStart + length });
      }
      return;
    }

    const deltaPx = event.clientX - drag.startClientX;
    const delta = deltaPx / pps;

    mutate((draft) => {
      const cue = draft.cues.find((item) => item.id === ('cueId' in drag ? drag.cueId : ''));

      if (drag.kind === 'cue' && cue) {
        moveCueTo(cue, snapTime(drag.origStart + delta, !disableSnap));
        return;
      }

      if (drag.kind === 'edge' && cue) {
        if (drag.edge === 'start') {
          resizeCueStart(cue, snapTime(drag.origStart + delta, !disableSnap));
        } else {
          const newEnd = snapTime(drag.origEnd + delta, !disableSnap);
          resizeCueEnd(cue, newEnd, draft.duration);
          const appliedDelta = cue.end - drag.origEnd;
          if (drag.ripple) {
            drag.later.forEach((snapshot) => {
              const later = draft.cues.find((item) => item.id === snapshot.id);
              if (!later) return;
              later.start = Number((snapshot.start + appliedDelta).toFixed(3));
              later.end = Number((snapshot.end + appliedDelta).toFixed(3));
              snapshot.keys.forEach((keySnapshot) => {
                const key = later.visual.keyframes.find((k) => k.id === keySnapshot.id);
                if (key) key.time = Number((keySnapshot.time + appliedDelta).toFixed(3));
              });
            });
          }
        }
        return;
      }

      if (drag.kind === 'key' && cue) {
        moveKeyframe(cue, drag.keyId, snapTime(drag.origTime + delta, !disableSnap));
        return;
      }

      if (drag.kind === 'anchor' && cue) {
        const time = snapTime(drag.origTime + delta, !disableSnap);
        const span = cue.end - cue.start;
        if (drag.anchor === 'attack') {
          cue.audio.attack = Number(Math.min(Math.max(time - cue.start, 0.02), span - 0.08).toFixed(3));
        } else if (drag.anchor === 'decay') {
          cue.audio.decay = Number(Math.min(Math.max(cue.end - time, 0.02), span - 0.08).toFixed(3));
        } else if (drag.anchor === 'rise') {
          cue.visual.rise = Number(Math.min(Math.max(time - cue.start, 0.02), span - 0.08).toFixed(3));
        } else {
          cue.visual.fade = Number(Math.min(Math.max(cue.end - time, 0.02), span - 0.08).toFixed(3));
        }
        return;
      }

      if (drag.kind === 'group') {
        moveGroup(draft, drag.groupId, snapTime(drag.origMin + delta, !disableSnap));
      }
    });
  }

  function handleRootPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    // Commit the terminal pointer position as well; very fast flicks may not
    // have painted/processed the last pointermove before pointerup.
    handleRootPointerMove(event);
    const drag = dragRef.current;
    if (drag?.kind === 'rubber') {
      const x1 = Math.max(0, Math.min(project.duration, (event.clientX - drag.rectLeft) / pps));
      const start = Math.min(drag.x0, x1);
      const end = Math.max(drag.x0, x1);
      if (end - start >= 0.18) {
        const region = { start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), enabled: true };
        onLoopChange(region);
        transport.setLoop(region);
        transport.seek(region.start);
        onNotify(`已框选循环段 ${formatTime(region.start)} → ${formatTime(region.end)}，开始循环回放`);
        onRequestPlay();
      }
      setRubber(null);
    }
    if (drag?.kind === 'edge' && drag.ripple && drag.edge === 'end') {
      onNotify('边缘已实时提交；波纹顺移的后续提示点在松手时不会二次跳动');
    }
    dragRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* noop */
    }
  }

  function startCueDrag(event: ReactPointerEvent<HTMLElement>, cue: Cue): void {
    if (event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      const exists = selectedIds.includes(cue.id);
      const next = exists ? selectedIds.filter((id) => id !== cue.id) : [...selectedIds, cue.id];
      onSelectionChange(next, cue.id);
    } else if (!selectedIds.includes(cue.id)) {
      onSelectionChange([cue.id], cue.id);
    }
    beginDrag(event, {
      kind: 'cue',
      cueId: cue.id,
      startClientX: event.clientX,
      origStart: cue.start,
      snap,
    });
  }

  function startEdgeDrag(event: ReactPointerEvent<HTMLElement>, cue: Cue, edge: 'start' | 'end'): void {
    onSelectionChange([cue.id], cue.id);
    const pivot = edge === 'start' ? cue.start : cue.end;
    const later =
      edge === 'end' && ripple
        ? project.cues
            .filter((other) => other.id !== cue.id && other.start >= pivot - 0.04)
            .map((other) => ({
              id: other.id,
              start: other.start,
              end: other.end,
              keys: other.visual.keyframes.map((k) => ({ id: k.id, time: k.time })),
            }))
        : [];
    beginDrag(event, {
      kind: 'edge',
      cueId: cue.id,
      edge,
      startClientX: event.clientX,
      origStart: cue.start,
      origEnd: cue.end,
      snap,
      ripple,
      later,
    });
  }

  function startGroupDrag(event: ReactPointerEvent<HTMLElement>, groupId: ID): void {
    const group = project.groups.find((g) => g.id === groupId);
    const bounds = group ? getGroupBounds(project, group) : null;
    if (!group || !bounds) return;
    onSelectionChange(group.cueIds, group.cueIds[0] ?? null);
    beginDrag(event, { kind: 'group', groupId, origMin: bounds.start, startClientX: event.clientX, snap });
  }

  function handleRulerPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    onScrubStart();
    const rect = event.currentTarget.getBoundingClientRect();
    beginDrag(event, { kind: 'scrub', rectLeft: rect.left });
    const t = Math.max(0, Math.min(project.duration, (event.clientX - rect.left) / pps));
    transport.seek(t);
  }

  function handleBackgroundPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (tool !== 'range' || !timeColRef.current) {
      onSelectionChange([], null);
      return;
    }
    const rect = timeColRef.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(project.duration, (event.clientX - rect.left) / pps));
    beginDrag(event, { kind: 'rubber', rectLeft: rect.left, x0: t });
    setRubber({ x0: t, x1: t });
  }

  function handleCreateGroup(): void {
    if (selectedIds.length < 2) {
      onNotify('请先按住 Ctrl/Shift 点选至少两个提示点，再编组');
      return;
    }
    let groupId: ID | null = null;
    mutate((draft) => {
      const group = createGroupFromIds(draft, selectedIds);
      groupId = group?.id ?? null;
    });
    if (groupId) onNotify(`已创建编组，拖动编组条会整体移动 ${selectedIds.length} 个提示点`);
  }

  function handleUngroupPrimary(): void {
    const group = project.groups.find((g) => g.cueIds.includes(primaryCueId ?? ''));
    if (!group) {
      onNotify('当前提示点不在编组中');
      return;
    }
    mutate((draft) => {
      draft.groups = draft.groups.filter((g) => g.id !== group.id);
    });
    onNotify(`已解散 ${group.name}`);
  }

  const ticks = Array.from({ length: Math.floor(project.duration) + 1 }, (_, i) => i);
  const totalLaneHeight = GROUP_H + AUDIO_H + VISUAL_H;

  return (
    <div className="timeline-card">
      <div className="timeline-toolbar">
        <div className="tool-group" role="group" aria-label="时间轴工具">
          <button className={tool === 'select' ? 'tool-btn active' : 'tool-btn'} onClick={() => onToolChange('select')} type="button">
            ↖ 选择移动
          </button>
          <button className={tool === 'range' ? 'tool-btn active range-active' : 'tool-btn'} onClick={() => onToolChange('range')} type="button">
            ▭ 框选循环
          </button>
        </div>
        <label className="check-pill">
          <input type="checkbox" checked={snap} onChange={(e) => onSnapChange(e.target.checked)} />
          0.05s 吸附
        </label>
        <label className="check-pill" title="拖动片段右边缘时，后面的提示点和关键帧一起顺移">
          <input type="checkbox" checked={ripple} onChange={(e) => onRippleChange(e.target.checked)} />
          波纹顺移
        </label>
        <div className="zoom-control">
          <span>缩放</span>
          <input
            type="range"
            min={22}
            max={72}
            step={1}
            value={pps}
            onChange={(e) => onPxPerSecondChange(Number(e.target.value))}
            aria-label="时间轴缩放"
          />
          <span className="mono">{pps}px/s</span>
        </div>
        <div className="toolbar-spacer" />
        <button type="button" className="secondary-btn" onClick={handleCreateGroup}>
          ⧉ 编组所选
        </button>
        <button type="button" className="ghost-btn" onClick={handleUngroupPrimary}>
          解散当前组
        </button>
      </div>

      <div className="timeline-scroll" ref={rootRef} onPointerMove={handleRootPointerMove} onPointerUp={handleRootPointerUp} onPointerCancel={handleRootPointerUp}>
        <div className="timeline-grid" style={{ gridTemplateColumns: `${LABEL_W}px ${timeWidth}px` }}>
          <div className="timeline-corner sticky-left">
            <span>轨道 / 时间</span>
            <small>音画共享同一时间坐标</small>
          </div>

          <div className="ruler" onPointerDown={handleRulerPointerDown}>
            {ticks.map((t) => (
              <div key={t} className={t % 2 === 0 ? 'tick major' : 'tick'} style={{ left: t * pps }}>
                <span>{formatTime(t).slice(3)}</span>
              </div>
            ))}
          </div>

          <div className="track-labels sticky-left">
            <div className="track-label group-label" style={{ height: GROUP_H }}>
              <strong>编组轨道</strong>
              <span>整体拖动嵌套提示点</span>
            </div>
            <div className="track-label audio-label" style={{ height: AUDIO_H }}>
              <strong>♪ 音频轨道</strong>
              <span>起音 / 衰减包络</span>
            </div>
            <div className="track-label visual-label" style={{ height: VISUAL_H }}>
              <strong>✦ 视觉轨道</strong>
              <span>亮起 / 熄灭 / 关键帧</span>
            </div>
          </div>

          <div
            ref={timeColRef}
            className={`time-column ${tool === 'range' ? 'range-cursor' : ''}`}
            style={{ width: timeWidth, height: TOTAL_LANE_H }}
            onPointerDown={handleBackgroundPointerDown}
          >
            <div className="grid-lines" aria-hidden>
              {ticks.map((t) => (
                <div key={t} className={t % 2 === 0 ? 'grid-line major' : 'grid-line'} style={{ left: t * pps }} />
              ))}
            </div>

            {loop.enabled && loop.start < loop.end && (
              <div
                className={`loop-region ${loop.enabled ? 'enabled' : ''}`}
                style={{ left: loop.start * pps, width: (loop.end - loop.start) * pps }}
                onPointerDown={(e) =>
                  beginDrag(e, { kind: 'loop', edge: 'move', startClientX: e.clientX, orig: loop, snap })
                }
              >
                <span className="loop-label">循环 {formatTime(loop.start)}–{formatTime(loop.end)}</span>
                <span
                  className="loop-handle left"
                  onPointerDown={(e) => beginDrag(e, { kind: 'loop', edge: 'start', startClientX: e.clientX, orig: loop, snap })}
                />
                <span
                  className="loop-handle right"
                  onPointerDown={(e) => beginDrag(e, { kind: 'loop', edge: 'end', startClientX: e.clientX, orig: loop, snap })}
                />
              </div>
            )}

            {rubber && (
              <div
                className="rubber-band"
                style={{
                  left: Math.min(rubber.x0, rubber.x1) * pps,
                  width: Math.abs(rubber.x1 - rubber.x0) * pps,
                }}
              >
                松开形成循环段
              </div>
            )}

            <div className="lane group-lane" style={{ height: GROUP_H }}>
              {project.groups.map((group) => {
                const bounds = getGroupBounds(project, group);
                if (!bounds) return null;
                const active = group.cueIds.some((id) => selectedIds.includes(id));
                return (
                  <div
                    key={group.id}
                    className={`group-clip ${active ? 'selected' : ''}`}
                    style={{
                      left: bounds.start * pps,
                      width: Math.max(42, (bounds.end - bounds.start) * pps),
                      borderColor: group.color,
                      background: `linear-gradient(180deg, ${group.color}33, ${group.color}14)`,
                    }}
                    onPointerDown={(e) => startGroupDrag(e, group.id)}
                    title={`${group.name}：拖动整体移动 ${group.cueIds.length} 个提示点`}
                  >
                    <span className="group-grip">⠿</span>
                    <strong>{group.name}</strong>
                    <em>{group.cueIds.length} points</em>
                  </div>
                );
              })}
            </div>

            <div className="lane audio-lane" style={{ height: AUDIO_H }}>
              {project.cues.map((cue) => {
                const width = (cue.end - cue.start) * pps;
                const selected = selectedIds.includes(cue.id);
                return (
                  <div
                    key={cue.id}
                    data-drag="cue"
                    className={`clip audio-clip ${selected ? 'selected' : ''} ${cue.enabled ? '' : 'disabled'}`}
                    style={{ left: cue.start * pps, width: Math.max(MIN_CUE_DURATION * pps, width), '--cue': cue.visual.color } as CSSProperties}
                    onPointerDown={(e) => startCueDrag(e, cue)}
                  >
                    <div className="clip-title">
                      <b>{cue.code}</b>
                      <span>{cue.name}</span>
                    </div>
                    <Waveform seed={cue.id} />
                    <Envelope cue={cue} width={Math.max(MIN_CUE_DURATION * pps, width)} height={AUDIO_H} />
                    <Handle side="left" onDown={(e) => startEdgeDrag(e, cue, 'start')} />
                    <Handle side="right" onDown={(e) => startEdgeDrag(e, cue, 'end')} />
                    <Marker
                      className="marker attack-marker"
                      style={{ left: cue.audio.attack * pps }}
                      label="起"
                      title="起音峰；拖动可制造同步偏差"
                      onDown={(e) =>
                        beginDrag(e, {
                          kind: 'anchor',
                          cueId: cue.id,
                          anchor: 'attack',
                          origTime: cue.start + cue.audio.attack,
                          startClientX: e.clientX,
                          snap,
                        })
                      }
                    />
                    <Marker
                      className="marker decay-marker"
                      style={{ left: width - cue.audio.decay * pps }}
                      label="衰"
                      title="衰减起点；拖动后与熄灭起点对比"
                      onDown={(e) =>
                        beginDrag(e, {
                          kind: 'anchor',
                          cueId: cue.id,
                          anchor: 'decay',
                          origTime: cue.end - cue.audio.decay,
                          startClientX: e.clientX,
                          snap,
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>

            <div className="lane visual-lane" style={{ height: VISUAL_H }}>
              {project.cues.map((cue) => {
                const width = (cue.end - cue.start) * pps;
                const selected = selectedIds.includes(cue.id);
                return (
                  <div
                    key={cue.id}
                    data-drag="cue"
                    className={`clip visual-clip ${selected ? 'selected' : ''} ${cue.enabled ? '' : 'disabled'}`}
                    style={{ left: cue.start * pps, width: Math.max(MIN_CUE_DURATION * pps, width), '--cue': cue.visual.color } as CSSProperties}
                    onPointerDown={(e) => startCueDrag(e, cue)}
                  >
                    <div className="visual-wash" />
                    <svg className="keyline-svg" width={width} height={VISUAL_H - 8} aria-hidden>
                      <polyline points={keyPolyline(cue, width, VISUAL_H - 14)} fill="none" stroke={cue.visual.color} strokeWidth={2} opacity={0.8} />
                    </svg>
                    {cue.visual.keyframes.map((key) => (
                      <button
                        key={key.id}
                        type="button"
                        className="keyframe-diamond"
                        style={{
                          left: (key.time - cue.start) * pps - 6,
                          bottom: 12 + key.intensity * 48,
                          background: cue.visual.color,
                        }}
                        title={`关键帧 ${formatTime(key.time)} · 强度 ${key.intensity.toFixed(2)}；拖动后切换缓动可重排`}
                        onPointerDown={(e) =>
                          beginDrag(e, {
                            kind: 'key',
                            cueId: cue.id,
                            keyId: key.id,
                            origTime: key.time,
                            startClientX: e.clientX,
                            snap,
                          })
                        }
                      />
                    ))}
                    <Handle side="left" onDown={(e) => startEdgeDrag(e, cue, 'start')} />
                    <Handle side="right" onDown={(e) => startEdgeDrag(e, cue, 'end')} />
                    <Marker
                      className="marker rise-marker"
                      style={{ left: cue.visual.rise * pps }}
                      label="亮"
                      title="全亮位置（亮起段结束）"
                      onDown={(e) =>
                        beginDrag(e, {
                          kind: 'anchor',
                          cueId: cue.id,
                          anchor: 'rise',
                          origTime: cue.start + cue.visual.rise,
                          startClientX: e.clientX,
                          snap,
                        })
                      }
                    />
                    <Marker
                      className="marker off-marker"
                      style={{ left: width - cue.visual.fade * pps }}
                      label="灭"
                      title="熄灭起点"
                      onDown={(e) =>
                        beginDrag(e, {
                          kind: 'anchor',
                          cueId: cue.id,
                          anchor: 'fade',
                          origTime: cue.end - cue.visual.fade,
                          startClientX: e.clientX,
                          snap,
                        })
                      }
                    />
                    <svg className="curve-mini" viewBox="0 0 120 72" aria-hidden>
                      <path d={curvePath(cue.visual.easing)} fill="none" stroke="currentColor" strokeWidth={5} opacity={0.22} />
                      <path d={curvePath(cue.visual.easing)} fill="none" stroke="currentColor" strokeWidth={2.5} />
                    </svg>
                  </div>
                );
              })}
            </div>

            <SyncLayer project={project} pps={pps} primaryCueId={primaryCueId} mutate={mutate} />
          </div>

          <Playhead transport={transport} pps={pps} />
        </div>
      </div>
      <p className="timeline-hint">
        拖动片段主体会同时移动音画两条块；拖动左右边缘会同时改变起落点。按住 <kbd>Ctrl/Shift</kbd> 多选，
        <kbd>Alt</kbd> 临时关闭吸附。切到“框选循环”后在空白轨道上拖出区间。
      </p>
    </div>
  );
}

function Playhead({ transport, pps }: { transport: Transport; pps: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const update = (time: number) => {
      if (ref.current) ref.current.style.transform = `translateX(${time * pps}px)`;
    };
    update(transport.time);
    const offFrame = transport.subscribeFrame(update);
    const offSeek = transport.subscribeSeek(update);
    return () => {
      offFrame();
      offSeek();
    };
  }, [transport, pps]);

  return (
    <div ref={ref} className="playhead" style={{ left: LABEL_W }}>
      <div className="playhead-tab" />
      <div className="playhead-line" />
    </div>
  );
}

function Handle({ side, onDown }: { side: 'left' | 'right'; onDown: (event: ReactPointerEvent<HTMLSpanElement>) => void }) {
  return <span className={`clip-handle ${side}`} onPointerDown={onDown} aria-hidden />;
}

function Marker({
  className,
  style,
  label,
  title,
  onDown,
}: {
  className: string;
  style: CSSProperties;
  label: string;
  title: string;
  onDown: (event: ReactPointerEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span className={`sync-marker ${className}`} style={style} title={title} onPointerDown={onDown}>
      <i>{label}</i>
    </span>
  );
}

function Waveform({ seed }: { seed: string }) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const bars = Array.from({ length: 42 }, (_, i) => {
    const value = 0.25 + ((Math.sin(hash * 0.013 + i * 1.7) + 1) / 2) * 0.75;
    return value;
  });
  return (
    <div className="waveform" aria-hidden>
      {bars.map((value, i) => (
        <span key={i} style={{ height: `${18 + value * 62}%`, opacity: 0.28 + value * 0.45 }} />
      ))}
    </div>
  );
}

function Envelope({ cue, width, height }: { cue: Cue; width: number; height: number }) {
  const attackX = cue.audio.attack * width / Math.max(0.1, cue.end - cue.start);
  const decayX = width - (cue.audio.decay * width) / Math.max(0.1, cue.end - cue.start);
  const top = 18;
  const bottom = height - 15;
  const d = `M 0 ${bottom} L ${attackX} ${top + 8} L ${Math.max(attackX + 8, decayX - 10)} ${top + 13} L ${decayX} ${top + 18} L ${width} ${bottom} L 0 ${bottom} Z`;
  return <svg className="envelope-svg" width={width} height={height} aria-hidden><path d={d} fill="currentColor" opacity={0.16} /><path d={`M0 ${bottom} L${attackX} ${top + 8} L${decayX} ${top + 18} L${width} ${bottom}`} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.7} /></svg>;
}

function keyPolyline(cue: Cue, width: number, height: number): string {
  const duration = Math.max(0.1, cue.end - cue.start);
  return cue.visual.keyframes
    .map((key) => {
      const x = ((key.time - cue.start) / duration) * width;
      const y = height - 12 - key.intensity * (height - 28);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function SyncLayer({
  project,
  pps,
  primaryCueId,
  mutate,
}: {
  project: Project;
  pps: number;
  primaryCueId: ID | null;
  mutate: TimelineProps['mutate'];
}) {
  return (
    <div className="sync-layer" aria-hidden={false}>
      {project.cues.flatMap((cue) => {
        const deviations = getDeviations(cue);
        return deviations
          .filter((d) => !d.ok && (cue.id === primaryCueId || d.key === 'decay'))
          .map((d) => {
            const xa = d.audioAt * pps;
            const xv = d.visualAt * pps;
            const yAudio = GROUP_H + AUDIO_H - 2;
            const yVisual = GROUP_H + AUDIO_H + 2;
            const xMid = (xa + xv) / 2;
            const detailed = cue.id === primaryCueId;
            return (
              <div key={`${cue.id}-${d.key}`}>
                <svg className="deviation-lines" width={project.duration * pps + 56} height={TOTAL_LANE_H}>
                  <line x1={xa} y1={GROUP_H + 14} x2={xa} y2={yAudio} stroke="#f87171" strokeWidth={1.5} strokeDasharray="4 3" />
                  <line x1={xv} y1={yVisual} x2={xv} y2={GROUP_H + AUDIO_H + 18} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 3" />
                  <line x1={xa} y1={yAudio} x2={xv} y2={yVisual} stroke="#ef4444" strokeWidth={2.5} />
                  {detailed && d.key === 'peak' && (
                    <text x={xMid} y={GROUP_H + 20} fill="#fca5a5" fontSize={11} textAnchor="middle">
                      peak Δ{d.delta > 0 ? '+' : ''}{d.delta.toFixed(2)}
                    </text>
                  )}
                </svg>
                <button
                  type="button"
                  className={`deviation-badge ${Math.abs(d.delta) > 0.15 ? 'severe' : ''}`}
                  style={{ left: xMid - 42, top: GROUP_H + AUDIO_H - 13 }}
                  title={`${d.label}：音 ${formatTime(d.audioAt)} / 画 ${formatTime(d.visualAt)}。点击让画面对齐声音`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    mutate((draft) => {
                      const target = draft.cues.find((c) => c.id === cue.id);
                      if (target) alignDeviation(target, d.key, 'visual-to-audio');
                    });
                  }}
                >
                  Δ{d.delta > 0 ? '+' : ''}{d.delta.toFixed(2)}s · 对齐
                </button>
              </div>
            );
          });
      })}
    </div>
  );
}
