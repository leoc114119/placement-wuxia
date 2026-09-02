// 终验实证：真实 rAF 循环录制 5 格移动逐帧位置 → 垂直移动方向分量抖动曲线
// 用法：node proto/battle_demo/record.mjs [--out=frame_log.json]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'shots');
fs.mkdirSync(outDir, { recursive: true });
const argv = process.argv.slice(2);
const outFile = argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'frame_log.json';
const tag = argv.find((a) => a.startsWith('--tag='))?.slice(6) ?? 'build';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 450, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { const t = m.text(); if (t.includes('DBG')) console.log('[c]', t.slice(0, 400)); });
await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 8000 });
await page.waitForFunction(() => window.__demo.session.snapshot().pendingInput === true, null, { timeout: 40000 });

// 点屏内最远可达格（长距 ~5 格）
const res = await page.evaluate(() => {
  const d = window.__demo;
  const s = d.session.snapshot();
  const hero = s.actors.find((a) => a.id === 'hero');
  const manh = (a, b) => Math.abs(a.q - b.q) + Math.abs(a.r - b.r);
  const rect = document.getElementById('cv').getBoundingClientRect();
  const cands = [];
  for (const c of s.moveCells) {
    const cp = d.cellCss(c.q, c.r);
    if (cp.x > 10 && cp.x < rect.width - 10 && cp.y > 10 && cp.y < rect.height - 10) {
      cands.push({ cell: c, cp, md: manh(c, hero.pos) });
    }
  }
  const mid = cands.filter((x) => x.md >= 4 && x.md <= 7); // 终验口径：中距 4-7 格
  const diag = mid.filter((x) => {
    const dq = x.cell.q - hero.pos.q;
    const dr = x.cell.r - hero.pos.r;
    return dq !== 0 && dr !== 0; // 斜向（逼出 BFS 锯齿的敏感场景）
  });
  const pool = diag.length ? diag : mid.length ? mid : cands;
  pool.sort((a, b) => b.md - a.md);
  if (!pool.length) return { err: 'no on-screen moveCell' };
  return { p: pool[0].cp, cell: pool[0].cell, from: { q: hero.pos.q, r: hero.pos.r }, md: pool[0].md, diag: diag.length > 0 };
});
if (res.err) throw new Error(res.err);
console.log(`[${tag}] 移动 ${res.md} 格 → (${res.cell.q},${res.cell.r})`);

// 开录 → 点击 → 1.6s → 停录
await page.evaluate(() => window.__demo.startFrameLog());
await page.mouse.click(res.p.x, res.p.y);
await page.waitForTimeout(1600);
const frames = await page.evaluate(() => window.__demo.stopFrameLog());

// 垂直于移动方向分量分析（像素投影空间：错位网格的锯齿在此显形；axial 空间恒直线是假象）
const TW = 88;
const TH = 88 * 0.7;
const RH = TH * 0.75;
const toPx = (c) => {
  const col = c.q + Math.floor(c.r / 2);
  return { x: (col + (Math.abs(c.r) % 2 === 1 ? 0.5 : 0)) * TW, y: c.r * RH };
};
const from = res.from;
const to = res.cell;
const pf = toPx(from);
const pt = toPx(to);
const tx = pt.x - pf.x;
const ty = pt.y - pf.y;
const len = Math.hypot(tx, ty) || 1;
const ux = tx / len;
const uy = ty / len;
let series = frames.map((f) => {
  const fp = toPx({ q: f.q, r: f.r });
  const vx = fp.x - pf.x;
  const vy = fp.y - pf.y;
  const along = +(vx * ux + vy * uy).toFixed(1);
  const perp = +(vx * -uy + vy * ux).toFixed(1);
  return { t: f.t, along, perp, hop: f.hop };
});
// 截去到达后（along ≥ len 后保持不动段）
const reachedIdx = series.findIndex((s) => s.along >= len - 0.05 * len);
if (reachedIdx > 0) series = series.slice(0, reachedIdx + 1);
// 抖动 = 垂直分量符号翻转次数（幅度 > 0.05 格计）
let flips = 0;
let maxAbs = 0;
let lastSign = 0;
for (const s of series) {
  if (Math.abs(s.perp) > maxAbs) maxAbs = Math.abs(s.perp);
  const sign = s.perp > 2 ? 1 : s.perp < -2 ? -1 : lastSign; // 像素系容差 2px
  if (sign !== 0 && lastSign !== 0 && sign !== lastSign) flips++;
  if (sign !== 0) lastSign = sign;
}
console.log(`[${tag}] 采样帧=${series.length} 到达时长≈${((series[series.length - 1]?.t ?? 0) - (series[0]?.t ?? 0)) / 1000}s`);
console.log(`[${tag}] 垂直分量：最大偏移=${maxAbs} 格，方向翻转=${flips} 次（左闪右闪指标）`);
console.log(`[${tag}] 垂直分量序列 =`, JSON.stringify(series.map((s) => s.perp)));
fs.writeFileSync(path.join(outDir, outFile), JSON.stringify({ tag, from, to, md: res.md, series, flips, maxAbs }, null, 1));
await page.screenshot({ path: path.join(outDir, `shot_record_${tag}.png`) });
await browser.close();
console.log(`[${tag}] 录制完成 → ${outFile}`);
