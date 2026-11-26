// 色标分档与颜色工具

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

export function rgbToHex(r, g, b) {
  const c = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

/**
 * 按色标阈值给白化值定级。
 * thresholds 长度 = bins 长度 - 1：
 *   value < thresholds[0] → 0 档；thresholds[i-1] <= v < thresholds[i] → i 档；
 *   v >= 最后一个阈值 → 最高档。
 */
export function levelFor(value, thresholds) {
  for (let i = 0; i < thresholds.length; i++) {
    if (value < thresholds[i]) return i;
  }
  return thresholds.length;
}

export function colorForValue(value, scale, bins) {
  return bins[levelFor(value, scale.thresholds)].color;
}

/** 生成一条 CSS 渐变（图例用） */
export function legendGradient(bins) {
  const stop = bins.length - 1;
  const parts = bins.map((b, i) => `${b.color} ${((i / stop) * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}
