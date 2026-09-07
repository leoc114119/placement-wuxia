// ═══ 战斗行为面 e2e（真浏览器 · 复盘任务交付 · 2026-09-02）═══
// 用法：node proto/battle_demo/behavior_e2e.mjs
// 与 shot.mjs 的分工：shot.mjs = 组件/渲染断言（不动）；本文件 = 《战斗交互行为规格》行为断言。
// 语义：预期红（=活缺陷登记簿）+ 预期绿（=链路锁）双向核对——
//   · 预期红用例变绿 = 对应缺陷已修：更新文件头登记表后应转预期绿；
//   · 预期绿用例变红 = 回归（真回归，不是登记簿）。
// 退出码：全部符合预期 0；任何不符合 1（无人值守可判）。
//
// ─── 红名单（与 tests/battle-behavior.test.ts 文件头同源维护）───
// | 用例  | 缺陷号 | 根因层 | 登记日 | 修复 commit |
// |-------|--------|--------|--------|-------------|
// | BE2🟢  | N2 | 空红格零反馈（input 层 + 规格缺口 ATK-2/ATK-5 之间） | 09-02 | T20-FE 09-03（本卡交付提交，hash 见 git log；按 ATK-6 v2.0 格子目标化重写=cast 空放受理预期绿）；T22 09-03 按 v2.2 改写：空放段前全体敌白盒出射程（空放=射程内无存活敌，方案 §四-8），断言本体保持 |
// | BE3a🟢 | N2 | 敌演出位≠逻辑格时点可见位 → 误取消选中（input 命中层） | 09-02 | T20-FE 09-03（本卡交付提交，hash 见 git log；按 ATK-7/SEL-5② v2.0 拆双例：射程内=cast 受理，预期绿）；T22 09-03 按 ATK-7 v2.2 断言翻转=施放全范围生效（e1 受击）+ e2 白盒核位（Q-T22-B） |
// | BE3b🟢 | N2 | 同上（拆双例） | 09-02 | T20-FE 09-03（本卡交付提交，hash 见 git log；射程外=cancelSkill 规范取消+无 skill 事件+资源零消耗，预期绿；e2e 用例 4→5） |
// | BE4🟢  | N1 | ATK-3 覆写 walk → moveAnim 不启动 → 直线插值穿人（FE 演出触发+session 回退轨） | 09-02 | T19 批一 09-03（本卡交付提交，hash 见 git log） |
// BE1 = 绿锁（特技施放全链，受理/结算层无病的端到端证据）。
// T19 批一（09-03）终态：BE1 绿锁 / BE2·BE3 预期红（二批）/ BE4 转预期绿。
// T20-FE（09-03）终态：全部预期绿（BE2 按 ATK-6 v2.0 翻转；BE3 按 ATK-7/SEL-5② v2.0 拆 BE3a/BE3b，
// 用例 4→5；规格依据=《战斗交互行为规格》v2.1 + 修复方案 §五对照表，PM 裁决放行）。
// T22（09-03）终态：BE2/BE3a/HF2 随规格 v2.2 AOE 五点配套改写（BE2/HF2 空放段=全体敌出射程；
// BE3a 断言翻转=施放全范围生效）；BE1/BE3b/BE4/HF1/HF3/HF4 零改自然 MATCH。规格依据=
// 《战斗交互行为规格》v2.2 + 《特绝范围AOE修正方案-v0.1》§二.2，PM 裁决放行（Q-T22-A/B 采建议案）。
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
const page = await browser.newPage({ viewport: { width: 450, height: 800 } });
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

const results = []; // {id, expectRed, expect, actual, ok, match, detail}
const report = (id, expectRed, ok, detail) => {
  const actual = ok ? '绿' : '红';
  const match = expectRed ? !ok : ok;
  results.push({ id, expectRed, expect: expectRed ? '红(登记缺陷)' : '绿(链路锁)', actual, match, detail });
  console.log(`${match ? 'MATCH' : 'MISMATCH'}  ${id} 预期=${expectRed ? '红' : '绿'} 实际=${actual} · ${detail}`);
};

const waitHeroTurn = async () => {
  try {
    await page.waitForFunction(() => window.__demo.session.snapshot().pendingInput === true, null, { timeout: 40000 });
  } catch {
    const st = await page.evaluate(() => {
      const s = window.__demo.session.snapshot();
      const hero = s.actors.find((a) => a.id === 'hero');
      return { phase: s.phase, mode: window.__demo.session._debug.mode(), heroBar: hero.actionBar, heroHp: hero.hp, evTail: window.__demo.session.events.slice(-5).map((e) => e.type + (e.actorId ? ':' + e.actorId : '')) };
    });
    throw new Error('waitHeroTurn 超时，现场：' + JSON.stringify(st));
  }
};
const waitPop = () =>
  page.waitForFunction(() => window.__demo.getView().skillPop > 0.9, null, { timeout: 6000 });
const snapState = () =>
  page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    return {
      phase: s.phase, pending: s.pendingInput, selected: s.selectedSkill,
      moveN: s.moveCells.length, atkN: s.attackCells.length,
      hero: s.actors.find((a) => a.id === 'hero'),
      foes: s.actors.filter((a) => a.side === 'enemy').map((a) => ({ id: a.id, hp: a.hp, pos: a.pos, renderPos: a.renderPos, animState: a.animState })),
      evN: window.__demo.session.events.length,
      fxN: window.__demo.getView().fx.length,
    };
  });
async function tapSkill(id) {
  const p = await page.evaluate((sid) => window.__demo.btnCss(sid), id);
  if (!p) throw new Error(`btnCss(${id})=null`);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
}
/** 白盒布点（测试基建）：把敌棋摆到确定位置并清动画/行动条态——断言仍走真实点击/渲染链。
 * bar 清零：主角输入等待期敌方行动条照常填充（仅总时钟 t 冻结，BAR-4），不清条敌棋会在
 * 测试窗口内自行行动（09-02 取证实证：BE1 首跑即被敌棋自行走位打断）。 */
const placeFoe = (id, q, r) =>
  page.evaluate(([fid, fq, fr]) => {
    const u = window.__demo.session._debug.units.find((x) => x.id === fid);
    if (!u) return { err: 'no unit ' + fid };
    u.hex = { q: fq, r: fr };
    u.renderQ = fq; u.renderR = fr; u.moveFromQ = fq; u.moveFromR = fr;
    u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0; u.dead = false;
    u.bar = 0; u.barWasMax = false;
    if (u.hp <= 0) u.hp = 50;
    return { ok: true };
  }, [id, q, r]);

await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
await page.waitForTimeout(800);
const bootLogs = consoleLines.filter((l) => l.includes('battle_demo'));
console.log(bootLogs.join('\n'));

