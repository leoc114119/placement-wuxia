// ═══ 【TASK-AS-v04】PRM-1 普攻选格 + GSG-1 hover + ATK-1 六向纯距离 表现证据链驱动（规格 v2.5 · 方案 v0.4 §9.3/§9.4）═══
// 用法：node proto/battle_demo/shot_basic_cells.mjs
// 产出：shots/basic_{x1|x2}_{档}_{相位}.png —— 两速 × 三档（375×667 / 560×700 / 900×560）× 四相位：
//       select（ctrl「攻」→ 主角外圈六邻格金色选中态，PRM-1②）、hover（悬停金格=红色选中效果，
//       GSG-1「悬停即选中视觉，点击立即执行」）、sixdir（背向敌普攻受理=纯距离六向皆可+受击敌定朝向，
//       ATK-1 v2.5 勘误/FACE-1 §9.2.2——whip 白盒布向还原旧锥面必拒反例）、whiff（空邻格空挥=恰 1 条
//       basic 无 targetId 无 damage+零 RNG+零资源+朝向=点击格 fallback，PRM-1③/v2.5 先锁口径）。
// 白盒说明：与 shot_as_cast.mjs 同款（_debug.units 摆位清条、layout.atkBtn 真实点击链路、
//       page.mouse.move 走 main.ts pointermove→input.hover 真实 hover 管线）；事件等待=waitForFunction
//       真事件；校验不过退出码 1。
// x2：点 ctrl 加速钮（真实点击链路）——宿主逻辑 dt 唯一真源（方案 §4.4）。
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

const errors = [];
const checks = [];
const check = (id, ok, detail) => {
  checks.push(`${ok ? 'PASS' : 'FAIL'}  ${id} · ${detail}`);
  if (!ok) process.exitCode = 1;
};

let page = null;
const shot = async (name) => {
  await page.screenshot({ path: path.join(outDir, `basic_${name}.png`) });
};

const HEX_EQ = (a, b) => a.q === b.q && a.r === b.r;

