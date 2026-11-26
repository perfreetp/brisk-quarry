import opentype from 'opentype.js';
import paper from 'paper';

export const RENDER_PX_PER_MM = 4;

let engineeringFont: opentype.Font | null = null;
let loadingPromise: Promise<opentype.Font> | null = null;
let loadError: Error | null = null;

export function loadEngineeringFont(url = `${import.meta.env.BASE_URL}fonts/FZFangSong.ttf`): Promise<opentype.Font> {
  if (engineeringFont) return Promise.resolve(engineeringFont);
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`工程字体加载失败：${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      engineeringFont = opentype.parse(buffer);
      return engineeringFont;
    })
    .catch((error: unknown) => {
      loadError = error instanceof Error ? error : new Error(String(error));
      // 不阻断排版：退回系统仿宋，但图面文字绘制入口仍统一走本模块。
      console.warn('[atlas] opentype 字体加载失败，使用系统工程字体回退', loadError);
      throw loadError;
    });

  loadingPromise.catch(() => {
    loadingPromise = null;
  });
  return loadingPromise;
}

export function getFontLoadError(): Error | null {
  return loadError;
}

export function mm(value: number): number {
  return value * RENDER_PX_PER_MM;
}

export function measureEngineeringTextMm(text: string, sizeMm: number): number {
  if (engineeringFont) {
    return engineeringFont.getAdvanceWidth(text, mm(sizeMm), { kerning: true }) / RENDER_PX_PER_MM;
  }
  return [...text].reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? sizeMm : sizeMm * 0.56), 0);
}

export interface EngineeringTextOptions {
  xMm: number;
  yMm: number;
  sizeMm?: number;
  text: string;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: number | string;
  opacity?: number;
  insert?: boolean;
}

/** 所有图面文字都经 opentype.js 转成矢量 Path；字体未就绪时用 Paper Text 兜底。 */
export function drawEngineeringText(options: EngineeringTextOptions): paper.Item {
  const {
    xMm,
    yMm,
    text,
    sizeMm = 3.4,
    color = '#1f2933',
    align = 'left',
    baseline = 'top',
    opacity = 1,
  } = options;
  const sizePx = mm(sizeMm);
  const x = mm(xMm);
  const y = mm(yMm);

  if (engineeringFont) {
    const width = engineeringFont.getAdvanceWidth(text, sizePx, { kerning: true });
    const ascender = (engineeringFont.ascender / engineeringFont.unitsPerEm) * sizePx;
    const descender = (engineeringFont.descender / engineeringFont.unitsPerEm) * sizePx;
    const height = ascender - descender;

    let drawX = x;
    if (align === 'center') drawX = x - width / 2;
    if (align === 'right' || align === 'end') drawX = x - width;

    let baselineY = y + ascender;
    if (baseline === 'middle') baselineY = y + height / 2 + ascender * 0.35;
    if (baseline === 'bottom' || baseline === 'alphabetic') baselineY = y;

    const otPath = engineeringFont.getPath(text, drawX, baselineY, sizePx, { kerning: true });
    // 直接交给 Paper 的 SVG pathData 解析器，避免逐命令转换 Q/C 时产生句柄解释偏差。
    const pathItem = paper.PathItem.create(otPath.toPathData(2));
    pathItem.fillColor = new paper.Color(color);
    pathItem.opacity = opacity;
    pathItem.data.isEngineeringText = true;
    if (options.insert === false) pathItem.remove();
    return pathItem;
  }

  const textItem = new paper.PointText({
    point: [x, y + sizePx * 0.9],
    content: text,
    fontSize: sizePx,
    fontFamily: '"FZFangSong", "FangSong", "STFangsong", "SimSun", serif',
    fillColor: color,
    opacity,
    justification: align === 'center' ? 'center' : align === 'right' ? 'right' : 'left',
  });
  textItem.data.isEngineeringText = true;
  return textItem;
}
