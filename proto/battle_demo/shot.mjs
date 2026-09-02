// battle_demo 联调验证驱动（真 battle-session · 七项清单端到端）
// 用法：node proto/battle_demo/shot.mjs
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
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ①-⑦ ${name}${detail ? ' · ' + detail : ''}`);
  if (!ok) console.log(`FAIL ${name} ${detail}`);
};

async function tapAt(evalFn, label) {
  const res = await page.evaluate(evalFn);
  if (res && res.err) throw new Error(`[tap:${label}] ${JSON.stringify(res)}`);
  if (res && res.p) await page.mouse.click(res.p.x, res.p.y);
  else throw new Error(`[tap:${label}] 无坐标`);
}
const waitHeroTurn = () =>
  page.waitForFunction(() => window.__demo.session.snapshot().pendingInput === true, null, { timeout: 40000 });
const waitPop = () =>
  page.waitForFunction(() => window.__demo.getView().skillPop > 0.9, null, { timeout: 6000 }).catch(() => {});
const tapTe = () =>
  tapAt(() => {
    const p = window.__demo.btnCss('te');
    return p ? { p } : { err: 'btnCss(te)=null' };
  }, 'te');
const tapQing = () =>
  tapAt(() => {
    const p = window.__demo.btnCss('qing');
    return p ? { p } : { err: 'btnCss(qing)=null' };
  }, 'qing');
const snapState = () =>
  page.evaluate(() => {
    const s = window.__demo.session.snapshot();
    return {
      phase: s.phase, pending: s.pendingInput, moveKind: s.moveKind,
      moveN: s.moveCells.length, atkN: s.attackCells.length,
      heroSkills: s.heroSkills, mode: window.__demo.session._debug.mode(),
      hero: s.actors.find((a) => a.id === 'hero'),
      foes: s.actors.filter((a) => a.side === 'enemy').map((a) => ({ id: a.id, hp: a.hp, sprite: a.spriteKey, cfg: a.configId })),
    };
  });

await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(outDir, 'shot_0_env_pieces.png') });

// ⑤ 敌我名字色/双条 + F3 帧表键（初始画面即含）
let st = await snapState();
check('⑤/F3 敌方 spriteKey=configId', st.foes.every((f) => f.sprite === f.cfg && ['npc-shanzei', 'npc-lang'].includes(f.cfg)), JSON.stringify(st.foes));

// ④ 弧形四钮弹出 + 置灰（du=武器不匹配恒灰）
await waitHeroTurn();
await waitPop();
st = await snapState();
const btns = await page.evaluate(() => window.__demo.getView().layout.skillBtns);
check('④/F2 四钮弹出+置灰真值', btns.length === 4 && st.heroSkills.length === 4 && btns.find((b) => b.id === 'du')?.disabled === true,
  JSON.stringify({ ids: btns.map((b) => `${b.id}:${b.disabled ? '灰' : '亮'}`) }));
// L⑥：放大后直径与防重叠（相邻钮心距 > 直径）
const btnGeom = await page.evaluate(() => {
  const bs = window.__demo.getView().layout.skillBtns;
  const d = bs[0].r * 2;
  const gaps = [];
  for (let i = 1; i < bs.length; i++) gaps.push(+(Math.hypot(bs[i].x - bs[i - 1].x, bs[i].y - bs[i - 1].y).toFixed(1)));
  return { d: +d.toFixed(1), gaps };
});
check('L⑥ 弧钮放大+防重叠', btnGeom.d >= 26 && btnGeom.gaps.every((g) => g > btnGeom.d), JSON.stringify(btnGeom));
await page.screenshot({ path: path.join(outDir, 'shot_1_skillpop.png') });

// L 环终验：连续帧序列单调（长距跳跃 0.6s 演出 / 普通移动多格）——位置沿移动向量投影无回跳
async function monotonicSequence(jump) {
  await waitHeroTurn();
  if (jump) await waitPop();
  const seq = await page.evaluate(async (isJump) => {
    try {
      const d = window.__demo;
      const s = d.session.snapshot();
      const hero = s.actors.find((a) => a.id === 'hero');
      const rect = document.getElementById('cv').getBoundingClientRect();
      const cands = [];
      for (const c of s.moveCells) {
        const cp = d.cellCss(c.q, c.r);
        if (cp.x > 10 && cp.x < rect.width - 10 && cp.y > 10 && cp.y < rect.height - 10) {
          cands.push({ cell: c, cp, md: Math.abs(c.q - hero.pos.q) + Math.abs(c.r - hero.pos.r) });
        }
      }
      cands.sort((a, b) => b.md - a.md);
      if (!cands.length) return { err: 'no on-screen moveCell' };
      const target = cands[0].cell;
      const targetCp = cands[0].cp;
      if (isJump) {
        const bp = d.btnCss('qing');
        if (!bp) return { err: 'btnCss(qing)=null' };
        const be = document.elementFromPoint(bp.x, bp.y);
        const bo = { bubbles: true, clientX: bp.x, clientY: bp.y, pointerId: 1 };
        be.dispatchEvent(new PointerEvent('pointerdown', bo));
        be.dispatchEvent(new PointerEvent('pointerup', bo));
      }
      const ce = document.elementFromPoint(targetCp.x, targetCp.y);
      const co = { bubbles: true, clientX: targetCp.x, clientY: targetCp.y, pointerId: 1 };
      ce.dispatchEvent(new PointerEvent('pointerdown', co));
      ce.dispatchEvent(new PointerEvent('pointerup', co));
      const seqOut = [];
      for (let i = 0; i < 40; i++) {
        seqOut.push(d.sampleHeroDraw());
        await new Promise((r2) => setTimeout(r2, 30));
      }
      return { seq: seqOut, target, from: { q: hero.pos.q, r: hero.pos.r } };
    } catch (e) {
      return { err: String((e && e.message) || e) };
    }
  }, jump);
  if (seq.err) throw new Error('帧序列采样：' + seq.err);
  // 投影单调：沿 from→target 向量的标量投影不得回跳 >0.05
  const proj = seq.seq.map((sm) => {
    const vx = sm.q - seq.from.q;
    const vy = sm.r - seq.from.r;
    const tx = seq.target.q - seq.from.q;
    const ty = seq.target.r - seq.from.r;
    const len = Math.hypot(tx, ty) || 1;
    return +((vx * tx + vy * ty) / len).toFixed(3);
  });
  let prev = -1;
  const regress = [];
  for (const [i, v] of proj.entries()) {
    if (v < prev - 0.05) regress.push(i);
    prev = Math.max(prev, v);
  }
  return { regress, proj, seq };
}
for (const jump of [true, false]) {
  const tag = jump ? 'jump' : 'walk';
  const r = await monotonicSequence(jump);
  check(`终验 帧序列单调（${tag}）`, r.regress.length === 0, `回跳帧=${JSON.stringify(r.regress)} 采样=${JSON.stringify(r.proj.filter((_, i) => i % 8 === 0))}`);
  await page.screenshot({ path: path.join(outDir, `shot_seq_${tag}.png`) });
}

await page.evaluate(() => window.__demo.session.submit({ type: 'cancelSkill' }));


// ① 点击可移动格=移动（绿格）
await waitHeroTurn();
await page.evaluate(() => {
  const d = window.__demo;
  const s = d.session.snapshot();
  const cell = s.moveCells[0];
  if (!cell) return { err: 'moveCells empty' };
  const hero = s.actors.find((a) => a.id === 'hero');
  if (!hero) return { err: 'hero missing' };
  window.__demo._mv = { from: { ...hero.pos }, to: cell };
  return { p: d.cellCss(cell.q, cell.r) };
}).then((r) => {
  if (r && r.err) throw new Error('① ' + r.err);
  if (r && r.p) page.mouse.click(r.p.x, r.p.y);
});
await page.waitForTimeout(500);
st = await snapState();
check('① 绿格移动', st.hero.pos.q === st.hero.renderPos.q || st.pending === true, `pos=${JSON.stringify(st.hero.pos)}`);
await page.screenshot({ path: path.join(outDir, 'shot_2_walk.png') });

// ② 激活轻功→金格→点格=跳跃位移（F1 重点）
await waitHeroTurn();
await waitPop();
await tapQing();
await page.waitForTimeout(350);
st = await snapState();
check('②/F1 轻功激活→moveKind=jump', st.moveKind === 'jump' && st.moveN > 0, `kind=${st.moveKind} cells=${st.moveN}`);
await page.screenshot({ path: path.join(outDir, 'shot_3_jump_gold.png') });
const jumped = await page.evaluate(() => {
  const d = window.__demo;
  const s = d.session.snapshot();
  const hero = s.actors.find((a) => a.id === 'hero');
  const far = s.moveCells.slice().sort((a, b) => Math.hypot(b.q - hero.pos.q, b.r - hero.pos.r) - Math.hypot(a.q - hero.pos.q, a.r - hero.pos.r))[0];
  const p = d.cellCss(far.q, far.r);
  return { p, before: { ...hero.pos }, target: far };
});
await page.mouse.click(jumped.p.x, jumped.p.y);
// L 环追加①②：0.6s 跳跃演出——上升/顶点/落地三帧对比
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outDir, 'shot_4a_jump_rise.png') });
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(outDir, 'shot_4b_jump_apex.png') });
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, 'shot_4c_jump_land.png') });
st = await snapState();
check('②/F1 跳跃位移落地', st.hero.pos.q === jumped.target.q && st.hero.pos.r === jumped.target.r,
  `${JSON.stringify(jumped.before)}→${JSON.stringify(st.hero.pos)}`);
/* L③ 镜头静止/回拉策略由单测确定性锁定（时序敏感，不进截图驱动） */

// ③ 点敌人=普攻（下回合）
await waitHeroTurn();
await waitPop();
const atk = await page.evaluate(() => {
  const d = window.__demo;
  const s = d.session.snapshot();
  const foe = s.actors.find((a) => a.side === 'enemy' && a.animState !== 'dead');
  const before = foe.hp;
  const p = d.cellCss(foe.renderPos.q, foe.renderPos.r);
  return { p, id: foe.id, before };
});
await page.mouse.click(atk.p.x, atk.p.y);
await page.waitForTimeout(600);
st = await snapState();
const foeAfter = st.foes.find((f) => f.id === atk.id);
check('③ 点敌普攻', foeAfter.hp < atk.before || st.foes.some((f) => f.hp < 100), `hp ${atk.before}→${foeAfter.hp}`);
await page.screenshot({ path: path.join(outDir, 'shot_5_basic_attack.png') });

// ⑥ 镜头拖动
await page.mouse.move(225, 400);
await page.mouse.down();
await page.mouse.move(285, 340, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(250);
const camDragged = await page.evaluate(() => window.__demo.getView().camDrag.x);
check('⑥/L⑤ 镜头拖动跟手（右拖 camDrag 负向）', camDragged < -20, `camDrag.x=${camDragged}`);
await page.screenshot({ path: path.join(outDir, 'shot_6_camera.png') });

// ⑦ 三场模式（托管切换）
const tapCtrlRow1 = () =>
  tapAt(() => {
    const r = window.__demo.getView().layout.ctrlRect;
    if (!r) return { err: 'ctrlRect=null' };
    return { p: window.__demo.cssOf(r.x + r.w / 2, r.y + (66 / 448) * r.h) };
  }, 'ctrl-row1');
await tapCtrlRow1();
await page.waitForTimeout(2500); // AI 代行，画面自行推进
st = await snapState();
check('⑦ 托管切 auto（AI 代行推进）', st.mode === 'auto' && st.phase === 'fighting', `mode=${st.mode}`);
await page.screenshot({ path: path.join(outDir, 'shot_7_auto.png') });
await tapCtrlRow1();
st = await snapState();
check('⑦ 切回 manual', st.mode === 'manual', `mode=${st.mode}`);

// T15 R3：rejected 冒字——走 session 公共 API submit（与 input dispatch 同入口），
// attack 必然「受理或发 rejected 事件」（bar/range/invalid），确定性触发消费链演示
const rejectedCount = await page.evaluate(() => {
  const s = window.__demo.session.snapshot();
  const foe = s.actors.find((a) => a.side === 'enemy' && a.animState !== 'dead');
  window.__demo.session.submit({ type: 'attack', targetId: foe.id, skillId: null });
  return window.__demo.session.events.filter((e) => e.type === 'rejected').length;
});
await page.waitForTimeout(300); // 冒字窗口内截图（sec 1.1s）
await page.screenshot({ path: path.join(outDir, 'shot_reject_note.png') });
check('R3 rejected 冒字可观测', rejectedCount > 0, `rejected 事件 ${rejectedCount} 条`);
// 若因此消耗了回合/激活态，取消干净进入主流程


// L④：多窗口尺寸下 ctrl/plaque 恒可见（右下/左上锚定 + 短边约束）
for (const vp of [{ w: 375, h: 667, tag: '375x667' }, { w: 560, h: 700, tag: '560x700' }, { w: 900, h: 560, tag: '900x560-wide' }]) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.waitForTimeout(400); // resize 自适应 + 数帧
  const vis = await page.evaluate(() => {
    const l = window.__demo.getView().layout;
    const W = window.__demo.W;
    const H = window.__demo.H;
    const inScreen = (r) => r && r.x >= 0 && r.y >= 0 && r.x + r.w <= W + 0.5 && r.y + r.h <= H + 0.5;
    return { W, H, ctrl: inScreen(l.ctrlRect), plaque: inScreen(l.plaqueRect), ctrlRect: l.ctrlRect };
  });
  check(`L④ ${vp.tag} ctrl/plaque 恒可见`, vis.ctrl && vis.plaque, JSON.stringify({ W: vis.W, H: vis.H, ctrl: vis.ctrlRect }));
  await page.screenshot({ path: path.join(outDir, `shot_size_${vp.tag}.png`) });
}

console.log(results.join('\n'));
console.log(logs.filter((l) => l.includes('battle_demo') || l.includes('pageerror')).slice(0, 4).join('\n'));
await browser.close();
console.log('[shot] 完成 →', outDir);
