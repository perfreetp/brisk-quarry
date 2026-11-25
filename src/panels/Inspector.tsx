import type { AudioAsset, Cue, EasingId, Project } from '../types';
import { EASING_OPTIONS, ease } from '../lib/easing';
import { alignDeviation, formatTime, getDeviations, resizeCueEnd, resizeCueStart, rippleLaterCues } from '../lib/projectOps';

interface InspectorProps {
  cue: Cue | null;
  project: Project;
  assets: AudioAsset[];
  ripple: boolean;
  mutate: (recipe: (draft: Project) => void) => void;
  onNotify: (message: string) => void;
}

export function Inspector({ cue, project, assets, ripple, mutate, onNotify }: InspectorProps) {
  if (!cue) {
    return (
      <div className="inspector empty-inspector">
        <h3>检查器</h3>
        <div className="empty-state">
          <div className="empty-icon">◈</div>
          <p>在时间轴或 PixiJS 场景中点选一个提示物。</p>
          <p className="muted">你可以双向拖动音/画边缘、内部同步锚点和视觉关键帧。</p>
        </div>
      </div>
    );
  }

  const selectedCue: Cue = cue;
  const deviations = getDeviations(selectedCue);
  const group = project.groups.find((g) => g.cueIds.includes(selectedCue.id));

  function updateCue(recipe: (cue: Cue) => void, message?: string): void {
    mutate((draft) => {
      const target = draft.cues.find((c) => c.id === selectedCue.id);
      if (target) recipe(target);
    });
    if (message) onNotify(message);
  }

  function updateTimingNumber(field: 'start' | 'end', value: number): void {
    if (Number.isNaN(value)) return;
    const oldEnd = selectedCue.end;
    mutate((draft) => {
      const target = draft.cues.find((c) => c.id === selectedCue.id);
      if (!target) return;
      if (field === 'start') resizeCueStart(target, value);
      else {
        resizeCueEnd(target, value, draft.duration);
        if (ripple) rippleLaterCues(draft, target.id, oldEnd, target.end - oldEnd);
      }
    });
  }

  return (
    <div className="inspector">
      <div className="inspector-head">
        <div>
          <span className="cue-code">{cue.code}</span>
          <h3>{cue.name}</h3>
        </div>
        <label className="switch">
          <input type="checkbox" checked={cue.enabled} onChange={(e) => updateCue((c) => void (c.enabled = e.target.checked))} />
          <span>{cue.enabled ? '启用' : '停用'}</span>
        </label>
      </div>

      <Section title="共享时间点" subtitle="音/画起落点始终双向联动">
        <div className="field-grid">
          <NumberField label="起点 / 亮起" value={cue.start} step={0.01} min={0} onChange={(v) => updateTimingNumber('start', v)} />
          <NumberField label="终点 / 熄灭" value={cue.end} step={0.01} min={0} onChange={(v) => updateTimingNumber('end', v)} />
        </div>
        <div className="linked-note">🔗 拖动音频块或视觉块的左右边缘都会修改这两个共享时间。</div>
        {group && <div className="group-note">当前属于 <b>{group.name}</b>，拖动编组条可整体移动。</div>}
      </Section>

      <Section title="同步偏差" subtitle="起音对亮起，衰减对熄灭">
        <div className="deviation-row ok locked">
          <div className="deviation-main">
            <strong>起音头 ↔ 亮起头（共享边缘）</strong>
            <span>音/画起点均为 {formatTime(selectedCue.start)}</span>
          </div>
          <b className="delta">0.000s</b>
          <div className="align-buttons locked-link"><span>🔗 拖动任一轨道边缘双向联动</span></div>
        </div>
        {deviations.map((d) => (
          <div key={d.key} className={`deviation-row ${d.ok ? 'ok' : 'bad'}`}>
            <div className="deviation-main">
              <strong>{d.label}</strong>
              <span>
                音 {formatTime(d.audioAt)} · 画 {formatTime(d.visualAt)}
              </span>
            </div>
            <b className="delta">{d.delta > 0 ? '+' : ''}{d.delta.toFixed(3)}s</b>
            <div className="align-buttons">
              <button type="button" onClick={() => updateCue((c) => alignDeviation(c, d.key, 'visual-to-audio'), '画面锚点已对齐声音')}>画→音</button>
              <button type="button" onClick={() => updateCue((c) => alignDeviation(c, d.key, 'audio-to-visual'), '声音锚点已对齐画面')}>音→画</button>
            </div>
          </div>
        ))}
      </Section>

      <Section title="音频包络" subtitle="素材来自音频组清单，预览用 WebAudio 合成">
        <label className="field">
          <span>音效/环境素材</span>
          <select value={cue.audio.assetId} onChange={(e) => updateCue((c) => void (c.audio.assetId = e.target.value))}>
            {assets.filter((a) => a.type !== 'ambient').map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.name}</option>
            ))}
          </select>
        </label>
        <SliderField label="起音 Attack" value={cue.audio.attack} min={0.01} max={0.6} step={0.01} unit="s" onChange={(v) => updateCue((c) => void (c.audio.attack = v))} />
        <SliderField label="衰减 Decay" value={cue.audio.decay} min={0.02} max={1.2} step={0.01} unit="s" onChange={(v) => updateCue((c) => void (c.audio.decay = v))} />
        <SliderField label="音量" value={cue.audio.gain} min={0} max={1} step={0.01} onChange={(v) => updateCue((c) => void (c.audio.gain = v))} />
        <SliderField label="声像 Pan" value={cue.audio.pan} min={-1} max={1} step={0.01} onChange={(v) => updateCue((c) => void (c.audio.pan = v))} />
      </Section>

      <Section title="高亮闪烁与缓动" subtitle="切换曲线后，已有关键帧按同一 U 坐标重排">
        <div className="field-grid">
          <SliderField label="亮起时长" value={cue.visual.rise} min={0.01} max={0.8} step={0.01} unit="s" onChange={(v) => updateCue((c) => void (c.visual.rise = v))} />
          <SliderField label="熄灭时长" value={cue.visual.fade} min={0.02} max={1.2} step={0.01} unit="s" onChange={(v) => updateCue((c) => void (c.visual.fade = v))} />
        </div>
        <label className="field">
          <span>缓动曲线</span>
          <select
            value={cue.visual.easing}
            onChange={(e) => {
              const easing = e.target.value as EasingId;
              updateCue((c) => {
                c.visual.easing = easing;
                c.visual.keyframes = c.visual.keyframes.map((k) => ({
                  ...k,
                  time: Number((c.start + ease(easing, k.u) * (c.end - c.start)).toFixed(3)),
                }));
              }, '已按新缓动曲线重排该提示点的关键帧');
            }}
          >
            {EASING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label} — {option.hint}</option>
            ))}
          </select>
        </label>
        <label className="field color-field">
          <span>高亮颜色</span>
          <input type="color" value={cue.visual.color} onChange={(e) => updateCue((c) => void (c.visual.color = e.target.value))} />
        </label>
        <div className="keyframe-table">
          <div className="keyframe-row head"><span>关键帧</span><span>时间</span><span>强度</span></div>
          {cue.visual.keyframes.map((k, index) => (
            <div className="keyframe-row" key={k.id}>
              <span>K{index + 1}</span>
              <b className="mono">{formatTime(k.time)}</b>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={k.intensity}
                onChange={(e) =>
                  updateCue((c) => {
                    const target = c.visual.keyframes.find((item) => item.id === k.id);
                    if (target) target.intensity = Number(e.target.value);
                  })
                }
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="触发条件与无障碍交付" subtitle="随时间轴一起交给音频组和 UI 组">
        <label className="field">
          <span>触发事件</span>
          <textarea rows={2} value={cue.trigger.event} onChange={(e) => updateCue((c) => void (c.trigger.event = e.target.value))} />
        </label>
        <label className="field">
          <span>前置条件</span>
          <textarea rows={3} value={cue.trigger.condition} onChange={(e) => updateCue((c) => void (c.trigger.condition = e.target.value))} />
        </label>
        <label className="field">
          <span>声音信标配置</span>
          <textarea rows={2} value={cue.trigger.beacon} onChange={(e) => updateCue((c) => void (c.trigger.beacon = e.target.value))} />
        </label>
        <label className="field">
          <span>字幕提示</span>
          <textarea rows={2} value={cue.trigger.subtitle} onChange={(e) => updateCue((c) => void (c.trigger.subtitle = e.target.value))} />
        </label>
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="inspector-section">
      <h4>{title}</h4>
      {subtitle && <p className="section-sub">{subtitle}</p>}
      {children}
    </section>
  );
}

function NumberField({ label, value, onChange, step, min }: { label: string; value: number; onChange: (value: number) => void; step?: number; min?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={Number(value.toFixed(2))} step={step} min={min} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function SliderField({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (value: number) => void }) {
  return (
    <label className="field slider-field">
      <span>{label}</span>
      <div>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <b className="mono">{value.toFixed(2)}{unit ?? ''}</b>
      </div>
    </label>
  );
}
