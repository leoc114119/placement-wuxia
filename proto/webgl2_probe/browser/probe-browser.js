// browser/probe-browser.js —— 浏览器入口：装 wx shim 平台 → 读 URL 参数 → 调 PWProbe.run
//
// URL 参数（自动化测试与本地手动都用同一套）：
//   mode=offscreen|maincontrol   默认 offscreen（maincontrol = 方案 §4.3 主画布正控模式）
//   a2=auto|run|skip             默认 auto（按方案只在该设备 A1 Device-PASS 后跑 A2）
//   profile=spec|browser-short   默认 browser-short（浏览器层短采样；真机走 spec）
//   commit=<sha>                 注入真实 commit（harness 从 git 取）
//   sha=<sha256>                 注入模型 SHA-256（harness 实测值）
//
// 结束后置：window.__probeDone / __probeResult / __probeError / __probeElapsedMs / __probeVfs
(function () {
  'use strict';
  const P = window.PWProbe;
  if (!P || typeof P.run !== 'function') {
    window.__probeDone = true;
    window.__probeError = 'PWProbe.run 未注册（检查 src/*.js 与 game.js 的装载顺序）';
    return;
  }
  const q = new URLSearchParams(window.location.search);
  const platform = P.platformBrowser.createBrowserPlatform();
  window.__probeVfs = platform.vfs;                 // harness 从这里取结果 JSON 与截图 dataURL

  const opts = {
    platform: platform,
    mode: q.get('mode') || 'offscreen',
    a2: q.get('a2') || 'auto',
    a2Profile: q.get('profile') || 'browser-short',
    commitSha: q.get('commit') || undefined,
    modelSha256: q.get('sha') || undefined,
  };
  const t0 = Date.now();
  P.run(opts).then(function (result) {
    window.__probeResult = result;
    window.__probeElapsedMs = Date.now() - t0;
    window.__probeDone = true;
  }).catch(function (e) {
    window.__probeError = String((e && e.message) || e);
    window.__probeDone = true;
  });
})();
