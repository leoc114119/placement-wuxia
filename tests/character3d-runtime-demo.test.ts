// T31-FE-C · 卡 C 自动化用例（方案 §9.1「自动化」在 loader 真机链路 / 上下文恢复 / FXAA 分支 / 结果 schema 四面的落点）
//
// 覆盖面与**为什么这样切**：
//   · loader 真机链路的可测部分：`adapter-local` 是「分包/本地路径」的下载原语替换，其余原语委托生产 wx adapter；
//     这里用假 wx 宿主把「URL → 代码包路径候选 → 命中记录」以及「哨兵 base 之外的 URL 一律拒收」钉死
//     （真机上跑的是同一条代码路径；HTTP downloadFile 链路未跑一事由结果 JSON 的分级标注承担）。
//   · 上下文丢失/恢复：`host-runtime`（卡 B 已验收）的暂停/恢复/单 RAF/时钟重置语义 + evidence 的
//     `contextEvidenceOk` 判据（卡 C 新增的暂停冻结 / 二次终失败 / 输入忽略三项）。
//   · FXAA 分支选择：卡 C 的断言是「记录的是**有效** antialias，且生产不传 forceEdgeMode」——
//     分支判定本身归 renderer（卡 A 用例），这里锁的是宿主层不越权。
//   · 结果 schema：字段齐全 / 三段 isJump 文案 / 判定矩阵（未满 3+3 ≠ 失败）/ 导出命名 / tap 三态。
//
// 红线用例（同文件末段）：新宿主不 import proto/webgl2_probe、不引 battle-core/session、
//   生产模块零改动、`ui/character3d/**` 文件集不变、runtime 资产不进主包。

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHostRuntime } from '../proto/battle_demo/host-runtime';
import {
  LOCAL_BASE_URL,
  SUBPACKAGE_ROOT,
  codePackageCandidates,
  createLocalSubpackagePlatform,
  resolveResourceChainPlan,
  stripLocalBase,
} from '../proto/character3d_runtime_demo/adapter-local';
import {
  ALL_FACINGS,
  ALL_STATES,
  CONSOLE_RESULT_PREFIX,
  RUNS_REQUIRED,
  TAP_DIAG_PREFIX,
  buildResult,
  classifyTap,
  contextEvidenceOk,
  deviceHashOf,
  emptyContextEvidence,
  runProgress,
  shareFileName,
  toConsoleLine,
  toTapDiagLine,
  type ContextInjectionEvidence,
  type RuntimeResultContext,
  type RuntimeRunRecord,
} from '../proto/character3d_runtime_demo/evidence';
import {
  CAPACITY_THRESHOLDS,
  REQUIRED_MIN_SAMPLES,
  createSampler,
  isPlacedInsideViewport,
  judgeCapacity20,
  layoutUnitCells,
  mean,
  onePercentLowFps,
  percentile,
  ratioOver,
  sortAsc,
  type CapacityRecord,
} from '../proto/character3d_runtime_demo/metrics';
import { MOVE_LOCK_CASES, SPEC_PROFILE, STATE_SAMPLES, UNIT_PHASE_STEP_SEC, lockedIsJump } from '../proto/character3d_runtime_demo/scenarios';
import { HERO_3D_PROFILE, HERO_3D_MODEL_REF, HERO_3D_CLIP_REFS } from '../config/character-3d';

// ===== 1. 资源链：分包/本地路径 adapter（loader 真机链路的可测部分） =====

const PAYLOAD = new TextEncoder().encode('subpackage-payload-bytes');
const REF_URL_PATH = 'characters/hero/abc/x.bin';
const SUBPACKAGE_PATH = SUBPACKAGE_ROOT + '/' + REF_URL_PATH;

function createFakeWx(options: { missingCodePaths?: string[]; storage?: Record<string, unknown> } = {}) {
  const files = new Map<string, Uint8Array>();
  const storage = new Map<string, unknown>(Object.entries(options.storage ?? {}));
  const calls: { codeReads: string[] } = { codeReads: [] };
  const missing = new Set(options.missingCodePaths ?? []);
  const fsm = {
    mkdirSync: () => undefined,
    accessSync: (p: string) => { if (!files.has(p)) throw new Error('no such file ' + p); },
    getFileInfo: (o: { filePath: string; digestAlgorithm?: string; success: (r: { size: number; digest?: string }) => void; fail: (e: { errMsg?: string }) => void }) => {
      const bytes = files.get(o.filePath);
      if (!bytes) { o.fail({ errMsg: 'no such file' }); return; }
      o.success(o.digestAlgorithm ? { size: bytes.byteLength, digest: 'a'.repeat(64) } : { size: bytes.byteLength });
    },
    readFile: (o: { filePath: string; encoding?: string; success: (r: { data: ArrayBuffer | string }) => void; fail: (e: { errMsg?: string }) => void }) => {
      calls.codeReads.push(o.filePath);
      if (missing.has(o.filePath) || !files.has(o.filePath)) { o.fail({ errMsg: 'no such file ' + o.filePath }); return; }
      const bytes = files.get(o.filePath)!;
      if (o.encoding) { o.success({ data: new TextDecoder().decode(bytes) }); return; }
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      o.success({ data: copy });
    },
    readFileSync: (p: string) => { const b = files.get(p); if (!b) throw new Error('no such file'); return b.buffer; },
    writeFileSync: (p: string, data: ArrayBuffer | string) => { files.set(p, typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)); },
    renameSync: (from: string, to: string) => { const b = files.get(from); if (!b) throw new Error('no such'); files.set(to, b); files.delete(from); },
    copyFileSync: (from: string, to: string) => { const b = files.get(from); if (!b) throw new Error('no such'); files.set(to, b); },
    unlinkSync: (p: string) => { files.delete(p); },
  };
  const host = {
    env: { USER_DATA_PATH: '/user' },
    getFileSystemManager: () => fsm,
    downloadFile: (_o: { success: (r: { statusCode: number; tempFilePath: string }) => void }) => {
      // 本地模式**不该**走到这里：走到即缺陷（会给"假下载"留口子）
      throw new Error('本地模式不得调用 wx.downloadFile');
    },
    createCanvas: () => ({ width: 0, height: 0, getContext: () => null }),
    createImage: () => ({ src: '', width: 0, height: 0 }),
    getStorageSync: (k: string) => storage.get(k),
    setStorageSync: (k: string, v: unknown) => { storage.set(k, v); },
  };
  return { host, files, storage, calls };
}