// ═══ BE1（绿锁 · N2 受理/结算链端到端）：选特 → 点射程内敌人（静止）→ 施放生效 ═══
{
  await waitHeroTurn();
  await waitPop();
  const hero = (await snapState()).hero;
  // 敌棋摆到特射程内（cube 距离 2）且静止
  const eq = hero.pos.q + 2, er = hero.pos.r;
  await placeFoe('e1', eq, er);
  await tapSkill('te');
  let st = await snapState();
  const redHasFoe = await page.evaluate(
    ([fq, fr]) => window.__demo.session.snapshot().attackCells.some((c) => c.q === fq && c.r === fr),
    [eq, er],
  );
  const neili0 = st.hero.neili, hp0 = st.foes.find((f) => f.id === 'e1').hp, ev0 = st.evN;
  const p = await page.evaluate(([fq, fr]) => window.__demo.cellCss(fq, fr), [eq, er]);
  await page.mouse.click(p.x, p.y);
  // 【AS 采样窗口改写·PM Q2 授权（TASK-AS-BE）】技能=提交即排程，段1 事件在 t1≈3s（v1.3 AS-2/3）——
  // 等结算事件落地再采样（断言体零改；敌条已清、我方条未满，窗内无他事件源）。
  await page.waitForFunction(
    (n0) => window.__demo.session.events.slice(n0).some((e) => e.type === 'skill' || e.type === 'miss'),
    ev0,
    { timeout: 12000 },
  );
  st = await snapState();
  const evTypes = await page.evaluate(
    (n0) => window.__demo.session.events.slice(n0).map((e) => e.type),
    [ev0],
  );
  const foe = st.foes.find((f) => f.id === 'e1');
  const casted =
    redHasFoe && evTypes.some((t) => t === 'skill' || t === 'miss') &&
    st.hero.neili === neili0 - 1 && st.selected === null;
  report('BE1 特技施放全链（点静止敌格=v2.2 AOE 退化单目标）', false, casted,
    `红格含敌格=${redHasFoe} 事件=${JSON.stringify(evTypes)} 内力${neili0}→${st.hero.neili} 敌hp${hp0}→${foe.hp} 选中=${st.selected}`);
}

/** 清敌方行动条（防输入等待期敌棋自行行动污染场景；见 placeFoe 注释） */
const clearEnemyBars = () =>
  page.evaluate(() => {
    for (const u of window.__demo.session._debug.units) {
      if (u.side === 'enemy') { u.bar = 0; u.barWasMax = false; }
    }
  });

/** 【T22 v2.2】白盒挪敌出射程（同排 cube 3 > jue/te 射程 2）：优先东向（offset col ≤ 11），
 * 越界改西向——hero 出生带 col 4..7 恒东向；placeFoe 顺带清条。
 * 用于空放段（v2.2 空放=射程内无存活敌，方案 §四-8）与 BE3a 的 e2 核位（Q-T22-B 裁决案）。 */
const placeFoeFar = async (id, heroPos) => {
  const heroCol = heroPos.q + Math.floor(heroPos.r / 2);
  const east = heroCol + 3 <= 11;
  const q = east ? heroPos.q + 3 : heroPos.q - 3;
  await placeFoe(id, q, heroPos.r);
  return { q, r: heroPos.r, east };
};

/** 白盒清 hero 技能冷却（测试基建，与 placeFoe 同级）：BE2 施放 jue 写入 cd=5 会锁死后续用例的
 * 技能选择（te/jue 双双置灰）——冷却资源跨用例耦合不是本卡断言对象，清零以隔离场景（§七-9 同源经验）。 */
const clearHeroCooldowns = () =>
  page.evaluate(() => {
    const u = window.__demo.session._debug.units.find((x) => x.id === 'hero');
    if (!u) return { err: 'no hero' };
    for (const s of u.skills) u.cooldowns.set(s.id, 0);
    return { ok: true };
  });

// ═══ BE2（预期绿 · N2 转绿 · ATK-6 v2.2）：选绝 → 全体敌出射程 → 点空红格 → cast 空放受理（资源全扣无伤害） ═══
{
  await waitHeroTurn();
  await clearEnemyBars();
  await clearHeroCooldowns();
  // 【T22 v2.2】空放=射程内无存活敌（五点③）：施放前全体敌白盒出射程核位——e1 经 BE1 已摆入
  // 射程、e2 经前序游走位置不可控（方案 §四-8：只找一个无敌空格不再构成空放前提）
  const heroPosB2 = (await snapState()).hero.pos;
  await placeFoeFar('e1', heroPosB2);
  await placeFoeFar('e2', heroPosB2);
  await waitPop();
  await tapSkill('jue'); // BE1 已施放特技（冷却 2 回合），此处用未消耗的绝
  const st0 = await snapState();
  if (st0.selected !== 'jue') throw new Error('BE2 绝未选中：' + st0.selected);
  const target = await page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    const foes = s.actors.filter((a) => a.side === 'enemy' && a.animState !== 'dead').map((a) => `${a.pos.q},${a.pos.r}`);
    const empty = s.attackCells.find((c) => !foes.includes(`${c.q},${c.r}`));
    return empty ? { cell: empty, p: window.__demo.cellCss(empty.q, empty.r) } : null;
  });
  if (!target) throw new Error('BE2 无空红格');
  await page.mouse.click(target.p.x, target.p.y);
  // 【AS 采样窗口改写·PM Q2 授权】空放事件移至 t1≈3s（v1.3 AS-6）——等事件落地再采样（断言体零改）。
  await page.waitForFunction(
    (n0) => window.__demo.session.events.length > n0,
    st0.evN,
    { timeout: 12000 },
  );
  const st1 = await snapState();
  // 新断言（方案 §五 BE2 行 · 预期绿四件）：selected null + evN+1 + neili−1 + 敌 hp 不变——
  // 施放受理本身即可观测反馈（toast 不再是反馈通道，§七-15）；evN+1 由 SP-2 确定性背书
  //（clearEnemyBars 防敌自行行动污染事件流，同 BE1 等待窗）
  const foeHpUnchanged = st1.foes.every((f) => {
    const b = st0.foes.find((x) => x.id === f.id);
    return !b || b.hp === f.hp;
  });
  const casted =
    st1.selected === null && st1.evN === st0.evN + 1 &&
    st1.hero.neili === st0.hero.neili - 1 && foeHpUnchanged;
  report('BE2 空红格 cast 空放受理（N2 转绿）', false, casted,
    `点空红格(${target.cell.q},${target.cell.r}) 选中${st0.selected}→${st1.selected} 事件${st0.evN}→${st1.evN} 内力${st0.hero.neili}→${st1.hero.neili} 敌hp不变=${foeHpUnchanged}`);
  // 回合已随施放消耗（BAR-3/SEL-3），无需清场；下一块 waitHeroTurn 重等条满
}

