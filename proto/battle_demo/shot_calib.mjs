// ═══ L 环二轮小卡 ①：居中校准表 · feetOffsetPx 五档并排拼图 ═══
// 背景：Leo 连续两轮反馈人物偏上，禁再盲调——本脚本产同机位 hero idle 场景五档对照图，
//       Leo 选档后另发微调指令改 config PIECE.feetOffsetPx 常量（本脚本不改默认值）。
// 用法：node proto/battle_demo/shot_calib.mjs（须先 node proto/battle_demo/build.mjs 刷新 bundle）
// 产出：shots/calib_feet_offset.png —— 375×667 同机位五档（offset=0/4/8/12/16）横向并排，
//       每格底部标注档位值；格心十字标记辅助目测 hero 脚底与所在六边形格的关系。
//       附 shots/calib_feet_offset_diag.json（逐档 hero 帧绘制 y 白盒读数，量化档差）。
// 白盒说明：与 shot_anchor.mjs 同式（同源惯例）——冻结行动条 + hero idle 向右静立 + 直写
//       _debug 演出态；经 __demo.PIECE 白盒覆写 feetOffsetPx（渲染每帧属性读值，即时生效）。
//       单页会话内连取五档：同场景/同 hero 位/同镜头，唯一变量=脚底补偿档。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const outPng = path.join(here, 'shots', 'calib_feet_offset.png');
const outDiag = path.join(here, 'shots', 'calib_feet_offset_diag.json');
fs.mkdirSync(path.dirname(outPng), { recursive: true });

const OFFSETS = [0, 4, 8, 12, 16]; // 档位候选（Leo 校准中，默认 0 待选档）
const PANEL_W = 200; // 单档取景宽（CSS px，覆盖 hero 渲染高 123.2 + 上下余量）
const PANEL_H = 280;

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const errors = [];
// 450×800 起页再切 375×667（shot_anchor/shot.mjs L④ 同惯例：起页即目标档绕开历史 resize 观察噪声）
const page = await browser.newPage({ viewport: { width: 450, height: 800 } });
page.on('pageerror', (e) => errors.push(e.message));
// 记录 240×320 hero 帧 drawImage 实参（白盒量化：逐档 hero 绘制 y 应随档位线性下移）
await page.addInitScript(() => {
  window.__draws = [];
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...a) {
    const ctx = orig.apply(this, a);
    if (ctx && !ctx.__patched) {
      ctx.__patched = true;
      const od = ctx.drawImage.bind(ctx);
      ctx.drawImage = (img, ...args) => {
        if (img && img.naturalWidth === 240 && img.naturalHeight === 320) window.__draws.push([args[0], args[1]]);
        return od(img, ...args);
      };
    }
    return ctx;
  };
});
await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
await page.setViewportSize({ width: 375, height: 667 }); // 切目标档 → resize() 重建画布缓冲
await page.waitForTimeout(900); // 资源解码 + 首帧 + 镜头定位

// 冻结行动条 + hero idle 向右静立（shot_anchor 同式：证据窗口内敌我均不行动，机位恒定）
await page.evaluate(() => {
  for (const u of window.__demo.session._debug.units) {
    u.bar = 0;
    u.barWasMax = false;
  }
  const hero = window.__demo.session._debug.units.find((x) => x.id === 'hero');
  Object.assign(hero, { hexFacing: { q: 1, r: 0 }, animState: 'idle', animLeftMs: 0, isJump: false });
});
await page.waitForTimeout(200);

// 固定取景框：锚定 hero 格中心（五档共用同一框——hero 只在框内下移，格与十字恒定可对照）
const anchor = await page.evaluate(() => {
  const hero = window.__demo.session.snapshot().actors.find((a) => a.id === 'hero');
  const cp = window.__demo.cellCss(hero.renderPos.q, hero.renderPos.r);
  return { cx: cp.x, cy: cp.y, pos: { q: hero.renderPos.q, r: hero.renderPos.r }, verTag: document.querySelector('#verTag').textContent };
});
const box = {
  x: Math.max(0, Math.min(anchor.cx - PANEL_W / 2, 375 - PANEL_W)),
  y: Math.max(0, Math.min(anchor.cy - PANEL_H / 2, 667 - PANEL_H)),
};
const cross = { x: anchor.cx - box.x, y: anchor.cy - box.y }; // 格心在面板内坐标（五档同位）

