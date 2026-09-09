// ═══ T29 · hero 武器层 R2 三视口截图证据（方案 v2.1 §8-4：独立剑模运行时合成+越界长剑）═══
// 用法：node proto/battle_demo/shot_weapon_layer.mjs（先 node proto/battle_demo/build.mjs 重建 bundle）
// 产出：shots/weapon45_{tag}_{state}.png —— 375×667 / 560×700 / 900×560 三视口 ×
//       idle_right(weapon_front+挖拳) / idle_left(左系) / idle_rightup(body_front 剑在身后) /
//       walk(真实移动链路中段) / atk_right_2(越界长剑：layer 右越身体矩形 29.7px 源≈11px 屏) /
//       cast_right_2(施法越界：layer 右越 22.5px 源)
// 断言：每视口 assetGate ok=true 且零 hero-weapon-missing（48 行武器层全载）；
//       gap 诊断在 48 行覆盖下恒空（若触发=FAIL）。白盒直写演出态沿 shot_sixdir 惯例（快照全真值链路）；
//       视觉目验归 PM/Leo（Flash 档只留档；Leo 验收点=出招长剑完整显示不截断）。
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

  // 武器层资源门：48 行全载（缺任一=gate 红=本项 FAIL）
  const gate = await page.evaluate(() => window.__demo.assetGate);
  check(`[${tag}] assetGate ok（48 行全载）`, gate.ok === true, gate.failures?.join(' | '));

  // ① idle right（weapon_front+拳孔挖挖）
  await quiet(page);
  await setUnit(page, 'hero', { hexFacing: FACINGS.right, animState: 'idle', animLeftMs: 0, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_idle_right`);
  // ② idle left（左系独立剑模，零运行时镜像证据帧）
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
  // ⑤ atk right_2（basic 尾帧=越界长剑帧：frame04 layer 右越身体矩形，Leo 验收点主证据）
  await quiet(page);
  await setUnit(page, 'hero', { hexFacing: FACINGS.right, animState: 'basic', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(310);
  await shot(page, `${tag}_atk_right_2`);
  // ⑥ cast right_2（strike 单播中段=施法越界帧：frame15 layer 右越 22.5px 源）
  await setUnit(page, 'hero', { hexFacing: FACINGS.right, animState: 'strike', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(180);
  await shot(page, `${tag}_cast_right_2`);

  // gap 诊断恒空（48 行覆盖下触发=配置债）
  const gapWarned = consoleLogs.some((t) => t.includes('[weaponLayer 缺口]'));
  check(`[${tag}] 缺口诊断恒空`, !gapWarned);
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
console.log(`\n[shot_weapon_layer] GATE PASS：三视口 idle/左系/body_front/walk/atk 越界长剑/cast 全留档；视觉目验待 PM/Leo（Flash 档留档）`);
