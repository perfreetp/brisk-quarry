import type { Vec } from '../types';

// ---------- 排版常量(世界单位:米) ----------
export const CABLE_SYMBOL_R = 0.28;
export const VENT_SYMBOL_R = 0.34;
export const LABEL_FONT = 0.34;
export const LABEL_PAD_X = 0.14;
export const LABEL_PAD_Y = 0.09;
export const LABEL_LINE_GAP = 0.06;

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');

/** 估算文字在给定字号(米)下的世界尺寸(文字在屏幕空间绘制,这里只取宽高比) */
export function measureText(
  text: string,
  fontMeters: number
): { w: number; h: number } {
  const lines = text.split('\n');
  let w = 0;
  for (const line of lines) {
    let lw: number;
    if (measureCtx) {
      measureCtx.font = `600 ${fontMeters * 40}px "Microsoft YaHei", sans-serif`;
      lw = measureCtx.measureText(line).width / 40;
    } else {
      lw = line.length * fontMeters * 0.62;
    }
    w = Math.max(w, lw);
  }
  return {
    w,
    h: fontMeters * lines.length + LABEL_LINE_GAP * (lines.length - 1)
  };
}

export function labelBoxSize(text: string): { w: number; h: number } {
  const m = measureText(text, LABEL_FONT);
  return {
    w: m.w + LABEL_PAD_X * 2,
    h: m.h + LABEL_PAD_Y * 2
  };
}

// ---------- 相机:屏幕像素 <-> 世界米 ----------
// 约定:Two 场景不做 y 翻转,所有世界点经 toScreen 转换后绘制,
// 这样文字始终正向显示。
export interface Camera {
  scale: number; // 像素 / 米
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export function createCamera(width: number, height: number): Camera {
  return { scale: 1, offsetX: 0, offsetY: 0, width, height };
}

export function fitCamera(
  cam: Camera,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  paddingPx = 36
): void {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const sx = (cam.width - paddingPx * 2) / Math.max(w, 1e-6);
  const sy = (cam.height - paddingPx * 2) / Math.max(h, 1e-6);
  cam.scale = Math.min(sx, sy);
  cam.offsetX =
    cam.width / 2 - ((bounds.minX + bounds.maxX) / 2) * cam.scale;
  cam.offsetY =
    cam.height / 2 + ((bounds.minY + bounds.maxY) / 2) * cam.scale;
}

export function toScreen(cam: Camera, p: Vec): Vec {
  return {
    x: p.x * cam.scale + cam.offsetX,
    y: -p.y * cam.scale + cam.offsetY
  };
}

export function screenToWorld(cam: Camera, p: Vec): Vec {
  return {
    x: (p.x - cam.offsetX) / cam.scale,
    y: -(p.y - cam.offsetY) / cam.scale
  };
}

export function pointInRect(
  p: Vec,
  rect: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.w &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.h
  );
}
