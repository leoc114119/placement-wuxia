// ═══ T31-FE-B · 主角 3D 战斗接线 证据驱动（《2.5D角色运行时接入技术方案》v1.0 §8 卡 B / §9.2）═══
// 用法：node proto/battle_demo/shot_character3d.mjs
//
// 产出（shots/，前缀 c3d_）：
//   ① 三视口 375×667 / 560×700 / 900×560 × 六向 idle（每向 1 张）
//   ② 三视口 × 动作时间线：walk / basic / charge / strike / jump(升) / jump(降) / dead
//   ③ 深/浅背景对拍（§9.2）：bg=light|dark × {idle, walk}
//   ④ FXAA 与「无 FXAA」同机位并排归档（§9.2）：aa=fxaa vs aa=native-msaa，各 2 张原图 + 1 张并排图
//   ⑤ 脚底对格心误差量测（§9.2 ≤2 物理像素）：离屏人物层渲染像素包围盒底边 = 实测脚底，
//      dpr=1/2/3 各测一次；真值锚 = __demo.cellPx（与 3D 命令同一条 hexToWorld→camera→×dpr 换算）。
//      另附合成落屏证明（?char3d=loading 参照 vs 正常，盒内强差异像素）
//   ⑥ 【R1】轻功逐帧时间线（c3d_jump_timeline.json，**不只存图片**）：每帧记录快照 isJump /
//      3D 命令 isJump / 控制器 activeClipKey / hop / moveProgress —— 锁「300ms 快照窗关闭后
//      顶点与降段仍为 jump，落地演出结束才释放」。
//
// 白盒说明（与 shot_sixdir.mjs 同惯例）：六向/演出态经 __demo.session._debug.units 直写快照出口字段
// （facing/animState/isJump/moveT 全真值链路），隔离「快照→命令→yaw/动作」的观测噪声；真实交互链路
// （点击/移动/出招/镜头/受击）由 shot.mjs + behavior_e2e.mjs 既有 16+11 项锁定，本文件只做视觉证据。
//
// 退出码：全部证据生成且量测通过 = 0；任一失败 = 1（无人值守可判）。

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './cutout/png_codec.mjs';
import { measureFace } from './tools/measure_face_dir.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'shots');
fs.mkdirSync(outDir, { recursive: true });

const FACINGS = ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown'];
const FACING_VEC = {
  right: { q: 1, r: 0 },
  rightup: { q: 1, r: -1 },
  leftup: { q: 0, r: -1 },
  left: { q: -1, r: 0 },
  leftdown: { q: -1, r: 1 },
  rightdown: { q: 0, r: 1 },
};
const VIEWPORTS = [
  [375, 667, '375x667'],
  [560, 700, '560x700'],
  [900, 560, '900x560'],
];

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  // 【T31-FE-B】主角 3D 人物层资源由页面经 file:// fetch 读取，Chrome 需放开本地文件访问（只作用于证据浏览器）
  args: ['--allow-file-access-from-files'],
});

const written = [];
const jumpEvidence = {}; // tag → {rise, desc}：轻功升/降段真值采样（交付证据）
const jumpTimelines = {}; // tag → {samples, summary}：轻功逐帧时间线（【R1】快照/命令/activeClipKey 三层）
const timelineAttempts = {}; // tag → 时间线重录次数（首录漏掉升段/降段时重录）
const errors = [];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
  if (!ok) console.log(`FAIL ${name} ${detail}`);
};
const shot = async (page, name) => {
  const p = path.join(outDir, `c3d_${name}.png`);
  await page.screenshot({ path: p });
  written.push(path.basename(p));
  return p;
};

/** 两图强差异像素数（阈值 60，避开棋盘亚像素噪声）：用于「帧不是同一张」的自证——
 * 六向帧若全部相同=朝向没生效、状态帧若相同=动作没播（本项目历史缺陷：截图退化成同帧假证据）。 */
const strongDiffCount = (fileA, fileB) => {
  const A = decodePng(fileA);
  const B = decodePng(fileB);
  const w = Math.min(A.width, B.width);
  const h = Math.min(A.height, B.height);
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d =
        Math.abs(A.rgba[s] - B.rgba[s]) +
        Math.abs(A.rgba[s + 1] - B.rgba[s + 1]) +
        Math.abs(A.rgba[s + 2] - B.rgba[s + 2]);
      if (d > 60) n++;
    }
  }
  return n;
};

/** 冻结行动条：证据窗口内敌我均不行动（白盒仅证据驱动用，非生产路径） */
const quiet = (page) =>
  page.evaluate(() => {
    for (const u of window.__demo.session._debug.units) {
      u.bar = 0;
      u.barWasMax = false;
    }
  });

/** 直写主角演出态（快照出口字段：animState/facingHex/isJump/renderPos 全真值链路） */
const setHero = (page, fields) =>
  page.evaluate(
    ([f]) => {
      const u = window.__demo.session._debug.units.find((x) => x.id === 'hero');
      Object.assign(u, f);
    },
    [fields],
  );

/** 采样「轻功真值链路」三件：hop（view 演出抛物线，唯一垂直位移来源）/ isJump（快照透传）/ state */
const flightSample = (page) =>
  page.evaluate(() => {
    const h = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
    const c = window.__demo.character3d;
    const cmd = (c.lastCommands ?? []).find((x) => x.actorId === 'hero') ?? null;
    return {
      hop: window.__demo.sampleHeroDraw().hop,
      isJump: h.isJump,
      state: h.animState,
      // 【v1.1】竖直改由素材提供 ⇒ 升/降段判据改用命令的 moveProgress（hop 恒 0，不能再当判据）
      progress: cmd ? cmd.moveProgress : null,
      cmdIsJump: cmd ? cmd.isJump : null,
      clip: (c.controllers && c.controllers.get && c.controllers.get('hero')) ? c.controllers.get('hero').activeClipKey : null,
    };
  });

