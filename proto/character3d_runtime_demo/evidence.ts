// T31-FE-C · proto/character3d_runtime_demo/evidence.ts —— 结果 schema / 判定 / 导出命名（纯函数）
//
// 判定口径（方案 §8 卡 C DoD + S0 §5.3 逐条落地；浏览器 sim 与真机**共用同一份逻辑**）：
//   · device   = 冷启动 ×3（loader 走 download 链）+ 热缓存 ×3（loader 走 cache-hit 链）全绿；
//                未满 3+3 ⇒ DEVICE_INCOMPLETE（**不是失败**，与 S0 的 DEVICE_A1_PASS_COLD_INCOMPLETE 同族）；
//   · sixdir   = 六向逐向有帧、且逐向 activeClipKey 与预期槽位一致；
//   · states   = idle/walk/basic/charge/strike/jump/dead 七态全部可观测（activeClipKey 逐项断言）；
//   · context  = 真实注入丢失/恢复：短暂 lost 暂停→恢复、单 RAF、恢复后首帧 dt=0、二次终失败→暂停+错误页；
//   · capacity = S0 §5.3 六条阈值（metrics.judgeCapacity20）。
//
// ★ 浏览器 sim 的结论一律加 `SIM_` 前缀 + deviceEvidence=false —— 照 S0「浏览器结果只证明代码路径通，
//   不是微信/安卓能力证据」（probe README §0 / 方案 §9.3）。**禁止**把 sim 结果写成真机 PASS。

import type { BattleFacingHex } from '../../types';
import type { CharacterAssetIntegrity } from '../../net/character-asset-loader';
import { judgeCapacity20, type CapacityRecord } from './metrics';

export const RUNTIME_SCHEMA_VERSION = 't31-fe-c-1.0';
/** console 单行前缀（S0 的 `__WEBGL2_PROBE_RESULT__` 等价物）。 */
export const CONSOLE_RESULT_PREFIX = '__CHAR3D_RUNTIME_RESULT__=';
/** tap 诊断单行前缀：区分「没命中 / 未连接 / 被暂停」。 */
export const TAP_DIAG_PREFIX = '__CHAR3D_TAP__=';
/** 冷/热启动各需几次才算齐（方案 §8 卡 C DoD）。 */
export const RUNS_REQUIRED = 3;
export const ALL_FACINGS: readonly BattleFacingHex[] = [
  'right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown',
];
export const ALL_STATES = ['idle', 'walk', 'basic', 'charge', 'strike', 'jump', 'dead'] as const;
export type RuntimeState = (typeof ALL_STATES)[number];
/** 快照 animState 的取值集（`SnapshotActor['animState']`；**不含** jump —— 轻功是 walk+isJump）。 */
export type BattleCmdState = 'idle' | 'walk' | 'basic' | 'charge' | 'strike' | 'hit' | 'dead';

/** 快照 isJump / 命令 isJump / 实际 clip 三元（arch seq=421 明文要求并列呈现）。 */
export interface JumpTrioRow {
  caseId: string;
  /** 原始快照意图（宿主喂进来的 SnapshotActor.isJump 等价物；**合成输入**，见 README §5.3 口径） */
  snapIsJump: boolean;
  /** 命令上的 isJump（= 该次移动演出创建时锁定的值；synthetic 宿主按锁定规则赋） */
  cmdIsJump: boolean;
  /** 生产 CharacterAnimController 实际消费的资产槽位（真代码输出） */
  activeClipKey: string | null;
  note: string;
}

export interface FacingEvidenceRow {
  facing: BattleFacingHex;
  state: BattleCmdState;
  /** 该向该态的采样点（脚底屏坐标，物理像素） */
  footX: number;
  footY: number;
  expectedClipKey: string;
  activeClipKey: string | null;
  /** 生产 pass 返回的 placed（HUD 锚点单一真源） */
  placed: { cx: number; top: number; w: number; h: number } | null;
  screenshot: string | null;
  ok: boolean;
}

