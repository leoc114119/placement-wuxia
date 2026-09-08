// ═══ T26 · WF-2 武功名条 表现证据链驱动（《武功名条方案-v0.1》§8 DoD）═══
// 用法：node proto/battle_demo/shot_wf_banner.mjs
// 产出：shots/wf_*.png + 控制台校验（任一 FAIL 退出码 1）：
// - 六档：x1/x2 × 375×667 / 560×700 / 900×560——te 特技金名条 t0 同帧留影（名字可读/颜色可辨待 PM 复验）
// - 绝学：x1/x2 @375×667——jue 金红渐变名条留影
// - 两 T 回放：快招 T=500ms（_debug 白盒覆写 internalCastSpeed=5.2）/ 慢招 T=3000ms（缺省）——
//   名条寿命均≈演出钟 1.000s（view.time 采样），不随 T 缩放；段 2 事件不重启（恰一次 0→1 跳变）
// - 白名单负证：普攻/轻功跳跃/rejected 不出字（activeCount 恒 0）
// - 全闪避 e2e：shizhan 白盒覆写 → 段 1 只有 miss 事件 → 名条仍恰 1 条（accepted 门双源）
// - 逃跑残留：名条活跃期 flee → 重开 → clearAll 后恒 0（方案 §4.2）
// 白盒说明：与 shot_as_cast.mjs 同款（_debug.units 摆位、layout 热区真实点击链路、
// __demo.getView()/wfBanner 只读引用采样演出钟）。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'shots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

const errors = [];
const checks = [];
const check = (id, ok, detail) => {
  checks.push(`${ok ? 'PASS' : 'FAIL'}  ${id} · ${detail}`);
  if (!ok) process.exitCode = 1;
};

let page = null;
const shot = async (name) => {
  await page.screenshot({ path: path.join(outDir, `wf_${name}.png`) });
};

/** 摆 e1 于 te 射程内画布内安全格（shot_as_cast 同款：避组件/边距，cube 2 优先） */
async function stageTeTarget() {
  const plan = await page.evaluate(() => {
    const d = window.__demo;
    const s = d.session.snapshot();
    const hero = s.actors.find((a) => a.id === 'hero');
    const rect = document.getElementById('cv').getBoundingClientRect();
    const L = d.getView().layout;
    const cube = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((a.q + a.r) - (b.q + b.r))) / 2;
    const occupied = new Set(s.actors.filter((a) => a.animState !== 'dead').map((a) => `${a.pos.q},${a.pos.r}`));
    const safe = (c) => {
      const p = d.cellCss(c.q, c.r);
      const lx = p.x - rect.left;
      const ly = p.y - rect.top;
      if (lx < 40 || lx > d.W - 40 || ly < 120 || ly > d.H - 80) return false;
      const inRect = (r) => r && lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h;
      if (inRect(L.ctrlRect) || inRect(L.plaqueRect)) return false;
      if (L.skillBtns.some((b) => { const rr = b.r * 1.3; return (lx - b.x) ** 2 + (ly - b.y) ** 2 <= rr * rr; })) return false;
      return true;
    };
    const cell = s.attackCells.filter((c) => !occupied.has(`${c.q},${c.r}`) && safe(c)).sort((a, b) => cube(b, hero.pos) - cube(a, hero.pos))[0] ?? null;
    return { cell };
  });
  if (!plan.cell) throw new Error('无安全目标格');
  await page.evaluate((c) => {
    const u = window.__demo.session._debug.units.find((x) => x.id === 'e1');
    u.hex = { q: c.q, r: c.r };
    u.renderQ = c.q; u.renderR = c.r; u.moveFromQ = c.q; u.moveFromR = c.r;
    u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0; u.dead = false;
    u.bar = 0; u.barWasMax = false;
    if (u.hp <= 0) u.hp = 50;
  }, plan.cell);
  return plan.cell;
}