/** 【R1 证据】轻功时间线逐帧录制（**不只存图片**）：同一帧对照三层——快照 isJump（session 300ms 窗）/
 * 3D 命令 isJump（MoveAnim 锁定的意图）/ 控制器 activeClipKey（动作层实际消费的槽位）。
 * 采样方式与既有 waitFlight 同源（Node 侧轮询 page.evaluate，每帧一次短调用）：**不在页内挂长时
 * rAF 录制器**——实测页内 1.5s rAF 录制会让无头页在长任务后失联（run 中止在 evaluate 上），而既有
 * 轮询路径在本脚本已长期稳定。采样点=每次轮询当时的帧（view 演出钟 viewT 为准）。
 * 返回 { samples, summary }：summary 给出「起跳 / 窗关闭点 / 窗后仍 jump 样本 / 顶点 / 落地释放」。 */
const jumpSample = (page) =>
  page.evaluate(() => {
    const snap = window.__demo.session.snapshot();
    const h = snap.actors.find((a) => a.id === 'hero');
    const c = window.__demo.character3d;
    const cmd = (c.lastCommands ?? []).find((x) => x.actorId === 'hero') ?? null;
    return {
      viewT: +window.__demo.getView().time.toFixed(3),
      hop: window.__demo.sampleHeroDraw().hop,
      snapIsJump: h ? h.isJump : null,
      snapState: h ? h.animState : null,
      cmdIsJump: cmd ? cmd.isJump : null,
      cmdState: cmd ? cmd.state : null,
      moveProgress: cmd ? cmd.moveProgress : null,
      clip: c.activeClipKey,
      runtime: window.__demo.runtimeState.status,
    };
  });

const summarizeTimeline = (samples) => {
  const takeoffIdx = samples.findIndex((s) => s.cmdIsJump === true);
  const takeoff = takeoffIdx >= 0 ? samples[takeoffIdx] : null;
  // 升段样本：快照窗内（session isJump=true）且命令/动作已是 jump
  const riseCount = samples.filter((s) => s.snapIsJump === true && s.cmdIsJump === true).length;
  // 窗关闭点 = 起跳之后首个快照 isJump=false 的样本（session ANIM_MS.walk=300ms 窗）
  const closeIdx = takeoffIdx >= 0 ? samples.findIndex((s, i) => i > takeoffIdx && s.snapIsJump === false) : -1;
  const windowClose = closeIdx >= 0 ? samples[closeIdx] : null;
  // 窗关闭后仍被判为轻功的样本（R1 修订乙核心断言面：command/动作层不随 300ms 窗回落）
  const descend = closeIdx >= 0 ? samples.slice(closeIdx).filter((s) => s.snapIsJump === false && s.cmdIsJump === true) : [];
  // 释放点 = **最后一个降段样本之后**首个 command.isJump=false（落地演出结束/换演出才释放；
  // 取「降段末之后」而非「窗关闭之后」——采样跨帧时窗关闭瞬间可能落在两个演出之间，会误判成已释放）
  const afterDescend = descend.length > 0 ? samples.slice(samples.indexOf(descend[descend.length - 1]) + 1) : [];
  const released = afterDescend.find((s) => s.cmdIsJump === false) ?? null;
  // 【v1.1】竖直由素材提供 ⇒ 不再以 hop 论「顶点」；改为取**演出中点**（moveProgress 最接近 0.5 者）
  const withProg = samples.filter((s) => s.moveProgress !== null && s.moveProgress !== undefined);
  const peak = withProg.length
    ? withProg.reduce((a, b) => (Math.abs(b.moveProgress - 0.5) < Math.abs(a.moveProgress - 0.5) ? b : a))
    : (samples[0] ?? { hop: 0 });
  return {
    count: samples.length,
    takeoff,
    riseCount,
    windowClose,
    windowCloseLatency: windowClose && takeoff ? +(windowClose.viewT - takeoff.viewT).toFixed(3) : null,
    descendCount: descend.length,
    descendFirst: descend[0] ?? null,
    descendLast: descend[descend.length - 1] ?? null,
    descendAllJump: descend.every((s) => s.clip === 'jump'),
    peak,
    released,
    clips: [...new Set(samples.map((s) => s.clip))],
  };
};

const jumpTimeline = async (page, durationMs) => {
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < durationMs) {
    const s = await jumpSample(page);
    samples.push({ t: +((Date.now() - t0) / 1000).toFixed(3), ...s });
    await page.waitForTimeout(20);
  }
  return { samples, summary: summarizeTimeline(samples) };
};

/** 轮询直到条件满足（每 25ms，超时返回 null）——轻功升/降段窗口只有几百毫秒，靠固定 wait 不可靠 */
const waitFlight = async (page, pred, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await flightSample(page);
    if (pred(s)) return s;
    await page.waitForTimeout(25);
  }
  return null;
};

const heroSnapshot = (page) =>
  page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    const h = s.actors.find((a) => a.id === 'hero');
    return { q: h.pos.q, r: h.pos.r, facing: h.facingHex, state: h.animState, isJump: h.isJump, hp: h.hp };
  });

/** 坐标换算真源：3D placed/cellPx 是**画布物理像素**（WebGL 正交空间），而 page.screenshot 的
 * clip 用 CSS px、截图本体用「CSS × deviceScaleFactor」。两套坐标必须在此一处换算，
 * 禁在量测/裁剪处各自估。kShot = 截图px / 画布物理px。 */
