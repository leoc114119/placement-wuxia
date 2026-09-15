// proto/battle_demo/tools/measure_face_dir.mjs —— 朝向判据实测（T31 FE 朝向整改的量化工具）
//
// 判据（与 PM 一致，逐项照抄口径）：
//   · 头部区域 = 人物 bbox 上部 1/3；
//   · 肤色像素：R>G>B 且 R−B 较大（暖色皮肤）；深色（头发）像素：亮度低且饱和低；
//   · 方向判据 = 肤重心 x − 发重心 x（像素）；>+2 ⇒ 脸朝右，<−2 ⇒ 脸朝左；
//   · 附加"前后"判据（用于区分 down/up 语义）：头部区域**肤色像素占比**（正面多、背面少）。
//
// 用法：
//   node proto/battle_demo/tools/measure_face_dir.mjs art                       # 量 2D 美术参照帧
//   node proto/battle_demo/tools/measure_face_dir.mjs png <文件…>               # 量任意 PNG
// 输出：每张图一行 JSON（dir / skinMinusHairX / skinRatio / headBox）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng } from '../cutout/png_codec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../..');

/** 单张 RGBA 图的朝向/前后判据。 */
export function measureFace(img, label = '') {
  const { width: w, height: h, rgba } = img;
  // ① 前景 bbox（alpha>8）
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { label, ok: false, reason: '空图（无 alpha>8 像素）' };
  // ② 头部区域 = bbox 上部 1/3
  const headBottom = minY + Math.max(1, Math.round((maxY - minY) / 3));
  let skinN = 0, skinSumX = 0, hairN = 0, hairSumX = 0;
  for (let y = minY; y <= headBottom; y++) {
    for (let x = minX; x <= maxX; x++) {
      const o = (y * w + x) * 4;
      const a = rgba[o + 3];
      if (a <= 8) continue;
      const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
      const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
      const sat = maxc === 0 ? 0 : (maxc - minc) / maxc;
      // 肤色：暖色且不太暗（R>G>B 且 R−B 明显）
      if (r > g && g >= b && r - b > 24 && maxc > 90) { skinN++; skinSumX += x; continue; }
      // 头发/深色：低亮度（含高饱和的深色也算头发）
      if (maxc < 110 && sat < 0.55) { hairN++; hairSumX += x; }
    }
  }
  const skinCx = skinN > 0 ? skinSumX / skinN : null;
  const hairCx = hairN > 0 ? hairSumX / hairN : null;
  const headPixels = (headBottom - minY + 1) * (maxX - minX + 1);
  return {
    label,
    ok: true,
    skinMinusHairX: skinCx !== null && hairCx !== null ? +(skinCx - hairCx).toFixed(1) : null,
    skinN,
    hairN,
    /** 头部区域内肤色像素占比（正面视角高、背面低）——用于区分 down/up 语义 */
    skinRatio: +(skinN / Math.max(1, headPixels)).toFixed(4),
    /** 只按前景像素算的肤色占比（更稳，不受 bbox 空白影响） */
    skinOfFg: +(skinN / Math.max(1, skinN + hairN)).toFixed(4),
    bbox: { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 },
    headBox: { minY, headBottom },
  };
}

const DIRS = ['left', 'leftdown', 'leftup', 'right', 'rightdown', 'rightup'];

function runArt() {
  const dir = path.join(REPO, 'assets/characters/hero/battle45');
  const out = [];
  for (const d of DIRS) {
    const f = path.join(dir, `battle_idle_${d}.png`);
    if (!fs.existsSync(f)) { out.push({ dir: d, ok: false, reason: '缺文件' }); continue; }
    out.push({ dir: d, ...measureFace(decodePng(f), d) });
  }
  for (const row of out) {
    console.log(JSON.stringify(row));
  }
}

/** 仅在作为 CLI 直接运行时执行（被 import 时只导出 measureFace）。 */
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'art') runArt();
  else if (mode === 'png') {
    for (const f of rest) console.log(JSON.stringify(measureFace(decodePng(f), path.basename(f))));
  } else {
    console.log('用法：measure_face_dir.mjs art | png <文件…>');
  }
}
