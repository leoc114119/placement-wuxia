// T31-FE-A · ui/character3d/platform-wx.ts —— 微信小游戏适配器（方案 §6.1）
//
// 方案原文：微信 adapter 使用 `wx.downloadFile + FileSystemManager.getFileInfo/saveFile`。
// 本文件是**唯一**允许直接触 `wx.*` 的地方（另一处是 platform-browser 触 DOM/fetch）；
// renderer 与 loader 内禁散落 wx/DOM/fetch（方案 §3 末段、易错点 11）。
//
// ★ wx 全局的类型不走 env.d.ts（该文件属共享声明区，本卡不改）：
//   在本文件内声明宿主能力面，并在解析时对全局 `wx` 做**唯一一次**结构化断言。
//   `typeof wx !== 'undefined'` 在非微信宿主是安全的（不会 ReferenceError）。
//
// ★ 已知宿主坑（probe 真机实测，勿「顺手改正」）：
//   ① `wx.createCanvas()` **首次调用返回屏幕画布**，之后才是离屏画布
//      ⇒ 本适配器只能在小游戏主画布已创建之后使用（宿主装配顺序由 card C 的 smoke host 保证）。
//   ② 分包/用户目录里的路径形态没有官方逐字条文 ⇒ 用户目录一律拼 `wx.env.USER_DATA_PATH` 绝对路径，
//      命中与否由 accessSync 实测决定，不猜。
//   ③ `getFileInfo(digestAlgorithm)` 在旧基础库可能不返回 digest ⇒ 本层如实 resolve(null)，
//      由 loader 退回 sha256Bytes；两者都不可用时**失败关闭**（不校验的资产不入库）。

import type {
  Character3DCacheEntry,
  Character3DCachePutInput,
  Character3DDownloadOptions,
  Character3DPlatform,
  PlatformDecodedImage,
  PlatformOffscreenCanvas,
} from './platform';

// ===== 宿主能力面（最小声明，只列本适配器真正调用的 API） =====

interface WxErrorLike {
  errMsg?: string;
}

interface WxFileInfoResult {
  size: number;
  digest?: string;
}

interface WxFileSystemManager {
  getFileInfo(options: {
    filePath: string;
    digestAlgorithm?: string;
    success: (res: WxFileInfoResult) => void;
    fail: (err: WxErrorLike) => void;
  }): void;
  readFile(options: {
    filePath: string;
    encoding?: string;
    success: (res: { data: ArrayBuffer | string }) => void;
    fail: (err: WxErrorLike) => void;
  }): void;
  readFileSync(path: string, encoding?: string): ArrayBuffer | string;
  writeFileSync(path: string, data: ArrayBuffer | string): void;
  renameSync(oldPath: string, newPath: string): void;
  copyFileSync(srcPath: string, destPath: string): void;
  unlinkSync(path: string): void;
  accessSync(path: string): void;
  mkdirSync(path: string, recursive?: boolean): void;
}

interface WxDownloadResult {
  statusCode: number;
  tempFilePath: string;
}

interface WxDownloadTask {
  abort(): void;
  onProgressUpdate?(cb: (res: unknown) => void): void;
}

interface WxCanvasLike {
  width: number;
  height: number;
  getContext(type: string, attributes?: unknown): unknown;
}

interface WxImageLike {
  src: string;
  width: number;
  height: number;
  onload?: (() => void) | null;
  onerror?: ((err: unknown) => void) | null;
}

interface WxRuntime {
  env: { USER_DATA_PATH: string };
  downloadFile(options: {
    url: string;
    timeout?: number;
    success: (res: WxDownloadResult) => void;
    fail: (err: WxErrorLike) => void;
  }): WxDownloadTask;
  getFileSystemManager(): WxFileSystemManager;
  createCanvas(): WxCanvasLike;
  createImage(): WxImageLike;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
}

/** 解析宿主 `wx` 全局（本卡唯一的全局断言点）。 */
export function resolveWxRuntime(): WxRuntime {
  const fromGlobal = (globalThis as unknown as { wx?: WxRuntime }).wx;
  if (fromGlobal && fromGlobal.env && typeof fromGlobal.downloadFile === 'function') return fromGlobal;
  if (typeof wx !== 'undefined') {
    const declared = wx as unknown as WxRuntime;
    if (declared && typeof declared.downloadFile === 'function') return declared;
  }
  throw new Error('[platform-wx] 无 wx 全局：不是微信小游戏宿主');
}