async function waitHeroTurn() {
  await page.waitForFunction(() => window.__demo.session.snapshot().pendingInput === true, null, { timeout: 40000 });
  await page.waitForFunction(() => window.__demo.getView().skillPop > 0.9, null, { timeout: 6000 });
}

async function tapBtn(id) {
  const p = await page.evaluate((bid) => window.__demo.btnCss(bid), id);
  if (!p) throw new Error(`btnCss(${id})=null`);
  await page.mouse.click(p.x, p.y);
}

/** 点 e1 当前格提交 cast，等首条 skill/miss 事件（t0）+ 宿主消费帧（事件在指针处理器内同步
 * 产生、fan-out 在下一帧 rAF 消费——双 rAF 等待防观察侧抢跑） */
async function castAtEnemy(skillId) {
  const ev0 = await page.evaluate(() => window.__demo.session.events.length);
  const p = await page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    const e1 = s.actors.find((a) => a.id === 'e1');
    return window.__demo.cellCss(e1.pos.q, e1.pos.r);
  });
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(
    (n0) => window.__demo.session.events.slice(n0).some((e) => (e.type === 'skill' || e.type === 'miss') && e.actorId === 'hero'),
    ev0,
    { timeout: 8000 },
  );
  const evT = await page.evaluate(
    (n0) => window.__demo.session.events.slice(n0).find((e) => (e.type === 'skill' || e.type === 'miss') && e.actorId === 'hero').t,
    ev0,
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return evT; // t0（session 钟=演出钟同速同源；寿命测量的起点锚）
}

/** 名条生命周期测量（演出钟 view.time 系）：两段式——先预挂页内 16ms 采样器（点击 cast 前，
 * 首活样本≈真实起点、归零样本≈真实到期，无 playwright 往返噪声），施法后取回轨迹算统计。
 * 注意：session 事件钟与 view.time 不同零点（输入等待期相位漂移），禁用事件 t 作起点锚。 */
function armLifeSampler(maxWallMs = 15000) {
  return page.evaluate(
    (cap) =>
      new Promise((resolve) => {
        const out = [];
        const iv = setInterval(() => {
          out.push({ n: window.__demo.wfBanner.activeCount, vt: window.__demo.getView().time });
          const m = out.length;
          if (m >= 3 && out[m - 1].n === 0 && out[m - 2].n > 0) {
            clearInterval(iv);
            resolve(out);
          }
        }, 16);
        setTimeout(() => {
          clearInterval(iv);
          resolve(out);
        }, cap);
      }),
    maxWallMs,
  );
}

function lifeStats(samples) {
  const firstActive = samples.findIndex((s) => s.n > 0);
  if (firstActive < 0) return { durationSec: -1, transitions: 0, maxN: 0 };
  let transitions = 1;
  let maxN = 0;
  for (let i = firstActive; i < samples.length; i++) {
    maxN = Math.max(maxN, samples[i].n);
    if (i > firstActive && samples[i].n > 0 && samples[i - 1].n === 0) transitions++; // 0→1 跳变=重启
  }
  const zeroAfter = samples.find((s, i) => i > firstActive && s.n === 0 && samples[i - 1].n > 0);
  const durationSec = zeroAfter ? +(zeroAfter.vt - samples[firstActive].vt).toFixed(3) : -1;
  return { durationSec, transitions, maxN };
}