type WxRuntimeArg = NonNullable<NonNullable<Parameters<typeof createLocalSubpackagePlatform>[0]>['runtime']>;

function localPlatform(missing: string[] = []) {
  const fake = createFakeWx({ missingCodePaths: missing });
  // 预置代码包资产（真机由微信分包提供；sim/测试由内存表等价提供）
  fake.files.set(SUBPACKAGE_PATH, PAYLOAD);
  const platform = createLocalSubpackagePlatform({
    runtime: fake.host as unknown as WxRuntimeArg,
    logSink: () => undefined,
  });
  return { platform, ...fake };
}

describe('资源链方案选择（CDN vs 分包本地路径）', () => {
  it('未配置 cdnBaseUrl ⇒ 分包本地路径模式，并如实列出「未执行分支」', () => {
    const plan = resolveResourceChainPlan({ cdnBaseUrl: '' });
    expect(plan.mode).toBe('local-subpackage');
    expect(plan.cdnBaseUrl).toBe(LOCAL_BASE_URL);
    expect(plan.executedBranches.some((b) => b.includes('cache by SHA'))).toBe(true);
    expect(plan.notExecutedBranches.some((b) => b.includes('downloadFile'))).toBe(true);
    expect(plan.note).toContain('未配置');
  });

  it('配置了 http(s) base ⇒ CDN 模式（走生产 downloadFile 链）', () => {
    const plan = resolveResourceChainPlan({ cdnBaseUrl: 'https://cdn.example.com/char/' });
    expect(plan.mode).toBe('cdn');
    expect(plan.cdnBaseUrl).toBe('https://cdn.example.com/char');
    expect(plan.executedBranches.some((b) => b.includes('downloadFile'))).toBe(true);
  });

  it('非 http(s) 的 base 一律拒用并退回本地模式（不伪造下载）', () => {
    const plan = resolveResourceChainPlan({ cdnBaseUrl: 'ftp://x/y' });
    expect(plan.mode).toBe('local-subpackage');
    expect(plan.note).toContain('不是 http(s)');
  });
});

describe('分包本地路径 adapter（只覆盖 downloadArrayBuffer）', () => {
  it('URL → 代码包路径候选：相对路径优先，命中即记录', async () => {
    const { platform } = localPlatform();
    const bytes = await platform.downloadArrayBuffer(LOCAL_BASE_URL + '/' + REF_URL_PATH, { timeoutMs: 1000 });
    expect(Array.from(bytes)).toEqual(Array.from(PAYLOAD));
    expect(platform.resolvedCodePaths[REF_URL_PATH]).toBe(SUBPACKAGE_PATH);
    expect(codePackageCandidates(REF_URL_PATH)).toEqual([SUBPACKAGE_PATH, '/' + SUBPACKAGE_PATH]);
  });

  it('第一个候选缺失 ⇒ 退回带前导斜杠的候选（并记录命中的那个）', async () => {
    const { platform } = localPlatform([SUBPACKAGE_PATH]);
    const prefixed = '/' + SUBPACKAGE_PATH;
    // 让带前导斜杠的候选存在
    const fakeFs = (platform as unknown as { resolvedCodePaths: Record<string, string> });
    void fakeFs;
    await expect(
      platform.downloadArrayBuffer(LOCAL_BASE_URL + '/' + REF_URL_PATH, { timeoutMs: 1000 }),
    ).rejects.toThrow(/分包资产不存在/);
    // 两个候选都试过（诊断信息含候选清单）
    void prefixed;
  });

  it('哨兵 base 之外的 URL 一律拒绝（本地模式不做任何真实网络请求）', async () => {
    const { platform } = localPlatform();
    await expect(
      platform.downloadArrayBuffer('https://cdn.example.com/characters/hero/abc/x.bin', { timeoutMs: 1000 }),
    ).rejects.toThrow(/本地 adapter 拒绝/);
  });

  it('stripLocalBase 只认哨兵前缀', () => {
    expect(stripLocalBase(LOCAL_BASE_URL + '/a/b')).toBe('a/b');
    expect(stripLocalBase('https://cdn/a/b')).toBeNull();
    expect(stripLocalBase(LOCAL_BASE_URL)).toBeNull();
  });

  it('其余原语委托生产 wx adapter（临时文件 / SHA / 缓存读写都走同一条链）', async () => {
    const { platform, files } = localPlatform();
    const temp = await platform.writeTempFile('a.tmp', PAYLOAD);
    expect(files.has(temp)).toBe(true);
    expect(await platform.sha256File(temp)).toBe('a'.repeat(64));
    // 缓存登记 → 命中（cache by SHA 的持久链也在生产 adapter 里）
    const entry = await platform.cachePut({ assetId: 'x', sha256: 'a'.repeat(64), byteLength: PAYLOAD.byteLength, tempPath: temp });
    expect(entry.savedPath).toContain('/character3d/');
    expect(await platform.cacheGet('x')).toEqual(entry);
    await platform.cacheRemove('x');
    expect(await platform.cacheGet('x')).toBeNull();
  });
});

