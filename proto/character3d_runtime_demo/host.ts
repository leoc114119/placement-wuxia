// ═══ T31-FE-C · proto/character3d_runtime_demo/host.ts ═══
//
// 微信小游戏 **runtime smoke 宿主**（方案 §8 卡 C）。它只做四件事：
//   ① 装配**生产** 2.5D 运行时（config/character-3d + net/character-asset-loader + ui/character3d/**）
//      —— 禁复制 renderer；本目录不含任何渲染/解析实现，只有编排与证据；
//   ② 六向 + 全状态（idle/walk/basic/charge/strike/jump/dead）逐项取景，并列
//      snapIsJump / cmdIsJump / activeClipKey 三元（arch seq=421）；
//   ③ 真机注入上下文丢失/恢复：短 lost 时人物提交暂停但 session 继续；单 RAF；恢复/暂停后时钟重置
//      不补算停顿；二次重建终失败 → 暂停对局（停 tick/输入）+ 显式错误页（方案 §6.2）；
//   ④ FXAA 分支下的 1/5/10/20 单位复测（S0 §5.3 六条阈值）+ 结果回收
//      （屏上分页 / console 单行 / 文件分享 / 剪贴板，另留 tap 诊断单行）。
//
// 模块分工：metrics（采样判定）/ evidence（schema+判定+命名）/ scenarios（用例表）/
//   adapter-local（资源链与平台）/ hud（屏上绘制）—— 全是纯函数或纯绘制，可被 vitest 单测。
//   唯一 RAF 排程 + 暂停/恢复 + 释放链复用卡 B 已验收的 `../battle_demo/host-runtime`（不复制）。
//
// 平台边界：本文件是宿主适配层，允许直接触 `wx.*`（另两处是 ui/character3d/platform-wx.ts 与
//   adapter-local.ts）；渲染/loader/动画等生产模块内零 wx 调用（红线用例锁定）。

import {
  CHARACTER_3D_FXAA,
  CHARACTER_3D_LIGHT,
  CHARACTER_3D_ORTHO_Z_HALF,
  CHARACTER_3D_RENDER_SCALE,
  HERO_3D_ACTION_MAP,
  HERO_3D_CLIP_REFS,
  HERO_3D_CLIP_SOURCE_SEC,
  CHARACTER_3D_CROSS_FADE_SEC,
  CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
  HERO_3D_MODEL_ACCOUNT,
  HERO_3D_MODEL_REF,
  HERO_3D_PROFILE,
  HERO_3D_PROFILE_ID,
} from '../../config/character-3d';
import {
  createCharacterAssetLoader,
  type CharacterAssetLoadResult,
  type CharacterAssetLoaderStats,
  type Character3DProfileLoadResult,
} from '../../net/character-asset-loader';
import { createCharacter3DRenderer, type Character3DRenderer } from '../../ui/character3d/renderer';
import { createCharacter3DPass, type Character3DPass } from '../../ui/character3d/pass';
import { createModelStructureValidator, decodeUtf8, loadCharacter3DModel, type Character3DModel } from '../../ui/character3d/glb';
import { resolveClipSource, type Character3DAnimConfig, type Character3DClipRegistry } from '../../ui/character3d/animation';
import type { Character3DPlatform } from '../../ui/character3d/platform';
import type { Character3DClipKey, CharacterRenderCommand, Character3DPassResult } from '../../types';
import { createHostRuntime, type HostRuntime } from '../battle_demo/host-runtime';
import * as E from './evidence';
import * as M from './metrics';
import * as S from './scenarios';
import { SUBPACKAGE_NAME, createResourcePlatform, resolveResourceChainPlan, type ReadSourceTracker, type ResourceChainPlan } from './adapter-local';
import { validateClipJsonStructure } from './text-assets';

import { BUTTON_LABELS, computeLayout, drawHud, hitTest, paginate, type HudLayout, type HudView } from './hud';

// ===== 宿主能力面（最小声明；本文件是宿主适配层，允许触 wx.*） =====

interface WxErr { errMsg?: string }
interface WxSystemInfo {
  brand?: string; model?: string; system?: string; platform?: string;
  SDKVersion?: string; benchmarkLevel?: number; pixelRatio?: number;
  screenWidth?: number; screenHeight?: number; windowWidth?: number; windowHeight?: number;
}
interface WxCanvas { width: number; height: number; getContext(type: string, attributes?: unknown): unknown }
interface WxFileSystemManager {
  writeFileSync(path: string, data: ArrayBuffer | string, encoding?: string): void;
  readFileSync(path: string, encoding?: string): ArrayBuffer | string;
  accessSync(path: string): void;
}
interface WxRuntime {
  env: { USER_DATA_PATH: string };
  getSystemInfoSync(): WxSystemInfo;
  createCanvas(): WxCanvas;
  getFileSystemManager(): WxFileSystemManager;
  loadSubpackage?(o: { name: string; success: () => void; fail: (e: WxErr) => void }): unknown;
  onTouchStart?(cb: (e: { touches?: Array<{ clientX: number; clientY: number }> }) => void): void;
  setClipboardData?(o: { data: string; success: () => void; fail: (e: WxErr) => void }): void;
  shareFileMessage?(o: { filePath: string; fileName: string; success: () => void; fail: (e: WxErr) => void }): void;
  canvasToTempFilePath?(o: { canvas: unknown; fileType?: string; quality?: number; success: (r: { tempFilePath: string }) => void; fail: (e: WxErr) => void }): void;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
}

function resolveWx(): WxRuntime {
  const g = (globalThis as unknown as { wx?: WxRuntime }).wx;
  if (g && g.env && typeof g.createCanvas === 'function') return g;
  if (typeof wx !== 'undefined') return wx as unknown as WxRuntime;
  throw new Error('[host] 无 wx 全局：不是微信小游戏宿主');
}

const STORAGE_RUNS = 'char3d-runtime-runs-v1';
const STORAGE_PERF_ALWAYS = 'char3d-runtime-perf-mode';
const STORAGE_CDN_BASE = 'char3d-cdn-base';
/** 强制走分包本地路径（屏上「切资源源」写；'auto' = 有 base 就走 cdn） */
const STORAGE_SOURCE_FORCE = 'char3d-source-force';
const COLD_SERIES = E.RUNS_REQUIRED;
const PAGED_CHARS = 1200;
const CLOCK_PAUSE_MS = 300;

// ===== 时钟与帧调度 =====

let clock: () => number = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
function nowMs(): number { return clock(); }

declare function requestAnimationFrame(cb: (t: number) => void): number;
declare function cancelAnimationFrame(id: number): void;
function requestFrame(cb: (t: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(nowMs()), 16) as unknown as number;
}
function cancelFrame(id: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}

// ===== 时间代理 renderer（只插桩计时，不改渲染行为；方案 §7 管线口径不变） =====

/** 显式逐方法委托（不用对象展开）：生产 renderer 增删方法时这里编译期暴露缺口。
 *  口径：submitMs = Σ drawUnit（uniform 上传 + drawElements 的 CPU 提交）；
 *        animMs = passMs − submitMs（动作采样 + 摆放矩阵）。 */
function createTimingRenderer(real: Character3DRenderer, sink: { submitMs: number }): Character3DRenderer {
  return {
    get canvas() { return real.canvas; },
    get status() { return real.status; },
    get edgeMode() { return real.edgeMode; },
    get jointCount() { return real.jointCount; },
    get vertexCount() { return real.vertexCount; },
    get indexCount() { return real.indexCount; },
    get backbuffer() { return real.backbuffer; },
    get contextAttributes() { return real.contextAttributes; },
    get maxVertexUniformVectors() { return real.maxVertexUniformVectors; },
    get counters() { return real.counters; },
    get diagnostics() { return real.diagnostics; },
    beginFrame(): void { real.beginFrame(); },
    drawUnit(palette: Float32Array, modelMatrix: Float32Array, alpha: number, yawDeg: number): void {
      const t0 = nowMs();
      real.drawUnit(palette, modelMatrix, alpha, yawDeg);
      sink.submitMs += nowMs() - t0;
    },
    endFrame(): void { real.endFrame(); },
    resize(cssWidth: number, cssHeight: number, dpr: number): void { real.resize(cssWidth, cssHeight, dpr); },
    notifyContextLost(): void { real.notifyContextLost(); },
    handleContextRestored(): boolean { return real.handleContextRestored(); },
    dispose(): void { real.dispose(); },
  };
}

// ===== 运行时装配结果 =====

interface Runtime3D {
  platform: Character3DPlatform;
  loaderStats: CharacterAssetLoaderStats;
  model: Character3DModel;
  renderer: Character3DRenderer;
  pass: Character3DPass;
  edgeMode: 'native-msaa' | 'fxaa';
  loadStatus: 'ready' | 'stale-3d-cache';
  stages: Record<string, number>;
  diagnostics: string[];
  modelResolvedPath: string | null;
  /** 释放本运行时。`contextLost=true` 时**跳过 renderer.dispose()**：上下文已死，
   *  在死上下文上做 GL 释放只会刷 INVALID_OPERATION（真重建路径专用）。 */
  teardown: (opts?: { contextLost?: boolean }) => void;
}

export interface RuntimeDemoOptions {
  /** 浏览器 sim：结论加 SIM_ 前缀，且**不**当作真机证据 */
  sim?: boolean;
  /** sim 下强制抗锯齿分支（真机不传：由有效 getContextAttributes 决定，易错点 7） */
  forceEdgeMode?: 'native-msaa' | 'fxaa';
  /** 短档采样（sim 用）；真机缺省 = spec 档 */
  shortProfile?: boolean;
  systemInfoOverride?: WxSystemInfo;
  now?: () => number;
  /** sim 注入：commit SHA（真机从 storage 读不到就留空，不假装） */
  commitShaOverride?: string;
}

export interface RuntimeDemoHandle {
  readonly result: E.RuntimeResult | null;
  /** 供 sim/测试驱动：跑完整流程并返回结果 JSON */
  run(): Promise<E.RuntimeResult>;
  dispose(): void;
}

interface Waiters {
  frames: Array<{ need: number; resolve: () => void }>;
  ms: Array<{ untilMs: number; resolve: () => void }>;
  until: Array<{ fn: () => boolean; resolve: (r: 'ok' | 'timeout') => void; deadlineMs: number }>;
}