const pageGeom = (page) =>
  page.evaluate(() => {
    const c = document.getElementById('cv');
    const r = c.getBoundingClientRect();
    return {
      left: r.left, top: r.top, cssW: r.width, cssH: r.height,
      pxW: c.width, pxH: c.height,
      dsf: window.devicePixelRatio || 1,
      dpr: window.__demo.dpr,
    };
  });

const openPage = async (query = '', deviceScaleFactor = 1, viewport = { width: 560, height: 700 }) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor });
  page.on('pageerror', (e) => errors.push(`[${query}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${query}][console.error] ${m.text()}`);
  });
  await page.goto('file://' + path.join(here, 'index.html') + query);
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 20000 });
  await page.waitForFunction(() => window.__demo.assetsReady === true, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  return page;
};

/** 3D 诊断（placed 的 Map 转成普通对象——page.evaluate 跨线只有可序列化形状） */
const char3dDiag = (page) =>
  page.evaluate(() => {
    const c = window.__demo.character3d;
    return { ...c, placed: c.placed ? Object.fromEntries(c.placed) : null };
  });

// ══════════ ① + ② 三视口 × 六向 idle + 动作时间线 ══════════
for (const [vw, vh, tag] of VIEWPORTS) {
  const page = await openPage('', 1, { width: vw, height: vh });
  await quiet(page);
  const diag = await char3dDiag(page);
  check(`${tag} 3D 就绪（loadStatus/edgeMode）`, diag.status === 'ready' && !!diag.edgeMode, `status=${diag.status} edge=${diag.edgeMode} bb=${diag.backbuffer?.width}x${diag.backbuffer?.height}`);

  // ① 六向 idle
  const facingFiles = {};
  for (const facing of FACINGS) {
    await quiet(page);
    await setHero(page, { hexFacing: FACING_VEC[facing], animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1 });
    await page.waitForTimeout(140);
    const placed = (await char3dDiag(page)).placed;
    check(`${tag} 六向 ${facing} 有 placed（脚底锚同源）`, !!placed && !!placed.hero, placed ? JSON.stringify(placed.hero) : 'placed=null');
    facingFiles[facing] = await shot(page, `${tag}_idle_${facing}`);
  }

  // ①' 六向自证：任一方向对之间都必须显著不同（否则=朝向没生效的假证据）
  {
    let minPair = Infinity;
    for (let i = 0; i < FACINGS.length; i++) {
      for (let j = i + 1; j < FACINGS.length; j++) {
        minPair = Math.min(minPair, strongDiffCount(facingFiles[FACINGS[i]], facingFiles[FACINGS[j]]));
      }
    }
    check(`${tag} 六向 15 对帧互不相同（朝向真生效）`, minPair > 300, `最小对间强差异=${minPair}`);
  }

  // ② 动作时间线（facing=right：动作最易读的一向）
  await quiet(page);
  await setHero(page, { hexFacing: FACING_VEC.right, animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1 });
  await page.waitForTimeout(140);
  await shot(page, `${tag}_state_idle`);

  // walk：演出期（moveFrom≠hex + moveT 推进 → view moveAnim 主导）
  const hero = await heroSnapshot(page);
  await setHero(page, {
    animState: 'walk',
    animLeftMs: 9000,
    isJump: false,
    moveFromQ: hero.q - 1,
    moveFromR: hero.r,
    moveT: 0.05,
  });
  await page.waitForTimeout(150);
  await shot(page, `${tag}_state_walk`);
  await setHero(page, { animState: 'idle', animLeftMs: 0, moveT: 1, renderQ: hero.q, renderR: hero.r, moveFromQ: hero.q, moveFromR: hero.r });

  // basic：归一进 CHOREO.basicSec 表现窗（头段/中段各一帧）
  await quiet(page);
  await setHero(page, { animState: 'basic', animLeftMs: 9000, isJump: false, moveT: 1 });
  await page.waitForTimeout(120);
  await shot(page, `${tag}_state_basic_head`);
  await page.waitForTimeout(260);
  await shot(page, `${tag}_state_basic_mid`);
  await setHero(page, { animState: 'idle', animLeftMs: 0 });

  // charge：cast 源按 840ms 一轮循环（两帧相位）
  await quiet(page);
  await setHero(page, { animState: 'charge', animLeftMs: 9000 });
  await page.waitForTimeout(150);
  await shot(page, `${tag}_state_charge_a`);
  await page.waitForTimeout(320);
  await shot(page, `${tag}_state_charge_b`);

  // strike：从 2/3 归一位置播到末尾并保持（280ms 窗）
  await quiet(page);
  await setHero(page, { animState: 'strike', animLeftMs: 9000 });
  await page.waitForTimeout(120);
  await shot(page, `${tag}_state_strike`);
  await setHero(page, { animState: 'idle', animLeftMs: 0 });

  // jump：轻功（isJump 真值链路）——升段（isJump=true）与降段（会话 isJump 窗已闭、人仍在空中）各一帧。
  // 两段都靠轮询 hop/isJump 命中窗口后立即截图（固定 wait 会被截图时延吃掉整段飞行）。
  await quiet(page);
  const h2 = await heroSnapshot(page);
  let jump = null;
  for (let attempt = 0; attempt < 8 && !jump; attempt++) {
    await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, renderQ: h2.q, renderR: h2.r, moveFromQ: h2.q, moveFromR: h2.r });
    await page.waitForTimeout(180); // 让 view 释放上一轮 moveAnim
    await setHero(page, { animState: 'walk', animLeftMs: 9000, isJump: true, moveFromQ: h2.q - 1, moveFromR: h2.r, moveT: 0.02 });
    // 【v1.1】升段 = 演出前段（progress<0.5）；降段 = 后段且快照窗已关（isJump=false）——hop 恒 0 不再作判据
    const rise = await waitFlight(page, (x) => x.progress !== null && x.progress < 0.45 && x.cmdIsJump === true, 1500);
    if (rise) await shot(page, `${tag}_state_jump_rise`);
    const desc = await waitFlight(page, (x) => x.progress !== null && x.progress > 0.6 && x.isJump === false && x.cmdIsJump === true, 1500);
    if (desc) {
      await shot(page, `${tag}_state_jump_descend`);
      const after = await flightSample(page);
      if (after.progress !== null && after.cmdIsJump === true) jump = { rise, desc, after };
    }
  }
  jumpEvidence[tag] = jump;
  check(`${tag} 轻功升段（progress<0.45）命令已是 jump 且 hop 恒 0`, !!jump && jump.rise.progress < 0.45 && jump.rise.cmdIsJump === true && jump.rise.hop === 0, jump ? `progress=${jump.rise.progress} hop=${jump.rise.hop} cmd=${jump.rise.cmdIsJump} state=${jump.rise.state}` : '未命中窗口');
  check(`${tag} 轻功降段（progress>0.6，快照窗已关）仍 jump 且 hop 恒 0`, !!jump && jump.desc.progress > 0.6 && jump.desc.isJump === false && jump.desc.cmdIsJump === true && jump.desc.hop === 0, jump ? `progress=${jump.desc.progress} isJump=${jump.desc.isJump} hop=${jump.desc.hop}` : '未命中窗口');

  // 【R1 = arch seq=419 修订乙】轻功时间线逐帧录制（记录 activeClipKey，不只存图片）：
  // 起一段**长距**轻功（4 格 → 0.6+0.15×2=0.9s 演出 > 300ms 快照窗），逐帧采三层（快照/命令/动作）。
  // 录制器先跑 80ms 再触发起跳（保证升段样本落进时间线）；若因首调 evaluate 排队导致漏掉升段
  // 或降段样本不足，重录（最多 3 次）——证据必须完整覆盖「升段 → 窗关闭 → 降段 → 落地释放」。
  let tl = null;
  let lastTl = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await quiet(page);
    await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, renderQ: h2.q, renderR: h2.r, moveFromQ: h2.q, moveFromR: h2.r });
    await page.waitForTimeout(200);
    const timelinePromise = jumpTimeline(page, 1500);
    await page.waitForTimeout(80);
    await setHero(page, { animState: 'walk', animLeftMs: 9000, isJump: true, moveFromQ: h2.q - 4, moveFromR: h2.r, moveT: 0.02 });
    const r = await timelinePromise;
    lastTl = r;
    timelineAttempts[tag] = attempt + 1;
    if (r.summary.riseCount >= 2 && r.summary.descendCount >= 3 && r.summary.released) {
      tl = r;
      break;
    }
  }
  const S = (tl ?? lastTl)?.summary ?? null;
  jumpTimelines[tag] = tl ?? lastTl; // 完整取证优先；否则落最后一次（含 FAIL 详情，供定位）
  check(`${tag} 时间线：升段样本（快照窗内）command.isJump=true 且 activeClipKey=jump`, !!S && S.riseCount >= 2 && S.takeoff?.cmdIsJump === true && S.takeoff?.clip === 'jump', S ? `升段样本=${S.riseCount} 起跳 viewT=${S.takeoff?.viewT} hop=${S.takeoff?.hop} clip=${S.takeoff?.clip}` : '未取得时间线');
  check(`${tag} 时间线：快照 isJump 窗（≈300ms）关闭后 command/activeClipKey 仍为 jump（顶点/降段）`, !!S && S.descendCount >= 3 && S.descendAllJump === true && S.descendLast?.cmdIsJump === true, S ? `窗关闭样本 viewT=${S.windowClose?.viewT ?? 'n/a'} · 窗后 jump 样本=${S.descendCount}（viewT ${S.descendFirst?.viewT ?? 'n/a'}→${S.descendLast?.viewT ?? 'n/a'}）末样本 hop=${S.descendLast?.hop ?? 'n/a'} clip=${S.descendLast?.clip ?? 'n/a'}` : '未取得时间线');
  check(`${tag} 时间线：演出中点（moveProgress≈0.5）仍在 jump、hop 恒 0`, !!S && S.peak.cmdIsJump === true && S.peak.clip === 'jump' && S.peak.hop === 0, S ? `viewT=${S.peak.viewT} progress=${S.peak.moveProgress} hop=${S.peak.hop} cmd=${S.peak.cmdIsJump} clip=${S.peak.clip}` : 'n/a');
  check(`${tag} 时间线：落地演出结束即释放（command.isJump=false）`, !!S && S.released?.cmdIsJump === false, S ? `viewT=${S.released?.viewT} state=${S.released?.cmdState} clip=${S.released?.clip}` : '未见释放样本');
  await setHero(page, { animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1, renderQ: h2.q, renderR: h2.r, moveFromQ: h2.q, moveFromR: h2.r });

  // dead：idle 首帧 + 既有压扁淡出（alpha=PIECE.deadAlpha / squashY=0.3）
  await quiet(page);
  await setHero(page, { animState: 'dead', animLeftMs: 0, dead: false, isJump: false, moveT: 1 });
  await page.waitForTimeout(140);
  await shot(page, `${tag}_state_dead`);
  await setHero(page, { animState: 'idle', animLeftMs: 0 });

  await page.close();
}

