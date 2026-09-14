// T31-FE-A · net/character-asset-loader.ts —— 平台无关的清单/校验/缓存状态机（方案 §6）
//
// 流程（§6.1，逐步照做）：
//   清单校验 → cache by SHA 命中 → 未命中下载临时文件 → sha256 校验 → 原子登记 last-known-good → 解析
//   「SHA 或 byteLength 不符**立即删临时文件**，禁止带病解析」；「先覆盖 LKG 再验 SHA」是明令易错点 9。
//
// 失败行为（§6.2）：
//   · 首次无缓存：自动重试 **恰 2 次**（间隔 1s、3s）；仍失败则失败返回，由调用方停在「角色资源加载失败」页；
//   · 有 last-known-good 且清单 profile / schema 兼容：网络失败可用旧 3D 内容，但必须打 `stale-3d-cache`
//     诊断，**不允许切 2D 帧**；
//   · SHA 不符 / GLB 结构不符：不使用该文件，也**不覆盖 last-known-good**。
//
// 注入边界（§3 末段）：cdnBaseUrl 由环境配置注入；业务侧只持**相对** urlPath；
//   本文件内禁出现 `wx.*` / DOM / fetch（平台差异止于 ui/character3d/platform 的 adapter）。
//
// 缓存索引只存 {assetId, sha256, savedPath, byteLength, lastUsedAt}，不存业务状态（§6.1）。

import type { Character3DAssetRef, Character3DClipKey, Character3DProfile } from '../types';
import type { Character3DCacheEntry, Character3DPlatform } from '../ui/character3d/platform';

/** 清单结构非法（调用方 bug：完整 URL / sha 格式错 / 非正整数长度）——直接抛，不静默继续。
 * 与非零失败口径一致（§9.1 profile 条「错误输入非零失败」）。 */
export class CharacterAssetRefError extends Error {
  readonly assetId: string;
  constructor(assetId: string, message: string) {
    super('[character-asset-loader] ' + message);
    this.name = 'CharacterAssetRefError';
    this.assetId = assetId;
  }
}

export type CharacterAssetLoadStatus = 'cache-hit' | 'downloaded' | 'stale-3d-cache' | 'failed';

export interface CharacterAssetLoadResult {
  readonly assetId: string;
  readonly ref: Character3DAssetRef;
  readonly status: CharacterAssetLoadStatus;
  /** 可用字节（cache-hit / downloaded / stale-3d-cache 时非空） */
  readonly bytes: Uint8Array | null;
  /** 已原子登记的持久路径；未登记（缓存写失败）时为 null */
  readonly savedPath: string | null;
  /** 实际下载尝试次数（0 = 未下载；3 = 首次 + 2 次重试） */
  readonly attempts: number;
  readonly diagnostics: readonly string[];
  readonly error: string | null;
}

export interface Character3DProfileLoadResult {
  readonly status: 'ready' | 'stale-3d-cache' | 'failed';
  readonly model: CharacterAssetLoadResult | null;
  readonly clips: Readonly<Partial<Record<Character3DClipKey, CharacterAssetLoadResult>>>;
  readonly diagnostics: readonly string[];
}

export interface CharacterAssetLoaderStats {
  downloadAttempts: number;
  downloads: number;
  cacheHits: number;
  staleFallbacks: number;
  failures: number;
  cacheWriteFailures: number;
  structureRejects: number;
  shaMismatches: number;
  byteLengthMismatches: number;
  timeouts: number;
  networkErrors: number;
  tempFilesRemoved: number;
}

export interface CharacterAssetLoaderOptions {
  platform: Character3DPlatform;
  /** 已批准的 CDN base URL（环境配置注入）；业务侧只见相对 urlPath（§6.1） */
  cdnBaseUrl: string;
  /** 重试间隔（毫秒）。长度 = 重试次数；默认 [1000, 3000] = 方案 §6.2 的「重试 2 次」 */
  retryDelaysMs?: readonly number[];
  downloadTimeoutMs?: number;
  /** 等待实现（测试注入假钟；默认 setTimeout） */
  sleep?: (ms: number) => Promise<void>;
  /** 结构门（GLB 41 骨 / 1 primitive 等）。抛错 ⇒ 结构不符：不用该文件、不覆盖 LKG */
  structureValidator?: (bytes: Uint8Array, ref: Character3DAssetRef) => void;
}

