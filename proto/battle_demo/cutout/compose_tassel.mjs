// 合成：plaque 上段（结+双牌，去背产物）+ 家场景 plaque_chain 红穗单元（金珠+红珠+金帽+穗身）
// 链图坐标：穗单元 srcY0=1595（小金珠顶）至图底 1857；内容中线 x≈182 → 对齐 plaque 中线 x≈155
import { decodePng, encodePng } from './png_codec.mjs';
const plaque = decodePng('base_p.png');
const chain = decodePng('../../../proto/home_demo/icons/plaque_chain.png');
const SRC_Y0 = 1595;
const DST_Y = 495;
const CENTER_SRC = 182;
const CENTER_DST = 155;
const W = plaque.width;
const H = DST_Y + (chain.height - SRC_Y0);
const out = new Uint8Array(W * H * 4);
out.set(plaque.rgba.subarray(0, DST_Y * W * 4));
for (let sy = SRC_Y0; sy < chain.height; sy++) {
  for (let sx = 0; sx < chain.width; sx++) {
    const src = (sy * chain.width + sx) * 4;
    if (chain.rgba[src + 3] === 0) continue;
    const dx = CENTER_DST + (sx - CENTER_SRC);
    const dy = DST_Y + (sy - SRC_Y0);
    if (dx < 0 || dx >= W) continue;
    const i = (dy * W + dx) * 4;
    out[i] = chain.rgba[src];
    out[i + 1] = chain.rgba[src + 1];
    out[i + 2] = chain.rgba[src + 2];
    out[i + 3] = chain.rgba[src + 3];
  }
}
encodePng('../../../assets/ui/pixel/battle/components/plaque_l_alpha.png', W, H, out);
console.log(`[compose] 产物 ${W}x${H} → plaque_l_alpha.png`);
