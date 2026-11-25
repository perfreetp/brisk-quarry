import { Application, Graphics, Texture } from 'pixi.js';

export interface PersonTextures {
  bodyStand: Texture;
  bodySit: Texture;
  stick: Texture;
  glow: Texture;
  ring: Texture;
}

/** 用矢量图形生成小尺寸贴图，运行时用 tint 上色，减少贴图数量 */
export function makeTextures(app: Application): PersonTextures {
  const renderer = app.renderer;

  const stand = new Graphics();
  // 身体（俯视微侧的抽象人形）
  stand.roundRect(-4.5, -6, 9, 12, 3.5).fill(0xffffff);
  // 头
  stand.circle(0, -5.4, 3.1).fill(0xffffff);
  // 肩线
  stand.roundRect(-5.5, -2.5, 11, 3.2, 1.6).fill(0xffffff);
  const bodyStand = renderer.generateTexture(stand);
  stand.destroy();

  const sit = new Graphics();
  // 坐姿：更矮更宽
  sit.roundRect(-5.5, -3.5, 11, 7.5, 3).fill(0xffffff);
  sit.circle(0, -3.6, 2.7).fill(0xffffff);
  const bodySit = renderer.generateTexture(sit);
  sit.destroy();

  const stickG = new Graphics();
  stickG.roundRect(-1.3, -6, 2.6, 12, 1.3).fill(0xffffff);
  const stick = renderer.generateTexture(stickG);
  stickG.destroy();

  // 荧光棒辉光：canvas 径向渐变
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const glow = Texture.from(cv);

  const ringG = new Graphics();
  ringG.circle(0, 0, 9.5).stroke({ width: 1.6, color: 0xffffff, alpha: 0.95 });
  ringG.circle(0, 0, 7.5).stroke({ width: 0.8, color: 0xffffff, alpha: 0.5 });
  const ring = renderer.generateTexture(ringG);
  ringG.destroy();

  return { bodyStand, bodySit, stick, glow, ring };
}
