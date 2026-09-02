#!/usr/bin/env node
/**
 * mxai 网页语义抠图 · 后台自动化（headless Chrome，不打扰用户）
 *
 * 用法：
 *   NODE_PATH=<repo>/node_modules node scripts/mxai_web_cutout.js <输入图.png> <输出图.png>
 *
 * 流程：headless Chrome persistent profile + mxai 登录态注入（localStorage 迁移）
 *       → home/#/ 落位 → hash 切换到 AI抠图页 → setInputFiles 上传 → 透明背景 → 立即生成
 *       → 轮询结果图 → 页面内 fetch 下载原图 → 写输出
 *
 * 登录态：/tmp/mxai_localstorage_full.json（IAB 导出，过期重新导出）
 */
const { chromium } = require('playwright-core');
const { readFileSync, writeFileSync, existsSync } = require('fs');

const SRC = process.argv[2];
const DST = process.argv[3];
const LS_EXPORT = '/tmp/mxai_localstorage_full.json';
const USER_DATA = '/tmp/mxai_headless_profile';

if (!SRC || !DST) { console.error('用法: node mxai_web_cutout.js <输入图> <输出图>'); process.exit(1); }

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    viewport: { width: 1280, height: 720 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // 1. home 落位 + 登录态注入
  await page.goto('https://www.mxai.cn/home/', { waitUntil: 'domcontentloaded' });
  if (existsSync(LS_EXPORT)) {
    const lsData = JSON.parse(readFileSync(LS_EXPORT, 'utf8'));
    await page.evaluate((data) => {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    }, lsData);
  }
  // 2. SPA 内 hash 导航到抠图页（直接 goto capture 会被重定向到 create）
  await page.evaluate(() => { location.hash = '#/ai/capture?from=toolbox'; });
  await page.waitForTimeout(4000);

  // 3. 上传图片（setInputFiles）
  const fileInput = page.locator('input.image-upload-drop-zone__input');
  await fileInput.setInputFiles(SRC);
  await page.waitForTimeout(1500);

  // 4. 点「立即生成」（默认透明背景模式）
  await page.getByText('立即生成', { exact: false }).first().click();

  // 5. 轮询等待结果图
  let resultUrl = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(3000);
    resultUrl = await page.evaluate(() => {
      const img = [...document.querySelectorAll('img')]
        .find(i => i.src.includes('outputs') && i.naturalWidth >= 100 && !i.src.includes('2095111424698224640'));
      return img ? img.src : null;
    });
    if (resultUrl) break;
  }
  if (!resultUrl) { console.error('超时未获取结果图'); await ctx.close(); process.exit(1); }

  // 6. 页面内 fetch 下载原图 → 写输出
  const b64 = await page.evaluate(async (url) => {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  }, resultUrl);
  const bin = Buffer.from(b64.split(',')[1], 'base64');
  writeFileSync(DST, bin);
  console.log(`OK ${DST} ${bin.length} bytes, url=${resultUrl.slice(0, 120)}`);
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });
