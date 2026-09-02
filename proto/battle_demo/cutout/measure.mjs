// 标定测量：topbar 条槽/图标槽位、ctrl 三钮行、v8 组件屏占比 → config/battle-hex.ts 校准值
import { decodePng } from './png_codec.mjs';
const A = '../../../assets/ui/pixel/battle/';

// ---- topbar：红/蓝条与图标槽 bbox ----
const tb = decodePng(A + 'components/topbar.png');
function bbox(img, pred, x0 = 0, y0 = 0, x1 = img.width, y1 = img.height) {
  let mnX = x1, mnY = y1, mxX = -1, mxY = -1, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.width + x) * 4;
    if (pred(img.rgba[i], img.rgba[i + 1], img.rgba[i + 2])) {
      n++;
      if (x < mnX) mnX = x; if (x > mxX) mxX = x;
      if (y < mnY) mnY = y; if (y > mxY) mxY = y;
    }
  }
  return n > 50 ? { x: mnX, y: mnY, w: mxX - mnX + 1, h: mxY - mnY + 1, n } : null;
}
const redBar = bbox(tb, (r, g, b) => r > 140 && g < 80 && b < 80, 300, 40, 900, 150);
const blueBar = bbox(tb, (r, g, b) => b > 140 && r < 90 && g < 130, 300, 130, 900, 220);
console.log('topbar redBar =', JSON.stringify(redBar));
console.log('topbar blueBar =', JSON.stringify(blueBar));
// 图标槽：金色边框方块（亮金像素）在下半区
const goldIcon = bbox(tb, (r, g, b) => r > 150 && g > 110 && b < 110, 300, 195, 760, 300);
console.log('topbar iconRow(gold-ish) =', JSON.stringify(goldIcon));
// 顶栏本体高度：从顶部向下找最后一行含木色（棕）像素
let bodyBottom = 0;
for (let y = 0; y < tb.height; y++) {
  let c = 0;
  for (let x = 0; x < tb.width; x++) {
    const i = (y * tb.width + x) * 4;
    const r = tb.rgba[i], g = tb.rgba[i + 1], b = tb.rgba[i + 2];
    if (r > 90 && r > b + 30 && g > 50 && g < r) c++;
  }
  if (c > tb.width * 0.5) bodyBottom = y;
}
console.log('topbar bodyBottom =', bodyBottom, '/', tb.height);

// ---- ctrl_r_alpha：三钮行（alpha 行剖面分组） ----
const ct = decodePng(A + 'components/ctrl_r_alpha.png');
const rows = [];
for (let y = 0; y < ct.height; y++) {
  let c = 0, mnX = ct.width, mxX = -1;
  for (let x = 0; x < ct.width; x++) {
    if (ct.rgba[(y * ct.width + x) * 4 + 3] > 40) { c++; if (x < mnX) mnX = x; if (x > mxX) mxX = x; }
  }
  rows.push({ c, mnX, mxX });
}
const groups = [];
let g = null;
for (let y = 0; y < ct.height; y++) {
  if (rows[y].c > ct.width * 0.5) {
    if (!g) g = { y0: y, y1: y, mnX: rows[y].mnX, mxX: rows[y].mxX };
    else { g.y1 = y; g.mnX = Math.min(g.mnX, rows[y].mnX); g.mxX = Math.max(g.mxX, rows[y].mxX); }
  } else if (g && y - g.y1 > 12) { groups.push(g); g = null; }
}
if (g) groups.push(g);
console.log('ctrl button rows =', JSON.stringify(groups.map(o => ({ y: o.y0, h: o.y1 - o.y0 + 1, x: o.mnX, w: o.mxX - o.mnX + 1 }))));

// ---- plaque_l_alpha 内容 bbox ----
const pl = decodePng(A + 'components/plaque_l_alpha.png');
const pbb = bbox(pl, (r, g2, b, i) => pl.rgba[i + 3] > 40);
console.log('plaque opaque bbox =', JSON.stringify(pbb), 'img', pl.width + 'x' + pl.height);

// ---- battle_v8：组件屏占比（1440×2560） ----
const v8 = decodePng(A + 'raw/battle_v8.png');
// 顶栏本体高（含边框）：扫描中间列 x=720 木色行
let v8Top = 0;
for (let y = 0; y < 400; y++) {
  const i = (y * v8.width + 720) * 4;
  const r = v8.rgba[i], g2 = v8.rgba[i + 1], b = v8.rgba[i + 2]; void g2;
  if (r > 90 && r > b + 30) v8Top = y;
}
console.log('v8 topbar bodyBottom(y) =', v8Top, '→ hRatio =', (v8Top / 2560).toFixed(4));
// v8 左牌：区域 x 0..260, y 200..620 找木牌金字
const v8Plq = bbox(v8, (r, g2, b) => r > 90 && r > b + 30, 0, 200, 260, 640);
console.log('v8 plaque region =', JSON.stringify(v8Plq), '→ wRatio =', (v8Plq ? v8Plq.w / 1440 : 0).toFixed(4), 'yRatio =', (v8Plq ? v8Plq.y / 2560 : 0).toFixed(4));
// v8 右下按钮：x 1150..1440, y 1950..2500
const v8Ctrl = bbox(v8, (r, g2, b) => r > 90 && r > b + 30, 1150, 1950, 1440, 2500);
console.log('v8 ctrl region =', JSON.stringify(v8Ctrl), '→ wRatio =', (v8Ctrl ? v8Ctrl.w / 1440 : 0).toFixed(4), 'xRatio =', (v8Ctrl ? v8Ctrl.x / 1440 : 0).toFixed(4), 'yRatio =', (v8Ctrl ? v8Ctrl.y / 2560 : 0).toFixed(4));
// v8 六边形尺寸抽验：找一格顶面亮绿跨度（y=1200 行上绿色 run）
let run = 0, runs = [];
for (let x = 300; x < 1140; x++) {
  const i = (1200 * v8.width + x) * 4;
  const r = v8.rgba[i], g2 = v8.rgba[i + 1], b = v8.rgba[i + 2]; void g2;
  if (g2 > 90 && g2 > r + 20 && g2 > b + 20) run++;
  else { if (run > 30) runs.push(run); run = 0; }
}
if (run > 30) runs.push(run);
console.log('v8 hex green runs@y1200 =', JSON.stringify(runs));