// ══════════ ③ 深/浅背景对拍（§9.2：头发/肩/衣摆不得出现连续黑边或 1px 闪烁）══════════
// 两种口径都留：①「在场」全页对拍（真实棋盘为背景，host ?bg= 只换场外 env）；②「纯背景」对拍——
// 把**离屏人物层**（透明底）分别压在浅底 #e9e4d6 / 深底 #101418 上导出（1:1 物理像素、无棋盘干扰，
// 是黑边判定的权威样本；棋盘本身较浅，深底样本只能由纯背景口径给出）。
const BG_LIGHT = '#e9e4d6';
const BG_DARK = '#101418';
const bgShots = {};
for (const bg of ['light', 'dark']) {
  const page = await openPage(`?bg=${bg}`, 3, { width: 560, height: 700 });
  for (const st of ['idle', 'walk']) {
    await quiet(page);
    const h = await heroSnapshot(page);
    if (st === 'walk') {
      await setHero(page, { animState: 'walk', animLeftMs: 9000, isJump: false, moveFromQ: h.q - 1, moveFromR: h.r, moveT: 0.05 });
    } else {
      await setHero(page, { animState: 'idle', animLeftMs: 0, moveT: 1 });
    }
    await page.waitForTimeout(160);
    bgShots[`${bg}_${st}`] = await shot(page, `bg_${bg}_${st}`);
  }
  await page.close();
}

