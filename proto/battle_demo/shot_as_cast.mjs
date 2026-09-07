// ═══ 【AS · TASK-AS-v03】出招速度+两段式伤害 表现证据链驱动（需求 v1.4 AS-2/3/4/6 · 方案 v0.3 §4.4/§6 FE DoD）═══
// 用法：node proto/battle_demo/shot_as_cast.mjs
// 产出：shots/ascast_{x1|x2}_{档}_{相位}.png —— 两速 × 三档（375×667 / 560×700 / 900×560）×
//       五相位：seg1（t0 段 1 首跳：施法相 charge 当帧冒字+血条首降，AS-3「提交即时结算」）、
//       loop_a/loop_b（280ms cast 循环第 2/3 帧互异=整套循环多帧可见，AS-2）、
//       loop_late（段 1 后施法相循环持续 ≥1.8s——循环至 t1，无 strike 收招相，AS-4）、
//       seg2（t1 段 2 二跳冒字+回 idle+血条再降，AS-4/方案 §4.4「t1 事件触发第二跳并回 idle」）。
// 白盒说明：与 shot_sixdir.mjs 同款（_debug.units 摆位清条、__demo.getView() 读演出钟）；
//       帧相位=按 view.anim 钟轮询定帧（charge 步频=独立常量 CAST_FRAME_PERIOD_MS=280，
//       方案 v0.3 §4.4/config battle-hex 定值，单测别名锁同源，页内不读 walkFrameMs）；
//       事件等待=waitForFunction 真事件（skill|miss × targetId）。只留档+控制台校验，
//       校验不过（循环帧未互异/事件非恰 2 条/段 2 未回 idle/冒字未现）退出码 1。
// x2：点 ctrl 加速钮（layout.ctrlRect 真实链路，T23-V4 同款换算）——宿主逻辑 dt 唯一真源下
//       cast 帧/血条/行动条同倍率（方案 §4.4「x2 只能有一个速度真源」）。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'shots');
fs.mkdirSync(outDir, { recursive: true });

const CAST_FRAME_PERIOD_MS = 280; // 【v0.3】施法相 cast 循环步频（config/battle-hex 同名常量；与 PIECE.walkFrameMs 解耦）

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

let page = null; // 当前证据页（循环内逐页赋值，单页串行安全）
const shot = async (name) => {
  await page.screenshot({ path: path.join(outDir, `ascast_${name}.png`) });
};