// ---------- 1) 六档：x1/x2 × 三视口（te 特技金） ----------
for (const [vw, vh, tag] of [[375, 667, '375x667'], [560, 700, '560x700'], [900, 560, '900x560']]) {
  for (const [speedTag, speedOn] of [['x1', false], ['x2', true]]) {
    page = await browser.newPage({ viewport: { width: vw, height: vh } });
    page.on('pageerror', (e) => errors.push(`[te/${speedTag}/${tag}] ${e.message}`));
    console.log(`[shot_wf_banner] te → ${speedTag} @ ${tag}`);
    await page.goto('file://' + path.join(here, 'index.html'));
    await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
    await page.waitForTimeout(800);
    if (speedOn) {
      const p = await page.evaluate(() => {
        const r = window.__demo.getView().layout.ctrlRect;
        return window.__demo.cssOf(r.x + ((5 + 213 / 2) / 223) * r.w, r.y + ((163 + 126 / 2) / 448) * r.h);
      });
      await page.mouse.click(p.x, p.y);
      await page.waitForFunction(() => window.__demo.getView().uiState.speed === true, null, { timeout: 4000 });
    }
    await waitHeroTurn();
    await tapBtn('te');
    await page.waitForTimeout(300);
    await stageTeTarget();
    const sampler = armLifeSampler();
    await castAtEnemy('te');
    // t0 名条在画：受控等待后留影（快门落保持段——x1 等 350ms→p≈0.35 / x2 等 150ms→p≈0.3，
    // 截图编码延迟不再吃相位）；先拍后断言
    await page.waitForTimeout(speedOn ? 150 : 350);
    await shot(`${speedTag}_${tag}`);
    const at0 = await page.evaluate(() => ({ n: window.__demo.wfBanner.activeCount, vt: window.__demo.getView().time }));
    check(`te ${speedTag}/${tag} t0 名条在画（恰 1 条）`, at0.n === 1, `activeCount=${at0.n}`);
    const life = lifeStats(await sampler);
    check(`te ${speedTag}/${tag} 寿命≈演出钟 1.000s（不随 T 缩放）`, life.durationSec >= 0.85 && life.durationSec <= 1.45 && life.transitions === 1,
      `duration=${life.durationSec}s（view.time 系）transitions=${life.transitions}（T=${speedOn ? 'x2 加速演出钟' : 'x1'}）`);
    await page.close();
  }
}

// ---------- 2) 绝学金红渐变（jue，x1/x2 @375×667） ----------
for (const speedTag of ['x1', 'x2']) {
  page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  page.on('pageerror', (e) => errors.push(`[jue/${speedTag}] ${e.message}`));
  console.log(`[shot_wf_banner] jue → ${speedTag}`);
  await page.goto('file://' + path.join(here, 'index.html'));
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
  await page.waitForTimeout(800);
  if (speedTag === 'x2') {
    const p = await page.evaluate(() => {
      const r = window.__demo.getView().layout.ctrlRect;
      return window.__demo.cssOf(r.x + ((5 + 213 / 2) / 223) * r.w, r.y + ((163 + 126 / 2) / 448) * r.h);
    });
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(() => window.__demo.getView().uiState.speed === true, null, { timeout: 4000 });
  }
  await waitHeroTurn();
  await tapBtn('jue');
  await page.waitForTimeout(300);
  await stageTeTarget();
  const sampler = armLifeSampler();
  await castAtEnemy('jue');
  await page.waitForTimeout(speedTag === 'x2' ? 150 : 350); // 快门落保持段（同 te 环）
  await shot(`jue_${speedTag}_375x667`); // 先拍后断言
  const at0 = await page.evaluate(() => window.__demo.wfBanner.activeCount);
  check(`jue ${speedTag} t0 名条在画（绝学白名单）`, at0 === 1, `activeCount=${at0}`);
  const life = lifeStats(await sampler);
  check(`jue ${speedTag} 寿命≈1.000s 恰一条`, life.durationSec >= 0.85 && life.durationSec <= 1.45 && life.transitions === 1, `duration=${life.durationSec}s transitions=${life.transitions}`);
  await page.close();
}

