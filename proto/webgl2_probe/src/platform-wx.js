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
    let canvasSeq = 0;
    const resolvedPaths = {};

    function userPath(name) { return wx.env.USER_DATA_PATH + '/' + name; }

    return {
      kind: 'wx',
      env: { userDataPath: wx.env.USER_DATA_PATH, platform: sys.platform || 'unknown' },
      resolvedPaths: resolvedPaths,

      createCanvas: function () {
        canvasSeq++;
        return wx.createCanvas();
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
      setClipboard: function (text) {
        return new Promise(function (resolve) {
          wx.setClipboardData({
            data: text,
            success: function () { resolve(true); },
            fail: function () { resolve(false); },
          });
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
          if (t) cb(t.clientX, t.clientY);
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
