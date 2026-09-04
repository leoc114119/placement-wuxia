// T24 一次性离线取色工具：从 battle_env_pure.png 采样土路两档色 → 落 config/battle-hex.ts TILE.topDirtInner/topDirtOuter。
// 方案 §2.2 易错点 6：取色只允许离线一次（运行时 getImageData 每帧读像素=性能不可接受）。
// 零依赖：node:zlib inflateSync + 手写 PNG unfilter（bitDepth=8 / colorType 2或6 / 非隔行）。
// 用法：node proto/battle_demo/tools/sample_dirt_colors.mjs  → 打印各采样点 7×7 均值 hex，人工择两档誊入 config（注释标定坐标）。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(here, '../../../assets/ui/pixel/battle/raw/battle_env_pure.png');

// ---- 最小 PNG 解码（本图已知 8bit 非隔行；其他规格直接报错，不做通用化） ----
function decodePng(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('非 PNG 文件');
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idats = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || data[12] !== 0) throw new Error(`不支持 bitDepth=${bitDepth} interlace=${data[12]}`);
      if (colorType !== 6 && colorType !== 2) throw new Error(`不支持 colorType=${colorType}（仅 RGBA/RGB）`);
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) v += paeth(a, b, c);
      cur[x] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

// ---- 采样：7×7 邻域均值（抗单像素噪点），输出 hex ----
const img = decodePng(fs.readFileSync(PNG));
function sample(label, x, y, r = 3) {
  let rr = 0;
  let gg = 0;
  let bb = 0;
  let n = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const px = Math.min(img.width - 1, Math.max(0, x + dx));
      const py = Math.min(img.height - 1, Math.max(0, y + dy));
      const o = (py * img.width + px) * img.channels;
      rr += img.data[o];
      gg += img.data[o + 1];
      bb += img.data[o + 2];
      n++;
    }
  }
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  const c = `#${hex(rr)}${hex(gg)}${hex(bb)}`;
  console.log(`${label.padEnd(14)} (${String(x).padStart(4)},${String(y).padStart(4)}) → ${c}`);
  return c;
}

console.log(`# ${path.basename(PNG)} ${img.width}x${img.height} channels=${img.channels}`);
console.log('# 土路亮段（上段，近营火侧）——topDirtInner 候选');
sample('path_lit_a', 830, 640);
sample('path_lit_b', 705, 790);
sample('path_lit_c', 875, 585);
console.log('# 土路中段');
sample('path_mid_a', 585, 975);
sample('path_mid_b', 470, 1130);
console.log('# 土路暗段（下段，远处偏暗）——topDirtOuter 候选');
sample('path_dim_a', 330, 1330);
sample('path_dim_b', 255, 1460);
sample('path_dim_c', 420, 1245);
console.log('# 参考：草地区（对表用，不落 config）');
sample('grass_a', 500, 700);
sample('grass_b', 800, 1150);

// ---- 自动扫描：全图步长 16 网格 → 棕色分类（r>g>b 且 r−b≥25 且 r≥90，排除草地/阴影）→ 按亮度分位挑两档 ----
const step = 16;
const browns = [];
for (let y = 0; y < img.height; y += step) {
  for (let x = 0; x < img.width; x += step) {
    const o = (y * img.width + x) * img.channels;
    const r = img.data[o];
    const g = img.data[o + 1];
    const b = img.data[o + 2];
    if (r > g && g > b && r - b >= 25 && r >= 90) browns.push({ x, y, r, g, b, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b });
  }
}
browns.sort((a, b2) => a.lum - b2.lum);
const pick = (q) => browns[Math.floor(browns.length * q)];
const hexOf = (p) => '#' + [p.r, p.g, p.b].map((v) => v.toString(16).padStart(2, '0')).join('');
console.log(`# 自动扫描：棕色像素样本 ${browns.length} 个`);
const lo = pick(0.18);
const hi = pick(0.82);
console.log(`AUTO_OUTER(dark p18)  (${lo.x},${lo.y}) → ${hexOf(lo)}  lum=${lo.lum.toFixed(0)}`);
console.log(`AUTO_INNER(lite p82)  (${hi.x},${hi.y}) → ${hexOf(hi)}  lum=${hi.lum.toFixed(0)}`);
const med = pick(0.5);
console.log(`AUTO_MID(p50)         (${med.x},${med.y}) → ${hexOf(med)}  lum=${med.lum.toFixed(0)}`);
