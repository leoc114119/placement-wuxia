#!/usr/bin/env node
// 多角度回填：把 N 张 2D 渲染图的颜色写回贴图图集。
//
// 原理：渲染器在 UVMAP=1 时会写出每像素的贴图坐标 <raw>.uv（Float32 W*H*2，未命中 -1）。
// 回填就是反过来——屏幕上那个像素是什么颜色，就写回它对应的那个纹素。
//
// 权重（避免把背景/侧掠面糊进贴图）：
//   · 朝向：用 |n.z|（视角空间法线垂直分量）。背对相机的面本来就被 z-buffer 挡掉，
//     取绝对值即可回避相机朝向符号的歧义。
//   · 边缘：离"背景像素"的距离。太靠轮廓的像素颜色是被抗锯齿混过的，权重要降低。
//
// 用法：
//   node tools/glb2d/backfill_tex.mjs --tex <orig.raw> --tw 4096 --th 4096 --out <new.raw> \
//     --view <color.raw> <color.raw.uv> <aux.normal> [--view ... ...]
import fs from 'fs';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : def;
};
const TEX = opt('tex');
const TW = +opt('tw'), TH = +opt('th');
const OUT = opt('out');
const SPLAT = +opt('splat', 2);
// 多角度合成方式：avg=加权平均（会把不同角度的画法差异平均成模糊）；best=每个纹素只取权重最大的那个角度
const MODE = opt('mode', 'avg');
const VW = +opt('w', 0), VH = +opt('h', 0);   // 视角图尺寸（必须显式给，不能靠面积开方推）

const views = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--view') views.push({ color: argv[i + 1], uv: argv[i + 2], nrm: argv[i + 3], shade: argv[i + 4] });
}
if (!TEX || !OUT || !views.length) {
  console.error('用法见文件头'); process.exit(1);
}

const acc = new Float64Array(TW * TH * 3);
const wsum = new Float64Array(TW * TH);
const cover = new Uint8Array(TW * TH);   // 本纹素是否被覆盖过（用于统计，不参与混合）
const bestW = new Float64Array(TW * TH);  // best 模式：该纹素见过的最大权重
const bestC = new Float64Array(TW * TH * 3);

// 边缘权重：把背景像素标 0，做多轮膨胀，得到"离背景的粗略距离"
function edgeWeight(W, H, uvBuf, colorBuf) {
  const bg = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) bg[i] = uvBuf[i * 2] < 0 ? 1 : 0;
  const dist = new Uint8Array(W * H);
  let cur = bg;
  for (let d = 1; d <= 4; d++) {
    const nxt = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cur[i] && !dist[i]) dist[i] = d;
      if (x > 0 && cur[i - 1]) dist[i] ||= d;
      if (x < W - 1 && cur[i + 1]) dist[i] ||= d;
      if (y > 0 && cur[i - W]) dist[i] ||= d;
      if (y < H - 1 && cur[i + W]) dist[i] ||= d;
      nxt[i] = bg[i] || dist[i] ? 1 : 0;
    }
    cur = nxt;
  }
  const w = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (uvBuf[i * 2] < 0) { w[i] = 0; continue; }
    w[i] = 1 / (1 + dist[i] * 0.9);         // 贴边像素权重衰减
  }
  return w;
}

let used = 0;
for (const v of views) {
  const col = fs.readFileSync(v.color);
  const uv = fs.readFileSync(v.uv);
  const nrm = fs.readFileSync(v.nrm);
  // 渲染图里已经乘过打光系数；写回贴图必须除回去，否则重渲时会被打第二遍光
  const shadeRaw = fs.existsSync(v.shade) ? fs.readFileSync(v.shade) : null;
  if (!shadeRaw) { console.error(`FATAL: 缺 ${v.shade}（打光系数），直接回填会双份明暗`); process.exit(1); }
  if (!VW || !VH) { console.error('FATAL: 必须用 --w/--h 显式给视角图尺寸'); process.exit(1); }
  const W = VW, H = VH;
  if (col.length !== W * H * 4) { console.error(`FATAL: ${v.color} 长度 ${col.length} ≠ ${W}x${H}x4`); process.exit(1); }
  if (uv.length !== W * H * 8) { console.error(`FATAL: ${v.uv} 长度 ${uv.length} ≠ ${W}x${H}x8`); process.exit(1); }
  if (nrm.length !== W * H * 12) { console.error(`FATAL: ${v.nrm} 长度 ${nrm.length} ≠ ${W}x${H}x12`); process.exit(1); }
  const uvF = new Float32Array(uv.buffer, uv.byteOffset, W * H * 2);
  const nrF = new Float32Array(nrm.buffer, nrm.byteOffset, W * H * 3);
  const shF = new Float32Array(shadeRaw.buffer, shadeRaw.byteOffset, W * H);
  const ew = edgeWeight(W, H, uvF, col);

  for (let i = 0; i < W * H; i++) {
    const u = uvF[i * 2], vv = uvF[i * 2 + 1];
    if (u < 0) continue;
    const nz = Math.abs(nrF[i * 3 + 2]);
    const w = nz * ew[i];
    if (w <= 0) continue;
    // 单点写会在低分辨率渲染时给图集留空洞 → 按半径 SPLAT 撒点（中心权重最高）
    const cx = u * TW, cy = vv * TH;
    for (let dy = -SPLAT; dy <= SPLAT; dy++) {
      const ty = Math.round(cy) + dy;
      if (ty < 0 || ty >= TH) continue;
      for (let dx = -SPLAT; dx <= SPLAT; dx++) {
        const tx = Math.round(cx) + dx;
        if (tx < 0 || tx >= TW) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > SPLAT * SPLAT) continue;
        const sw = w * (1 - Math.sqrt(d2) / (SPLAT + 0.5));
        if (sw <= 0) continue;
        const ti = ty * TW + tx;
        const sd = shF[i] > 0.05 ? shF[i] : 0.05;
        const rr = col[i * 4] / sd, gg = col[i * 4 + 1] / sd, bb = col[i * 4 + 2] / sd;
        acc[ti * 3] += rr * sw;
        acc[ti * 3 + 1] += gg * sw;
        acc[ti * 3 + 2] += bb * sw;
        wsum[ti] += sw;
        if (sw > bestW[ti]) { bestW[ti] = sw; bestC[ti * 3] = rr; bestC[ti * 3 + 1] = gg; bestC[ti * 3 + 2] = bb; }
        cover[ti] = 1;
      }
    }
    used++;
  }
  console.log(`  ${v.color}: ${W}×${H}`);
}

const orig = fs.readFileSync(TEX);
const out = Buffer.from(orig);
let painted = 0, total = TW * TH;
for (let i = 0; i < total; i++) {
  if (!cover[i] || wsum[i] <= 0) continue;          // 没被覆盖的纹素保留原贴图
  const src = MODE === 'best' ? bestC : acc;
  const div = MODE === 'best' ? 1 : wsum[i];
  out[i * 4] = Math.round(Math.min(255, src[i * 3] / div));
  out[i * 4 + 1] = Math.round(Math.min(255, src[i * 3 + 1] / div));
  out[i * 4 + 2] = Math.round(Math.min(255, src[i * 3 + 2] / div));
  painted++;
}
fs.writeFileSync(OUT, out);
console.log(JSON.stringify({ mode: MODE, views: views.length, texels: total, painted,
  paintedPct: +(painted / total * 100).toFixed(2), samples: used, out: OUT }));
