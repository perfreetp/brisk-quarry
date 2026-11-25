import type { EasingId, Keyframe } from '../types';

export const EASING_OPTIONS: Array<{ value: EasingId; label: string; hint: string }> = [
  { value: 'linear', label: '线性', hint: '关键帧按原始 U 坐标排列' },
  { value: 'easeInQuad', label: '缓入²', hint: '开头慢，关键帧向前段集中' },
  { value: 'easeOutQuad', label: '缓出²', hint: '结尾慢，关键帧向后段展开' },
  { value: 'easeInCubic', label: '缓入³', hint: '更强的前段压缩' },
  { value: 'easeOutCubic', label: '缓出³', hint: '更强的后段延展' },
  { value: 'easeInOutCubic', label: '缓入缓出³', hint: '两端柔和，中段推进' },
];

export function ease(id: EasingId, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (id) {
    case 'easeInQuad':
      return x * x;
    case 'easeOutQuad':
      return 1 - (1 - x) * (1 - x);
    case 'easeInCubic':
      return x * x * x;
    case 'easeOutCubic':
      return 1 - Math.pow(1 - x, 3);
    case 'easeInOutCubic':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'linear':
    default:
      return x;
  }
}

/** Inverse of the monotonic easing curves above, solved by bisection. */
export function inverseEase(id: EasingId, y: number): number {
  const target = Math.min(1, Math.max(0, y));
  if (id === 'linear') return target;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    if (ease(id, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function keyframeTime(cueStart: number, cueEnd: number, k: Keyframe): number {
  return k.time;
}

/**
 * Redistribute existing keyframes after an easing change.
 * Keyframes retain their base U coordinate; the new curve maps U to normalized time.
 */
export function retimeKeyframesWithEasing(
  keyframes: Keyframe[],
  start: number,
  end: number,
  easingId: EasingId,
): Keyframe[] {
  const duration = Math.max(0.001, end - start);
  return keyframes.map((k) => ({
    ...k,
    time: Number((start + ease(easingId, k.u) * duration).toFixed(3)),
  }));
}

export function sampleKeyframeIntensity(keyframes: Keyframe[], time: number, easingId: EasingId): number {
  if (keyframes.length === 0) return 0;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return sorted[0].intensity;
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].intensity;

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = Math.max(0.0001, b.time - a.time);
      const raw = (time - a.time) / span;
      // Apply the selected feel inside each arranged keyframe segment.
      const p = ease(easingId, raw);
      return a.intensity + (b.intensity - a.intensity) * p;
    }
  }
  return 0;
}

export function curvePath(id: EasingId, width = 120, height = 72, pad = 8): string {
  const points: string[] = [];
  const w = width - pad * 2;
  const h = height - pad * 2;
  for (let i = 0; i <= 48; i += 1) {
    const t = i / 48;
    const x = pad + t * w;
    const y = pad + (1 - ease(id, t)) * h;
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(' ');
}