// ═══ BE3a（预期绿 · N2 · ATK-7 v2.2 射程内臂）：敌演出位 ∈ 射程 → 点可见位 = 施放全范围生效 ═══
{
  await waitHeroTurn();
  await clearEnemyBars();
  await clearHeroCooldowns();
  await waitPop();
  const hero = (await snapState()).hero;
  // 敌摆在东 1 格（射程红格上），演出中途视觉滞后到南 1 格（cube(hero→vis)=2 ≤ jue 射程 2，且 ≠ 敌 pos）。
  // 布点三约束（方案 §七-16）：①cube ≤ jue 射程(2) ②≠ 敌逻辑格 ③画布内且避开 ctrl/plaque 实体与弧钮——
  // 沿原 BE3 南向偏移收 1 格（原 (r+2) 射程外，本例取 (r+1) 入射程；更靠北远离右下 ctrl 热区）。
  await placeFoe('e1', hero.pos.q + 1, hero.pos.r);
  await placeFoeFar('e2', hero.pos); // 【Q-T22-B 裁决案】e2 白盒出射程核位：保 evN+1 与「恰 1 条 targetId='e1' 结算事件」确定性
  await tapSkill('jue');
  await page.evaluate(() => {
    const u = window.__demo.session._debug.units.find((x) => x.id === 'e1');
    u.renderR = u.hex.r + 1;
  });
  await page.waitForTimeout(150); // 快照已带分离的 renderPos
  const vis = await page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    const e = s.actors.find((a) => a.id === 'e1');
    const cube = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((a.q + a.r) - (b.q + b.r))) / 2;
    const hero = s.actors.find((x) => x.id === 'hero');
    const L = window.__demo.getView().layout;
    const p = window.__demo.cellCss(e.renderPos.q, e.renderPos.r);
    const inRect = (r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    const hitComponent = inRect(L.ctrlRect) || inRect(L.plaqueRect) ||
      L.skillBtns.some((b) => { const rr = b.r * 1.3; return (p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= rr * rr; });
    return {
      pos: e.pos, renderPos: e.renderPos, p,
      c1_inRange: cube(hero.pos, e.renderPos) <= 2, // 约束①：可见位 ∈ 射程
      c2_notFoe: !(e.renderPos.q === e.pos.q && e.renderPos.r === e.pos.r), // 约束②：≠ 敌逻辑格
      c3_safe: p.x >= 0 && p.x <= 450 && p.y >= 0 && p.y <= 800 && !hitComponent, // 约束③：画布内+不落组件
      inAttackCells: s.attackCells.some((c) => c.q === e.renderPos.q && c.r === e.renderPos.r),
    };
  });
  if (!(vis.c1_inRange && vis.c2_notFoe && vis.c3_safe)) throw new Error('BE3a 布点三约束不满足：' + JSON.stringify(vis));
  const st0 = await snapState();
  if (!vis.inAttackCells) throw new Error('BE3a 可见格 ∉ attackCells：' + JSON.stringify(vis.renderPos));
  await page.mouse.click(vis.p.x, vis.p.y);
  // 【AS 采样窗口改写·PM Q2 授权】两段结算在 t1≈3s/t2≈3.3s（v1.3 AS-3/4）——等两段落地再采样。
  await page.waitForFunction(
    (n0) => window.__demo.session.events.slice(n0).filter((e) => (e.type === 'skill' || e.type === 'miss') && e.targetId === 'e1').length >= 2,
    st0.evN,
    { timeout: 12000 },
  );
  const st1 = await snapState();
  // 【T22 v2.2 断言翻转（ATK-7 简化/五点④）】演出位∈射程=施放全范围生效——e1 逻辑位 ∈ 射程被 AOE 命中，
  // 「敌 hp 不变」翻转「e1 hp ≤ hp0 + 恰 1 条 targetId='e1' 的 skill|miss」（miss 偶发容错 ≤；
  // e2 已核位出射程 → evN+1 保持确定性）
  const evSliceA = await page.evaluate((n0) =>
    window.__demo.session.events.slice(n0).map((e) => ({ t: e.type, tgt: e.targetId ?? null })),
  [st0.evN]);
  const e1Settled = evSliceA.filter((e) => (e.t === 'skill' || e.t === 'miss') && e.tgt === 'e1');
  const e1Before = st0.foes.find((x) => x.id === 'e1');
  const e1After = st1.foes.find((f) => f.id === 'e1');
  const casted =
    st1.selected === null && st1.evN === st0.evN + 2 && // 【AS】两段=evN+2（段1+段2，v1.3 AS-3/4）
    st1.hero.neili === st0.hero.neili - 1 &&
    e1Settled.length === 2 && e1After.hp <= (e1Before ? e1Before.hp : 0); // 恰 2 条（两段各一）
  report('BE3a 演出位∈射程=施放全范围生效（N2/T22 v2.2）', false, casted,
    `敌 pos=${JSON.stringify(vis.pos)} 可见位=${JSON.stringify(vis.renderPos)} 选中=${st1.selected} 事件${st0.evN}→${st1.evN} 内力${st0.hero.neili}→${st1.hero.neili} e1结算事件=${e1Settled.length} e1hp${e1Before ? e1Before.hp : '?'}→${e1After ? e1After.hp : '?'}`);
}

