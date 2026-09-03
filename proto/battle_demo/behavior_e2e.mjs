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
// | BE2🟢  | N2 | 空红格零反馈（input 层 + 规格缺口 ATK-2/ATK-5 之间） | 09-02 | T20-FE 09-03（本卡交付提交，hash 见 git log；按 ATK-6 v2.0 格子目标化重写=cast 空放受理预期绿） |
// | BE3a🟢 | N2 | 敌演出位≠逻辑格时点可见位 → 误取消选中（input 命中层） | 09-02 | T20-FE 09-03（本卡交付提交，hash 见 git log；按 ATK-7/SEL-5② v2.0 拆双例：射程内=cast 受理，预期绿） |
// | BE3b🟢 | N2 | 同上（拆双例） | 09-02 | T20-FE 09-03（本卡交付提交，hash 见 git log；射程外=cancelSkill 规范取消+无 skill 事件+资源零消耗，预期绿；e2e 用例 4→5） |
// | BE4🟢  | N1 | ATK-3 覆写 walk → moveAnim 不启动 → 直线插值穿人（FE 演出触发+session 回退轨） | 09-02 | T19 批一 09-03（本卡交付提交，hash 见 git log） |
// BE1 = 绿锁（特技施放全链，受理/结算层无病的端到端证据）。
// T19 批一（09-03）终态：BE1 绿锁 / BE2·BE3 预期红（二批）/ BE4 转预期绿。
// T20-FE（09-03）终态：全部预期绿（BE2 按 ATK-6 v2.0 翻转；BE3 按 ATK-7/SEL-5② v2.0 拆 BE3a/BE3b，
// 用例 4→5；规格依据=《战斗交互行为规格》v2.1 + 修复方案 §五对照表，PM 裁决放行）。
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

/** 白盒清 hero 技能冷却（测试基建，与 placeFoe 同级）：BE2 施放 jue 写入 cd=5 会锁死后续用例的
 * 技能选择（te/jue 双双置灰）——冷却资源跨用例耦合不是本卡断言对象，清零以隔离场景（§七-9 同源经验）。 */
const clearHeroCooldowns = () =>
  page.evaluate(() => {
    const u = window.__demo.session._debug.units.find((x) => x.id === 'hero');
    if (!u) return { err: 'no hero' };
    for (const s of u.skills) u.cooldowns.set(s.id, 0);
    return { ok: true };
  });

// ═══ BE2（预期绿 · N2 转绿 · ATK-6 v2.0）：选绝 → 点空红格 → cast 空放受理（资源全扣无伤害） ═══
{
  await waitHeroTurn();
  await clearEnemyBars();
  await clearHeroCooldowns();
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

// ═══ BE3a（预期绿 · N2 转绿 · ATK-7 射程内臂）：敌演出位 ∈ 射程 → 点可见位 = cast 空放受理 ═══
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
  await page.waitForTimeout(400);
  const st1 = await snapState();
  const foeHpUnchanged = st1.foes.every((f) => {
    const b = st0.foes.find((x) => x.id === f.id);
    return !b || b.hp === f.hp;
  });
  const casted =
    st1.selected === null && st1.evN === st0.evN + 1 &&
    st1.hero.neili === st0.hero.neili - 1 && foeHpUnchanged;
  report('BE3a 演出位∈射程=cast 空放受理（N2 转绿）', false, casted,
    `敌 pos=${JSON.stringify(vis.pos)} 可见位=${JSON.stringify(vis.renderPos)} 选中=${st1.selected} 事件${st0.evN}→${st1.evN} 内力${st0.hero.neili}→${st1.hero.neili} 敌hp不变=${foeHpUnchanged}`);
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
  await page.waitForTimeout(400);
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
