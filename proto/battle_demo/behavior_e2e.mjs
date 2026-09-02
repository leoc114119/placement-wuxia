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
// | BE2   | N2     | 空红格零反馈（input 层 + 规格缺口 ATK-2/ATK-5 之间） | 09-02 | （未修） |
// | BE3   | N2     | 敌演出位≠逻辑格时点可见位 → 误取消选中（input 命中层） | 09-02 | （未修） |
// | BE4   | N1     | ATK-3 覆写 walk → moveAnim 不启动 → 直线插值穿人（FE 演出触发） | 09-02 | （未修） |
// BE1 = 绿锁（特技施放全链，受理/结算层无病的端到端证据）。
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

const results = []; // {id, expect, actual, ok, detail}
const report = (id, expectRed, ok, detail) => {
  const actual = ok ? '绿' : '红';
  const match = expectRed ? !ok : ok;
  results.push({ id, expect: expectRed ? '红(登记缺陷)' : '绿(链路锁)', actual, match, detail });
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
  await page.waitForTimeout(500);
  st = await snapState();
  const evTypes = await page.evaluate(
    (n0) => window.__demo.session.events.slice(n0).map((e) => e.type),
    [ev0],
  );
  const foe = st.foes.find((f) => f.id === 'e1');
  const casted =
    redHasFoe && evTypes.some((t) => t === 'skill' || t === 'miss') &&
    st.hero.neili === neili0 - 1 && st.selected === null;
  report('BE1 特技施放全链（点静止敌格）', false, casted,
    `红格含敌格=${redHasFoe} 事件=${JSON.stringify(evTypes)} 内力${neili0}→${st.hero.neili} 敌hp${hp0}→${foe.hp} 选中=${st.selected}`);
}

/** 清敌方行动条（防输入等待期敌棋自行行动污染场景；见 placeFoe 注释） */
const clearEnemyBars = () =>
  page.evaluate(() => {
    for (const u of window.__demo.session._debug.units) {
      if (u.side === 'enemy') { u.bar = 0; u.barWasMax = false; }
    }
  });

// ═══ BE2（预期红 · N2 机制一）：选绝 → 点空红格 → 无任何可观测反馈 ═══
{
  await waitHeroTurn();
  await clearEnemyBars();
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
  await page.waitForTimeout(800);
  const st1 = await snapState();
  const toastTxt = await page.evaluate(() => document.getElementById('toast').textContent + '|' + document.getElementById('toast').style.opacity);
  const observable = st1.selected !== st0.selected || st1.evN > st0.evN || st1.fxN > st0.fxN || /1/.test(toastTxt);
  report('BE2 空红格点击有可观测反馈（N2）', true, observable,
    `点空红格(${target.cell.q},${target.cell.r}) 选中${st0.selected}→${st1.selected} 事件${st0.evN}→${st1.evN} fx${st0.fxN}→${st1.fxN} toast=${toastTxt}`);
  // 清场：取消选中，等下一回合
  await page.evaluate(() => window.__demo.session.submit({ type: 'cancelSkill' }));
}

// ═══ BE3（预期红 · N2 机制二）：敌演出位≠逻辑格 → 点其可见位置 → 选中被静默取消 ═══
{
  await waitHeroTurn();
  await clearEnemyBars();
  await waitPop();
  const hero = (await snapState()).hero;
  // 敌摆在东 1 格（射程红格上），演出中途视觉滞后到东南 2 格（cube 距离 3 = 射程圆外）。
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
    return { pos: e.pos, renderPos: e.renderPos, p: window.__demo.cellCss(e.renderPos.q, e.renderPos.r) };
  });
  await page.mouse.click(vis.p.x, vis.p.y);
  await page.waitForTimeout(400);
  const st = await snapState();
  const kept = st.selected === 'jue';
  report('BE3 点敌演出位不静默取消选中（N2）', true, kept,
    `敌 pos=${JSON.stringify(vis.pos)} 可见位=${JSON.stringify(vis.renderPos)} 点击后选中=${st.selected}（期望保持 jue）`);
  await page.evaluate(() => window.__demo.session.submit({ type: 'cancelSkill' }));
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
  // 期望（修复后）：animStarted=true 且 crossed=false；当前缺陷：animStarted=false 且 crossed=true
  report('BE4 移动路径演出启动+不穿占格（N1）', true, animStarted && !crossed,
    `moveAnim启动=${animStarted} renderPos穿敌格=${crossed}（${plan.heroPos.q},${plan.heroPos.r}→${plan.dest.q},${plan.dest.r} 敌${foe.q},${foe.r}） DBG残留${dbgResidue.length}条`);
  await page.screenshot({ path: path.join(outDir, 'behavior_be4_n1_through.png') });
}

const mismatch = results.filter((r) => !r.match);
console.log('═══ 行为 e2e 汇总 ═══');
for (const r of results) console.log(`${r.match ? 'MATCH' : 'MISMATCH'} ${r.id} 预期${r.expect} 实际${r.actual}`);
console.log(`红名单在列：${results.filter((r) => r.expect.includes('登记')).length} 项；不符合预期：${mismatch.length} 项`);
if (dbgAny(consoleLines)) console.log('（附）线上 DBG 残留样本：', consoleLines.find((l) => l.includes('DBG[')));
await browser.close();
process.exit(mismatch.length ? 1 : 0);

function dbgAny(lines) {
  return lines.some((l) => l.includes('DBG['));
}