/** 取离屏人物层的**纯背景**合成（透明底 + 指定底色，1:1 背衬像素；返回 PNG 路径） */
const layerOverBackdrop = async (page, bgColor, name, pad = 26) => {
  const dataUrl = await page.evaluate(
    ([bg, p]) => {
      const gl = window.__char3d.canvas;
      const dpr = window.__demo.dpr;
      const pl = window.__demo.character3d.placed?.get('hero');
      if (!pl) return null;
      const x0 = Math.max(0, Math.round(pl.cx * dpr - (pl.w * dpr) / 2 - p));
      const y0 = Math.max(0, Math.round(pl.top * dpr - p));
      const w = Math.min(gl.width - x0, Math.round(pl.w * dpr + p * 2));
      const h = Math.min(gl.height - y0, Math.round(pl.h * dpr + p * 2));
      const t = document.createElement('canvas');
      t.width = w;
      t.height = h;
      const tc = t.getContext('2d');
      tc.fillStyle = bg;
      tc.fillRect(0, 0, w, h);
      tc.drawImage(gl, x0, y0, w, h, 0, 0, w, h);
      return t.toDataURL('image/png');
    },
    [bgColor, pad],
  );
  if (!dataUrl) return null;
  const file = path.join(outDir, `c3d_${name}.png`);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  written.push(path.basename(file));
  return file;
};

// ══════════ ④ FXAA vs 无 FXAA（同机位并排归档，§9.2）+ 边缘黑边量测 ══════════
// 说明：桌面 Chrome 的 getContextAttributes().antialias 实测为 true（= native-MSAA 分支），
// 故「无 FXAA」基准 = aa=native-msaa（同机位、同状态、同裁剪），FXAA 侧 = aa=fxaa 强制分支。
const aaShots = {};
for (const mode of ['fxaa', 'native-msaa']) {
  const page = await openPage(`?aa=${mode}`, 3, { width: 560, height: 700 });
  await quiet(page);
  await setHero(page, { hexFacing: FACING_VEC.rightdown, animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1 });
  await page.waitForTimeout(200);
  const diag = await char3dDiag(page);
  check(`aa=${mode} 实跑分支`, diag.edgeMode === mode, `edgeMode=${diag.edgeMode} antialias=${diag.contextAttributes?.antialias}`);
  const placed = diag.placed?.hero ?? null;
  check(`aa=${mode} placed 存在`, !!placed, JSON.stringify(placed));
  // 纯背景合成（黑边判定权威样本）：浅底 / 深底各一张
  aaShots[mode] = {
    light: await layerOverBackdrop(page, BG_LIGHT, `aa_${mode}_over_light`),
    dark: await layerOverBackdrop(page, BG_DARK, `aa_${mode}_over_dark`),
  };
  // 在场裁剪（真实棋盘背景，同机位同裁剪）
  const pad = 26;
  const g = await pageGeom(page);
  const clip = placed
    ? {
        x: g.left + placed.cx - placed.w / 2 - pad,
        y: g.top + placed.top - pad,
        width: placed.w + pad * 2,
        height: placed.h + pad * 2,
      }
    : undefined;
  const p = path.join(outDir, `c3d_aa_${mode}.png`);
  await page.screenshot({ path: p, clip });
  written.push(path.basename(p));
  aaShots[mode].scene = p;
  await page.close();
}

/** 并排合成（左=FXAA / 右=无 FXAA，同尺寸、同底色）+ 黑边扫描线量测。
 * 判据：过渡带不得出现「比左右两侧都更暗」的像素（未按 premultiplied alpha 处理的黑边特征）。 */
