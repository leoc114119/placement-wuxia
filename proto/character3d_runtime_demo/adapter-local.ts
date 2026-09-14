// T31-FE-C · proto/character3d_runtime_demo/adapter-local.ts —— 资源链方案选择 + 分包/本地路径 adapter
//
// 为什么需要这一层（如实背景，不美化）：
//   方案 §6.1 要求模型/动作 payload 走 CDN，`cdnBaseUrl` 由环境配置注入并进微信 downloadFile 合法域名
//   白名单。**本卡开单时真机侧没有可用的已备案 CDN 域名**（§1.3 已把「CDN 服务商选择、域名采购、
//   发布部署」划出 S1），因此：
//     · `cdn` 模式：真机若配置了 base URL（storage 键 `char3d-cdn-base`），走生产 wx adapter 的
//       `wx.downloadFile` 链路 —— 这才是线上路径；
//     · `local-subpackage` 模式（缺省）：把同一份载荷放进**微信分包**，用分包/本地路径 adapter 跑通
//       **同一条 loader 代码路径**（清单校验 → cache 命中 → 落临时文件 → SHA 校验 → 结构门 → 原子登记
//       → 解析）。**这不是 CDN 下载**，实证等级如实分级（executedBranches / notExecutedBranches）。
//
// 关键纪律：本文件**只覆盖 downloadArrayBuffer 一个原语**，其余（临时文件 / sha256File / cacheGet /
//   cachePut / cacheRemove / decodeImage）全部委托给**生产 wx adapter**（ui/character3d/platform-wx.ts）。
//   于是「下载后的校验、缓存原子性、LKG 回退」在真机上执行的是**生产代码**，不是复制品。

import { createWxCharacter3DPlatform } from '../../ui/character3d/platform-wx';
import type {
  Character3DCacheEntry,
  Character3DCachePutInput,
  Character3DDownloadOptions,
  Character3DPlatform,
  PlatformDecodedImage,
  PlatformOffscreenCanvas,
} from '../../ui/character3d/platform';

/** 本地模式注入给 loader 的 cdnBaseUrl：协议段是**哨兵**，adapter 收到后按分包路径解析。 */
export const LOCAL_BASE_URL = 'code-package://char3d-assets';
/** game.json 的 subpackages[0].name。 */
export const SUBPACKAGE_NAME = 'char3d-assets';
/** 分包在**代码包根**下的相对目录（wx readFile 的路径口径，与 S0 probe 一致）。 */
export const SUBPACKAGE_ROOT = 'subpackages/char3d-assets';

export type ResourceChainMode = 'local-subpackage' | 'cdn';

export interface ResourceChainPlan {
  mode: ResourceChainMode;
  cdnBaseUrl: string;
  /** 真机实际会执行到的分支（逐条如实列） */
  executedBranches: string[];
  /** **不会**执行到的分支（例如 wx.downloadFile HTTP 链路与合法域名白名单） */
  notExecutedBranches: string[];
  note: string;
}

const LOCAL_EXECUTED = [
  '清单/profile 校验（assertValidAssetRef + validateCharacter3DProfile 口径）',
  'cache by SHA 命中判定（wx storage 索引 + USER_DATA_PATH 文件存在性）',
  '未命中 → 读分包资产 → 写临时文件（USER_DATA_PATH/character3d/tmp-*）',
  'SHA-256 校验（FileSystemManager.getFileInfo digestAlgorithm=sha256）',
  'byteLength 校验 + GLB 结构门（41 骨 / 1 primitive / 贴图数）',
  '原子登记 LKG（rename/copy + storage 索引落盘，失败回滚）',
  'LKG 回退分支（stale-3d-cache，SHA 不符时不覆盖 LKG）',
  'GLB/动作 json 解析 + 贴图解码（wx.createImage）+ 首传 GPU',
  '热启动 cache-hit 链（第二次运行走索引命中，不重读分包资产）',
];
const LOCAL_NOT_EXECUTED = [
  'wx.downloadFile HTTP 下载（含 statusCode 处理与 timeoutMs 取消）',
  '微信 downloadFile 合法域名白名单校验',
  'CDN 内容版本化目录在服务端的真实 404/回源行为',
  '真实网络失败/断网/超时下的重试间隔（1s/3s）与网络错误分类',
];
const CDN_EXECUTED = [
  'wx.downloadFile HTTP 下载（statusCode / timeout / abort）',
  '清单校验 + cache by SHA + 临时文件 + SHA-256 + 结构门 + 原子登记 + LKG',
  '重试恰 2 次（1s/3s）与网络错误分类',
];
const CDN_NOT_EXECUTED = [
  '合法域名白名单是否已备案（需宿主侧配置，代码不可见）',
  'CDN 服务端内容版本化与回源策略（部署侧）',
];

