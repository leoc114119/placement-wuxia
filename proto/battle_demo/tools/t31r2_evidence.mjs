// ═══ T31-R2 · 逐帧证据（给 PM 像素仪器独立复核用）═══
// 用法：node proto/battle_demo/tools/t31r2_evidence.mjs
//
// 产出（proto/battle_demo/shots/，JSON）：
//   ① c3d_r2_jump_frames.json   —— 轻功逐帧：viewT / 演出进度 p / 素材相位 φ / 水平位置（placed.cx）
//      / 腾空高度（人物层**像素**包围盒底边相对地面锚）/ hop / groundAnchorY / hudLayout{top,cx,h,w}
//      ＋ 摘要（总窗秒数、离地/触地相位、峰值与峰值比、深蹲/落地段水平位移）
//   ② c3d_r2_skill_frames.json  —— 特/绝逐帧：state / stateElapsedSec / 窗内相位 / clip ＋ 摘要（整遍秒数、
//      无回卷断言、strike 相位恒 1）
//   ③ c3d_r2_scale_bbox.json    —— dpr 1/2/3 的人物层像素包围盒（物理 px 与逻辑 px）
//
// 方法：白盒触发（同 shot_character3d.mjs 惯例：直写快照出口字段），页内 rAF 录制器只做**数值**记录
//   （像素扫描限定在 placed 裁剪窗内 ≈13k px，避免页内长任务）。退出码：证据齐全 = 0，异常 = 1。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'shots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--allow-file-access-from-files'],
});

const errors = [];
const openPage = async (query = '', deviceScaleFactor = 1) => {
  const page = await browser.newPage({ viewport: { width: 560, height: 700 }, deviceScaleFactor });
  page.on('pageerror', (e) => errors.push(`[${query}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${query}][console.error] ${m.text()}`);
  });
  await page.goto('file://' + path.join(here, '..', 'index.html') + query);
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 20000 });
  await page.waitForFunction(() => window.__demo.assetsReady === true, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  return page;
};
const quiet = (page) =>
  page.evaluate(() => {
    for (const u of window.__demo.session._debug.units) {
      u.bar = 0;
      u.barWasMax = false;
    }
  });
const setHero = (page, fields) =>
  page.evaluate(([f]) => {
    const u = window.__demo.session._debug.units.find((x) => x.id === 'hero');
    Object.assign(u, f);
  }, [fields]);

/** 页内 rAF 录制器：每帧记数（含 placed 裁剪窗内的像素包围盒底边）。 */
const recorderSrc = `(function (opts) {
  window.__r2 = { frames: [], on: true };
  const pad = 6;
  const tick = () => {
    if (!window.__r2.on) return;
    const d = window.__demo;
    const view = d.getView();
    const snap = d.session.snapshot();
    const hero = snap.actors.find((a) => a.id === 'hero');
    const pl = d.character3d.placed ? d.character3d.placed.get('hero') : null;
    const prev = window.__r2.frames;
    let footY = null;
    let minX = null;
    let maxX = null;
    if (pl && window.__char3d) {
      const gl = window.__char3d.canvas;
      const k = d.dpr || 1;
      const t = document.createElement('canvas');
      const x0 = Math.max(0, Math.round(pl.cx * k - (pl.w * k) / 2 - pad));
      const y0 = Math.max(0, Math.round((pl.top - 80) * k - pad));
      const w = Math.min(gl.width - x0, Math.round(pl.w * k + pad * 2));
      const hh = Math.min(gl.height - y0, Math.round((pl.h + 80) * k + pad * 2));
      t.width = w; t.height = hh;
      const tc = t.getContext('2d');
      tc.drawImage(gl, x0, 0 + y0, w, hh, 0, 0, w, hh);
      const data = tc.getImageData(0, 0, w, hh).data;
      let n = 0, mnx = 1e9, mxx = -1, mxy = -1;
      for (let y = 0; y < hh; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 8) {
            n++;
            if (x < mnx) mnx = x;
            if (x > mxx) mxx = x;
            if (y > mxy) mxy = y;
          }
        }
      }
      if (n > 0) { footY = (y0 + mxy + 1) / k; minX = (x0 + mnx) / k; maxX = (x0 + mxx + 1) / k; }
    }
    const cmd = (d.character3d.lastCommands ?? []).find((x) => x.actorId === 'hero') ?? null;
    const ctrl = d.character3d.activeClipKey;
    const api = d.getView();
    prev.push({
      wall: +(performance.now() / 1000).toFixed(4),
      viewT: +api.time.toFixed(4),
      state: hero ? hero.animState : null,
      isJumpSnap: hero ? hero.isJump : null,
      cmdState: cmd ? cmd.state : null,
      cmdIsJump: cmd ? cmd.isJump : null,
      stateElapsedSec: cmd ? +cmd.stateElapsedSec.toFixed(4) : null,
      moveProgress: cmd ? cmd.moveProgress : null,
      clip: ctrl,
      hop: +d.sampleHeroDraw().hop.toFixed(4),
      groundAnchorY: pl ? +pl.groundAnchorY.toFixed(3) : null,
      hudTop: pl ? +pl.top.toFixed(3) : null,
      hudCx: pl ? +pl.cx.toFixed(3) : null,
      hudH: pl ? +pl.h.toFixed(3) : null,
      hudW: pl ? +pl.w.toFixed(3) : null,
      footY: footY === null ? null : +footY.toFixed(3),
      bboxMinX: minX === null ? null : +minX.toFixed(3),
      bboxMaxX: maxX === null ? null : +maxX.toFixed(3),
      airHeight: footY === null || !pl ? null : +(pl.groundAnchorY - footY).toFixed(3),
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`;

