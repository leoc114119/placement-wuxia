// T31-FE-A · ui/character3d/animation.ts —— clip 采样 / 骨架求解 / 状态切换 / 交叉淡化
//
// 两套动作源、一套姿态求解：
//   ① **重定向动作 json**（idle/atk/cast/jump）：算法收编自 `proto/webgl2_probe/src/anim-loader.js`
//      （S0 已验），逐帧均匀关键帧 + 帧间 nlerp + rootTrack **增量**叠加在静止位移上；对拍逐位比对。
//   ② **GLB 内嵌预设**（walk/run）：按 glTF 采样器**各自的 interpolation** 采样
//      —— Tripo 预设实测 Root/Pelvis 是 STEP、四肢是 LINEAR（31/57 关键帧），
//      一律 nlerp 会让本应「段内保持」的骨跳到末端姿态。
//
// 方案口径：
//   §4.1 jump 采样**剥离 rootTrack 三轴位移**（水平由既有 renderPos、垂直由 pieceHop 唯一控制，
//        叠加会成「双跳」）；播完从落地蹲姿向 idle 混合 180ms，混合钟属 view 表现态。
//   §5   动作映射与时长全部读 config/character-3d（本文件**禁写时长数字**）；
//        timeScale 只控制表现，不改 session/事件/伤害/出招结算时钟（易错点 12）。
//   本文件不触 GL、不触平台 API、不读快照以外的任何状态。

import type {
  Character3DAssetRef,
  Character3DClipKey,
  Character3DProfile,
} from '../../types';
import type {
  Character3DActionKey,
  Character3DActionSpec,
  Character3DProgressSource,
} from '../../config/character-3d';
import { fromTRS, mul, nlerp } from './math';
import type { Character3DEmbeddedClip, Character3DModel, Character3DTrack } from './glb';

// ===== 姿态缓冲 =====

/** 一具骨架的姿态缓冲（预分配 + 预切视图：热路径零分配）。
 * probe 实测口径：subarray 若在循环里调用会每帧产生数千临时对象，直接污染帧时统计。 */
export interface Character3DPose {
  readonly nodeCount: number;
  readonly jointCount: number;
  readonly t: Float32Array;
  readonly q: Float32Array;
  readonly s: Float32Array;
  readonly localM: Float32Array;
  readonly worldM: Float32Array;
  /** 41 骨 palette（jointCount × 16，列主序）；渲染端每帧一次 uniformMatrix4fv 上传本块 */
  readonly palette: Float32Array;
  readonly tV: Float32Array[];
  readonly qV: Float32Array[];
  readonly sV: Float32Array[];
  readonly localV: Float32Array[];
  readonly worldV: Float32Array[];
  readonly paletteV: Float32Array[];
}

export function createPose(model: Character3DModel): Character3DPose {
  const n = model.nodes.count;
  const nj = model.jointNodes.length;
  const pose: Character3DPose = {
    nodeCount: n,
    jointCount: nj,
    t: new Float32Array(n * 3),
    q: new Float32Array(n * 4),
    s: new Float32Array(n * 3),
    localM: new Float32Array(n * 16),
    worldM: new Float32Array(n * 16),
    palette: new Float32Array(nj * 16),
    tV: [], qV: [], sV: [], localV: [], worldV: [], paletteV: [],
  };
  for (let i = 0; i < n; i++) {
    pose.tV.push(pose.t.subarray(i * 3, i * 3 + 3));
    pose.qV.push(pose.q.subarray(i * 4, i * 4 + 4));
    pose.sV.push(pose.s.subarray(i * 3, i * 3 + 3));
    pose.localV.push(pose.localM.subarray(i * 16, i * 16 + 16));
    pose.worldV.push(pose.worldM.subarray(i * 16, i * 16 + 16));
  }
  for (let j = 0; j < nj; j++) pose.paletteV.push(pose.palette.subarray(j * 16, j * 16 + 16));
  return pose;
}

