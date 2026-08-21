// 生图模式截图：江湖 Tab 干净框架图（隐藏占位图标）→ 供 mxai img2img
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 560, height: 960 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:8137/preview/main-ui-preview.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 开生图模式 → 干净框架
  await page.evaluate(() => document.body.setAttribute('data-gpt', 'on'));
  // v3：再隐藏所有文字标签（假文字是廉价感来源，方向稿不需要可读文字）
  await page.addStyleTag({ content: `
    body[data-gpt="on"] .tab span,
    body[data-gpt="on"] .silver span,
    body[data-gpt="on"] .learn-pts span,
    body[data-gpt="on"] .scene-name,
    body[data-gpt="on"] .tag-label,
    body[data-gpt="on"] .btn-label,
    body[data-gpt="on"] .gpt-toggle { visibility: hidden !important; }
  `});
  await page.waitForTimeout(300);

  // 只截 .phone 手机框（不含舞台标题/开关）
  const phone = await page.$('.phone');
  if (!phone) { console.error('ERR: .phone not found'); process.exit(1); }
  await phone.screenshot({ path: '/tmp/ux-shots/genmode-jianghu-framework-notext.png' });
  console.log('OK: /tmp/ux-shots/genmode-jianghu-framework-notext.png');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