/** 选模式：只有拿到像样的 base URL（http/https）才走 CDN；否则如实走分包本地路径。 */
export function resolveResourceChainPlan(input: { cdnBaseUrl?: string | null }): ResourceChainPlan {
  const raw = (input.cdnBaseUrl ?? '').trim();
  const isHttp = /^https?:\/\/[^\s]+$/.test(raw);
  if (isHttp) {
    return {
      mode: 'cdn',
      cdnBaseUrl: raw.replace(/\/+$/, ''),
      executedBranches: CDN_EXECUTED.slice(),
      notExecutedBranches: CDN_NOT_EXECUTED.slice(),
      note: 'CDN 模式：走生产 wx adapter 的 wx.downloadFile 链路（需该域名已在微信后台配置 downloadFile 合法域名）',
    };
  }
  return {
    mode: 'local-subpackage',
    cdnBaseUrl: LOCAL_BASE_URL,
    executedBranches: LOCAL_EXECUTED.slice(),
    notExecutedBranches: LOCAL_NOT_EXECUTED.slice(),
    note:
      raw.length > 0
        ? '提供的 cdnBaseUrl 不是 http(s) 绝对地址 ⇒ 拒用并退回分包本地路径模式（不伪造下载）'
        : '未配置 cdnBaseUrl ⇒ 分包本地路径模式：同一条 loader 状态机，但「下载」一步读的是分包资产',
  };
}

/** wx.readFile 的代码包路径候选（S0 probe 实测口径：先相对路径，再带前导斜杠）。 */
export function codePackageCandidates(relativePath: string, root = SUBPACKAGE_ROOT): string[] {
  return [root + '/' + relativePath, '/' + root + '/' + relativePath];
}

/** 分包路径去掉哨兵 base 后的相对路径。 */
export function stripLocalBase(url: string): string | null {
  const prefix = LOCAL_BASE_URL + '/';
  if (!url.startsWith(prefix)) return null;
  const rel = url.slice(prefix.length);
  return rel.length > 0 ? rel : null;
}

type WxRuntimeArg = NonNullable<NonNullable<Parameters<typeof createWxCharacter3DPlatform>[0]>['runtime']>;

export interface LocalSubpackagePlatformOptions {
  runtime?: WxRuntimeArg;
  logSink?: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => void;
  /** 覆盖分包代码包根（测试注入用）；缺省 = SUBPACKAGE_ROOT */
  root?: string;
}

export interface LocalSubpackagePlatform extends Character3DPlatform {
  /** 实际命中的代码包路径（证据用：证明「读的哪个文件」） */
  readonly resolvedCodePaths: Readonly<Record<string, string>>;
}

/**
 * 分包/本地路径 adapter：只覆盖 `downloadArrayBuffer`，其余原语**全部委托生产 wx adapter**。
 * 显式逐方法委托（不用对象展开）：后续给 wx adapter 加方法/访问器时，这里会**编译期**暴露缺口，
 * 而不是静默地把旧值快照下来。
 */