for (const [vw, vh, tag] of [[375, 667, '375x667'], [560, 700, '560x700'], [900, 560, '900x560']]) {
  for (const [speedTag, speedOn] of [['x1', false], ['x2', true]]) {
    page = await browser.newPage({ viewport: { width: vw, height: vh } });
    page.on('pageerror', (e) => errors.push(`[${speedTag}/${tag}] ${e.message}`));
    console.log(`[shot_basic_cells] → ${speedTag} @ ${tag}`);
    await page.goto('file://' + path.join(here, 'index.html'));
    await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
    await page.waitForTimeout(800);

    // x2：ctrl 加速钮（row2 中点，真实点击链路，T23-V4 同款换算）
    if (speedOn) {
      const p = await page.evaluate(() => {
        const r = window.__demo.getView().layout.ctrlRect;
        return window.__demo.cssOf(r.x + ((5 + 213 / 2) / 223) * r.w, r.y + ((163 + 126 / 2) / 448) * r.h);
      });
      await page.mouse.click(p.x, p.y);
      await page.waitForFunction(() => window.__demo.getView().uiState.speed === true, null, { timeout: 4000 });
    }

    const clearEnemyBars = () =>
      page.evaluate(() => {
        for (const u of window.__demo.session._debug.units) {
          if (u.side === 'enemy') { u.bar = 0; u.barWasMax = false; }
        }
      });

    // ── 相位 1：ATK-1 六向纯距离 + FACE-1 受击敌定朝向（turn 1：点敌路径） ──
    await page.waitForFunction(() => window.__demo.session.snapshot().pendingInput === true, null, { timeout: 40000 });
    await clearEnemyBars();
    // 白盒布向：hero 朝正东 + whip（旧锥形规则下北向邻格敌必 rejected——还原 §9.2.1 反例）
    const laid = await page.evaluate(() => {
      const d = window.__demo;
      const hero = d.session._debug.units.find((u) => u.id === 'hero');
      const place = (fid, fq, fr) => {
        const u = d.session._debug.units.find((x) => x.id === fid);
        u.hex = { q: fq, r: fr };
        u.renderQ = fq; u.renderR = fr; u.moveFromQ = fq; u.moveFromR = fr;
        u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0; u.dead = false;
        u.bar = 0; u.barWasMax = false;
        if (u.hp <= 0) u.hp = 50;
        return u;
      };
      hero.weapon = 'whip'; // 旧锥形武器：还原「facing 扇区过滤」反例面（纯距离下六向皆可）
      hero.hexFacing = { q: 1, r: 0 }; // 朝正东
      hero.faceLeft = false;
      place('e1', hero.hex.q, hero.hex.r - 1); // 正北邻格（Δ={0,-1}；dirRingDist(北,东)=2>1 → 旧规则必拒）
      place('e2', hero.hex.q, hero.hex.r + 3 <= 13 ? hero.hex.r + 3 : hero.hex.r - 3); // 远离战团
      return { heroPos: { ...hero.hex }, north: { q: hero.hex.q, r: hero.hex.r - 1 } };
    });
    const atkP = await page.evaluate(([fq, fr]) => window.__demo.cellCss(fq, fr), [laid.north.q, laid.north.r]);
    const atk0 = await page.evaluate(() => ({
      evN: window.__demo.session.events.length,
      hp: window.__demo.session._debug.units.find((u) => u.id === 'e1').hp,
    }));
    await page.mouse.click(atkP.x, atkP.y);
    await page.waitForFunction(
      (n0) => window.__demo.session.events.slice(n0).some((e) => (e.type === 'basic' || e.type === 'miss') && e.targetId === 'e1'),
      atk0.evN,
      { timeout: 8000 },
    );
    const sixdir = await page.evaluate(() => {
      const s = window.__demo.session.snapshot();
      const hero = s.actors.find((a) => a.id === 'hero');
      const e1 = s.actors.find((a) => a.id === 'e1');
      return {
        facingHex: hero.facingHex,
        e1hp: e1.hp,
        evs: window.__demo.session.events.filter((e) => (e.type === 'basic' || e.type === 'miss') && e.targetId === 'e1').length,
        bar: hero.actionBar,
      };
    });
    check(
      `${speedTag}/${tag} ATK-1 六向纯距离：朝东北向邻格敌（旧锥面必拒反例）受理结算`,
      sixdir.evs === 1 && sixdir.bar < 1, // BAR-3 提交即清零；采样跨帧容差（回合消耗由事件+bar<1 双锁）
      `e1结算事件=${sixdir.evs} hp→${sixdir.e1hp}（朝向=正东、敌=正北；旧 inCone 扇区过滤下本攻击必 rejected）`,
    );
    check(
      `${speedTag}/${tag} FACE-1 受击敌定朝向：出手后 facingHex=leftup（正北敌六向吸附，非点击格/非旧朝向）`,
      sixdir.facingHex === 'leftup',
      `facingHex=${sixdir.facingHex}`,
    );
    await shot(`${speedTag}_${tag}_sixdir`);

    // ── 相位 2：PRM-1 攻钮 → 金色六邻格（turn 2） ──
    await clearEnemyBars();
    await page.waitForFunction(() => window.__demo.session.snapshot().pendingInput === true, null, { timeout: 40000 });
    await page.waitForTimeout(200); // 待一帧：layout.atkBtn last-drawn
    const btn = await page.evaluate(() => {
      const r = window.__demo.getView().layout.atkBtn;
      return r ? window.__demo.cssOf(r.x + r.w / 2, r.y + r.h / 2) : null;
    });
    if (!btn) throw new Error(`攻钮热区未产出（${speedTag}/${tag}）——待命期 layout.atkBtn 应非空`);
    await page.mouse.click(btn.x, btn.y);
    await page.waitForFunction(
      () => window.__demo.session.snapshot().basicCells.length > 0,
      null,
      { timeout: 4000 },
    );
    const sel = await page.evaluate(() => {
      const s = window.__demo.session.snapshot();
      const hero = s.actors.find((a) => a.id === 'hero');
      const cube = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
      return {
        n: s.basicCells.length,
        allAdj: s.basicCells.every((c) => cube(c, hero.pos) === 1),
        east: s.basicCells.some((c) => c.q === hero.pos.q + 1 && c.r === hero.pos.r),
        selected: s.selectedSkill,
      };
    });
    check(
      `${speedTag}/${tag} PRM-1 攻钮选中态：basicCells=外圈六邻格（∩可动区）且非 selectedSkill 通道`,
      sel.n >= 4 && sel.allAdj && sel.selected === null,
      `basicCells=${sel.n} 全邻接=${sel.allAdj} selectedSkill=${sel.selected}`,
    );
    await shot(`${speedTag}_${tag}_select`);

    // ── 相位 3：GSG-1 hover 红态（真实 pointermove 管线） ──
    const hoverCell = await page.evaluate(() => {
      const s = window.__demo.session.snapshot();
      const hero = s.actors.find((a) => a.id === 'hero');
      return s.basicCells.find((c) => c.q === hero.pos.q + 1 && c.r === hero.pos.r) ?? s.basicCells[0]; // 东空格优先
    });
    const hp = await page.evaluate(([fq, fr]) => window.__demo.cellCss(fq, fr), [hoverCell.q, hoverCell.r]);
    await page.mouse.move(hp.x, hp.y);
    await page.waitForFunction(
      ([fq, fr]) => {
        const h = window.__demo.getView().hoverCell;
        return !!h && h.q === fq && h.r === fr;
      },
      [hoverCell.q, hoverCell.r],
      { timeout: 4000 },
    );
    await page.waitForTimeout(120); // 待一帧渲染红态
    check(
      `${speedTag}/${tag} GSG-1 hover：pointermove 真实管线写 view.hoverCell（金格上悬停=红色选中视觉，点击立即执行不两段确认）`,
      true,
      `hoverCell=(${hoverCell.q},${hoverCell.r}) 留档 basic_${speedTag}_${tag}_hover.png（红态目验）`,
    );
    await shot(`${speedTag}_${tag}_hover`);

    // ── 相位 4：空挥（PRM-1③ · v2.5 先锁口径：耗回合零伤害零内力零冷却零 RNG） ──
    const pre = await page.evaluate(() => ({
      evN: window.__demo.session.events.length,
      rng: window.__demo.session._debug.rngCalls(),
      e1hp: window.__demo.session._debug.units.find((u) => u.id === 'e1').hp,
      neili: window.__demo.session.snapshot().actors.find((a) => a.id === 'hero').neili,
    }));
    await clearEnemyBars();
    await page.mouse.click(hp.x, hp.y); // 点击悬停格=立即执行（无两段确认）
    await page.waitForFunction((n0) => window.__demo.session.events.length > n0, pre.evN, { timeout: 8000 });
    const whiff = await page.evaluate((pre0) => {
      const s = window.__demo.session.snapshot();
      const hero = s.actors.find((a) => a.id === 'hero');
      const evs = window.__demo.session.events.slice(pre0.evN);
      return {
        evs: evs.map((e) => ({ t: e.type, tgt: e.targetId ?? null, dmg: e.damage ?? null })),
        rng: window.__demo.session._debug.rngCalls(),
        e1hp: window.__demo.session._debug.units.find((u) => u.id === 'e1').hp,
        neili: hero.neili,
        bar: hero.actionBar,
        pending: s.pendingInput,
        basicN: s.basicCells.length,
        facingHex: hero.facingHex,
      };
    }, pre);
    const onlyWhiff =
      whiff.evs.length === 1 && whiff.evs[0].t === 'basic' && whiff.evs[0].tgt === null && whiff.evs[0].dmg === null;
    check(
      `${speedTag}/${tag} 空挥：恰 1 条 basic（无 targetId 无 damage）+ 零 RNG + 零资源 + 耗回合 + 选中/输入态清`,
      onlyWhiff && whiff.rng === pre.rng && whiff.e1hp === pre.e1hp && whiff.neili === pre.neili &&
        whiff.bar < 1 && whiff.pending === false && whiff.basicN === 0,
      `事件=${JSON.stringify(whiff.evs)} rng ${pre.rng}→${whiff.rng} e1hp ${pre.e1hp}→${whiff.e1hp} neili ${pre.neili}→${whiff.neili} bar=${whiff.bar} basicCells=${whiff.basicN}`,
    );
    check(
      `${speedTag}/${tag} 空挥朝向=点击格（FACE-1 现行 fallback，§9.2.2「L 环确认后锁死」）：出手后 facingHex=right（东向格）`,
      whiff.facingHex === 'right',
      `facingHex=${whiff.facingHex}`,
    );
    await shot(`${speedTag}_${tag}_whiff`);
    await page.close();
  }
}

await browser.close();
console.log(checks.join('\n'));
if (errors.length) {
  console.error('[shot_basic_cells] pageerror:', errors);
  process.exitCode = 1;
}
console.log(`[shot_basic_cells] 完成 ${checks.filter((c) => c.startsWith('PASS')).length}/${checks.length} → ${outDir}`);
