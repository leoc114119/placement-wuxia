// src/platform-browser.js —— 浏览器 wx shim + 宿主适配（两段式预验证的第一段专用）
//
// 目的（《T31 方案》§7.1）：让**同一份** game.js 在浏览器里跑起来，证明
//   GLB 解析 / shader / 41 骨蒙皮 / 1·5·10·20 档 / 离屏 WebGL→2D 合成 这几条核心代码路径是通的。
// 它证明的是"代码通"，**不证明微信或安卓能力** —— 结果的 verdict.device 会写成 BROWSER_SHIM_*。
//
// shim 覆盖面（故意窄，只实现 game.js 真正调用的那些）：
//   wx.createCanvas（第 1 张 = 页面里的 #probe-screen-canvas，与真机语义一致）
//   wx.getSystemInfoSync / getFileSystemManager().readFile|readFileSync|writeFileSync
//   wx.createImage / wx.loadSubpackage（本地直读，标记 simulated）/ wx.env.USER_DATA_PATH
//   wx.setStorageSync|getStorageSync / wx.setClipboardData / wx.canvasToTempFilePath
//   wx.onTouchStart / wx.restartMiniProgram（不存在，如实不提供）
// 未覆盖（真机才有意义、浏览器无从模拟）：wx.saveImageToPhotosAlbum、真机品牌/GPU 信息、
// 基础库 SDKVersion、开放数据域、真机分包下载链路。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.PWProbe = root.PWProbe || {}; root.PWProbe.platformBrowser = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const USER_DATA_PATH = 'wxfile://probe-user-data';
  const SCREEN_CANVAS_ID = 'probe-screen-canvas';

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  /** 虚拟文件系统：把 wx 的 USER_DATA_PATH 映射到内存表，供测试harness 落盘。 */
  function createVirtualFS() {
    const files = new Map();
    return {
      files: files,
      write: function (path, data) { files.set(path, data); },
      read: function (path) { return files.has(path) ? files.get(path) : null; },
    };
  }

  function installWxShim(vfs) {
    if (typeof window === 'undefined') throw new Error('[platform-browser] 非浏览器环境');
    if (window.wx && window.wx.__pwProbeShim) return window.wx;
    let seq = 0;
    const shim = {
      __pwProbeShim: true,
      env: { USER_DATA_PATH: USER_DATA_PATH },
      createCanvas: function () {
        seq++;
        if (seq === 1) {
          const el = document.getElementById(SCREEN_CANVAS_ID);
          if (!el) throw new Error('[platform-browser] 页面缺 <canvas id="' + SCREEN_CANVAS_ID + '">');
          el.__probeIsScreen = true;
          return el;
        }
        const c = document.createElement('canvas');
        c.__probeIsScreen = false;
        return c;
      },
      getSystemInfoSync: function () {
        const ua = navigator.userAgent || '';
        return {
          brand: 'browser', model: navigator.platform || 'browser',
          system: ua, platform: 'browser', version: ua,
          SDKVersion: undefined,              // 浏览器没有微信基础库 ⇒ 如实留空
          benchmarkLevel: null,
          pixelRatio: window.devicePixelRatio || 1,
          screenWidth: window.screen ? window.screen.width : window.innerWidth,
          screenHeight: window.screen ? window.screen.height : window.innerHeight,
          windowWidth: window.innerWidth, windowHeight: window.innerHeight,
        };
      },
      getFileSystemManager: function () {
        return {
          readFile: function (o) {
            fetch(o.filePath).then(function (r) {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.arrayBuffer();
            }).then(function (b) { o.success({ data: b }); })
              .catch(function (e) { o.fail({ errMsg: String(e) }); });
          },
          readFileSync: function (path, enc) {
            const v = vfs.read('sync:' + path);
            if (v === null) throw new Error('readFileSync: 未预热 ' + path);
            return enc === 'utf8' ? v : v;
          },
          writeFileSync: function (path, data) { vfs.write(path, data); },
        };
      },
      /** 走"落地临时文件 → Image 加载"同一条链路，与微信端形态一致（不用 createImageBitmap 抄近路）。 */
      createImage: function () { return new Image(); },
      loadSubpackage: function (o) {
        // 浏览器端资源就在本地服务器上：不模拟下载耗时，如实标记 simulated
        setTimeout(function () { o.success && o.success({}); }, 0);
        return { onProgressUpdate: function () {} };
      },
      setStorageSync: function (k, v) {
        try { window.localStorage.setItem('pw-probe:' + k, JSON.stringify(v)); } catch (e) { /* 隐私模式忽略 */ }
      },
      getStorageSync: function (k) {
        try {
          const s = window.localStorage.getItem('pw-probe:' + k);
          return s === null ? '' : JSON.parse(s);
        } catch (e) { return ''; }
      },
      setClipboardData: function (o) {
        const done = function (ok) { ok ? (o.success && o.success({})) : (o.fail && o.fail({ errMsg: 'clipboard denied' })); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(o.data).then(function () { done(true); }, function () { done(false); });
        } else done(false);
      },
      canvasToTempFilePath: function (o) {
        try {
          const dataUrl = o.canvas.toDataURL('image/png');
          vfs.write('dataurl:' + (o.__name || 'canvas'), dataUrl);
          o.success && o.success({ tempFilePath: 'dataurl:' + (o.__name || 'canvas') });
        } catch (e) { o.fail && o.fail({ errMsg: String(e) }); }
      },
      onTouchStart: function (cb) {
        window.addEventListener('pointerdown', function (e) {
          const rect = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : { left: 0, top: 0 };
          cb({ touches: [{ clientX: e.clientX - rect.left, clientY: e.clientY - rect.top }] });
        });
      },
    };
    window.wx = shim;
    return shim;
  }

  function createBrowserPlatform() {
    const vfs = createVirtualFS();
    const wxShim = installWxShim(vfs);

    return {
      kind: 'browser',
      env: { userDataPath: USER_DATA_PATH, platform: 'browser' },
      vfs: vfs,
      resolvedPaths: {},
      createCanvas: function () { return wxShim.createCanvas(); },
      get canvasSequence() { return 0; },
      getSystemInfo: function () { return wxShim.getSystemInfoSync(); },
      candidatePaths: function (relPath) { return ['../' + relPath, relPath]; },

      readFileArrayBuffer: function (path) {
        return fetch(path).then(function (r) {
          if (!r.ok) throw new Error('[platform-browser] fetch ' + path + ' → HTTP ' + r.status);
          return r.arrayBuffer();
        });
      },
      /** 预取小文件，供 readFileSync 走（浏览器 fetch 是异步的，只用于 JSON 这类小件）。 */
      preloadSync: function (path, text) { vfs.write('sync:' + path, text); },
      readFileSyncUtf8: function (path) {
        const v = vfs.read('sync:' + path);
        if (typeof v !== 'string') throw new Error('[platform-browser] readFileSyncUtf8 未预热: ' + path);
        return v;
      },
      readTextFile: function (path) {
        return fetch(path).then(function (r) { return r.text(); });
      },
      /** 模型 SHA-256：浏览器有 crypto.subtle（localhost/127.0.0.1 属安全上下文）；不可用则 null。 */
      sha256Hex: function (relPath) {
        if (!(window.crypto && window.crypto.subtle)) return Promise.resolve(null);
        const cands = this.candidatePaths(relPath);
        const tryOne = function (i) {
          if (i >= cands.length) return Promise.resolve(null);
          return fetch(cands[i]).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.arrayBuffer();
          }).then(function (b) {
            return window.crypto.subtle.digest('SHA-256', b);
          }).then(function (d) {
            return Array.prototype.map.call(new Uint8Array(d), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
          }).catch(function () { return tryOne(i + 1); });
        };
        return tryOne(0);
      },

      decodeImage: function (bytes, name, mimeType) {
        const blob = new Blob([bytes], { type: mimeType || 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        return new Promise(function (resolve, reject) {
          const img = new Image();
          img.onload = function () { resolve({ image: img, width: img.naturalWidth, height: img.naturalHeight, mimeType: mimeType || '', path: url }); };
          img.onerror = function () { reject(new Error('[platform-browser] 贴图解码失败 ' + name)); };
          img.src = url;
        });
      },

      loadSubpackage: function (name) {
        return Promise.resolve({ name: name, ms: 0, ok: true, simulated: true });
      },

      writeUserFile: function (name, data) {
        const path = USER_DATA_PATH + '/' + name;
        vfs.write(path, data);
        return path;
      },
      readUserFile: function (name) { return vfs.read(USER_DATA_PATH + '/' + name); },
      getStorage: function (key) { return wxShim.getStorageSync(key); },
      setStorage: function (key, value) { wxShim.setStorageSync(key, value); return true; },
      setClipboard: function (text) {
        return new Promise(function (resolve) {
          wxShim.setClipboardData({ data: text, success: function () { resolve(true); }, fail: function () { resolve(false); } });
        });
      },
      canvasToTempFilePath: function (canvas, name) {
        return new Promise(function (resolve) {
          wxShim.canvasToTempFilePath({
            canvas: canvas, __name: name,
            success: function (res) { resolve(res.tempFilePath); },
            fail: function () { resolve(null); },
          });
        });
      },
      saveImageToAlbum: function () { return Promise.resolve(false); },
      requestAnimationFrame: function (cb) { return window.requestAnimationFrame(cb); },
      now: now,
      onTouchStart: function (cb) {
        window.addEventListener('pointerdown', function (e) {
          const cv = document.getElementById(SCREEN_CANVAS_ID);
          const rect = cv ? cv.getBoundingClientRect() : { left: 0, top: 0 };
          const scaleX = cv ? cv.width / rect.width : 1;
          const scaleY = cv ? cv.height / rect.height : 1;
          cb((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
        });
      },
      restartApp: function () { window.location.reload(); return true; },
    };
  }

  return { createBrowserPlatform: createBrowserPlatform, SCREEN_CANVAS_ID: SCREEN_CANVAS_ID };
});
