// proto/battle_demo/tools/measure_facing_runtime.mjs —— 运行时六向「脸朝哪边」实测（T31 FE 朝向整改）
//
// 为什么要它：朝向问题的判据必须是**可复现的量**，而不是"看着不对"。本脚本在真实 demo 里
// 逐向取「人物层裁剪图」（3D 离屏画布裁剪 + 纯色底），再用统一判据量：
//   · 判据（与 PM 一致）：头部区域（bbox 上部 1/3）内「肤重心 x − 发重心 x」；
//     标定：美术 2D 参照 battle_idle_left = −29.9 / right = +29.9（同判据实测，见 measure_face_dir.mjs art）。
//   · 附加：肤色占比（正面高 / 背面低）用于区分 up/down 语义。
// 标签可信：每向都读**会话快照里的真值 facingHex**（不是脚本自己的入参），并记录当时的 yaw 公式值。
//
// 【T31-R2 · R2-3】判据改**归一化**（n = skinMinusHairX ÷ 前景 bbox 宽，阈 ±0.05）：对人物显示比例缩放不变；
//   裁剪坐标统一乘 dpr（BUG-20250915-38），并对空裁剪做前置失败断言（exit 1）。
// 用法：node proto/battle_demo/tools/measure_facing_runtime.mjs [--dsf=2] [--pad=10]
// 产出：proto/battle_demo/shots/face_<facing>.png + stdout 每向一行 JSON（含 actualFacingHex/yawDeg）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../cutout/png_codec.mjs';
import { measureFace } from './measure_face_dir.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'shots');
fs.mkdirSync(outDir, { recursive: true });

const arg = (n, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith('--' + n + '='));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const DSF = +arg('dsf', '2');
const PAD = +arg('pad', '10');

const FACINGS = ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown'];
const FACING_VEC = {
  right: { q: 1, r: 0 },
  rightup: { q: 1, r: -1 },
  leftup: { q: 0, r: -1 },
  left: { q: -1, r: 0 },
  leftdown: { q: -1, r: 1 },
  rightdown: { q: 0, r: 1 },
};
/** 当前 config 的 yaw 公式（整改前：270 − V；整改后应为 V）。仅用于报告对照，不参与渲染。 */
const SOURCE_VIEW_YAW = { right: 270, rightup: 315, leftup: 45, left: 90, leftdown: 135, rightdown: 225 };
const normalizeSigned = (d) => { let v = d % 360; if (v > 180) v -= 360; else if (v <= -180) v += 360; return v; };
const YAW_MODE = arg('yawmode', 'current');
/** `--gate=1`：跑完六向量测后按 RPG 语义断言（不过则 exit 1），作为朝向回归门。 */
const GATE = arg('gate', '0') === '1';
const yawOf = (f) => (YAW_MODE === 'identity'
  ? normalizeSigned(SOURCE_VIEW_YAW[f])
  : normalizeSigned(270 - SOURCE_VIEW_YAW[f]));

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage({ viewport: { width: 560, height: 700 }, deviceScaleFactor: DSF });
await page.goto('file://' + path.join(here, '..', 'index.html'));
await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 20000 });
await page.waitForFunction(() => window.__demo.assetsReady === true, null, { timeout: 60000 });
await page.waitForTimeout(400);

const setHero = (fields) => page.evaluate(([f]) => {
  const u = window.__demo.session._debug.units.find((x) => x.id === 'hero');
  Object.assign(u, f);
  for (const uu of window.__demo.session._debug.units) { uu.bar = 0; uu.barWasMax = false; }
}, [fields]);

/** 取「人物层裁剪图」（纯色底）+ 同帧诊断（真值 facingHex / placed）。
 * ★【BUG-20250915-38】坐标空间：`placed` 是**逻辑像素**（生产侧已除过一次 pixelRatio），
 *   而 `window.__char3d.canvas` 是**物理像素**背衬 ⇒ 裁剪前必须统一 × dpr；否则 --dsf≥2 时
 *   裁剪窗落在空区（历史缺陷：前景像素 n=0、全绿底，会给出「判据无值」的假失败）。 */
const cropLayer = (facing) => page.evaluate(([pad]) => {
  const gl = window.__char3d.canvas;
  const pl = window.__demo.character3d.placed?.get('hero');
  const h = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
  if (!pl) return { ok: false, facingHex: h ? h.facingHex : null };
  const k = window.__demo.dpr || 1; // 背衬/逻辑 像素比（与 3D 命令坐标同一换算，禁各自估）
  const cx = pl.cx * k;
  const top = pl.top * k;
  const w = pl.w * k;
  const hh = pl.h * k;
  const x0 = Math.max(0, Math.round(cx - w / 2 - pad * k));
  const y0 = Math.max(0, Math.round(top - pad * k));
  const cw = Math.min(gl.width - x0, Math.round(w + pad * 2 * k));
  const ch = Math.min(gl.height - y0, Math.round(hh + pad * 2 * k));
  const t = document.createElement('canvas');
  t.width = cw; t.height = ch;
  const tc = t.getContext('2d');
  tc.fillStyle = '#00ff00'; // 纯色底（度量 bbox 用「≠底色」判定，无需 alpha）
  tc.fillRect(0, 0, cw, ch);
  tc.drawImage(gl, x0, y0, cw, ch, 0, 0, cw, ch);
  return { ok: true, facingHex: h ? h.facingHex : null, placed: pl, dpr: k, dataUrl: t.toDataURL('image/png'), w: cw, h: ch };
}, [PAD]);

/** 裁剪窗内前景像素数（≠ 纯色底）：0 ⇒ 裁剪落空区（坐标空间/口径错），必须**响亮失败**。 */
function foregroundCount(img) {
  const { width: w, height: h, rgba } = img;
  const bg = [rgba[0], rgba[1], rgba[2]];
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (Math.abs(rgba[o] - bg[0]) + Math.abs(rgba[o + 1] - bg[1]) + Math.abs(rgba[o + 2] - bg[2]) > 40) n++;
    }
  }
  return n;
}

const rows = [];
for (const facing of FACINGS) {
  await setHero({ hexFacing: FACING_VEC[facing], animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1 });
  await page.waitForTimeout(220);
  const crop = await cropLayer(facing);
  if (!crop.ok) { rows.push({ intended: facing, ok: false }); continue; }
  const file = path.join(outDir, `face_${facing}.png`);
  fs.writeFileSync(file, Buffer.from(crop.dataUrl.split(',')[1], 'base64'));
  rows.push({ ok: true, intended: facing, actualFacingHex: crop.facingHex, yawDeg: yawOf(crop.facingHex), file });
}
await browser.close();

const measured = [];
for (const r of rows) {
  if (!r.ok || !r.file) { console.log(JSON.stringify(r)); continue; }
  const img = decodePng(r.file);
  // ★ 前置断言（BUG-20250915-38）：空裁剪必须响亮失败，禁把「裁到空区」静默成「判据无值」
  const fg = foregroundCount(img);
  if (fg <= 0) {
    console.error(`[measure_facing_runtime] ❌ 裁剪窗内前景像素为 0（${r.intended}）：裁剪区落在空区（坐标空间/口径错）`);
    process.exit(1);
  }
  const m = measureFaceBboxFromBackdrop(img);
  const row = {
    intended: r.intended,
    actualFacingHex: r.actualFacingHex,
    yawDeg: r.yawDeg,
    ...m,
    file: path.basename(r.file),
  };
  measured.push(row);
  console.log(JSON.stringify(row));
}

// ── 朝向回归门（`--gate`）：RPG 六向语义逐条断言；任一不过 exit 1 ──
if (GATE) {
  const byFacing = new Map(measured.map((m) => [m.actualFacingHex, m]));
  const problems = [];
  for (const r of measured) {
    if (r.actualFacingHex !== r.intended) problems.push(`标签不符：intended=${r.intended} actual=${r.actualFacingHex}`);
    const left = r.intended.startsWith('left');
    // 【T31-R2 · R2-3】归一化判据：n = 肤−发重心差 ÷ 前景 bbox 宽（对显示比例缩放不变）；
    // left* n ≤ −0.05 / right* n ≥ +0.05（绝对像素 ±2 口径在人物缩到 60% 后已失效，见 measure_face_dir 标定）
    if (typeof r.skinMinusHairXN !== 'number') { problems.push(`${r.intended} 归一化判据无值`); continue; }
    if (left && !(r.skinMinusHairXN <= -0.05)) problems.push(`${r.intended} n=${r.skinMinusHairXN} 未 ≤ −0.05（应朝左）`);
    if (!left && !(r.skinMinusHairXN >= 0.05)) problems.push(`${r.intended} n=${r.skinMinusHairXN} 未 ≥ +0.05（应朝右）`);
    // 前后语义（辅助）：down = 朝观众（肤占比高）、up = 背向（低）
    if (r.intended.endsWith('down') && byFacing.get(r.intended.replace('down', 'up'))) {
      const up = byFacing.get(r.intended.replace('down', 'up'));
      if (!(r.skinOfFg > up.skinOfFg)) {
        problems.push(`${r.intended} 肤占比 ${r.skinOfFg} 未高于 ${up.intended} ${up.skinOfFg}（down 应更"朝观众"）`);
      }
    }
  }
  // 左右镜像：同名左右向的判据幅度应大体成镜像（比值 0.5~2）
  for (const d of ['leftdown', 'leftup', 'left']) {
    const l = byFacing.get(d), rr = byFacing.get(d.replace('left', 'right'));
    if (l && rr && typeof l.skinMinusHairXN === 'number' && typeof rr.skinMinusHairXN === 'number') {
      const ratio = Math.abs(rr.skinMinusHairXN) / Math.max(1e-6, Math.abs(l.skinMinusHairXN));
      if (!(ratio > 0.4 && ratio < 2.5)) problems.push(`${d}/${d.replace('left', 'right')} 幅度不成镜像（比值 ${ratio.toFixed(2)}）`);
    }
  }
  if (problems.length) {
    console.error('\n[朝向回归门] ❌ FAIL：');
    for (const p of problems) console.error('  · ' + p);
    process.exit(1);
  }
  console.log('\n[朝向回归门] ✅ PASS：六向判据符号 + 前后语义 + 左右镜像全过（' + measured.length + ' 向）');
}

/** 纯色底裁剪图：bbox = 与底色差异明显的像素；随后复用 measureFace 的判据。 */
function measureFaceBboxFromBackdrop(img) {
  const { width: w, height: h, rgba } = img;
  const bg = [rgba[0], rgba[1], rgba[2]];
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const d = Math.abs(rgba[o] - bg[0]) + Math.abs(rgba[o + 1] - bg[1]) + Math.abs(rgba[o + 2] - bg[2]);
      if (d > 40) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { ok: false, reason: '空图' };
  // 复用 measureFace：把 bbox 外涂成 alpha=0，让它的 alpha 判定取到同一 bbox
  const copy = new Uint8Array(rgba);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
      const bgLike = Math.abs(rgba[o] - bg[0]) + Math.abs(rgba[o + 1] - bg[1]) + Math.abs(rgba[o + 2] - bg[2]) <= 40;
      if (!inside || bgLike) copy[o + 3] = 0;
    }
  }
  const m = measureFace({ width: w, height: h, rgba: copy });
  return { ok: true, ...m, headBox: m.headBox, bbox: m.bbox };
}