/** 入口：装配 → 六向/全状态 → 上下文注入 → 压测 → 结果回收。 */
export function startRuntimeDemo(options: RuntimeDemoOptions = {}): RuntimeDemoHandle {
  if (options.now) clock = options.now;
  const host = resolveWx();
  const sys: WxSystemInfo = options.systemInfoOverride ?? safeCall(() => host.getSystemInfoSync(), {} as WxSystemInfo);
  const dpr = sys.pixelRatio && sys.pixelRatio > 0 ? sys.pixelRatio : 1;
  const dprUsed = Math.min(dpr, 3);
  const winW = sys.windowWidth ?? 375;
  const winH = sys.windowHeight ?? 667;

  // ★ 第一张 wx.createCanvas 是**屏幕画布**（platform-wx 已知坑①）：必须先建主画布，再建离屏画布。
  const mainCanvas = host.createCanvas();
  const mainCtx = mainCanvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!mainCtx) throw new Error('[host] 主画布取不到 2d 上下文');
  mainCanvas.width = Math.max(1, Math.round(winW * dprUsed));
  mainCanvas.height = Math.max(1, Math.round(winH * dprUsed));
  const bbW = mainCanvas.width;
  const bbH = mainCanvas.height;

  const layout: HudLayout = computeLayout(bbW, bbH, ['copy', 'share', 'view', 'perf', 'source', 'retry3d']);
  const view: HudView = { lines: [], footer: '', page: null };

  const state = {
    phase: 'boot',
    nowMs: nowMs(),
    lastFrameMs: nowMs(),
    lastDtSec: 0,
    frames: 0,
    buttonActions: 0,
    commands: [] as CharacterRenderCommand[],
    passResult: null as Character3DPassResult | null,
    footer: '启动中…',
    pageIndex: 0,
    pageText: null as string | null,
    perf: null as { sampler: M.Sampler; units: number } | null,
    perfResults: [] as M.CapacityRecord[],
    units: 1,
    cacheState: 'unknown' as E.RuntimeRunRecord['cacheState'],
    contextLostEvents: 0,
    glErrors: 0,
    maxOutstandingRafs: 0,
    sim: options.sim === true,
  };
  let frameTimes = { passMs: 0, animMs: 0, submitMs: 0, compositeMs: 0 };
  const submitSink = { submitMs: 0 };

  let gl: WebGL2RenderingContext | null = null;
  let runtime3d: Runtime3D | null = null;
  let host3d: HostRuntime | null = null;
  let booting = false;
  let disposed = false;
  const outstandingRafs = new Set<number>();
  /** 阶段记录（结果 JSON 的 phases/phasesOrder）：让「哪一步没跑」一眼可见 */
  const phaseRecords = new Map<string, E.PhaseRecord & { startedAt: number }>();
  function beginPhase(name: string): void {
    phaseRecords.set(name, { name, status: 'running', detail: '', ms: 0, startedAt: nowMs() });
  }
  function endPhase(name: string, status: E.PhaseStatus, detail = ''): void {
    const rec = phaseRecords.get(name);
    if (!rec) return;
    rec.status = status;
    rec.detail = detail;
    rec.ms = Math.round(nowMs() - rec.startedAt);
  }
  /** 故障注入：下一次 bootstrap3D 直接失败（用于验证 §6.2「重建失败 ⇒ 暂停 + 错误页」路径）。
   *  在**任何破坏性步骤之前**抛出 ⇒ 旧运行时/旧循环原样保留，便于验证暂停语义。 */
  let failNextRebuild: string | null = null;
  const waiters: Waiters = { frames: [], ms: [], until: [] };
  let touchListenerAttached = false;

  // ===== 等待原语（由主循环驱动；暂停期间禁 await —— 见 context 阶段顺序注释） =====

  function waitFrames(n: number): Promise<void> {
    return new Promise((resolve) => waiters.frames.push({ need: n, resolve }));
  }
  function waitMs(ms: number): Promise<void> {
    return new Promise((resolve) => waiters.ms.push({ untilMs: state.nowMs + ms, resolve }));
  }
  function waitUntil(fn: () => boolean, timeoutMs: number): Promise<'ok' | 'timeout'> {
    return new Promise((resolve) => {
      waiters.until.push({ fn, resolve, deadlineMs: state.nowMs + timeoutMs });
    });
  }

  function ensureMainLoop(): void {
    if (disposed) return;
    if (host3d && host3d.status !== 'disposed') { host3d.resume(); return; }
    host3d = createHostRuntime({
      step: (dtSec) => stepFrame(dtSec),
      raf: (cb) => {
        let id = 0;
        id = requestFrame(() => { outstandingRafs.delete(id); cb(nowMs()); });
        outstandingRafs.add(id);
        state.maxOutstandingRafs = Math.max(state.maxOutstandingRafs, outstandingRafs.size);
        return id;
      },
      cancelRaf: (id) => { outstandingRafs.delete(id); cancelFrame(id); },
    });
    host3d.start();
  }

  /** 唯一主循环的一帧：推进演出 → 画人物 → 合成到主画布 → HUD → 唤醒等待者。 */
  function stepFrame(dtSec: number): void {
    state.frames++;
    state.lastDtSec = dtSec;
    if (probeDtNextFrame) { probeDtNextFrame = false; probedDtSec = dtSec; }
    state.nowMs = nowMs();
    const wallMs = Math.max(0, state.nowMs - state.lastFrameMs);
    state.lastFrameMs = state.nowMs;
    if (runtime3d) {
      submitSink.submitMs = 0;
      const t0 = nowMs();
      const res = runtime3d.pass.render(state.commands, dtSec);
      const passMs = nowMs() - t0;
      const submitMs = submitSink.submitMs;
      state.passResult = res;
      let compositeMs = 0;
      if (res.status === 'ready') {
        const tc = nowMs();
        try {
          (mainCtx as unknown as { drawImage(img: unknown, dx: number, dy: number): void }).drawImage(runtime3d.pass.canvas as unknown, 0, 0);
        } catch { /* 合成失败只影响本帧显示；不阻断证据链 */ }
        compositeMs = nowMs() - tc;
      }
      frameTimes = { passMs, animMs: Math.max(0, passMs - submitMs), submitMs, compositeMs };
      if (state.perf) {
        state.perf.sampler.markFrameTime(state.nowMs);
        state.perf.sampler.push({
          wallMs, passMs, animMs: frameTimes.animMs, submitMs, compositeMs, gpuMs: readGpuMs(),
        });
      }
      if (state.frames % 60 === 0) sampleGlError();
    }
    drawHudFrame();
    for (let i = waiters.until.length - 1; i >= 0; i--) {
      const w = waiters.until[i];
      if (w.fn()) { w.resolve('ok'); waiters.until.splice(i, 1); }
      else if (state.nowMs >= w.deadlineMs) { w.resolve('timeout'); waiters.until.splice(i, 1); }
    }
    for (let i = waiters.frames.length - 1; i >= 0; i--) {
      waiters.frames[i].need--;
      if (waiters.frames[i].need <= 0) { waiters.frames[i].resolve(); waiters.frames.splice(i, 1); }
    }
    for (let i = waiters.ms.length - 1; i >= 0; i--) {
      if (state.nowMs >= waiters.ms[i].untilMs) { waiters.ms[i].resolve(); waiters.ms.splice(i, 1); }
    }
  }

  /** 帧后 dt 探针：`resume()` 会置空 host-runtime 的 last ⇒ **紧随其后的第一帧必须 dt=0**。
   *  必须在 resume 之前武装（否则量到的是恢复之后第 N 帧的正常间隔，口径就错了）。 */
  let probeDtNextFrame = false;
  let probedDtSec: number | null = null;
  function armDtProbe(): void { probeDtNextFrame = true; probedDtSec = null; }
  function assertProbeArmed(): void {
    if (probedDtSec === null) armDtProbe();
  }

  // ===== GPU 计时（仅真 ext；不可用 = null，禁 performance.now 冒充） =====

  let timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  const timerQueries: WebGLQuery[] = [];
  function initTimerExt(): void {
    if (!gl) return;
    try {
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as unknown as
        | { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
      timerExt = ext ? { TIME_ELAPSED_EXT: ext.TIME_ELAPSED_EXT, GPU_DISJOINT_EXT: ext.GPU_DISJOINT_EXT } : null;
    } catch { timerExt = null; }
  }
  function readGpuMs(): number | null {
    if (!gl || !timerExt) return null;
    try {
      const q = gl.createQuery();
      if (!q) return null;
      gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
      gl.endQuery(timerExt.TIME_ELAPSED_EXT);
      timerQueries.push(q);
      while (timerQueries.length > 4) { const old = timerQueries.shift(); if (old) gl.deleteQuery(old); }
      let last: number | null = null;
      while (timerQueries.length) {
        const head = timerQueries[0];
        if (!gl.getQueryParameter(head, gl.QUERY_RESULT_AVAILABLE)) break;
        const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT);
        if (!disjoint) last = gl.getQueryParameter(head, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(head);
        timerQueries.shift();
      }
      return last;
    } catch { timerExt = null; return null; }
  }

  function sampleGlError(): void {
    if (!gl) return;
    try { if (gl.getError() !== gl.NO_ERROR) state.glErrors++; } catch { /* lost 期间不可读，不计 */ }
  }

  // ===== HUD =====

  function buildLines(): string[] {
    const r = runtime3d;
    const progress = E.runProgress(readRuns());
    const bb = r ? r.renderer.backbuffer : { width: bbW, height: bbH };
    return [
      'T31-FE-C · ' + (state.sim ? 'BROWSER SIM（非真机证据）' : 'WX 真机') + ' · ' + (sys.brand ?? '?') + '/' + (sys.model ?? '?'),
      'SDK ' + String(sys.SDKVersion ?? '?') + ' · dpr ' + dpr + '(用 ' + dprUsed + ') · bb ' + bb.width + 'x' + bb.height,
      'edgeMode ' + String(r?.edgeMode ?? '—') + ' · aa有效 ' + String(r?.renderer.contextAttributes?.antialias ?? '—') +
        ' · 资源 ' + (resourcePlanCached?.mode ?? '—') + ' · 缓存 ' + state.cacheState +
        (cdnBaseInfo.url ? ' · base ' + cdnBaseInfo.url.replace(/^https?:\/\//, '') : ''),
      '冷启动 ' + progress.cold + '/' + progress.required + ' · 热缓存 ' + progress.hot + '/' + progress.required +
        ' · 本轮 #' + runIndexCached + ' · 阶段 ' + state.phase,
      '命令 ' + state.commands.length + 'u · pass ' + frameTimes.passMs.toFixed(1) + 'ms（anim ' + frameTimes.animMs.toFixed(1) +
        ' / submit ' + frameTimes.submitMs.toFixed(1) + '）· 合成 ' + frameTimes.compositeMs.toFixed(1) + 'ms',
      'RAF 峰值 ' + state.maxOutstandingRafs + ' · ctxLost ' + state.contextLostEvents + ' · GLerr ' + state.glErrors +
        ' · 帧 ' + state.frames + (r ? ' · draw/palette ' + r.renderer.counters.drawCalls + '/' + r.renderer.counters.paletteUploads : ''),
      footerVerdictLine(),
    ];
  }

  function footerVerdictLine(): string {
    const res = resolvedResult;
    if (!res) return '判定：运行中…（' + state.footer + '）';
    const v = res.verdict;
    return '判定 device=' + v.device + ' · sixdir=' + v.sixdir + ' · states=' + v.states +
      ' · ctx=' + v.contextRestore + ' · 20u=' + v.capacity20 + ' | ' + state.footer;
  }

  function drawHudFrame(): void {
    view.lines = buildLines();
    view.footer = state.footer;
    if (state.pageText !== null) {
      const pages = paginate(state.pageText, PAGED_CHARS);
      state.pageIndex = Math.max(0, Math.min(state.pageIndex, pages.length - 1));
      view.page = { index: state.pageIndex, total: pages.length, text: pages[state.pageIndex] };
    } else {
      view.page = null;
    }
    drawHud(mainCtx as unknown as Parameters<typeof drawHud>[0], layout, view);
  }

  let resourcePlanCached: ResourceChainPlan | null = null;
  /** 本次装配的 base URL 信息（写进 downloadStats：明天域名没配好时一眼看出用没用 CDN） */
  let cdnBaseInfo: { url: string | null; from: 'storage' | 'package-file' | 'none' } = { url: null, from: 'none' };
  let runIndexCached = 1;

  // ===== 装配（§6.2 清单校验 → 缓存 → 下载 → 校验 → 登记 → 解析 → 首传 GPU） =====

  /** 适配器上的读取轨迹（诊断用；两种模式都套了追踪装饰器） */
  function readSourceTrailOf(platform: Character3DPlatform): string[] {
    const p = platform as unknown as Partial<ReadSourceTracker>;
    return typeof p.readSourceTrail === 'function' ? p.readSourceTrail() : [];
  }

  /**
   * 逐资产完整性行（P0-4 诊断主载体）：**失败资产也收**——资源门拒收时最需要它。
   * 文本资产顺带跑一遍结构校验，把「设备读回的那份东西是什么规格」实账写进结果。
   */
  function collectIntegrityRows(profileLoad: Character3DProfileLoadResult): E.AssetIntegrityRow[] {
    const rows: E.AssetIntegrityRow[] = [];
    const push = (res: CharacterAssetLoadResult | null | undefined): void => {
      if (!res || !res.integrity) return;
      // 文本资产顺带把结构账算出来（即使走了 cache-hit 也给「这份字节是什么规格」的实账）
      let structuralSummary: string | null = null;
      if (res.ref.mediaType === 'application/json' && res.bytes) {
        const structural = validateClipJsonStructure(res.bytes, res.ref);
        structuralSummary =
          structural.summary + (structural.errors.length ? ' · 结构错误：' + structural.errors.join(' | ') : '');
      }
      rows.push({
        ...res.integrity,
        assetId: res.assetId,
        mediaType: res.ref.mediaType,
        integrityMode: res.integrity.mode,
        loadStatus: res.status,
        structuralSummary,
      });
    };
    push(profileLoad.model);
    for (const key of ['idle', 'atk', 'cast', 'jump'] as const) push(profileLoad.clips[key]);
    return rows;
  }

  function integrityNoteOf(resourcePlan: ResourceChainPlan): string {
    return resourcePlan.mode === 'local-subpackage'
      ? '包内文本资产（application/json）走结构不变量放行（integrityMode=structural）；GLB 与 CDN 下载路径保持严格 byteLength+SHA'
      : 'CDN 模式：全部资产保持严格 byteLength+SHA（不做结构性放行）';
  }

  /** 资源门拒收时也要把诊断带进结果 —— 故在 loadProfile 之后立刻固化证据（早于任何 throw）。 */
  function captureResourceEvidence(
    platform: Character3DPlatform,
    resourcePlan: ResourceChainPlan,
    profileLoad: Character3DProfileLoadResult,
    primary: boolean,
  ): void {
    const rows = collectIntegrityRows(profileLoad);
    const trail = readSourceTrailOf(platform);
    if (resource && !primary) {
      // 重建/重试装配：**不覆盖首装观测**（首装才是「本轮资源门是否过了、字节漂移多少」的证据），
      // 单独记在 rebuildIntegrity/rebuildReadSourceTrail（热链与再次读包的实账不丢）。
      resource.rebuildIntegrity = rows;
      resource.rebuildReadSourceTrail = trail;
      resource.diagnostics = resource.diagnostics.concat(['[rebuild] ' + profileLoad.status]).slice(0, 40);
      return;
    }
    resource = {
      mode: resourcePlan.mode,
      executedBranches: resourcePlan.executedBranches,
      notExecutedBranches: resourcePlan.notExecutedBranches,
      modelResolvedPath: resolvedCodePathOf(platform),
      assetStages: {},
      loaderStats: {},
      reloadStats: null,
      hotChainObserved: false,
      loadStatus: profileLoad.status,
      diagnostics: profileLoad.diagnostics.slice(0, 40),
      assetIntegrity: rows,
      rebuildIntegrity: null,
      readSourceTrail: trail,
      rebuildReadSourceTrail: null,
      integrityNote: integrityNoteOf(resourcePlan),
      downloadStats: buildDownloadStats(resourcePlan, profileLoad.diagnostics),
    };
  }

  /** 包内 `cdn-base.txt` 里的 base URL（真机注入路径：编辑该文件 → 重新预览即可，无需改代码）。 */
  function packagedCdnBase(): string | null {
    for (const candidate of ['cdn-base.txt', './cdn-base.txt', 'subpackages/char3d-assets/cdn-base.txt']) {
      try {
        const raw = host.getFileSystemManager().readFileSync(candidate, 'utf8');
        const url = typeof raw === 'string' ? raw.trim() : '';
        if (url) return url;
      } catch { /* 文件不存在：继续下一个候选 */ }
    }
    return null;
  }

  /** base URL 的注入优先级：storage（devtools 一行命令）→ 包内 cdn-base.txt → 未配置（走分包本地路径）。 */
  function resolveCdnBase(): { url: string | null; from: 'storage' | 'package-file' | 'none' } {
    const fromStorage = safeCall(() => host.getStorageSync(STORAGE_CDN_BASE), null) as string | null;
    if (fromStorage && String(fromStorage).trim()) return { url: String(fromStorage).trim(), from: 'storage' };
    const fromFile = packagedCdnBase();
    if (fromFile) return { url: fromFile, from: 'package-file' };
    return { url: null, from: 'none' };
  }

  /** 屏上「切资源源」：force='local' 时强制走分包（忽略 base）；否则 auto（有 base 即 cdn）。 */
  function forcedLocal(): boolean {
    return safeCall(() => host.getStorageSync(STORAGE_SOURCE_FORCE), 'auto') === 'local';
  }

  /**
   * 资源获取统计（**CDN 验收的读数主体**）：下载次数/字节/耗时/命中 + 失败原因 + 域名白名单判定。
   * ★ 失败原因里出现"合法域名/domain"字样 ⇒ `domainBlocked=true`：明天域名没配好时，屏上单行与结果字段
   *   都能直接指向「downloadFile 合法域名未配置」，而不用猜。
   */
  function buildDownloadStats(
    resourcePlan: ResourceChainPlan,
    diagnostics: readonly string[],
  ): E.ResourceChainEvidence['downloadStats'] {
    const stats = lastLoaderStats ?? ({} as CharacterAssetLoaderStats);
    const reasons = diagnostics
      .filter((d) => d.includes('attempt-failed') || d.includes('downloadFile') || d.includes('失败'))
      .slice(0, 5);
    const domainBlocked = reasons.some((d) => /合法域名|domain|not in domain list/i.test(d));
    return {
      sourceMode: resourcePlan.mode,
      baseUrl: cdnBaseInfo.url ?? '',
      baseUrlSource: cdnBaseInfo.from,
      forcedLocal: forcedLocal(),
      downloads: stats.downloads ?? 0,
      downloadAttempts: stats.downloadAttempts ?? 0,
      bytes: stats.downloadBytesTotal ?? 0,
      ms: stats.downloadMsTotal ?? 0,
      cacheHits: stats.cacheHits ?? 0,
      staleFallbacks: stats.staleFallbacks ?? 0,
      failures: stats.failures ?? 0,
      timeouts: stats.timeouts ?? 0,
      networkErrors: stats.networkErrors ?? 0,
      domainBlocked,
      failureReasons: reasons,
    };
  }

  function plan(): ResourceChainPlan {
    const base = resolveCdnBase();
    cdnBaseInfo = { url: base.url, from: base.from };
    if (forcedLocal()) {
      const local = resolveResourceChainPlan({ cdnBaseUrl: null });
      cdnBaseInfo = { url: null, from: base.from };
      return local;
    }
    return resolveResourceChainPlan({ cdnBaseUrl: base.url });
  }

  function loadSubpackage(resourcePlan: ResourceChainPlan): Promise<number> {
    if (resourcePlan.mode !== 'local-subpackage' || typeof host.loadSubpackage !== 'function') return Promise.resolve(0);
    const t0 = nowMs();
    return new Promise<number>((resolve) => {
      try {
        host.loadSubpackage!({
          name: SUBPACKAGE_NAME,
          success: () => resolve(Math.round(nowMs() - t0)),
          fail: () => resolve(Math.round(nowMs() - t0)), // 失败不吞：随后 readFile 会如实失败并进失败页
        });
      } catch { resolve(Math.round(nowMs() - t0)); }
    });
  }

  async function bootstrap3D(
    resourcePlan: ResourceChainPlan,
    coldSeries: boolean,
    opts: { contextLost?: boolean } = {},
  ): Promise<void> {
    if (booting) return;
    booting = true;
    try {
      if (failNextRebuild !== null) {
        const why = failNextRebuild;
        failNextRebuild = null;
        throw new Error(why); // 故障注入：不触碰既有运行时（见 failNextRebuild 注释）
      }
      disposeRuntime({ contextLost: opts.contextLost === true });
      const stages: Record<string, number> = {};
      stages.subpackageMs = await loadSubpackage(resourcePlan);
      const platform = createResourcePlatform(resourcePlan);

      // 冷启动系列：先按 assetId 清 LKG（走**生产** cacheRemove，不手改 storage），让冷链真跑一遍
      if (coldSeries) {
        for (const ref of [HERO_3D_MODEL_REF, ...profileClipRefs()]) {
          try { await platform.cacheRemove(ref.id); } catch { /* 清理失败会体现为 cache-hit，如实记录 */ }
        }
      }

      const loader = createCharacterAssetLoader({
        platform,
        cdnBaseUrl: resourcePlan.cdnBaseUrl,
        structureValidator: (bytes, ref) => {
          if (ref.mediaType === 'model/gltf-binary') createModelStructureValidator(HERO_3D_MODEL_ACCOUNT)(bytes, ref);
        },
        // ★ R2：身份**一律严格**（包内载荷 .bin 已字节保真）；结构校验降级为**纯诊断 + 动作存活门**。
        textStructureDiagnostic: (bytes, ref) => {
          const structural = validateClipJsonStructure(bytes, ref);
          return {
            errors: structural.errors,
            summary: structural.summary,
            motionStatic: structural.motionStatic,
            fatalReason: structural.fatalReason,
          };
        },
      });
      const tLoad = nowMs();
      const profileLoad = await loader.loadProfile(HERO_3D_PROFILE);
      stages.loaderMs = Math.round(nowMs() - tLoad);
      const stats = loader.stats();
      lastLoaderStats = stats;
      // ★ 先固化证据（含逐资产完整性行 + 读取轨迹），再决定是否 throw —— 资源门拒收时诊断必须活着
      // primary = 首次装配（resource 还没有）；重建/重试走 rebuildIntegrity 分支，不污染首装证据
      const isPrimaryAssembly = resource === null;
      captureResourceEvidence(platform, resourcePlan, profileLoad, isPrimaryAssembly);
      if (resource && isPrimaryAssembly) resource.loaderStats = flattenStats(stats);
      if (profileLoad.status === 'failed' || !profileLoad.model?.bytes) {
        emitIntegrityConsoleLine(resource);
        throw new Error('资源门失败：' + (profileLoad.diagnostics.slice(0, 4).join(' | ') || '未知'));
      }
      const tParse = nowMs();
      const model = loadCharacter3DModel(profileLoad.model.bytes);
      stages.glbParseMs = Math.round(nowMs() - tParse);
      const rawByKey: Partial<Record<Character3DClipKey, unknown>> = {};
      const tAnim = nowMs();
      for (const key of ['idle', 'atk', 'cast', 'jump'] as const) {
        const res = profileLoad.clips[key];
        if (!res?.bytes) throw new Error('动作资产缺失/失败：' + key);
        rawByKey[key] = JSON.parse(decodeUtf8(res.bytes));
      }
      stages.animParseMs = Math.round(nowMs() - tAnim);
      const baseColor = model.textureRoles.baseColor;
      if (!baseColor) throw new Error('模型缺 baseColor 贴图（§6.2 结构门）');
      const tTex = nowMs();
      const decoded = await platform.decodeImage(baseColor.bytes, baseColor.mimeType, baseColor.name);
      stages.textureDecodeMs = Math.round(nowMs() - tTex);

      const renderScale = CHARACTER_3D_RENDER_SCALE > 0 ? CHARACTER_3D_RENDER_SCALE : 1;
      const canvas3d = platform.createOffscreenCanvas(
        Math.max(1, Math.round(bbW * renderScale)),
        Math.max(1, Math.round(bbH * renderScale)),
      );
      const tGpu = nowMs();
      const realRenderer = createCharacter3DRenderer({
        canvas: canvas3d,
        model,
        baseColor: decoded,
        platform,
        light: CHARACTER_3D_LIGHT,
        orthoZHalf: CHARACTER_3D_ORTHO_Z_HALF,
        renderScale: CHARACTER_3D_RENDER_SCALE,
        fxaa: CHARACTER_3D_FXAA,
        // 生产不传（能力分支由有效 getContextAttributes 决定，易错点 7）；仅 sim 诊断传值
        forceEdgeMode: options.forceEdgeMode,
      });
      stages.firstGpuUploadMs = Math.round(nowMs() - tGpu);
      if (realRenderer.status !== 'ready') {
        realRenderer.dispose();
        throw new Error('renderer 初始化失败：' + (realRenderer.diagnostics.join(' | ') || realRenderer.status));
      }
      gl = (canvas3d as unknown as { getContext(t: string): WebGL2RenderingContext | null }).getContext('webgl2');
      initTimerExt();

      const evtCanvas = canvas3d as unknown as {
        addEventListener?: (t: string, cb: (e: { preventDefault?: () => void }) => void) => void;
        removeEventListener?: (t: string, cb: (e: { preventDefault?: () => void }) => void) => void;
      };
      // ★ 迟到的宿主事件必须被丢弃：已 lost 时重复 lost 事件不得重复计数；已 ready 时迟到的
      //   restored 事件**不得**把渲染器再打一次重建（renderer 只允许重建一次，§6.2）。
      const onLost = (e?: { preventDefault?: () => void }): void => {
        e?.preventDefault?.();
        if (realRenderer.status !== 'ready') return;
        state.contextLostEvents++;
        realRenderer.notifyContextLost();
      };
      const onRestored = (): void => {
        if (realRenderer.status !== 'context-lost') return;
        const ok = realRenderer.handleContextRestored();
        if (ok) { armDtProbe(); host3d?.resume(); }
      };
      evtCanvas.addEventListener?.('webglcontextlost', onLost);
      evtCanvas.addEventListener?.('webglcontextrestored', onRestored);

      const anim: Character3DAnimConfig = {
        actionMap: HERO_3D_ACTION_MAP,
        crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
        jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
        clips: buildClipRegistry(model, rawByKey),
      };
      const renderer = createTimingRenderer(realRenderer, submitSink);
      const pass = createCharacter3DPass({
        renderer,
        viewport: { width: Math.max(1, Math.round(bbW * renderScale)), height: Math.max(1, Math.round(bbH * renderScale)) },
        runtimes: {
          [HERO_3D_PROFILE_ID]: {
            // §4.1 像素口径：config 参考高是**逻辑**像素，GL 正交空间是物理像素 ⇒ 宿主乘一次 dpr
            profile: { ...HERO_3D_PROFILE, screenHeightPxAtReference: HERO_3D_PROFILE.screenHeightPxAtReference * dprUsed },
            model,
            anim,
          },
        },
        loadState: 'ready',
      });
      runtime3d = {
        platform, loaderStats: stats, model, renderer, pass,
        edgeMode: renderer.edgeMode,
        loadStatus: profileLoad.status === 'stale-3d-cache' ? 'stale-3d-cache' : 'ready',
        stages,
        diagnostics: [...profileLoad.diagnostics, ...renderer.diagnostics],
        modelResolvedPath: resolvedCodePathOf(platform),
        teardown: (teardownOpts?: { contextLost?: boolean }) => {
          evtCanvas.removeEventListener?.('webglcontextlost', onLost);
          evtCanvas.removeEventListener?.('webglcontextrestored', onRestored);
          // 上下文已丢失时不做 GL 释放（死上下文上的 GL 调用只会刷 INVALID_OPERATION）
          if (teardownOpts?.contextLost !== true) renderer.dispose();
        },
      };
      state.cacheState = classifyCache(stats);
      ensureMainLoop();
      await waitFrames(2);
    } finally {
      booting = false;
    }
  }

  function disposeRuntime(opts: { contextLost?: boolean } = {}): void {
    host3d?.dispose();
    host3d = null;
    if (runtime3d) {
      try { runtime3d.teardown({ contextLost: opts.contextLost === true }); } catch { /* 释放异常不阻断重装配 */ }
    }
    runtime3d = null;
    gl = null;
  }

  /**
   * ★【T31-FE-C P0-3】**真重建**（方案 §6.2 原文：「尝试重建一次并**重传缓存资源**」）。
   *
   * 与「扩展恢复」的区别：`restoreContext()` 只在平台允许时有效；微信模拟器直接拒绝
   * （实测 `WebGL: INVALID_OPERATION: restoreContext: context restoration not allowed`）。
   * 真重建不依赖平台扩展：处置旧 canvas/context（已丢失 ⇒ 跳过 GL 释放）→ **新建**离屏 canvas 与
   * webgl2 context → 经 `net/character-asset-loader` 从缓存重新装配（热命中链，即"重传缓存资源"）→
   * 重新上传 GPU 资源 → 恢复提交与对局。**不因快路径不可用而判失败**。
   */
  async function rebuild3D(reason: string): Promise<void> {
    state.footer = '上下文真重建（' + reason + '）…';
    await bootstrap3D(plan(), false, { contextLost: true });
    state.commands = [singleIdleCommand()];
    state.units = 1;
    armDtProbe();
    host3d?.resume();
    await waitFrames(2);
  }

  // ===== 阶段 1：引导 + 资源链证据 =====

  async function phaseBoot(): Promise<void> {
    state.phase = 'boot';
    beginPhase('boot');
    const resourcePlan = plan();
    resourcePlanCached = resourcePlan;
    const runs = readRuns();
    runIndexCached = runs.length + 1;
    const coldSeries = runIndexCached <= COLD_SERIES;
    state.footer = coldSeries ? '冷启动系列：清缓存后装配（资源门）…' : '热缓存系列：直接装配（资源门）…';
    await bootstrap3D(resourcePlan, coldSeries);
    const r = runtime3d;
    if (!r) throw new Error('装配后运行时为空');
    if (resource) {
      resource.assetStages = { ...r.stages };
      resource.loaderStats = flattenStats(r.loaderStats);
      resource.modelResolvedPath = r.modelResolvedPath;
      resource.loadStatus = r.loadStatus;
    }
    emitIntegrityConsoleLine(resource);
    state.footer = '装配完成 · ' + r.edgeMode + ' · 缓存 ' + state.cacheState;
    runs.push({
      runIndex: runIndexCached, cacheState: state.cacheState, at: Math.round(state.nowMs),
      sixdirOk: false, statesOk: false, contextOk: false, failures: 0,
    });
    writeRuns(runs);
    endPhase('boot', 'ok', 'edgeMode=' + r.edgeMode + ' · 缓存=' + state.cacheState + ' · ' + resourcePlan.mode);
  }

  // ===== 阶段 2：六向 + 全状态 + 轻功三元 =====

  async function phaseScenarios(): Promise<{ sixDir: E.FacingEvidenceRow[]; states: E.StateEvidenceRow[]; trios: E.JumpTrioRow[] }> {
    state.phase = 'sixdir';
    beginPhase('sixdir');
    const sixDir: E.FacingEvidenceRow[] = [];
    for (const sample of S.FACING_SAMPLES) {
      const footX = sample.u * bbW;
      const footY = sample.v * bbH;
      const cmd: CharacterRenderCommand = {
        actorId: 'dir-' + sample.facing, profileKey: HERO_3D_PROFILE_ID,
        footX, footY, depthKey: 0, facing: sample.facing,
        state: sample.state, isJump: false,
        stateElapsedSec: sample.state === 'walk' ? 0.4 : 0.2,
        moveProgress: sample.state === 'walk' ? 0.4 : null,
        hopPx: 0, alpha: 1, squashY: 1,
      };
      state.commands = [cmd];
      state.footer = '六向 · ' + sample.facing + ' / ' + sample.state;
      await waitFrames(30);
      const controller = runtime3d?.pass.controllers.get(cmd.actorId) ?? null;
      const activeClipKey = controller ? controller.activeClipKey : null;
      const placed = state.passResult?.placed.get(cmd.actorId) ?? null;
      sixDir.push({
        facing: sample.facing, state: sample.state, footX, footY,
        expectedClipKey: sample.expectedClipKey, activeClipKey, placed,
        screenshot: await captureScreenshot('sixdir_' + sample.facing),
        ok: activeClipKey === sample.expectedClipKey,
      });
    }

    endPhase('sixdir', sixDir.every((row) => row.ok) ? 'ok' : 'failed',
      sixDir.map((row) => row.facing + ':' + String(row.activeClipKey)).join(' '));
    state.phase = 'states';
    beginPhase('states');
    const states: E.StateEvidenceRow[] = [];
    for (const sample of S.STATE_SAMPLES) {
      const actorId = 'state-' + sample.label;
      state.commands = [{
        actorId, profileKey: HERO_3D_PROFILE_ID,
        footX: bbW * 0.5, footY: bbH * 0.72, depthKey: 0, facing: 'right',
        // jump 是**表现态**：快照里它是 animState='walk' + isJump=true（方案 §5 末行）
        state: sample.cmdState, isJump: sample.isJump,
        stateElapsedSec: sample.stateElapsedSec, moveProgress: sample.moveProgress,
        hopPx: sample.hopPx, alpha: sample.alpha, squashY: sample.squashY,
      }];
      state.footer = '全状态 · ' + sample.label;
      await waitFrames(sample.warmupFrames);
      const controller = runtime3d?.pass.controllers.get(actorId) ?? null;
      const activeClipKey = controller ? controller.activeClipKey : null;
      states.push({
        state: sample.label, expectedClipKey: sample.expectedClipKey, activeClipKey, trio: null,
        screenshot: await captureScreenshot('state_' + sample.label),
        ok: activeClipKey === sample.expectedClipKey,
      });
    }

    endPhase('states', states.every((row) => row.ok) ? 'ok' : 'failed',
      states.map((row) => row.state + ':' + String(row.activeClipKey)).join(' '));
    // 轻功三元（arch seq=421：snapIsJump / cmdIsJump / activeClipKey 并列）
    state.phase = 'jump-trio';
    beginPhase('jump-trio');
    const trios: E.JumpTrioRow[] = [];
    for (const c of S.MOVE_LOCK_CASES) {
      const actorId = 'trio-' + c.caseId;
      const cmdIsJump = S.lockedIsJump(c.intent, c.dead);
      state.commands = [{
        actorId, profileKey: HERO_3D_PROFILE_ID,
        footX: c.footX, footY: c.footY, depthKey: 0, facing: 'right',
        state: c.state, isJump: cmdIsJump,
        stateElapsedSec: 0.4, moveProgress: c.moveProgress,
        hopPx: c.hopPx, alpha: c.dead ? 0.35 : 1, squashY: c.dead ? 0.45 : 1,
      }];
      state.footer = '轻功三元 · ' + c.caseId;
      await waitFrames(30);
      const controller = runtime3d?.pass.controllers.get(actorId) ?? null;
      const activeClipKey = controller ? controller.activeClipKey : null;
      if (activeClipKey !== c.expectedClipKey || cmdIsJump !== c.expectedCmdIsJump) {
        state.footer = '✗ ' + c.caseId + '：期望 clip=' + c.expectedClipKey + '/cmd=' + String(c.expectedCmdIsJump) +
          '，实得 clip=' + String(activeClipKey) + '/cmd=' + String(cmdIsJump);
      }
      trios.push({ caseId: c.caseId, snapIsJump: c.syntheticSnapshotIsJump, cmdIsJump, activeClipKey, note: c.note });
    }
    const trioOk = trios.every((t) => S.MOVE_LOCK_CASES.find((c) => c.caseId === t.caseId)?.expectedClipKey === t.activeClipKey);
    endPhase('jump-trio', trioOk ? 'ok' : 'failed', trios.map((t) => t.caseId + ':' + String(t.activeClipKey)).join(' '));
    return { sixDir, states, trios };
  }

  // ===== 阶段 3：真实上下文丢失/恢复注入（方案 §6.2） =====

  function loseExt(): { loseContext(): void; restoreContext(): void } | null {
    if (!gl) return null;
    try {
      const raw = gl.getExtension('WEBGL_lose_context') as unknown as
        | { loseContext(): void; restoreContext(): void } | null;
      return raw && typeof raw.loseContext === 'function' && typeof raw.restoreContext === 'function' ? raw : null;
    } catch { return null; }
  }

  async function phaseContext(): Promise<E.ContextInjectionEvidence> {
    state.phase = 'context';
    beginPhase('context');
    const ev = E.emptyContextEvidence();
    const r = runtime3d;
    if (!r) { ev.error = '无运行时'; endPhase('context', 'failed', '无运行时'); return ev; }
    const real = r.renderer;
    state.commands = [singleIdleCommand()];
    state.units = 1;
    await waitFrames(5);

    const ext = loseExt();
    ev.extAvailable = ext !== null;
    ev.injectionMode = ext ? 'gl-ext' : 'host-api-fallback';

    // ① 短 lost：人物提交暂停，但 session（tick）继续（方案 §6.2）
    if (ext) {
      try { ext.loseContext(); } catch { /* 已丢失也允许 */ }
      await waitFrames(2);
    }
    if (real.status !== 'context-lost') {
      // 宿主不派发事件（或 ext 不生效）⇒ 由宿主按「平台适配器负责订阅」直接调 renderer 入口
      real.notifyContextLost();
      ev.injectionMode = ext ? 'gl-ext-host-bridge' : 'host-api-fallback';
      await waitFrames(2);
    }
    ev.lostObserved = real.status === 'context-lost';
    const framesAtLoss = state.frames;
    await waitFrames(12);
    ev.sessionContinuedWhileLost = state.frames > framesAtLoss;

    // ② 恢复：**快路径优先**（平台允许扩展恢复时走事件/handleContextRestored），不可用即**真重建**
    if (ext) {
      try { ext.restoreContext(); } catch (error) { ev.fastPathError = messageOf(error); }
      await waitFrames(3);
      if (real.status === 'context-lost' && real.handleContextRestored()) {
        ev.restoreOk = true;
        ev.restoreVia = 'event';
        armDtProbe();
        host3d?.resume();
      } else if (real.status === 'ready') {
        ev.restoreOk = true; // 宿主 webglcontextrestored 事件已完成恢复（onRestored 内已 resume+武装探针）
        ev.restoreVia = 'event';
      }
    }
    if (!ev.restoreOk) {
      // ★ 快路径不可用（或没 ext）：落真重建 —— 新建 canvas/context + 从缓存重装配并重传资源。
      //   这一路径**不得**被当成失败（方案 §6.2 要的就是重建，而不是依赖扩展恢复）。
      ev.rebuildAttempted = true;
      try {
        await rebuild3D('fast-path-unavailable');
        ev.rebuildOk = true;
        ev.restoreOk = true;
        ev.restoreVia = 'rebuild';
      } catch (error) {
        ev.rebuildOk = false;
        ev.rebuildError = messageOf(error);
        ev.restoreOk = false;
        ev.restoreVia = 'unsupported';
        ev.error = '重建失败：' + messageOf(error);
      }
    }
    if (ev.restoreOk) {
      if (probedDtSec === null) { armDtProbe(); host3d?.resume(); }
      await waitFrames(2);
      ev.firstFrameDtSec = probedDtSec;
    }

    // ③ 单 RAF 断言：反复 start/resume 不得起第二条循环
    host3d?.start();
    host3d?.start();
    host3d?.resume();
    await waitFrames(8);
    ev.pendingFramesMax = Math.max(state.maxOutstandingRafs, host3d?.pendingFrames ?? 0);

    // ④ 暂停 → 时钟重置（不补算停顿）的真验证：暂停期间帧数冻结，恢复首帧 dt=0
    host3d?.pause('clock-reset-test');
    const framesAtPause = state.frames;
    await sleepWall(CLOCK_PAUSE_MS);
    ev.pauseFrozenFrames = state.frames - framesAtPause;
    armDtProbe();
    host3d?.resume();
    await waitFrames(2);
    ev.resumeDtSec = probedDtSec;
    ev.clockResetOk = ev.pauseFrozenFrames === 0 && ev.resumeDtSec === 0;

    // ⑤ 终失败路径（§6.2「重建失败 ⇒ 暂停对局 + 显式错误页」）——**故障注入**让下一次重建必失败：
    //    先制造一次丢失，再让重建抛错。注入在破坏性步骤之前 ⇒ 旧运行时/循环原样保留，
    //    于是「暂停 + 错误页 + 停 tick + 忽略输入」这套语义能在真机/模拟器上端到端验证。
    const rNow = runtime3d;
    if (rNow) {
      const ext2 = loseExt();
      if (ext2) { try { ext2.loseContext(); } catch { /* 已丢失允许 */ } }
      if (rNow.renderer.status !== 'context-lost') rNow.renderer.notifyContextLost();
    }
    ev.secondRestoreAttempted = true;
    ev.terminalFailureInjected = true;
    failNextRebuild = '注入故障：验证 §6.2 重建失败路径';
    let terminalRebuildOk = false;
    try {
      await rebuild3D('injected-terminal-failure');
      terminalRebuildOk = true;
    } catch { terminalRebuildOk = false; }
    ev.secondRestoreFailed = terminalRebuildOk === false;
    if (terminalRebuildOk) {
      ev.error = '注入故障未生效（重建竟然成功）';
    } else {
      host3d?.notifyContextRestored(false, () => {
        ev.errorPageShown = true;
        state.footer = '✗ WebGL2 上下文重建失败（§6.2）→ 已暂停对局';
      });
    }
    ev.pausedOnFinalFailure = host3d?.status === 'paused';
    const framesAtFinalPause = state.frames;
    await sleepWall(300);
    ev.framesWhilePaused = state.frames - framesAtFinalPause;

    // ⑥ 暂停期间输入被忽略（点在真实按钮中心也不得触发动作）
    const actionsBefore = state.buttonActions;
    const tap = handleTap(layout.buttons[3].rect.x0 + 8, layout.buttons[3].rect.y0 + 8, true);
    ev.inputIgnoredWhilePaused = host3d?.status === 'paused' && tap.hit !== null && state.buttonActions === actionsBefore;

    // ⑦ 连点「重试3D」三次 ⇒ 替换式重装配只起一条 RAF（并发守卫保证单发）
    for (let i = 0; i < 3; i++) handleButton('retry3d');
    await waitUntil(() => runtime3d !== null && host3d?.status === 'running', 15000);
    await waitFrames(8);
    ev.pendingFramesMax = Math.max(ev.pendingFramesMax, state.maxOutstandingRafs);
    // ⑧ 第二次装配的 loader 统计 = **真热缓存链**证据（索引命中 + 缓存文件读取，未碰"下载"一步）
    if (resource && runtime3d) {
      const hot = flattenStats(runtime3d.loaderStats);
      resource.reloadStats = hot;
      resource.hotChainObserved = (hot.cacheHits ?? 0) > 0 && (hot.downloads ?? 0) === 0;
    }
    endPhase('context', E.contextEvidenceOk(ev) ? 'ok' : 'failed',
      ev.injectionMode + ' → ' + ev.restoreVia + (ev.fastPathError ? '（快路径不可用）' : ''));
    state.footer = '上下文注入完成 · ' + ev.injectionMode + ' → ' + ev.restoreVia;
    return ev;
  }

  /** 诊断单行（结果 JSON 之外的**紧凑**通道：Leo 真机把这一行抄回来即可定位平台改写 vs 读取截断）。 */
  function emitIntegrityConsoleLine(evidence: E.ResourceChainEvidence | null): void {
    if (!evidence) return;
    logLine('__CHAR3D_INTEGRITY__=' + JSON.stringify({
      mode: evidence.mode,
      integrityNote: evidence.integrityNote,
      loadStatus: evidence.loadStatus,
      downloadStats: evidence.downloadStats,
      assets: evidence.assetIntegrity.map((row) => ({
        assetId: row.assetId,
        mediaType: row.mediaType,
        integrityMode: row.integrityMode,
        source: row.source,
        loadStatus: row.loadStatus,
        observedByteLength: row.observedByteLength,
        expectedByteLength: row.expectedByteLength,
        byteLengthMatches: row.byteLengthMatches,
        observedSha256: row.observedSha256,
        expectedSha256: row.expectedSha256,
        sha256Matches: row.sha256Matches,
        readSource: row.readSource,
        headHex64: row.headHex64,
        tailHex64: row.tailHex64,
        structuralDiagnostic: row.structuralDiagnostic,
        structuralSummary: row.structuralSummary,
        note: row.note,
      })),
      diagnostics: evidence.diagnostics.slice(0, 12),
      readSourceTrail: evidence.readSourceTrail.slice(-14),
    }));
  }

  function singleIdleCommand(): CharacterRenderCommand {
    return {
      actorId: 'ctx-hero', profileKey: HERO_3D_PROFILE_ID,
      footX: bbW * 0.5, footY: bbH * 0.7, depthKey: 0, facing: 'right',
      state: 'idle', isJump: false, stateElapsedSec: 0.2, moveProgress: null,
      hopPx: 0, alpha: 1, squashY: 1,
    };
  }

  // ===== 阶段 4：FXAA 分支下 1/5/10/20 复测（S0 §5.3） =====

  async function phasePerf(): Promise<void> {
    state.phase = 'perf';
    beginPhase('perf');
    const profile = options.shortProfile === true ? S.SIM_PROFILE : S.SPEC_PROFILE;
    const minSamples = profile.name === 'spec' ? M.REQUIRED_MIN_SAMPLES : 120;
    for (const stage of profile.stages) {
      state.units = stage.units;
      // 横向内缩先量一次：生产 placed.w 取 max(x/z 跨度)（HUD 宽锚口径，pass.ts 明文），
      // 比实际投影宽；不内缩会让最左/最右单位的 bbox 压出画布边（人没被裁，但 §5.3 的
      // 「全部落在画布内」判据要按 placed 真值来 ⇒ 用实测 w 内缩，判据与实测同一口径）
      setupUnits(stage.units, 0, false);
      await waitFrames(3);
      const inset = measureHorizontalInset(stage.units);
      setupUnits(stage.units, inset, true);
      state.footer = '压测预热 ' + profile.warmupSec + 's · ' + stage.units + 'u（别熄屏/别切走）';
      await waitMs(profile.warmupSec * 1000);
      // 可见性：readPixels 强制同步 ⇒ **只在采样窗口之外**做一次（方案 §4.2 / S0 §4）
      const visibility = checkUnitsVisible(stage.units);
      const before = snapshotCounters();
      const sampler = M.createSampler(stage.units, stage.sampleSec, minSamples);
      state.perf = { sampler, units: stage.units };
      state.footer = '采样 ' + stage.units + 'u / ' + stage.sampleSec + 's …';
      await waitUntil(() => sampler.isDone() || sampler.sampleCount >= 60 * 120, (stage.sampleSec + 30) * 1000);
      if (!sampler.isDone()) sampler.markTruncated('采样未达规定帧数/秒数（' + stage.sampleSec + 's）');
      const after = snapshotCounters();
      const dFrames = after.frames - before.frames;
      const rec = sampler.summarize({
        // §5.3 的「零 context lost / 零 GL error」指**采样窗口内**（S0 的 A2 循环口径）⇒ 用差分，
        // 不能拿全会话累计值（前面的上下文注入阶段故意丢了两次，会把 20u 档误判红）
        contextLostCount: after.contextLostEvents - before.contextLostEvents,
        glErrorCount: after.glErrors - before.glErrors,
        // 每帧调用数 = 计数器**差分** ÷ 帧差分（计数器是累计值，跨档不能直接用总量）
        drawCallsPerFrame: dFrames > 0 ? Math.round((after.drawCalls - before.drawCalls) / dFrames) : 0,
        skinPalettesPerFrame: dFrames > 0 ? Math.round((after.paletteUploads - before.paletteUploads) / dFrames) : 0,
        allUnitsOnScreen: visibility.ok,
        visibilityNote: visibility.note,
        specProfile: profile.name === 'spec',
        a2Profile: profile.name,
      });
      state.perfResults.push(rec);
      state.perf = null;
      state.footer = stage.units + 'u 完成 · fpsMedian=' + rec.fpsMedian + ' · P95=' + rec.frameMsP95;
    }
    endPhase('perf', 'ok', state.perfResults.map((r) => r.unitCount + 'u:' + r.fpsMedian).join(' '));
  }

  function snapshotCounters(): {
    frames: number; drawCalls: number; paletteUploads: number; contextLostEvents: number; glErrors: number;
  } {
    const c = runtime3d?.renderer.counters;
    return {
      frames: c?.frames ?? 0, drawCalls: c?.drawCalls ?? 0, paletteUploads: c?.paletteUploads ?? 0,
      contextLostEvents: state.contextLostEvents, glErrors: state.glErrors,
    };
  }

  /** 网格摆放。insetPx = 左右各内缩多少物理像素（0 = 铺满整宽）。 */
  function setupUnits(count: number, insetPx: number, prime: boolean): void {
    const innerW = Math.max(1, bbW - insetPx * 2);
    const cellLayout = M.layoutUnitCells(count, innerW, bbH);
    state.commands = cellLayout.cells.map((cell, i) => ({
      actorId: 'perf-' + i, profileKey: HERO_3D_PROFILE_ID,
      footX: cell.cx + insetPx, footY: cell.feetY, depthKey: i,
      facing: 'right' as const, state: 'idle' as const, isJump: false,
      stateElapsedSec: 0.3, moveProgress: null, hopPx: 0, alpha: 1, squashY: 1,
    }));
    if (!prime) return;
    // 相位错开（S0：i×0.137s 取模 idle 时长，防同相把 JS 骨架开销测低）——用 pass 公开的控制器实例
    // 预推进 viewClock；生产代码零改动（见 README §4.2）
    const controllers = runtime3d?.pass.controllers;
    if (!controllers) return;
    const idleSec = HERO_3D_CLIP_SOURCE_SEC.idle;
    for (let i = 0; i < count; i++) {
      const c = controllers.get('perf-' + i);
      if (!c) continue;
      c.update((i * S.UNIT_PHASE_STEP_SEC) % idleSec, {
        state: 'idle', isJump: false, stateElapsedSec: 0, moveProgress: null,
      });
    }
  }

  /** 实测最大 placed.w → 横向内缩（含 2px 余量）；拿不到 placed 就返回 0（判据会如实失败）。 */
  function measureHorizontalInset(count: number): number {
    const placed = state.passResult?.placed;
    if (!placed || placed.size !== count) return 0;
    let maxW = 0;
    for (const [, box] of placed) maxW = Math.max(maxW, box.w);
    return Math.ceil(maxW / 2) + 2;
  }

  /** 20u 可见性：readPixels 全幅 → 逐单位在其 placed 区域内数 alpha>0 像素（禁进采样循环）。
   *  返回 note 一并如实登记：哪一项没过、各处像素计数多少（远程可诊断，不是只给一个 false）。 */
  function checkUnitsVisible(count: number): { ok: boolean; note: string } {
    if (!gl || !runtime3d) return { ok: false, note: '无 gl/运行时' };
    const placed = state.passResult?.placed;
    if (!placed) return { ok: false, note: '无 placed（pass 未 ready）' };
    if (placed.size !== count) return { ok: false, note: 'placed 数量 ' + placed.size + ' != ' + count };
    const W = runtime3d.renderer.backbuffer.width;
    const H = runtime3d.renderer.backbuffer.height;
    const buf = new Uint8Array(W * H * 4);
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    } catch (error) { return { ok: false, note: 'readPixels 抛错：' + messageOf(error) }; }
    let globalOpaque = 0;
    for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) globalOpaque++;
    const counts: string[] = [];
    let ok = true;
    let noteReason = '';
    for (const [id, box] of placed) {
      const x0 = Math.max(0, Math.floor(box.cx - box.w / 2));
      const x1 = Math.min(W - 1, Math.ceil(box.cx + box.w / 2));
      // GL 原点在左下：屏坐标 top/h → GL y 需翻
      const y1 = Math.min(H - 1, Math.ceil(H - box.top));
      const y0 = Math.max(0, Math.floor(H - (box.top + box.h)));
      let opaque = 0;
      for (let y = y0; y <= y1; y++) {
        const row = y * W * 4;
        for (let x = x0; x <= x1; x++) if (buf[row + x * 4 + 3] > 0) opaque++;
      }
      counts.push(id + ':' + opaque);
      if (!M.isPlacedInsideViewport(box, W, H)) { ok = false; noteReason = noteReason || (id + ' placed 出屏/面积无效'); }
      if (opaque < 64) { ok = false; noteReason = noteReason || (id + ' 像素数 ' + opaque + ' < 64'); }
    }
    return {
      ok,
      note: 'fillRatio=' + (globalOpaque / (W * H)).toFixed(4) + ' bb=' + W + 'x' + H +
        (ok ? '' : ' · ' + noteReason) + ' · ' + counts.slice(0, 6).join(',') + (counts.length > 6 ? ',…' : ''),
    };
  }

  // ===== 结果回收 =====

  function captureScreenshot(tag: string): Promise<string | null> {
    if (typeof host.canvasToTempFilePath !== 'function') return Promise.resolve(null);
    return new Promise<string | null>((resolve) => {
      try {
        host.canvasToTempFilePath!({
          canvas: mainCanvas, fileType: 'png', quality: 1,
          success: (r) => {
            const name = 'char3d-' + tag + '.png';
            try {
              const fs = host.getFileSystemManager();
              fs.writeFileSync(host.env.USER_DATA_PATH + '/' + name, fs.readFileSync(r.tempFilePath) as ArrayBuffer);
              resolve(name);
            } catch { resolve(r.tempFilePath); }
          },
          fail: () => resolve(null),
        });
      } catch { resolve(null); }
    });
  }

  /** 构建标识（由 build.mjs 编进产物；真机结果里即可回答"这份产物出自哪个 commit"） */
  const buildStamp: { commitSha: string; builtAt: string; payloadSuffix: string } =
    (safeCall(() => (globalThis as unknown as {
      __CHAR3D_BUILD__?: { commitSha: string; builtAt: string; payloadSuffix: string };
    }).__CHAR3D_BUILD__, null)) ?? { commitSha: '', builtAt: '', payloadSuffix: '' };

  /** 资产清单版本：模型 + 4 条 clip 的清单 SHA 摘要（版本映射用；清单变 ⇒ 版本变）。 */
  function assetManifestVersion(): string {
    const parts = [HERO_3D_MODEL_REF.sha256, ...profileClipRefs().map((r) => r.sha256)].join('|');
    let h1 = 0x811c9dc5;
    for (let i = 0; i < parts.length; i++) {
      h1 ^= parts.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    return 'manifest-' + (h1 >>> 0).toString(16).padStart(8, '0') + '-' + parts.length + 'assets';
  }

  let resource: E.ResourceChainEvidence | null = null;
  /** 最近一次装配的 loader 统计（downloadStats 用它；重建装配也会刷新） */
  let lastLoaderStats: CharacterAssetLoaderStats | null = null;
  let resolvedResult: E.RuntimeResult | null = null;
  /** 压测后先落的 precontext 快照文件名（最终结果里注明，便于"自测失败但测量结果完好"时取证） */
  let preContextSnapshot: string | null = null;

  function deviceSnapshot(): E.RuntimeDevice {
    const device: E.RuntimeDevice = {
      brand: sys.brand ?? 'unknown', model: sys.model ?? 'unknown', system: sys.system ?? 'unknown',
      platform: sys.platform ?? 'unknown',
      SDKVersion: sys.SDKVersion ?? null,
      benchmarkLevel: sys.benchmarkLevel ?? null,
      pixelRatio: dpr,
      screenWidth: sys.screenWidth ?? 0, screenHeight: sys.screenHeight ?? 0,
      windowWidth: winW, windowHeight: winH,
      vendor: null, renderer: null, unmaskedVendor: null, unmaskedRenderer: null,
      glVersion: null, glslVersion: null,
      maxVertexUniformVectors: runtime3d?.renderer.maxVertexUniformVectors ?? null,
      deviceHash: '',
    };
    if (gl) {
      try {
        device.glVersion = String(gl.getParameter(gl.VERSION));
        device.glslVersion = String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
        device.vendor = String(gl.getParameter(gl.VENDOR));
        device.renderer = String(gl.getParameter(gl.RENDERER));
        const dbg = gl.getExtension('WEBGL_debug_renderer_info') as unknown as
          | { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number } | null;
        if (dbg) {
          device.unmaskedVendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL));
          device.unmaskedRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
        }
      } catch { /* 宿主不回读即留 null，不假装取到 */ }
    }
    device.deviceHash = E.deviceHashOf(device);
    return device;
  }

  function buildResultNow(parts: {
    sixDir: E.FacingEvidenceRow[]; states: E.StateEvidenceRow[]; trios: E.JumpTrioRow[];
    context: E.ContextInjectionEvidence; screenshots: string[];
  }): E.RuntimeResult {
    const r = runtime3d;
    const eff = r?.renderer.contextAttributes ?? null;
    const ctx: E.RuntimeResultContext = {
      device: deviceSnapshot(),
      canvas: {
        backbuffer: r ? { width: r.renderer.backbuffer.width, height: r.renderer.backbuffer.height } : null,
        requestedAttributes: { alpha: true, antialias: true, depth: true, premultipliedAlpha: true, preserveDrawingBuffer: true },
        effectiveAttributes: eff ? { ...(eff as unknown as Record<string, unknown>) } : null,
        dpr, renderScale: CHARACTER_3D_RENDER_SCALE, dprCappedAt: 3,
      },
      rendererInfo: {
        edgeMode: r?.edgeMode ?? null,
        effectiveAntialias: eff ? eff.antialias === true : null,
        jointCount: r?.renderer.jointCount ?? null,
        vertexCount: r?.renderer.vertexCount ?? null,
        indexCount: r?.renderer.indexCount ?? null,
        counters: r ? { ...r.renderer.counters } : null,
      },
      resource: resource ?? {
        mode: 'local-subpackage', executedBranches: [], notExecutedBranches: [],
        modelResolvedPath: null, assetStages: {}, loaderStats: {}, reloadStats: null,
        hotChainObserved: false, loadStatus: 'failed', diagnostics: ['未装配'],
        assetIntegrity: [], rebuildIntegrity: null, readSourceTrail: [], rebuildReadSourceTrail: null,
        integrityNote: '未装配（无完整性观测）',
        downloadStats: {
          sourceMode: 'local-subpackage', baseUrl: '', baseUrlSource: 'none', forcedLocal: false,
          downloads: 0, downloadAttempts: 0, bytes: 0, ms: 0, cacheHits: 0, staleFallbacks: 0,
          failures: 0, timeouts: 0, networkErrors: 0, domainBlocked: false, failureReasons: [],
        },
      },
      sixDir: parts.sixDir,
      states: parts.states,
      jumpTrios: parts.trios,
      context: parts.context,
      capacity: state.perfResults.slice(),
      phases: Array.from(phaseRecords.values()).map((p) => ({
        name: p.name, status: p.status, detail: p.detail, ms: p.ms,
      })),
      runs: readRuns(),
      env: {
        sim: state.sim,
        commitSha: buildStamp.commitSha || options.commitShaOverride ||
          (safeCall(() => host.getStorageSync('char3d-commit-sha'), '') as string) || '',
        build: buildStamp,
        assetManifestVersion: assetManifestVersion(),
        profile: options.shortProfile === true ? 'sim-short' : 'spec',
        screenshots: parts.screenshots.slice(),
        notes: [
          '三元并列（arch seq=421）：snapIsJump = 原始快照意图（合成输入）/ cmdIsJump = 命令上的 isJump' +
            '（= 该次移动演出创建时锁定的值）/ activeClipKey = 生产 CharacterAnimController 实际消费的资产槽位。' +
            'smoke 宿主不引 battle-core/session ⇒ snapIsJump 是合成快照意图，真实 session→view→command 链在 ' +
            'tests/battle-character3d-wiring.test.ts 已闭合，本卡不重证。',
          'assetStages：读取含在 loaderMs 内（loader 状态机是一次调用；S0 的 readFileMs 不可再分）',
          'passMs/animMs/submitMs：animMs = passMs − ΣdrawUnit（时间代理，不改生产代码）',
          '阶段顺序（phasesOrder）：' + E.PHASES_ORDER.join(' → ') +
            ' —— 测量项（六向/全状态/轻功三元/压测）**在上下文自测之前**跑完并落盘，自测失败不毒死测量结果' +
            (preContextSnapshot ? '；压测后已先落中间快照 ' + preContextSnapshot : ''),
        ],
      },
    };
    return E.buildResult(ctx);
  }

  /** 落盘一份结果（默认文件名由 evidence.shareFileName 生成；中间快照可指定后缀）。 */
  function writeResultFile(result: E.RuntimeResult, suffix = ''): string {
    const name = suffix
      ? E.shareFileName(result).replace(/\.json$/, '') + '_' + suffix + '.json'
      : E.shareFileName(result);
    try {
      host.getFileSystemManager().writeFileSync(host.env.USER_DATA_PATH + '/' + name, JSON.stringify(result), 'utf8');
    } catch { /* 写文件失败不影响 console/分享通道 */ }
    return name;
  }

  function exportResult(): void {
    if (!resolvedResult) return;
    writeResultFile(resolvedResult);
  }

  // ===== 交互 =====

  function handleButton(id: string): void {
    state.buttonActions++;
    // ★ 结果回收类按钮（复制/分享/查看）即使运行时未就绪也必须可用 —— 资源门失败时正是最需要它们的时候
    const recoveryOnly = id === 'copy' || id === 'share' || id === 'view' || id === 'retry3d' || id === 'source';
    if (!runtime3d && !recoveryOnly) {
      state.footer = '▶ ' + (BUTTON_LABELS[id] ?? id) + '：运行时未就绪';
      return;
    }
    if (id === 'retry3d') {
      state.footer = '▶ 重新装配 3D（替换式，单循环）…';
      void (async () => {
        try {
          await bootstrap3D(plan(), false);
          state.footer = '▶ 重试完成';
        } catch (error) {
          state.footer = '▶ 重试失败：' + messageOf(error);
        }
      })();
      return;
    }
    if (id === 'view') {
      state.pageText = state.pageText === null ? JSON.stringify(resolvedResult ?? { pending: true }) : null;
      state.pageIndex = 0;
      state.footer = state.pageText === null ? '▶ 返回摘要' : '▶ 分页查看（点右半下一页）';
      return;
    }
    if (id === 'copy') { void copyResult(); return; }
    if (id === 'share') { void shareResult(); return; }
    if (id === 'source') {
      // 资源源切换（明天 CDN 验收用）：有 base 时在 auto ↔ local 之间切；无 base 只提示怎么配
      const base = resolveCdnBase();
      if (!base.url) {
        state.footer = '▶ 未配置 CDN base：把 HTTPS 地址写进包内 cdn-base.txt（或 devtools: ' +
          "wx.setStorageSync('char3d-cdn-base','https://…')）后重扫";
        return;
      }
      const nextLocal = !forcedLocal();
      safeCall(() => host.setStorageSync(STORAGE_SOURCE_FORCE, nextLocal ? 'local' : 'auto'), undefined);
      state.footer = '▶ 资源源 → ' + (nextLocal ? '分包本地路径（忽略 cdn base）' : 'CDN（' + base.url + '）') + '，正在重装配…';
      void (async () => {
        try {
          await bootstrap3D(plan(), false);
          state.footer = '▶ 资源源已切：' + (nextLocal ? 'local-subpackage' : 'cdn');
        } catch (error) {
          state.footer = '▶ 切换后装配失败：' + messageOf(error);
        }
      })();
      return;
    }
    if (id === 'perf') {
      const on = safeCall(() => host.getStorageSync(STORAGE_PERF_ALWAYS), 0) !== 1;
      safeCall(() => host.setStorageSync(STORAGE_PERF_ALWAYS, on ? 1 : 0), undefined);
      state.footer = '▶ 压测常开=' + (on ? '开' : '关') + '（改后重扫生效）';
    }
  }

  async function copyResult(): Promise<void> {
    if (!resolvedResult) { state.footer = '▶ 复制：结果还没产出（阶段：' + state.phase + '）'; return; }
    const text = JSON.stringify(resolvedResult);
    const res = await withTimeout(new Promise<{ ok: boolean; errMsg: string | null }>((resolve) => {
      if (typeof host.setClipboardData !== 'function') { resolve({ ok: false, errMsg: 'wx.setClipboardData 不存在' }); return; }
      try {
        host.setClipboardData({
          data: text,
          success: () => resolve({ ok: true, errMsg: null }),
          fail: (e) => resolve({ ok: false, errMsg: e.errMsg ?? 'fail' }),
        });
      } catch (e) { resolve({ ok: false, errMsg: messageOf(e) }); }
    }), 3000, { ok: false, errMsg: '3s 无回调（宿主无响应）' });
    state.footer = res.ok ? '▶ 复制：成功（' + text.length + ' 字符）' : '▶ 复制：失败 · ' + String(res.errMsg);
    logLine('__CHAR3D_CLIPBOARD__=' + JSON.stringify({ ok: res.ok, chars: text.length, errMsg: res.errMsg }));
  }

  async function shareResult(): Promise<void> {
    if (!resolvedResult) { state.footer = '▶ 分享：结果还没产出（阶段：' + state.phase + '）'; return; }
    const fileName = E.shareFileName(resolvedResult);
    const res = await withTimeout(new Promise<{ ok: boolean; errMsg: string | null }>((resolve) => {
      if (typeof host.shareFileMessage !== 'function') { resolve({ ok: false, errMsg: 'wx.shareFileMessage 不存在（基础库不支持）' }); return; }
      try {
        host.shareFileMessage({
          filePath: host.env.USER_DATA_PATH + '/' + fileName, fileName,
          success: () => resolve({ ok: true, errMsg: null }),
          fail: (e) => resolve({ ok: false, errMsg: e.errMsg ?? 'fail' }),
        });
      } catch (e) { resolve({ ok: false, errMsg: messageOf(e) }); }
    }), 5000, { ok: false, errMsg: '5s 无回调' });
    state.footer = res.ok ? '▶ 分享：已调起（' + fileName + '）' : '▶ 分享：失败 · ' + String(res.errMsg);
    logLine('__CHAR3D_SHARE__=' + JSON.stringify({ ok: res.ok, errMsg: res.errMsg }));
  }

  /** 逻辑像素 → 背衬像素（S0 真机踩过的坐标坑：比例按当帧尺寸现算，禁写死 dpr）。 */
  function toBackbuffer(x: number, y: number): { x: number; y: number } {
    return { x: x * (winW > 0 ? bbW / winW : 1), y: y * (winH > 0 ? bbH / winH : 1) };
  }

  /** 返回 {hit, acted}：暂停期间必须 acted=false 且不推进任何动作。 */
  function handleTap(x: number, y: number, preMapped = false): { hit: string | null; acted: boolean } {
    const mapped = preMapped ? { x, y } : toBackbuffer(x, y);
    const paused = host3d?.status === 'paused';
    if (state.pageText !== null && mapped.y < layout.footerY) {
      state.pageIndex += mapped.x >= bbW / 2 ? 1 : -1;
      state.footer = '▶ 翻页';
      return { hit: 'page', acted: true };
    }
    const { hit, nearest } = hitTest(layout, mapped.x, mapped.y);
    logLine(E.toTapDiagLine({
      mapped: [Math.round(mapped.x), Math.round(mapped.y)],
      canvasSpace: [bbW, bbH],
      windowSpace: [winW, winH],
      hit, nearest, listenerAttached: touchListenerAttached, paused,
    }));
    if (hit === null) return { hit: null, acted: false };
    if (paused) { state.footer = '▶ 已暂停：输入被忽略（' + hit + '）'; return { hit, acted: false }; }
    handleButton(hit);
    return { hit, acted: true };
  }

  function attachTouch(): void {
    if (typeof host.onTouchStart !== 'function') return;
    try {
      host.onTouchStart((e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        handleTap(t.clientX, t.clientY);
      });
      touchListenerAttached = true;
    } catch { touchListenerAttached = false; }
  }

  // ===== 运行历史（冷/热系列判定） =====

  function readRuns(): E.RuntimeRunRecord[] {
    try {
      const raw = host.getStorageSync(STORAGE_RUNS);
      if (!Array.isArray(raw)) return [];
      return raw.filter((r): r is E.RuntimeRunRecord => !!r && typeof (r as E.RuntimeRunRecord).runIndex === 'number');
    } catch { return []; }
  }
  function writeRuns(runs: E.RuntimeRunRecord[]): void {
    safeCall(() => host.setStorageSync(STORAGE_RUNS, runs.slice(-12)), undefined);
  }
  function updateRun(patch: Partial<E.RuntimeRunRecord> & { failures?: number }): void {
    const runs = readRuns();
    const last = runs[runs.length - 1];
    if (!last) return;
    if (patch.sixdirOk !== undefined) last.sixdirOk = patch.sixdirOk;
    if (patch.statesOk !== undefined) last.statesOk = patch.statesOk;
    if (patch.contextOk !== undefined) last.contextOk = patch.contextOk;
    if (patch.failures !== undefined) last.failures = (last.failures ?? 0) + patch.failures;
    writeRuns(runs);
  }

  // ===== 总流程 =====

  async function runAll(): Promise<E.RuntimeResult> {
    const sixDir: E.FacingEvidenceRow[] = [];
    const states: E.StateEvidenceRow[] = [];
    const trios: E.JumpTrioRow[] = [];
    const screenshots: string[] = [];
    let contextEv = E.emptyContextEvidence();
    try {
      await phaseBoot();
      const scen = await phaseScenarios();
      sixDir.push(...scen.sixDir);
      states.push(...scen.states);
      trios.push(...scen.trios);
      for (const row of scen.sixDir) if (row.screenshot) screenshots.push(row.screenshot);
      for (const row of scen.states) if (row.screenshot) screenshots.push(row.screenshot);
      updateRun({ sixdirOk: scen.sixDir.every((r) => r.ok), statesOk: scen.states.every((r) => r.ok) });

      // ---- ③ 压测（**在上下文自测之前**：破坏性自测不得阻断被测量的项）----
      const runs = readRuns();
      const progress = E.runProgress(runs);
      const forcePerf = safeCall(() => host.getStorageSync(STORAGE_PERF_ALWAYS), 0) === 1;
      if (forcePerf || (progress.cold >= E.RUNS_REQUIRED && progress.hot >= E.RUNS_REQUIRED)) {
        await phasePerf();
      } else {
        beginPhase('perf');
        endPhase('perf', 'skipped', '冷/热未满 ' + E.RUNS_REQUIRED + ' 次且未开「压测常开」');
        state.footer = '本轮不跑压测（冷/热各满 ' + E.RUNS_REQUIRED + ' 次后自动跑；点「重跑压测」可改常开）';
      }

      // ---- ③.5 中间快照：测量项一跑完就先落盘，保证后面的上下文自测就算把运行时打坏也不丢数据 ----
      state.phase = 'measured';
      const snapshot = buildResultNow({ sixDir, states, trios, context: contextEv, screenshots });
      preContextSnapshot = writeResultFile(snapshot, 'precontext');

      // ---- ④ 最后才做上下文丢失/恢复自测（平台不支持恢复时，前面的测量结果照常产出与导出）----
      contextEv = await phaseContext();
      updateRun({ contextOk: E.contextEvidenceOk(contextEv) });
      // 扩展恢复被平台拒绝 ⇒ 如实记进「未执行分支」（不许把没跑过的路径写成已跑）
      if (resource && contextEv.fastPathError) {
        resource.notExecutedBranches = resource.notExecutedBranches.concat([
          'WEBGL_lose_context.restoreContext 扩展恢复（本平台不可用：' + contextEv.fastPathError +
            '）—— 已改走真重建（新建 canvas/context + 缓存重装配）',
        ]);
      }

      state.phase = 'done';
      resolvedResult = buildResultNow({ sixDir, states, trios, context: contextEv, screenshots });
      exportResult();
      logLine(E.toConsoleLine(resolvedResult));
      updateRun({ failures: countFailures(resolvedResult) });
      resolvedResult.runs = readRuns();
      state.footer = '完成 · ' + resolvedResult.verdict.device + ' · 20u=' + resolvedResult.verdict.capacity20;
      drawHudFrame();
      return resolvedResult;
    } catch (error) {
      state.phase = 'failed';
      state.footer = '✗ 流程失败：' + messageOf(error);
      resolvedResult = buildResultNow({ sixDir, states, trios, context: contextEv, screenshots });
      exportResult();
      logLine(E.toConsoleLine(resolvedResult));
      updateRun({ failures: 1 });
      drawHudFrame();
      return resolvedResult;
    }
  }

  function countFailures(result: E.RuntimeResult): number {
    let n = 0;
    if (!result.sixDir.every((r) => r.ok)) n++;
    if (!result.states.every((r) => r.ok)) n++;
    if (!E.contextEvidenceOk(result.context)) n++;
    return n;
  }

  const runPromise = (async (): Promise<E.RuntimeResult> => {
    attachTouch();
    return runAll();
  })();

  return {
    get result() { return resolvedResult; },
    run: () => runPromise,
    dispose: () => { disposed = true; disposeRuntime(); },
  };
}

