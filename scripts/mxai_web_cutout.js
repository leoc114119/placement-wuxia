#!/usr/bin/env node
/**
 * mxai 网页语义抠图 · 后台自动化（headless Chrome，不打扰用户）
 *
 * 用法：
 *   node scripts/mxai_web_cutout.js <输入图.png> <输出图.png>
 *
 * 流程：headless Chrome + 注入 mxai 登录态（localStorage 迁移）
 *       → 打开 AI抠图页 → setInputFiles 上传 → 透明背景模式 → 立即生成
 *       → 轮询作品列表抓结果图 URL → 页面内 fetch 下载 → 写输出
 *
 * 依赖：playwright-core（node_modules）+ 系统 Chrome（headless）
 * 登录态：/tmp/mxai_localstorage_full.json（从 IAB 导出，过期后重新导出）
 */
const { chromium } = require('playwright-core');
const { writeFileSync, readFileSync, existsSync, mkdirSync } = require('fs');

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

  // 1. 打开站点并注入登录态
  await page.goto('https://www.mxai.cn/home/', { waitUntil: 'domcontentloaded' });
  if (existsSync(LS_EXPORT)) {
    const lsData = JSON.parse(readFileSync(LS_EXPORT, 'utf8'));
    await page.evaluate((data) => {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    }, lsData);
  }
  await page.goto('https://www.mxai.cn/home/#/ai/capture?from=toolbox', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // 2. 上传图片（setInputFiles——完整 Playwright 能力）
  const fileInput = page.locator('input[type="file"].image-upload-drop-zone__input');
  await fileInput.setInputFiles(SRC);
  await page.waitForTimeout(1500);

  // 3. 确认透明背景模式（默认已选中）并点「立即生成」
  const genBtn = page.getByText('立即生成', { exact: false }).first();
  await genBtn.click();

  // 4. 轮询等待抠图完成（作品列表/创作中心出现结果图）
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

  // 5. 页面内 fetch下载原图（带页面凭证）→ 写输出
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

  // 6. 裁掉白边/底色（输出为品红→透明？本方案抠图产物已是透明底 JPEG 需转 PNG——
  //    mxai 抠图产物=透明 PNG（JPEG 无 alpha 则白底），保持原样写入，后续管线处理
  const dst = DST.endsWith('.png') ? DST : DST + '.png';
  writeFileSync(dst, bin);
  console.log(`OK ${dst} ${bin.length} bytes, resultUrl=${resultUrl.slice(0, 120)}`);
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });
