#!/usr/bin/env node
// 超采样降采样：把高分辨率渲染（color/depth/normal）箱式滤波降到目标尺寸。
//
// 为什么需要：直接在 240×320 上光栅化，边缘锯齿无法消除；正确做法是
// 高分辨率渲染（如 4x）+ 多次采样后滤波降采样，得到干净的抗锯齿底图。
//
// 用法：
//   node downsample.mjs <in.raw> <in.depth> <in.normal> <outPrefix> <inW> <inH> <scale>
// 输出：<outPrefix>.raw / .depth / .normal （尺寸 = inW/scale × inH/scale）
import fs from 'fs';

const [inRaw, inDepth, inNormal, outPrefix, inWs, inHs, ss] = process.argv.slice(2);
const IW = +inWs, IH = +inHs, S = +ss;
const W = Math.floor(IW / S), H = Math.floor(IH / S);

function readF32(path) {
  const b = fs.readFileSync(path);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

const color = fs.readFileSync(inRaw);
const depth = readF32(inDepth);
const nrm   = readF32(inNormal);

const oColor = Buffer.alloc(W * H * 4);
const oDepth = Buffer.alloc(W * H * 4);
const oNormal = Buffer.alloc(W * H * 4 * 3);

let minD = Infinity, maxD = -Infinity;

for (let oy = 0; oy < H; oy++) {
  for (let ox = 0; ox < W; ox++) {
    let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
    let dz = 0, dzN = 0;
    let nx = 0, ny = 0, nz = 0, nN = 0;
    for (let dy = 0; dy < S; dy++) {
      for (let dx = 0; dx < S; dx++) {
        const ix = ox * S + dx, iy = oy * S + dy;
        const i = iy * IW + ix;
        const a = color[i * 4 + 3];
        sa += a; n++;
        // 颜色按 alpha 加权（背景不让它污染边缘）
        const w = a / 255;
        sr += color[i*4] * w; sg += color[i*4+1] * w; sb += color[i*4+2] * w;
        const zw = a / 255;
        if (a > 128 && Number.isFinite(depth[i]) && depth[i] < 1e8) {
          dz += depth[i] * zw; dzN += zw;
        }
        if (a > 128) { nx += nrm[i*3]*zw; ny += nrm[i*3+1]*zw; nz += nrm[i*3+2]*zw; nN += zw; }
      }
    }
    const oi = oy * W + ox;
    const wsum = sr + sg + sb;
    const alphaAvg = Math.round(sa / n);
    if (wsum > 0) {
      // 归一化时按「非零权重」求和：用 alpha 加权的均值
      const ws = (sa / 255);
      oColor[oi*4]   = Math.min(255, Math.round(sr / Math.max(1e-6, ws)));
      oColor[oi*4+1] = Math.min(255, Math.round(sg / Math.max(1e-6, ws)));
      oColor[oi*4+2] = Math.min(255, Math.round(sb / Math.max(1e-6, ws)));
    } else {
      oColor[oi*4] = oColor[oi*4+1] = oColor[oi*4+2] = 255;
    }
    oColor[oi*4+3] = alphaAvg;

    const z = dzN > 0 ? dz / dzN : 1e9;
    oDepth.writeFloatLE(z, oi * 4);
    if (nN > 0) {
      let X = nx/nN, Y = ny/nN, Z = nz/nN;
      const L = Math.hypot(X,Y,Z) || 1;
      X/=L; Y/=L; Z/=L;
      oNormal.writeFloatLE(X, (oi*3)*4);
      oNormal.writeFloatLE(Y, (oi*3+1)*4);
      oNormal.writeFloatLE(Z, (oi*3+2)*4);
    } else {
      oNormal.writeFloatLE(0, (oi*3)*4);
      oNormal.writeFloatLE(0, (oi*3+1)*4);
      oNormal.writeFloatLE(1, (oi*3+2)*4);
    }
  }
}

fs.writeFileSync(outPrefix + '.raw', oColor);
fs.writeFileSync(outPrefix + '.depth', oDepth);
fs.writeFileSync(outPrefix + '.normal', oNormal);
console.log(JSON.stringify({ from: [IW, IH], to: [W, H], supersample: S }));
