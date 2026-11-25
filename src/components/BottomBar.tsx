import { SONG_SEGMENTS } from '../data/presets';
import type { Stats } from '../types';

interface Props {
  stats: Stats;
  progress: number;
  onProgress: (v: number) => void;
}

function fmt(n: number) {
  return n.toLocaleString('zh-CN');
}

export default function BottomBar({ stats, progress, onProgress }: Props) {
  const seg =
    SONG_SEGMENTS.find((s) => progress >= s.start && progress < s.end) ??
    SONG_SEGMENTS[SONG_SEGMENTS.length - 1];

  return (
    <div className="bottom-bar">
      <div className="stats-strip">
        <Stat label="座位总数" value={fmt(stats.total)} />
        <Stat label="已布置观众" value={fmt(stats.filled)} accent="#7ad7f0" />
        <Stat label="当前选中" value={fmt(stats.selected)} accent="#ffb84d" />
        <Stat label="站立人数" value={fmt(stats.standing)} accent="#ff7a9d" />
        <Stat label="遮罩座位" value={fmt(stats.masked)} accent="#9db8ff" />
        <Stat label="实际渲染" value={fmt(stats.drawnSprites)} accent="#a8e063" />
        <Stat label="帧率" value={`${stats.fps} FPS`} accent={stats.fps >= 50 ? '#a8e063' : '#ffb84d'} />
      </div>

      <div className="segment-block">
        <div className="segment-head">
          <span className="seg-name">
            曲目段落 · <b>{seg.name}</b>
          </span>
          <span className="seg-ratios">
            站立比例 前区 {(seg.stand[0] * 100).toFixed(0)}% · 中区 {(seg.stand[1] * 100).toFixed(0)}% · 后区{' '}
            {(seg.stand[2] * 100).toFixed(0)}%
          </span>
        </div>
        <input
          className="segment-slider"
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={progress}
          onChange={(e) => onProgress(Number(e.target.value))}
        />
        <div className="segment-track-labels">
          {SONG_SEGMENTS.map((s) => (
            <span
              key={s.name}
              className={progress >= s.start && progress < s.end ? 'active' : ''}
              style={{ left: `${s.start}%`, width: `${s.end - s.start}%` }}
            >
              {s.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ color: accent ?? '#e8ecff' }}>
        {value}
      </span>
    </div>
  );
}