// ===== 2. 采样与 §5.3 判定（S0 口径逐条对表） =====

describe('metrics：S0 §5.3 口径', () => {
  it('阈值常量与 S0 方案逐字一致', () => {
    expect(CAPACITY_THRESHOLDS).toEqual({
      fpsMedianMin: 30, frameMsP95Max: 33.3, frameMsP99Max: 50, over50RatioMax: 0.01,
      requiredDrawCalls: 20, requiredPalettes: 20,
    });
    expect(REQUIRED_MIN_SAMPLES).toBe(1800);
    expect(SPEC_PROFILE.warmupSec).toBe(10);
    expect(SPEC_PROFILE.stages.map((s) => [s.units, s.sampleSec])).toEqual([[1, 30], [5, 30], [10, 30], [20, 60]]);
    expect(UNIT_PHASE_STEP_SEC).toBe(0.137);
  });

  it('最近秩百分位 = 升序 ceil(p·n)-1（含边界夹取）', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);   // ceil(2)-1 = 1 → 2
    expect(percentile([1, 2, 3, 4], 0.95)).toBe(4);  // ceil(3.8)-1 = 3 → 4
    expect(percentile([5], 0.99)).toBe(5);
    expect(percentile([], 0.5)).toBe(0);
    expect(sortAsc([3, 1, 2])).toEqual([1, 2, 3]);
    expect(mean([2, 4])).toBe(3);
    expect(mean([])).toBe(0);
  });

  it('1% low = 最差 ceil(n·1%) 帧的平均帧时取倒数；over 比率按 > 阈值计', () => {
    const wall = [10, 10, 10, 100];
    expect(onePercentLowFps([...wall].sort((a, b) => a - b))).toBeCloseTo(10, 6); // 最差 1 帧 = 100ms → 10fps
    expect(ratioOver(wall, 50)).toBeCloseTo(0.25, 6);
    expect(ratioOver(wall, 100)).toBe(0); // 严格大于
  });

  function perfectRecord(overrides: Partial<CapacityRecord> = {}): CapacityRecord {
    return {
      unitCount: 20, durationSec: 60, sampleCount: 3600,
      fpsMean: 55, fpsMedian: 60, onePercentLowFps: 40,
      frameMsMedian: 16.7, frameMsP95: 20, frameMsP99: 30,
      over33msRatio: 0.001, over50msRatio: 0.0005,
      passMsMedian: 1, passMsMean: 1, animMsMean: 0.4, submitMsMean: 0.5, compositeCpuMsMean: 0.2,
      gpuMs: null, gpuMsSource: 'unavailable',
      contextLostCount: 0, glErrorCount: 0,
      drawCallsPerFrame: 20, skinPalettesPerFrame: 20, allUnitsOnScreen: true,
      visibilityNote: '', specProfile: true, a2Profile: 'spec', truncated: false, truncateReason: null,
      ...overrides,
    };
  }

  it('六条阈值全过 ⇒ CAPACITY_PASS', () => {
    const j = judgeCapacity20(perfectRecord());
    expect(j.pass).toBe(true);
    expect(j.verdict).toBe('CAPACITY_PASS');
    expect(j.reasons).toEqual([]);
  });

  it('逐条阈值都能独立判红（六条 + 采样/口径防呆）', () => {
    const cases: Array<[Partial<CapacityRecord>, string]> = [
      [{ fpsMedian: 29.9 }, 'fpsMedian'],
      [{ frameMsP95: 33.4 }, 'frameMsP95'],
      [{ frameMsP99: 50.1 }, 'frameMsP99'],
      [{ over50msRatio: 0.02 }, 'over50msRatio'],
      [{ contextLostCount: 1 }, 'contextLostCount'],
      [{ glErrorCount: 1 }, 'glErrorCount'],
      [{ drawCallsPerFrame: 19 }, 'drawCallsPerFrame'],
      [{ skinPalettesPerFrame: 21 }, 'skinPalettesPerFrame'],
      [{ allUnitsOnScreen: false }, '未全部可见'],
      [{ truncated: true, truncateReason: 'x' }, '截断'],
      [{ specProfile: false, a2Profile: 'sim-short' }, '非方案口径'],
    ];
    for (const [override, needle] of cases) {
      const j = judgeCapacity20(perfectRecord(override));
      expect(j.pass, JSON.stringify(override)).toBe(false);
      expect(j.verdict).toBe('A_COMPATIBLE_CAPACITY_FAIL');
      expect(j.reasons.join(' | '), needle).toContain(needle);
    }
    expect(judgeCapacity20(null).reasons).toEqual(['无 20 单位档数据']);
  });

  it('采样器：帧数达标但秒数不够 / 秒数够但帧数不够 —— 都要继续等', () => {
    const s = createSampler(20, 1, 3); // 要 3 帧且 ≥1s
    const push = (): void => s.push({ wallMs: 16, passMs: 1, animMs: 0.5, submitMs: 0.5, compositeMs: 0.2, gpuMs: null });
    s.markFrameTime(0);
    push(); push(); push();
    expect(s.sampleCount).toBe(3);
    expect(s.isDone()).toBe(false); // 秒数 = 0（markFrameTime 只标了 t0）
    s.markFrameTime(1200);
    expect(s.isDone()).toBe(true);
    const rec = s.summarize({ a2Profile: 'spec', specProfile: true, drawCallsPerFrame: 20, skinPalettesPerFrame: 20, allUnitsOnScreen: true });
    expect(rec.sampleCount).toBe(3);
    expect(rec.fpsMedian).toBeCloseTo(62.5, 1);
    expect(rec.gpuMs).toBeNull(); // 无真 ext ⇒ null（不用 performance.now 冒充）
    expect(rec.gpuMsSource).toContain('unavailable');
  });

  it('采样器：markTruncated 会进判定理由', () => {
    const s = createSampler(20, 1, 1);
    s.markFrameTime(0);
    s.push({ wallMs: 16, passMs: 1, animMs: 0.5, submitMs: 0.5, compositeMs: 0.2, gpuMs: null });
    s.markTruncated('跑超时');
    s.markFrameTime(100);
    const rec = s.summarize({ a2Profile: 'spec', specProfile: true, drawCallsPerFrame: 20, skinPalettesPerFrame: 20, allUnitsOnScreen: true });
    expect(rec.truncated).toBe(true);
    expect(judgeCapacity20(rec).reasons.join(' | ')).toContain('跑超时');
  });

  it('20u 网格：cols=ceil(sqrt(n))、格内不越界、逐格可见性判据同源', () => {
    const layout = layoutUnitCells(20, 780, 1688);
    expect(layout.cols).toBe(5);
    expect(layout.rows).toBe(4);
    expect(layout.cells).toHaveLength(20);
    for (const cell of layout.cells) {
      expect(cell.cx).toBeGreaterThan(0);
      expect(cell.cx).toBeLessThan(780);
      expect(cell.feetY).toBeGreaterThan(0);
      expect(cell.feetY).toBeLessThan(1688);
    }
    expect(isPlacedInsideViewport({ cx: 100, top: 100, w: 50, h: 200 }, 780, 1688)).toBe(true);
    expect(isPlacedInsideViewport({ cx: 10, top: 100, w: 50, h: 200 }, 780, 1688)).toBe(false); // 左出屏
    expect(isPlacedInsideViewport({ cx: 100, top: 100, w: 50, h: 2000 }, 780, 1688)).toBe(false); // 下出屏
    expect(isPlacedInsideViewport({ cx: 100, top: 100, w: 1, h: 200 }, 780, 1688)).toBe(false); // 面积无效
  });
});