// ---------- 3) 两 T 回放：快招 T=500ms / 慢招 T=3000ms（名条均 1.000s @x1） ----------
for (const [tTag, internalSpeed] of [['fast_T500ms', 5.2], ['slow_T3000ms', undefined]]) {
  page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  page.on('pageerror', (e) => errors.push(`[${tTag}] ${e.message}`));
  console.log(`[shot_wf_banner] ${tTag}`);
  await page.goto('file://' + path.join(here, 'index.html'));
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
  await page.waitForTimeout(800);
  await waitHeroTurn();
  if (internalSpeed !== undefined) {
    await page.evaluate((v) => {
      const hero = window.__demo.session._debug.units.find((x) => x.id === 'hero');
      hero.internalCastSpeed = v; // castSpeed 0.8+5.2=6 → castDuration=3000/6=500ms（core 唯一真值合成）
    }, internalSpeed);
  }
  await tapBtn('te');
  await page.waitForTimeout(300);
  await stageTeTarget();
  const sampler = armLifeSampler(15000);
  await castAtEnemy('te');
  await shot(tTag); // t0 留影
  const life = lifeStats(await sampler);
  check(`${tTag} 名条寿命≈1.000s 恰一条（T 变名条不变）`, life.durationSec >= 0.85 && life.durationSec <= 1.45 && life.transitions === 1,
    `duration=${life.durationSec}s transitions=${life.transitions}（出招 T=500/3000ms 两档）`);
  await page.close();
}

// ---------- 4) 白名单负证：普攻/轻功/rejected 不出字 + 全闪避出字 + 逃跑清空 ----------
page = await browser.newPage({ viewport: { width: 375, height: 667 } });
page.on('pageerror', (e) => errors.push(`[neg] ${e.message}`));
console.log('[shot_wf_banner] negatives + allmiss + flee');
await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
await page.waitForTimeout(800);

// 4a 普攻：点敌（无技能态）→ 名条恒 0
await waitHeroTurn();
{
  const p = await page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    const foe = s.actors.find((a) => a.side === 'enemy' && a.animState !== 'dead');
    return window.__demo.cellCss(foe.renderPos.q, foe.renderPos.r);
  });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(900); // 普攻演出窗内采样
  const n = await page.evaluate(() => window.__demo.wfBanner.activeCount);
  check('负证 普攻不出名条', n === 0, `activeCount=${n}`);
}

// 4b 轻功跳跃：qing 金格 → 点远格跳跃 → 名条恒 0
await waitHeroTurn();
await tapBtn('qing');
await page.waitForTimeout(350);
{
  const st = await page.evaluate(() => window.__demo.session.snapshot());
  check('负证 轻功激活（jump 态在）', st.moveKind === 'jump' && st.moveCells.length > 0, `kind=${st.moveKind} cells=${st.moveCells.length}`);
  const jp = await page.evaluate(() => {
    const d = window.__demo;
    const s = d.session.snapshot();
    const hero = s.actors.find((a) => a.id === 'hero');
    const far = s.moveCells.slice().sort((a, b) => Math.hypot(b.q - hero.pos.q, b.r - hero.pos.r) - Math.hypot(a.q - hero.pos.q, a.r - hero.pos.r))[0];
    return d.cellCss(far.q, far.r);
  });
  await page.mouse.click(jp.x, jp.y);
  await page.waitForTimeout(700); // 跳跃演出窗内采样
  const n = await page.evaluate(() => window.__demo.wfBanner.activeCount);
  check('负证 轻功不出名条', n === 0, `activeCount=${n}`);
}

// 4c rejected：bar 未满提交 attack → rejected('bar') 冒字线（T15 R3）不触名条
await page.waitForTimeout(300);
{
  const r = await page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    const foe = s.actors.find((a) => a.side === 'enemy' && a.animState !== 'dead');
    const ev0 = s ? window.__demo.session.events.length : 0;
    window.__demo.session.submit({ type: 'attack', targetId: foe.id, skillId: null }); // bar 未满 → rejected
    return { rej: window.__demo.session.events.slice(ev0).some((e) => e.type === 'rejected'), n: window.__demo.wfBanner.activeCount };
  });
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => window.__demo.wfBanner.activeCount);
  check('负证 rejected 不出名条', r.n === 0 && n === 0, `提交时=${r.n} 冒字窗内=${n}`);
}

