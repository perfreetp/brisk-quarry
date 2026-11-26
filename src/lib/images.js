// 图片加载缓存：dataURL / 同源 URL → HTMLImageElement（Konva.Image 使用）
const cache = new Map();

export function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (cache.has(src)) return cache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  cache.set(src, p);
  return p;
}

export function clearImageCache() {
  cache.clear();
}
