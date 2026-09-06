// ═══ 战斗人物六向帧接线·第一段 三档截图证据驱动（《战斗人物六向帧接线方案》§6.3）═══
// 用法：node proto/battle_demo/shot_sixdir.mjs
// 产出：shots/t45six_{档}_{类目}.png —— 三档（375×667 / 560×700 / 900×560）×
//       六向 idle / 步行 / 跳跃 / 普攻(1→2) / 施放(cast1/2/3) / 死亡(die_common) / enemy legacy。
// 白盒说明：六向与演出态经 __demo.session._debug.units 直写（快照出口 hexFacingName/animState
//       全真值链路）——证据生成专用，隔离「facingHex→frameKey」选帧表现的观测噪声；
//       真实交互链路（点击/移动/出招/镜头）由 shot.mjs + behavior_e2e.mjs 既有 16+11 项锁定。
// 与 shot.mjs 分工：shot.mjs = 组件/交互断言（不动）；本文件 = 六向接线视觉证据，只留档不断言。
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'shots');

const FACINGS = [
  ['right', { q: 1, r: 0 }],
  ['rightup', { q: 1, r: -1 }],
  ['leftup', { q: 0, r: -1 }],
  ['left', { q: -1, r: 0 }],
  ['leftdown', { q: -1, r: 1 }],
  ['rightdown', { q: 0, r: 1 }],
];

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

const written = [];
const errors = [];
const shot = async (page, name) => {
  const p = path.join(outDir, `t45six_${name}.png`);
  await page.screenshot({ path: p });
  written.push(path.basename(p));
};

/** 冻结行动条：证据窗口内敌我均不行动（白盒仅证据驱动用，非生产路径） */
async function quiet(page) {
  await page.evaluate(() => {
    for (const u of window.__demo.session._debug.units) {
      u.bar = 0;
      u.barWasMax = false;
    }
  });
}

/** 直写主角/指定单位演出态（快照出口 animState/facingHex 全真值） */
async function setUnit(page, id, fields) {
  await page.evaluate((uid, f) => {
    const u = window.__demo.session._debug.units.find((x) => x.id === uid);
    Object.assign(u, f);
  }, id, fields);
}

/** 拉满主角条至输入态（真实 BAR 链路） */
async function heroTurn(page) {
  await quiet(page);
  await page.evaluate(() => {
    window.__demo.session._debug.units.find((x) => x.id === 'hero').bar = 100;
  });
  await page.waitForFunction(() => window.__demo.session.snapshot().pendingInput === true, null, { timeout: 20000 });
}

/** 点击某逻辑格（cellCss 换算与 shot.mjs 同源；mode='far'|'farLinear' 取可达集中最远格） */
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
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  await page.goto('file://' + path.join(here, 'index.html'));
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
  await page.waitForTimeout(800); // 资源解码 + 首帧

  // ① 六向 idle（每向：直写 hexFacing → 快照 facingHex → battle_idle_{facing}.png）
  for (const [name, vec] of FACINGS) {
    await quiet(page);
    await setUnit(page, 'hero', { hexFacing: vec, animState: 'idle', animLeftMs: 0, isJump: false });
    await page.waitForTimeout(90);
    await shot(page, `${tag}_idle_${name}`);
  }

  // ② 步行（真实移动链路：绿格点击 → moveAnim → walk 1↔2；中段取帧 2）
  await heroTurn(page);
  await clickCell(page, 'far');
  await page.waitForTimeout(200);
  await shot(page, `${tag}_walk_mid`);

  // ③ 跳跃（轻功链路：金格 → jump 1→2；腾空段取帧 2）
  await heroTurn(page);
  await page.waitForFunction(() => window.__demo.getView().skillPop > 0.9, null, { timeout: 6000 }).catch(() => {});
  const qing = await page.evaluate(() => window.__demo.btnCss('qing'));
  await page.mouse.click(qing.x, qing.y);
  await page.waitForTimeout(350);
  await clickCell(page, 'farLinear');
  await page.waitForTimeout(330);
  await shot(page, `${tag}_jump_air`);

  // ④ 普攻 atk1→atk2（直写 basic 态：140ms 步频两帧）
  await quiet(page);
  await setUnit(page, 'hero', { animState: 'basic', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_basic_atk1`);
  await page.waitForTimeout(220);
  await shot(page, `${tag}_basic_atk2`);

  // ⑤ 施放 cast1 / cast2 / cast3（charge=第1帧；strike=第2→3帧）
  await quiet(page);
  await setUnit(page, 'hero', { animState: 'charge', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_cast_1`);
  await setUnit(page, 'hero', { animState: 'strike', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_cast_2`);
  await page.waitForTimeout(220);
  await shot(page, `${tag}_cast_3`);

  // ⑥ 死亡：hero die_common（六向共用压扁淡出）
  await quiet(page);
  await setUnit(page, 'hero', { animState: 'dead', animLeftMs: 0, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_hero_die`);

  // ⑦ enemy legacy：idle（翻转整图 spr 帧）+ 死亡压扁（第一段零迁移证据）
  await quiet(page);
  await setUnit(page, 'e1', { animState: 'idle', animLeftMs: 0 });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_enemy_legacy_idle`);
  await setUnit(page, 'e1', { animState: 'dead', animLeftMs: 0 });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_enemy_legacy_dead`);

  await page.close();
}

await browser.close();
if (errors.length) {
  console.error('[shot_sixdir] pageerror:', errors);
  process.exit(1);
}
console.log(`[shot_sixdir] 完成 ${written.length} 张 → ${outDir}`);
console.log(written.join('\n'));
