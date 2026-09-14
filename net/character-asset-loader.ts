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
//
// ★【T31-FE-C P0-4】包内**文本资产**的完整性口径（本卡适配，理由如下）：
//   真机实测（HONOR PTP-AN20 / SDK 3.17.3）出现 `idle:byteLength-mismatch:685411!=726299`：
//   仓库/导入目录/CDN 镜像里的 idle_v4.json 均为 726299 字节，纯压缩 693640、非 ASCII 0 字符
//   ⇒ 设备读回的**内容本身**与仓库不同（平台改写或读取/落盘截断），机制未定。
//   为此增加 `textIntegrityMode: 'structural'`：**仅对 `mediaType==='application/json'`** 且由
//   `textStructureValidator` 把关时，用「结构不变量」替代严格字节相等放行，并如实记录
//   observedByteLength / observedSha256 / head·tail hex / readSource 供定位。
//   **二进制（GLB）与 CDN 下载路径一律保持严格 byteLength+SHA 不变**——模型字节可比，且是安全边界。
//   结构性放行只影响「要不要用这份字节」，**不降低**后续结构门（41 骨/1 primitive）与失败关闭语义。
//
// ★【T31-FE-C P0-5】缓存索引的自洽基准 = **盘上真实文件**，不是清单：
//   病灶：结构性放行的资产曾按**清单值**登记索引 ⇒ 下次启动「盘上文件长度 ≠ 索引长度」⇒ 索引被摘除重读
//   ⇒ `cacheHits` 永远 0、热缓存序列无法推进（真机实测「冷 3/3 后热缓存恒 0/3」）。
//   修法：structural 资产的 `cachePut` 记 **observedByteLength / observedSha256**（盘上事实），
//   命中判定改为「索引命中 且 盘上文件与**索引**一致」——**不以「与清单相等」为条件**；清单值仅用于
//   结构校验与资产身份判断。strict（GLB / CDN）路径口径不变。
//   旧索引（上一版按清单值写的）在本次启动会因长度不符被摘掉一次，随后按新口径重建（自愈，仅多读一次）。

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
  /** 完整性观测（诊断主载体；成功与失败都有，拿不到 = null） */
  readonly integrity: CharacterAssetIntegrity | null;
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

/**
 * 单次资产装载的**完整性观测**（诊断主载体；P0-4 要求「一次运行就能判定被平台改写还是读取截断」）。
 * 失败时同样产出（这是最需要它的时候）。
 */
export interface CharacterAssetIntegrity {
  /** 观测来源：download = 本次下载/读包；cache-hit = 索引命中；stale-lkg = LKG 回退 */
  source: 'download' | 'cache-hit' | 'stale-lkg';
  /** strict = 严格 byteLength+SHA；structural = 结构校验替代字节相等（仅包内文本资产） */
  mode: 'strict' | 'structural';
  byteLengthMatches: boolean;
  sha256Matches: boolean;
  observedByteLength: number;
  /** 观测 SHA-256（cache-hit 时取自索引，其余为本次实算/平台摘要；不可得 = null 并写 note） */
  observedSha256: string | null;
  expectedByteLength: number;
  expectedSha256: string;
  /** 读回来的字节从哪来（适配器提供；拿不到 = 'unknown'） */
  readSource: string;
  /** 首 64 字节 hex（含长度不足时的实际长度）——平台改写 vs 读取截断的第一判据 */
  headHex64: string;
  /** 末 64 字节 hex —— 与 head 合看可判「前缀截断 / 中段丢失 / 整体重排」 */
  tailHex64: string;
  /** structural 模式的文本结构校验结论（strict 模式 = null） */
  structuralOk: boolean | null;
  /** structural 模式的结构校验明细（失败时是原因清单；成功时是实测到的结构账） */
  structuralDetail: string[];
  /** 放行/拒绝时的口径说明（structural 放行必带「平台改写导致字节不可比」） */
  note: string;
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
  /**
   * 包内**文本资产**的完整性口径（P0-4）：
   * · `'strict'`（缺省）：byteLength + SHA-256 严格相等——CDN 下载路径与既有行为不变；
   * · `'structural'`：**仅对 `mediaType==='application/json'`** 生效，改用 `textStructureValidator`
   *   的结构不变量放行（平台改写导致字节不可比时仍能继续跑），并如实记录观测值。
   * 二进制（GLB）**永远**走 strict，不受本选项影响。
   */
  textIntegrityMode?: 'strict' | 'structural';
  /** 文本结构校验：返回 `{ errors, summary }`。空 errors = 通过；`summary` 是**实测结构账**
   *（fps/nFrames/时长/骨轨道数…），无条件记进 `integrity.structuralDetail` —— 诊断要求的
   *「一次运行就能看出设备读回的是哪种规格」靠它。
   * **失败关闭**：errors 非空即拒收该文件、不覆盖 LKG。 */
  textStructureValidator?: (bytes: Uint8Array, ref: Character3DAssetRef) =>
    | { errors: string[]; summary?: string }
    | string[];
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

  /** 索引里的文本内容结构校验不过 ⇒ 摘掉该条目后按「无缓存」重走一遍（只重走一次，不递归）。 */
  async function loadOnceAfterBadCache(ref: Character3DAssetRef, diags: string[]): Promise<CharacterAssetLoadResult> {
    const rest = await loadOnceBody(ref, diags, true);
    return rest;
  }

  async function loadOnce(ref: Character3DAssetRef): Promise<CharacterAssetLoadResult> {
    return loadOnceBody(ref, [], false);
  }

  async function loadOnceBody(
    ref: Character3DAssetRef,
    diagsIn: string[],
    cacheAlreadyRemoved: boolean,
  ): Promise<CharacterAssetLoadResult> {
    const diags: string[] = diagsIn;
    const cached = cacheAlreadyRemoved ? null : await safeCacheGet(ref.id, diags);

    // ---- ① cache 命中（§6.1；P0-5 口径见文件头）----
    //   structural：索引即「盘上事实」⇒ 只要索引在且盘上文件与索引一致就算命中（与清单是否相等无关）；
    //   strict（GLB / CDN）：索引里恒是清单值 ⇒ 沿用原判据（索引=清单 且 盘上长度一致），行为逐字不变。
    const cacheStructural = policyModeOf(ref) === 'structural';
    const cachedForManifest = cached !== null &&
      (cacheStructural || (cached.sha256 === ref.sha256 && cached.byteLength === ref.byteLength));
    if (cached && cachedForManifest) {
      try {
        const bytes = await platform.readFileBytes(cached.savedPath);
        if (bytes.byteLength === cached.byteLength) {
          // structural 命中还要过结构校验（盘上内容不可全信：坏内容不许被当成热命中）
          let cacheStructuralOk: boolean | null = null;
          const cacheStructuralDetail: string[] = [
            '索引命中：盘上文件长度 = 索引长度 ' + cached.byteLength + '（索引=盘上事实' +
              (cacheStructural && cached.byteLength !== ref.byteLength ? '；与清单 ' + ref.byteLength + ' 不符，属平台改写' : '') + '）',
          ];
          if (cacheStructural) {
            const verdict = options.textStructureValidator
              ? options.textStructureValidator(bytes, ref)
              : { errors: ['缺少 textStructureValidator：结构性命中必须由结构校验把关'] };
            const errs = Array.isArray(verdict) ? verdict : verdict.errors;
            if (!Array.isArray(verdict) && verdict.summary) cacheStructuralDetail.push(verdict.summary);
            cacheStructuralOk = errs.length === 0;
            cacheStructuralDetail.push(...errs);
            if (!cacheStructuralOk) {
              stats.structureRejects++;
              diags.push('cache-text-structure-reject:' + errs[0]);
              await safeCacheRemove(ref.id, diags);
              return loadOnceAfterBadCache(ref, diags);
            }
          }
          stats.cacheHits++;
          const edges = hexEdges(bytes);
          return result(ref, 'cache-hit', bytes, cached.savedPath, 0, diags, null, {
            source: 'cache-hit', mode: policyModeOf(ref),
            byteLengthMatches: cached.byteLength === ref.byteLength,
            sha256Matches: cached.sha256 === ref.sha256,
            observedByteLength: bytes.byteLength, observedSha256: cached.sha256,
            expectedByteLength: ref.byteLength, expectedSha256: ref.sha256,
            readSource: readSourceOf(), headHex64: edges.head, tailHex64: edges.tail,
            structuralOk: cacheStructuralOk, structuralDetail: cacheStructuralDetail,
            note: cacheStructural && cached.byteLength !== ref.byteLength
              ? '热命中（索引=盘上事实：observed ' + cached.byteLength + ' ≠ 清单 ' + ref.byteLength +
                '，平台改写导致字节不可比；清单值只用于结构校验与身份判断）'
              : '',
          });
        }
        diags.push('cache-length-mismatch:' + bytes.byteLength + '!=index ' + cached.byteLength);
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
    let lastIntegrity: CharacterAssetIntegrity | null = null;
    for (let i = 0; i < maxAttempts; i++) {
      attempts++;
      if (i > 0) await sleep(retryDelays[i - 1]);
      const outcome = await attemptDownload(ref, diags);
      lastIntegrity = outcome.integrity;
      if (outcome.ok) {
        stats.downloads++;
        return result(ref, 'downloaded', outcome.bytes, outcome.savedPath, attempts, diags, null, outcome.integrity);
      }
      lastError = outcome.error;
    }

    // ---- ③ last-known-good 回退（§6.2）----
    const lkg = cached;
    if (lkg && lkg.sha256 !== ref.sha256) {
      try {
        const bytes = await platform.readFileBytes(lkg.savedPath);
        const lkgTextOk = !cacheStructural
          ? true
          : ((): boolean => {
              const verdict = options.textStructureValidator
                ? options.textStructureValidator(bytes, ref)
                : { errors: ['缺少 textStructureValidator'] };
              const errs = Array.isArray(verdict) ? verdict : verdict.errors;
              if (errs.length) diags.push('stale-lkg-text-reject:' + errs[0]);
              return errs.length === 0;
            })();
        if (bytes.byteLength === lkg.byteLength && lkgTextOk && structureOk(bytes, ref, diags)) {
          stats.staleFallbacks++;
          diags.push('stale-3d-cache');
          const edges = hexEdges(bytes);
          return result(ref, 'stale-3d-cache', bytes, lkg.savedPath, attempts, diags, null, {
            source: 'stale-lkg', mode: policyModeOf(ref), byteLengthMatches: true, sha256Matches: false,
            observedByteLength: bytes.byteLength, observedSha256: lkg.sha256,
            expectedByteLength: ref.byteLength, expectedSha256: ref.sha256,
            readSource: readSourceOf(), headHex64: edges.head, tailHex64: edges.tail,
            structuralOk: null,
            structuralDetail: ['LKG 回退：用的是上一版已登记内容（sha=' + lkg.sha256.slice(0, 12) + '…），与本次清单不符'],
            note: 'stale-3d-cache：网络/资产失败时回退到 LKG（不切 2D 帧）',
          });
        }
        diags.push('stale-lkg-rejected');
      } catch (error) {
        diags.push('stale-lkg-read-failed:' + messageOf(error));
      }
    }

    stats.failures++;
    return result(ref, 'failed', null, null, attempts, diags, lastError, lastIntegrity);
  }

  /** 该资产在本轮配置下的完整性口径（缓存命中/LKG 行也要如实标注是哪种口径）。 */
  function policyModeOf(ref: Character3DAssetRef): 'strict' | 'structural' {
    return options.textIntegrityMode === 'structural' && ref.mediaType === 'application/json' ? 'structural' : 'strict';
  }

  /** 读回来的字节从哪来（适配器可选实现；拿不到 = 'unknown'）。 */
  function readSourceOf(): string {
    const p = platform as unknown as { lastReadSource?: () => string };
    try {
      const v = typeof p.lastReadSource === 'function' ? p.lastReadSource() : '';
      return v && v.length ? v : 'unknown';
    } catch { return 'unknown'; }
  }

  /** 头/尾 64 字节 hex（平台改写 vs 读取截断的核心判据）。 */
  function hexEdges(bytes: Uint8Array): { head: string; tail: string } {
    const n = 64;
    const head = Array.from(bytes.subarray(0, Math.min(n, bytes.byteLength))).map((b) => b.toString(16).padStart(2, '0')).join('');
    const tail = Array.from(bytes.subarray(Math.max(0, bytes.byteLength - n))).map((b) => b.toString(16).padStart(2, '0')).join('');
    return { head, tail };
  }

  /** 单次「下载 → 落临时文件 → 观测 → (strict 校验 | structural 结构门) → structure 门 → 原子登记」。
   *  任一步失败都先删临时文件。
   *  ★ P0-4：严格模式的**判定顺序、计数口径与诊断文本**与既有实现逐字一致（只是把 SHA 观测提前，
   *    使它失败时也能进诊断），结构放行仅对包内文本资产生效。 */
  async function attemptDownload(
    ref: Character3DAssetRef,
    diags: string[],
  ): Promise<
    | { ok: true; bytes: Uint8Array; savedPath: string | null; integrity: CharacterAssetIntegrity }
    | { ok: false; error: string; integrity: CharacterAssetIntegrity }
  > {
    const url = joinCdnUrl(options.cdnBaseUrl, ref.urlPath);
    const tempName = ref.id + '.tmp';
    let tempPath: string | null = null;
    stats.downloadAttempts++;
    let bytes: Uint8Array | null = null;
    let observedSha: string | null = null;
    let digestError: unknown = null;
    let readSource = 'unknown';
    let structuralMode = false;
    let structuralOk: boolean | null = null;
    const structuralDetail: string[] = [];
    let note = '';
    try {
      bytes = await withTimeout(
        platform.downloadArrayBuffer(url, { timeoutMs: downloadTimeoutMs }),
        downloadTimeoutMs,
        () => { stats.timeouts++; },
      );
      readSource = readSourceOf();
      tempPath = await platform.writeTempFile(tempName, bytes);
      // SHA 观测：**先记后判**（失败时也要有 observedSha256 供定位）。文件 SHA 走
      // getFileInfo(digestAlgorithm='sha256')；不可用时退回对内存字节求摘要。
      try {
        const digest = await platform.sha256File(tempPath);
        observedSha = digest ?? (await platform.sha256Bytes(bytes));
      } catch (error) {
        digestError = error; // 老行为：摘要不可用 ⇒ 严格模式失败关闭（下面按原顺序抛出）
      }
      const byteLengthMatches = bytes.byteLength === ref.byteLength;
      const sha256Matches = observedSha !== null && observedSha === ref.sha256;
      structuralMode = policyModeOf(ref) === 'structural';

      if (structuralMode) {
        // 包内文本资产：平台改写导致字节不可比 ⇒ 用结构不变量放行（失败关闭）
        const verdict = options.textStructureValidator
          ? options.textStructureValidator(bytes, ref)
          : { errors: ['缺少 textStructureValidator：结构性放行必须由结构校验把关'] };
        const errs = Array.isArray(verdict) ? verdict : verdict.errors;
        if (!Array.isArray(verdict) && verdict.summary) structuralDetail.push(verdict.summary);
        structuralOk = errs.length === 0;
        structuralDetail.push(...errs);
        if (!structuralOk) {
          stats.structureRejects++;
          diags.push('text-structure-reject:' + errs[0]);
          throw new Error('文本结构不符（' + ref.id + '）: ' + errs.join(' | '));
        }
        structuralDetail.push(
          'observedByteLength=' + bytes.byteLength + ' expected=' + ref.byteLength +
            (byteLengthMatches ? '（相等）' : '（不等 ⇒ 平台改写导致字节不可比）'),
        );
        note = '平台改写导致字节不可比：按结构不变量放行（integrityMode=structural）';
      } else {
        // ★ 严格路径（GLB 与 CDN 下载一律走这里）：判定顺序与计数与既有实现逐字一致
        if (!byteLengthMatches) {
          stats.byteLengthMismatches++;
          diags.push('byteLength-mismatch:' + bytes.byteLength + '!=' + ref.byteLength);
          throw new Error('byteLength ' + bytes.byteLength + ' != ' + ref.byteLength);
        }
        if (digestError !== null) throw digestError;
        if (!sha256Matches) {
          stats.shaMismatches++;
          diags.push('sha256-mismatch');
          throw new Error('sha256 ' + String(observedSha) + ' != ' + ref.sha256);
        }
      }
      if (!structureOk(bytes, ref, diags)) {
        throw new Error('结构不符（' + ref.id + '）');
      }
      // 原子登记为 last-known-good（cachePut 失败不阻断本次使用，但也不留半成品路径）
      // ★ P0-5：structural 资产按**盘上事实**登记（observedLength/SHA）；清单值只用于结构校验与身份判断。
      //   strict 路径登记值不变（= 清单值）——行为与既有实现一致。
      let savedPath: string | null = null;
      try {
        const entry = await platform.cachePut({
          assetId: ref.id,
          sha256: structuralMode && observedSha !== null ? observedSha : ref.sha256,
          byteLength: structuralMode ? bytes.byteLength : ref.byteLength,
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
      return { ok: true, bytes, savedPath, integrity: makeIntegrity() };
    } catch (error) {
      // 失败即删临时文件（§6.1「立即删临时文件，禁止带病解析」）；**绝不触碰 LKG**
      if (tempPath) await removeTemp(tempPath, diags);
      else await platform.removeFile(tempName).catch(() => undefined); // 落盘前就失败：清掉同名残留
      const msg = messageOf(error);
      // 完整性类失败（sha/长度/结构）不记网络错，便于运维区分「传输问题」与「资产不对」
      const integrity = /^sha256 |^byteLength |结构不符|timeout/i.test(msg);
      if (!integrity) stats.networkErrors++;
      diags.push('attempt-failed:' + msg);
      return { ok: false, error: msg, integrity: makeIntegrity(msg) };
    }

    function makeIntegrity(failure?: string): CharacterAssetIntegrity {
      const edges = bytes ? hexEdges(bytes) : { head: '', tail: '' };
      const observedLen = bytes ? bytes.byteLength : -1;
      const detail = structuralDetail.slice();
      if (digestError !== null) detail.push('sha 摘要不可用：' + messageOf(digestError));
      if (failure) detail.push('失败原因：' + failure);
      return {
        source: 'download',
        mode: structuralMode ? 'structural' : 'strict',
        byteLengthMatches: observedLen === ref.byteLength,
        sha256Matches: observedSha !== null && observedSha === ref.sha256,
        observedByteLength: observedLen,
        observedSha256: observedSha,
        expectedByteLength: ref.byteLength,
        expectedSha256: ref.sha256,
        readSource,
        headHex64: edges.head,
        tailHex64: edges.tail,
        structuralOk,
        structuralDetail: detail,
        note: note || (failure ? '' : ''),
      };
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
  integrity: CharacterAssetIntegrity | null = null,
): CharacterAssetLoadResult {
  return {
    assetId: ref.id,
    ref,
    status,
    integrity,
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
