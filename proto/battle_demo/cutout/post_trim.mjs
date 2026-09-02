// 后处理：抹掉首个"宽密行"（组件主体上缘）之上的残留 + 收边裁切到内容 bbox
// 用法：node post_trim.mjs <io.png> [--dense=0.35] [--pad=2]
import { decodePng, encodePng } from './png_codec.mjs';
const args = process.argv.slice(2);
const file = args[0];
let dense = 0.35;
let pad = 2;
for (const a of args.slice(1)) {
  if (a.startsWith('--dense=')) dense = Number(a.slice(8));
  if (a.startsWith('--pad=')) pad = Number(a.slice(6));
}
const img = decodePng(file);
const { width, height, rgba } = img;
// 行不透明剖面
const rowOp = new Array(height).fill(0);
for (let y = 0; y < height; y++) {
  let c = 0;
  for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] > 40) c++;
  rowOp[y] = c / width;
}
let y0 = 0;
while (y0 < height && rowOp[y0] < dense) y0++;
if (y0 >= height) throw new Error('未找到主体行');
for (let y = 0; y < y0; y++) for (let x = 0; x < width; x++) rgba[(y * width + x) * 4 + 3] = 0;
// bbox 收边
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = y0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (rgba[(y * width + x) * 4 + 3] > 40) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
const W = maxX - minX + 1;
const H = maxY - minY + 1;
const out = new Uint8Array(W * H * 4);
for (let r = 0; r < H; r++) {
  const src = ((minY + r) * width + minX) * 4;
  out.set(rgba.subarray(src, src + W * 4), r * W * 4);
}
encodePng(file, W, H, out);
console.log(`[post_trim] ${file}: 顶部抹除 ${y0} 行 → 裁切 [${minX},${minY}] ${W}x${H}`);
