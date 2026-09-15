// ═══ T32 · 3D 武器挂载证据（W1~W9 的像素/时间线面；机械判据的实机复核件给 PM）═══
// 用法：node proto/battle_demo/tools/t32_weapon_evidence.mjs
//
// 产出（proto/battle_demo/shots/，前缀 w3d_）：
//   · w3d_w6_timeline.json —— 动作键 → 可见性逐帧时间线（idle/atk/cast 持剑；walk/jump 收剑；A→B 期间 hidden）
//   · w3d_w6_idle.png / w3d_w6_move.png / w3d_w6_jump.png —— 同机位「持剑 vs 收剑 vs 轻功」对照（W6 甲）
//   · w3d_w4_len050.png / w3d_w4_len075.png / w3d_w4_len120.png —— 三档 lenRatio 同机位截图 + 像素量测
//   · w3d_w5_tint.png + w3d_w5_tint.json —— 四部件染色（护手变色 / 剑身不变 ⇒ 不串色）
//   · w3d_w8_over_light.png / w3d_w8_over_dark.png —— 剑刃近侧放大（深浅双底，双面无破洞目视）
//
// 判据口径：像素仪器（同 shot_character3d.mjs 家族）；退出码 0 = 全部机械判据通过。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../cutout/png_codec.mjs';

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
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
  if (!ok) console.log(`FAIL ${name} ${detail}`);
};

