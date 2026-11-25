export function hexToNumber(hex: string): number {
  const h = hex.replace('#', '').trim();
  return parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
}

export function numberToHex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** 色温 K -> 俯视图灯光 tint */
export function colorTempToTint(kelvin: number): number {
  if (kelvin <= 3200) return 0xffc98a;
  if (kelvin <= 4000) return 0xffd9a8;
  if (kelvin <= 5000) return 0xfff0d8;
  if (kelvin <= 6000) return 0xf0f4ff;
  return 0xd8e4ff;
}

export const COLOR_TEMP_PRESETS = [
  { label: '暖白 3200K', value: 3200 },
  { label: '暖白 4000K', value: 4000 },
  { label: '中性 5000K', value: 5000 },
  { label: '日光 5600K', value: 5600 },
  { label: '冷白 6500K', value: 6500 },
];

/** 在某颜色池里按索引确定性挑色（座位 id 决定，填充结果稳定） */
export function pickFromPalette(palette: number[], seed: number): number {
  // 简单确定性 hash
  let h = seed * 2654435761;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return palette[Math.abs(h) % palette.length];
}
