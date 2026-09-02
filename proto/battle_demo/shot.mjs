// battle_demo 目验截图驱动（playwright-core + 本机 Chrome；产物供 L 环预检与交付对比）
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

// 带诊断的页面内点按：返回 p 坐标后用鼠标真实点按
async function tapAt(evalFn, label) {
  const res = await page.evaluate(evalFn);
  if (res && res.err) throw new Error(`[tap:${label}] ${JSON.stringify(res)}`);
  if (res && res.p) await page.mouse.click(res.p.x, res.p.y);
  else throw new Error(`[tap:${label}] 无坐标`);
}
const waitHeroTurn = () =>
  page.waitForFunction(() => window.__demo.session.snapshot().pendingInput === true, null, { timeout: 30000 });
const enemyInTarget = () =>
  page.evaluate(() => {
    const snap = window.__demo.session.snapshot();
    return !!snap.actors.find(
      (a) => a.side === 'enemy' && a.animState !== 'dead' && snap.attackCells.some((c) => c.q === a.renderPos.q && c.r === a.renderPos.r),
    );
  });
const tapTe = async () => {
  await page.waitForFunction(() => window.__demo.view.skillPop > 0.9, null, { timeout: 5000 });
  return tapAt(() => {
    const p = window.__demo.btnCss('te');
    if (!p) return { err: 'btnCss(te)=null', pop: window.__demo.view.skillPop };
    return { p };
  }, 'te');
  };
const tapApproach = () =>
  tapAt(() => {
    const d = window.__demo;
    const snap = d.session.snapshot();
    const foe = snap.actors.find((a) => a.side === 'enemy' && a.animState !== 'dead');
    const cell = snap.moveCells
      .slice()
      .sort((a, b) => Math.hypot(a.q - foe.pos.q, a.r - foe.pos.r) - Math.hypot(b.q - foe.pos.q, b.r - foe.pos.r))[0];
    if (!cell) return { err: 'moveCells empty' };
    return { p: d.cellCss(cell.q, cell.r) };
  }, 'approach-move');

await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(outDir, 'shot_0_env_pieces.png') });

// 等主角行动条满（弧形四钮弹出）
await waitHeroTurn();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, 'shot_1_skillpop.png') });

// 激活「特」→ 攻击范围红格；不入程则「取消→移动逼近」下一回合重试（v8 §2：激活后点无效格=取消）
await tapTe();
await page.waitForTimeout(300);
for (let i = 0; i < 5 && !(await enemyInTarget()); i++) {
  await tapTe(); // 再点一次=取消施放
  await tapApproach(); // 点可移动格逼近（skill 已取消，走 !skill && inMove 分支）
  await waitHeroTurn();
  await tapTe();
  await page.waitForTimeout(300);
}
if (!(await enemyInTarget())) throw new Error('敌人仍不在攻击范围（演示路径失败）');
await page.screenshot({ path: path.join(outDir, 'shot_2_attack_range.png') });
await tapAt(() => {
  const d = window.__demo;
  const snap = d.session.snapshot();
  const t = snap.actors.find(
    (a) => a.side === 'enemy' && a.animState !== 'dead' && snap.attackCells.some((c) => c.q === a.renderPos.q && c.r === a.renderPos.r),
  );
  return { p: d.cellCss(t.renderPos.q, t.renderPos.r) };
}, 'attack-enemy');
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(outDir, 'shot_3_attack_fx.png') });

// 再等一回合，点可移动格（移动演示）
await waitHeroTurn();
await tapAt(() => {
  const d = window.__demo;
  const c = d.session.snapshot().moveCells[0];
  if (!c) return { err: 'moveCells empty' };
  return { p: d.cellCss(c.q, c.r) };
}, 'move');
await page.waitForTimeout(350);
await page.screenshot({ path: path.join(outDir, 'shot_4_move.png') });

// 拖镜演示（>8px）
await page.mouse.move(225, 400);
await page.mouse.down();
await page.mouse.move(265, 360, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outDir, 'shot_5_camera_drag.png') });

console.log(logs.filter((l) => l.includes('battle_demo') || l.includes('pageerror')).slice(0, 6).join('\n'));
await browser.close();
console.log('[shot] 完成 →', outDir);