export function createLocalSubpackagePlatform(options: LocalSubpackagePlatformOptions = {}): LocalSubpackagePlatform {
  const inner = createWxCharacter3DPlatform({ runtime: options.runtime, logSink: options.logSink });
  const host = options.runtime ?? resolveRuntime();
  const root = options.root ?? SUBPACKAGE_ROOT;
  const resolvedCodePaths: Record<string, string> = {};

  function readCodeFile(relativePath: string, downloadOptions?: Character3DDownloadOptions): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      if (downloadOptions?.signal?.aborted) {
        reject(new Error('[local-subpackage] 读取被取消: ' + relativePath));
        return;
      }
      const fs = host.getFileSystemManager();
      const candidates = codePackageCandidates(relativePath, root);
      let i = 0;
      const tryNext = (): void => {
        if (i >= candidates.length) {
          reject(new Error('[local-subpackage] 分包资产不存在（候选全失败）: ' + candidates.join(' | ')));
          return;
        }
        const path = candidates[i++];
        try {
          fs.readFile({
            filePath: path,
            success: (res) => {
              const data = res.data;
              if (!(data instanceof ArrayBuffer)) {
                reject(new Error('[local-subpackage] 读分包文件未返回二进制: ' + path));
                return;
              }
              resolvedCodePaths[relativePath] = path;
              resolve(new Uint8Array(data));
            },
            fail: () => tryNext(),
          });
        } catch (error) {
          reject(new Error('[local-subpackage] readFile 抛错 ' + path + ': ' + String(error)));
        }
      };
      tryNext();
    });
  }

  return {
    kind: 'wx-local-subpackage',
    resolvedCodePaths,
    createOffscreenCanvas(width: number, height: number): PlatformOffscreenCanvas {
      return inner.createOffscreenCanvas(width, height);
    },
    downloadArrayBuffer(url: string, downloadOptions: Character3DDownloadOptions): Promise<Uint8Array> {
      const rel = stripLocalBase(url);
      if (rel === null) {
        // 哨兵 base 之外的 URL 一律拒收：本地模式不做任何真实网络请求（不给「假下载」留口子）
        return Promise.reject(new Error('[local-subpackage] 非本地资产 URL，本地 adapter 拒绝: ' + url));
      }
      return readCodeFile(rel, downloadOptions);
    },
    sha256File(path: string): Promise<string | null> {
      return inner.sha256File(path);
    },
    sha256Bytes(bytes: Uint8Array): Promise<string> {
      return inner.sha256Bytes(bytes);
    },
    cacheGet(assetId: string): Promise<Character3DCacheEntry | null> {
      return inner.cacheGet(assetId);
    },
    cachePut(input: Character3DCachePutInput): Promise<Character3DCacheEntry> {
      return inner.cachePut(input);
    },
    cacheRemove(assetId: string): Promise<void> {
      return inner.cacheRemove(assetId);
    },
    writeTempFile(name: string, bytes: Uint8Array): Promise<string> {
      return inner.writeTempFile(name, bytes);
    },
    readFileBytes(path: string): Promise<Uint8Array> {
      return inner.readFileBytes(path);
    },
    removeFile(path: string): Promise<void> {
      return inner.removeFile(path);
    },
    decodeImage(bytes: Uint8Array, mimeType: string, name: string): Promise<PlatformDecodedImage> {
      return inner.decodeImage(bytes, mimeType, name);
    },
    now(): number {
      return inner.now();
    },
    log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
      inner.log(level, message, data);
    },
  };
}

/** 解析宿主 wx 全局（与 platform-wx 同口径；Adapter 层允许触 wx.*）。 */
function resolveRuntime(): WxRuntimeArg {
  const fromGlobal = (globalThis as unknown as { wx?: WxRuntimeArg }).wx;
  if (fromGlobal && fromGlobal.env && typeof fromGlobal.downloadFile === 'function') return fromGlobal;
  if (typeof wx !== 'undefined') {
    const declared = wx as unknown as WxRuntimeArg;
    if (declared && typeof declared.downloadFile === 'function') return declared;
  }
  throw new Error('[adapter-local] 无 wx 全局：不是微信小游戏宿主');
}

/** 造平台：cdn 模式走生产 adapter；local 模式走分包 adapter。 */
export function createResourcePlatform(plan: ResourceChainPlan, options: LocalSubpackagePlatformOptions = {}): Character3DPlatform {
  if (plan.mode === 'cdn') {
    return createWxCharacter3DPlatform({ runtime: options.runtime, logSink: options.logSink });
  }
  return createLocalSubpackagePlatform(options);
}