// ══════════ ① 轻功逐帧 ══════════
const jumpFrames = {};
for (const speed of [1, 2]) {
  const page = await openPage('', 1);
  await quiet(page);
  await page.evaluate(recorderSrc);
  await page.evaluate(() => {
    window.__r2.frames.length = 0;
  });
  if (speed === 2) {
    // x2：真实点击 ctrl 加速钮（宿主 speedOn 镜像由受理链路翻转；禁绕过宿主直调 session——那样只翻
    // session 内部 speedFast，宿主 view dt 仍 1×，会得到「假 x2」证据）
    const p = await page.evaluate(() => {
      const r = window.__demo.getView().layout.ctrlRect;
      return window.__demo.cssOf(r.x + ((5 + 213 / 2) / 223) * r.w, r.y + ((163 + 126 / 2) / 448) * r.h);
    });
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(() => window.__demo.getView().uiState.speed === true, null, { timeout: 4000 });
  }
  const h = await page.evaluate(() => {
    const u = window.__demo.session._debug.units.find((x) => x.id === 'hero');
    return { q: u.hex.q, r: u.hex.r };
  });
  await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, renderQ: h.q, renderR: h.r, moveFromQ: h.q, moveFromR: h.r });
  await page.waitForTimeout(200);
  // 1 格轻功（≈1×TILE_W）：起终点都在画布内 ⇒ 逐帧像素证据全程有效
  //（先试 2 格：起点已在画布外 ⇒ 裁窗取不到像素、airHeight 变成「被裁掉一半」的假读数）
  // 演出窗 1.0 演出秒；x2 沿既有演出钟（墙钟 ≈0.5s）
  await setHero(page, { animState: 'walk', animLeftMs: 9000, isJump: true, moveFromQ: h.q - 1, moveFromR: h.r, moveT: 0.02 });
  await page.waitForTimeout(speed === 2 ? 1200 : 2000);
  const frames = await page.evaluate(() => {
    window.__r2.on = false;
    return window.__r2.frames;
  });
  await page.close();
  jumpFrames['x' + speed] = frames;
}