// ===== 小工具 =====

function profileClipRefs() {
  const refs = [];
  for (const key of ['idle', 'atk', 'cast', 'jump'] as const) {
    const entry = HERO_3D_CLIP_REFS[key];
    if (entry && !('embedded' in entry)) refs.push(entry);
  }
  return refs;
}

function buildClipRegistry(model: Character3DModel, rawByKey: Partial<Record<Character3DClipKey, unknown>>): Character3DClipRegistry {
  const registry: Character3DClipRegistry = {};
  for (const key of ['idle', 'walk', 'atk', 'cast', 'jump'] as const) {
    const entry = HERO_3D_PROFILE.clips[key];
    registry[key] = resolveClipSource(key, entry, model, 'embedded' in entry ? undefined : rawByKey[key]);
  }
  return registry;
}

function resolvedCodePathOf(platform: Character3DPlatform): string | null {
  const p = platform as unknown as { resolvedCodePaths?: Record<string, string> };
  if (!p.resolvedCodePaths) return null;
  const keys = Object.keys(p.resolvedCodePaths);
  return keys.length ? p.resolvedCodePaths[keys[0]] : null;
}

function classifyCache(stats: CharacterAssetLoaderStats): E.RuntimeRunRecord['cacheState'] {
  if (stats.downloads > 0 && stats.cacheHits === 0) return 'cold';
  if (stats.cacheHits > 0 && stats.downloads === 0) return 'hot';
  if (stats.downloads > 0 || stats.cacheHits > 0) return 'mixed';
  return 'unknown';
}

function flattenStats(stats: CharacterAssetLoaderStats): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) if (typeof v === 'number') out[k] = v;
  return out;
}

function safeCall<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logLine(line: string): void {
  try { console.log(line); } catch { /* 忽略 */ }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, ms);
    promise.then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
      () => { if (!done) { done = true; clearTimeout(timer); resolve(fallback); } },
    );
  });
}

function sleepWall(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