// ═══ BE3b（预期绿 · N2 转绿 · ATK-7 射程外臂/SEL-5②）：演出位 ∉ 射程（原布点）→ 取消=规范行为 ═══
{
  await waitHeroTurn();
  await clearEnemyBars();
  await clearHeroCooldowns();
  await waitPop();
  const hero = (await snapState()).hero;
  // 原 BE3 布点原样：敌在东 1 格，演出中途视觉滞后到东南 2 格（cube 距离 3 > jue 射程 2 = 射程圆外）。
  // 可见位须在画布内且避开右下 ctrl 热区/头顶弧钮（09-02 取证：北向外格被镜头 clamp 挤出画布、
  // 南向远处会落入 ctrl 热区被截获为 setMode——均为额外缺陷面，见报告 §4.4）
  await placeFoe('e1', hero.pos.q + 1, hero.pos.r);
  await page.evaluate(() => {
    const u = window.__demo.session._debug.units.find((x) => x.id === 'e1');
    u.renderR = u.hex.r + 2;
  });
  await tapSkill('jue');
  await page.waitForTimeout(150); // 快照已带分离的 renderPos
  const vis = await page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    const e = s.actors.find((a) => a.id === 'e1');
    const cube = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((a.q + a.r) - (b.q + b.r))) / 2;
    const hero = s.actors.find((x) => x.id === 'hero');
    return {
      pos: e.pos, renderPos: e.renderPos, p: window.__demo.cellCss(e.renderPos.q, e.renderPos.r),
      outOfRange: cube(hero.pos, e.renderPos) > 2, // 前置：可见位 ∉ 射程（原取证布点）
      notInAttack: !s.attackCells.some((c) => c.q === e.renderPos.q && c.r === e.renderPos.r),
    };
  });
  if (!(vis.outOfRange && vis.notInAttack)) throw new Error('BE3b 前置不满足（可见位应在射程外）：' + JSON.stringify(vis));
  const st0 = await snapState();
  await page.mouse.click(vis.p.x, vis.p.y);
  await page.waitForTimeout(400); // 【AS】取消路径零 cast 零事件——定时窗保持（等待结算事件必超时）
  const st1 = await snapState();
  const evTypes = await page.evaluate(
    (n0) => window.__demo.session.events.slice(n0).map((e) => e.type),
    [st0.evN],
  );
  // 新断言（方案 §五 BE3 行 · 预期绿三件，§七-17 防假绿）：selected null（规范取消）+ 无 skill 事件 + neili 不变
  const canceled =
    st1.selected === null && !evTypes.includes('skill') &&
    st1.hero.neili === st0.hero.neili;
  report('BE3b 演出位∉射程=规范取消（N2 转绿）', false, canceled,
    `敌 pos=${JSON.stringify(vis.pos)} 可见位=${JSON.stringify(vis.renderPos)} 选中${st0.selected}→${st1.selected} 事件=${JSON.stringify(evTypes)} 内力${st0.hero.neili}→${st1.hero.neili}`);
  // 恢复手动（若本用例点击曾误触 ctrl setMode；防御性，正常应无操作）
  await page.evaluate(() => window.__demo.session.submit({ type: 'setMode', mode: 'manual' }));
}

// ═══ BE4（预期红 · N1）：普通移动穿人——同排隔敌点绿格（落点与敌相邻触发 ATK-3） ═══
{
  await waitHeroTurn();
  await clearEnemyBars();
  await placeFoe('e2', 3, 3); // e2 挪离战团（防游走进目标格污染场景）
  const hero = (await snapState()).hero;
  // 布点：敌在主角正东相邻；目标是敌后一格（同排、与敌相邻 → ATK-3 自动普攻）
  await placeFoe('e1', hero.pos.q + 1, hero.pos.r);
  await page.waitForTimeout(100);
  const plan = await page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    const hero = s.actors.find((a) => a.id === 'hero');
    const foe = s.actors.find((a) => a.id === 'e1');
    const dest = { q: foe.pos.q + 1, r: foe.pos.r };
    const inMove = s.moveCells.some((c) => c.q === dest.q && c.r === dest.r);
    return { dest, inMove, heroPos: hero.pos, foePos: foe.pos, p: window.__demo.cellCss(dest.q, dest.r) };
  });
  if (!plan.inMove) throw new Error('BE4 目标格不在绿格：' + JSON.stringify(plan));
  await page.mouse.click(plan.p.x, plan.p.y);
  // 采样 1.5s：moveAnims 是否启动 + renderPos 是否穿过敌格 + DBG 残留证据
  // 【首采延迟 80ms · T19 打回查修】结构论证：crossed 的 round(q)/round(r) 独立取整存在唯一
  // aliasing 窗 = 段1 对角段（-1,11→0,10）lp∈[0.495,0.505]（renderPos=(-0.5,10.5) → round 拼出
  // 敌格 (0,11)），真实时间 = 移动开始后 49.5~50.5ms（段长 100ms）；段2 纯 E 恒 round(r)=10≠11、
  // 段3 纯 S 恒 round(q)=1≠0，数学安全。playwright 首采相位 ≈44ms（evaluate 启动开销恒定）恰好
  // 落窗 → 偶发假阳性。首采延迟 80ms 后该窗已永久关闭（moveT 单调递增无回绕，首采 moveT≥0.21
  // → lp≥0.63，距窗 ≥12ms >> 真实时钟抖动 σ≈3ms），其后所有帧结构恒安全，非概率凑绿；
  // FE moveAnims 存活 0.6s（duration=0.3×dist），animStarted 采证不受损。
  await page.waitForTimeout(80);
  const samples = [];
  for (let i = 0; i < 38; i++) {
    samples.push(
      await page.evaluate(() => {
        const s = window.__demo.session.snapshot();
        const hero = s.actors.find((a) => a.id === 'hero');
        return {
          anim: window.__demo.getView().moveAnims.has('hero'),
          q: +hero.renderPos.q.toFixed(2), r: +hero.renderPos.r.toFixed(2),
          animState: hero.animState,
        };
      }),
    );
    await page.waitForTimeout(40);
  }
  const foe = { q: plan.foePos.q, r: plan.foePos.r };
  const crossed = samples.some((sm) => sm.animState !== 'dead' && Math.round(sm.q) === foe.q && Math.round(sm.r) === foe.r);
  const animStarted = samples.some((sm) => sm.anim);
  const dbgResidue = consoleLines.filter((l) => l.includes('DBG['));
  // DBG[move-start] 印在 walkRise 分支内（battle-hex-render.ts:440）：本用例 0 条=分支从未执行的旁证；
  // 对照组（普通移动正常触发演出）可复现该日志——线上调试残留本体，见报告 §3.4
  // T19 批一修复后：animStarted=true 且 crossed=false 且 DBG残留 0 条 → 预期绿（§3.2+§3.3+§五）
  report('BE4 移动路径演出启动+不穿占格（N1）', false, animStarted && !crossed,
    `moveAnim启动=${animStarted} renderPos穿敌格=${crossed}（${plan.heroPos.q},${plan.heroPos.r}→${plan.dest.q},${plan.dest.r} 敌${foe.q},${foe.r}） DBG残留${dbgResidue.length}条`);
  await page.screenshot({ path: path.join(outDir, 'behavior_be4_n1_through.png') });
}