export interface CharacterAssetLoader {
  load(ref: Character3DAssetRef): Promise<CharacterAssetLoadResult>;
  loadMany(refs: readonly Character3DAssetRef[]): Promise<readonly CharacterAssetLoadResult[]>;
  /** 整套 profile 资产（模型 + 走 CDN 的动作 json；`{embedded}` 槽位跳过下载）。 */
  loadProfile(profile: Character3DProfile): Promise<Character3DProfileLoadResult>;
  stats(): CharacterAssetLoaderStats;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** 相对 urlPath 检查（与 config/character-3d 的 isRelativeAssetPath 同口径；此处独立一份
 * 是为了让 net 层不依赖 config，避免业务配置改动牵动 loader 语义）。 */
export function isRelativeAssetPath(urlPath: string): boolean {
  if (!urlPath || urlPath.trim() !== urlPath) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlPath)) return false;
  if (urlPath.startsWith('//') || urlPath.startsWith('/')) return false;
  return urlPath.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** 拼接 CDN URL。唯一允许出现「完整 URL 拼接」的地方（业务代码只见 urlPath）。 */
export function joinCdnUrl(cdnBaseUrl: string, urlPath: string): string {
  const base = cdnBaseUrl.replace(/\/+$/, '');
  return base + '/' + urlPath;
}

/** 清单校验：不合法直接抛 CharacterAssetRefError（非零失败）。 */
export function assertValidAssetRef(ref: Character3DAssetRef): void {
  if (!ref.id) throw new CharacterAssetRefError(String(ref.id), '缺 assetId');
  if (!SHA256_HEX.test(ref.sha256)) {
    throw new CharacterAssetRefError(ref.id, 'sha256 非 64 位小写十六进制: ' + ref.sha256);
  }
  if (!Number.isInteger(ref.byteLength) || ref.byteLength <= 0) {
    throw new CharacterAssetRefError(ref.id, 'byteLength 非正整数: ' + ref.byteLength);
  }
  if (!isRelativeAssetPath(ref.urlPath)) {
    throw new CharacterAssetRefError(
      ref.id,
      'urlPath 必须是相对 CDN base 的路径（禁完整 URL/协议/前导斜杠/上跳）: ' + ref.urlPath,
    );
  }
}