export interface StateEvidenceRow {
  state: RuntimeState;
  expectedClipKey: string;
  activeClipKey: string | null;
  /** jump 态补三元；其余为 null */
  trio: JumpTrioRow | null;
  screenshot: string | null;
  ok: boolean;
}

export interface ContextInjectionEvidence {
  /** 注入方式：gl-ext = 真 WEBGL_lose_context；gl-ext-host-bridge = ext 生效但宿主不派发事件、
   *  由宿主直接调 renderer 入口补桥；host-api-fallback = 无 ext，仅有替代验证（**不算真注入**） */
  injectionMode: 'gl-ext' | 'gl-ext-host-bridge' | 'host-api-fallback' | 'none';
  extAvailable: boolean;
  /** 第一次 lost 是否被观测到（renderer.status 变 context-lost） */
  lostObserved: boolean;
  /** 短暂 lost 期间 session（tick）是否继续推进（方案 §6.2「暂停人物提交但 session 继续保持」） */
  sessionContinuedWhileLost: boolean;
  /** 第一次恢复是否成功（快路径或真重建**任一**成功即 true） */
  restoreOk: boolean;
  /** 恢复走的是哪条路：
   *  · `event` = 平台允许扩展恢复（`restoreContext()` + webglcontextrestored 事件 / renderer 入口）；
   *  · `rebuild` = 快路径不可用 ⇒ **真重建**：新建离屏 canvas + webgl2 context，经 loader 从缓存重新装配
   *    并重传资源（方案 §6.2「尝试重建一次并重传缓存资源」）；
   *  · `unsupported` = 两条路都没成（此时按 §6.2 走暂停 + 错误页）；
   *  · `none` = 未尝试。 */
  restoreVia: 'event' | 'rebuild' | 'unsupported' | 'none';
  /** 快路径（`restoreContext()`）抛错原文——微信模拟器实测：
   *  `WebGL: INVALID_OPERATION: restoreContext: context restoration not allowed`（该平台不允许扩展恢复） */
  fastPathError: string | null;
  /** 是否尝试过真重建 */
  rebuildAttempted: boolean;
  /** 真重建是否成功 */
  rebuildOk: boolean;
  rebuildError: string | null;
  /** 重建策略（结果里写明，避免「再失败几次才暂停」被各人理解成不同东西） */
  rebuildPolicy: string;
  /** 终失败路径是否为**故障注入**触发（验证 §6.2「重建失败 ⇒ 暂停对局 + 错误页」用） */
  terminalFailureInjected: boolean;
  /** 恢复成功后**首帧 dt**（必须为 0：host 恢复时置空 last，禁补算停顿） */
  firstFrameDtSec: number | null;
  /** 显式暂停 → 恢复：暂停期间新增帧数（必须为 0） */
  pauseFrozenFrames: number;
  /** 显式暂停 → 恢复后首帧 dt（必须为 0，且不得等于暂停时长） */
  resumeDtSec: number | null;
  /** 恢复后时钟是否重置（firstFrameDtSec===0 && resumeDtSec===0 && pauseFrozenFrames===0） */
  clockResetOk: boolean;
  /** 单循环断言：全流程 outstanding RAF 峰值（>1 即出现第二循环） */
  pendingFramesMax: number;
  /** 终失败暂停后新增帧数（必须为 0，tick 已停） */
  framesWhilePaused: number;
  /** 二次丢失 + 恢复 → 重建终失败（renderer 只试一次，方案 §6.2） */
  secondRestoreAttempted: boolean;
  secondRestoreFailed: boolean;
  /** 终失败后是否暂停对局（停 tick/输入） */
  pausedOnFinalFailure: boolean;
  /** 终失败后是否出现显式错误页 */
  errorPageShown: boolean;
  /** 暂停期间触摸是否被忽略（不触发任何动作） */
  inputIgnoredWhilePaused: boolean;
  error: string | null;
}