const fringeReport = [];
for (const [bgName, bgHex] of [['light', BG_LIGHT], ['dark', BG_DARK]]) {
  const a = decodePng(aaShots.fxaa[bgName]);
  const b = decodePng(aaShots['native-msaa'][bgName]);
  const w = Math.min(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const gap = 6;
  const out = new Uint8Array((w * 2 + gap) * h * 4);
  const rgb = [parseInt(bgHex.slice(1, 3), 16), parseInt(bgHex.slice(3, 5), 16), parseInt(bgHex.slice(5, 7), 16)];
  for (let i = 0; i < out.length; i += 4) {
    out[i] = rgb[0];
    out[i + 1] = rgb[1];
    out[i + 2] = rgb[2];
    out[i + 3] = 255;
  }
  const blit = (img, x0) => {
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < w; x++) {
        const s = (y * img.width + x) * 4;
        const d = (y * (w * 2 + gap) + x + x0) * 4;
        out[d] = img.rgba[s];
        out[d + 1] = img.rgba[s + 1];
        out[d + 2] = img.rgba[s + 2];
        out[d + 3] = img.rgba[s + 3];
      }
    }
  };
  blit(a, 0);
  blit(b, w + gap);
  const pairPath = path.join(outDir, `c3d_aa_sidebyside_${bgName}.png`);
  encodePng(pairPath, w * 2 + gap, h, out);
  written.push(path.basename(pairPath));

  // 扫描线：穿过头发带（h 的 12%）与衣摆带（h 的 62%），逐行查「比两侧都暗」的过渡像素
  const scan = (img, ratio) => {
    const y = Math.round(img.height * ratio);
    const row = [];
    for (let x = 0; x < img.width; x++) {
      const s = (y * img.width + x) * 4;
      row.push((img.rgba[s] * 299 + img.rgba[s + 1] * 587 + img.rgba[s + 2] * 114) / 1000);
    }
    let minDip = Infinity;
    for (let x = 2; x < row.length - 2; x++) {
      minDip = Math.min(minDip, row[x] - Math.min(Math.min(row[x - 2], row[x - 1]), Math.min(row[x + 1], row[x + 2])));
    }
    return +minDip.toFixed(1);
  };
  const dips = {
    fxaaHair: scan(a, 0.12),
    fxaaHem: scan(a, 0.62),
    noaaHair: scan(b, 0.12),
    noaaHem: scan(b, 0.62),
  };
  fringeReport.push({ bgName, ...dips });
  check(
    `${bgName} 底：FXAA 头发/衣摆无「比两侧更暗」的黑边过渡`,
    dips.fxaaHair <= 12 && dips.fxaaHem <= 12,
    `hair=${dips.fxaaHair} hem=${dips.fxaaHem}（无 FXAA 对照 hair=${dips.noaaHair} hem=${dips.noaaHem}）`,
  );
}

// ══════════ ⑤ 脚底对格心误差量测（§9.2 ≤2 物理像素）══════════
// 方法：同一机位/同一格心，取「无人物」参照帧（?char3d=loading，§6.2 未就绪不画 2D 帧）
//   量测①（脚底，精确）：离屏人物层的**渲染像素**包围盒底边 = 人物实际落地像素（层内只有人物、
//   无棋盘/HUD 噪声），与 __demo.cellPx（格心真值锚，同一条 hexToWorld→camera→×dpr 换算）比较；
//   dpr∈{1,2,3} 各测一次（hidpi 下 1 逻辑像素 = 2/3 物理像素）。
//   量测②（合成落屏）：同机位下 ?char3d=loading 参照页 vs 正常页，在人物包围盒内数「强差异像素」
//   ——证明人物层确实合成到了主画布（不掺棋盘边缘 AA 噪声：阈值取强差异）。
const foot = {};
const bboxOfGlLayer = (page) =>
  page.evaluate(() => {
    const c = window.__char3d;
    const gl = c.canvas;
    const t = document.createElement('canvas');
    t.width = gl.width;
    t.height = gl.height;
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
    const h = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
    const p = window.__demo.character3d.placed;
    return {
      glW: gl.width, glH: gl.height, layerPx: n,
      layerBBox: n ? [minX, minY, maxX, maxY] : null,
      cellPx: window.__demo.cellPx(h.pos.q, h.pos.r),
      placed: p ? p.get('hero') ?? null : null,
      dpr: window.__demo.dpr,
    };
  });

for (const dsf of [1, 2, 3]) {
  const page = await openPage('', dsf, { width: 560, height: 700 });
  await quiet(page);
  await setHero(page, { hexFacing: FACING_VEC.right, animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1 });
  await page.waitForTimeout(260);
  const m = await bboxOfGlLayer(page);
  foot[dsf] = m;
  await shot(page, `measure_layer_dpr${dsf}`);
  const layerFoot = m.layerBBox ? m.layerBBox[3] + 1 : null; // 层内最后一个不透明行 + 1 = 脚底
  const err = layerFoot === null ? null : +Math.abs(layerFoot - m.cellPx.y).toFixed(2);
  // 【T31-R2 · §4.1.1】锚 = **地面锚**（placed.groundAnchorY），不再用 top+h：
  // placed 的 top 是「HUD 布局框」顶部（随最终姿态 Root 增量平移），top+h 在腾空/蹲姿段 ≠ 地面锚。
  const anchor = m.placed ? m.placed.groundAnchorY * m.dpr : null; // placed=逻辑像素 → 物理
  const anchorErr = anchor === null ? null : +Math.abs(anchor - m.cellPx.y).toFixed(2);
  const hudDrift = m.placed ? +((m.placed.top + m.placed.h - m.placed.groundAnchorY) * m.dpr).toFixed(2) : null; // 姿态补偿量（证据）
  foot[dsf] = { ...m, layerFoot, err, anchor, anchorErr };
  check(
    `dpr=${dsf} 渲染脚底对格心 ≤2 物理像素`,
    err !== null && err <= 2,
    `层包围盒=${JSON.stringify(m.layerBBox)} 脚底=${layerFoot} 格心=${m.cellPx.y.toFixed(2)} 误差=${err}px（背衬 ${m.glW}x${m.glH}）`,
  );
  check(
    `dpr=${dsf} placed 地面锚与格心同源（易错点 10；§4.1.1 分标）`,
    anchorErr !== null && anchorErr <= 1.5,
    `地面锚=${anchor?.toFixed(2)} 格心=${m.cellPx.y.toFixed(2)} Δ=${anchorErr}px（=格心整数化 ≤0.5 逻辑像素；` +
      `HUD 布局框顶=${((m.placed?.top ?? 0) * m.dpr).toFixed(2)}，姿态补偿量=${hudDrift}px）`,
  );
  check(`dpr=${dsf} 人物层有像素且尺寸随 dpr`, m.layerPx > 500 && !!m.layerBBox, `层不透明像素=${m.layerPx}`);
  await page.close();
}

