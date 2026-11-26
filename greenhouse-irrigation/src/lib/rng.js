// 确定性随机数：同一字符串种子 -> 同一排布序列
// 使用 mulberry32 + xfnv1a 字符串哈希，保证跨浏览器结果一致

function xfnv1a(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : xfnv1a(String(seed))
  return function rand() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 为不同用途派生子种子，避免各随机序列互相耦合
export function subRand(seed, salt) {
  return mulberry32(xfnv1a(`${salt}::${String(seed)}`))
}