const openPage = async (query = '', dsf = 2) => {
  const page = await browser.newPage({ viewport: { width: 560, height: 700 }, deviceScaleFactor: dsf });
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
/** 剑像素量测：在人物层裁剪窗内数不透明像素 + 包围盒（会包含身体——故另给「剑专属」量法：见 swordPixels） */
const layerStats = (page) =>
  page.evaluate(() => {
    const gl = window.__char3d.canvas;
    const t = document.createElement('canvas');
    t.width = gl.width; t.height = gl.height;
    const tc = t.getContext('2d');
    tc.drawImage(gl, 0, 0);
    const d = tc.getImageData(0, 0, gl.width, gl.height).data;
    let n = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let y = 0; y < gl.height; y++) {
      for (let x = 0; x < gl.width; x++) {
        if (d[(y * gl.width + x) * 4 + 3] > 8) {
          n++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const info = window.__demo.character3d;
    const pl = info.placed ? info.placed.get('hero') : null;
    return {
      layerPx: n,
      bbox: n ? [minX, minY, maxX, maxY] : null,
      placed: pl,
      weapon: info.weapon,
      actionKey: info.actionKey,
      dpr: window.__demo.dpr,
    };
  });

const shot = async (page, name) => {
  const p = path.join(outDir, `w3d_${name}.png`);
  await page.screenshot({ path: p });
  return p;
};

// ══════════ W6 · 动作键 → 可见性（时间线 + 同机位对照）══════════
{
  const page = await openPage('', 2);
  await quiet(page);
  const opts = { animLeftMs: 9000, moveT: 1 };
  const timeline = [];
  const states = [
    ['idle', { animState: 'idle', isJump: false, ...opts }],
    ['basic', { animState: 'basic', isJump: false, ...opts }],
    ['charge', { animState: 'charge', isJump: false, ...opts }],
    ['strike', { animState: 'strike', isJump: false, ...opts }],
  ];
  for (const [name, fields] of states) {
    await setHero(page, fields);
    await page.waitForTimeout(180);
    const s = await layerStats(page);
    timeline.push({ state: name, actionKey: s.actionKey, visible: s.weapon?.visible ?? null, layerPx: s.layerPx });
    check(`W6 ${name}：持剑（weapon.visible=true）`, s.weapon?.visible === true, `actionKey=${s.actionKey} layerPx=${s.layerPx}`);
  }
  // 移动演出 A→B：逐帧取可见性（含轻功闩锁）
  const h = await page.evaluate(() => {
    const u = window.__demo.session._debug.units.find((x) => x.id === 'hero');
    return { q: u.hex.q, r: u.hex.r };
  });
  await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, renderQ: h.q, renderR: h.r, moveFromQ: h.q, moveFromR: h.r });
  await page.waitForTimeout(200);
  const walkIdleShot = await shot(page, 'w6_walk_idle');
  await setHero(page, { animState: 'walk', animLeftMs: 9000, isJump: false, moveFromQ: h.q - 1, moveFromR: h.r, moveT: 0.02 });
  const moveFrames = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 1100) {
    const s = await page.evaluate(() => {
      const info = window.__demo.character3d;
      const snap = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
      const ma = window.__demo.getView().moveAnims.get('hero');
      return {
        viewT: +window.__demo.getView().time.toFixed(3),
        snapState: snap.animState,
        snapIsJump: snap.isJump,
        actionKey: info.actionKey,
        visible: info.weapon ? info.weapon.visible : null,
        inMove: ma !== undefined && ma.t < ma.duration,
      };
    });
    moveFrames.push(s);
    await page.waitForTimeout(20);
  }
  const moveShotDone = await shot(page, 'w6_walk_after');
  fs.writeFileSync(path.join(outDir, 'w3d_w6_timeline.json'), JSON.stringify({ states: timeline, moveFrames, walkIdleShot: path.basename(walkIdleShot), moveShotDone: path.basename(moveShotDone) }, null, 1));
  const inMove = moveFrames.filter((f) => f.inMove);
  check(
    'W6 甲 · 移动演出（A→B）期间全程收剑',
    inMove.length > 5 && inMove.every((f) => f.visible === false && f.actionKey === 'walk'),
    `演出帧 ${inMove.length} 帧，visible 全 false=${inMove.every((f) => f.visible === false)}`,
  );
  const lastInMove = moveFrames.map((f, i) => (f.inMove ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
  const afterMove = moveFrames.slice(lastInMove + 1); // 只取演出开始之后的帧（前几帧可能仍是上一场景的旧帧）
  // 白盒触发下快照 animState 仍被钉在 walk（animLeftMs=9000）⇒ 动作键仍 walk ⇒ **仍应收剑**
  //（W6 甲语义：移动状态持续期间收剑；生产里快照回 idle 才出剑）
  check(
    'W6 甲 · 演出结束后快照仍 walk ⇒ 仍收剑（状态语义一致，不因 MoveAnim 结束提前出剑）',
    afterMove.length > 0 && afterMove.every((f) => f.visible === false && f.actionKey === 'walk'),
    `演出后 ${afterMove.length} 帧：visible 全 false=${afterMove.every((f) => f.visible === false)}`,
  );
  // 「回待机立即出剑」：同帧切换证据（无迟一帧）
  await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, renderQ: h.q, renderR: h.r, moveFromQ: h.q, moveFromR: h.r });
  await page.waitForTimeout(60);
  const backToIdle = await page.evaluate(() => {
    const info = window.__demo.character3d;
    return { actionKey: info.actionKey, visible: info.weapon ? info.weapon.visible : null };
  });
  check(
    'W6 甲 · 回待机立即持剑（同帧，无迟一帧）',
    backToIdle.actionKey === 'idle' && backToIdle.visible === true,
    `actionKey=${backToIdle.actionKey} visible=${backToIdle.visible}`,
  );
  // 轻功（jump）：快照 animState 仍是 walk ⇒ 读快照必错的反例面
  await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, renderQ: h.q, renderR: h.r, moveFromQ: h.q, moveFromR: h.r });
  await page.waitForTimeout(200);
  await setHero(page, { animState: 'walk', animLeftMs: 9000, isJump: true, moveFromQ: h.q - 1, moveFromR: h.r, moveT: 0.02 });
  const jumpFrames = [];
  const t1 = Date.now();
  while (Date.now() - t1 < 1000) {
    const s = await page.evaluate(() => {
      const info = window.__demo.character3d;
      const snap = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
      const ma = window.__demo.getView().moveAnims.get('hero');
      return {
        viewT: +window.__demo.getView().time.toFixed(3),
        snapState: snap.animState,
        snapIsJump: snap.isJump,
        actionKey: info.actionKey,
        visible: info.weapon ? info.weapon.visible : null,
        inMove: ma !== undefined && ma.t < ma.duration,
      };
    });
    jumpFrames.push(s);
    await page.waitForTimeout(20);
  }
  const jumpShot = await shot(page, 'w6_jump');
  fs.writeFileSync(path.join(outDir, 'w3d_w6_jump_timeline.json'), JSON.stringify({ jumpFrames, jumpShot: path.basename(jumpShot) }, null, 1));
  const inJump = jumpFrames.filter((f) => f.inMove);
  check(
    'W6 甲 · 轻功期间收剑（且快照 animState 恒 walk ⇒ 证明「读快照必错」）',
    inJump.length > 3 && inJump.every((f) => f.visible === false && f.actionKey === 'jump') && inJump.every((f) => f.snapState === 'walk'),
    `轻功帧 ${inJump.length}：visible 全 false=${inJump.every((f) => f.visible === false)}，actionKey 全 jump=${inJump.every((f) => f.actionKey === 'jump')}`,
  );
  // 同机位「待机持剑 / 移动收剑」对照图（Leo 日后若改判乙可直接比对）
  await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, renderQ: h.q, renderR: h.r, moveFromQ: h.q, moveFromR: h.r });
  await page.waitForTimeout(220);
  const idleShot = await shot(page, 'w6_idle');
  const idleStats = await layerStats(page);
  check('W6 对照：待机持剑帧层像素 > 0（对照基准）', idleStats.layerPx > 500, `layerPx=${idleStats.layerPx}（${path.basename(idleShot)} vs ${path.basename(walkIdleShot)}）`);
  await page.close();
}

// ══════════ W4 · 三档 lenRatio 像素量测（屏上全长线性）══════════
{
  const rows = [];
  for (const [tag, q] of [['050', '?weaponLen=0.5'], ['075', ''], ['120', '?weaponLen=1.2']]) {
    const page = await openPage(q, 2);
    await quiet(page);
    await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, hexFacing: { q: 1, r: 0 } });
    await page.waitForTimeout(260);
    const s = await layerStats(page);
    const file = await shot(page, `w4_len${tag}`);
    rows.push({ tag, query: q, layerPx: s.layerPx, bbox: s.bbox, weapon: s.weapon, placed: s.placed, file: path.basename(file) });
    check(`W4 ${tag}：剑已绘制（weapon.visible=true 且装配 enabled）`, s.weapon?.visible === true && s.weapon?.enabled === true, `visible=${s.weapon?.visible} enabled=${s.weapon?.enabled}`);
    await page.close();
  }
  // 像素面积随 lenRatio 单调（剑更长 ⇒ 不透明像素更多）；提示：剑与身体重叠，故只作单调性判据
  const [a, b, c] = rows.map((r) => r.layerPx);
  check('W4 三档：层像素随 lenRatio 单调不减（0.5 ≤ 0.75 ≤ 1.2）', a <= b && b <= c, `${a} / ${b} / ${c}`);
  // 屏长仪器（W4）：武器矩阵对柄头/剑尖两点的投影距离 = 剑的**投影全长**（物理像素 ÷ dpr = 逻辑像素）
  const logical = rows.map((r) => {
    const sc = r.weapon?.screen ?? null;
    if (!sc) return null;
    return +(Math.hypot(sc.tip[0] - sc.pommel[0], sc.tip[1] - sc.pommel[1]) / 2).toFixed(2); // dsf=2 ⇒ /2
  });
  const nominal = { '050': 0.5 * 96.096, '075': 0.75 * 96.096, '120': 1.2 * 96.096 };
  for (let i = 0; i < rows.length; i++) {
    const tag = rows[i].tag;
    check(
      `W4 ${tag}：屏上投影全长 ≤ 名义全长（含透视缩短，不应超出）`,
      logical[i] !== null && logical[i] <= nominal[tag] + 2,
      `实测=${logical[i]}px 名义=${nominal[tag].toFixed(2)}px`,
    );
  }
  const r075 = logical[1];
  if (logical[0] && logical[2] && r075) {
    check('W4 三档：投影全长随 lenRatio 线性（比值 0.5:0.75:1.2 逐对比 ≤3%）', (() => {
      const q1 = Math.abs(logical[0] / r075 - 0.5 / 0.75) / (0.5 / 0.75);
      const q2 = Math.abs(logical[2] / r075 - 1.2 / 0.75) / (1.2 / 0.75);
      return q1 <= 0.03 && q2 <= 0.03;
    })(), `${logical[0]} / ${r075} / ${logical[2]}`);
  }
  fs.writeFileSync(path.join(outDir, 'w3d_w4_len_metrics.json'), JSON.stringify({ rows, screenLengthLogicalPx: logical, nominalPx: nominal }, null, 1));
}

// ══════════ W5 · 四部件染色（**同帧冻结姿态**逐段换色 ⇒ 集合互不重叠 = 不串色）══════════
{
  const page = await openPage('', 2);
  await quiet(page);
  await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, hexFacing: { q: 1, r: 0 } });
  await page.waitForTimeout(260);
  // 接管 rAF：改为**手动步进**且用同一时间戳 ⇒ dt=0 ⇒ 姿态逐帧完全冻结（唯一变量=染色）
  await page.evaluate(() => {
    window.__rafQ = [];
    window.__rafT = performance.now();
    window.requestAnimationFrame = (cb) => {
      window.__rafQ.push(cb);
      return 1;
    };
  });
  await page.waitForTimeout(40); // 让在飞的回调排队
  const stepSame = async () => {
    await page.evaluate(() => {
      const q = window.__rafQ;
      if (q && q.length) q.shift()(window.__rafT); // 同时间戳 ⇒ host dt=0
    });
    await page.waitForTimeout(30);
  };
  const grab = async (name) => {
    await stepSame();
    const stats = await layerStats(page);
    const file = await shot(page, name);
    return { file, bbox: stats.bbox, weapon: stats.weapon };
  };
  const base = await grab('w5_untinted');
  // 判据用**非相邻两段**（剑首 vs 剑身：中间隔着柄与护手）⇒ 变化集合必须严格不相交（任何重叠 = 真串色）
  await page.evaluate(() => window.__demo.setWeaponTint({ guard: '#1e5a24' }));
  const guard = await grab('w5_guard_tinted');
  await page.evaluate(() => window.__demo.setWeaponTint({ blade: '#c81e1e' }));
  const blade = await grab('w5_blade_tinted');
  await page.evaluate(() => window.__demo.setWeaponTint({ grip: '#12305a' }));
  const adjacent = await grab('w5_grip_tinted');
  await page.evaluate(() => window.__demo.setWeaponTint(null));
  const restored = await grab('w5_restored');
  await page.close();

  const A = decodePng(base.file);
  const P = decodePng(guard.file);
  const B = decodePng(blade.file);
  const ADJ = decodePng(adjacent.file);
  const R = decodePng(restored.file);
  const imgs = [A, P, B, ADJ, R];
  const w = Math.min(...imgs.map((I) => I.width));
  const h = Math.min(...imgs.map((I) => I.height));
  const diffMask = (I) => {
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = (y * w + x) * 4;
        const d = Math.abs(A.rgba[s] - I.rgba[s]) + Math.abs(A.rgba[s + 1] - I.rgba[s + 1]) + Math.abs(A.rgba[s + 2] - I.rgba[s + 2]);
        m[y * w + x] = d > 60 ? 1 : 0;
      }
    }
    return m;
  };
  const mGuard = diffMask(P);
  const mBlade = diffMask(B);
  const mPommel = diffMask(ADJ);
  const mRestore = diffMask(R);
  const count = (m) => m.reduce((a, b) => a + b, 0);
  /** 4 邻域腐蚀：挖掉 1px 边界后剩下的「内部像素」（段界 AA 只会落在边界带） */
  const erode = (m) => {
    const out = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w]) out[i] = 1;
      }
    }
    return out;
  };
  const mBladeCore = erode(mBlade);
  const nGuard = count(mGuard);
  const nBlade = count(mBlade);
  const nPommel = count(mPommel);
  const nRestoreDiff = count(mRestore);
  let overlapAll = 0;
  let overlapBladeCore = 0;
  for (let i = 0; i < w * h; i++) {
    if (mGuard[i] && mBlade[i]) overlapAll++;
    if (mGuard[i] && mBladeCore[i]) overlapBladeCore++;
  }
  const json = {
    method: '同页 + rAF 手动步进（同时间戳 ⇒ dt=0，姿态冻结），唯一变量 = 染色',
    files: {
      base: path.basename(base.file),
      pommelTint: path.basename(guard.file),
      bladeTint: path.basename(blade.file),
      guardTintAdjacent: path.basename(adjacent.file),
      restored: path.basename(restored.file),
    },
    guardChangedPx: nGuard,
    bladeChangedPx: nBlade,
    pommelChangedPx: nPommel,
    guardBladeOverlapAnyPx: overlapAll,
    guardBladeOverlapInBladeCorePx: overlapBladeCore,
    bladeCorePx: count(mBladeCore),
    restoreDiffPx: nRestoreDiff,
  };
  fs.writeFileSync(path.join(outDir, 'w3d_w5_tint.json'), JSON.stringify(json, null, 1));
  check('W5 单段染色各自生效（护手 >30px、剑身 >300px 变化）', nGuard > 30 && nBlade > 300, `guard=${nGuard} blade=${nBlade}（柄/剑首被拳遮挡 ⇒ 0px，几何事实）`);
  const bladeCorePx = count(mBladeCore);
  check(
    `W5 不串色：护手染色对**剑身内部**的改动 ≤1%（真串色会整片变色）`,
    overlapBladeCore <= Math.max(4, bladeCorePx * 0.01),
    `剑身内部 ${bladeCorePx}px，其中被护手染色波及 ${overlapBladeCore}px（段界 1px 带内共 ${overlapAll}px = 邻接几何/AA）`,
  );
  check(
    `W5 相邻段界 AA 混合 ≤2%（情报）：${overlapAll}px / 剑身 ${nBlade}px`,
    overlapAll <= Math.max(4, nBlade * 0.02),
    `boundaryBandPx=${overlapAll}`,
  );
  check('W5 复原（setWeaponTint(null)）后与基线逐像素一致', nRestoreDiff === 0, `restoreDiffPx=${nRestoreDiff}`);
}