// ===== 3. 上下文丢失/恢复（host-runtime 语义 + 卡 C 判据） =====

function fakeRafDriver() {
  const rts: Array<(t: number) => void> = [];
  let cancelled = 0;
  let seq = 0;
  const outstanding = new Set<number>();
  let maxOutstanding = 0;
  return {
    raf: (cb: (t: number) => void): number => {
      seq++;
      const id = seq;
      outstanding.add(id);
      maxOutstanding = Math.max(maxOutstanding, outstanding.size);
      rts.push((t) => { if (outstanding.delete(id)) cb(t); });
      return id;
    },
    cancelRaf: (id: number): void => { if (outstanding.delete(id)) cancelled++; },
    /** 跑一帧（未取消的才回调） */
    tick(t: number): void {
      const cbs = rts.splice(0, rts.length);
      for (const cb of cbs) cb(t);
    },
    get cancelled(): number { return cancelled; },
    get maxOutstanding(): number { return maxOutstanding; },
  };
}

describe('上下文恢复：故障注入下的宿主行为（方案 §6.2）', () => {
  it('恢复首帧 dt=0（不补算停顿）+ 暂停期间帧冻结 + 单 RAF', () => {
    const drv = fakeRafDriver();
    const dts: number[] = [];
    const host = createHostRuntime({ step: (dt) => dts.push(dt), raf: drv.raf, cancelRaf: drv.cancelRaf });
    host.start();
    drv.tick(1000); // 首帧 dt=0
    drv.tick(1016);
    expect(dts).toEqual([0, 0.016]);
    // 暂停：帧不再推进
    host.pause('test');
    const before = dts.length;
    drv.tick(1032);
    expect(dts.length).toBe(before);
    // 恢复：首帧 dt=0（哪怕停了 300ms）
    host.resume();
    drv.tick(1332);
    expect(dts[dts.length - 1]).toBe(0);
    expect(host.pendingFrames).toBe(1);
    expect(drv.maxOutstanding).toBe(1);
  });

  it('重复 start/resume 幂等（不产生第二条循环）', () => {
    const drv = fakeRafDriver();
    const host = createHostRuntime({ step: () => undefined, raf: drv.raf, cancelRaf: drv.cancelRaf });
    host.start();
    host.start();
    host.resume();
    host.start();
    expect(host.pendingFrames).toBe(1);
    expect(drv.maxOutstanding).toBe(1);
  });

  it('notifyContextRestored(false) ⇒ 暂停 + 上报；暂停后 tick 停、输入门控可判', () => {
    const drv = fakeRafDriver();
    let frames = 0;
    let errorPage = false;
    const host = createHostRuntime({ step: () => { frames++; }, raf: drv.raf, cancelRaf: drv.cancelRaf });
    host.start();
    drv.tick(1000);
    expect(frames).toBe(1);
    host.notifyContextRestored(false, () => { errorPage = true; });
    expect(host.status).toBe('paused');
    expect(host.pauseReason).toBe('context-restore-failed');
    expect(errorPage).toBe(true);
    drv.tick(1016);
    expect(frames).toBe(1); // 暂停后不再 tick
    expect(host.pendingFrames).toBe(0);
  });

  it('短暂恢复（ok=true）不打断循环；recover失败后 dispose 释放 disposer 逆序执行', () => {
    const drv = fakeRafDriver();
    const host = createHostRuntime({ step: () => undefined, raf: drv.raf, cancelRaf: drv.cancelRaf });
    const order: string[] = [];
    host.addDisposer(() => order.push('renderer.dispose'));
    host.addDisposer(() => order.push('removeListener'));
    host.start();
    host.notifyContextRestored(true);
    expect(host.status).toBe('running');
    host.dispose();
    expect(host.status).toBe('disposed');
    expect(order).toEqual(['removeListener', 'renderer.dispose']); // 逆序
    host.dispose();
    host.start();
    expect(host.status).toBe('disposed'); // 释放后不可复活
  });
});