export function createCharacterAssetLoader(options: CharacterAssetLoaderOptions): CharacterAssetLoader {
  const platform = options.platform;
  const retryDelays = options.retryDelaysMs ?? [1000, 3000];
  const downloadTimeoutMs = options.downloadTimeoutMs ?? 15000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const stats: CharacterAssetLoaderStats = {
    downloadAttempts: 0, downloads: 0, cacheHits: 0, staleFallbacks: 0, failures: 0, cacheWriteFailures: 0,
    structureRejects: 0, shaMismatches: 0, byteLengthMismatches: 0, timeouts: 0, networkErrors: 0,
    tempFilesRemoved: 0,
  };
  /** 并发合并（§9.1「并发请求合并」）：同一 assetId 的在飞请求共用同一个 Promise。 */
  const inflight = new Map<string, Promise<CharacterAssetLoadResult>>();

  function load(ref: Character3DAssetRef): Promise<CharacterAssetLoadResult> {
    assertValidAssetRef(ref);
    const existing = inflight.get(ref.id);
    if (existing) return existing;
    const task = loadOnce(ref).then(
      (r) => { inflight.delete(ref.id); return r; },
      (e: unknown) => { inflight.delete(ref.id); throw e; },
    );
    inflight.set(ref.id, task);
    return task;
  }

  async function loadOnce(ref: Character3DAssetRef): Promise<CharacterAssetLoadResult> {
    const diags: string[] = [];
    const cached = await safeCacheGet(ref.id, diags);

    // ---- ① cache by SHA 命中（§6.1）----
    if (cached && cached.sha256 === ref.sha256 && cached.byteLength === ref.byteLength) {
      try {
        const bytes = await platform.readFileBytes(cached.savedPath);
        if (bytes.byteLength === ref.byteLength) {
          stats.cacheHits++;
          return result(ref, 'cache-hit', bytes, cached.savedPath, 0, diags, null);
        }
        diags.push('cache-length-mismatch:' + bytes.byteLength);
      } catch (error) {
        diags.push('cache-read-failed:' + messageOf(error));
      }
      // 缓存条目不可用 ⇒ 摘掉它，走下载（不摘会让下次仍然命中坏条目）
      await safeCacheRemove(ref.id, diags);
    }

    // ---- ② 下载 → 校验 → 原子登记（首次 + 2 次重试）----
    const maxAttempts = 1 + retryDelays.length;
    let attempts = 0;
    let lastError: string | null = null;
    for (let i = 0; i < maxAttempts; i++) {
      attempts++;
      if (i > 0) await sleep(retryDelays[i - 1]);
      const outcome = await attemptDownload(ref, diags);
      if (outcome.ok) {
        stats.downloads++;
        return result(ref, 'downloaded', outcome.bytes, outcome.savedPath, attempts, diags, null);
      }
      lastError = outcome.error;
    }

    // ---- ③ last-known-good 回退（§6.2）----
    const lkg = cached;
    if (lkg && lkg.sha256 !== ref.sha256) {
      try {
        const bytes = await platform.readFileBytes(lkg.savedPath);
        if (bytes.byteLength === lkg.byteLength && structureOk(bytes, ref, diags)) {
          stats.staleFallbacks++;
          diags.push('stale-3d-cache');
          return result(ref, 'stale-3d-cache', bytes, lkg.savedPath, attempts, diags, null);
        }
        diags.push('stale-lkg-rejected');
      } catch (error) {
        diags.push('stale-lkg-read-failed:' + messageOf(error));
      }
    }

    stats.failures++;
    return result(ref, 'failed', null, null, attempts, diags, lastError);
  }

  /** 单次「下载 → 落临时文件 → sha 校验 → 结构门 → 原子登记」。任一步失败都先删临时文件。 */
  async function attemptDownload(
    ref: Character3DAssetRef,
    diags: string[],
  ): Promise<{ ok: true; bytes: Uint8Array; savedPath: string | null } | { ok: false; error: string }> {
    const url = joinCdnUrl(options.cdnBaseUrl, ref.urlPath);
    const tempName = ref.id + '.tmp';
    let tempPath: string | null = null;
    stats.downloadAttempts++;
    try {
      const bytes = await withTimeout(
        platform.downloadArrayBuffer(url, { timeoutMs: downloadTimeoutMs }),
        downloadTimeoutMs,
        () => { stats.timeouts++; },
      );
      if (bytes.byteLength !== ref.byteLength) {
        stats.byteLengthMismatches++;
        diags.push('byteLength-mismatch:' + bytes.byteLength + '!=' + ref.byteLength);
        throw new Error('byteLength ' + bytes.byteLength + ' != ' + ref.byteLength);
      }
      tempPath = await platform.writeTempFile(tempName, bytes);
      // 文件 SHA 校验：微信侧走 getFileInfo(digestAlgorithm='sha256')；浏览器侧对内存登记项求 digest
      const digest = await platform.sha256File(tempPath);
      const sha = digest ?? (await platform.sha256Bytes(bytes));
      if (sha !== ref.sha256) {
        stats.shaMismatches++;
        diags.push('sha256-mismatch');
        throw new Error('sha256 ' + sha + ' != ' + ref.sha256);
      }
      if (!structureOk(bytes, ref, diags)) {
        throw new Error('结构不符（' + ref.id + '）');
      }
      // 原子登记为 last-known-good（cachePut 失败不阻断本次使用，但也不留半成品路径）
      let savedPath: string | null = null;
      try {
        const entry = await platform.cachePut({
          assetId: ref.id,
          sha256: ref.sha256,
          byteLength: ref.byteLength,
          tempPath,
        });
        savedPath = entry.savedPath;
        tempPath = null; // 所有权已转移给缓存
      } catch (error) {
        stats.cacheWriteFailures++;
        diags.push('cache-write-failed:' + messageOf(error));
        // ★ 原子性收口：登记失败的临时文件必须删掉。
        //   否则每进一次战斗就在用户目录攒一份 4MB 残片（且没有索引指向它，永远不会被复用/清理）。
        if (tempPath) {
          await removeTemp(tempPath, diags);
          tempPath = null;
        }
      }
      return { ok: true, bytes, savedPath };
    } catch (error) {
      // 失败即删临时文件（§6.1「立即删临时文件，禁止带病解析」）；**绝不触碰 LKG**
      if (tempPath) await removeTemp(tempPath, diags);
      else await platform.removeFile(tempName).catch(() => undefined); // 落盘前就失败：清掉同名残留
      const msg = messageOf(error);
      // 完整性类失败（sha/长度/结构）不记网络错，便于运维区分「传输问题」与「资产不对」
      const integrity = /^sha256 |^byteLength |结构不符|timeout/i.test(msg);
      if (!integrity) stats.networkErrors++;
      diags.push('attempt-failed:' + msg);
      return { ok: false, error: msg };
    }
  }

  async function removeTemp(path: string, diags: string[]): Promise<void> {
    try {
      await platform.removeFile(path);
      stats.tempFilesRemoved++;
    } catch (error) {
      diags.push('temp-remove-failed:' + messageOf(error));
    }
  }

  function structureOk(bytes: Uint8Array, ref: Character3DAssetRef, diags: string[]): boolean {
    if (!options.structureValidator) return true;
    try {
      options.structureValidator(bytes, ref);
      return true;
    } catch (error) {
      stats.structureRejects++;
      diags.push('structure-reject:' + messageOf(error));
      return false;
    }
  }

  async function safeCacheGet(assetId: string, diags: string[]): Promise<Character3DCacheEntry | null> {
    try {
      return await platform.cacheGet(assetId);
    } catch (error) {
      diags.push('cache-get-failed:' + messageOf(error));
      return null;
    }
  }

  async function safeCacheRemove(assetId: string, diags: string[]): Promise<void> {
    try {
      await platform.cacheRemove(assetId);
    } catch (error) {
      diags.push('cache-remove-failed:' + messageOf(error));
    }
  }

  return {
    load,
    async loadMany(refs) {
      const out: CharacterAssetLoadResult[] = [];
      for (const ref of refs) out.push(await load(ref));
      return out;
    },
    async loadProfile(profile) {
      const clipResults: Partial<Record<Character3DClipKey, CharacterAssetLoadResult>> = {};
      const diagnostics: string[] = [];
      const model = await load(profile.model);
      diagnostics.push(...model.diagnostics.map((d) => 'model:' + d));
      const keys = Object.keys(profile.clips) as Character3DClipKey[];
      for (const key of keys) {
        const entry = profile.clips[key];
        if ('embedded' in entry) continue; // 内嵌在模型里，无需下载
        const res = await load(entry);
        clipResults[key] = res;
        diagnostics.push(...res.diagnostics.map((d) => key + ':' + d));
      }
      const all = [model, ...Object.values(clipResults)];
      const anyFailed = all.some((r) => r && r.status === 'failed');
      const anyStale = all.some((r) => r && r.status === 'stale-3d-cache');
      return {
        status: anyFailed ? 'failed' : anyStale ? 'stale-3d-cache' : 'ready',
        model,
        clips: clipResults,
        diagnostics,
      };
    },
    stats() {
      return { ...stats };
    },
  };
}

function result(
  ref: Character3DAssetRef,
  status: CharacterAssetLoadStatus,
  bytes: Uint8Array | null,
  savedPath: string | null,
  attempts: number,
  diagnostics: readonly string[],
  error: string | null,
): CharacterAssetLoadResult {
  return {
    assetId: ref.id,
    ref,
    status,
    bytes,
    savedPath,
    attempts,
    diagnostics: diagnostics.slice(),
    error,
  };
}

/** 超时护栏：平台 adapter 的 timeoutMs 之外再兜一层，确保「永远转圈」不可能发生。 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout();
      reject(new Error('download timeout ' + timeoutMs + 'ms'));
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