export function emptyContextEvidence(): ContextInjectionEvidence {
  return {
    injectionMode: 'none', extAvailable: false, lostObserved: false, sessionContinuedWhileLost: false,
    restoreOk: false, restoreVia: 'none', fastPathError: null,
    rebuildAttempted: false, rebuildOk: false, rebuildError: null,
    rebuildPolicy: 'per-loss-single-attempt', terminalFailureInjected: false,
    firstFrameDtSec: null, pauseFrozenFrames: -1, resumeDtSec: null, clockResetOk: false,
    pendingFramesMax: 0, framesWhilePaused: -1,
    secondRestoreAttempted: false, secondRestoreFailed: false,
    pausedOnFinalFailure: false, errorPageShown: false, inputIgnoredWhilePaused: false,
    error: null,
  };
}

/** §6.2 上下文恢复的完整判据（真机与 sim 共用同一份）。 */
export function contextEvidenceOk(c: ContextInjectionEvidence): boolean {
  const recovered =
    c.restoreOk && (c.restoreVia === 'event' || (c.restoreVia === 'rebuild' && c.rebuildOk));
  return (
    c.lostObserved &&
    c.sessionContinuedWhileLost &&
    recovered &&
    c.clockResetOk &&
    c.pendingFramesMax <= 1 &&
    c.framesWhilePaused === 0 &&
    c.secondRestoreAttempted &&
    c.secondRestoreFailed &&
    c.pausedOnFinalFailure &&
    c.errorPageShown &&
    c.inputIgnoredWhilePaused
  );
}


/**
 * 逐资产完整性观测行（P0-4 诊断主载体）。
 * 一次真机运行即可据此判定「平台改写」还是「读取/落盘截断」：
 *   observedByteLength/Sha256 + head/tail hex + readSource + 结构账（structuralSummary）。
 */
export interface AssetIntegrityRow extends CharacterAssetIntegrity {
  assetId: string;
  mediaType: string;
  /** 与 `mode` 同值的显式别名：任务要求结果里直接可读的 `integrityMode` 字段名 */
  integrityMode: 'strict' | 'structural';
  /** 该资产本次的装载状态（cache-hit / downloaded / stale-3d-cache / failed） */
  loadStatus: string;
  /** 文本资产的结构校验实测账（GLB = null）：把「设备读回的那份东西是什么规格」写在结果里 */
  structuralSummary: string | null;
}

export interface ResourceChainEvidence {
  mode: 'local-subpackage' | 'cdn';
  /** 真机实际被执行的分支（逐条如实列，不许写没跑过的） */
  executedBranches: string[];
  /** **未**执行的分支（例如 wx.downloadFile HTTP 白名单链路） */
  notExecutedBranches: string[];
  modelResolvedPath: string | null;
  assetStages: Record<string, number>;
  loaderStats: Record<string, number>;
  /** 替换式重装配（同进程第二次装配）的 loader 统计：**真热缓存链**的证据
   *  （cache-hits>0 且 downloads=0 ⇒ 走的是索引命中 + 缓存文件读取，不再碰"下载"一步） */
  reloadStats: Record<string, number> | null;
  /** 热链是否被真观测到（reloadStats 判定结果；false 要如实说明为什么） */
  hotChainObserved: boolean;
  loadStatus: 'ready' | 'stale-3d-cache' | 'failed';
  diagnostics: string[];
  /** 逐资产完整性观测（**首次装配**；含失败资产——失败时最需要它）；GLB 与 CDN 路径恒为 strict 口径 */
  assetIntegrity: AssetIntegrityRow[];
  /** 重建（上下文真重建 / 重试重装配）时的逐资产观测（不覆盖首装行；热链或再次读包的实账在这） */
  rebuildIntegrity: AssetIntegrityRow[] | null;
  /** 适配器读取来源轨迹（最近 30 条；branch/path/长度/摘要命中情况逐条留痕） */
  readSourceTrail: string[];
  /** 重建装配时的读取轨迹（不覆盖首装轨迹） */
  rebuildReadSourceTrail: string[] | null;
  /** 文本完整性口径说明（一行） */
  integrityNote: string;
}