for (const [vw, vh, tag] of [[375, 667, '375x667'], [560, 700, '560x700'], [900, 560, '900x560']]) {
  for (const [speedTag, speedOn] of [['x1', false], ['x2', true]]) {
    page = await browser.newPage({ viewport: { width: vw, height: vh } });
    page.on('pageerror', (e) => errors.push(`[${speedTag}/${tag}] ${e.message}`));
    console.log(`[shot_as_cast] → ${speedTag} @ ${tag}`);
    await page.goto('file://' + path.join(here, 'index.html'));
    await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
    await page.waitForTimeout(800); // 资源解码 + 首帧

    // x2：ctrl 加速钮（真实点击链路；row2=加速，CTRL_ART 223×448 标定矩形中点）
    if (speedOn) {
      const p = await page.evaluate(() => {
        const r = window.__demo.getView().layout.ctrlRect;
        return window.__demo.cssOf(r.x + ((5 + 213 / 2) / 223) * r.w, r.y + ((163 + 126 / 2) / 448) * r.h);
      });
      await page.mouse.click(p.x, p.y);
      await page.waitForFunction(() => window.__demo.getView().uiState.speed === true, null, { timeout: 4000 });
    }

    // 主角回合：选 te → 从 attackCells 里选安全目标格（画布内+避组件+cube 2 优先——宽窗 900x560
    // 下镜头居中时东/西 cube 2 均可能出画布，attackCells 内逐格筛保可点）→ 摆 e1 于该格、
    // e2 东向 cube 3 出射程核位（BE3a 同款；清敌条防行动污染窗口）
    await page.waitForFunction(() => window.__demo.session.snapshot().pendingInput === true, null, { timeout: 40000 });
    await page.waitForFunction(() => window.__demo.getView().skillPop > 0.9, null, { timeout: 6000 });
    const btn = await page.evaluate(() => window.__demo.btnCss('te'));
    await page.mouse.click(btn.x, btn.y);
    await page.waitForTimeout(300);
    const plan = await page.evaluate(() => {
      const d = window.__demo;
      const s = d.session.snapshot();
      const hero = s.actors.find((a) => a.id === 'hero');
      const rect = document.getElementById('cv').getBoundingClientRect(); // 画布 CSS 真值
      const L = d.getView().layout;
      const cube = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((a.q + a.r) - (b.q + b.r))) / 2;
      const occupied = new Set(s.actors.filter((a) => a.animState !== 'dead').map((a) => `${a.pos.q},${a.pos.r}`));
      const safe = (c) => {
        const p = d.cellCss(c.q, c.r);
        const lx = p.x - rect.left; // 画布逻辑系（layout 热区同系；CSS 缩放 1:1）
        const ly = p.y - rect.top;
        if (lx < 40 || lx > d.W - 40 || ly < 120 || ly > d.H - 80) return false; // 顶栏/ctrl 让位边距
        const inRect = (r) => r && lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h;
        if (inRect(L.ctrlRect) || inRect(L.plaqueRect)) return false;
        if (L.skillBtns.some((b) => { const rr = b.r * 1.3; return (lx - b.x) ** 2 + (ly - b.y) ** 2 <= rr * rr; })) return false;
        return true;
      };
      const cell =
        s.attackCells.filter((c) => !occupied.has(`${c.q},${c.r}`) && safe(c)).sort((a, b) => cube(b, hero.pos) - cube(a, hero.pos))[0] ??
        null; // cube 距离降序=距 2 优先（BE1 同款射程边缘）
      const col = hero.pos.q + Math.floor(hero.pos.r / 2);
      return { cell, heroPos: hero.pos, e2q: col + 3 <= 11 ? hero.pos.q + 3 : hero.pos.q - 3, e2r: hero.pos.r };
    });
    if (!plan.cell) throw new Error(`无安全目标格（${speedTag}/${tag}）`);
    await page.evaluate(([c, e2q, e2r]) => {
      const place = (fid, fq, fr) => {
        const u = window.__demo.session._debug.units.find((x) => x.id === fid);
        u.hex = { q: fq, r: fr };
        u.renderQ = fq; u.renderR = fr; u.moveFromQ = fq; u.moveFromR = fr;
        u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0; u.dead = false;
        u.bar = 0; u.barWasMax = false;
        if (u.hp <= 0) u.hp = 50;
      };
      place('e1', c.q, c.r); // te 射程内安全格（cube 2 优先）
      place('e2', e2q, e2r); // 同排 cube 3=出射程核位（目标集恰 e1，两段事件确定）
    }, [plan.cell, plan.e2q, plan.e2r]);
    const ev0 = await page.evaluate(() => window.__demo.session.events.length);
    const hp0 = await page.evaluate(() => window.__demo.session.snapshot().actors.find((a) => a.id === 'e1').hp);

    // 点敌格：cast=提交即结算段 1（v1.4 AS-3），t0 起 charge 整套循环（280ms 步频）
    const cell = await page.evaluate(() => {
      const s = window.__demo.session.snapshot();
      const e1p = s.actors.find((a) => a.id === 'e1').pos;
      return { p: window.__demo.cellCss(e1p.q, e1p.r), q: e1p.q, r: e1p.r };
    });
    await page.mouse.click(cell.p.x, cell.p.y);
    // cast 提交验证（防点击被组件/画布外截获后无诊断超时）：施法相未开即抛现场
    try {
      await page.waitForFunction(() => {
        const c = window.__demo.getView().anim.get('hero');
        return !!c && c.state === 'charge';
      }, null, { timeout: 4000 });
    } catch {
      const st = await page.evaluate(() => ({
        selected: window.__demo.session.snapshot().selectedSkill,
        heroAnim: window.__demo.session.snapshot().actors.find((a) => a.id === 'hero').animState,
        evN: window.__demo.session.events.length,
      }));
      throw new Error(`cast 未提交（${speedTag}/${tag} cell=${JSON.stringify(plan.cell)}）：${JSON.stringify(st)}`);
    }

    // ① t0 段 1 首跳：等首条 e1 结算事件（提交同刻已在）→ 立即留影（施法相 charge 当帧冒字）
    await page.waitForFunction(
      (n0) => window.__demo.session.events.slice(n0).some((e) => (e.type === 'skill' || e.type === 'miss') && e.targetId === 'e1'),
      ev0,
      { timeout: 8000 },
    );
    await shot(`${speedTag}_${tag}_seg1`);
    const seg1 = await page.evaluate(() => {
      const s = window.__demo.session.snapshot();
      const v = window.__demo.getView();
      return {
        heroAnim: s.actors.find((a) => a.id === 'hero').animState,
        e1hp: s.actors.find((a) => a.id === 'e1').hp,
        dmgTexts: v.fx.filter((f) => f.kind === 'dmg').map((f) => f.text),
        pendN: v.pendingHits.length,
      };
    });
    check(
      `${speedTag}/${tag} 段1@t0=施法相 charge 首跳冒字（命中反馈，AS-3/§4.4）`,
      seg1.heroAnim === 'charge' && seg1.dmgTexts.length >= 1 && seg1.pendN === 0,
      `animState=${seg1.heroAnim} 冒字=${JSON.stringify(seg1.dmgTexts)} e1hp=${seg1.e1hp}`,
    );

    // ② 施法相循环多帧可见：轮询到 cast 第 2 帧 / 第 3 帧各留一影（280ms 步频；旧「定格第 1 帧」行为下两影同帧=校验红）
    await page.waitForFunction(
      (period) => {
        const c = window.__demo.getView().anim.get('hero');
        return !!c && c.state === 'charge' && 1 + (Math.floor((c.t * 1000) / period) % 3) === 2;
      },
      CAST_FRAME_PERIOD_MS,
      { timeout: 4000 },
    );
    await shot(`${speedTag}_${tag}_loop_a`);
    await page.waitForFunction(
      (period) => {
        const c = window.__demo.getView().anim.get('hero');
        const ord = c && c.state === 'charge' ? 1 + (Math.floor((c.t * 1000) / period) % 3) : null;
        if (ord === 3) {
          window.__asLoopB = { anim: c.state, ord }; // 命中相位页内留痕（x2 下钟 2x 速，事后采样会跨相位）
          return true;
        }
        return false;
      },
      CAST_FRAME_PERIOD_MS,
      { timeout: 4000 },
    );
    await shot(`${speedTag}_${tag}_loop_b`);
    const loopStates = await page.evaluate(() => window.__asLoopB ?? { anim: null, ord: null });
    check(`${speedTag}/${tag} 施法相=charge 且循环帧互异（cast2/cast3 两影，280ms 步频）`, loopStates.anim === 'charge' && loopStates.ord === 3, `animState=${loopStates.anim} loop_b 帧=cast${loopStates.ord}`);

    // ③ 循环至 t1：段 1 后施法相仍循环（charge 钟 ≥1.8s 留影——无 strike 收招相，AS-2 循环=出招时长）
    await page.waitForFunction(
      () => {
        const c = window.__demo.getView().anim.get('hero');
        return !!c && c.state === 'charge' && c.t >= 1.8;
      },
      null,
      { timeout: 8000 },
    );
    await shot(`${speedTag}_${tag}_loop_late`);
    const late = await page.evaluate(() => {
      const s = window.__demo.session.snapshot();
      const c = window.__demo.getView().anim.get('hero');
      return { heroAnim: s.actors.find((a) => a.id === 'hero').animState, chargeT: c ? c.t : null };
    });
    check(`${speedTag}/${tag} 段1 后循环持续至 t1（charge ≥1.8s，AS-2）`, late.heroAnim === 'charge' && late.chargeT >= 1.8, `animState=${late.heroAnim} chargeT=${late.chargeT?.toFixed(2)}`);

    // ④ t1 段 2：等第二条 e1 结算事件 → 立即留影（回 idle；二跳冒字；血条再降）
    await page.waitForFunction(
      (n0) => window.__demo.session.events.slice(n0).filter((e) => (e.type === 'skill' || e.type === 'miss') && e.targetId === 'e1').length >= 2,
      ev0,
      { timeout: 12000 },
    );
    await shot(`${speedTag}_${tag}_seg2`);
    const seg2 = await page.evaluate((hpBefore) => {
      const s = window.__demo.session.snapshot();
      const v = window.__demo.getView();
      return {
        heroAnim: s.actors.find((a) => a.id === 'hero').animState,
        e1hp: s.actors.find((a) => a.id === 'e1').hp,
        dmgFx: v.fx.filter((f) => f.kind === 'dmg').map((f) => ({ text: f.text, dx: f.dx ?? 0 })),
        pendN: v.pendingHits.length,
        evs: window.__demo.session.events.filter((e) => (e.type === 'skill' || e.type === 'miss') && e.targetId === 'e1').length,
        hpBefore,
      };
    }, seg1.e1hp);
    check(
      `${speedTag}/${tag} 段2@t1=二跳冒字+回 idle（AS-4/§4.4）`,
      seg2.evs === 2 && seg2.dmgFx.length >= 1 && seg2.pendN === 0 && seg2.heroAnim === 'idle',
      `e1结算事件=${seg2.evs} 冒字=${JSON.stringify(seg2.dmgFx)} animState=${seg2.heroAnim} e1hp ${hp0}→${seg1.e1hp}→${seg2.e1hp}（血条逐段下移入影 seg1/seg2）`,
    );
    await page.close();
  }
}

await browser.close();
console.log(checks.join('\n'));
if (errors.length) {
  console.error('[shot_as_cast] pageerror:', errors);
  process.exitCode = 1;
}
console.log(`[shot_as_cast] 完成 → ${outDir}`);