// 量测②：主画布可观测（同机位参照 vs 正常；盒内强差异像素数）
{
  const grab = async (query) => {
    const page = await openPage(query, 2, { width: 560, height: 700 });
    await quiet(page);
    await setHero(page, { hexFacing: FACING_VEC.right, animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1 });
    await page.waitForTimeout(260);
    const info = await page.evaluate(() => {
      const h = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
      const p = window.__demo.character3d.placed;
      return { cellPx: window.__demo.cellPx(h.pos.q, h.pos.r), placed: p ? p.get('hero') ?? null : null, dpr: window.__demo.dpr };
    });
    const file = await shot(page, query ? 'measure_ref' : 'measure_idle');
    const geom = await pageGeom(page);
    await page.close();
    return { ...info, file, geom };
  };
  const ref = await grab('?char3d=loading');
  const cur = await grab('');
  const A = decodePng(ref.file);
  const B = decodePng(cur.file);
  const gi = cur.geom;
  const kShot = (gi.cssW * gi.dsf) / gi.pxW;
  const pl = cur.placed;
  const x0 = Math.round(gi.left * gi.dsf + (pl.cx - pl.w / 2) * cur.dpr * kShot);
  const x1 = Math.round(gi.left * gi.dsf + (pl.cx + pl.w / 2) * cur.dpr * kShot);
  const y0 = Math.round(gi.top * gi.dsf + pl.top * cur.dpr * kShot);
  const y1 = Math.round(gi.top * gi.dsf + (pl.top + pl.h) * cur.dpr * kShot);
  let strong = 0;
  for (let y = Math.max(0, y0); y < Math.min(A.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(A.width, x1); x++) {
      const s = (y * A.width + x) * 4;
      const d = Math.abs(A.rgba[s] - B.rgba[s]) + Math.abs(A.rgba[s + 1] - B.rgba[s + 1]) + Math.abs(A.rgba[s + 2] - B.rgba[s + 2]);
      if (d > 90) strong++;
    }
  }
  foot.canvas = { strong, box: [x0, y0, x1, y1], kShot };
  check('人物层已合成到主画布（盒内强差异像素）', strong > 500, `强差异像素=${strong} 盒=${JSON.stringify([x0, y0, x1, y1])}`);
  check('参照页（3D 未就绪）人物零绘制（无 2D 帧降级，§6.2）', ref.placed === null, `ref.placed=${JSON.stringify(ref.placed)}`);
}

// ══════════ 汇总 ══════════
for (const c of checks) console.log(c);
// ══════════ ⑦ 朝向回归门（T31 FE 朝向整改）：六向「脸朝哪边」实测断言 ══════════
// 判据（PM 口径，标定见 tools/measure_face_dir.mjs）：头部区域「肤重心 x − 发重心 x」；
// 美术 2D 参照 left=−29.9 / right=+29.9。**断言**：left* 必须 < −2、right* 必须 > +2
// （防「朝向映射错位」这类缺陷复发——历史缺陷：六向整体错位、left 渲成背面/right 渲成正面）。
{
  const page = await openPage('', 1, { width: 560, height: 700 });
  await quiet(page);
  const gateRows = [];
  for (const facing of FACINGS) {
    await setHero(page, { hexFacing: FACING_VEC[facing], animState: 'idle', animLeftMs: 0, isJump: false, moveT: 1 });
    await page.waitForTimeout(220);
    // 人物层裁剪（浅底纯色，便于「≠底色」取 bbox；与 tools/measure_facing_runtime.mjs 同法）
    const crop = await page.evaluate(([pad]) => {
      const gl = window.__char3d.canvas;
      const pl = window.__demo.character3d.placed?.get('hero');
      const h = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
      if (!pl) return null;
      const x0 = Math.max(0, Math.round(pl.cx - pl.w / 2 - pad));
      const y0 = Math.max(0, Math.round(pl.top - pad));
      const w = Math.min(gl.width - x0, Math.round(pl.w + pad * 2));
      const hh = Math.min(gl.height - y0, Math.round(pl.h + pad * 2));
      const t = document.createElement('canvas');
      t.width = w; t.height = hh;
      const tc = t.getContext('2d');
      tc.fillStyle = '#00ff00';
      tc.fillRect(0, 0, w, hh);
      tc.drawImage(gl, x0, y0, w, hh, 0, 0, w, hh);
      return { dataUrl: t.toDataURL('image/png'), facingHex: h ? h.facingHex : null };
    }, [12]);
    if (!crop) { check(`朝向门 ${facing} 有 placed`, false); continue; }
    const f = path.join(outDir, `c3d_facing_${facing}.png`);
    fs.writeFileSync(f, Buffer.from(crop.dataUrl.split(',')[1], 'base64'));
    written.push(path.basename(f));
    const img = decodePng(f);
    const m = measureFaceOnBackdrop(img);
    gateRows.push({ facing, actualFacingHex: crop.facingHex, ...m });
  }
  await page.close();
  for (const r of gateRows) {
    const left = r.facing.startsWith('left');
    const ok = typeof r.skinMinusHairX === 'number' && (left ? r.skinMinusHairX < -2 : r.skinMinusHairX > 2);
    check(
      `朝向门 ${r.facing}（判据 ${r.skinMinusHairX}；left* 应 <−2 / right* 应 >+2）`,
      ok && r.actualFacingHex === r.facing,
      `actual=${r.actualFacingHex} skinOfFg=${r.skinOfFg}`,
    );
  }
  // 左右镜像自证（幅度比值应有界，防"左右不成镜像"的历史形态）
  for (const d of ['left', 'leftdown', 'leftup']) {
    const l = gateRows.find((x) => x.facing === d);
    const rr = gateRows.find((x) => x.facing === d.replace('left', 'right'));
    if (l && rr && typeof l.skinMinusHairX === 'number' && typeof rr.skinMinusHairX === 'number') {
      const ratio = Math.abs(rr.skinMinusHairX) / Math.max(1e-6, Math.abs(l.skinMinusHairX));
      check(`朝向门 ${d}/${d.replace('left', 'right')} 幅度成镜像（比值 ${ratio.toFixed(2)} ∈ [0.4, 2.5]）`, ratio > 0.4 && ratio < 2.5);
    }
  }
  fs.writeFileSync(path.join(outDir, 'c3d_facing_gate.json'), JSON.stringify(gateRows, null, 1));
}

