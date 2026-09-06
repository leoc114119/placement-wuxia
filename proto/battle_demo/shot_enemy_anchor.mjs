// ═══ L 环微调卡：敌型（legacy profile）脚底基线锚定格心 · 前后对比截图证据 ═══
// 用法：node proto/battle_demo/shot_enemy_anchor.mjs <before|after>
// 产出：shots/enemy_anchor_{before,after}.png —— 560×700 档 × 敌 e1（npc-shanzei legacy idle 07 帧）
//       × 敌格格心十字标记（红 + 字，DOM overlay 叠 canvas 上）× 格心局部放大 crop（190×260）。
// 白盒说明：与 shot_anchor.mjs 同式直写 _debug 演出态（证据生成专用）；
//       十字=敌格顶面几何中心（cellCss），修后敌型脚底应落十字下 6px（feetOffsetPx 选档）。
//       450×800 起页再切目标档（shot.mjs L④ 同惯例，绕 resize() 375×667 早退缺陷）。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const phase = process.argv[2];
if (phase !== 'before' && phase !== 'after') {
  console.error('用法：node proto/battle_demo/shot_enemy_anchor.mjs <before|after>');
  process.exit(1);
}
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
const page = await browser.newPage({ viewport: { width: 450, height: 800 } });
page.on('pageerror', (e) => errors.push(e.message));
// 记录 128×256 legacy 帧 drawImage 实参（诊断锚点换算自证：dy+dh×240/256 应=格心+6）
await page.addInitScript(() => {
  window.__draws = [];
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...a) {
    const ctx = orig.apply(this, a);
    if (ctx && !ctx.__patched) {
      ctx.__patched = true;
      const od = ctx.drawImage.bind(ctx);
      ctx.drawImage = (img, ...args) => {
        if (img && img.naturalWidth === 128 && img.naturalHeight === 256) window.__draws.push(args);
        return od(img, ...args);
      };
    }
    return ctx;
  };
});
await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
await page.setViewportSize({ width: 560, height: 700 }); // 目标档 → resize() 正确重建画布缓冲
await page.waitForTimeout(900); // resize 重建缓冲 + 资源解码 + 首帧
// 冻结行动条 + 敌 e1 idle 静立（before/after 同一演出态，唯一变量=锚定修正）
await page.evaluate(() => {
  for (const u of window.__demo.session._debug.units) {
    u.bar = 0;
    u.barWasMax = false;
  }
  const foe = window.__demo.session._debug.units.find((x) => x.id === 'e1');
  Object.assign(foe, { animState: 'idle', animLeftMs: 0 });
});
await page.waitForTimeout(120);
// 镜头白盒平移：敌格居中（bars 冻结+camInit 已真 → updateCamera 无回拉，直写 view.camera 稳定生效）
await page.evaluate(() => {
  const view = window.__demo.getView();
  const foe = window.__demo.session.snapshot().actors.find((a) => a.id === 'e1');
  const cp = window.__demo.cellCss(foe.renderPos.q, foe.renderPos.r);
  const rect = document.getElementById('cv').getBoundingClientRect();
  const lx = ((cp.x - rect.left) / rect.width) * window.__demo.W;
  const ly = ((cp.y - rect.top) / rect.height) * window.__demo.H;
  view.camera.x += lx - window.__demo.W / 2;
  view.camera.y += ly - window.__demo.H / 2;
});
await page.waitForTimeout(200); // 平移后稳定帧 + 截图前十字定位
const info = await page.evaluate(
  () =>
    new Promise((res) => {
      window.__draws.length = 0;
      const foe = window.__demo.session.snapshot().actors.find((a) => a.id === 'e1');
      const cp = window.__demo.cellCss(foe.renderPos.q, foe.renderPos.r);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          // 格心十字 overlay（截图内可见）：水平/垂直两条 17px 红线交于格心
          const cross = document.createElement('div');
          cross.style.cssText =
            'position:fixed;left:' + (cp.x - 8.5) + 'px;top:' + (cp.y - 8.5) + 'px;width:17px;height:17px;z-index:98;pointer-events:none';
          cross.innerHTML =
            '<div style="position:absolute;left:0;top:8px;width:17px;height:1px;background:#ff2a2a"></div>' +
            '<div style="position:absolute;left:8px;top:0;width:1px;height:17px;background:#ff2a2a"></div>';
          document.body.appendChild(cross);
          // 双敌同为 128×256：按绘制中心与敌格逻辑 x 就近配对（legacy 翻转屏坐标=2cx−中心，两种中心式都算）
          const rect = document.getElementById('cv').getBoundingClientRect();
          const lx = ((cp.x - rect.left) / rect.width) * window.__demo.W;
          let best = null;
          let bestDist = 1e9;
          for (const d of window.__draws) {
            const c = d[0] + d[2] / 2;
            const dist = Math.min(Math.abs(c - lx), Math.abs(2 * lx - c - lx));
            if (dist < bestDist) {
              bestDist = dist;
              best = d;
            }
          }
          res({
            verTag: document.querySelector('#verTag').textContent,
            foeDraw: best,
            allDraws: window.__draws.length,
            cellCss: { x: +cp.x.toFixed(1), y: +cp.y.toFixed(1) },
            render: { q: foe.renderPos.q, r: foe.renderPos.r },
            anim: foe.animState,
            canvasBuf: (document.getElementById('cv') || { width: 0, height: 0 }).width + 'x' + document.getElementById('cv').height,
          });
        }),
      );
    }),
);
await page.screenshot({
  path: path.join(outDir, `enemy_anchor_${phase}.png`),
  clip: { x: info.cellCss.x - 95, y: info.cellCss.y - 130, width: 190, height: 260 },
});
await browser.close();
if (errors.length) {
  console.error('[shot_enemy_anchor] pageerror:', errors);
  process.exit(1);
}
fs.writeFileSync(path.join(outDir, `enemy_anchor_diag_${phase}.json`), JSON.stringify(info, null, 2));
const draw = info.foeDraw || [];
const feetY = draw.length >= 4 ? +(draw[1] + draw[3] * (240 / 256)).toFixed(1) : null; // 脚底换算（基线 240/256）
console.log(`[shot_enemy_anchor] ${phase} → shots/enemy_anchor_${phase}.png`);
console.log(
  JSON.stringify({
    verTag: info.verTag,
    cell: info.cellCss,
    draw: draw,
    allDraws: info.allDraws,
    feetY_by240: feetY,
    feetMinusCell: feetY === null ? null : +(feetY - info.cellCss.y).toFixed(1),
  }),
);