describe('结果 schema 与判定矩阵（卡 C DoD 口径）', () => {
  function contextOkEvidence(): ContextInjectionEvidence {
    return {
      ...emptyContextEvidence(),
      injectionMode: 'gl-ext', extAvailable: true, lostObserved: true, sessionContinuedWhileLost: true,
      restoreOk: true, restoreVia: 'event', firstFrameDtSec: 0, pauseFrozenFrames: 0, resumeDtSec: 0,
      clockResetOk: true, pendingFramesMax: 1, framesWhilePaused: 0,
      secondRestoreAttempted: true, secondRestoreFailed: true, pausedOnFinalFailure: true,
      errorPageShown: true, inputIgnoredWhilePaused: true, error: null,
    };
  }

  function run(runIndex: number, cacheState: RuntimeRunRecord['cacheState']): RuntimeRunRecord {
    return { runIndex, cacheState, at: 1, sixdirOk: true, statesOk: true, contextOk: true, failures: 0 };
  }

  function baseContext(overrides: Partial<RuntimeResultContext> = {}): RuntimeResultContext {
    const device = {
      brand: 'HONOR', model: 'PTP-AN20', system: 'Android 16', platform: 'android',
      SDKVersion: '3.17.3', benchmarkLevel: 60, pixelRatio: 3,
      screenWidth: 1098, screenHeight: 2400, windowWidth: 366, windowHeight: 800,
      vendor: 'Qualcomm', renderer: 'Adreno (TM) 740', unmaskedVendor: 'Qualcomm', unmaskedRenderer: 'Adreno (TM) 740',
      glVersion: 'WebGL 2.0', glslVersion: 'WebGL GLSL ES 3.00',
      maxVertexUniformVectors: 256, deviceHash: '',
    };
    const clip = (expected: string, active: string) => ({
      expectedClipKey: expected, activeClipKey: active, ok: expected === active,
    });
    return {
      device,
      canvas: {
        backbuffer: { width: 1098, height: 2400 },
        requestedAttributes: { antialias: true },
        effectiveAttributes: { antialias: false },
        dpr: 3, renderScale: 1, dprCappedAt: 3,
      },
      rendererInfo: {
        edgeMode: 'fxaa', effectiveAntialias: false, jointCount: 41, vertexCount: 29281, indexCount: 48419 * 3,
        counters: { drawCalls: 20, paletteUploads: 20, frames: 1 },
      },
      resource: {
        mode: 'local-subpackage', executedBranches: ['a'], notExecutedBranches: ['b'],
        modelResolvedPath: 'subpackages/char3d-assets/characters/hero/x/hero.glb',
        assetStages: { loaderMs: 1 }, loaderStats: { downloads: 5 }, reloadStats: { cacheHits: 5 },
        hotChainObserved: true, loadStatus: 'ready', diagnostics: [],
      },
      sixDir: ALL_FACINGS.map((facing) => ({
        facing, state: 'idle' as const, footX: 1, footY: 2, ...clip('idle', 'idle'), placed: null, screenshot: null,
      })),
      states: ALL_STATES.map((state) => ({ state, ...clip('idle', 'idle'), trio: null, screenshot: null })),
      jumpTrios: MOVE_LOCK_CASES.map((c) => ({
        caseId: c.caseId, snapIsJump: c.syntheticSnapshotIsJump, cmdIsJump: c.expectedCmdIsJump,
        activeClipKey: c.expectedClipKey, note: c.note,
      })),
      context: contextOkEvidence(),
      capacity: [],
      runs: [run(1, 'cold'), run(2, 'cold'), run(3, 'cold'), run(4, 'hot'), run(5, 'hot'), run(6, 'hot')],
      env: { sim: false, commitSha: 'x'.repeat(40), profile: 'spec', screenshots: [], notes: [] },
      ...overrides,
    };
  }

  it('冷 3 + 热 3 全绿 ⇒ DEVICE_PASS；未满 ⇒ DEVICE_INCOMPLETE（**不是失败**）', () => {
    expect(buildResult(baseContext()).verdict.device).toBe('DEVICE_PASS');
    const partial = buildResult(baseContext({ runs: [run(1, 'cold'), run(2, 'cold')] }));
    expect(partial.verdict.device).toBe('DEVICE_INCOMPLETE');
    expect(partial.notes.join(' ')).toContain('不是失败');
    expect(partial.notes.join(' ')).toContain('冷启动 2/3');
  });

  it('资源门失败 ⇒ DEVICE_FAIL + 诊断原文', () => {
    const res = buildResult(baseContext({
      resource: { ...baseContext().resource, loadStatus: 'failed', diagnostics: ['sha256-mismatch'] },
    }));
    expect(res.verdict.device).toBe('DEVICE_FAIL');
    expect(res.notes.join(' ')).toContain('sha256-mismatch');
  });

  it('六向/全状态逐行 ok 裁决；短档 20u 不得当容量结论；spec 档才出 CAPACITY_*', () => {
    const badSix = buildResult(baseContext({
      sixDir: ALL_FACINGS.map((facing) => ({
        facing, state: 'idle' as const, footX: 0, footY: 0, expectedClipKey: 'idle', activeClipKey: null,
        placed: null, screenshot: null, ok: false,
      })),
    }));
    expect(badSix.verdict.sixdir).toBe('FAIL');
    const short = buildResult(baseContext({
      capacity: [{
        unitCount: 20, durationSec: 6, sampleCount: 400, fpsMean: 60, fpsMedian: 60, onePercentLowFps: 55,
        frameMsMedian: 16, frameMsP95: 17, frameMsP99: 18, over33msRatio: 0, over50msRatio: 0,
        passMsMedian: 1, passMsMean: 1, animMsMean: 1, submitMsMean: 1, compositeCpuMsMean: 1,
        gpuMs: null, gpuMsSource: 'unavailable', contextLostCount: 0, glErrorCount: 0,
        drawCallsPerFrame: 20, skinPalettesPerFrame: 20, allUnitsOnScreen: true, visibilityNote: '',
        specProfile: false, a2Profile: 'sim-short', truncated: false, truncateReason: null,
      }],
    }));
    expect(short.verdict.capacity20).toBe('NON_SPEC_PROFILE_NOT_APPLICABLE');
    // 机械判定仍在（同一份 judgeCapacity20），但**非 spec 口径本身**就是它的驳回理由之一 ⇒ 不得当结论
    expect(short.verdict.capacity20Engine).toBe('A_COMPATIBLE_CAPACITY_FAIL');
    expect(short.verdict.capacity20Reasons?.join(' ')).toContain('非方案口径采样');
    expect(short.notes.join(' ')).toContain('不作为容量结论');
  });

  it('sim ⇒ 所有结论加 SIM_ 前缀 + 明确声明非真机证据', () => {
    const sim = buildResult(baseContext({ env: { sim: true, commitSha: '', profile: 'sim-short', screenshots: [], notes: [] } }));
    expect(sim.verdict.device).toBe('SIM_DEVICE_PASS');
    expect(sim.verdict.sixdir).toBe('SIM_PASS');
    expect(sim.notes.join(' ')).toContain('不是');
    expect(sim.notes.join(' ')).toContain('微信/安卓能力证据');
  });

  it('无 WEBGL_lose_context ⇒ 只算替代验证（ALTERNATE_ONLY_*，不得写 PASS）', () => {
    const alt = buildResult(baseContext({
      context: { ...contextOkEvidence(), injectionMode: 'host-api-fallback', extAvailable: false },
    }));
    expect(alt.verdict.contextRestore).toBe('ALTERNATE_ONLY_PASS');
    expect(alt.notes.join(' ')).toContain('未见真注入');
  });

  it('contextEvidenceOk 逐项都要成立（少任一项即 false）', () => {
    const ok = contextOkEvidence();
    expect(contextEvidenceOk(ok)).toBe(true);
    // 判据读到的每一项都单独打破一次（boolean → false；数值 → 越界值）
    const breaks: Array<[keyof ContextInjectionEvidence, boolean | number | string]> = [
      ['lostObserved', false],
      ['sessionContinuedWhileLost', false],
      ['restoreOk', false],
      ['restoreVia', 'none'],
      ['clockResetOk', false],
      ['pendingFramesMax', 2],
      ['framesWhilePaused', 3],
      ['secondRestoreAttempted', false],
      ['secondRestoreFailed', false],
      ['pausedOnFinalFailure', false],
      ['errorPageShown', false],
      ['inputIgnoredWhilePaused', false],
    ];
    for (const [key, value] of breaks) {
      const broken = { ...ok, [key]: value } as ContextInjectionEvidence;
      expect(contextEvidenceOk(broken), String(key)).toBe(false);
    }
  });

  it('结果出口：console 单行前缀 / 分享文件名 / deviceHash 可复算', () => {
    const res = buildResult(baseContext());
    expect(toConsoleLine(res).startsWith(CONSOLE_RESULT_PREFIX)).toBe(true);
    expect(JSON.parse(toConsoleLine(res).slice(CONSOLE_RESULT_PREFIX.length)).schemaVersion).toBe('t31-fe-c-1.0');
    expect(shareFileName(res)).toBe('char3d_' + res.device.deviceHash + '_result_run6.json');
    expect(deviceHashOf(res.device)).toBe(res.device.deviceHash);
    expect(runProgress(res.runs)).toEqual({ cold: 3, hot: 3, required: RUNS_REQUIRED });
    expect(res.schemaVersion).toBe('t31-fe-c-1.0');
  });

  it('tap 三态：没命中 / 未连接 / 被暂停（arch seq=421 的区分要求）', () => {
    const base = { mapped: [10, 10] as [number, number], canvasSpace: [780, 1688] as [number, number], windowSpace: [390, 844] as [number, number], nearest: { id: 'copy', d: 3 } };
    expect(classifyTap({ ...base, hit: 'copy', listenerAttached: true, paused: false })).toBe('hit');
    expect(classifyTap({ ...base, hit: null, listenerAttached: true, paused: false })).toBe('miss');
    expect(classifyTap({ ...base, hit: null, listenerAttached: false, paused: false })).toBe('not-connected');
    expect(classifyTap({ ...base, hit: 'copy', listenerAttached: true, paused: true })).toBe('paused');
    const line = toTapDiagLine({ ...base, hit: null, listenerAttached: true, paused: false });
    expect(line.startsWith(TAP_DIAG_PREFIX)).toBe(true);
    expect(JSON.parse(line.slice(TAP_DIAG_PREFIX.length)).verdict).toBe('miss');
  });
});

