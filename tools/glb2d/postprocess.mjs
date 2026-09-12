#!/usr/bin/env node
// 3D->2D 卡通后处理：描边（深度/法线/轮廓三源）+ 调色板量化
//
// 为什么不用「颜色差」做描边：颜色差会把头发内部纹理、衣服褶皱全当成边缘，
// 结果是整个人物被描成黑块（本会话早些时候的实锤）。
// 正确做法是用几何信息判定边缘：
//   1) 轮廓边（alpha 边界）—— 人物外轮廓
//   2) 深度边（深度不连续）—— 前后层交界（手臂在躯干前、马尾在身后）
//   3) 法线边（法线突变）   —— 形体转折（鼻梁、衣褶的硬边）
//
// 用法：
//   node postprocess.mjs <in.raw> <in.depth> <in.normal> <out.raw> <W> <H> \
//        [--levels N] [--outline T] [--depth-thresh D] [--normal-thresh A] \
//        [--palette K] [--no-outline] [--raw-color]
import fs from 'fs';

const [inRaw, inDepth, inNormal, outRaw, Ws, Hs, ...rest] = process.argv.slice(2);
const W = +Ws, H = +Hs;

function flag(name, def) {
  const i = rest.indexOf('--' + name);
  if (i < 0) return def;
  const v = rest[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const LEVELS   = +flag('levels', 8);        // 每通道量化级数
const OUTLINE  = +flag('outline', 1);       // 描边宽度（像素）
const DTHRESH  = +flag('depth-thresh', 0.012);
const NTHRESH  = +flag('normal-thresh', 0.35);  // 1-dot(n1,n2) 阈值，越大越少边
const PALETTE  = +flag('palette', 0);
// 描边会额外占用调色板色位（墨色 + 可能多档），故量化目标色数应预留余量：
// 目标 256 色 PNG-8 时，量化用 248 色、其余留给描边与抗锯齿边，避免超 256。
const PALETTE_RESERVE = +flag('palette-reserve', 8);       // >0 时改用 k-means 调色板量化
const NO_OUTLINE = !!flag('no-outline', false);
const OUTLINE_RGB = [26, 24, 28];           // 墨色，不纯黑

const color = fs.readFileSync(inRaw);            // RGBA
function readF32(path) {
  const b = fs.readFileSync(path);
  // Buffer 可能来自共享内存池：必须按 byteOffset 切片，否则会读到相邻数据
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return new Float32Array(ab);
}
const depth = readF32(inDepth);
const nrm   = readF32(inNormal);

// ★ 防呆（09-12 踩过两次）：depth/normal 必须是**降采样后**的 1× 缓冲。
//   传了 4× 渲染的 depth（尺寸差 16 倍）→ 边缘检测全命中 → 整幅被墨色涂黑，
//   而且**完全无声**（只是画面对了却全黑）。这里按长度校验，不符即报错退出。
const N = W * H;
if (depth.length !== N) {
  console.error(`FATAL: depth 缓冲长度 ${depth.length} ≠ 画布像素数 ${N}（${W}x${H}）`);
  console.error('       多半是把 4× 渲染的 depth 传进来了——应传 downsample.mjs 输出的 <前缀>.depth');
  process.exit(1);
}
if (nrm.length !== N * 3) {
  console.error(`FATAL: normal 缓冲长度 ${nrm.length} ≠ 画布像素数*3 ${N*3}（${W}x${H}）`);
  console.error('       同上：应传 downsample.mjs 输出的 <前缀>.normal');
  process.exit(1);
}
const alpha = new Uint8Array(N);
for (let i = 0; i < N; i++) alpha[i] = color[i * 4 + 3];

// ---------- 1. 边缘检测 ----------
// 描边分两级（这是关键，混在一起会把人物描成黑块）：
//   silhouette（外轮廓）—— 可以粗
//   interior （体内线条）—— 必须细，否则头发/衣褶全变黑
const silMask = new Uint8Array(N);
const intMask = new Uint8Array(N);
const R = Math.max(1, OUTLINE);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!alpha[i]) continue;

    // (1) 外轮廓：4 邻域里有背景或越界
    let isSil = false;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx2 = x + dx, ny2 = y + dy;
      if (nx2 < 0 || ny2 < 0 || nx2 >= W || ny2 >= H) { isSil = true; break; }
      if (!alpha[ny2 * W + nx2]) { isSil = true; break; }
    }
    if (isSil) { silMask[i] = 1; continue; }

    // (2)(3) 体内线条：深度边（前后层交界）/ 法线边（形体转折）
    // 深度用「绝对差」——此前用相对差(除以 min|z|)在深度跨零点时分母趋零，
    // 差值爆炸，导致 86% 像素被描边（实测事故）。
    const z0 = depth[i];
    const n0x = nrm[i*3], n0y = nrm[i*3+1], n0z = nrm[i*3+2];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx2 = x + dx, ny2 = y + dy;
      if (nx2 < 0 || ny2 < 0 || nx2 >= W || ny2 >= H) continue;
      const j = ny2 * W + nx2;
      if (!alpha[j]) continue;
      if (Math.abs(z0 - depth[j]) > DTHRESH) { intMask[i] = 1; break; }
      const d = n0x*nrm[j*3] + n0y*nrm[j*3+1] + n0z*nrm[j*3+2];
      if (1 - d > NTHRESH) { intMask[i] = 1; break; }
    }
  }
}

