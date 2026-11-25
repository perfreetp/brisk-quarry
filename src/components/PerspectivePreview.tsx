import { useEffect, useRef } from 'react';
import type { AudienceEngine } from '../pixi/AudienceEngine';
import type { VenuePlan } from '../types';
import { numberToHex } from '../utils/color';

interface Props {
  engineRef: React.MutableRefObject<AudienceEngine | null>;
  venue: VenuePlan;
  /** 刷新信号：统计或选中变化时 +1 */
  tick: number;
}

const W = 300;
const H = 190;

/**
 * 伪透视预览：把弧形俯视图投影成带灭点的侧前方看台视角。
 * 独立 2D canvas，节流绘制，选中的人画成高亮白圈。
 */
export default function PerspectivePreview({ engineRef, venue, tick }: Props) {
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const engine = engineRef.current;
    const cv = cvRef.current;
    if (!engine || !cv) return;
    const ctx = cv.getContext('2d')!;
    const data = engine.getPreviewData();
    const { seats, state, selectedIds } = data;

    ctx.clearRect(0, 0, W, H);

    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1b2033');
    bg.addColorStop(1, '#0d0f16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 舞台（远端梯形）
    ctx.beginPath();
    ctx.moveTo(W * 0.2, H * 0.12);
    ctx.lineTo(W * 0.8, H * 0.12);
    ctx.lineTo(W * 0.86, H * 0.2);
    ctx.lineTo(W * 0.14, H * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#2b3350';
    ctx.strokeStyle = '#6f86c9';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#aeb9dc';
    ctx.font = '600 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STAGE', W / 2, H * 0.175);

    // 投影参数：排号 -> 屏幕 y（越后排越靠下越宽）
    const rowY = (r: number) => H * 0.22 + (r / venue.rowCount) * H * 0.74;
    const rowHalfW = (r: number) => W * 0.16 + (r / venue.rowCount) * W * 0.36;

    // 色温区域底色带
    for (const z of venue.zones) {
      const y0 = rowY(z.rowMin) - 3;
      const y1 = rowY(z.rowMax) + 3;
      ctx.fillStyle = numberToHex(z.tint) + '14';
      ctx.fillRect(0, y0, W, y1 - y0);
    }

    const maskedNow = new Set(engine.getMaskedRows());

    // 按排从前到后绘制
    for (let r = 1; r <= venue.rowCount; r++) {
      if (maskedNow.has(r)) continue;
      const y = rowY(r);
      const half = rowHalfW(r);
      const rowIds = (venue as unknown as { rows: number[][] }).rows[r - 1];
      const rowSeats = rowIds
        .map((id) => seats[id])
        .filter((s) => s.sectionId === 'C')
        .sort((a, b) => a.x - b.x);
      if (rowSeats.length === 0) continue;
      const minX = rowSeats[0].x;
      const maxX = rowSeats[rowSeats.length - 1].x;
      const dotR = 0.7 + (r / venue.rowCount) * 1.1;

      for (const seat of rowSeats) {
        const id = seat.id;
        if (!state.filled(id) || state.masked(id)) continue;
        const t = (seat.x - minX) / Math.max(1, maxX - minX);
        const x = W / 2 + (t - 0.5) * 2 * half;
        const standing = state.pose[id] > 0.5;
        const sel = selectedIds.has(id);

        // 服装色块（底）
        ctx.fillStyle = numberToHex(state.bodyColor[id]);
        ctx.globalAlpha = 0.9;
        ctx.fillRect(x - dotR, y - dotR, dotR * 2, dotR * 2);

        // 荧光棒（站立时更亮更高）
        ctx.globalAlpha = standing ? 1 : 0.65;
        ctx.fillStyle = numberToHex(state.stickColor[id]);
        const sh = standing ? dotR * 2.4 : dotR * 1.3;
        ctx.fillRect(x - dotR * 0.35, y - sh, dotR * 0.7, sh);
        ctx.globalAlpha = 1;

        if (sel) {
          ctx.beginPath();
          ctx.arc(x, y - dotR, dotR * 2.6, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y - dotR, dotR * 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // 选中人物引线标注
    if (selectedIds.size === 1) {
      const id = [...selectedIds][0];
      const seat = seats[id];
      if (seat && state.filled(id) && !state.masked(id) && seat.sectionId === 'C') {
        const rowIds = (venue as unknown as { rows: number[][] }).rows[seat.row - 1];
        const rowSeats = rowIds.map((sid) => seats[sid]).filter((s) => s.sectionId === 'C').sort((a, b) => a.x - b.x);
        const minX = rowSeats[0].x;
        const maxX = rowSeats[rowSeats.length - 1].x;
        const t = (seat.x - minX) / Math.max(1, maxX - minX);
        const x = W / 2 + (t - 0.5) * 2 * rowHalfW(seat.row);
        const y = rowY(seat.row);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(W - 8, 14);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fff';
        ctx.font = '700 10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(seat.code, W - 8, 12);
      }
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '600 9px sans-serif';
    ctx.fillText('透视预览 · 预演机位视角', 8, H - 8);
  }, [engineRef, venue, tick]);

  return (
    <div className="preview-panel">
      <div className="panel-title">透视预览（机位视角）</div>
      <canvas ref={cvRef} width={W} height={H} className="preview-canvas" />
    </div>
  );
}
