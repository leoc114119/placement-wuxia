// ═══ T28 · hero 武器层接线 三视口截图证据 + 缺口诊断（《主角武器层接线实施方案》§7.5）═══
// 用法：node proto/battle_demo/shot_weapon_layer.mjs（先 node proto/battle_demo/build.mjs 重建 bundle）
// 产出：shots/weapon45_{tag}_{state}.png —— 375×667 / 560×700 / 900×560 三视口 ×
//       idle(right/left/rightup=body_front 剑在身后) / walk(真实移动链路中段) / atk(basic 尾帧+rightup_1 首帧)
//       + weapon45_gap_diag_900x560.png（walk_rightdown_2 第一批缺口=显式空手诊断，禁借帧证据）。
// 断言：每视口 assetGate ok=true 且零 hero-weapon-missing（26 帧武器层全载）；缺口帧触发
//       [weaponLayer 缺口] console 诊断。白盒直写演出态沿 shot_sixdir 惯例（快照全真值链路）；
//       视觉目验归 PM/Leo（Flash 档只留档）。
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'shots');

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

const written = [];
const errors = [];
const checkResults = [];
const check = (name, ok, detail = '') => {
  checkResults.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`);
  if (!ok) errors.push(`${name} ${detail}`);
};

const shot = async (page, name) => {
  const p = path.join(outDir, `weapon45_${name}.png`);
  await page.screenshot({ path: p });
  written.push(path.basename(p));
};

async function quiet(page) {
  await page.evaluate(() => {
    for (const u of window.__demo.session._debug.units) {
      u.bar = 0;
      u.barWasMax = false;
    }
  });
}

async function setUnit(page, id, fields) {
  await page.evaluate(([uid, f]) => {
    const u = window.__demo.session._debug.units.find((x) => x.id === uid);
    Object.assign(u, f);
  }, [id, fields]);
}

const FACINGS = {
  right: { q: 1, r: 0 },
  left: { q: -1, r: 0 },
  rightup: { q: 1, r: -1 },
  rightdown: { q: 0, r: 1 },
};

async function heroTurn(page) {
  await quiet(page);
  await page.evaluate(() => {
    window.__demo.session._debug.units.find((x) => x.id === 'hero').bar = 100;
  });
  await page.waitForFunction(() => window.__demo.session.snapshot().pendingInput === true, null, { timeout: 20000 });
}

async function clickCell(page, mode) {
  const p = await page.evaluate((m) => {
    const d = window.__demo;
    const s = d.session.snapshot();
    const hero = s.actors.find((a) => a.id === 'hero');
    const md = (c) =>
      m === 'farLinear'
        ? Math.hypot(c.q - hero.pos.q, c.r - hero.pos.r)
        : Math.abs(c.q - hero.pos.q) + Math.abs(c.r - hero.pos.r);
    const cell = s.moveCells.slice().sort((a, b) => md(b) - md(a))[0];
    if (!cell) return null;
    return d.cellCss(cell.q, cell.r);
  }, mode);
  if (!p) throw new Error('clickCell: 无候选格');
  await page.mouse.click(p.x, p.y);
}

for (const [vw, vh, tag] of [[375, 667, '375x667'], [560, 700, '560x700'], [900, 560, '900x560']]) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  const consoleLogs = [];
  page.on('console', (m) => consoleLogs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror ${e.message}`));
  await page.goto('file://' + path.join(here, 'index.html'));
  await page.waitForFunction(() => window.__demo !== undefined && window.__demo.assetsReady === true, null, { timeout: 20000 });
  await page.waitForTimeout(800); // 首帧渲染稳定

  // 武器层资源门：26 帧全载（缺任一=gate 红=本项 FAIL）
  const gate = await page.evaluate(() => window.__demo.assetGate);
  check(`[${tag}] assetGate ok`, gate.ok === true, gate.failures?.join(' | '));

  // ① idle right（weapon_front+拳孔）
  await quiet(page);
  await setUnit(page, 'hero', { hexFacing: FACINGS.right, animState: 'idle', animLeftMs: 0, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_idle_right`);
  // ② idle left（左镜像成品帧）
  await setUnit(page, 'hero', { hexFacing: FACINGS.left, animState: 'idle', animLeftMs: 0, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_idle_left`);
  // ③ idle rightup（body_front：剑在身后——layerOrder 证据帧）
  await setUnit(page, 'hero', { hexFacing: FACINGS.rightup, animState: 'idle', animLeftMs: 0, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_idle_rightup_bodyfront`);
  // ④ walk（真实移动链路：绿格点击 → moveAnim → walk 1↔2 循环；中段取帧）
  await heroTurn(page);
  await clickCell(page, 'far');
  await page.waitForTimeout(200);
  await shot(page, `${tag}_walk_mid`);
  await page.waitForTimeout(800); // 走完回 idle
  // ⑤ atk right_2（basic 单播尾帧=有剑帧）
  await quiet(page);
  await setUnit(page, 'hero', { hexFacing: FACINGS.right, animState: 'basic', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(310);
  await shot(page, `${tag}_atk_right_2`);
  // ⑥ atk rightup_1（basic 首帧=有剑帧，weapon_front）
  await setUnit(page, 'hero', { hexFacing: FACINGS.rightup, animState: 'basic', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_atk_rightup_1`);
  await page.close();
}

// ⑦ 缺口诊断（1 张）：walk rightdown 循环钉在 ordinal 2（walk_rightdown_2=第一批未覆盖）→
//    显式空手 + [weaponLayer 缺口] console 诊断；禁借邻帧/镜像的证据图
{
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  const consoleLogs = [];
  page.on('console', (m) => consoleLogs.push(m.text()));
  page.on('pageerror', (e) => errors.push(`[gapdiag] pageerror ${e.message}`));
  await page.goto('file://' + path.join(here, 'index.html'));
  await page.waitForFunction(() => window.__demo !== undefined && window.__demo.assetsReady === true, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await quiet(page);
  await setUnit(page, 'hero', { hexFacing: FACINGS.rightdown, animState: 'walk', animLeftMs: 9000, isJump: false });
  // 钉帧：view.anim walk 钟 t=0.15 → ordinal 2（140ms 步频；缺口帧 walk_rightdown_2）
  await page.evaluate(() => {
    const pin = () => {
      const c = window.__demo.getView().anim.get('hero');
      if (c && c.state === 'walk') c.t = 0.15;
      requestAnimationFrame(pin);
    };
    pin();
  });
  await page.waitForTimeout(300);
  const selInfo = await page.evaluate(() => {
    const v = window.__demo.getView();
    const hero = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
    return { anim: hero.animState, facingHex: hero.facingHex };
  });
  check('[gapdiag] 状态=walk+rightdown', selInfo.anim === 'walk' && selInfo.facingHex === 'rightdown', JSON.stringify(selInfo));
  const gapWarned = consoleLogs.some((t) => t.includes('[weaponLayer 缺口]') && t.includes('walk_rightdown_2.png'));
  check('[gapdiag] 缺口开发诊断已触发', gapWarned);
  await shot(page, 'gap_diag_900x560');
  const gate2 = await page.evaluate(() => window.__demo.assetGate);
  check('[gapdiag] 缺口帧不算资源债（gate 仍 ok）', gate2.ok === true, gate2.failures?.join(' | '));
  await page.close();
}

await browser.close();
console.log(`\n共 ${written.length} 张截图：`);
for (const w of written) console.log(`  shots/${w}`);
console.log(`\n${checkResults.join('\n')}`);
if (errors.length) {
  console.error(`\n[shot_weapon_layer] FAIL ×${errors.length}：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`\n[shot_weapon_layer] GATE PASS：三视口 idle/walk/atk 有剑帧 + 缺口诊断图；视觉目验待 PM/Leo（Flash 档留档）`);