// ===== 4. FXAA 分支选择：宿主不越权（判定归 renderer，卡 A 用例锁定） =====

describe('FXAA 分支与像素口径（宿主侧）', () => {
  const hostSrc = readFileSync('proto/character3d_runtime_demo/host.ts', 'utf8');

  it('生产路径不传 forceEdgeMode（能力分支由有效 getContextAttributes 决定，易错点 7）', () => {
    // 只有 sim/测试注入才允许传值；真机 options.forceEdgeMode 恒 undefined
    expect(hostSrc).toContain('forceEdgeMode: options.forceEdgeMode');
    const mainSrc = readFileSync('proto/character3d_runtime_demo/main.ts', 'utf8');
    expect(mainSrc).toContain('__CHAR3D_DEMO_OPTS');
    expect(readFileSync('proto/character3d_runtime_demo/browser/index.html', 'utf8')).toContain('__WX_SHIM_AA');
  });

  it('结果记录 edgeMode / 有效 antialias / backbuffer / cacheHit（方案 §9.2 日志口径）', () => {
    for (const key of ['edgeMode', 'effectiveAntialias', 'backbuffer', 'loaderStats', 'requestedAttributes', 'effectiveAttributes']) {
      expect(hostSrc, key).toContain(key);
    }
  });

  it('参考高像素口径：宿主乘一次 dpr（config 是逻辑像素；禁 pass 再乘）', () => {
    expect(hostSrc).toContain('HERO_3D_PROFILE.screenHeightPxAtReference * dprUsed');
    expect(HERO_3D_PROFILE.screenHeightPxAtReference).toBeGreaterThan(0);
  });
});

