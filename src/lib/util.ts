let counter = 0;

/** 稳定实体 id:符号与标注靠它绑定,重编号也不变 */
export function uid(prefix: 'cable' | 'vent' | 'comp' = 'comp'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function dist2(
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