export interface RuntimeDevice {
  brand: string;
  model: string;
  system: string;
  platform: string;
  SDKVersion: string | null;
  benchmarkLevel: number | null;
  pixelRatio: number;
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  /** WebGL 有效值（未掩码优先） */
  vendor: string | null;
  renderer: string | null;
  unmaskedVendor: string | null;
  unmaskedRenderer: string | null;
  glVersion: string | null;
  glslVersion: string | null;
  maxVertexUniformVectors: number | null;
  deviceHash: string;
}

export interface RuntimeRunRecord {
  /** 本机第几次运行（1 起） */
  runIndex: number;
  /** 'cold' = 本次装载走过 download 链；'hot' = 走 cache-hit 链 */
  cacheState: 'cold' | 'hot' | 'mixed' | 'unknown';
  at: number;
  sixdirOk: boolean;
  statesOk: boolean;
  contextOk: boolean;
  failures: number;
}

export interface RuntimeResultContext {
  device: RuntimeDevice;
  canvas: {
    backbuffer: { width: number; height: number } | null;
    requestedAttributes: Record<string, boolean>;
    effectiveAttributes: Record<string, unknown> | null;
    dpr: number;
    renderScale: number;
    dprCappedAt: number;
  };
  rendererInfo: {
    edgeMode: 'native-msaa' | 'fxaa' | null;
    /** false = 真机有效 antialias 为 false ⇒ FXAA 是生产分支（方案 §7 第 2 条） */
    effectiveAntialias: boolean | null;
    jointCount: number | null;
    vertexCount: number | null;
    indexCount: number | null;
    counters: { drawCalls: number; paletteUploads: number; frames: number } | null;
  };
  resource: ResourceChainEvidence;
  sixDir: FacingEvidenceRow[];
  states: StateEvidenceRow[];
  jumpTrios: JumpTrioRow[];
  context: ContextInjectionEvidence;
  capacity: CapacityRecord[];
  /** 各阶段状态（顺序见 PHASES_ORDER）：**自测不得毒死测量**，故测量项在前、上下文自测在最后 */
  phases: PhaseRecord[];
  runs: RuntimeRunRecord[];
  env: {
    /** true = 浏览器 sim（非微信/安卓能力证据） */
    sim: boolean;
    commitSha: string;
    profile: string;
    screenshots: string[];
    notes: string[];
  };
}

export interface RuntimeVerdicts {
  device: string;
  sixdir: string;
  states: string;
  contextRestore: string;
  capacity20: string;
  capacity20Engine: string | null;
  capacity20Reasons: string[] | null;
}

export interface RuntimeResult extends RuntimeResultContext {
  schemaVersion: string;
  verdict: RuntimeVerdicts;
  notes: string[];
}

/** 阶段状态：`skipped` = 本轮按条件不跑（例如压测未到冷/热门槛）；`failed` = 该阶段抛错。 */
export type PhaseStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped';

export interface PhaseRecord {
  name: string;
  status: PhaseStatus;
  detail: string;
  /** 该阶段耗时（毫秒，平台钟；跨运行不可比） */
  ms: number;
}

/** 阶段顺序（结果里一并给出，使「哪一步没跑」一眼可见；测量项在前、破坏性自测在后）。 */
export const PHASES_ORDER: readonly string[] = ['boot', 'sixdir', 'states', 'jump-trio', 'perf', 'context'];