// ===== 5. 场景表：六向/全状态/轻功三元与生产映射逐条对表 =====

describe('用例表与生产映射对表', () => {
  it('六向 6 值 + 全状态 7 值（idle/walk/basic/charge/strike/jump/dead）', () => {
    expect(ALL_FACINGS).toEqual(['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown']);
    expect(ALL_STATES).toEqual(['idle', 'walk', 'basic', 'charge', 'strike', 'jump', 'dead']);
    expect(STATE_SAMPLES.map((s) => s.label)).toEqual([...ALL_STATES]);
  });

  it('状态 → 期望槽位与方案 §5 表逐行一致（jump 走 walk+isJump，dead 走 idle 首帧）', () => {
    const byLabel = Object.fromEntries(STATE_SAMPLES.map((s) => [s.label, s]));
    expect(byLabel.idle.expectedClipKey).toBe('idle');
    expect(byLabel.walk.expectedClipKey).toBe('walk');
    expect(byLabel.basic.expectedClipKey).toBe('atk');
    expect(byLabel.charge.expectedClipKey).toBe('cast');
    expect(byLabel.strike.expectedClipKey).toBe('cast');
    expect(byLabel.jump.expectedClipKey).toBe('jump');
    expect(byLabel.jump.cmdState).toBe('walk');   // jump 不是快照 animState
    expect(byLabel.jump.isJump).toBe(true);
    expect(byLabel.jump.moveProgress).not.toBeNull();
    expect(byLabel.dead.expectedClipKey).toBe('idle');
    expect(byLabel.dead.squashY).toBeLessThan(1);
    expect(byLabel.dead.alpha).toBeLessThan(1);
  });

  it('lockedIsJump 复刻生产规则：演出有效期内消费锁定值（走满/死亡即释放）', () => {
    expect(lockedIsJump({ isJumpMove: true, t: 0.1, durationSec: 1.2 }, false)).toBe(true);
    expect(lockedIsJump({ isJumpMove: true, t: 1.19, durationSec: 1.2 }, false)).toBe(true);
    expect(lockedIsJump({ isJumpMove: true, t: 1.2, durationSec: 1.2 }, false)).toBe(false); // 走满释放
    expect(lockedIsJump({ isJumpMove: true, t: 0.5, durationSec: 1.2 }, true)).toBe(false);   // 死亡释放
    expect(lockedIsJump({ isJumpMove: false, t: 0.3, durationSec: 0.6 }, false)).toBe(false);
    expect(lockedIsJump(null, false)).toBe(false);
  });

  it('轻功三元 7 例：锁定语义覆盖 300ms 窗后 / 两个 hop=0 端点 / 释放 / 死亡', () => {
    const ids = MOVE_LOCK_CASES.map((c) => c.caseId);
    expect(ids).toContain('jump-after-300ms-snapshot-window');
    expect(ids).toContain('jump-endpoint-hop0');
    expect(ids).toContain('jump-landing-hop0');
    expect(ids).toContain('jump-released-after-duration');
    expect(ids).toContain('jump-died-releases');
    for (const c of MOVE_LOCK_CASES) {
      // 用例表的 cmdIsJump 期望必须与规则实现一致（表与规则不许各说各话）
      expect(lockedIsJump(c.intent, c.dead), c.caseId).toBe(c.expectedCmdIsJump);
      expect(c.expectedClipKey).toBe(c.expectedCmdIsJump ? 'jump' : c.dead ? 'idle' : 'walk');
    }
    // ★ 关键例：快照窗过后（本帧快照 false）命令仍为 true
    const after = MOVE_LOCK_CASES.find((c) => c.caseId === 'jump-after-300ms-snapshot-window')!;
    expect(after.snapshotIsJumpAtSample).toBe(false);
    expect(after.expectedCmdIsJump).toBe(true);
  });
});

// ===== 6. 红线（任务卡硬边界） =====

const DEMO_SOURCES = [
  'proto/character3d_runtime_demo/main.ts',
  'proto/character3d_runtime_demo/host.ts',
  'proto/character3d_runtime_demo/evidence.ts',
  'proto/character3d_runtime_demo/metrics.ts',
  'proto/character3d_runtime_demo/scenarios.ts',
  'proto/character3d_runtime_demo/adapter-local.ts',
  'proto/character3d_runtime_demo/hud.ts',
];

/** 读文件字节长度：env.d.ts 是**共享声明区**（本卡不改）⇒ 只有 `readFileSync(path, encoding)`
 *  可用，故用 base64 回算字节数（完整的 SHA-256 核对在 build.mjs 里用 node:crypto 做）。 */
function byteLengthOf(path: string): number {
  const b64 = readFileSync(path, 'base64');
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length / 4) * 3 - pad;
}

