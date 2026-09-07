// ═══ 【AS · TASK-AS-FE】出招速度+两段式伤害 表现证据链驱动（需求 v1.3 AS-2/3/4/8 · 方案 v0.2 §4.4/§6 FE DoD）═══
// 用法：node proto/battle_demo/shot_as_cast.mjs
// 产出：shots/ascast_{x1|x2}_{档}_{相位}.png —— 两速 × 三档（375×667 / 560×700 / 900×560）×
//       五相位：loop_a/loop_b（施法相 cast 循环两个不同帧=整套循环多帧可见，AS-2/开放点①）、
//       seg1（t1 段1 冒字+血条首降，AS-3）、strike（收招相 cast 帧=收招窗内，AS-4）、
//       seg2（t2 段2 冒字+两跳同屏错位，AS-4/AS-8）。
// 白盒说明：与 shot_sixdir.mjs 同款（_debug.units 摆位清条、__demo.getView() 读演出钟）；
//       帧相位=按 view.anim 钟轮询定帧（PIECE.walkFrameMs 步频公式在页内复算，禁猜等待时长）；
//       事件等待=waitForFunction 真事件（skill|miss × targetId）。只留档+控制台校验，
//       校验不过（循环帧未互异/事件非恰 2 条/段2 冒字未现）退出码 1。
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

    // 点敌格：cast=提交即排程（AS-2），t0 起 charge 整套循环
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

    // ① 施法相循环多帧可见：轮询到 cast 第 2 帧 / 第 3 帧各留一影（旧「定格第 1 帧」行为下两影同帧=校验红）
    await page.waitForFunction(
      () => {
        const c = window.__demo.getView().anim.get('hero');
        return !!c && c.state === 'charge' && 1 + (Math.floor((c.t * 1000) / window.__demo.PIECE.walkFrameMs) % 3) === 2;
      },
      null,
      { timeout: 4000 },
    );
    await shot(`${speedTag}_${tag}_loop_a`);
    await page.waitForFunction(
      () => {
        const c = window.__demo.getView().anim.get('hero');
        const ord = c && c.state === 'charge' ? 1 + (Math.floor((c.t * 1000) / window.__demo.PIECE.walkFrameMs) % 3) : null;
        if (ord === 3) {
          window.__asLoopB = { anim: c.state, ord }; // 命中相位页内留痕（x2 下钟 2x 速，事后采样会跨相位）
          return true;
        }
        return false;
      },
      null,
      { timeout: 4000 },
    );
    await shot(`${speedTag}_${tag}_loop_b`);
    const loopStates = await page.evaluate(() => window.__asLoopB ?? { anim: null, ord: null });
    check(`${speedTag}/${tag} 施法相=charge 且循环帧互异（cast2/cast3 两影）`, loopStates.anim === 'charge' && loopStates.ord === 3, `animState=${loopStates.anim} loop_b 帧=cast${loopStates.ord}`);

    // ② t1 段1：等首条 e1 结算事件 → 立即留影（冒字当帧；strike 收招相开启）
    await page.waitForFunction(
      (n0) => window.__demo.session.events.slice(n0).some((e) => (e.type === 'skill' || e.type === 'miss') && e.targetId === 'e1'),
      ev0,
      { timeout: 12000 },
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
    check(`${speedTag}/${tag} 段1=strike 收招相+冒字已冲刷`, seg1.heroAnim === 'strike' && seg1.dmgTexts.length >= 1 && seg1.pendN === 0, `animState=${seg1.heroAnim} 冒字=${JSON.stringify(seg1.dmgTexts)} e1hp=${seg1.e1hp}`);

    // ③ 收招帧：strike 单播第 3 帧（cast3=收势）留影
    await page.waitForFunction(
      () => {
        const c = window.__demo.getView().anim.get('hero');
        return !!c && c.state === 'strike' && Math.min(2 + Math.floor((c.t * 1000) / window.__demo.PIECE.walkFrameMs), 3) === 3;
      },
      null,
      { timeout: 3000 },
    );
    await shot(`${speedTag}_${tag}_strike`);

    // ④ t2 段2：等第二条 e1 结算事件 → 立即留影（两跳同屏错位：第一跳寿命 0.6s>收招窗 0.3s）
    await page.waitForFunction(
      (n0) => window.__demo.session.events.slice(n0).filter((e) => (e.type === 'skill' || e.type === 'miss') && e.targetId === 'e1').length >= 2,
      ev0,
      { timeout: 12000 },
    );
    await shot(`${speedTag}_${tag}_seg2`);
    const seg2 = await page.evaluate(() => {
      const s = window.__demo.session.snapshot();
      const v = window.__demo.getView();
      return {
        heroAnim: s.actors.find((a) => a.id === 'hero').animState,
        e1hp: s.actors.find((a) => a.id === 'e1').hp,
        dmgFx: v.fx.filter((f) => f.kind === 'dmg').map((f) => ({ text: f.text, dx: f.dx ?? 0 })),
        pendN: v.pendingHits.length,
        evs: window.__demo.session.events.filter((e) => (e.type === 'skill' || e.type === 'miss') && e.targetId === 'e1').length,
      };
    });
    check(
      `${speedTag}/${tag} 段2冒字已冲刷（两跳错位防重叠）`,
      seg2.evs === 2 && seg2.dmgFx.length >= 1 && seg2.pendN === 0,
      `e1结算事件=${seg2.evs} 冒字=${JSON.stringify(seg2.dmgFx)} e1hp ${hp0}→${seg1.e1hp}→${seg2.e1hp}（血条两次下移入影 seg1/seg2）`,
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