/** 静止姿态写回缓冲（每帧采样起点）：未被轨道覆盖的骨保持 GLB 静止姿态。 */
export function resetPose(pose: Character3DPose, model: Character3DModel): void {
  const trs = model.nodes.trs;
  for (let i = 0; i < pose.nodeCount; i++) {
    const x = trs[i], t = pose.tV[i], q = pose.qV[i], s = pose.sV[i];
    t[0] = x.t[0]; t[1] = x.t[1]; t[2] = x.t[2];
    q[0] = x.q[0]; q[1] = x.q[1]; q[2] = x.q[2]; q[3] = x.q[3];
    s[0] = x.s[0]; s[1] = x.s[1]; s[2] = x.s[2];
  }
}

/** 姿态 → local 矩阵 → world 矩阵（拓扑序，父先于子）→ 41 骨 palette = world(joint) · IBM。 */
export function resolvePose(model: Character3DModel, pose: Character3DPose): Float32Array {
  for (let i = 0; i < pose.nodeCount; i++) {
    fromTRS(pose.localV[i], pose.tV[i], pose.qV[i], pose.sV[i]);
  }
  const order = model.nodes.order;
  const parents = model.nodes.parents;
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    if (parents[i] < 0) pose.worldV[i].set(pose.localV[i]);
    else mul(pose.worldV[i], pose.worldV[parents[i]], pose.localV[i]);
  }
  const joints = model.jointNodes;
  for (let ji = 0; ji < joints.length; ji++) {
    mul(pose.paletteV[ji], pose.worldV[joints[ji]], model.ibm.subarray(ji * 16, ji * 16 + 16));
  }
  return pose.palette;
}

/** 姿态混合（交叉淡化）：t/s 线性、q nlerp；写 out，可与其他姿态同引用。
 * w=1 ⇒ 完全取 `to`（内部按 probe 的 nlerp k 口径换算 k = 1-w）。 */
export function blendPoses(out: Character3DPose, from: Character3DPose, to: Character3DPose, w: number): void {
  const k = 1 - w;
  for (let i = 0; i < out.nodeCount; i++) {
    nlerp(out.qV[i], from.qV[i], 0, to.qV[i], 0, k);
    const ot = out.tV[i], at = from.tV[i], bt = to.tV[i];
    ot[0] = at[0] * k + bt[0] * (1 - k);
    ot[1] = at[1] * k + bt[1] * (1 - k);
    ot[2] = at[2] * k + bt[2] * (1 - k);
    const os = out.sV[i], as = from.sV[i], bs = to.sV[i];
    os[0] = as[0] * k + bs[0] * (1 - k);
    os[1] = as[1] * k + bs[1] * (1 - k);
    os[2] = as[2] * k + bs[2] * (1 - k);
  }
}

// ===== 重定向动作 json（① 号源）=====

/** 解析并校验后的重定向动作（格式真源 = tools/glb2d/collada2anim.mjs 产出 / render.mjs 消费口径）。 */
export interface Character3DRetargetedClip {
  name: string;
  fps: number;
  nFrames: number;
  /** json 里声明的时长（秒）——资产合同值，仅作记录（jump_v6 声明 1.5 而 nFrames/fps=1.5333） */
  declaredDurationSec: number;
  /** 采样周期（秒）= nFrames / fps：帧索引 i 对应 t = i/fps，取模一圈即本值 */
  samplerDurationSec: number;
  rootMode: 'y' | 'none' | 'xyz';
  rootScale: number;
  unitScale: number;
  mappedCount: number;
  source: string;
  /** 骨名 → [nFrames][4] 四元数 xyzw（保留逐帧数组形态：与 probe 采样器输入逐位一致，便于对拍） */
  boneTracks: Record<string, number[][]>;
  /** [nFrames][3] 根位移**增量**（叠在 Root 静止位移上） */
  rootTrack: number[][];
}

