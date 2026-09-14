// T31-FE-A · ui/character3d/platform.ts —— 平台注入接口（方案 §3 末段 / §6.1）
//
// 目的：**renderer 与 loader 内禁止散落 `wx.*` / DOM / fetch**（方案 §3 末段、易错点 11
// 「为后续 App 直接引用 wx API；平台差异必须止于 adapter」）。
// 所有宿主差异止于本接口 + platform-browser.ts / platform-wx.ts 两个实现。
//
// 方案 §3 要求的**最小集合**：createOffscreenCanvas / downloadArrayBuffer / sha256File /
//   cacheGet / cachePut / cacheRemove / now / log。
// 本接口在此之上补足资源门真正需要的原语（临时文件 / 读文件 / 删文件 / 解码贴图 / 下载取消），
// 否则 loader 的状态机无法「先落临时文件 → 校验 → 原子登记」地实现方案 §6.1 的流程。

/** 缓存索引条目。方案 §6.1：**只存** {assetId, sha256, savedPath, byteLength, lastUsedAt}，不存业务状态。 */
export interface Character3DCacheEntry {
  assetId: string;
  sha256: string;
  savedPath: string;
  byteLength: number;
  lastUsedAt: number;
}

/** 登记请求：把已校验通过的临时文件原子提升为正式缓存条目。 */
export interface Character3DCachePutInput {
  assetId: string;
  sha256: string;
  byteLength: number;
  tempPath: string;
}

export interface Character3DDownloadOptions {
  /** 超时（毫秒）。到点即判失败并进入重试/回退，不给「永远转圈」。 */
  timeoutMs: number;
  signal?: Character3DCancelSignal;
}

/** 取消信号（跨平台最小形态：平台适配器各自翻译成 AbortController / downloadTask.abort）。 */
export interface Character3DCancelSignal {
  readonly aborted: boolean;
  onAbort(cb: () => void): void;
}

/** 可直接交给 gl.texImage2D 的图像对象。类型故意留宽：浏览器是 HTMLImageElement/ImageBitmap，
 * 微信是 Image 对象，形状不同 —— 渲染端在此做**唯一一次** as（P3 注释）。 */
export type PlatformImageSource = unknown;

export interface PlatformDecodedImage {
  image: PlatformImageSource;
  width: number;
  height: number;
  mimeType: string;
}

/** 离屏画布（浏览器 OffscreenCanvas / HTMLCanvasElement；微信 wx.createCanvas 产物）。 */
export interface PlatformOffscreenCanvas {
  width: number;
  height: number;
  getContext(type: 'webgl2', attributes?: WebGLContextAttributes): WebGL2RenderingContext | null;
  getContext(type: '2d'): CanvasRenderingContext2D | null;
}

/** 平台能力集。实现必须**不抛同步异常**地表征失败：一律走 Promise reject，附可读原因。 */
export interface Character3DPlatform {
  /** 适配器名（诊断/日志用，如 'browser' / 'wx'）。 */
  readonly kind: string;
  createOffscreenCanvas(width: number, height: number): PlatformOffscreenCanvas;
  /** 下载整块资源（相对 urlPath 由调用方拼 base 后传入；本层不持有 base URL 知识）。 */
  downloadArrayBuffer(url: string, options: Character3DDownloadOptions): Promise<Uint8Array>;
  /** 对**已落盘文件**求 SHA-256 十六进制小写串。微信走 getFileInfo(digestAlgorithm)；
   * 浏览器适配器的「文件」是内存登记项。不可用（基础库不支持）时 resolve(null)。 */
  sha256File(path: string): Promise<string | null>;
  /** 直接对内存字节求 SHA-256（临时文件与 LKG 比对用；避免为一个 4MB 文件多写一次盘）。 */
  sha256Bytes(bytes: Uint8Array): Promise<string>;
  cacheGet(assetId: string): Promise<Character3DCacheEntry | null>;
  cachePut(input: Character3DCachePutInput): Promise<Character3DCacheEntry>;
  cacheRemove(assetId: string): Promise<void>;
  writeTempFile(name: string, bytes: Uint8Array): Promise<string>;
  readFileBytes(path: string): Promise<Uint8Array>;
  removeFile(path: string): Promise<void>;
  /** 解码内嵌贴图字节为可上传 GPU 的图像（微信：落临时文件 + wx.createImage）。 */
  decodeImage(bytes: Uint8Array, mimeType: string, name: string): Promise<PlatformDecodedImage>;
  now(): number;
  log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void;
}

/** 渲染端只依赖这三个平台能力（不注入整个平台对象，避免渲染层顺手拿到下载/缓存 API）。 */
export type Character3DRenderPlatform = Pick<Character3DPlatform, 'now' | 'log'>;
