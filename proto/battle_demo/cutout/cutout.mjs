// T16 组件透明化去背管线（Q2 批复方案落地：边缘洪泛 + 封闭孔洞兜底 + 1px 羽化）
// 用法：node cutout.mjs <in.png> <out.png> [--tol=34] [--hole-tol=26] [--feather=1]
// 算法（对像素画切图）：
//   1) 背景洪泛：从图像四边种子出发，4-邻域区域生长，与"来路像素"色距 < tol 判为背景
//      （从边缘出发可避免误抠组件内部与背景同色的区域——只抠连通到边的外围）
//   2) 封闭孔洞兜底：未被洪泛到达、但整体色距接近背景均值且与背景区相邻的连通域 → 背景
//      （处理按钮之间不连通到边缘的缝隙）
//   3) 1px 羽化：前景中 4-邻域含 ≥2 背景的边界像素 alpha 降至 featherAlpha，弱化锯齿晕边
//   4) 小岛清理：面积 < minIsland 的孤立前景连通域 → 透明（清残留背景碎屑/裁切残片）
//   5) 细笔画清理：bbox 短边 ≤ maxThin 的前景连通域 → 透明（清格线等细长残留；块状主体不受影响）
import { decodePng, encodePng } from './png_codec.mjs';

function parseArgs(argv) {
  const opts = { tol: 34, holeTol: 26, feather: 1, minIsland: 24, maxThin: 0, padBottom: 0 };
  const pos = [];
  for (const a of argv) {
    if (a.startsWith('--tol=')) opts.tol = Number(a.slice(6));
    else if (a.startsWith('--hole-tol=')) opts.holeTol = Number(a.slice(10));
    else if (a.startsWith('--feather=')) opts.feather = Number(a.slice(9));
    else if (a.startsWith('--min-island=')) opts.minIsland = Number(a.slice(12));
    else if (a.startsWith('--max-thin=')) opts.maxThin = Number(a.slice(11));
    else if (a.startsWith('--pad-bottom=')) opts.padBottom = Number(a.slice(13));
    else pos.push(a);
  }
  return { pos, opts };
}

/** 底边扩展：主体贴边时避免边缘种子落在主体上——用四角均色填充 pad 行（洪泛后即全透明） */
function padBottomImg(img, pad) {
  if (pad <= 0) return img;
  const { width, height, rgba } = img;
  const corner = (i) => i * 4;
  const idxs = [corner(0), corner(width - 1), corner((height - 1) * width), corner((height - 1) * width + width - 1)];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const i of idxs) {
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
  }
  r /= 4;
  g /= 4;
  b /= 4;
  const H = height + pad;
  const out = new Uint8Array(width * H * 4);
  for (let i = 0; i < width * H; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  out.set(rgba, 0);
  return { width, height: H, rgba: out };
}

const dist2 = (rgba, i, j) => {
  const dr = rgba[i] - rgba[j];
  const dg = rgba[i + 1] - rgba[j + 1];
  const db = rgba[i + 2] - rgba[j + 2];
  return dr * dr + dg * dg + db * db;
};