// ---------- 2. 描边膨胀 ----------
// 只有外轮廓加粗；体内线条保持 1px（加粗会糊成一团）
function dilate(mask, r) {
  if (r <= 0) return mask;
  const grown = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx2 = x + dx, ny2 = y + dy;
      if (nx2 < 0 || ny2 < 0 || nx2 >= W || ny2 >= H) continue;
      grown[ny2 * W + nx2] = 1;
    }
  }
  return grown;
}
const silGrown = NO_OUTLINE ? new Uint8Array(N) : dilate(silMask, R);
const intGrown = NO_OUTLINE ? new Uint8Array(N) : intMask;
const outlineMask = new Uint8Array(N);
for (let i = 0; i < N; i++) outlineMask[i] = (silGrown[i] || intGrown[i]) ? 1 : 0;

// ---------- 3. 颜色量化 ----------
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }

let qr = new Uint8Array(N), qg = new Uint8Array(N), qb = new Uint8Array(N);

if (PALETTE > 0) {
  const KQ = Math.max(2, PALETTE - PALETTE_RESERVE);
  // k-means 调色板（只在人物像素上跑）
  const px = [];
  for (let i = 0; i < N; i++) if (alpha[i]) px.push([color[i*4], color[i*4+1], color[i*4+2]]);
  // 初始化：均匀抽样
  let cent = [];
  for (let k = 0; k < KQ; k++) cent.push(px[Math.floor(px.length * (k + 0.5) / KQ)].slice());
  for (let it = 0; it < 12; it++) {
    const sum = cent.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let bi = 0, bd = Infinity;
      for (let k = 0; k < KQ; k++) {
        const dr = p[0]-cent[k][0], dg = p[1]-cent[k][1], db = p[2]-cent[k][2];
        const d = dr*dr + dg*dg + db*db;
        if (d < bd) { bd = d; bi = k; }
      }
      sum[bi][0]+=p[0]; sum[bi][1]+=p[1]; sum[bi][2]+=p[2]; sum[bi][3]++;
    }
    for (let k = 0; k < KQ; k++) if (sum[k][3]) {
      cent[k] = [sum[k][0]/sum[k][3], sum[k][1]/sum[k][3], sum[k][2]/sum[k][3]];
    }
  }
  for (let i = 0; i < N; i++) {
    if (!alpha[i]) continue;
    const p = [color[i*4], color[i*4+1], color[i*4+2]];
    let bi = 0, bd = Infinity;
    for (let k = 0; k < KQ; k++) {
      const dr = p[0]-cent[k][0], dg = p[1]-cent[k][1], db = p[2]-cent[k][2];
      const d = dr*dr + dg*dg + db*db;
      if (d < bd) { bd = d; bi = k; }
    }
    qr[i] = clamp255(cent[bi][0]); qg[i] = clamp255(cent[bi][1]); qb[i] = clamp255(cent[bi][2]);
  }
} else {
  const step = 256 / LEVELS;
  const q = (v) => Math.min(255, Math.floor(v / step) * step + step / 2);
  // 量化前先做色度降噪：暗部贴图的微小色偏在量化后会被放大成整块色斑
  // （实测：背面帧头发里出现红/绿色块）。做法是 3x3 均值只作用于色度，
  // 亮度保持原样，避免糊掉形体。
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!alpha[i]) continue;
    lum[i] = 0.299*color[i*4] + 0.587*color[i*4+1] + 0.114*color[i*4+2];
  }
  const CHROMA_STRENGTH = +flag('chroma-blur', 1);   // 0=关
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y*W + x;
    if (!alpha[i]) continue;
    let sr = 0, sg = 0, sb = 0, wsum = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x+dx, ny = y+dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny*W + nx;
      if (!alpha[j]) continue;
      const d = Math.abs(lum[j] - lum[i]);
      // 亮度差越大权重越低：只在相近亮度区域内平均色度，保护边缘
      const w = 1 / (1 + d * d * 0.02);
      sr += color[j*4]*w; sg += color[j*4+1]*w; sb += color[j*4+2]*w; wsum += w;
    }
    let r = color[i*4], g = color[i*4+1], b = color[i*4+2];
    if (wsum > 0 && CHROMA_STRENGTH > 0) {
      const ar = sr/wsum, ag = sg/wsum, ab = sb/wsum;
      const al = lum[i];
      const achroma = [ar - (0.299*ar+0.587*ag+0.114*ab),
                       ag - (0.299*ar+0.587*ag+0.114*ab),
                       ab - (0.299*ar+0.587*ag+0.114*ab)];
      const cchroma = [r - al, g - al, b - al];
      const k = Math.min(1, CHROMA_STRENGTH);
      r = al + (cchroma[0]*(1-k) + achroma[0]*k);
      g = al + (cchroma[1]*(1-k) + achroma[1]*k);
      b = al + (cchroma[2]*(1-k) + achroma[2]*k);
    }
    qr[i] = q(r); qg[i] = q(g); qb[i] = q(b);
  }
}

