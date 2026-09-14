// src/platform-wx.js —— 微信小游戏宿主适配（唯一直接触 wx.* 的地方之一，另一个是 browser shim）
//
// 抽象出的宿主能力（game.js 只认这一套）：
//   createCanvas()             —— wx.createCanvas 语义：**首次 = 屏幕画布**，之后 = 离屏画布
//   getSystemInfo()            —— 设备/基础库信息
//   readFileArrayBuffer(path)  —— 读代码包/分包内文件（异步，便于计时）
//   decodeImage(bytes, name)   —— 内嵌 JPEG → 可上传 GPU 的 image 对象
//   loadSubpackage(name)       —— 普通分包加载
//   writeUserFile / readUserFile / getStorage / setStorage
//   setClipboard / canvasToTempFilePath / requestAnimationFrame / onTouchStart
// 分包内文件的路径形态没有官方逐字条文（社区口径为"相对代码包根"），因此这里**按候选列表
// 逐个尝试并记录命中的那个**，而不是猜死一个 —— 命中结果写进结果的 assetResolution 字段。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.PWProbe = root.PWProbe || {}; root.PWProbe.platformWx = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function createWxPlatform() {
    if (typeof wx === 'undefined') throw new Error('[platform-wx] 无 wx 全局：不是微信小游戏宿主');
    const sys = (function () {
      try { return wx.getSystemInfoSync(); } catch (e) { return {}; }
    })();
    const sysRef = { windowWidth: sys.windowWidth, windowHeight: sys.windowHeight };
    let canvasSeq = 0;
    const touchDiag = { n: 0, raw: null, mapped: null, scale: null, canvasSpace: null, windowSpace: null };
    let screenCanvas = null;          // 第 1 张 createCanvas = 屏幕画布（触摸坐标换算要按它的实际尺寸）
    let sysAt = 0;
    const resolvedPaths = {};

    /** 系统信息缓存（最多 500ms 一次）：触摸换算要"当帧实际尺寸"，不能写死 dpr。 */
    function sysNow() {
      const t = Date.now();
      if (t - sysAt > 500) {
        try { const s = wx.getSystemInfoSync(); if (s && s.windowWidth > 0) { sysRef.windowWidth = s.windowWidth; sysRef.windowHeight = s.windowHeight; } } catch (e) { /* keep cache */ }
        sysAt = t;
      }
      return sysRef;
    }

    /**
     * 逻辑像素 → 画布背衬像素。
     * ★ 真机踩过：wx 的 touch clientX/Y 是**逻辑像素**（如 366×800），而按钮命中框按**背衬像素**
     *   记录（1098×2400）⇒ 直接比永远不命中（所有按钮"点了没反应"）。
     *   比例一律按当帧实际尺寸现算（canvas.width / windowWidth），**禁写死 dpr/3**。
     */
    function toCanvasSpace(x, y) {
      const sys = sysNow();
      const cw = screenCanvas && screenCanvas.width ? screenCanvas.width : 0;
      const ch = screenCanvas && screenCanvas.height ? screenCanvas.height : 0;
      const sx = (sys.windowWidth > 0 && cw > 0) ? cw / sys.windowWidth : 1;
      const sy = (sys.windowHeight > 0 && ch > 0) ? ch / sys.windowHeight : 1;
      return { x: x * sx, y: y * sy, sx: sx, sy: sy };
    }

    function userPath(name) { return wx.env.USER_DATA_PATH + '/' + name; }

    return {
      kind: 'wx',
      env: { userDataPath: wx.env.USER_DATA_PATH, platform: sys.platform || 'unknown' },
      resolvedPaths: resolvedPaths,
      touchDiag: touchDiag,
      /** 供套件在假 wx 环境里单独验证坐标归一（真机 bug 的回归门用）。 */
      toCanvasSpace: toCanvasSpace,

      createCanvas: function () {
        canvasSeq++;
        const c = wx.createCanvas();
        if (canvasSeq === 1) screenCanvas = c;
        return c;
      },
      get canvasSequence() { return canvasSeq; },
      getSystemInfo: function () {
        return {
          brand: sys.brand || 'unknown', model: sys.model || 'unknown', system: sys.system || 'unknown',
          platform: sys.platform || 'unknown', version: sys.version, SDKVersion: sys.SDKVersion,
          benchmarkLevel: sys.benchmarkLevel === undefined ? null : sys.benchmarkLevel,
          pixelRatio: sys.pixelRatio || 1,
          screenWidth: sys.screenWidth, screenHeight: sys.screenHeight,
          windowWidth: sys.windowWidth, windowHeight: sys.windowHeight,
        };
      },

      /** 分包内资源的候选路径（命中即缓存并记录）。 */
      candidatePaths: function (relPath) {
        return [relPath, '/' + relPath];
      },
      /**
       * 模型 SHA-256（用于与基线互核）。微信侧走 FileSystemManager.getFileInfo 的
       * digestAlgorithm（若该基础库不支持则返回 null ⇒ 结果里标注用已核常量，不假装算过）。
       */
      sha256Hex: function (relPath) {
        const cands = this.candidatePaths(relPath);
        return new Promise(function (resolve) {
          let i = 0;
          const tryNext = function () {
            if (i >= cands.length) { resolve(null); return; }
            const path = cands[i++];
            try {
              wx.getFileSystemManager().getFileInfo({
                filePath: path, digestAlgorithm: 'sha256',
                success: function (res) { resolve(res.digest ? String(res.digest) : null); },
                fail: function () { tryNext(); },
              });
            } catch (e) { resolve(null); }
          };
          tryNext();
        });
      },
      readFileArrayBuffer: function (path) {
        return new Promise(function (resolve, reject) {
          wx.getFileSystemManager().readFile({
            filePath: path,
            success: function (res) { resolvedPaths[path] = true; resolve(res.data); },
            fail: function (err) { reject(new Error('[platform-wx] readFile 失败 ' + path + ': ' + (err && err.errMsg))); },
          });
        });
      },
      readFileSyncUtf8: function (path) {
        const res = wx.getFileSystemManager().readFileSync(path, 'utf8');
        resolvedPaths[path] = true;
        return res;
      },
      /** 读文本（动作 JSON）：走官方 encoding:'utf8'，不依赖 TextDecoder 是否存在。 */
      readTextFile: function (path) {
        return new Promise(function (resolve, reject) {
          wx.getFileSystemManager().readFile({
            filePath: path, encoding: 'utf8',
            success: function (res) { resolvedPaths[path] = true; resolve(res.data); },
            fail: function (err) { reject(new Error('[platform-wx] readFile(utf8) 失败 ' + path + ': ' + (err && err.errMsg))); },
          });
        });
      },

      /**
       * 内嵌 JPEG → 落地临时文件 → wx.createImage 加载。
       * （小游戏没有 Blob/createImageBitmap；"写临时文件再交给 Image"是官方支持链路）
       */
      decodeImage: function (bytes, name, mimeType) {
        const ext = (mimeType || '').indexOf('png') >= 0 ? 'png' : 'jpg';
        const path = userPath('probe-tex-' + name + '.' + ext);
        return new Promise(function (resolve, reject) {
          try {
            wx.getFileSystemManager().writeFileSync(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
          } catch (e) { reject(new Error('[platform-wx] 写临时贴图失败: ' + e.message)); return; }
          const img = wx.createImage();
          img.onload = function () { resolve({ image: img, width: img.width, height: img.height, mimeType: mimeType || '', path: path }); };
          img.onerror = function (e) { reject(new Error('[platform-wx] 贴图 Image 解码失败 ' + path + ' ' + (e && e.errMsg))); };
          img.src = path;
        });
      },

      loadSubpackage: function (name) {
        const t0 = now();
        return new Promise(function (resolve, reject) {
          const task = wx.loadSubpackage({
            name: name,
            success: function () { resolve({ name: name, ms: now() - t0, ok: true }); },
            fail: function (err) { reject(new Error('[platform-wx] loadSubpackage(' + name + ') 失败: ' + (err && err.errMsg))); },
          });
          if (task && task.onProgressUpdate) task.onProgressUpdate(function () {});
        });
      },

      writeUserFile: function (name, data) {
        const path = userPath(name);
        try { wx.getFileSystemManager().writeFileSync(path, data, 'utf8'); } catch (e) { return null; }
        return path;
      },
      readUserFile: function (name) {
        try { return wx.getFileSystemManager().readFileSync(userPath(name), 'utf8'); } catch (e) { return null; }
      },
      getStorage: function (key) {
        try { return wx.getStorageSync(key); } catch (e) { return null; }
      },
      setStorage: function (key, value) {
        try { wx.setStorageSync(key, value); return true; } catch (e) { return false; }
      },
      /**
       * 复制到剪贴板 → {ok, errMsg}。
       * ★ 必须带超时：真机实测"点复制没反应"就是**宿主既不 success 也不 fail**（Promise 永挂），
       *   那时屏上什么都看不到、远程无从诊断。超时后如实报原因，让人转用「分享结果」。
       */
      setClipboard: function (text) {
        return new Promise(function (resolve) {
          let done = false;
          const finish = function (ok, errMsg) { if (!done) { done = true; resolve({ ok: ok, errMsg: errMsg || null }); } };
          const timer = setTimeout(function () { finish(false, 'wx.setClipboardData 3s 未回调（宿主无响应）'); }, 3000);
          try {
            wx.setClipboardData({
              data: text,
              success: function () { clearTimeout(timer); finish(true, null); },
              fail: function (e) { clearTimeout(timer); finish(false, (e && e.errMsg) || 'setClipboardData fail'); },
            });
          } catch (e) { clearTimeout(timer); finish(false, (e && e.message) || String(e)); }
        });
      },
      /**
       * 兜底 A：把结果当**文件**分享出去（真机实测「复制结果」可能拿不到内容 ⇒ 必须有第二条路）。
       * 不吞失败原因：fail 的 errMsg 要原样回传给屏上/console，否则远程没法诊断。
       */
      shareFile: function (filePath, fileName) {
        return new Promise(function (resolve) {
          if (typeof wx.shareFileMessage !== 'function') { resolve({ ok: false, errMsg: 'wx.shareFileMessage 不存在（基础库不支持）' }); return; }
          try {
            wx.shareFileMessage({
              filePath: filePath, fileName: fileName,
              success: function () { resolve({ ok: true }); },
              fail: function (e) { resolve({ ok: false, errMsg: (e && e.errMsg) || 'shareFileMessage fail' }); },
            });
          } catch (e) { resolve({ ok: false, errMsg: (e && e.message) || String(e) }); }
        });
      },
      /** 真机截图导出（feature-detect；小游戏侧若不提供该 API 则返回 null，靠 README 手动命名兜底）。 */
      canvasToTempFilePath: function (canvas, name) {
        if (typeof wx.canvasToTempFilePath !== 'function') return Promise.resolve(null);
        return new Promise(function (resolve) {
          try {
            wx.canvasToTempFilePath({
              canvas: canvas, fileType: 'png', quality: 1,
              success: function (res) {
                const dst = userPath(name);
                try {
                  const data = wx.getFileSystemManager().readFileSync(res.tempFilePath);
                  wx.getFileSystemManager().writeFileSync(dst, data);
                  resolve(dst);
                } catch (e) { resolve(res.tempFilePath); }
              },
              fail: function () { resolve(null); },
            });
          } catch (e) { resolve(null); }
        });
      },
      saveImageToAlbum: function (path) {
        return new Promise(function (resolve) {
          if (typeof wx.saveImageToPhotosAlbum !== 'function') { resolve(false); return; }
          wx.saveImageToPhotosAlbum({ filePath: path, success: function () { resolve(true); }, fail: function () { resolve(false); } });
        });
      },
      requestAnimationFrame: function (cb) {
        if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
        return setTimeout(function () { cb(now()); }, 16);
      },
      now: now,
      onTouchStart: function (cb) {
        if (typeof wx.onTouchStart !== 'function') return;
        wx.onTouchStart(function (e) {
          const t = e.touches && e.touches[0];
          if (!t) return;
          const m = toCanvasSpace(t.clientX, t.clientY);      // 逻辑 → 背衬
          touchDiag.n++;
          touchDiag.raw = [t.clientX, t.clientY];
          touchDiag.mapped = [m.x, m.y];
          touchDiag.scale = [m.sx, m.sy];
          touchDiag.canvasSpace = screenCanvas ? [screenCanvas.width, screenCanvas.height] : null;
          touchDiag.windowSpace = [sysRef.windowWidth, sysRef.windowHeight];
          cb(m.x, m.y);
        });
      },
      restartApp: function () {
        if (typeof wx.restartMiniProgram === 'function') { wx.restartMiniProgram({}); return true; }
        return false;
      },
    };
  }

  return { createWxPlatform: createWxPlatform };
});
