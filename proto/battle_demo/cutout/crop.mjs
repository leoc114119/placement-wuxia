// 从大图裁切矩形区域（v8 定稿基准 → ctrl 组件完整三钮）
import { decodePng, encodePng } from './png_codec.mjs';
const [inp, outp, x, y, w, h] = process.argv.slice(2);
const img = decodePng(inp);
const X = +x, Y = +y, W = +w, H = +h;
if (X + W > img.width || Y + H > img.height) throw new Error('裁切越界');
const out = new Uint8Array(W * H * 4);
for (let r = 0; r < H; r++) {
  const src = ((Y + r) * img.width + X) * 4;
  out.set(img.rgba.subarray(src, src + W * 4), r * W * 4);
}
encodePng(outp, W, H, out);
console.log(`[crop] ${inp} [${X},${Y},${W}x${H}] → ${outp}`);