// 4d 全闪避 e2e：shizhan 白盒覆写 → 段 1 只有 miss → 名条仍恰 1 条
//（确定性摆位：hero=(col4,row13) / e1=东 cube2=(col6,row13)，单测触发矩阵 harness 同款；
// 跳跃后页面状态不复用 stageTeTarget——camera 回拉 0.22s 留 settle 窗）
await waitHeroTurn();
{
  await page.evaluate(() => {
    const axial = (col, row) => ({ q: col - Math.floor(row / 2), r: row });
    const place = (id, col, row) => {
      const u = window.__demo.session._debug.units.find((x) => x.id === id);
      const hex = axial(col, row);
      u.hex = { ...hex };
      u.renderQ = hex.q; u.renderR = hex.r; u.moveFromQ = hex.q; u.moveFromR = hex.r;
      u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0; u.dead = false;
      u.pendingAnim = null; u.movePath = []; u.bar = 100; u.barWasMax = false;
      if (u.hp <= 0) u.hp = 50;
    };
    place('hero', 4, 13);
    place('e1', 6, 13);
    const hero = window.__demo.session._debug.units.find((x) => x.id === 'hero');
    hero.shizhan = -85_000_001; // hitRate<0 恒 miss（fx-player harness 同款）
  });
  await page.waitForTimeout(700); // 镜头平滑回拉（tau 0.22s）settle
  await tapBtn('te');
  await page.waitForTimeout(300);
  const ev0 = await page.evaluate(() => window.__demo.session.events.length);
  const p = await page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    const e1 = s.actors.find((a) => a.id === 'e1');
    return window.__demo.cellCss(e1.pos.q, e1.pos.r);
  });
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(
    (n0) => window.__demo.session.events.slice(n0).some((e) => e.type === 'miss' && e.actorId === 'hero'),
    ev0,
    { timeout: 8000 },
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // 宿主消费帧
  const kinds = await page.evaluate((n0) => window.__demo.session.events.slice(n0).map((e) => e.type), ev0);
  const n = await page.evaluate(() => window.__demo.wfBanner.activeCount);
  check('全闪避 e2e 名条仍出（仅 miss 事件，恰 1 条）', kinds.includes('miss') && !kinds.includes('skill') && n === 1,
    `events=[${kinds.join(',')}] activeCount=${n}`);
  await shot('allmiss_seg1');
}

// 4e 逃跑残留：名条活跃期 flee → 重开 → clearAll 恒 0（jue 出招避开 te 冷却）
{
  await waitHeroTurn();
  await tapBtn('jue');
  await page.waitForTimeout(300);
  await castAtEnemy('jue');
  const active = await page.evaluate(() => window.__demo.wfBanner.activeCount);
  await page.evaluate(() => window.__demo.session.submit({ type: 'flee' })); // 逃跑终局（fled）
  const click = await page.evaluate(() => window.__demo.cssOf(window.__demo.W / 2, window.__demo.H / 2));
  await page.mouse.click(click.x, click.y); // 结算遮罩点击 → resetDemo（clearAll）
  const after = await page.evaluate(() => ({ n: window.__demo.wfBanner.activeCount, phase: window.__demo.session.snapshot().phase }));
  check('逃跑+重开无残留（名条活跃→flee→reset 后恒 0）', active === 1 && after.n === 0 && after.phase === 'fighting',
    `flee 前=${active} reset 后=${after.n} phase=${after.phase}`);
}

await page.close();
await browser.close();
console.log(checks.join('\n'));
if (errors.length) {
  console.error('[shot_wf_banner] pageerror:', errors);
  process.exitCode = 1;
}
console.log(`[shot_wf_banner] 完成 → ${outDir}`);
