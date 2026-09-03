// D-13 热区标定测量（T20-FE · 修复方案 §4.2 建议入库）：ctrl 三钮 / plaque 两牌实体 bbox 复量，
// 供 config/battle-hex.ts CTRL_BUTTONS / PLAQUE_BUTTONS 落库值核定与素材迭代复用。
// 用法：node proto/battle_demo/cutout/measure_hotzones.mjs
// 口径（方案 §2.4 同源）：alpha>240 实体；
//   ctrl  = 行剖面（行实体数 > 半宽判钮行，间隙 >12px 分组）——满宽条带素材，bbox 即标定矩形；
//   plaque= 最长连续实体 run（牌有系绳孔收腰轮廓，全行计数会把孔两侧段合计而高估行宽——
//           T20-FE 复量实证：全行口径 maxRow 292 vs run 口径 273）；牌体行判据 = 最长 run >100（排除细绳）。
// 装饰件（顶部横杆/挂绳/流苏）仅打印不落热区——HIT-1「可点部件的实际图形」收窄解释（方案 §九-5）。
import { decodePng } from './png_codec.mjs';
const A = new URL('../../../assets/ui/pixel/battle/', import.meta.url).pathname;

// ---- ctrl_r_alpha：三钮行（alpha>240 行剖面分组） ----
const ct = decodePng(A + 'components/ctrl_r_alpha.png');
const rows = [];
for (let y = 0; y < ct.height; y++) {
  let c = 0, mnX = ct.width, mxX = -1;
  for (let x = 0; x < ct.width; x++) {
    if (ct.rgba[(y * ct.width + x) * 4 + 3] > 240) { c++; if (x < mnX) mnX = x; if (x > mxX) mxX = x; }
  }
  rows.push({ c, mnX, mxX });
}
const groups = [];
let g = null;
for (let y = 0; y < ct.height; y++) {
  if (rows[y].c > ct.width * 0.5) {
    if (!g) g = { y0: y, y1: y, mnX: rows[y].mnX, mxX: rows[y].mxX, minRowW: rows[y].c };
    else { g.y1 = y; g.mnX = Math.min(g.mnX, rows[y].mnX); g.mxX = Math.max(g.mxX, rows[y].mxX); g.minRowW = Math.min(g.minRowW, rows[y].c); }
  } else if (g && y - g.y1 > 12) { groups.push(g); g = null; }
}
if (g) groups.push(g);
console.log('ctrl img =', ct.width + 'x' + ct.height);
console.log('ctrl buttons(a>240) =', JSON.stringify(groups.map((o) => ({ x: o.mnX, y: o.y0, w: o.mxX - o.mnX + 1, h: o.y1 - o.y0 + 1, minRowW: o.minRowW }))));
console.log('  ↳ 落库对照 config CTRL_BUTTONS（方案 §4.2 参考值收安全边 x:5 w:216/213/213；行 y/h 应与实测一致）');

// ---- plaque_l_alpha：两牌体带（最长连续实体 run 口径）+ 装饰件 ----
const pl = decodePng(A + 'components/plaque_l_alpha.png');
const runs = [];
for (let y = 0; y < pl.height; y++) {
  let best = 0, bx0 = -1, bx1 = -1, run = 0, x0 = 0;
  for (let x = 0; x < pl.width; x++) {
    if (pl.rgba[(y * pl.width + x) * 4 + 3] > 240) {
      if (run === 0) x0 = x;
      run++;
      if (run > best) { best = run; bx0 = x0; bx1 = x; }
    } else run = 0;
  }
  runs.push({ best, bx0, bx1 });
}
const isBody = (r) => r.best > 100; // 牌体行（排除细绳/流苏行）
const MIN_BAND_H = 50; // 牌体带最小高度：排除横杆（h≈4）与牌间绳结/扣件（h≈7）等装饰短带（T20-FE 实测 4 带结构）
const bands = [];
let b = null;
for (let y = 0; y < pl.height; y++) {
  if (isBody(runs[y])) {
    if (!b) b = { y0: y, y1: y, mnX: runs[y].bx0, mxX: runs[y].bx1 };
    else { b.y1 = y; b.mnX = Math.min(b.mnX, runs[y].bx0); b.mxX = Math.max(b.mxX, runs[y].bx1); }
  } else if (b && y - b.y1 > 12) { bands.push(b); b = null; }
}
if (b) bands.push(b);
const bodyBands = bands.filter((o) => o.y1 - o.y0 + 1 >= MIN_BAND_H);
const decorBands = bands.filter((o) => o.y1 - o.y0 + 1 < MIN_BAND_H);
console.log('plaque img =', pl.width + 'x' + pl.height);
const named = bodyBands.map((o) => ({ x: o.mnX, y: o.y0, w: o.mxX - o.mnX + 1, h: o.y1 - o.y0 + 1,
  yRatio: +(o.y0 / pl.height).toFixed(4), hRatio: +((o.y1 - o.y0 + 1) / pl.height).toFixed(4) }));
console.log('plaque body bands(run>100 ∧ h>=' + MIN_BAND_H + ') =', JSON.stringify(named));
console.log('decor bands（装饰件，不设热区） =', JSON.stringify(decorBands.map((o) => ({ x: o.mnX, y: o.y0, w: o.mxX - o.mnX + 1, h: o.y1 - o.y0 + 1 }))));
if (named.length === 2) {
  console.log('  ↳ 牌1/牌2 带如上；x/w 落库对照方案 §4.2 参考值 {x:26,w:273}（可点主体；侧穗/透明边不设热区）；y/hRatio 沿 config 现值（牌面占比 0.26/0.55、0.21，含收腰段）');
} else {
  console.log('  ↳ 牌体带数异常（素材迭代？）：请人工核对阈值 run>100 ∧ h>=' + MIN_BAND_H);
}