// ═══════ T21 受击反馈追加断言（09-03 PM 裁 Q1 增补授权：仅追加，既有 5 项与登记簿零改动）═══════
// V1/V2/V4 e2e 观测断言（方案 §三）+ R9 reset 清理；观测面零新增（__demo.getView() 全量可读）。
// 命中率按 core F-04 = 0.85（shizhan demo 档不抬命中率）——HF 用例以「未达样本即重试」去偶发，
// 4 击全失手概率 ≈0.07%；白盒基建沿用 placeFoe/clearEnemyBars/clearHeroCooldowns 同级约定。
/** rAF 逐帧录制器（HF3/V4 用；测试基建挂 window.__hfFrames，不碰 __demo） */
const startHfRecorder = () =>
  page.evaluate(() => {
    window.__hfFrames = [];
    const step = () => {
      const s = window.__demo.session.snapshot();
      const hero = s.actors.find((a) => a.id === 'hero');
      const v = window.__demo.getView();
      window.__hfFrames.push({
        anim: hero.animState,
        dmgN: v.fx.filter((f) => f.kind === 'dmg').length,
        pendN: v.pendingHits.length,
      });
      if (window.__hfFrames.length < 240) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

/** 布点方向自适应（FIELD col 4..11）：敌默认摆主角东侧 dist 格，东缘放不下改西侧——
 * 防 hero O3 随机出生偏东时出带（绿格不含 → HF3 前置崩；09-03 首跑实证 dest col 12 出带）。
 * extra = 敌位之外还需同方向的格数（HF3 敌后落点 +1），方向判定一并计入 */
const placeFoeBeside = async (id, hero, dist, extra = 0) => {
  const col = hero.pos.q + Math.floor(hero.pos.r / 2);
  const east = col + dist + extra <= 11;
  const q = east ? hero.pos.q + dist : hero.pos.q - dist;
  await placeFoe(id, q, hero.pos.r);
  return { q, r: hero.pos.r, east };
};

/** 确定性重开：flee 提交（零结算规范通道）→ 结算遮罩 → 点击重开——新局 90s 时钟满额 */
const forceReset = async () => {
  await page.evaluate(() => {
    if (window.__demo.session.snapshot().phase === 'fighting') window.__demo.session.submit({ type: 'flee' });
  });
  await page.waitForFunction(() => window.__demo.session.snapshot().phase !== 'fighting', null, { timeout: 4000 });
  await page.mouse.click(225, 400); // 结算遮罩任意点（抬起触发 resetDemo）
  await page.waitForFunction(() => window.__demo.session.snapshot().phase === 'fighting', null, { timeout: 4000 });
  await page.waitForTimeout(300);
};
/** 结算遮罩在场则重开（90s 总时长尾规则 timeout-hp 会在 HF 重试期间打完整局——09-03 首跑实证） */
const ensureFighting = async () => {
  const ph = await page.evaluate(() => window.__demo.session.snapshot().phase);
  if (ph !== 'fighting') await forceReset();
};
/** HF 轮次守卫：等主角回合（40s 超时=该局已被尾规则打完）→ 转下一轮由 ensureFighting 重开 */
const waitHeroTurnGuarded = async () => {
  try {
    await waitHeroTurn();
    return true;
  } catch {
    return false;
  }
};

await forceReset(); // HF 段开局强制新局：BE 系列耗时不定，防 HF 中途撞 90s 尾规则

// ═══ HF1（T21/V1 · 预期绿）：普攻命中 → dmg 冒字（text=String(damage) 直读）+ 受击者震动 ═══
{
  let ok = false;
  let detail = '未取得样本';
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    await ensureFighting();
    if (!(await waitHeroTurnGuarded())) continue;
    await clearEnemyBars();
    await waitPop();
    const hero = (await snapState()).hero;
    const ep = await placeFoeBeside('e1', hero, 1); // 普攻射程内相邻格，静止待击
    const ev0 = await page.evaluate(() => window.__demo.session.events.length);
    const p = await page.evaluate(([fq, fr]) => window.__demo.cellCss(fq, fr), [ep.q, ep.r]);
    await page.mouse.click(p.x, p.y);
    try {
      await page.waitForFunction(() => window.__demo.getView().fx.some((f) => f.kind === 'dmg'), null, { timeout: 12000 }); // 【AS】t1≈3s 后才冒字，窗放宽（普攻路径不受影响）
      const obs = await page.evaluate((n0) => {
        const v = window.__demo.getView();
        const ev = window.__demo.session.events.slice(n0).find((e) => e.type === 'basic' || e.type === 'miss');
        return {
          ev: ev ? { type: ev.type, targetId: ev.targetId, damage: ev.damage ?? null } : null,
          texts: v.fx.filter((f) => f.kind === 'dmg').map((f) => f.text),
          shakes: [...v.shakes.keys()],
          pendN: v.pendingHits.length,
        };
      }, ev0);
      if (obs.ev && obs.ev.type === 'basic' && obs.ev.targetId === 'e1' &&
          obs.texts.includes(String(obs.ev.damage)) && obs.shakes.includes('e1') && obs.pendN === 0) {
        ok = true;
        detail = `第${attempt}击 basic=${JSON.stringify(obs.ev)} 冒字=${JSON.stringify(obs.texts)} shakes=${JSON.stringify(obs.shakes)} pending=${obs.pendN}`;
      } else if (obs.ev) {
        detail = `第${attempt}击 ${obs.ev.type}（未达命中样本，重试）`;
      }
    } catch { detail = `第${attempt}击 未冒字（重试）`; }
  }
  report('HF1 普攻命中=dmg冒字(text=String(damage))+受击震动（T21/V1）', false, ok, detail);
}

// ═══ HF2（T21/V2 · 预期绿）：特技 cast 对敌同 V1；空放（点空红格）=零冒字零挂起 ═══
{
  let ok = false;
  let detail = '未取得样本';
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    await ensureFighting();
    if (!(await waitHeroTurnGuarded())) continue;
    await clearEnemyBars();
    await clearHeroCooldowns();
    await waitPop();
    const hero = (await snapState()).hero;
    const ep = await placeFoeBeside('e1', hero, 2); // 特技射程内（cube 2，同 BE1 语义）
    await tapSkill('te');
    const ev0 = await page.evaluate(() => window.__demo.session.events.length);
    const p = await page.evaluate(([fq, fr]) => window.__demo.cellCss(fq, fr), [ep.q, ep.r]);
    await page.mouse.click(p.x, p.y);
    try {
      await page.waitForFunction(() => window.__demo.getView().fx.some((f) => f.kind === 'dmg'), null, { timeout: 12000 }); // 【AS】t1≈3s 后才冒字，窗放宽（普攻路径不受影响）
      const obs = await page.evaluate((n0) => {
        const v = window.__demo.getView();
        // 【T22 v2.2 · 方案 §四-9】多目标下首条事件可能是其他目标的 miss——取事件策略改 find targetId='e1'
        const ev = window.__demo.session.events.slice(n0).find(
          (e) => (e.type === 'skill' || e.type === 'miss') && e.targetId === 'e1',
        );
        return {
          ev: ev ? { type: ev.type, targetId: ev.targetId, damage: ev.damage ?? null } : null,
          texts: v.fx.filter((f) => f.kind === 'dmg').map((f) => f.text),
          shakes: [...v.shakes.keys()],
        };
      }, ev0);
      if (obs.ev && obs.ev.type === 'skill' && obs.ev.targetId === 'e1' &&
          obs.texts.includes(String(obs.ev.damage)) && obs.shakes.includes('e1')) {
        ok = true;
        detail = `第${attempt}击 skill=${JSON.stringify(obs.ev)} 冒字=${JSON.stringify(obs.texts)} shakes=${JSON.stringify(obs.shakes)}`;
      } else if (obs.ev) {
        detail = `第${attempt}击 ${obs.ev.type}（未达命中样本，重试）`;
      }
    } catch { detail = `第${attempt}击 未冒字（重试）`; }
  }
  // V2 后半：空放（点空红格，cast 受理但无 targetId 无 damage）→ 事件面恰 1 条 skill 空放形状、
  // pendingHits 恒空、窗口内 dmg 冒字零新增（clearEnemyBars 防敌行动污染，同 BE2 等待窗；两轮防尾规则）
  let emptyOk = false;
  let emptyDetail = '空放段未执行';
  for (let e2a = 0; e2a < 2 && !emptyOk; e2a++) {
    await ensureFighting();
    if (!(await waitHeroTurnGuarded())) continue;
    await clearEnemyBars();
    await clearHeroCooldowns();
    await waitPop();
    await tapSkill('jue');
    // 【T22 v2.2 · 方案 §四-8】空放段前置：全体敌白盒出射程（e1 前半已摆入射程 + e2 游走位不可控
    // → 射程内有敌时点红格=AOE 非空放，假红源）；placeFoe 顺带清条
    const heroPosH2 = await page.evaluate(() =>
      window.__demo.session.snapshot().actors.find((a) => a.id === 'hero').pos,
    );
    await placeFoeFar('e1', heroPosH2);
    await placeFoeFar('e2', heroPosH2);
    const before = await page.evaluate(() => ({
      evN: window.__demo.session.events.length,
      dmgN: window.__demo.getView().fx.filter((f) => f.kind === 'dmg').length,
    }));
    const target = await page.evaluate(() => {
      const s = window.__demo.session.snapshot();
      const foes = s.actors.filter((a) => a.side === 'enemy' && a.animState !== 'dead').map((a) => `${a.pos.q},${a.pos.r}`);
      const empty = s.attackCells.find((c) => !foes.includes(`${c.q},${c.r}`));
      return empty ? { cell: empty, p: window.__demo.cellCss(empty.q, empty.r) } : null;
    });
    if (!target) throw new Error('HF2 无空红格');
    await page.mouse.click(target.p.x, target.p.y);
    const dmgAtClick = await page.evaluate(() => window.__demo.getView().fx.filter((f) => f.kind === 'dmg').length);
    // 【AS 采样窗口改写·PM Q2 授权】空放事件在 t1≈3s（v1.3 AS-6）——等事件落地再采样。
    await page.waitForFunction(
      (n0) => window.__demo.session.events.length > n0,
      before.evN,
      { timeout: 12000 },
    );
    const after = await page.evaluate(() => {
      const v = window.__demo.getView();
      return { dmgN: v.fx.filter((f) => f.kind === 'dmg').length, pendN: v.pendingHits.length };
    });
    const evSlice = await page.evaluate((n0) =>
      window.__demo.session.events.slice(n0).map((e) => ({ t: e.type, tgt: e.targetId ?? null, dmg: e.damage ?? null })),
    [before.evN]);
    const onlyEmptySkill = evSlice.length === 1 && evSlice[0].t === 'skill' && evSlice[0].tgt === null && evSlice[0].dmg === null;
    emptyOk = onlyEmptySkill && after.pendN === 0 && after.dmgN <= dmgAtClick;
    emptyDetail = `空放事件=${JSON.stringify(evSlice)} pending=${after.pendN} dmg${dmgAtClick}→${after.dmgN}`;
  }
  report('HF2 特技对敌=dmg冒字；空放=零冒字零挂起（T21/V2）', false, ok && emptyOk, `${detail} · ${emptyDetail}`);
}

// ═══ HF3（T21/V4 · 预期绿）：ATK-3 移动附带普攻 → dmg 随补播 basic 出现（不早于快照 walk→basic 切换帧） ═══
{
  let ok = false;
  let detail = '未取得样本';
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    await ensureFighting();
    if (!(await waitHeroTurnGuarded())) continue;
    await clearEnemyBars();
    await waitPop();
    const hero = (await snapState()).hero;
    const ep = await placeFoeBeside('e1', hero, 1, 1); // 敌相邻+敌后一格同向（BE4 同构布点触发 ATK-3）
    await startHfRecorder();
    const plan = await page.evaluate(([fq, fr]) => {
      const s = window.__demo.session.snapshot();
      const dest = { q: fq, r: fr };
      return { dest, inMove: s.moveCells.some((c) => c.q === dest.q && c.r === dest.r), p: window.__demo.cellCss(dest.q, dest.r) };
    }, [ep.east ? ep.q + 1 : ep.q - 1, ep.r]);
    if (!plan.inMove) throw new Error('HF3 目标格不在绿格：' + JSON.stringify(plan));
    const ev0 = await page.evaluate(() => window.__demo.session.events.length);
    await page.mouse.click(plan.p.x, plan.p.y);
    await page.waitForTimeout(2600); // 录满移动+补播攻击窗口（录制器 240 帧自停）
    const frames = await page.evaluate(() => window.__hfFrames);
    const evs = await page.evaluate((n0) =>
      window.__demo.session.events.slice(n0).map((e) => ({ t: e.type, tgt: e.targetId ?? null, dmg: e.damage ?? null })),
    [ev0]);
    const basicEv = evs.find((e) => e.t === 'basic');
    let switchIdx = -1;
    let dmgIdx = -1;
    for (let i = 0; i < frames.length; i++) {
      if (dmgIdx < 0 && frames[i].dmgN > 0) dmgIdx = i;
      if (i > 0 && switchIdx < 0 && frames[i - 1].anim === 'walk' && frames[i].anim === 'basic') switchIdx = i;
    }
    if (basicEv && basicEv.tgt === 'e1' && typeof basicEv.dmg === 'number' && switchIdx >= 0 && dmgIdx >= switchIdx) {
      ok = true;
      detail = `第${attempt}次 basic=${JSON.stringify(basicEv)} walk→basic切换帧=${switchIdx} dmg首现帧=${dmgIdx} 总帧=${frames.length}（断言基准=快照 animState，E3）`;
    } else {
      detail = `第${attempt}次 basic=${JSON.stringify(basicEv)} 切换帧=${switchIdx} dmg帧=${dmgIdx}（未达样本，重试）`;
    }
  }
  report('HF3 ATK-3 移动附带普攻=dmg 随补播 basic 出现，不早于切换帧（T21/V4）', false, ok, detail);
}