const CACHE_DIR_NAME = 'character3d';
const CACHE_INDEX_KEY = 'character3d-cache-index-v1';

export interface WxPlatformOptions {
  /** 覆盖宿主解析（测试注入假 wx） */
  runtime?: WxRuntime;
  logSink?: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => void;
}

export function createWxCharacter3DPlatform(options: WxPlatformOptions = {}): Character3DPlatform {
  const host = options.runtime ?? resolveWxRuntime();
  const fs = host.getFileSystemManager();
  const cacheDir = host.env.USER_DATA_PATH + '/' + CACHE_DIR_NAME;
  const logSink = options.logSink ?? ((level, message, data) => {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(message, data ?? '');
  });

  try {
    fs.mkdirSync(cacheDir, true);
  } catch {
    // 目录已存在是最常见的原因；真正的不可写会在后续 writeFile 处如实失败
  }

  /** 缓存索引（持久化在 storage；只存 §6.1 规定的 5 个字段）。 */
  const cacheIndex = new Map<string, Character3DCacheEntry>(readIndex());
  let indexDirty = false;

  function readIndex(): [string, Character3DCacheEntry][] {
    try {
      const raw = host.getStorageSync(CACHE_INDEX_KEY);
      if (!raw || typeof raw !== 'object') return [];
      const entries = Object.entries(raw as Record<string, Character3DCacheEntry>);
      return entries.filter(([, v]) => v && typeof v.savedPath === 'string' && typeof v.sha256 === 'string');
    } catch {
      return [];
    }
  }

  function persistIndex(): void {
    if (!indexDirty) return;
    try {
      const obj: Record<string, Character3DCacheEntry> = {};
      for (const [k, v] of cacheIndex) obj[k] = v;
      host.setStorageSync(CACHE_INDEX_KEY, obj);
      indexDirty = false;
    } catch (error) {
      // 索引写失败不致命：下次冷启动重下；不静默假装成功
      logSink('warn', '[platform-wx] 缓存索引落盘失败', { message: String(error) });
    }
  }

  function fileExists(path: string): boolean {
    try {
      fs.accessSync(path);
      return true;
    } catch {
      return false;
    }
  }

  function sha256OfFile(path: string): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        fs.getFileInfo({
          filePath: path,
          digestAlgorithm: 'sha256',
          success: (res) => resolve(res.digest ? String(res.digest).toLowerCase() : null),
          fail: () => resolve(null),
        });
      } catch {
        resolve(null);
      }
    });
  }

  return {
    kind: 'wx',

    createOffscreenCanvas(width, height): PlatformOffscreenCanvas {
      // ★ wx.createCanvas 首次 = 屏幕画布；本适配器假定主画布已创建（见文件头坑①）
      const canvas = host.createCanvas();
      canvas.width = width;
      canvas.height = height;
      return canvas as unknown as PlatformOffscreenCanvas;
    },

    downloadArrayBuffer(url, downloadOptions: Character3DDownloadOptions): Promise<Uint8Array> {
      return new Promise<Uint8Array>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void): void => { if (!settled) { settled = true; fn(); } };
        const task = host.downloadFile({
          url,
          timeout: downloadOptions.timeoutMs,
          success: (res) => {
            if (res.statusCode !== 200) {
              finish(() => reject(new Error('[platform-wx] downloadFile HTTP ' + res.statusCode + ' ' + url)));
              return;
            }
            fs.readFile({
              filePath: res.tempFilePath,
              success: (file) => {
                const data = file.data;
                if (!(data instanceof ArrayBuffer)) {
                  finish(() => reject(new Error('[platform-wx] 下载结果不是二进制: ' + url)));
                  return;
                }
                finish(() => resolve(new Uint8Array(data)));
              },
              fail: (err) => finish(() => reject(new Error('[platform-wx] 读下载临时文件失败: ' + (err.errMsg || url)))),
            });
          },
          fail: (err) => finish(() => reject(new Error('[platform-wx] downloadFile 失败: ' + (err.errMsg || url)))),
        });
        if (downloadOptions.signal) {
          downloadOptions.signal.onAbort(() => {
            try { task.abort(); } catch { /* 宿主不支持 abort：交给超时护栏 */ }
            finish(() => reject(new Error('[platform-wx] 下载被取消: ' + url)));
          });
        }
      });
    },

    sha256File(path: string): Promise<string | null> {
      return sha256OfFile(path);
    },

    /**
     * 直接对内存字节求 SHA-256。
     * ★ 微信基础库没有 WebCrypto，JS 侧无法就地算摘要 ⇒ 落一个临时文件再借 getFileInfo。
     *   两者都不可用时**拒绝**（失败关闭），绝不放行未校验的资产进入缓存。
     */
    async sha256Bytes(bytes: Uint8Array): Promise<string> {
      const path = cacheDir + '/sha-probe.bin';
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      try {
        fs.writeFileSync(path, copy);
      } catch (error) {
        throw new Error('[platform-wx] 写 sha 探针文件失败: ' + String(error));
      }
      const digest = await sha256OfFile(path);
      try { fs.unlinkSync(path); } catch { /* 清理失败不影响结论 */ }
      if (!digest) {
        throw new Error('[platform-wx] 该基础库不支持 getFileInfo(digestAlgorithm) ⇒ 无法校验 SHA-256，拒绝放行');
      }
      return digest;
    },

    async cacheGet(assetId): Promise<Character3DCacheEntry | null> {
      const entry = cacheIndex.get(assetId);
      if (!entry) return null;
      // 索引与文件必须同时存在；只有索引没有文件 = 坏条目，如实返回 null 让 loader 重下
      if (!fileExists(entry.savedPath)) {
        cacheIndex.delete(assetId);
        indexDirty = true;
        persistIndex();
        return null;
      }
      return { ...entry };
    },

    async cachePut(input: Character3DCachePutInput): Promise<Character3DCacheEntry> {
      if (!fileExists(input.tempPath)) {
        throw new Error('[platform-wx] 临时文件不存在: ' + input.tempPath);
      }
      const dest = cacheDir + '/' + input.assetId + '-' + input.sha256.slice(0, 12) + '.bin';
      if (!fileExists(dest)) {
        try {
          fs.renameSync(input.tempPath, dest); // 同目录改名 = 原子登记（先写目标，再改索引）
        } catch {
          // 部分基础库对跨文件 rename 支持不一致：退化为复制 + 删源，语义等价
          fs.copyFileSync(input.tempPath, dest);
          try { fs.unlinkSync(input.tempPath); } catch { /* 源清理失败不影响登记 */ }
        }
      } else {
        try { fs.unlinkSync(input.tempPath); } catch { /* 目标已存在，源可留可删 */ }
      }
      const entry: Character3DCacheEntry = {
        assetId: input.assetId,
        sha256: input.sha256,
        savedPath: dest,
        byteLength: input.byteLength,
        lastUsedAt: Date.now(),
      };
      cacheIndex.set(input.assetId, entry);
      indexDirty = true;
      persistIndex();
      return { ...entry };
    },

    async cacheRemove(assetId): Promise<void> {
      const entry = cacheIndex.get(assetId);
      if (entry) {
        try { fs.unlinkSync(entry.savedPath); } catch { /* 文件可能已被系统清理 */ }
      }
      cacheIndex.delete(assetId);
      indexDirty = true;
      persistIndex();
    },

    async writeTempFile(name, bytes): Promise<string> {
      const path = cacheDir + '/tmp-' + sanitize(name);
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      fs.writeFileSync(path, copy);
      return path;
    },

    async readFileBytes(path): Promise<Uint8Array> {
      return await new Promise<Uint8Array>((resolve, reject) => {
        fs.readFile({
          filePath: path,
          success: (res) => {
            if (res.data instanceof ArrayBuffer) resolve(new Uint8Array(res.data));
            else reject(new Error('[platform-wx] 读文件未返回二进制: ' + path));
          },
          fail: (err) => reject(new Error('[platform-wx] 读文件失败 ' + path + ': ' + (err.errMsg || ''))),
        });
      });
    },

    async removeFile(path): Promise<void> {
      try {
        fs.unlinkSync(path);
      } catch {
        // 文件本就不存在 ⇒ 目标达成
      }
    },

    async decodeImage(bytes, mimeType, name): Promise<PlatformDecodedImage> {
      const ext = mimeType.indexOf('png') >= 0 ? 'png' : 'jpg';
      const path = cacheDir + '/tex-' + sanitize(name) + '.' + ext;
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      fs.writeFileSync(path, copy);
      return await new Promise<PlatformDecodedImage>((resolve, reject) => {
        const img = host.createImage();
        img.onload = () => resolve({ image: img, width: img.width, height: img.height, mimeType });
        img.onerror = (err) => reject(new Error('[platform-wx] 贴图解码失败 ' + path + ' ' + String(err)));
        img.src = path;
      });
    },

    now(): number {
      return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    },

    log(level, message, data): void {
      logSink(level, message, data);
    },
  };
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