export function deviceHashOf(d: RuntimeDevice): string {
  const parts = [d.brand, d.model, d.system, d.platform, d.SDKVersion, d.renderer, d.vendor, d.unmaskedRenderer, d.pixelRatio].join('|');
  let h = 2166136261;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function countByCacheState(runs: readonly RuntimeRunRecord[], state: 'cold' | 'hot'): number {
  return runs.filter((r) => r.cacheState === state).length;
}

/** 逐向/逐态断言：activeClipKey 必须等于该状态的期望槽位（真代码输出对表）。 */
export function assertScenarioRows(rows: readonly { expectedClipKey: string; activeClipKey: string | null }[]): boolean {
  return rows.length > 0 && rows.every((r) => r.activeClipKey === r.expectedClipKey);
}

export function runtimeVerdicts(ctx: RuntimeResultContext): { verdict: RuntimeVerdicts; notes: string[] } {
  const notes: string[] = [];
  const sim = ctx.env.sim;
  const prefix = sim ? 'SIM_' : '';
  const coldRuns = countByCacheState(ctx.runs, 'cold');
  const hotRuns = countByCacheState(ctx.runs, 'hot');
  const serializeFailures = ctx.runs.reduce((n, r) => n + r.failures, 0);

  const sixdirOk = ctx.sixDir.length === ALL_FACINGS.length && ctx.sixDir.every((r) => r.ok);
  const statesOk = ctx.states.length === ALL_STATES.length && ctx.states.every((r) => r.ok);
  const context = ctx.context;
  const contextOk = contextEvidenceOk(context);

  // ---- device：冷 3 + 热 3 全绿 ----
  let device: string;
  if (ctx.resource.loadStatus === 'failed') {
    device = prefix + 'DEVICE_FAIL';
    notes.push('资源门失败：' + (ctx.resource.diagnostics.slice(0, 3).join(' | ') || '未知'));
  } else if (serializeFailures > 0 && sixdirOk === false && statesOk === false) {
    device = prefix + 'DEVICE_FAIL';
    notes.push('六向与全状态均未过 ⇒ 不构成 Device-PASS');
  } else if (coldRuns >= RUNS_REQUIRED && hotRuns >= RUNS_REQUIRED) {
    device = prefix + 'DEVICE_PASS';
    notes.push(
      '冷启动 ' + coldRuns + '/' + RUNS_REQUIRED + ' + 热缓存 ' + hotRuns + '/' + RUNS_REQUIRED +
        ' 全绿（loader 冷/热两条状态机链均在真机跑过）',
    );
  } else {
    // ★ 中间态：不是失败，是这一系列还没跑完（S0 踩过「冷启动 2/3 打 DEVICE_FAIL」的坑）
    device = prefix + 'DEVICE_INCOMPLETE';
    notes.push(
      '冷启动 ' + coldRuns + '/' + RUNS_REQUIRED + '、热缓存 ' + hotRuns + '/' + RUNS_REQUIRED +
        ' ⇒ **未完成，不是失败**：继续「完全杀微信 → 重新扫码」凑满冷 3 次，再热启动 3 次（不杀进程，退后台再进）',
    );
  }

  const sixdir = sim ? 'SIM_' + (sixdirOk ? 'PASS' : 'FAIL') : sixdirOk ? 'PASS' : 'FAIL';
  const states = sim ? 'SIM_' + (statesOk ? 'PASS' : 'FAIL') : statesOk ? 'PASS' : 'FAIL';
  // 无 WEBGL_lose_context 时只算「替代验证」：不得写 PASS（arch seq=421：不把 mock 当真机证据）
  const contextRestore = context.injectionMode === 'none'
    ? 'NOT_RUN'
    : context.injectionMode === 'host-api-fallback'
      ? (contextOk ? 'ALTERNATE_ONLY_PASS' : 'ALTERNATE_ONLY_FAIL')
      : (sim ? 'SIM_' : '') + (contextOk ? 'PASS' : 'FAIL');

  // ---- capacity20：只有 spec 档（≥1800 帧/档）才出结论 ----
  const rec20 = ctx.capacity.filter((r) => r.unitCount === 20)[0];
  let capacity20 = 'NOT_RUN';
  let capacityEngine: string | null = null;
  let capacityReasons: string[] | null = null;
  if (rec20) {
    const j = judgeCapacity20(rec20);
    capacityEngine = j.verdict;
    capacityReasons = j.reasons;
    if (rec20.specProfile === false) {
      capacity20 = 'NON_SPEC_PROFILE_NOT_APPLICABLE';
      notes.push('20 单位档为非方案口径采样（a2Profile=' + rec20.a2Profile + '）⇒ 只证明判定逻辑能出结论，不作为容量结论');
    } else {
      capacity20 = (sim ? 'SIM_' : '') + j.verdict;
    }
  } else {
    notes.push('20 单位档未跑（capacity20 = NOT_RUN）');
  }

  if (!context.extAvailable) {
    notes.push('宿主不支持 WEBGL_lose_context（ext）⇒ 未见真注入；若走了 host-api 直接调 renderer 入口，只算替代验证，不当作真机上下文丢失证据');
  }
  if (sim) {
    notes.push('本次为浏览器 sim：只证明同一份 bundle 的代码路径通，**不是**微信/安卓能力证据（方案 §9.3）');
  }
  const notOk = ctx.phases.filter((p) => p.status !== 'ok');
  if (notOk.length > 0) {
    notes.push(
      '未完成的阶段（phasesOrder=' + PHASES_ORDER.join(' → ') + '）：' +
        notOk.map((p) => p.name + '(' + p.status + (p.detail ? '：' + p.detail : '') + ')').join(' / ') +
        ' —— 已产出的阶段结果照常导出，不影响其余判定',
    );
  }
  const structuralRows = ctx.resource.assetIntegrity.filter((r) => r.integrityMode === 'structural');
  if (structuralRows.length > 0) {
    const drifted = structuralRows.filter((r) => !r.byteLengthMatches || !r.sha256Matches);
    notes.push(
      '包内文本资产按**结构不变量**放行（integrityMode=structural）：' + structuralRows.length + ' 个' +
        (drifted.length
          ? '，其中 ' + drifted.length + ' 个字节与清单不符（observedByteLength=' +
            drifted.map((r) => r.assetId + ':' + r.observedByteLength + '(清单 ' + r.expectedByteLength + ')').join(' / ') +
            '）—— 平台改写导致字节不可比，结构账见 resource.assetIntegrity[].structuralSummary'
          : '（字节与清单一致）'),
    );
  }
  if (structuralRows.some((r) => !r.byteLengthMatches)) {
    const hotDrift = structuralRows.filter((r) => !r.byteLengthMatches && r.source === 'cache-hit');
    notes.push(
      '结构性放行资产的字节与清单不符（平台改写导致字节不可比），' +
        (hotDrift.length > 0
          ? '其中 ' + hotDrift.length + ' 个本次是**热命中**（P0-5：缓存索引以「盘上事实」observedByteLength/' +
            'observedSha256 为基准，命中判定=索引命中且盘上文件与索引一致，**不以与清单相等为条件**）——' +
            '清单值只用于结构校验与资产身份判断。'
          : '本次为读包登记（冷系列）；下次启动即按索引热命中（P0-5）。'),
    );
    notes.push(
      '提示：升级前写入的旧索引（按清单值登记）会在下一次启动因长度不符被摘除一次，随后按盘上事实重建（自愈，仅多读一次）。',
    );
  }
  const strictDrift = ctx.resource.assetIntegrity.filter(
    (r) => r.integrityMode === 'strict' && (!r.byteLengthMatches || !r.sha256Matches),
  );
  if (strictDrift.length > 0) {
    notes.push(
      '严格口径资产出现字节/摘要不符（**未放宽**，如实记录）：' +
        strictDrift.map((r) => r.assetId + ' observed=' + r.observedByteLength + ' expected=' + r.expectedByteLength).join(' / '),
    );
  }
  if (ctx.context.restoreVia === 'rebuild') {
    notes.push(
      '上下文恢复走**真重建**（平台不允许扩展恢复' +
        (ctx.context.fastPathError ? '：' + ctx.context.fastPathError : '') +
        '）：新建离屏 canvas/context + 经 loader 从缓存重新装配并重传资源；该平台**未执行**扩展恢复路径',
    );
  }
  if (ctx.resource.mode === 'local-subpackage') {
    notes.push('资源链走分包/本地路径 adapter ⇒ 已执行：清单校验/缓存命中/临时落盘/SHA-256 校验/结构门/原子登记/LKG/解析；未执行：wx.downloadFile HTTP 链路与合法域名白名单');
  }

  return {
    verdict: { device, sixdir, states, contextRestore, capacity20, capacity20Engine: capacityEngine, capacity20Reasons: capacityReasons },
    notes,
  };
}

export function buildResult(ctx: RuntimeResultContext): RuntimeResult {
  const { verdict, notes } = runtimeVerdicts(ctx);
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    ...ctx,
    device: { ...ctx.device, deviceHash: ctx.device.deviceHash || deviceHashOf(ctx.device) },
    verdict,
    notes,
  };
}