// ═══ HF4（T21/R9 · 预期绿）：resetDemo 清理受击反馈三件（pendingHits/shakes/dmgStagger 不跨局） ═══
{
  // 前置：一次非致命命中 → dmgStagger 项持久可见 + shakes 当场采样（200ms 窗口，waitForFunction 即采）
  let sampled = false;
  let preDetail = '未采样';
  for (let attempt = 1; attempt <= 4 && !sampled; attempt++) {
    await ensureFighting();
    if (!(await waitHeroTurnGuarded())) continue;
    await clearEnemyBars();
    await waitPop();
    const hero = (await snapState()).hero;
    const ep = await placeFoeBeside('e1', hero, 1);
    const p = await page.evaluate(([fq, fr]) => window.__demo.cellCss(fq, fr), [ep.q, ep.r]);
    await page.mouse.click(p.x, p.y);
    try {
      await page.waitForFunction(() => window.__demo.getView().fx.some((f) => f.kind === 'dmg'), null, { timeout: 12000 }); // 【AS】t1≈3s 后才冒字，窗放宽（普攻路径不受影响）
      const obs = await page.evaluate(() => {
        const v = window.__demo.getView();
        const hit = v.fx.find((f) => f.kind === 'dmg' && f.text !== '闪避');
        return { hitText: hit ? hit.text : null, shakes: [...v.shakes.keys()], stag: v.dmgStagger.get('e1') ?? null };
      });
      if (obs.hitText && obs.shakes.includes('e1') && obs.stag) {
        sampled = true;
        preDetail = `第${attempt}击 冒字=${obs.hitText} shakes=${JSON.stringify(obs.shakes)} dmgStagger.e1=${JSON.stringify(obs.stag)}`;
      }
    } catch { /* miss → 重试 */ }
  }
  if (!sampled) throw new Error('HF4 前置失败：未取得命中样本');
  // 进结算遮罩：flee 规范通道（零结算；击杀路径需同回合清两敌、跨回合引入 miss 偶发，非 R9 断言对象）
  await page.evaluate(() => {
    if (window.__demo.session.snapshot().phase === 'fighting') window.__demo.session.submit({ type: 'flee' });
  });
  await page.waitForFunction(() => window.__demo.session.snapshot().phase !== 'fighting', null, { timeout: 4000 });
  const preReset = await page.evaluate(() => {
    const v = window.__demo.getView();
    return { stagN: v.dmgStagger.size, pendN: v.pendingHits.length, shakeN: v.shakes.size };
  });
  await page.mouse.click(225, 400); // 结算遮罩任意点（抬起触发 resetDemo）
  await page.waitForTimeout(400);
  const post = await page.evaluate(() => {
    const v = window.__demo.getView();
    return {
      pendN: v.pendingHits.length, shakeN: v.shakes.size, stagN: v.dmgStagger.size,
      fxN: v.fx.length, phase: window.__demo.session.snapshot().phase,
    };
  });
  const ok = preReset.stagN > 0 && post.pendN === 0 && post.shakeN === 0 && post.stagN === 0 &&
    post.fxN === 0 && post.phase === 'fighting';
  report('HF4 resetDemo 清理受击反馈三件+fx 归零（T21/R9/E4）', false, ok,
    `重开前 dmgStagger=${preReset.stagN} 项（${preDetail}）→ 重开后 pending=${post.pendN} shakes=${post.shakeN} stagger=${post.stagN} fx=${post.fxN} phase=${post.phase}`);
}