export function cutout(input, { tol, holeTol, feather, minIsland, maxThin, padBottom }) {
  const { width, height, rgba } = padBottomImg(input, padBottom);
  const n = width * height;
  const isBg = new Uint8Array(n); // 1=背景
  const tol2 = tol * tol;
  const holeTol2 = holeTol * holeTol;

  // ---- 1) 边缘洪泛 ----
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  const push = (idx) => {
    if (!isBg[idx]) {
      isBg[idx] = 1;
      queue[qt++] = idx;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  // 边缘种子各自代表"局部背景色"——洪泛比较的是与来路像素的色距（容忍背景渐变/噪点）
  while (qh < qt) {
    const cur = queue[qh++];
    const cx = cur % width;
    const cy = (cur / width) | 0;
    const neighbors = [];
    if (cx > 0) neighbors.push(cur - 1);
    if (cx < width - 1) neighbors.push(cur + 1);
    if (cy > 0) neighbors.push(cur - width);
    if (cy < height - 1) neighbors.push(cur + width);
    for (const nb of neighbors) {
      if (!isBg[nb] && dist2(rgba, cur * 4, nb * 4) < tol2) push(nb);
    }
  }

  // ---- 2) 封闭孔洞兜底：与背景相邻的未达连通域，均值色接近背景均值 → 背景 ----
  // 背景均值（洪泛结果）
  let br = 0;
  let bg = 0;
  let bb = 0;
  let bn = 0;
  for (let i = 0; i < n; i++) {
    if (isBg[i]) {
      br += rgba[i * 4];
      bg += rgba[i * 4 + 1];
      bb += rgba[i * 4 + 2];
      bn++;
    }
  }
  if (bn > 0) {
    br /= bn;
    bg /= bn;
    bb /= bn;
  }
  const seen = new Uint8Array(n);
  const comp = [];
  for (let start = 0; start < n; start++) {
    if (isBg[start] || seen[start]) continue;
    comp.length = 0;
    let head = 0;
    seen[start] = 1;
    comp.push(start);
    let touchesBg = false;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    while (head < comp.length) {
      const cur = comp[head++];
      sr += rgba[cur * 4];
      sg += rgba[cur * 4 + 1];
      sb += rgba[cur * 4 + 2];
      const cx = cur % width;
      const cy = (cur / width) | 0;
      const neighbors = [];
      if (cx > 0) neighbors.push(cur - 1);
      if (cx < width - 1) neighbors.push(cur + 1);
      if (cy > 0) neighbors.push(cur - width);
      if (cy < height - 1) neighbors.push(cur + width);
      for (const nb of neighbors) {
        if (isBg[nb]) touchesBg = true;
        else if (!seen[nb]) {
          seen[nb] = 1;
          comp.push(nb);
        }
      }
    }
    if (touchesBg && comp.length <= n * 0.25) {
      const mr = sr / comp.length;
      const mg = sg / comp.length;
      const mb = sb / comp.length;
      const d2 = (mr - br) ** 2 + (mg - bg) ** 2 + (mb - bb) ** 2;
      if (d2 < holeTol2) for (const idx of comp) isBg[idx] = 1;
    }
  }

  // ---- 3) 1px 羽化 ----
  const out = new Uint8Array(rgba); // 拷贝后改 alpha
  if (feather > 0) {
    const featherAlpha = 150;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (isBg[i]) continue;
        let bgN = 0;
        if (x > 0 && isBg[i - 1]) bgN++;
        if (x < width - 1 && isBg[i + 1]) bgN++;
        if (y > 0 && isBg[i - width]) bgN++;
        if (y < height - 1 && isBg[i + width]) bgN++;
        if (bgN >= 2) out[i * 4 + 3] = featherAlpha;
      }
    }
  }

  for (let i = 0; i < n; i++) if (isBg[i]) out[i * 4 + 3] = 0;

  // ---- 4) 小岛清理：孤立前景连通域面积 < minIsland → 透明 ----
  if (minIsland > 0) {
    const islandSeen = new Uint8Array(n);
    const members = [];
    for (let start = 0; start < n; start++) {
      if (!out[start * 4 + 3] || islandSeen[start]) continue;
      members.length = 0;
      let head = 0;
      islandSeen[start] = 1;
      members.push(start);
      while (head < members.length) {
        const cur = members[head++];
        const cx = cur % width;
        const cy = (cur / width) | 0;
        const neighbors = [];
        if (cx > 0) neighbors.push(cur - 1);
        if (cx < width - 1) neighbors.push(cur + 1);
        if (cy > 0) neighbors.push(cur - width);
        if (cy < height - 1) neighbors.push(cur + width);
        for (const nb of neighbors) {
          if (out[nb * 4 + 3] && !islandSeen[nb]) {
            islandSeen[nb] = 1;
            members.push(nb);
          }
        }
      }
      if (members.length < minIsland) for (const idx of members) out[idx * 4 + 3] = 0;
    }
  }

  // ---- 5) 细笔画清理（复用小岛遍历，按 bbox 短边判） ----
  const th = Math.max(0, maxThin);
  if (maxThin > 0) {
    const thinSeen = new Uint8Array(n);
    const members = [];
    for (let start = 0; start < n; start++) {
      if (!out[start * 4 + 3] || thinSeen[start]) continue;
      members.length = 0;
      let head = 0;
      thinSeen[start] = 1;
      members.push(start);
      let mnX = width;
      let mxX = -1;
      let mnY = height;
      let mxY = -1;
      while (head < members.length) {
        const cur = members[head++];
        const cx = cur % width;
        const cy = (cur / width) | 0;
        if (cx < mnX) mnX = cx;
        if (cx > mxX) mxX = cx;
        if (cy < mnY) mnY = cy;
        if (cy > mxY) mxY = cy;
        const neighbors = [];
        if (cx > 0) neighbors.push(cur - 1);
        if (cx < width - 1) neighbors.push(cur + 1);
        if (cy > 0) neighbors.push(cur - width);
        if (cy < height - 1) neighbors.push(cur + width);
        for (const nb of neighbors) {
          if (out[nb * 4 + 3] && !thinSeen[nb]) {
            thinSeen[nb] = 1;
            members.push(nb);
          }
        }
      }
      if (Math.min(mxX - mnX + 1, mxY - mnY + 1) <= th) {
        for (const idx of members) out[idx * 4 + 3] = 0;
      }
    }
  }

  // ---- 统计 ----
  let opaque = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (out[i * 4 + 3] > 40) {
        opaque++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    width,
    height,
    rgba: out,
    stats: {
      bgRatio: +(bn / n).toFixed(3),
      opaqueRatio: +(opaque / n).toFixed(3),
      bbox: { minX, minY, maxX, maxY },
    },
  };
}

// ---------- CLI ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  const { pos, opts } = parseArgs(process.argv.slice(2));
  if (pos.length < 2) {
    console.error('用法：node cutout.mjs <in.png> <out.png> [--tol=34] [--hole-tol=26] [--feather=1]');
    process.exit(1);
  }
  const img = decodePng(pos[0]);
  const res = cutout(img, opts);
  encodePng(pos[1], res.width, res.height, res.rgba);
  console.log(`[cutout] ${pos[0]} → ${pos[1]}`, JSON.stringify(res.stats));
}
