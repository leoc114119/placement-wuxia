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

/** 直写主角/指定单位演出态（快照出口 animState/facingHex 全真值）
 * 【T27 修复】playwright page.evaluate 只转发单个 arg——旧写法 (uid, f) 双形参使 fields 永远
 * 为 undefined、Object.assign 静默 no-op（六向/状态截图全部退化为同帧假证据，main 上第一段
 * 亦如此）；改单数组参数解构，与 placeNearHero/behavior_e2e placeFoe 同式。 */
async function setUnit(page, id, fields) {
  await page.evaluate(([uid, f]) => {
    const u = window.__demo.session._debug.units.find((x) => x.id === uid);
    Object.assign(u, f);
  }, [id, fields]);
}

/** 【T27 第二段】白盒布点：把敌棋摆到主角邻格（敌我同屏证据——镜头恒跟主角，敌出生在对角不在屏内）。
 * 与 behavior_e2e.mjs placeFoe 同式（hex/renderQ/renderR/moveFrom/moveT 一并对齐，清动画/条态）；
 * 候选格按 FIELD（col 4..11 / row 2..13，col=q+⌊r/2⌋）过滤并避开主角/其他单位所占格。 */
async function placeNearHero(page, id, prefer) {
  await page.evaluate(([fid, side]) => {
    const units = window.__demo.session._debug.units;
    const hero = units.find((x) => x.id === 'hero');
    const u = units.find((x) => x.id === fid);
    const inField = (q, r) => {
      const col = q + Math.floor(r / 2);
      return col >= 4 && col <= 11 && r >= 2 && r <= 13;
    };
    const taken = new Set(units.filter((x) => x.id !== fid).map((x) => `${x.hex.q},${x.hex.r}`));
    const { q, r } = hero.hex;
    const cands = side === 'right'
      ? [[q + 1, r], [q + 2, r], [q, r + 1], [q - 1, r]]
      : [[q - 1, r], [q - 2, r], [q, r - 1], [q + 1, r]];
    const pick = cands.find(([cq, cr]) => inField(cq, cr) && !taken.has(`${cq},${cr}`)) ?? cands[0];
    u.hex = { q: pick[0], r: pick[1] };
    u.renderQ = pick[0]; u.renderR = pick[1]; u.moveFromQ = pick[0]; u.moveFromR = pick[1];
    u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0; u.dead = false;
    u.bar = 0; u.barWasMax = false;
    if (u.hp <= 0) u.hp = 50;
  }, [id, prefer]);
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

  // ③ 跳跃（轻功链路：金格 → jump 单帧=腾空帧 _2；Leo 09-06 裁定去蓄势帧）
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

  // ⑤ 施放 cast1 / cast2 / cast3（【AS · TASK-AS-FE】charge=cast 1→3 整套循环——cast_1 取相位窗
  // [0,140ms) 首帧：等待压至 30ms（旧 90ms 定格语义下的余量在循环步频 140ms 内已不安全）；
  // strike=第2→3帧单播（cast_2 取 <140ms / cast_3 取 >140ms 步进后）
  await quiet(page);
  await setUnit(page, 'hero', { animState: 'charge', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(30);
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

  // ⑦ enemy 甲（npc-shanzei-a directional）六向 idle（【T27 第二段】直写 hexFacing → 快照 facingHex →
  //    battle_idle_{facing}.png；零翻转——左系=美术成品 PNG）。敌我同屏：主角复活为 idle，甲摆主角右邻、乙摆左邻
  await quiet(page);
  await setUnit(page, 'hero', { animState: 'idle', animLeftMs: 0, isJump: false });
  await placeNearHero(page, 'e1', 'right');
  await placeNearHero(page, 'e2', 'left');
  await page.waitForTimeout(120);
  for (const [name, vec] of FACINGS) {
    await quiet(page);
    await setUnit(page, 'e1', { hexFacing: vec, animState: 'idle', animLeftMs: 0, isJump: false });
    await page.waitForTimeout(90);
    await shot(page, `${tag}_enemyA_idle_${name}`);
  }

  // ⑧ enemy 甲 walk 1↔2（快照 walk 态时钟循环，pos==renderPos 不触发移动演出——纯帧循环证据）
  await quiet(page);
  await setUnit(page, 'e1', { hexFacing: FACINGS[0][1], animState: 'walk', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_enemyA_walk_1`);
  await page.waitForTimeout(140);
  await shot(page, `${tag}_enemyA_walk_2`);

  // ⑨ enemy 甲 basic atk_1→atk_2（§9.1.1：1→2 尾帧保持）
  await quiet(page);
  await setUnit(page, 'e1', { animState: 'basic', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_enemyA_basic_atk1`);
  await page.waitForTimeout(220);
  await shot(page, `${tag}_enemyA_basic_atk2`);

  // ⑩ enemy 施法相降级（§9.2.1 profile 数据映射）：charge→atk_1 定格 / strike→atk_2 单播保持
  await quiet(page);
  await setUnit(page, 'e1', { animState: 'charge', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_enemyA_charge_atk1`);
  await setUnit(page, 'e1', { animState: 'strike', animLeftMs: 9000, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_enemyA_strike_atk2`);

  // ⑪ 死亡白骨（§9.3）：甲 die_common 压扁淡出（不镜像不循环不挂武器锚）→ 乙（npc-shanzei-b）六向 idle + dead
  await quiet(page);
  await setUnit(page, 'e1', { animState: 'dead', animLeftMs: 0, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_enemyA_dead`);
  for (const [name, vec] of FACINGS) {
    await quiet(page);
    await setUnit(page, 'e2', { hexFacing: vec, animState: 'idle', animLeftMs: 0, isJump: false });
    await page.waitForTimeout(90);
    await shot(page, `${tag}_enemyB_idle_${name}`);
  }
  await quiet(page);
  await setUnit(page, 'e2', { animState: 'dead', animLeftMs: 0, isJump: false });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_enemyB_dead`);

  // 完整性门红锁（§9.2.2①：预检失败=本脚本报红，不以「能显示」代替资源通过）——主页面（directional 编成）
  const gate = await page.evaluate(() => ({
    ok: window.__demo.assetGate.ok,
    failures: window.__demo.assetGate.failures.length,
    keys: window.__demo.session.snapshot().actors.map((a) => `${a.id}:${a.spriteKey}`),
  }));
  if (!gate.ok) errors.push(`[${tag}] assetGate FAIL ×${gate.failures}`);
  written.push(`#gate:${gate.ok ? 'PASS' : 'FAIL'} keys=[${gate.keys.join(' ')}]`);

  // ⑫ legacy 显式回退诊断页（§9.2.2③）：URL ?enemy=legacy 整编成切 npc-shanzei-legacy 旧 8 帧条
  //   （独立页面整套目录，不与 directional 逐帧混用）——回退路径可用性证据
  await page.goto('file://' + path.join(here, 'index.html') + '?enemy=legacy');
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
  await page.waitForTimeout(800);
  await quiet(page);
  await placeNearHero(page, 'e1', 'right');
  await placeNearHero(page, 'e2', 'left');
  await setUnit(page, 'e1', { animState: 'idle', animLeftMs: 0 });
  await page.waitForTimeout(120);
  await shot(page, `${tag}_enemy_legacy_diag_idle`);
  await setUnit(page, 'e1', { animState: 'dead', animLeftMs: 0 });
  await page.waitForTimeout(90);
  await shot(page, `${tag}_enemy_legacy_diag_dead`);
  const legacyKeys = await page.evaluate(() => window.__demo.session.snapshot().actors.map((a) => `${a.id}:${a.spriteKey}`).join(' '));
  if (!legacyKeys.includes('npc-shanzei-legacy')) errors.push(`[${tag}] legacy 诊断页敌键异常：${legacyKeys}`);
  written.push(`#legacy-diag keys=[${legacyKeys}]`);

  await page.close();
}

await browser.close();
if (errors.length) {
  console.error('[shot_sixdir] pageerror:', errors);
  process.exit(1);
}
console.log(`[shot_sixdir] 完成 ${written.length} 张 → ${outDir}`);
console.log(written.join('\n'));