// ═══════ T23 战斗 UI 实装追加断言（09-04 · 仅追加 V1/V4 观测段；既有 9 项与登记簿零改动）═══════
// 方案 §三 V1-V4 e2e 列：观测面=既有 __demo.getView().topbarHud（T23 渲染私有 last-drawn 镜像，零新钩子）。
// V2（statusIcons 恒空）并入 V1 顶栏观测一并读出；V3 plaque「点击无反应」由单测形状锁（main.ts 无 onPlaque）
// + input 层零 diff + 既有 plaque 热区用例等效覆盖（卡 §4 授权 e2e 仅 V1/V4 段）。
await forceReset(); // T23 段开局新局：BE/HF 残留（托管态/速度镜像/冷却/挂起反馈）由 resetDemo 清零

// ═══ T23-V1（预期绿）：顶栏真实数据——name/hpFrac/百分比与快照对表；受击掉血同步；特技扣内同步；V2 空槽观测 ═══
{
  const readHud = () =>
    page.evaluate(() => {
      const s = window.__demo.session.snapshot();
      const hero = s.actors.find((a) => a.id === 'hero');
      const hud = window.__demo.getView().topbarHud;
      return {
        name: hud.name, hpFrac: hud.hpFrac, neiliFrac: hud.neiliFrac,
        hpPct: hud.hpPctText, neiliPct: hud.neiliPctText, statusN: hud.statusIcons.length,
        hp: hero.hp, maxHp: hero.maxHp, neili: hero.neili, maxNeili: hero.maxNeili,
      };
    });
  // hud 与快照同帧一致性（方案 §三 V1：name/frac<0.01/百分比文本三重对表；不假设满血——对表而非对绝对值）
  const consistent = (h) =>
    h.name === '小虾米' &&
    Math.abs(h.hpFrac - h.hp / Math.max(1, h.maxHp)) < 0.01 &&
    Math.abs(h.neiliFrac - h.neili / Math.max(1, h.maxNeili)) < 0.01 &&
    h.hpPct === String(Math.round(h.hpFrac * 100)) + '%' &&
    h.neiliPct === String(Math.round(h.neiliFrac * 100)) + '%';
  await ensureFighting();
  await waitHeroTurn();
  const hud0 = await readHud();
  await page.screenshot({ path: path.join(outDir, 't23_topbar_full.png') });
  // 受击掉血：不 clearEnemyBars——等敌条自然填满反击；hpFrac 下降且与快照同帧一致
  await page.waitForFunction((f0) => {
    const s = window.__demo.session.snapshot();
    const hero = s.actors.find((a) => a.id === 'hero');
    const hud = window.__demo.getView().topbarHud;
    return hud.hpFrac < f0 - 0.01 && Math.abs(hud.hpFrac - hero.hp / Math.max(1, hero.maxHp)) < 0.01;
  }, hud0.hpFrac, { timeout: 40000 });
  const hud1 = await readHud();
  await page.screenshot({ path: path.join(outDir, 't23_topbar_damaged.png') });
  // 特技扣内（demo 每次施放内力 -1，BE1 先例）：摆敌入 te 射程 → 施放 → neiliFrac 同步下降（重试去偶发）
  let neiliDropped = false;
  let castDetail = '未取得施放样本';
  for (let attempt = 0; attempt < 3 && !neiliDropped; attempt++) {
    await ensureFighting();
    if (!(await waitHeroTurnGuarded())) continue;
    await clearEnemyBars();
    await clearHeroCooldowns();
    await waitPop();
    const hero = (await snapState()).hero;
    const ep = await placeFoeBeside('e1', hero, 2);
    await tapSkill('te');
    const before = await readHud();
    const p = await page.evaluate(([fq, fr]) => window.__demo.cellCss(fq, fr), [ep.q, ep.r]);
    await page.mouse.click(p.x, p.y);
    try {
      await page.waitForFunction((n0) => {
        const hud = window.__demo.getView().topbarHud;
        return hud.neiliFrac < n0 - 0.005; // 0.01 步长留 FP 半步容差
      }, before.neiliFrac, { timeout: 4000 });
      neiliDropped = true;
      castDetail = `第${attempt + 1}次施放内力下降已观测`;
    } catch { castDetail = `第${attempt + 1}次施放未观测到内力下降（重试）`; }
  }
  const hud2 = await readHud();
  const ok =
    consistent(hud0) && hud0.statusN === 0 &&
    hud1.hpFrac < hud0.hpFrac && consistent(hud1) &&
    neiliDropped && consistent(hud2) && hud2.neiliFrac < hud1.neiliFrac;
  report('T23-V1 顶栏真实数据（名字/双条 frac+百分比与快照对表；受击掉血/特技扣内同步；V2 空槽=0）', false, ok,
    `name=${hud0.name} hpFrac=${hud0.hpFrac.toFixed(3)}↔${(hud0.hp / Math.max(1, hud0.maxHp)).toFixed(3)} pct=${hud0.hpPct}/${hud0.neiliPct} statusN=${hud0.statusN}；受击 hpFrac ${hud0.hpFrac.toFixed(3)}→${hud1.hpFrac.toFixed(3)}；施放 neiliFrac ${hud1.neiliFrac.toFixed(3)}→${hud2.neiliFrac.toFixed(3)}（${castDetail}）`);
}