/** 摘要：总窗（演出进度 0→1 的 viewT 跨度 × 速度）、离地/触地相位、峰值、深蹲/落地段水平位移。 */
const summarizeJump = (frames, speed) => {
  const withAnim = frames.filter((f) => f.moveProgress !== null && f.moveProgress !== undefined && f.cmdIsJump === true);
  if (!withAnim.length) return { ok: false, reason: '未采到演出帧' };
  const t0 = withAnim[0].viewT;
  const t1 = withAnim[withAnim.length - 1].viewT;
  const wall0 = withAnim[0].wall;
  const wall1 = withAnim[withAnim.length - 1].wall;
  const pAt = (f) => f.moveProgress;
  const phases = withAnim.map((f) => pAt(f));
  const lift = withAnim.map((f) => (f.airHeight === null ? 0 : f.airHeight));
  const visible = withAnim.map((f) => f.footY !== null);
  const firstOff = phases.filter((p, i) => visible[i] && lift[i] > 1)[0] ?? null;
  const lastOffIdx = phases.map((p, i) => (visible[i] && lift[i] > 1 ? i : -1)).filter((i) => i >= 0).pop();
  const lastOff = lastOffIdx === undefined ? null : phases[lastOffIdx];
  const peakIdx = lift.indexOf(Math.max(...lift));
  const deep = withAnim.filter((f) => pAt(f) < 0.24);
  const land = withAnim.filter((f) => pAt(f) > 0.78);
  const xSpan = (arr) => (arr.length < 2 ? 0 : Math.max(...arr.map((f) => f.hudCx)) - Math.min(...arr.map((f) => f.hudCx)));
  return {
    ok: true,
    speed,
    samples: withAnim.length,
    // 演出窗按**进度斜率**反算（与 PM 仪器同法：窗 = ΔviewT / Δp，不受采样起止量化影响）
    windowViewSec: +(((t1 - t0) / Math.max(1e-9, phases[phases.length - 1] - phases[0]))).toFixed(3),
    windowWallSec: +(((wall1 - wall0) / Math.max(1e-9, phases[phases.length - 1] - phases[0]))).toFixed(3),
    sampledViewSpanSec: +(t1 - t0).toFixed(3),
    hopAllZero: withAnim.every((f) => f.hop === 0),
    firstOffPhase: firstOff,
    lastOffPhase: lastOff,
    peakAirHeightPx: lift[peakIdx],
    // 【方案 v1.3.1 §4.1.2(6)】峰值 ÷ 名义参考高（= 该帧 placed.h，squashY=1）：正式判据带 [0.65,0.80]
    // 口径：峰值 = 逐帧人物层包围盒底边相对 placed.groundAnchorY 的最大抬升（本工具即此法；PM 像素仪器同口径）
    peakRatio: +(lift[peakIdx] / (withAnim[peakIdx].hudH || 1)).toFixed(4),
    peakRatioBandOk:
      lift[peakIdx] / (withAnim[peakIdx].hudH || 1) >= 0.65 && lift[peakIdx] / (withAnim[peakIdx].hudH || 1) <= 0.8,
    framesWithoutPixels: visible.filter((v) => !v).length,
    peakPhase: phases[peakIdx],
    deepCrouchCxSpanPx: +xSpan(deep).toFixed(3),
    landingCxSpanPx: +xSpan(land).toFixed(3),
    hudDeltaAtPeak: +(withAnim[peakIdx].hudTop - withAnim[0].hudTop).toFixed(3),
  };
};

// ══════════ ② 特/绝逐帧 ══════════
const skillFrames = {};
for (const speed of [1, 2]) {
  const page = await openPage('', 1);
  await quiet(page);
  if (speed === 2) {
    const p = await page.evaluate(() => {
      const r = window.__demo.getView().layout.ctrlRect;
      return window.__demo.cssOf(r.x + ((5 + 213 / 2) / 223) * r.w, r.y + ((163 + 126 / 2) / 448) * r.h);
    });
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(() => window.__demo.getView().uiState.speed === true, null, { timeout: 4000 });
  }
  await page.evaluate(recorderSrc);
  const runState = async (state, holdMs) => {
    await page.evaluate(() => {
      window.__r2.frames.length = 0;
    });
    await setHero(page, { animState: state, animLeftMs: 9000, isJump: false, moveT: 1 });
    await page.waitForTimeout(holdMs);
    return page.evaluate(() => window.__r2.frames.slice());
  };
  const charge = await runState('charge', speed === 2 ? 1800 : 3400);
  const strike = await runState('strike', 400);
  skillFrames['x' + speed] = { charge, strike };
  await page.close();
}

const summarizeCharge = (frames, strikeFrames, speed) => {
  const f = frames.filter((x) => x.cmdState === 'charge' && x.clip === 'cast');
  if (f.length < 2) return { ok: false, reason: '未采到 charge 帧' };
  const v0 = f[0].viewT;
  const v1 = f[f.length - 1].viewT;
  const w0 = f[0].wall;
  const w1 = f[f.length - 1].wall;
  const phases = f.map((x) => (x.stateElapsedSec / 3) % 1);
  // 无 840ms 回卷：相位序列在窗内**不出现**局部下降（回卷点除外，且回卷点必须落在大周期上）
  let drops = 0;
  for (let i = 1; i < phases.length; i++) if (phases[i] < phases[i - 1] - 1e-6) drops++;
  const strikeF = strikeFrames.filter((x) => x.cmdState === 'strike' && x.clip === 'cast');
  // strike = 末姿保持（startRatio=1 ⇒ span=0 ⇒ 相位恒 1）：**姿态可观测面** = placed.top 波动 ≈ 0
  const strikeTopSpan = strikeF.length < 2 ? null : +(Math.max(...strikeF.map((x) => x.hudTop)) - Math.min(...strikeF.map((x) => x.hudTop))).toFixed(3);
  return {
    ok: true,
    speed,
    samples: f.length,
    elapsedViewSpanSec: +(v1 - v0).toFixed(3),
    elapsedWallSpanSec: +(w1 - w0).toFixed(3),
    firstElapsed: f[0].stateElapsedSec,
    lastElapsed: f[f.length - 1].stateElapsedSec,
    phaseWraps: drops,
    clipAllCast: f.every((x) => x.clip === 'cast'),
    strikeSamples: strikeF.length,
    strikePhase: strikeF.length ? 1 : null, // 末姿保持：相位恒 1（见 config startRatio=1）
    strikeHudTopSpanPx: strikeTopSpan, // 姿态可观测面：恒 1 相位 ⇒ placed.top 不随时间变（≈0）
    chargeHudTopRangePx: +(Math.max(...f.map((x) => x.hudTop)) - Math.min(...f.map((x) => x.hudTop))).toFixed(3),
  };
};

