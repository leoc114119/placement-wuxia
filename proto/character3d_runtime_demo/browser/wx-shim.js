// T31-FE-C · browser/wx-shim.js —— 浏览器侧的 `wx` 全局仿真（**仅供 sim，不进微信包**）
//
// 目的（与 S0 probe 的 platform-browser 同口径）：让**同一份 bundle.js**（= 生产 2.5D 运行时 +
//   本目录宿主）在 Chrome 里跑起来，用来做「导进微信之前」的代码路径自检 + 出证据截图。
//
// ★ 边界声明（不许含糊）：sim 结果**不是**微信/安卓能力证据（方案 §9.3）。它只证明：
//   bundle 能装配、六向/全状态能出片、上下文注入链能走通、20u 采样与判定能出数、结果能回收。
//
// 实现要点：
//   · 「文件系统」= 内存 Map；代码包路径（subpackages/...）走 fetch（静态服务器按仓库根提供）；
//   · getFileInfo(digestAlgorithm:'sha256') 用 crypto.subtle 真算（不返回假摘要）；
//   · createImage 用 Blob URL 把"临时文件"变成真 HTMLImageElement（可 texImage2D 上传）；
//   · 触摸回调口径与真机一致：**回调给诊断用的背衬像素**（这里由宿主自己换算，故 shim 直传逻辑像素）。
(function () {
  'use strict';

  var USER_DATA_PATH = '/sim-user';
  var STORAGE_PREFIX = 'char3d-sim:';
  var files = new Map();          // path -> Uint8Array
  var shots = new Map();          // 名字 -> dataURL（截图回收）
  var clipboard = null;
  var shares = [];
  var touchCb = null;
  var canvasSeq = 0;
  var screenCanvas = null;
  var forceAntialiasFalse = false;
  var bootMs = Date.now();
  var encoder = new TextEncoder();

  function hex(buf) {
    var out = '';
    var bytes = new Uint8Array(buf);
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }
  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof data === 'string') return encoder.encode(data);
    return encoder.encode(String(data));
  }
  function mimeOf(p) { return /\.png$/i.test(p) ? 'image/png' : /\.jpe?g$/i.test(p) ? 'image/jpeg' : 'application/octet-stream'; }
  function readStorage(key) {
    try {
      var raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw === null ? '' : JSON.parse(raw);
    } catch (e) { return ''; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch (e) { /* 配额满则丢弃 */ }
  }
  // 预置 storage（index.html 在 shim 加载前设置；sim 用，真机不设）
  if (window.__WX_SHIM_PRESET && typeof window.__WX_SHIM_PRESET === 'object') {
    Object.keys(window.__WX_SHIM_PRESET).forEach(function (k) { writeStorage(k, window.__WX_SHIM_PRESET[k]); });
  }
  // sim 强制抗锯齿分支（真机不设：走有效 getContextAttributes 的能力分支）
  if (window.__WX_SHIM_AA === 'fxaa') forceAntialiasFalse = true;
  /** 代码包路径（相对代码包根）→ fetch。真机由 wx 直接读包内文件，这里用同路径 HTTP 取。 */
  async function fetchCode(p) {
    var res = await fetch('/proto/character3d_runtime_demo/' + p.replace(/^\/+/, ''), { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch ' + p + ' HTTP ' + res.status);
    return new Uint8Array(await res.arrayBuffer());
  }
  function resolveCode(p) {
    var rel = p.replace(/^\/+/, '');
    return /^subpackages\//.test(rel) ? rel : null;
  }
  async function bytesOf(p) {
    if (files.has(p)) return files.get(p);
    var codePath = resolveCode(p);
    if (codePath) {
      var bytes = await fetchCode(codePath);
      files.set(p, bytes);
      return bytes;
    }
    throw new Error('no such file: ' + p);
  }

  var fsm = {
    mkdirSync: function () { /* 目录在内存 FS 里无实体 */ },
    accessSync: function (p) {
      if (!files.has(p) && !resolveCode(p)) throw new Error('accessSync: no such file ' + p);
    },
    getFileInfo: function (o) {
      bytesOf(o.filePath).then(function (bytes) {
        if (!o.digestAlgorithm) { o.success({ size: bytes.byteLength }); return; }
        var copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
        crypto.subtle.digest('SHA-256', copy).then(function (d) {
          o.success({ size: bytes.byteLength, digest: hex(d) });
        }).catch(function (e) { o.fail({ errMsg: String(e) }); });
      }).catch(function () { o.fail({ errMsg: 'no such file ' + o.filePath }); });
    },
    readFile: function (o) {
      bytesOf(o.filePath).then(function (bytes) {
        if (o.encoding) { o.success({ data: new TextDecoder().decode(bytes) }); return; }
        var copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes);
        o.success({ data: copy });
      }).catch(function (e) { o.fail({ errMsg: String(e) }); });
    },
    readFileSync: function (p, encoding) {
      var bytes = files.get(p);
      if (!bytes) throw new Error('readFileSync: no such file ' + p);
      if (encoding) return new TextDecoder().decode(bytes);
      var copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes);
      return copy;
    },
    writeFileSync: function (p, data) { files.set(p, toBytes(data)); },
    renameSync: function (from, to) {
      var b = files.get(from);
      if (!b) throw new Error('renameSync: no such file ' + from);
      files.set(to, b); files.delete(from);
    },
    copyFileSync: function (from, to) {
      var b = files.get(from);
      if (!b) throw new Error('copyFileSync: no such file ' + from);
      files.set(to, b);
    },
    unlinkSync: function (p) {
      if (!files.has(p)) throw new Error('unlinkSync: no such file ' + p);
      files.delete(p);
    },
  };

  var wx = {
    env: { USER_DATA_PATH: USER_DATA_PATH },
    getFileSystemManager: function () { return fsm; },

    getSystemInfoSync: function () {
      var dpr = window.devicePixelRatio || 1;
      return {
        brand: 'SimBrowser', model: 'Chrome-WXShim', system: 'macOS sim', platform: 'devtools',
        SDKVersion: '3.5.7-sim', benchmarkLevel: null, pixelRatio: dpr,
        screenWidth: Math.round(screen.width), screenHeight: Math.round(screen.height),
        windowWidth: window.innerWidth, windowHeight: window.innerHeight,
      };
    },

    createCanvas: function () {
      canvasSeq++;
      var c = document.createElement('canvas');
      var realGetContext = c.getContext.bind(c);
      c.getContext = function (type, attrs) {
        if (type === 'webgl2' && forceAntialiasFalse) {
          var a = Object.assign({}, attrs || {}, { antialias: false });
          return realGetContext(type, a);
        }
        return realGetContext(type, attrs);
      };
      if (canvasSeq === 1) screenCanvas = c;
      return c;
    },

    /** 内嵌贴图字节 → Blob URL → 真 HTMLImageElement（可上传 GPU）。 */
    createImage: function () {
      var img = new Image();
      Object.defineProperty(img, 'src', {
        configurable: true,
        get: function () { return img.getAttribute('src') || ''; },
        set: function (v) {
          var bytes = files.get(v);
          if (bytes) {
            var blob = new Blob([bytes], { type: mimeOf(v) });
            img.setAttribute('src', URL.createObjectURL(blob));
          } else {
            img.setAttribute('src', v);
          }
        },
      });
      return img;
    },

    /** sim 模式 = 本地分包路径，故 loadSubpackage 立即成功（真机由微信真正下载分包）。 */
    loadSubpackage: function (o) { setTimeout(function () { o.success(); }, 0); return {}; },

    onTouchStart: function (cb) { touchCb = cb; },

    setClipboardData: function (o) {
      var text = o.data;
      clipboard = text;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { o.success(); }, function () { o.success(); });
      } else { o.success(); }
    },

    shareFileMessage: function (o) {
      // 浏览器无文件分享：如实记录（sim 不算真机分享证据），但让调用方拿到"已调起"
      shares.push({ fileName: o.fileName, bytes: (files.get(o.filePath) || new Uint8Array()).byteLength });
      setTimeout(function () { o.success(); }, 0);
    },

    canvasToTempFilePath: function (o) {
      try {
        var dataUrl = o.canvas.toDataURL('image/png');
        var name = 'shot-' + shots.size + '.png';
        shots.set(name, dataUrl);
        var path = USER_DATA_PATH + '/' + name;
        var base64 = dataUrl.split(',')[1];
        var bin = atob(base64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        files.set(path, bytes);
        setTimeout(function () { o.success({ tempFilePath: path }); }, 0);
      } catch (e) { setTimeout(function () { o.fail({ errMsg: String(e) }); }, 0); }
    },

    downloadFile: function (o) {
      // 本地分包模式下不会被调用；保留实现以便将来切 CDN 模式时 sim 也能跑
      fetch(o.url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
        var path = USER_DATA_PATH + '/download-' + Math.random().toString(36).slice(2);
        files.set(path, new Uint8Array(buf));
        setTimeout(function () { o.success({ statusCode: 200, tempFilePath: path }); }, 0);
      }).catch(function (e) { setTimeout(function () { o.fail({ errMsg: String(e) }); }, 0); });
      return { abort: function () { } };
    },

    getStorageSync: function (key) { return readStorage(key); },
    setStorageSync: function (key, value) { writeStorage(key, value); },
  };

  window.wx = wx;
  globalThis.wx = wx;

  // ===== sim harness 控制面（只存在于浏览器；微信包里没有这个文件）=====
  window.__WX_SHIM = {
    setForceAntialiasFalse: function (v) { forceAntialiasFalse = v === true; },
    /** 模拟触摸（逻辑像素，与真机 wx.onTouchStart 同口径）。 */
    tap: function (x, y) {
      if (!touchCb) return false;
      touchCb({ touches: [{ clientX: x, clientY: y }] });
      return true;
    },
    dumpScreenshots: function () {
      var out = {};
      shots.forEach(function (v, k) { out[k] = v; });
      return out;
    },
    clipboardLength: function () { return clipboard ? String(clipboard).length : 0; },
    shares: function () { return shares.slice(); },
    fileCount: function () { return files.size; },
    bootMs: bootMs,
  };
})();