// ═══ T23-V4（预期绿）：ctrl 三钮——托管点击↔自动（session 模式+topbarHud.ctrlActive 双写）；加速镜像；逃跑 fled ═══
{
  await ensureFighting();
  if (!(await waitHeroTurnGuarded())) throw new Error('T23-V4 未取得主角回合（40s 内局已被尾规则打完）');
  // 钮屏中心换算：layout.ctrlRect + art 比例；art 矩形粘贴自 config/battle-hex.ts CTRL_BUTTONS（t23v1）
  //（e2e 为纯 mjs 不可 import TS；CTRL_ART=223×448 同源）
  const BTN_ART = [[5, 2, 216, 128], [5, 163, 213, 126], [5, 319, 213, 127]];
  const btnCenter = (i) =>
    page.evaluate(([idx, arts]) => {
      const r = window.__demo.getView().layout.ctrlRect;
      const b = arts[idx];
      return window.__demo.cssOf(r.x + ((b[0] + b[2] / 2) / 223) * r.w, r.y + ((b[1] + b[3] / 2) / 448) * r.h);
    }, [i, BTN_ART]);
  const readCtrl = () =>
    page.evaluate(() => ({
      mode: window.__demo.session._debug.mode(),
      hud: window.__demo.getView().topbarHud.ctrlActive,
      phase: window.__demo.session.snapshot().phase,
    }));
  await page.waitForTimeout(200); // 待一帧：topbarHud/ctrlRect 为 last-drawn
  const base = await readCtrl();
  await page.screenshot({ path: path.join(outDir, 't23_ctrl_normal.png') });
  // 托管：点击 → mode=auto ∧ hud.mode=true；再点 → manual ∧ false
  let p = await btnCenter(0);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  const afterOn = await readCtrl();
  await page.screenshot({ path: path.join(outDir, 't23_ctrl_active.png') });
  p = await btnCenter(0);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  const afterOff = await readCtrl();
  // 加速：点击 → hud.speed=true；再点 → false（speed 真值=宿主镜像 speedOn，无 _debug 读口——既有链路）
  p = await btnCenter(1);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  const afterSpeedOn = await readCtrl();
  p = await btnCenter(1);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  const afterSpeedOff = await readCtrl();
  // 逃跑 → phase fled
  p = await btnCenter(2);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400);
  const afterFlee = await readCtrl();
  const ok =
    base.mode === 'manual' && base.hud.mode === false && base.hud.speed === false &&
    afterOn.mode === 'auto' && afterOn.hud.mode === true &&
    afterOff.mode === 'manual' && afterOff.hud.mode === false &&
    afterSpeedOn.hud.speed === true && afterSpeedOff.hud.speed === false &&
    afterFlee.phase === 'fled';
  report('T23-V4 ctrl 三钮（托管↔自动 uiState 镜像双写一致；加速镜像；逃跑 fled）', false, ok,
    `base=${JSON.stringify(base)} 托管on=${JSON.stringify(afterOn)} off=${JSON.stringify(afterOff)} 加速on=${JSON.stringify(afterSpeedOn.hud)} off=${JSON.stringify(afterSpeedOff.hud)} 逃跑phase=${afterFlee.phase}`);
  await page.mouse.click(225, 400); // 结算遮罩点击重开（保持清洁状态退出）
}

const mismatch = results.filter((r) => !r.match);
console.log('═══ 行为 e2e 汇总 ═══');
for (const r of results) console.log(`${r.match ? 'MATCH' : 'MISMATCH'} ${r.id} 预期${r.expect} 实际${r.actual}`);
// 【T20-FE 口径同步】expectRed 全部翻转后「红名单在列」语义失效——改为登记缺陷/链路锁双向计数
console.log(`预期红（登记缺陷）：${results.filter((r) => r.expectRed).length} 项；预期绿（链路锁）：${results.filter((r) => !r.expectRed).length} 项；不符合预期：${mismatch.length} 项`);
if (dbgAny(consoleLines)) console.log('（附）线上 DBG 残留样本：', consoleLines.find((l) => l.includes('DBG[')));
await browser.close();
process.exit(mismatch.length ? 1 : 0);

function dbgAny(lines) {
  return lines.some((l) => l.includes('DBG['));
}