// 逐档：覆写 feetOffsetPx → 待两帧 → 截面板
const panels = [];
const diag = { verTag: anchor.verTag, viewport: '375x667', heroCell: anchor.pos, panelBox: box, cellCrossInPanel: cross, byOffset: {} };
for (const off of OFFSETS) {
  await page.evaluate((v) => {
    window.__demo.PIECE.feetOffsetPx = v; // 白盒覆写（渲染每帧属性读值，下一帧生效）
    window.__draws.length = 0;
  }, off);
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  const buf = await page.screenshot({ clip: { x: box.x, y: box.y, width: PANEL_W, height: PANEL_H } });
  panels.push(buf);
  const draw = await page.evaluate(() => window.__draws.slice(-1)[0] ?? null); // hero 帧绘制 [x,y]
  diag.byOffset[String(off)] = { heroDrawXY: draw };
}

// 拼图（零新依赖：playwright 空白页 canvas 合成 → toDataURL 落盘）
const GAP = 12;
const PAD = 14;
const LABEL_H = 24;
const HEAD_H = 30;
const stitch = await browser.newPage({ viewport: { width: PAD * 2 + PANEL_W * 5 + GAP * 4, height: HEAD_H + PANEL_H + LABEL_H + PAD * 2 } });
const dataUrl = await stitch.evaluate(
  async (d) => {
    const { bufs, PAD, GAP, LABEL_H, HEAD_H, PANEL_W, PANEL_H, cross, offsets, verTag } = d;
    const imgs = await Promise.all(
      bufs.map(
        (b64) =>
          new Promise((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = rej;
            im.src = 'data:image/png;base64,' + b64;
          }),
      ),
    );
    const W = PAD * 2 + PANEL_W * 5 + GAP * 4;
    const H = HEAD_H + PANEL_H + LABEL_H + PAD * 2;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#14100b';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8dcc0';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`feetOffsetPx 校准表 · hero idle(facing right) · 375×667 同机位 · 品红十字=hero 所在格心 · verTag=${verTag}`, PAD, PAD + HEAD_H / 2 - 6);
    imgs.forEach((im, i) => {
      const x = PAD + i * (PANEL_W + GAP);
      const y = PAD + HEAD_H;
      ctx.drawImage(im, x, y);
      // 格心十字（五档同位：取景框锚定格心，唯一变量=档位）
      ctx.strokeStyle = 'rgba(255,77,242,0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + cross.x - 18, y + cross.y);
      ctx.lineTo(x + cross.x + 18, y + cross.y);
      ctx.moveTo(x + cross.x, y + cross.y - 18);
      ctx.lineTo(x + cross.x, y + cross.y + 18);
      ctx.stroke();
      // 档位标注（底部条）
      ctx.fillStyle = '#241a10';
      ctx.fillRect(x, y + PANEL_H, PANEL_W, LABEL_H);
      ctx.fillStyle = '#ffd870';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`offset=${offsets[i]}px`, x + PANEL_W / 2, y + PANEL_H + LABEL_H / 2);
    });
    return cv.toDataURL('image/png');
  },
  { bufs: panels.map((b) => b.toString('base64')), PAD, GAP, LABEL_H, HEAD_H, PANEL_W, PANEL_H, cross, offsets: OFFSETS, verTag: anchor.verTag },
);
fs.writeFileSync(outPng, Buffer.from(dataUrl.split(',')[1], 'base64'));
fs.writeFileSync(outDiag, JSON.stringify(diag, null, 2));
await browser.close();
if (errors.length) {
  console.error('[shot_calib] pageerror:', errors);
  process.exit(1);
}
console.log(`[shot_calib] 完成 → ${outPng}`);
console.log(`[shot_calib] 量化（hero 帧绘制 y 随档应线性 +1×档差）：${JSON.stringify(diag.byOffset)}`);
