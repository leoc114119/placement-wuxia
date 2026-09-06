// ═══ L 环小修卡：directional 脚底基线锚定 · 三档前后对比截图证据 ═══
// 用法：node proto/battle_demo/shot_anchor.mjs <before|after>
// 产出：shots/anchor_fix/{档}_{全帧|zoom}_{before|after}.png —— 三档（375×667 / 560×700 / 900×560）
//       × hero idle（facing right）×（全帧 + 主角格局部放大 crop）。
// 白盒说明：与 shot_sixdir.mjs 同式直写 _debug 演出态（证据生成专用）；crop 中心=主角格 cellCss、
//       尺寸 190×260（覆盖棋子渲染高 123.2px + 上下余量），放大留档供 7.7px 上浮/贴地目验。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const phase = process.argv[2];
if (phase !== 'before' && phase !== 'after') {
  console.error('用法：node proto/battle_demo/shot_anchor.mjs <before|after>');
  process.exit(1);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'shots', 'anchor_fix');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const written = [];
const errors = [];
const diag = {};
for (const [vw, vh, tag] of [[375, 667, '375x667'], [560, 700, '560x700'], [900, 560, '900x560']]) {
  // 450×800 起页再切目标档（与 shot.mjs L④ 同惯例）：绕开 main.ts resize() 对 375×667 默认值的
  // 早退缺陷（w===W&&h===H → canvas 缓冲滞留 HTML 默认 300×150，画面=左上裁区拉伸、hero 被裁出画外；
  // 既有缺陷另行登记，本脚本只取正确 resize 路径的对照证据）。
  const page = await browser.newPage({ viewport: { width: 450, height: 800 } });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  // 记录 240×320 hero 帧 drawImage 实参（诊断锚点是否进画面；截图证据自证用）
  await page.addInitScript(() => {
    window.__draws = [];
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...a) {
      const ctx = orig.apply(this, a);
      if (ctx && !ctx.__patched) {
        ctx.__patched = true;
        const od = ctx.drawImage.bind(ctx);
        ctx.drawImage = (img, ...args) => {
          if (img && img.naturalWidth === 240 && img.naturalHeight === 320) window.__draws.push(args[1]);
          return od(img, ...args);
        };
      }
      return ctx;
    };
  });
  await page.goto('file://' + path.join(here, 'index.html'));
  await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
  await page.setViewportSize({ width: vw, height: vh }); // 切目标档 → 应用 resize() 正确重建画布缓冲
  await page.waitForTimeout(900); // resize 重建缓冲 + 资源解码 + 首帧
  // 冻结行动条 + 主角 idle 向右静立（同一演出态取 before/after，唯一变量=锚定修正）
  await page.evaluate(() => {
    for (const u of window.__demo.session._debug.units) {
      u.bar = 0;
      u.barWasMax = false;
    }
    const hero = window.__demo.session._debug.units.find((x) => x.id === 'hero');
    Object.assign(hero, { hexFacing: { q: 1, r: 0 }, animState: 'idle', animLeftMs: 0, isJump: false });
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, `${tag}_full_${phase}.png`) });
  written.push(`${tag}_full_${phase}.png`);
  const info = await page.evaluate(() => {
    window.__draws.length = 0;
    const hero = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
    const cp = window.__demo.cellCss(hero.renderPos.q, hero.renderPos.r);
    return new Promise((res) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          res({
            verTag: document.querySelector('#verTag').textContent,
            heroDrawY: window.__draws.slice(-2),
            cellCssY: +cp.y.toFixed(1),
            render: { q: hero.renderPos.q, r: hero.renderPos.r },
            anim: hero.animState,
            canvasBuf: (document.getElementById('cv') || { width: 0, height: 0 }).width + 'x' + document.getElementById('cv').height,
          }),
        ),
      );
    });
  });
  diag[tag] = info;
  const clip = await page.evaluate(() => {
    const hero = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
    const p = window.__demo.cellCss(hero.renderPos.q, hero.renderPos.r);
    return { x: p.x, y: p.y };
  });
  await page.screenshot({
    path: path.join(outDir, `${tag}_zoom_${phase}.png`),
    clip: { x: clip.x - 95, y: clip.y - 130, width: 190, height: 260 },
  });
  written.push(`${tag}_zoom_${phase}.png`);
  await page.close();
}
await browser.close();
if (errors.length) {
  console.error('[shot_anchor] pageerror:', errors);
  process.exit(1);
}
fs.writeFileSync(path.join(outDir, `diag_${phase}.json`), JSON.stringify(diag, null, 2));
console.log(`[shot_anchor] ${phase} 完成 ${written.length} 张 → ${outDir}`);
console.log(JSON.stringify(diag));

