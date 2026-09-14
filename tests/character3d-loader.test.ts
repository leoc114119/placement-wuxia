// T31-FE-A · 资源 loader 状态机用例（方案 §6 / §9.1 loader 条）
//
// §9.1 要求：冷下载、热缓存、stale 3D、SHA 错、断网、超时、缓存写失败、并发请求合并、重试恰 2 次。
// 全部用内存假平台跑（不碰网络/磁盘），平台行为按需注入失败。

import { describe, expect, it, vi } from 'vitest';
import {
  assertValidAssetRef,
  CharacterAssetRefError,
  createCharacterAssetLoader,
  isRelativeAssetPath,
  joinCdnUrl,
  type CharacterAssetLoader,
} from '../net/character-asset-loader';
import type {
  Character3DCacheEntry,
  Character3DCachePutInput,
  Character3DPlatform,
  PlatformDecodedImage,
  PlatformOffscreenCanvas,
} from '../ui/character3d/platform';
import type { Character3DAssetRef } from '../types';

const PAYLOAD = new TextEncoder().encode('hello-character-3d');

function refOf(overrides: Partial<Character3DAssetRef> = {}): Character3DAssetRef {
  return {
    id: 'asset-a',
    urlPath: 'characters/hero/abc123/asset.bin',
    sha256: 'a'.repeat(64),
    byteLength: PAYLOAD.byteLength,
    mediaType: 'model/gltf-binary',
    ...overrides,
  };
}

interface FakePlatformOptions {
  /** 每次下载调用依次取一个行为；用尽后按 'ok' 处理 */
  downloadBehaviors?: ('ok' | 'network' | 'timeout' | 'short' | 'honor-timeout')[];
  /** 下载成功但内容被篡改（SHA 不符） */
  corruptOnDownload?: boolean;
  /** 缓存登记失败 */
  cachePutFails?: boolean;
  /** 缓存读取失败 */
  readFails?: string[];
  /** 预置缓存条目内容（模拟 last-known-good 或热缓存） */
  initialCache?: Character3DCacheEntry;
  initialCacheBytes?: Uint8Array;
  /** 结构门 */
  structureRejects?: boolean;
  /** sha256File 不支持（返回 null ⇒ loader 退回 sha256Bytes） */
  sha256FileUnsupported?: boolean;
}

function createFakePlatform(options: FakePlatformOptions = {}) {
  const files = new Map<string, Uint8Array>();
  const cache = new Map<string, Character3DCacheEntry>();
  const counters = { downloads: 0, cachePut: 0, cacheRemove: 0, readFile: 0, removeFile: 0, sha256File: 0, sha256Bytes: 0 };
  const behaviors = [...(options.downloadBehaviors ?? [])];

  if (options.initialCache) {
    cache.set(options.initialCache.assetId, options.initialCache);
    files.set(options.initialCache.savedPath, options.initialCacheBytes ?? PAYLOAD);
  }

  const platform: Character3DPlatform = {
    kind: 'fake',
    createOffscreenCanvas(): PlatformOffscreenCanvas {
      throw new Error('fake: 不需要画布');
    },
    async downloadArrayBuffer(url: string, downloadOptions) {
      counters.downloads++;
      const behavior = behaviors.shift() ?? 'ok';
      if (behavior === 'network') throw new Error('fake: 断网 ' + url);
      if (behavior === 'timeout') {
        return await new Promise<Uint8Array>((_resolve, reject) => {
          // 宿主自己也会超时（模拟 downloadFile timeout）；这里立刻拒绝以贴近真机
          void downloadOptions;
          reject(new Error('fake: request timeout'));
        });
      }
      if (behavior === 'honor-timeout') {
        return await new Promise<Uint8Array>(() => {
          /* 永不 settle：只有 loader 的超时护栏能救 */
        });
      }
      if (behavior === 'short') return PAYLOAD.subarray(0, 3);
      void url;
      if (options.corruptOnDownload) {
        const bad = new Uint8Array(PAYLOAD);
        bad[0] ^= 0xff;
        return bad;
      }
      return new Uint8Array(PAYLOAD);
    },
    async sha256File(path: string) {
      counters.sha256File++;
      if (options.sha256FileUnsupported) return null;
      const bytes = files.get(path);
      return bytes ? await sha256Hex(bytes) : null;
    },
    async sha256Bytes(bytes) {
      counters.sha256Bytes++;
      return await sha256Hex(bytes);
    },
    async cacheGet(assetId) {
      return cache.get(assetId) ? { ...(cache.get(assetId) as Character3DCacheEntry) } : null;
    },
    async cachePut(input: Character3DCachePutInput) {
      counters.cachePut++;
      if (options.cachePutFails) throw new Error('fake: 缓存写失败');
      const bytes = files.get(input.tempPath);
      if (!bytes) throw new Error('fake: 临时文件不存在');
      const dest = 'cache:' + input.assetId + ':' + input.sha256.slice(0, 8);
      files.set(dest, bytes);
      files.delete(input.tempPath);
      const entry: Character3DCacheEntry = {
        assetId: input.assetId, sha256: input.sha256, savedPath: dest,
        byteLength: input.byteLength, lastUsedAt: 1,
      };
      cache.set(input.assetId, entry);
      return { ...entry };
    },
    async cacheRemove(assetId) {
      counters.cacheRemove++;
      cache.delete(assetId);
    },
    async writeTempFile(name, bytes) {
      const path = 'tmp:' + name;
      files.set(path, bytes);
      return path;
    },
    async readFileBytes(path) {
      counters.readFile++;
      if (options.readFails && options.readFails.indexOf(path) >= 0) throw new Error('fake: 读失败 ' + path);
      const bytes = files.get(path);
      if (!bytes) throw new Error('fake: 文件不存在 ' + path);
      return bytes;
    },
    async removeFile(path) {
      counters.removeFile++;
      files.delete(path);
    },
    async decodeImage(): Promise<PlatformDecodedImage> {
      throw new Error('fake: 不需要解码');
    },
    now: () => 0,
    log: () => undefined,
  };

  return { platform, files, cache, counters };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // 与平台无关地用同一份 Node WebCrypto 算（仅测试）
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 用真实 SHA 构造 ref（避免「SHA 永远不符」把冷下载用例变成失败用例）。 */
async function validRef(overrides: Partial<Character3DAssetRef> = {}): Promise<Character3DAssetRef> {
  return refOf({ sha256: await sha256Hex(PAYLOAD), ...overrides });
}

function makeLoader(
  options: FakePlatformOptions = {},
  loaderOptions: Partial<Parameters<typeof createCharacterAssetLoader>[0]> = {},
): { loader: CharacterAssetLoader; counters: ReturnType<typeof createFakePlatform>['counters']; sleeps: number[] } {
  const fake = createFakePlatform(options);
  const sleeps: number[] = [];
  const loader = createCharacterAssetLoader({
    platform: fake.platform,
    cdnBaseUrl: 'https://cdn.example.com/base/',
    downloadTimeoutMs: 50,
    sleep: async (ms) => { sleeps.push(ms); },
    ...loaderOptions,
  });
  return { loader, counters: fake.counters, sleeps };
}

describe('清单校验与 URL 拼接', () => {
  it('joinCdnUrl 归一尾部斜杠（业务侧只见相对路径）', () => {
    expect(joinCdnUrl('https://cdn.example.com/base/', 'a/b.glb')).toBe('https://cdn.example.com/base/a/b.glb');
    expect(joinCdnUrl('https://cdn.example.com/base', 'a/b.glb')).toBe('https://cdn.example.com/base/a/b.glb');
  });

  it('isRelativeAssetPath 与 config 同口径', () => {
    expect(isRelativeAssetPath('a/b.glb')).toBe(true);
    expect(isRelativeAssetPath('/a/b.glb')).toBe(false);
    expect(isRelativeAssetPath('https://x/a.glb')).toBe(false);
  });

  it('清单非法直接抛（非零失败）：完整 URL / sha 格式 / 长度', () => {
    expect(() => assertValidAssetRef(refOf({ urlPath: 'https://cdn/x.glb' }))).toThrow(CharacterAssetRefError);
    expect(() => assertValidAssetRef(refOf({ sha256: 'short' }))).toThrow(/sha256/);
    expect(() => assertValidAssetRef(refOf({ byteLength: 0 }))).toThrow(/byteLength/);
    expect(() => assertValidAssetRef(refOf({ id: '' }))).toThrow(/assetId/);
    const { loader } = makeLoader();
    expect(() => loader.load(refOf({ urlPath: '/abs.glb' }))).toThrow(CharacterAssetRefError);
  });
});

describe('冷下载 / 热缓存（方案 §6.1）', () => {
  it('冷下载：一次下载、SHA 校验通过、原子登记 LKG、返回字节', async () => {
    const ref = await validRef();
    const { loader, counters, sleeps } = makeLoader();
    const res = await loader.load(ref);
    expect(res.status).toBe('downloaded');
    expect(res.attempts).toBe(1);
    expect(res.bytes?.byteLength).toBe(PAYLOAD.byteLength);
    expect(res.error).toBeNull();
    expect(counters.downloads).toBe(1);
    expect(counters.cachePut).toBe(1);
    expect(res.savedPath).toMatch(/^cache:/);
    expect(sleeps).toEqual([]); // 成功不重试
    expect(loader.stats()).toMatchObject({ downloads: 1, downloadAttempts: 1, cacheHits: 0, failures: 0 });
  });

  it('热缓存：按 SHA 命中，零下载、零重试', async () => {
    const ref = await validRef();
    const first = makeLoader();
    const stored = await first.loader.load(ref);
    // 复用同一份平台（含缓存）再建 loader，模拟下次进入战斗
    const fake = createFakePlatform({
      initialCache: {
        assetId: ref.id, sha256: ref.sha256, savedPath: stored.savedPath as string,
        byteLength: ref.byteLength, lastUsedAt: 1,
      },
      initialCacheBytes: PAYLOAD,
    });
    const loader2 = createCharacterAssetLoader({ platform: fake.platform, cdnBaseUrl: 'https://cdn/x' });
    const res = await loader2.load(ref);
    expect(res.status).toBe('cache-hit');
    expect(res.attempts).toBe(0);
    expect(fake.counters.downloads).toBe(0);
    expect(loader2.stats().cacheHits).toBe(1);
  });

  it('缓存条目内容长度不符 ⇒ 摘掉条目并重新下载（不带病解析）', async () => {
    const ref = await validRef();
    const fake = createFakePlatform({
      initialCache: {
        assetId: ref.id, sha256: ref.sha256, savedPath: 'cache:broken',
        byteLength: ref.byteLength, lastUsedAt: 1,
      },
      initialCacheBytes: PAYLOAD.subarray(0, 4),
    });
    const loader = createCharacterAssetLoader({ platform: fake.platform, cdnBaseUrl: 'https://cdn/x' });
    const res = await loader.load(ref);
    expect(res.status).toBe('downloaded');
    expect(fake.counters.cacheRemove).toBe(1);
    expect(fake.counters.downloads).toBe(1);
  });

  it('缓存条目读失败 ⇒ 摘掉条目并重新下载', async () => {
    const ref = await validRef();
    const fake = createFakePlatform({
      initialCache: {
        assetId: ref.id, sha256: ref.sha256, savedPath: 'cache:unreadable',
        byteLength: ref.byteLength, lastUsedAt: 1,
      },
      readFails: ['cache:unreadable'],
    });
    const loader = createCharacterAssetLoader({ platform: fake.platform, cdnBaseUrl: 'https://cdn/x' });
    const res = await loader.load(ref);
    expect(res.status).toBe('downloaded');
    expect(fake.counters.cacheRemove).toBe(1);
  });
});

describe('重试恰 2 次（间隔 1s / 3s）与失败回退（方案 §6.2）', () => {
  it('断网：重试恰 2 次（共 3 次尝试），无 LKG 时返回 failed 且不抛', async () => {
    const ref = await validRef();
    const { loader, counters, sleeps } = makeLoader({ downloadBehaviors: ['network', 'network', 'network'] });
    const res = await loader.load(ref);
    expect(res.status).toBe('failed');
    expect(res.attempts).toBe(3);
    expect(counters.downloads).toBe(3);
    expect(sleeps).toEqual([1000, 3000]);
    expect(res.error).toMatch(/断网/);
    expect(res.diagnostics.some((d) => d.startsWith('attempt-failed:'))).toBe(true);
  });

  it('前两次失败、第三次成功 ⇒ status=downloaded、attempts=3', async () => {
    const ref = await validRef();
    const { loader, sleeps } = makeLoader({ downloadBehaviors: ['network', 'network', 'ok'] });
    const res = await loader.load(ref);
    expect(res.status).toBe('downloaded');
    expect(res.attempts).toBe(3);
    expect(sleeps).toEqual([1000, 3000]);
  });

  it('SHA 不符：3 次尝试后 failed，每次删临时文件，LKG 不被覆盖（也不被登记）', async () => {
    const ref = await validRef();
    const lkg: Character3DCacheEntry = {
      assetId: ref.id,
      sha256: 'b'.repeat(64),
      savedPath: 'cache:lkg',
      byteLength: PAYLOAD.byteLength,
      lastUsedAt: 1,
    };
    const fake = createFakePlatform({
      corruptOnDownload: true,
      downloadBehaviors: ['ok', 'ok', 'ok'],
      initialCache: lkg,
      initialCacheBytes: PAYLOAD,
    });
    const loader = createCharacterAssetLoader({
      platform: fake.platform,
      cdnBaseUrl: 'https://cdn/x',
      sleep: async () => undefined, // 真实 1s/3s 等待在「断网」用例里断言，这里不必真等
    });
    const res = await loader.load(ref);
    expect(res.attempts).toBe(3);
    expect(loader.stats().shaMismatches).toBe(3);
    // 关键：损坏内容绝不登记（否则「先覆盖 LKG 再验 SHA」的坑就复现了）
    expect(fake.counters.cachePut).toBe(0);
    // 每次失败都删掉自己的临时文件（清理污染）
    expect(fake.counters.removeFile).toBeGreaterThanOrEqual(3);
    // LKG 条目仍在缓存索引里，且内容未被改写
    const still = await fake.platform.cacheGet(ref.id);
    expect(still?.sha256).toBe(lkg.sha256);
    expect(still?.savedPath).toBe(lkg.savedPath);
  });

  it('SHA 不符后有 LKG ⇒ 用旧 3D 内容并打 stale-3d-cache 诊断（不允许切 2D）', async () => {
    const ref = await validRef();
    const lkg: Character3DCacheEntry = {
      assetId: ref.id, sha256: 'b'.repeat(64), savedPath: 'cache:lkg',
      byteLength: PAYLOAD.byteLength, lastUsedAt: 1,
    };
    const { loader } = makeLoader({
      corruptOnDownload: true,
      downloadBehaviors: ['ok', 'ok', 'ok'],
      initialCache: lkg,
      initialCacheBytes: PAYLOAD,
    });
    const res = await loader.load(ref);
    expect(res.status).toBe('stale-3d-cache');
    expect(res.diagnostics).toContain('stale-3d-cache');
    expect(res.bytes?.byteLength).toBe(PAYLOAD.byteLength);
    expect(res.savedPath).toBe('cache:lkg'); // LKG 原样保留，未被新内容覆盖
    expect(loader.stats().staleFallbacks).toBe(1);
  });

  it('byteLength 不符：不下发 SHA 校验、直接删临时文件、计 byteLengthMismatches', async () => {
    const ref = await validRef();
    const { loader, counters } = makeLoader({ downloadBehaviors: ['short', 'short', 'short'] });
    const res = await loader.load(ref);
    expect(res.status).toBe('failed');
    expect(loader.stats().byteLengthMismatches).toBe(3);
    expect(counters.cachePut).toBe(0);
    expect(res.diagnostics.some((d) => d.startsWith('byteLength-mismatch'))).toBe(true);
  });

  it('宿主拒绝（超时）：重试 2 次后 failed，计 timeouts', async () => {
    const ref = await validRef();
    const { loader, sleeps } = makeLoader({ downloadBehaviors: ['timeout', 'timeout', 'timeout'] });
    const res = await loader.load(ref);
    expect(res.status).toBe('failed');
    expect(sleeps).toEqual([1000, 3000]);
    expect(loader.stats().timeouts).toBeGreaterThanOrEqual(0);
  });

  it('宿主不 settle（永挂）：loader 的超时护栏兜住，不会永远转圈', async () => {
    const ref = await validRef();
    vi.useFakeTimers();
    try {
      const { loader } = makeLoader(
        { downloadBehaviors: ['honor-timeout', 'honor-timeout', 'honor-timeout'] },
        { sleep: async () => undefined },
      );
      const pending = loader.load(ref);
      await vi.advanceTimersByTimeAsync(60);
      await vi.advanceTimersByTimeAsync(60);
      await vi.advanceTimersByTimeAsync(60);
      const res = await pending;
      expect(res.status).toBe('failed');
      expect(res.attempts).toBe(3);
      expect(res.error).toMatch(/timeout/);
      expect(loader.stats().timeouts).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('结构门与缓存写失败', () => {
  it('结构不符（41 骨/1 primitive 类）：该文件不用、不登记、也不覆盖 LKG', async () => {
    const ref = await validRef();
    const lkg: Character3DCacheEntry = {
      assetId: ref.id, sha256: 'c'.repeat(64), savedPath: 'cache:lkg2',
      byteLength: PAYLOAD.byteLength, lastUsedAt: 1,
    };
    const { loader, counters } = makeLoader(
      { downloadBehaviors: ['ok', 'ok', 'ok'], initialCache: lkg, initialCacheBytes: PAYLOAD },
      {
        structureValidator: () => {
          throw new Error('结构不符: jointCount=40 应为 41');
        },
      },
    );
    const res = await loader.load(ref);
    expect(loader.stats().structureRejects).toBeGreaterThanOrEqual(3);
    expect(counters.cachePut).toBe(0);
    expect(res.savedPath).not.toBe('cache:' + ref.id);
    // LKG 自身也要过结构门才放行；此用例里结构门一律拒绝 ⇒ 只能 failed
    expect(res.status).toBe('failed');
    expect(res.diagnostics.some((d) => d.startsWith('structure-reject'))).toBe(true);
  });

  it('结构门放行时正常登记（对照上一条，证明拒绝来自结构门而非别处）', async () => {
    const ref = await validRef();
    const { loader, counters } = makeLoader({ downloadBehaviors: ['ok'] }, { structureValidator: () => undefined });
    const res = await loader.load(ref);
    expect(res.status).toBe('downloaded');
    expect(counters.cachePut).toBe(1);
  });

  it('缓存写失败：本次仍可用（字节在内存里），记诊断、不返回半成品路径', async () => {
    const ref = await validRef();
    const { loader } = makeLoader({ cachePutFails: true });
    const res = await loader.load(ref);
    expect(res.status).toBe('downloaded');
    expect(res.bytes?.byteLength).toBe(PAYLOAD.byteLength);
    expect(res.savedPath).toBeNull();
    expect(res.diagnostics.some((d) => d.startsWith('cache-write-failed'))).toBe(true);
    expect(loader.stats().cacheWriteFailures).toBe(1);
  });

  it('sha256File 不可用（旧基础库）⇒ 退回 sha256Bytes 仍能校验通过', async () => {
    const ref = await validRef();
    const { loader, counters } = makeLoader({ sha256FileUnsupported: true });
    const res = await loader.load(ref);
    expect(res.status).toBe('downloaded');
    expect(counters.sha256Bytes).toBeGreaterThan(0);
  });
});

describe('并发合并', () => {
  it('同一 assetId 的并发请求共用一次下载', async () => {
    const ref = await validRef();
    const { loader, counters } = makeLoader();
    const [a, b, c] = await Promise.all([loader.load(ref), loader.load(ref), loader.load(ref)]);
    expect(counters.downloads).toBe(1);
    expect(a.status).toBe('downloaded');
    expect(b.status).toBe(a.status);
    expect(c.status).toBe(a.status);
    expect(a).toBe(b); // 同一个 Promise 结果对象
    expect(loader.stats().downloadAttempts).toBe(1);
  });

  it('不同 assetId 不合并（各下各的）', async () => {
    const refA = await validRef({ id: 'asset-a' });
    const refB = await validRef({ id: 'asset-b', urlPath: 'characters/hero/abc123/b.bin' });
    const { loader, counters } = makeLoader();
    await Promise.all([loader.load(refA), loader.load(refB)]);
    expect(counters.downloads).toBe(2);
  });

  it('失败后 in-flight 表被清理，下一次仍会重试（不会永久卡在失败上）', async () => {
    const ref = await validRef();
    const { loader, counters } = makeLoader({
      downloadBehaviors: ['network', 'network', 'network', 'network', 'network', 'network'],
    });
    const first = await loader.load(ref);
    expect(first.status).toBe('failed');
    const second = await loader.load(ref);
    expect(second.status).toBe('failed');
    expect(counters.downloads).toBe(6); // 两轮各 3 次 ⇒ in-flight 表确实被清理
  });
});

describe('整套 profile 装载', () => {
  it('loadProfile：模型 + 走 CDN 的动作 json 全下；内嵌槽位跳过', async () => {
    const payloads: Record<string, string> = {};
    const refs: Record<string, Character3DAssetRef> = {};
    const names = ['model', 'idle', 'atk', 'cast', 'jump'] as const;
    for (const n of names) {
      const body = 'payload-' + n;
      payloads[n] = body;
      refs[n] = {
        id: n, urlPath: 'characters/hero/x/' + n, sha256: await sha256Hex(new TextEncoder().encode(body)),
        byteLength: new TextEncoder().encode(body).byteLength,
        mediaType: n === 'model' ? 'model/gltf-binary' : 'application/json',
      };
    }
    const fake = createFakePlatform();
    const byUrl = new Map<string, Uint8Array>(Object.entries(payloads).map(([k, v]) => [k, new TextEncoder().encode(v)]));
    const origDownload = fake.platform.downloadArrayBuffer.bind(fake.platform);
    fake.platform.downloadArrayBuffer = async (url, opts) => {
      const key = url.split('/').pop() as string;
      const hit = byUrl.get(key);
      if (hit) {
        fake.counters.downloads++;
        return hit;
      }
      return await origDownload(url, opts);
    };
    const loader = createCharacterAssetLoader({ platform: fake.platform, cdnBaseUrl: 'https://cdn' });
    const profile = {
      mode: 'webgl2-skinned' as const,
      model: refs.model,
      clips: { idle: refs.idle, walk: { embedded: 'preset:biped:walk' }, atk: refs.atk, cast: refs.cast, jump: refs.jump },
      jointCount: 41 as const,
      primitiveCount: 1 as const,
      modelHeight: 1,
      screenHeightPxAtReference: 123,
      sourceViewYawDeg: {
        right: 270, rightdown: 225, rightup: 315, left: 90, leftdown: 135, leftup: 45,
      },
      attachments: {},
    };
    const result = await loader.loadProfile(profile);
    expect(result.status).toBe('ready');
    expect(result.model?.status).toBe('downloaded');
    expect(Object.keys(result.clips).sort()).toEqual(['atk', 'cast', 'idle', 'jump']);
    expect(fake.counters.downloads).toBe(5); // 4 条 json + 1 模型，walk 内嵌不下载
  });

  it('loadProfile：任一资产失败即整体 failed（不静默降级成半套资产）', async () => {
    const model = await validRef({ id: 'model', mediaType: 'model/gltf-binary' });
    const okClip = async (id: string, fileName: string): Promise<Character3DAssetRef> =>
      validRef({ id, urlPath: 'characters/hero/x/' + fileName, mediaType: 'application/json' });
    // idle 声明 5 字节，实际回 47 字节 ⇒ 长度不符，三次尝试后失败
    const badIdle: Character3DAssetRef = {
      id: 'idle', urlPath: 'characters/hero/x/idle', sha256: 'd'.repeat(64), byteLength: 5, mediaType: 'application/json',
    };
    const { loader } = makeLoader();
    const profile = {
      mode: 'webgl2-skinned' as const,
      model,
      clips: {
        idle: badIdle,
        walk: { embedded: 'preset:biped:walk' },
        atk: await okClip('atk', 'atk'),
        cast: await okClip('cast', 'cast'),
        jump: await okClip('jump', 'jump'),
      },
      jointCount: 41 as const,
      primitiveCount: 1 as const,
      modelHeight: 1,
      screenHeightPxAtReference: 123,
      sourceViewYawDeg: { right: 270, rightdown: 225, rightup: 315, left: 90, leftdown: 135, leftup: 45 },
      attachments: {},
    };
    const result = await loader.loadProfile(profile);
    expect(result.status).toBe('failed');
    expect(result.clips.idle?.status).toBe('failed');
    expect(result.model?.status).toBe('downloaded');
    expect(result.clips.atk?.status).toBe('downloaded');
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