/** 纯色底裁剪图 → 判据（bbox = 与底色差异明显者；复用 measureFace 的肤/发口径）。 */
function measureFaceOnBackdrop(img) {
  const { width: w, height: h, rgba } = img;
  const bg = [rgba[0], rgba[1], rgba[2]];
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const d = Math.abs(rgba[o] - bg[0]) + Math.abs(rgba[o + 1] - bg[1]) + Math.abs(rgba[o + 2] - bg[2]);
    if (d > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return { ok: false };
  const copy = new Uint8Array(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
    const bgLike = Math.abs(rgba[o] - bg[0]) + Math.abs(rgba[o + 1] - bg[1]) + Math.abs(rgba[o + 2] - bg[2]) <= 40;
    if (!inside || bgLike) copy[o + 3] = 0;
  }
  return { ok: true, ...measureFace({ width: w, height: h, rgba: copy }) };
}


console.log(`\n[shot_character3d] 截图 ${written.length} 张 → ${outDir}`);
console.log(
  `[shot_character3d] 脚底量测（层渲染像素底边 vs 格心）：` +
    [1, 2, 3]
      .map((d) => `dpr=${d} 误差 ${foot[d].err}px / 锚差 ${foot[d].anchorErr}px / 层像素 ${foot[d].layerPx}`)
      .join(' · '),
);
console.log(
  `[shot_character3d] 边缘量测（过渡带「比两侧更暗」幅度，≤12 为通过）：` +
    fringeReport.map((r) => `${r.bgName}底 FXAA hair=${r.fxaaHair}/hem=${r.fxaaHem} · 无FXAA hair=${r.noaaHair}/hem=${r.noaaHem}`).join(' | '),
);
console.log(
  `[shot_character3d] 合成落屏：盒内强差异像素=${foot.canvas.strong}（盒=${JSON.stringify(foot.canvas.box)}）`,
);
console.log(
  `[shot_character3d] 轻功采样：` +
    Object.entries(jumpEvidence)
      .map(([t, v]) => `${t} 升(hop=${v?.rise.hop},isJump=${v?.rise.isJump}) 降(hop=${v?.desc.hop},isJump=${v?.desc.isJump},state=${v?.desc.state})`)
      .join(' · '),
);
// 【R1】轻功时间线证据落盘（JSON：逐帧样本 + 摘要；证据面不止图片）
const timelineFile = path.join(outDir, 'c3d_jump_timeline.json');
fs.writeFileSync(
  timelineFile,
  JSON.stringify(
    {
      note: 'R1=arch seq=419 修订乙：command.isJump 取 MoveAnim 创建时锁定的意图；session 的 isJump 窗=300ms，演出 0.6~1.2s。',
      sampling: {
        method: 'Node 侧轮询 page.evaluate（同既有 waitFlight），每样本约 20-40ms 墙钟；不在页内挂长 rAF 录制器（实测会让无头页在长任务后失联）',
        caveat:
          'viewT 是浏览器内的表现钟（权威逻辑序）；墙钟与 viewT 不成严格线性（rAF 追赶时 viewT 成簇前进），故 summary.windowCloseLatency 只是采样粒度下的近似、不作时长结论——精确时长断言在 tests/battle-character3d-wiring.test.ts（固定帧步长）',
      },
      capturedAt: new Date().toISOString(),
      timelines: jumpTimelines,
      attempts: timelineAttempts,
    },
    null,
    1,
  ),
);
console.log(`[shot_character3d] 轻功时间线 → ${path.basename(timelineFile)}`);
for (const [t, tl] of Object.entries(jumpTimelines)) {
  const S = tl.summary;
  console.log(
    `[shot_character3d] ${t} 时间线：样本 ${S.count} · 起跳 viewT=${S.takeoff?.viewT} hop=${S.takeoff?.hop} cmd=${S.takeoff?.cmdIsJump} clip=${S.takeoff?.clip}` +
      ` · 窗关闭 viewT=${S.windowClose?.viewT ?? 'n/a'} · 窗后 jump 样本 ${S.descendCount}（首 viewT=${S.descendFirst?.viewT} 末 viewT=${S.descendLast?.viewT} 末 hop=${S.descendLast?.hop}）` +
      ` · 顶点 viewT=${S.peak?.viewT} hop=${S.peak?.hop} clip=${S.peak?.clip} · 释放 viewT=${S.released?.viewT ?? 'n/a'} clip=${S.released?.clip ?? 'n/a'} · clips=${JSON.stringify(S.clips)}`,
  );
}
if (errors.length) {
  console.log('\n[shot_character3d] 页面错误：');
  for (const e of errors.slice(0, 20)) console.log('  ' + e);
}
const failed = checks.filter((c) => c.startsWith('FAIL'));
await browser.close();
console.log(`[shot_character3d] ${checks.length - failed.length}/${checks.length} PASS${errors.length ? ` · 页面错误 ${errors.length} 条` : ''}`);
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