// ---------- 3.5 去斑：单像素色噪 ----------
// 实测：渲染时贴图采样会在头发上留下孤立的彩色单像素（红/绿/蓝点），
// 量化会把它们固定下来，成品能看到花点。做法：若某像素与 8 邻域多数
// 颜色差异都很大，就替换为邻域亮度最接近者的颜色。
const SPECKLE = flag('speckle', 1);
if (SPECKLE) {
  const tr = Uint8Array.from(qr), tg = Uint8Array.from(qg), tb = Uint8Array.from(qb);
  for (let y = 1; y < H-1; y++) for (let x = 1; x < W-1; x++) {
    const i = y*W + x;
    if (!alpha[i]) continue;
    const r0 = tr[i], g0 = tg[i], b0 = tb[i];
    let diff = 0, cnt = 0;
    const nb = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const j = (y+dy)*W + (x+dx);
      if (!alpha[j]) continue;
      nb.push(j); cnt++;
      const d = Math.abs(tr[j]-r0) + Math.abs(tg[j]-g0) + Math.abs(tb[j]-b0);
      if (d > 70) diff++;
    }
    // 与多数邻域都显著不同 → 判为噪点
    if (cnt >= 5 && diff >= Math.ceil(cnt * 0.75)) {
      // 取邻域里亮度最接近原像素的那个颜色
      const l0 = 0.299*r0 + 0.587*g0 + 0.114*b0;
      let best = -1, bd = Infinity;
      for (const j of nb) {
        const lj = 0.299*tr[j] + 0.587*tg[j] + 0.114*tb[j];
        const d = Math.abs(lj - l0);
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) { qr[i] = tr[best]; qg[i] = tg[best]; qb[i] = tb[best]; }
    }
  }
}

// ---------- 4. 合成 ----------
const out = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  if (!alpha[i]) { out[i*4+3] = 0; continue; }
  let r = qr[i], g = qg[i], b = qb[i];
  if (!NO_OUTLINE && outlineMask[i]) { r = OUTLINE_RGB[0]; g = OUTLINE_RGB[1]; b = OUTLINE_RGB[2]; }
  out[i*4] = r; out[i*4+1] = g; out[i*4+2] = b; out[i*4+3] = 255;
}
fs.writeFileSync(outRaw, out);

// 统计
let edgeCount = 0;
for (let i = 0; i < N; i++) if (outlineMask[i] && alpha[i]) edgeCount++;
console.log(JSON.stringify({
  W, H, levels: PALETTE > 0 ? `kmeans-${PALETTE}` : LEVELS,
  outlineWidth: NO_OUTLINE ? 0 : OUTLINE,
  depthThresh: DTHRESH, normalThresh: NTHRESH,
  outlinePx: edgeCount, outlinePctOfSubject: +(edgeCount / Math.max(1, [...alpha].filter(v=>v).length) * 100).toFixed(1),
}));