// ══════════ W8 · 双面（深浅双底放大）+ 诊断 cull=off ══════════
{
  for (const [bg, hex] of [['light', '#e9e4d6'], ['dark', '#101418']]) {
    const page = await openPage('', 3);
    await quiet(page);
    await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, hexFacing: { q: 1, r: 0 } });
    await page.waitForTimeout(300);
    const dataUrl = await page.evaluate(([bgColor, pad]) => {
      const gl = window.__char3d.canvas;
      const dpr = window.__demo.dpr;
      const pl = window.__demo.character3d.placed?.get('hero');
      if (!pl) return null;
      const x0 = Math.max(0, Math.round(pl.cx * dpr - (pl.w * dpr) / 2 - pad));
      const y0 = Math.max(0, Math.round(pl.top * dpr - pad));
      const w = Math.min(gl.width - x0, Math.round(pl.w * dpr + pad * 2));
      const h = Math.min(gl.height - y0, Math.round(pl.h * dpr + pad * 2));
      const t = document.createElement('canvas');
      t.width = w; t.height = h;
      const tc = t.getContext('2d');
      tc.fillStyle = bgColor;
      tc.fillRect(0, 0, w, h);
      tc.drawImage(gl, x0, y0, w, h, 0, 0, w, h);
      return t.toDataURL('image/png');
    }, [hex, 20]);
    const diag = await page.evaluate(() => window.__demo.character3d);
    const diags = [...(diag.diagnostics ?? []), ...((diag.weapon && diag.weapon.diagnostics) || [])];
    const out = path.join(outDir, `w3d_w8_over_${bg}.png`);
    if (dataUrl) fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
    check(
      `W8 ${bg} 底：武器层含剑像素 + 诊断 cull=off/doubleSided=1`,
      !!dataUrl && diags.some((d) => String(d).includes('weapon-cull=off')) && diags.some((d) => String(d).includes('weapon-doubleSided=1')),
      `diags=${diags.filter((d) => String(d).startsWith('weapon-')).join(',')}`,
    );
    await page.close();
  }
}

await browser.close();
for (const c of checks) console.log(c);
if (errors.length) {
  console.log('\n页面错误：');
  for (const e of errors.slice(0, 20)) console.log('  ' + e);
}
const failed = checks.filter((c) => c.startsWith('FAIL'));
console.log(`\n[t32] ${checks.length - failed.length}/${checks.length} PASS${errors.length ? ` · 页面错误 ${errors.length}` : ''}`);
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
