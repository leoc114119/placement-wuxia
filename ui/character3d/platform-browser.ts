// T31-FE-A · ui/character3d/platform-browser.ts —— 浏览器 / 预览适配器（方案 §6.1）
//
// 方案原文：浏览器 adapter 使用 `fetch + crypto.subtle.digest`。
// 预览环境的「磁盘」= 内存登记表（无持久盘）：临时文件与缓存条目都是内存项，
// 因此 `savedPath` 是合成路径 `mem:<kind>:<assetId>:<sha12>` —— 语义与微信的 USER_DATA_PATH 一一对应，
// 上层 loader 状态机**零分支**地跑同一条流程（这也是两平台行为一致性的保证）。
//
// 本文件是允许直接触 DOM/fetch 的地方之一（另一处是 platform-wx 触 wx.*）；渲染与 loader 禁触。

import type {
  Character3DCacheEntry,
  Character3DCachePutInput,
  Character3DDownloadOptions,
  Character3DPlatform,
  PlatformDecodedImage,
  PlatformOffscreenCanvas,
} from './platform';

export interface BrowserPlatformOptions {
  /** 日志出口（默认 console）；宿主可换成微信/vConsole 通道 */
  logSink?: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => void;
  /** 离屏画布工厂（默认 OffscreenCanvas / document.createElement('canvas')） */
  createCanvas?: (width: number, height: number) => PlatformOffscreenCanvas;
  /** 取当前时间（默认 performance.now） */
  now?: () => number;
}

export function createBrowserCharacter3DPlatform(options: BrowserPlatformOptions = {}): Character3DPlatform {
  /** 内存「文件系统」：path → 字节。temp 与 cache 同一张表，靠路径前缀区分。 */
  const files = new Map<string, Uint8Array>();
  const cacheIndex = new Map<string, Character3DCacheEntry>();
  const now = options.now ?? (() => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()));
  const logSink = options.logSink ?? ((level, message, data) => {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(message, data ?? '');
  });

  function memPath(kind: 'tmp' | 'cache', assetId: string, sha12: string): string {
    return 'mem:' + kind + ':' + assetId + ':' + sha12;
  }

  async function sha256Bytes(bytes: Uint8Array): Promise<string> {
    const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
    if (!subtle) throw new Error('[platform-browser] crypto.subtle 不可用，无法校验 SHA-256');
    // 必须交紧凑的独立 buffer：subarray 视图会被 digest 按其 byteOffset/byteLength 正常处理，
    // 但部分宿主对 SharedArrayBuffer/非独立视图报错，这里统一复制一次，行为确定。
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await subtle.digest('SHA-256', copy);
    return toHex(new Uint8Array(digest));
  }

  return {
    kind: 'browser',

    createOffscreenCanvas(width, height): PlatformOffscreenCanvas {
      if (options.createCanvas) return options.createCanvas(width, height);
      const anyGlobal = globalThis as unknown as { OffscreenCanvas?: new (w: number, h: number) => PlatformOffscreenCanvas };
      if (typeof anyGlobal.OffscreenCanvas === 'function') {
        const c = new anyGlobal.OffscreenCanvas(width, height);
        c.width = width;
        c.height = height;
        return c;
      }
      const doc = (globalThis as unknown as { document?: Document }).document;
      if (doc && typeof doc.createElement === 'function') {
        const c = doc.createElement('canvas');
        c.width = width;
        c.height = height;
        return c as unknown as PlatformOffscreenCanvas;
      }
      throw new Error('[platform-browser] 无可用离屏画布构造器（OffscreenCanvas / document 都缺）');
    },

    async downloadArrayBuffer(url: string, downloadOptions: Character3DDownloadOptions): Promise<Uint8Array> {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      if (controller && downloadOptions.signal) {
        if (downloadOptions.signal.aborted) controller.abort();
        else downloadOptions.signal.onAbort(() => controller.abort());
      }
      const timer = setTimeout(() => { if (controller) controller.abort(); }, downloadOptions.timeoutMs);
      try {
        const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
        return new Uint8Array(await res.arrayBuffer());
      } finally {
        clearTimeout(timer);
      }
    },

    async sha256File(path: string): Promise<string | null> {
      const bytes = files.get(path);
      if (!bytes) return null;
      return sha256Bytes(bytes);
    },

    sha256Bytes,

    async cacheGet(assetId: string): Promise<Character3DCacheEntry | null> {
      const entry = cacheIndex.get(assetId);
      if (!entry) return null;
      // 索引与文件必须同时存在；只有索引没有内容 = 坏条目，如实返回 null 让 loader 重新下载
      return files.has(entry.savedPath) ? { ...entry } : null;
    },

    async cachePut(input: Character3DCachePutInput): Promise<Character3DCacheEntry> {
      const bytes = files.get(input.tempPath);
      if (!bytes) throw new Error('[platform-browser] 临时文件不存在: ' + input.tempPath);
      const dest = memPath('cache', input.assetId, input.sha256.slice(0, 12));
      files.set(dest, bytes);
      files.delete(input.tempPath); // 原子「改名」：先写目标再删源
      const entry: Character3DCacheEntry = {
        assetId: input.assetId,
        sha256: input.sha256,
        savedPath: dest,
        byteLength: input.byteLength,
        lastUsedAt: now(),
      };
      cacheIndex.set(input.assetId, entry);
      return { ...entry };
    },

    async cacheRemove(assetId: string): Promise<void> {
      const entry = cacheIndex.get(assetId);
      if (entry) files.delete(entry.savedPath);
      cacheIndex.delete(assetId);
    },

    async writeTempFile(name: string, bytes: Uint8Array): Promise<string> {
      const path = memPath('tmp', name, 'x');
      files.set(path, bytes);
      return path;
    },

    async readFileBytes(path: string): Promise<Uint8Array> {
      const bytes = files.get(path);
      if (!bytes) throw new Error('[platform-browser] 文件不存在: ' + path);
      return bytes;
    },

    async removeFile(path: string): Promise<void> {
      files.delete(path);
    },

    async decodeImage(bytes: Uint8Array, mimeType: string, name: string): Promise<PlatformDecodedImage> {
      const type = mimeType || 'image/jpeg';
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy], { type });
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        return { image: bitmap, width: bitmap.width, height: bitmap.height, mimeType: type };
      }
      // 退化路径：ObjectURL + Image（微信式宿主没有 createImageBitmap 时同理由 adapter 处理）
      const doc = (globalThis as unknown as { document?: Document }).document;
      if (!doc) throw new Error('[platform-browser] 无 createImageBitmap 也无 document，无法解码贴图 ' + name);
      const url = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('[platform-browser] 贴图解码失败 ' + name));
          el.src = url;
        });
        return { image: img, width: img.naturalWidth, height: img.naturalHeight, mimeType: type };
      } finally {
        URL.revokeObjectURL(url);
      }
    },

    now,
    log(level, message, data) {
      logSink(level, message, data);
    },
  };
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16);
    out += h.length === 1 ? '0' + h : h;
  }
  return out;
}