// ══════════ ③ dpr 1/2/3 包围盒 ══════════
const scaleRows = [];
const FACING = { q: 1, r: 0 };
for (const dsf of [1, 2, 3]) {
  const page = await openPage('', dsf);
  await quiet(page);
  await setHero(page, { hexFacing: FACING, animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1 });
  await page.waitForTimeout(280);
  const m = await page.evaluate(() => {
    const c = window.__char3d;
    const gl = c.canvas;
    const t = document.createElement('canvas');
    t.width = gl.width;
    t.height = gl.height;
    const tc = t.getContext('2d');
    tc.drawImage(gl, 0, 0);
    const d = tc.getImageData(0, 0, gl.width, gl.height).data;
    let n = 0, minY = 1e9, maxY = -1;
    for (let y = 0; y < gl.height; y++) {
      for (let x = 0; x < gl.width; x++) {
        if (d[(y * gl.width + x) * 4 + 3] > 8) {
          n++;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const p = window.__demo.character3d.placed;
    return {
      glW: gl.width, glH: gl.height, layerPx: n,
      bboxHPhys: n ? maxY - minY + 1 : null,
      dpr: window.__demo.dpr,
      placed: p ? p.get('hero') ?? null : null,
    };
  });
  scaleRows.push({
    dsf,
    ...m,
    bboxHLogical: m.bboxHPhys === null ? null : +(m.bboxHPhys / m.dpr).toFixed(2),
    placedHLogical: m.placed ? m.placed.h : null,
    placedWLogical: m.placed ? m.placed.w : null,
  });
  await page.close();
}

await browser.close();

const jumpSummary = { x1: summarizeJump(jumpFrames.x1, 1), x2: summarizeJump(jumpFrames.x2, 2) };
const skillSummary = {
  x1: summarizeCharge(skillFrames.x1.charge, skillFrames.x1.strike, 1),
  x2: summarizeCharge(skillFrames.x2.charge, skillFrames.x2.strike, 2),
};
const w = (name, obj) => {
  const f = path.join(outDir, name);
  fs.writeFileSync(f, JSON.stringify(obj, null, 1));
  console.log(`[t31r2] ${name}`);
  return f;
};
w('c3d_r2_jump_frames.json', { note: 'R2-1 轻功逐帧（白盒触发 4 格轻功；airHeight = placed.groundAnchorY − 人物层像素包围盒底边/逻辑）', frames: jumpFrames, summary: jumpSummary });
w('c3d_r2_skill_frames.json', { note: 'R2-2 特/绝逐帧（白盒触发 charge 9s 保持 / strike 保持；窗内相位 = (stateElapsedSec/3) mod 1）', frames: skillFrames, summary: skillSummary });
w('c3d_r2_scale_bbox.json', { note: 'R2-3 人物层像素包围盒（dpr 1/2/3，facing=right，idle）', rows: scaleRows });

console.log('\n[t31r2] 轻功摘要：');
console.log('  x1 ' + JSON.stringify(jumpSummary.x1));
console.log('  x2 ' + JSON.stringify(jumpSummary.x2));
console.log('[t31r2] 特/绝摘要：x1 ' + JSON.stringify(skillSummary.x1) + '\n  x2 ' + JSON.stringify(skillSummary.x2));
console.log('[t31r2] 比例包围盒（逻辑 px）：' + scaleRows.map((r) => `dpr=${r.dsf} ${r.bboxHLogical}（placed.h=${r.placedHLogical}）`).join(' · '));
if (errors.length) {
  console.log('\n[t31r2] 页面错误：');
  for (const e of errors.slice(0, 20)) console.log('  ' + e);
}
const bad =
  [jumpSummary.x1.ok, jumpSummary.x2.ok, skillSummary.x1.ok, skillSummary.x2.ok].some((v) => !v) ||
  // 【v1.3.1 判据】轻功峰值/名义参考高必须落 [0.65,0.80]（两档倍速各自判定；越界即 exit 1）
  (jumpSummary.x1.ok && !jumpSummary.x1.peakRatioBandOk) ||
  (jumpSummary.x2.ok && !jumpSummary.x2.peakRatioBandOk);
process.exit(bad || errors.length ? 1 : 0);