function fail(msg: string): never {
  throw new Error('[character3d/animation] ' + msg);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 解析重定向动作 json（fail-fast，不做静默补齐）。 */
export function parseCharacter3DClipJson(raw: unknown, name: string): Character3DRetargetedClip {
  const obj = asRecord(raw);
  if (!obj) fail('动作 json 不是对象: ' + name);
  const fps = asFiniteNumber(obj.fps);
  const nFrames = asFiniteNumber(obj.nFrames);
  const duration = asFiniteNumber(obj.duration);
  if (fps === null || !(fps > 0)) fail('fps 非法: ' + String(obj.fps));
  if (nFrames === null || !(nFrames > 1) || !Number.isInteger(nFrames)) fail('nFrames 非法: ' + String(obj.nFrames));
  if (duration === null || !(duration > 0)) fail('duration 非法: ' + String(obj.duration));
  if (Math.abs(duration - nFrames / fps) > 0.05) {
    fail('duration ' + duration + ' 与 nFrames/fps=' + nFrames / fps + ' 不符');
  }
  const rootModeRaw = obj.rootMode === undefined ? 'y' : obj.rootMode;
  if (rootModeRaw !== 'y' && rootModeRaw !== 'none' && rootModeRaw !== 'xyz') {
    fail('rootMode 未识别: ' + String(rootModeRaw));
  }
  const btRaw = asRecord(obj.boneTracks);
  if (!btRaw) fail('缺 boneTracks: ' + name);
  const names = Object.keys(btRaw);
  if (!names.length) fail('boneTracks 为空: ' + name);
  const boneTracks: Record<string, number[][]> = {};
  for (const bn of names) {
    const tr = btRaw[bn];
    if (!Array.isArray(tr) || tr.length !== nFrames) {
      fail('轨道 ' + bn + ' 帧数 ' + (Array.isArray(tr) ? tr.length : 'N/A') + ' != nFrames ' + nFrames);
    }
    for (let f = 0; f < nFrames; f++) {
      const row = tr[f];
      if (!Array.isArray(row) || row.length !== 4) fail('轨道 ' + bn + ' 第 ' + f + ' 帧不是四元数');
    }
    boneTracks[bn] = tr as number[][];
  }
  const rootTrack = obj.rootTrack;
  if (!Array.isArray(rootTrack) || rootTrack.length !== nFrames) fail('rootTrack 帧数不符: ' + name);
  for (let f = 0; f < nFrames; f++) {
    const row = rootTrack[f];
    if (!Array.isArray(row) || row.length !== 3) fail('rootTrack 第 ' + f + ' 帧不是 vec3');
  }
  return {
    name,
    fps,
    nFrames,
    declaredDurationSec: duration,
    samplerDurationSec: nFrames / fps,
    rootMode: rootModeRaw,
    rootScale: asFiniteNumber(obj.rootScale) ?? 1,
    unitScale: asFiniteNumber(obj.unitScale) ?? 1,
    mappedCount: asFiniteNumber(obj.mappedCount) ?? names.length,
    source: typeof obj.source === 'string' ? obj.source : '',
    boneTracks,
    rootTrack: rootTrack as number[][],
  };
}

/** 轨道 → 模型节点绑定结果。 */
export interface BoundRetargetedClip {
  tracks: { node: number; name: string; track: number[][] }[];
  rootNode: number;
  /** Root 静止位移（rootTrack 是增量，叠加在它上面） */
  rootRest: number[];
  coveredJoints: number;
}

/** 把动作轨道绑到模型节点上（任一轨道名在模型里找不到 ⇒ 报错，禁静默跳过）。 */
export function bindRetargetedClip(clip: Character3DRetargetedClip, model: Character3DModel): BoundRetargetedClip {
  const nameIdx: Record<string, number> = {};
  for (let i = 0; i < model.nodes.trs.length; i++) {
    const nm = model.nodes.trs[i].name;
    if (nm && nameIdx[nm] === undefined) nameIdx[nm] = i;
  }
  const jointName: Record<string, number> = {};
  for (let j = 0; j < model.jointNodes.length; j++) jointName[model.nodes.trs[model.jointNodes[j]].name] = j;
  const tracks = Object.keys(clip.boneTracks).map((nm) => {
    const node = nameIdx[nm];
    if (node === undefined) fail('动作含模型里不存在的骨: ' + nm);
    if (jointName[nm] === undefined) fail('轨道 ' + nm + ' 对应节点不是 skin.joints 成员');
    return { node, name: nm, track: clip.boneTracks[nm] };
  });
  const rootIdx = nameIdx['Root'];
  if (rootIdx === undefined) fail('模型无名为 Root 的节点，无法施加 rootTrack');
  return { tracks, rootNode: rootIdx, rootRest: model.nodes.trs[rootIdx].t.slice(), coveredJoints: tracks.length };
}

const q4 = new Float32Array(4);

/**
 * 采样重定向 clip 写进姿态缓冲（**不含** local/world/palette 求解，见 resolvePose）。
 * @param phaseRatio 归一化相位：**循环**时 [0,1) 取模（1.0 等价于 0）；**单播**时 [0,1] 夹取
 * @param rootDisplacement 'track' = 叠 rootTrack 增量；'zero' = 剥离三轴位移只留静止位移（jump 防双跳）
 * @param loop 循环取模 / 单播夹取（方案 §5：basic 尾帧保持至状态退出 —— 单播若取模会跳回首帧）
 */
export function applyRetargetedClip(
  clip: Character3DRetargetedClip,
  bound: BoundRetargetedClip,
  model: Character3DModel,
  pose: Character3DPose,
  phaseRatio: number,
  rootDisplacement: 'track' | 'zero',
  loop = true,
): void {
  resetPose(pose, model);
  const nF = clip.nFrames;
  const fps = clip.fps;
  let fi = phaseRatio * clip.samplerDurationSec * fps;
  if (loop) fi = fi - Math.floor(fi / nF) * nF; // 取模（相位可能跨圈）
  else fi = Math.min(nF - 1, Math.max(0, fi));  // 单播：夹在 [0, nF-1]，末帧保持
  const i0 = Math.min(nF - 1, Math.max(0, Math.floor(fi)));
  const i1 = loop ? (i0 + 1) % nF : Math.min(nF - 1, i0 + 1); // 循环环绕末帧→首帧（idle 接缝 0.28° 无缝）
  const a = fi - Math.floor(fi);

  for (let i = 0; i < bound.tracks.length; i++) {
    const tr = bound.tracks[i].track;
    // ★ 时间极性：k=1→qa。标准化为 t=0→i0、t=1→i1，故传 1−a（arch seq=414 驳回「维持现状」：
    //   旧口径 a=0 取 i1、a→1 回 i0 是**区间内倒播**，且与 root 位移的时间方向相反）。
    nlerp(q4, tr[i0], 0, tr[i1], 0, 1 - a);
    const q = pose.qV[bound.tracks[i].node];
    q[0] = q4[0]; q[1] = q4[1]; q[2] = q4[2]; q[3] = q4[3];
  }
  if (rootDisplacement === 'zero') return; // jump：root 留静止位移，位移全由外部 hop 控制
  // root 位移同极性：t=0→r0、t=1→r1（与上面的旋转一致，两轨不得反向）
  const r0 = clip.rootTrack[i0];
  const r1 = clip.rootTrack[i1];
  const rt = pose.tV[bound.rootNode];
  const rr = bound.rootRest;
  rt[0] = rr[0] + (r0[0] * (1 - a) + r1[0] * a);
  rt[1] = rr[1] + (r0[1] * (1 - a) + r1[1] * a);
  rt[2] = rr[2] + (r0[2] * (1 - a) + r1[2] * a);
}

// ===== GLB 内嵌预设（② 号源）=====

/** 在一条轨道上按时间取关键帧段下标（升序时间数组）。 */
function segmentOf(times: Float32Array, t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  if (t <= times[0]) return 0;
  if (t >= times[hi]) return Math.max(0, hi - 1);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * 按 glTF 采样器语义采样一条轨道并写进姿态缓冲。
 * STEP = 段内保持前一个关键帧（Tripo 预设里 Root/Pelvis 等 26 条旋转即是），
 * LINEAR = 段内插值（四肢）；四元数按 nlerp（与全局口径一致）。
 * 循环时把相位折进 [start, end] 窗口——末段用「末关键帧保持」，接缝由资产侧保证。
 */
function applyTrack(pose: Character3DPose, track: Character3DTrack, t: number): void {
  const times = track.times;
  const n = times.length;
  const i0 = segmentOf(times, t);
  const i1 = Math.min(n - 1, i0 + 1);
  const span = times[i1] - times[i0];
  const raw = span > 1e-9 ? (t - times[i0]) / span : 0;
  const a = Math.min(1, Math.max(0, raw));
  const ncomp = track.path === 'rotation' ? 4 : 3;
  const values = track.values;
  const o0 = i0 * ncomp;
  if (track.path === 'rotation') {
    const q = pose.qV[track.nodeIndex];
    if (track.interpolation === 'STEP') {
      q[0] = values[o0]; q[1] = values[o0 + 1]; q[2] = values[o0 + 2]; q[3] = values[o0 + 3];
      return;
    }
    // 与重定向 clip 同一时间极性：t=0→i0、t=1→i1
    nlerp(q, values, o0, values, i1 * ncomp, 1 - a);
    return;
  }
  const dst = track.path === 'translation' ? pose.tV[track.nodeIndex] : pose.sV[track.nodeIndex];
  const o1 = i1 * ncomp;
  if (track.interpolation === 'STEP') {
    for (let c = 0; c < ncomp; c++) dst[c] = values[o0 + c];
    return;
  }
  for (let c = 0; c < ncomp; c++) dst[c] = values[o0 + c] * (1 - a) + values[o1 + c] * a;
}

/**
 * 采样 GLB 内嵌 clip 写进姿态缓冲。
 * @param phaseRatio 归一化相位 [0,1)（统一相位口径，与重定向 clip 共用状态机）
 * @param rootDisplacement 'zero' = 剥离 Root 平移轨（jump 专用策略；walk 用 'track'）
 * @param loop 循环取模 / 单播夹取
 */
export function applyEmbeddedClip(
  clip: Character3DEmbeddedClip,
  model: Character3DModel,
  pose: Character3DPose,
  phaseRatio: number,
  rootDisplacement: 'track' | 'zero',
  loop = true,
): void {
  resetPose(pose, model);
  const r = loop ? phaseRatio - Math.floor(phaseRatio) : Math.min(1, Math.max(0, phaseRatio));
  const t = clip.startTimeSec + r * clip.durationSec;
  const rootNode = rootDisplacement === 'zero' ? findRootNode(model) : -1;
  for (let i = 0; i < clip.tracks.length; i++) {
    const track = clip.tracks[i];
    if (track.path === 'translation' && track.nodeIndex === rootNode) continue;
    applyTrack(pose, track, t);
  }
}

function findRootNode(model: Character3DModel): number {
  for (let i = 0; i < model.nodes.trs.length; i++) {
    if (model.nodes.trs[i].name === 'Root') return i;
  }
  return -1;
}

// ===== clip 注册表（两套源统一给状态机消费）=====

export type Character3DClipSource =
  | { kind: 'retargeted'; ref: Character3DAssetRef | null; clip: Character3DRetargetedClip; bound: BoundRetargetedClip }
  | { kind: 'embedded'; name: string; clip: Character3DEmbeddedClip };

export type Character3DClipRegistry = Partial<Record<Character3DClipKey, Character3DClipSource>>;

/** clip 的采样周期（秒）——状态机的相位换算只用这一个来源。 */
export function clipDurationSec(source: Character3DClipSource): number {
  return source.kind === 'retargeted' ? source.clip.samplerDurationSec : source.clip.durationSec;
}

/** 按注册表装配一个 clip 源（重定向 json → 解析 + 绑定；内嵌名 → 在模型里找同名动画）。 */
export function resolveClipSource(
  key: Character3DClipKey,
  entry: Character3DProfile['clips'][Character3DClipKey],
  model: Character3DModel,
  jsonRaw: unknown,
): Character3DClipSource {
  if ('embedded' in entry) {
    const found = model.clips.find((c) => c.name === entry.embedded);
    if (!found) {
      fail('模型内没有内嵌动画 ' + entry.embedded + '（profile 槽位 ' + key + '）');
    }
    return { kind: 'embedded', name: entry.embedded, clip: found };
  }
  const clip = parseCharacter3DClipJson(jsonRaw, entry.id);
  return { kind: 'retargeted', ref: entry, clip, bound: bindRetargetedClip(clip, model) };
}

// 状态机输入：**全部来自 CharacterRenderCommand**（快照真值的只读投影）。
/** 状态机输入。
 * `isJump` = **该次移动演出创建时锁定的轻功意图**（MoveAnim.isJumpMove，取创建当帧的
 * SnapshotActor.isJump；arch seq=418 修订乙，替代 9e824cb5 的「每帧直读快照」要求）：
 * 轻功判据只认这一个字段。禁再用 hopPx 猜 —— 抛物线起点/终点 hop 恰为 0，猜会各漏一帧；
 * 也禁逐帧直读快照 isJump —— session 窗仅 300ms 而演出 0.6~1.2s，降段会被错判为普通行走。
 * 故本输入**不接收 hopPx**（垂直位移仍由 pass 的摆放矩阵消费，与动作选择无关）。 */
export interface CharacterAnimInput {
  state: 'idle' | 'walk' | 'charge' | 'strike' | 'basic' | 'hit' | 'dead';
  isJump: boolean;
  stateElapsedSec: number;
  moveProgress: number | null;
}

/** 动作装配配置（config/character-3d 派生；pass/runtime 按 profile 维度持有一份）。 */
export interface Character3DAnimConfig {
  readonly actionMap: Readonly<Record<Character3DActionKey, Character3DActionSpec>>;
  readonly crossFadeSec: number;
  readonly jumpToIdleBlendSec: number;
  readonly clips: Character3DClipRegistry;
}

export interface CharacterAnimControllerOptions extends Character3DAnimConfig {
  /** 缺槽位时的回退槽位（默认 idle） */
  readonly fallbackClip?: Character3DClipKey;
}

interface Target {
  actionKey: Character3DActionKey;
  clipKey: Character3DClipKey;
  phaseRatio: number;
  loop: boolean;
  rootDisplacement: 'track' | 'zero';
  /** true = 相位由快照显式给出（派生）；false = 由 view 演出钟累积 */
  derived: boolean;
}

interface FadeState {
  clipKey: Character3DClipKey;
  phaseRatio: number;
  loop: boolean;
  rootDisplacement: 'track' | 'zero';
  durationSec: number;
}

/**
 * 角色动作状态机（**每 actor 一实例**，禁共享：共享会让两个单位的相位互相串）。
 *
 * 时钟口径（方案 §4.1「混合钟属于 view 表现态」）：
 *   · viewClockSec 由调用方每帧喂 dt 累积（不读 session 任何时钟）；
 *   · 快照显式给窗的动作（basic/strike/charge/jump/dead）用 stateElapsedSec / moveProgress 派生相位，
 *     保证「表现窗」与 session 状态一一对应，不引入第二套计时；
 *   · 循环动作（idle/walk）走 viewClockSec 取模，状态切换不重置相位（无抽搐）。
 *
 * 交叉淡化：默认 crossFadeSec（100ms）；jump→idle 固定 jumpToIdleBlendSec（180ms）；
 *   进 dead 或 crossFadeOnEnter=false 的动作**不混**（snap）；出 dead 的切换同样不混（dead 不混回）。
 */
export class CharacterAnimController {
  private readonly opts: CharacterAnimControllerOptions;
  private readonly diags: string[] = [];
  private viewClockSec = 0;
  private fadeElapsedSec = 0;
  private fade: FadeState | null = null;
  private currentClipKey: Character3DClipKey | null = null;
  private currentActionKey: Character3DActionKey = 'idle';
  private lastRatio = 0;
  /** 当前相位是否按循环口径解（决定末帧保持 vs 取模回卷） */
  private lastLoop = true;
  /** hit 继承：沿用进入 hit 时的 clip 与相位，继续推进（方案 §5 hit 行「不切专用动作」） */
  private inherited: { clipKey: Character3DClipKey; phaseRatio: number; clockSec: number; loop: boolean; rootDisplacement: 'track' | 'zero' } | null = null;

  constructor(opts: CharacterAnimControllerOptions) {
    this.opts = opts;
  }

  /** 当前实际消费的资产槽位（测试/诊断用）。 */
  get activeClipKey(): Character3DClipKey | null {
    return this.currentClipKey;
  }

  get actionKey(): Character3DActionKey {
    return this.currentActionKey;
  }

  get diagnostics(): readonly string[] {
    return this.diags;
  }

  get fadeWeight(): number {
    if (!this.fade) return 1;
    return Math.min(1, this.fadeElapsedSec / this.fade.durationSec);
  }

  /** 每帧推进（dt 为调用方帧间隔秒；表现钟，与结算无关）。 */
  update(dtSec: number, input: CharacterAnimInput): void {
    this.viewClockSec += dtSec;
    if (this.fade) this.fadeElapsedSec += dtSec;

    const actionKey = this.resolveActionKey(input);

    const spec = this.opts.actionMap[actionKey];
    const inheritedFrom = actionKey === 'hit' && spec.clip === null;
    const target = this.resolveTarget(actionKey, spec, input, inheritedFrom);

    // 状态切换 → 起交叉淡化（或 snap）
    if (this.currentClipKey !== null && target.clipKey !== this.currentClipKey) {
      const snap = !spec.crossFadeOnEnter || this.currentActionKey === 'dead';
      if (snap) this.fade = null;
      else {
        const fromClip = this.currentClipKey;
        const dur = fromClip === 'jump' && target.clipKey === 'idle'
          ? this.opts.jumpToIdleBlendSec
          : this.opts.crossFadeSec;
        this.fade = {
          clipKey: fromClip,
          phaseRatio: this.lastRatio,
          loop: this.opts.actionMap[this.currentActionKey].loop,
          rootDisplacement: this.opts.actionMap[this.currentActionKey].rootMotion,
          durationSec: dur > 0 ? dur : 1e-6,
        };
        this.fadeElapsedSec = 0;
      }
    }
    // 淡化中途若又切回来源槽位（来回抖动）⇒ 丢掉淡化，避免 A→B→A 时 A 相位被冻住
    if (this.fade && this.fade.clipKey === target.clipKey) {
      this.fade = null;
    }

    this.currentActionKey = actionKey;
    this.currentClipKey = target.clipKey;
    this.lastRatio = target.phaseRatio;
    this.lastLoop = target.loop;

    // 进出 hit 的相位继承登记
    if (inheritedFrom) {
      if (!this.inherited) {
        this.inherited = {
          clipKey: target.clipKey,
          phaseRatio: target.phaseRatio,
          clockSec: this.viewClockSec,
          loop: target.loop,
          rootDisplacement: target.rootDisplacement,
        };
      }
    } else {
      this.inherited = null;
    }

    // 淡化来源相位继续推进（循环则环绕），与常见引擎「上一段动画继续播」同口径
    const fade = this.fade;
    if (fade) {
      const src = this.opts.clips[fade.clipKey];
      const dur = src ? clipDurationSec(src) : 1;
      let next = fade.phaseRatio + dtSec / (dur > 0 ? dur : 1);
      if (fade.loop) next -= Math.floor(next);
      else next = Math.min(1, next);
      fade.phaseRatio = next;
      if (this.fadeElapsedSec >= fade.durationSec) this.fade = null;
    }
  }

  /** 采样当前相位（含交叉淡化）到 pose，并求解 palette。 */
  sample(model: Character3DModel, pose: Character3DPose, scratch?: Character3DPose): Float32Array {
    const key = this.currentClipKey ?? this.opts.fallbackClip ?? 'idle';
    const source = this.opts.clips[key];
    const scratchPose = scratch ?? pose;
    const fade = this.fade;
    if (!source) {
      this.note('missing-clip:' + key);
      resetPose(pose, model);
      return resolvePose(model, pose);
    }
    if (fade) {
      const fadeSource = this.opts.clips[fade.clipKey];
      if (fadeSource) {
        this.sampleOne(fadeSource, fade.phaseRatio, fade.rootDisplacement, fade.loop, model, scratchPose);
        this.sampleOne(source, this.lastRatio, this.currentRootDisplacement(), this.lastLoop, model, pose);
        blendPoses(pose, scratchPose, pose, this.fadeWeight);
        return resolvePose(model, pose);
      }
    }
    this.sampleOne(source, this.lastRatio, this.currentRootDisplacement(), this.lastLoop, model, pose);
    return resolvePose(model, pose);
  }

  private currentRootDisplacement(): 'track' | 'zero' {
    return this.inherited ? this.inherited.rootDisplacement : this.opts.actionMap[this.currentActionKey].rootMotion;
  }

  private sampleOne(
    source: Character3DClipSource,
    phaseRatio: number,
    rootDisplacement: 'track' | 'zero',
    loop: boolean,
    model: Character3DModel,
    pose: Character3DPose,
  ): void {
    if (source.kind === 'retargeted') {
      applyRetargetedClip(source.clip, source.bound, model, pose, phaseRatio, rootDisplacement, loop);
    } else {
      applyEmbeddedClip(source.clip, model, pose, phaseRatio, rootDisplacement, loop);
    }
  }

  private note(msg: string): void {
    if (this.diags.indexOf(msg) < 0) this.diags.push(msg);
  }

  private resolveActionKey(input: CharacterAnimInput): Character3DActionKey {
    if (input.state === 'hit') return this.currentActionKey === 'hit' ? 'hit' : this.currentActionKey;
    if (input.state === 'dead') return 'dead';
    if (input.state === 'walk' && input.isJump) return 'jump'; // 轻功只认 isJump（命令侧=演出创建时锁定的意图）
    return input.state;
  }

  /** 相位解析：把 §5 的播放规则落成一个 [0,1) 的归一化相位。 */
  private resolveTarget(
    actionKey: Character3DActionKey,
    spec: Character3DActionSpec,
    input: CharacterAnimInput,
    inheritedFrom: boolean,
  ): Target {
    if (inheritedFrom || spec.clip === null) {
      const base = this.inherited;
      const clipKey = base ? base.clipKey : this.currentClipKey ?? this.opts.fallbackClip ?? 'idle';
      const src = this.opts.clips[clipKey];
      const dur = src ? clipDurationSec(src) : 1;
      const phase = base
        ? (base.loop
          ? wrap01(base.phaseRatio + (this.viewClockSec - base.clockSec) / (dur > 0 ? dur : 1))
          : Math.min(1, base.phaseRatio + (this.viewClockSec - base.clockSec) / (dur > 0 ? dur : 1)))
        : this.lastRatio;
      return {
        actionKey,
        clipKey,
        phaseRatio: phase,
        loop: base ? base.loop : spec.loop,
        rootDisplacement: base ? base.rootDisplacement : spec.rootMotion,
        derived: false,
      };
    }
    const clipKey = spec.clip;
    const src = this.opts.clips[clipKey];
    const durationSec = src ? clipDurationSec(src) : (spec.playWindowSec ?? 1);
    const phase = this.phaseFor(spec.progressSource, spec, input, durationSec);
    return { actionKey, clipKey, phaseRatio: phase, loop: spec.loop, rootDisplacement: spec.rootMotion, derived: true };
  }

  private phaseFor(
    source: Character3DProgressSource,
    spec: Character3DActionSpec,
    input: CharacterAnimInput,
    durationSec: number,
  ): number {
    const start = spec.startRatio;
    const span = 1 - start;
    switch (source) {
      case 'hold':
        return start;
      case 'moveProgress': {
        const window = spec.playWindowSec ?? durationSec;
        const p = input.moveProgress !== null
          ? clamp01(input.moveProgress)
          : clamp01(input.stateElapsedSec / (window > 0 ? window : 1));
        return foldPhase(start + p * span, spec.loop);
      }
      case 'stateElapsed': {
        const window = spec.playWindowSec ?? durationSec;
        if (spec.loop) {
          return foldPhase(start + viewWindow(input.stateElapsedSec, window) * span, true);
        }
        return foldPhase(start + clamp01(input.stateElapsedSec / (window > 0 ? window : 1)) * span, false);
      }
      default: {
        // viewClock：循环取模；单播按源时长归一（保留 startRatio 语义）
        const d = durationSec > 0 ? durationSec : 1;
        if (spec.loop) return foldPhase(start + ((this.viewClockSec % d) / d) * span, true);
        return foldPhase(start + clamp01(this.viewClockSec / d) * span, false);
      }
    }
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function wrap01(v: number): number {
  const r = v - Math.floor(v);
  return r === 1 ? 0 : r;
}

/** 相位折叠：循环取模到 [0,1)；单播夹取到 [0,1]（1 = 末帧，供「尾帧保持」）。
 * 单播若也取模，basic/strike 播到窗尾会跳回**首帧**（方案 §5 明确要求尾帧保持）。 */
function foldPhase(v: number, loop: boolean): number {
  if (!Number.isFinite(v)) return 0;
  return loop ? wrap01(v) : v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 循环相位的窗口取模（window ≤ 0 时退化为 0）。 */
function viewWindow(elapsed: number, window: number): number {
  if (!(window > 0)) return 0;
  const m = elapsed % window;
  return (m < 0 ? m + window : m) / window;
}
