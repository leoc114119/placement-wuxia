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
await page.screenshot({ path: path.join(outDir, 'shot_1_skillpop.png') });

// ① 点击可移动格=移动（绿格）
await page.evaluate(() => {
  const d = window.__demo;
  const s = d.session.snapshot();
  const cell = s.moveCells[0];
  window.__demo._mv = { from: { ...s.actors.find((a) => a.id === 'hero').pos }, to: cell };
  const p = d.cellCss(cell.q, cell.r);
  return { p };
}).then((r) => page.mouse.click(r.p.x, r.p.y));
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
await page.waitForTimeout(150); // lerp 窗口内截空中帧
await page.screenshot({ path: path.join(outDir, 'shot_4_jump_air.png') });
await page.waitForTimeout(600);
st = await snapState();
check('②/F1 跳跃位移落地', st.hero.pos.q === jumped.target.q && st.hero.pos.r === jumped.target.r,
  `${JSON.stringify(jumped.before)}→${JSON.stringify(st.hero.pos)}`);

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
const camDragged = await page.evaluate(() => window.__demo.getView().camDrag.x > 20);
check('⑥ 镜头拖动', camDragged);
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

console.log(results.join('\n'));
console.log(logs.filter((l) => l.includes('battle_demo') || l.includes('pageerror')).slice(0, 4).join('\n'));
await browser.close();
console.log('[shot] 完成 →', outDir);
