const { chromium } = require('playwright-core');
const fs = require('fs');
fs.mkdirSync('/tmp/ux-shots', { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 560, height: 960 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:8137/preview/main-ui-preview.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/ux-shots/01-jianghu.png' });
  await page.click('.tab[data-tab="wuxue"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/ux-shots/02-wuxue-attr.png' });
  await page.click('.subtab[data-sub="config"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/ux-shots/03-wuxue-config.png' });
  await page.click('.tab[data-tab="zhuangbei"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/ux-shots/04-zhuangbei.png' });
  await page.click('.tab[data-tab="menpai"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/ux-shots/05-menpai.png' });
  await browser.close();
  console.log('done 5 shots');
})().catch(e => { console.error(e); process.exit(1); });