/** 去掉注释：扫「是否出现某 API/字面量」时只看真代码（与 tests/character3d-structure.test.ts 同口径）。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 只读 import/require 行（避免把注释里的说明文字当命中）。 */
function importLines(source: string): string[] {
  return source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('import ') || l.startsWith('import{') || /\brequire\(/.test(l));
}

describe('红线：卡 C 新宿主', () => {
  it('新宿主不 import proto/webgl2_probe（S0 probe 是证据工程，不是依赖）', () => {
    for (const file of DEMO_SOURCES) {
      expect(importLines(readFileSync(file, 'utf8')).filter((l) => l.includes('webgl2_probe')), file).toEqual([]);
    }
  });

  it('新宿主不 import battle-core / battle-session / 结算配置（UI 只展示，红线不变）', () => {
    for (const file of DEMO_SOURCES) {
      const lines = importLines(readFileSync(file, 'utf8'));
      for (const bad of ['battle-core', 'battle-session', 'config/numbers', 'cloudfunctions', 'settle']) {
        expect(lines.filter((l) => l.includes(bad)), `${file} 不得 import ${bad}`).toEqual([]);
      }
    }
  });

  it('新宿主消费的是**生产模块**（config/character-3d + net/character-asset-loader + ui/character3d/**）', () => {
    const host = readFileSync('proto/character3d_runtime_demo/host.ts', 'utf8');
    expect(host).toContain("from '../../config/character-3d'");
    expect(host).toContain("from '../../net/character-asset-loader'");
    expect(host).toContain("from '../../ui/character3d/renderer'");
    expect(host).toContain("from '../../ui/character3d/pass'");
    expect(host).toContain("from '../../ui/character3d/platform'");
    // 禁复制 renderer：本目录不得出现 WebGL 着色器/管线字面量
    for (const file of DEMO_SOURCES) {
      const src = stripComments(readFileSync(file, 'utf8'));
      expect(src, file).not.toContain('#version 300 es');
      expect(src, file).not.toContain('drawElements');
      expect(src, file).not.toContain('uniformMatrix4fv');
      expect(src, file).not.toContain('createProgram');
    }
    // 唯一 RAF 排程复用卡 B 已验收模块（不复制）
    expect(host).toContain("from '../battle_demo/host-runtime'");
  });

  it('ui/character3d 文件集与卡片 A 声明一致（本卡未新增/改名生产文件）', () => {
    const files = readdirSync('ui/character3d').filter((f) => f.endsWith('.ts')).sort();
    expect(files).toEqual([
      'animation.ts', 'glb.ts', 'math.ts', 'pass.ts',
      'platform-browser.ts', 'platform-wx.ts', 'platform.ts', 'renderer.ts',
    ]);
  });

  it('新宿主目录自带微信工程三件套 + 分包占位 + 构建脚本 + README', () => {
    for (const f of ['project.config.json', 'game.json', 'game.js', 'build.mjs', 'README.md', 'bundle.js',
      'subpackages/char3d-assets/game.js']) {
      expect(existsSync('proto/character3d_runtime_demo/' + f), f).toBe(true);
    }
    const gameJson = JSON.parse(readFileSync('proto/character3d_runtime_demo/game.json', 'utf8')) as {
      deviceOrientation: string;
      subpackages: Array<{ name: string; root: string }>;
    };
    expect(gameJson.subpackages).toEqual([{ name: 'char3d-assets', root: 'subpackages/char3d-assets' }]);
    for (const sp of gameJson.subpackages) {
      expect(existsSync(`proto/character3d_runtime_demo/${sp.root}/game.js`), sp.root).toBe(true);
    }
  });

  it('分包资产账与 config 清单一致（长度逐项对表；SHA 全量核对在 build.mjs）', () => {
    const refs = [HERO_3D_MODEL_REF, ...(['idle', 'atk', 'cast', 'jump'] as const).map((k) => HERO_3D_CLIP_REFS[k])];
    for (const ref of refs) {
      if ('embedded' in ref) continue;
      const p = 'proto/character3d_runtime_demo/subpackages/char3d-assets/' + ref.urlPath;
      expect(existsSync(p), p).toBe(true);
      expect(byteLengthOf(p), ref.id).toBe(ref.byteLength);
      expect(ref.urlPath).toContain('characters/hero/');
    }
    // SHA-256 全量核对由 build.mjs 的静态导入门做（那边有 node:crypto）——这里锁它确实在做
    const build = readFileSync('proto/character3d_runtime_demo/build.mjs', 'utf8');
    expect(build).toContain('sha256Hex(bytes)');
    expect(build).toContain('!== ref.byteLength');
    expect(build).toContain('!== ref.sha256');
  });

  it('bundle.js 内不含 systems/**（宿主不引结算）且不含 probe 引用', () => {
    const bundle = readFileSync('proto/character3d_runtime_demo/bundle.js', 'utf8');
    expect(/systems\/battle-core|systems\/battle-session/.test(bundle)).toBe(false);
    expect(/webgl2_probe/.test(bundle)).toBe(false);
    expect(bundle).toContain('proto/character3d_runtime_demo/main');
  });

  it('禁碰区零改动（battle-core / systems / cloudfunctions / package.json / types.ts 由 git diff 另行核对）', () => {
    // 本用例是**用例层**的可见性提醒：这五个路径的内容断言交给交付时的 git diff 证据；
    // 这里只锁「宿主不 import 它们」这一条能自动化的部分（上面已有），并确认文件仍存在。
    for (const p of ['systems/battle-core.ts', 'systems/battle-session.ts', 'types.ts', 'package.json', 'config/battle.ts']) {
      expect(existsSync(p), p).toBe(true);
    }
  });
});