export function toConsoleLine(result: RuntimeResult): string {
  return CONSOLE_RESULT_PREFIX + JSON.stringify(result);
}

/** 分享文件名：`char3d_<deviceHash>_<kind>_run<n>.json`。 */
export function shareFileName(result: RuntimeResult, kind: 'result' | 'summary' = 'result'): string {
  const run = result.runs.length ? result.runs[result.runs.length - 1].runIndex : 0;
  return 'char3d_' + result.device.deviceHash + '_' + kind + '_run' + run + '.json';
}

export function screenshotName(result: RuntimeResult, tag: string): string {
  const run = result.runs.length ? result.runs[result.runs.length - 1].runIndex : 0;
  return 'c3d_' + result.device.deviceHash + '_' + tag + '_run' + run + '.png';
}

/** 冷/热启动历史条目是否已经凑齐（供屏上短名显示）。 */
export function runProgress(runs: readonly RuntimeRunRecord[]): { cold: number; hot: number; required: number } {
  return { cold: countByCacheState(runs, 'cold'), hot: countByCacheState(runs, 'hot'), required: RUNS_REQUIRED };
}

// ===== tap 诊断（真机「点了没反应」的远程定位口，沿 S0 的 __PROBE_TAP__ 口径）=====

export interface TapInput {
  /** 触摸映射后的画布背衬像素 */
  mapped: [number, number];
  /** 画布背衬尺寸 */
  canvasSpace: [number, number];
  /** 逻辑窗口尺寸 */
  windowSpace: [number, number];
  /** 命中的按钮 id，null = 没命中 */
  hit: string | null;
  /** 最近按钮的距离（px）与 id */
  nearest: { id: string; d: number } | null;
  /** 宿主触摸监听是否已挂上（false = 触摸事件根本没到） */
  listenerAttached: boolean;
  /** 对局是否处于暂停（暂停期间输入被忽略） */
  paused: boolean;
}

/** 三态诊断：没命中 / 未连接 / 被暂停（arch seq=421 的「区分」要求）。 */
export function classifyTap(t: TapInput): 'hit' | 'miss' | 'not-connected' | 'paused' {
  if (!t.listenerAttached) return 'not-connected';
  if (t.hit === null) return 'miss';
  if (t.paused) return 'paused';
  return 'hit';
}

export function toTapDiagLine(t: TapInput): string {
  return TAP_DIAG_PREFIX + JSON.stringify({
    mapped: t.mapped,
    canvasSpace: t.canvasSpace,
    windowSpace: t.windowSpace,
    hit: t.hit,
    nearest: t.nearest,
    listenerAttached: t.listenerAttached,
    paused: t.paused,
    verdict: classifyTap(t),
  });
}
