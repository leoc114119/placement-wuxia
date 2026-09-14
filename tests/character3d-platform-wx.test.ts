// T31-FE-A · 微信适配器用例（方案 §6.1 / B3 缓存原子性）
//
// 为什么单独测这一层：微信侧「持久文件缓存 + storage 索引」是两个存储、两次可能失败，
// 是方案 §8 点名的最大不确定项。本文件用假 wx 宿主把错误矩阵钉死：
//   · 冷启动索引在、文件不在 ⇒ 视为未命中并摘掉坏索引（不得带着坏索引继续）；
//   · cachePut 的**原子性**：文件改名 + 索引落盘，任一步失败都必须回滚或抛出，不得谎报持久化成功；
//   · sha256 两路都不可用 ⇒ 失败关闭（不放行未校验资产）。

import { describe, expect, it } from 'vitest';
import { createWxCharacter3DPlatform } from '../ui/character3d/platform-wx';
import { createCharacterAssetLoader } from '../net/character-asset-loader';

type WxRuntimeArg = NonNullable<NonNullable<Parameters<typeof createWxCharacter3DPlatform>[0]>['runtime']>;

const PAYLOAD = new TextEncoder().encode('wx-payload-bytes');
const USER_PATH = '/user';
const CACHE_DIR = USER_PATH + '/character3d';
const INDEX_KEY = 'character3d-cache-index-v1';

interface FakeWxOptions {
  /** storage 里预置的索引（模拟冷启动读到的旧索引） */
  storedIndex?: Record<string, unknown>;
  /** getFileInfo 是否给 digest（false = 旧基础库） */
  digestSupported?: boolean;
  /** setStorageSync 抛错（磁盘/配额问题） */
  setStorageFails?: boolean;
  /** renameSync 抛错（跨目录改名不被支持的写法） */
  renameFails?: boolean;
  /** 下载返回体（默认 PAYLOAD） */
  downloadBody?: Uint8Array;
  downloadStatus?: number;
  downloadFails?: boolean;
}

function createFakeWx(options: FakeWxOptions = {}) {
  const fs = new Map<string, Uint8Array>();
  const storage = new Map<string, unknown>();
  if (options.storedIndex) storage.set(INDEX_KEY, options.storedIndex);
  const counters = { download: 0, setStorage: 0, getStorage: 0, rename: 0, copy: 0, unlink: 0, writeFile: 0 };

  const fsm = {
    mkdirSync(): void { /* 目录视为已存在 */ },
    accessSync(path: string): void {
      if (!fs.has(path)) throw new Error('accessSync: no such file ' + path);
    },
    getFileInfo(o: { filePath: string; digestAlgorithm?: string; success: (r: { size: number; digest?: string }) => void; fail: (e: { errMsg?: string }) => void }): void {
      const bytes = fs.get(o.filePath);
      if (!bytes) {
        o.fail({ errMsg: 'no such file' });
        return;
      }
      if (options.digestSupported === false && o.digestAlgorithm) {
        o.success({ size: bytes.byteLength }); // 旧基础库：不回 digest
        return;
      }
      // 真算 SHA-256（异步回调形态，与 wx 的回调 API 同形），hex 小写
      void sha256Hex(bytes).then((digest) => o.success({ size: bytes.byteLength, digest }));
    },
    readFile(o: { filePath: string; encoding?: string; success: (r: { data: ArrayBuffer | string }) => void; fail: (e: { errMsg?: string }) => void }): void {
      const bytes = fs.get(o.filePath);
      if (!bytes) {
        o.fail({ errMsg: 'no such file' });
        return;
      }
      if (o.encoding) {
        o.success({ data: new TextDecoder().decode(bytes) });
        return;
      }
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      o.success({ data: copy });
    },
    readFileSync(path: string): ArrayBuffer {
      const bytes = fs.get(path);
      if (!bytes) throw new Error('readFileSync: no such file ' + path);
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      return copy;
    },
    writeFileSync(path: string, data: ArrayBuffer | string): void {
      counters.writeFile++;
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
      fs.set(path, bytes);
    },
    renameSync(from: string, to: string): void {
      counters.rename++;
      if (options.renameFails) throw new Error('renameSync 不支持');
      const bytes = fs.get(from);
      if (!bytes) throw new Error('renameSync: no such file');
      fs.set(to, bytes);
      fs.delete(from);
    },
    copyFileSync(from: string, to: string): void {
      counters.copy++;
      const bytes = fs.get(from);
      if (!bytes) throw new Error('copyFileSync: no such file');
      fs.set(to, bytes);
    },
    unlinkSync(path: string): void {
      counters.unlink++;
      if (!fs.has(path)) throw new Error('unlinkSync: no such file');
      fs.delete(path);
    },
  };

  const host = {
    env: { USER_DATA_PATH: USER_PATH },
    getFileSystemManager: () => fsm,
    downloadFile(o: { url: string; success: (r: { statusCode: number; tempFilePath: string }) => void; fail: (e: { errMsg?: string }) => void }) {
      counters.download++;
      if (options.downloadFails) {
        o.fail({ errMsg: 'host: network unreachable' });
      } else {
        fs.set('/tmp-download', options.downloadBody ?? PAYLOAD);
        o.success({ statusCode: options.downloadStatus ?? 200, tempFilePath: '/tmp-download' });
      }
      return { abort: () => undefined };
    },
    createCanvas: () => ({ width: 0, height: 0, getContext: () => null }),
    createImage: () => ({ src: '', width: 0, height: 0 }),
    getStorageSync(key: string): unknown {
      counters.getStorage++;
      return storage.get(key);
    },
    setStorageSync(key: string, value: unknown): void {
      counters.setStorage++;
      if (options.setStorageFails) throw new Error('host: setStorageSync 配额/写盘失败');
      storage.set(key, value);
    },
  };

  return { host, fs, storage, counters };
}

/** 真 SHA-256（WebCrypto；与浏览器适配器同一实现口径），返回小写 hex。
 * 用真摘要而非常量，才能证明 wx 适配器是「把 getFileInfo 的 digest 原样透传」而不是回了个常数。 */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makePlatform(options: FakeWxOptions = {}) {
  const fake = createFakeWx(options);
  const platform = createWxCharacter3DPlatform({
    runtime: fake.host as unknown as WxRuntimeArg,
    logSink: () => undefined,
  });
  return { platform, ...fake };
}

const REF = {
  id: 'wx-asset',
  urlPath: 'characters/hero/abc/x.bin',
  sha256: 'e85996cd1b9cd679ea9e1c049fe50dae2d4e279f74b07fa463ee6ffe7ad5349f',
  byteLength: PAYLOAD.byteLength,
  mediaType: 'model/gltf-binary',
} as const;

describe('微信适配器 · 下载与文件原语', () => {
  it('downloadArrayBuffer：200 时返回二进制', async () => {
    const { platform, counters } = makePlatform();
    const bytes = await platform.downloadArrayBuffer('https://cdn/x.bin', { timeoutMs: 1000 });
    expect(bytes.byteLength).toBe(PAYLOAD.byteLength);
    expect(counters.download).toBe(1);
  });

  it('downloadArrayBuffer：非 200 即拒绝（不把错误页当资产）', async () => {
    const { platform } = makePlatform({ downloadStatus: 404 });
    await expect(platform.downloadArrayBuffer('https://cdn/x.bin', { timeoutMs: 1000 })).rejects.toThrow(/404/);
  });

  it('downloadArrayBuffer：宿主 fail 即拒绝', async () => {
    const { platform } = makePlatform({ downloadFails: true });
    await expect(platform.downloadArrayBuffer('https://cdn/x.bin', { timeoutMs: 1000 })).rejects.toThrow(/downloadFile/);
  });

  it('writeTempFile / readFileBytes 往返一致；removeFile 对不存在文件不抛', async () => {
    const { platform } = makePlatform();
    const path = await platform.writeTempFile('a.tmp', PAYLOAD);
    const back = await platform.readFileBytes(path);
    expect(Array.from(back)).toEqual(Array.from(PAYLOAD));
    await expect(platform.removeFile(path)).resolves.toBeUndefined();
    await expect(platform.removeFile(path)).resolves.toBeUndefined(); // 二次删除幂等
  });

  it('sha256File：基础库不回 digest ⇒ resolve(null)（交 loader 决定下一步）', async () => {
    const { platform } = makePlatform({ digestSupported: false });
    const path = await platform.writeTempFile('a.tmp', PAYLOAD);
    expect(await platform.sha256File(path)).toBeNull();
  });

  it('sha256Bytes：两路都不可用时**失败关闭**（拒绝放行未校验资产）', async () => {
    const { platform } = makePlatform({ digestSupported: false });
    await expect(platform.sha256Bytes(PAYLOAD)).rejects.toThrow(/无法校验/);
  });

  it('sha256Bytes：支持时返回 64 位小写十六进制，且不留探针文件', async () => {
    const { platform, fs } = makePlatform();
    const digest = await platform.sha256Bytes(PAYLOAD);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect([...fs.keys()].filter((k) => k.includes('sha-probe'))).toEqual([]);
  });
});

describe('微信适配器 · 缓存原子性（B3）', () => {
  it('cachePut 正常：目标文件落地、临时文件消失、索引写入 storage', async () => {
    const { platform, fs, counters } = makePlatform();
    const temp = await platform.writeTempFile('a.tmp', PAYLOAD);
    const entry = await platform.cachePut({
      assetId: REF.id, sha256: REF.sha256, byteLength: REF.byteLength, tempPath: temp,
    });
    expect(entry.savedPath).toBe(CACHE_DIR + '/' + REF.id + '-' + REF.sha256.slice(0, 12) + '.bin');
    expect(fs.has(entry.savedPath)).toBe(true);
    expect(fs.has(temp)).toBe(false);
    expect(counters.setStorage).toBeGreaterThan(0);
  });

  it('rename 不被支持 ⇒ 退化为复制 + 删源，语义等价', async () => {
    const { platform, fs } = makePlatform({ renameFails: true });
    const temp = await platform.writeTempFile('a.tmp', PAYLOAD);
    const entry = await platform.cachePut({
      assetId: REF.id, sha256: REF.sha256, byteLength: REF.byteLength, tempPath: temp,
    });
    expect(fs.has(entry.savedPath)).toBe(true);
    expect(fs.has(temp)).toBe(false);
  });

  it('索引落盘失败 ⇒ 必须抛出并**回滚**（文件删除、索引无记录），不得谎报持久化成功', async () => {
    const { platform, fs } = makePlatform({ setStorageFails: true });
    const temp = await platform.writeTempFile('a.tmp', PAYLOAD);
    await expect(
      platform.cachePut({ assetId: REF.id, sha256: REF.sha256, byteLength: REF.byteLength, tempPath: temp }),
    ).rejects.toThrow(/setStorageSync/);
    // 回滚：目标文件不得留下（否则成为「有文件没索引」的孤儿）
    expect([...fs.keys()].filter((k) => k.endsWith('.bin'))).toEqual([]);
    // 索引里也不得有该条目
    expect(await platform.cacheGet(REF.id)).toBeNull();
  });

  it('冷启动坏索引（索引在、文件不在）⇒ cacheGet 返回 null 且把坏条目摘掉', async () => {
    const { platform, storage, counters } = makePlatform({
      storedIndex: {
        [REF.id]: { assetId: REF.id, sha256: REF.sha256, savedPath: CACHE_DIR + '/gone.bin', byteLength: 3, lastUsedAt: 1 },
      },
    });
    expect(await platform.cacheGet(REF.id)).toBeNull();
    const persisted = storage.get(INDEX_KEY) as Record<string, unknown>;
    expect(persisted[REF.id]).toBeUndefined();
    expect(counters.setStorage).toBeGreaterThan(0);
  });

  it('热缓存命中：索引与文件都在 ⇒ 原样返回 5 个字段', async () => {
    const savedPath = CACHE_DIR + '/hot.bin';
    const seed = makePlatform({
      storedIndex: {
        [REF.id]: { assetId: REF.id, sha256: REF.sha256, savedPath, byteLength: PAYLOAD.byteLength, lastUsedAt: 7 },
      },
    });
    seed.fs.set(savedPath, PAYLOAD); // 冷启动已有缓存内容
    const entry = await seed.platform.cacheGet(REF.id);
    expect(entry).toEqual({
      assetId: REF.id, sha256: REF.sha256, savedPath, byteLength: PAYLOAD.byteLength, lastUsedAt: 7,
    });
    expect(Object.keys(entry as object).sort()).toEqual(
      ['assetId', 'byteLength', 'lastUsedAt', 'savedPath', 'sha256'], // 索引只存这 5 个字段（§6.1）
    );
  });

  it('cacheRemove：文件与索引一起清掉', async () => {
    const { platform, fs, storage } = makePlatform();
    const temp = await platform.writeTempFile('a.tmp', PAYLOAD);
    const entry = await platform.cachePut({
      assetId: REF.id, sha256: REF.sha256, byteLength: REF.byteLength, tempPath: temp,
    });
    await platform.cacheRemove(REF.id);
    expect(fs.has(entry.savedPath)).toBe(false);
    expect((storage.get(INDEX_KEY) as Record<string, unknown>)[REF.id]).toBeUndefined();
  });

  it('与 loader 串联：索引落盘失败被记为 cache-write-failed，本次仍可用且零残留', async () => {
    const { platform, fs } = makePlatform({ setStorageFails: true, digestSupported: true });
    const loader = createCharacterAssetLoader({
      platform,
      cdnBaseUrl: 'https://cdn',
      sleep: async () => undefined,
    });
    const res = await loader.load(REF);
    expect(res.status).toBe('downloaded');
    expect(res.bytes?.byteLength).toBe(PAYLOAD.byteLength);
    expect(res.diagnostics.some((d) => d.startsWith('cache-write-failed'))).toBe(true);
    expect(loader.stats().cacheWriteFailures).toBe(1);
    // 零残留：不得留下临时文件或孤儿缓存文件
    expect([...fs.keys()].filter((k) => k.startsWith(CACHE_DIR + '/tmp-'))).toEqual([]);
    expect([...fs.keys()].filter((k) => k.endsWith('.bin'))).toEqual([]);
  });
});
