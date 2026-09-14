// T31-FE-C · proto/character3d_runtime_demo/scenarios.ts —— 六向 / 全状态 / 轻功三元的**场景表**（纯数据 + 纯函数）
//
// 真源：
//   · 方案 §4.2 六向 yaw 表、§5 动作映射表；
//   · 方案 §4.1「单一坐标出口」+ arch seq=418 修订乙（isJump 锁定规则在**演出创建时**）；
//   · arch seq=421 明文：证据文案必须**并列** snapIsJump / cmdIsJump / activeClipKey 三者。
//
// ★ 口径声明（不许含糊）：本 smoke 宿主**不引** battle-core / battle-session（红线：宿主不引结算），
//   因此 session→view→command 的**真实链路**不在本卡重证——它在卡 B 已闭合：
//   `tests/battle-character3d-wiring.test.ts`（真实 session→view→command→controller + 300ms 快照窗
//   过后仍 jump + 起落 hop=0 + 死亡/reset 释放）。本文件的 `lockedIsJump()` 是**宿主侧按同一规则
//   的合成输入**，用来在真机上把「命令值 → 生产 CharacterAnimController 实际 clip」这一段点亮；
//   结果 JSON 里 `snapIsJump` 恒标注为合成快照意图（syntheticSnapshot），不得读成真机 battle 快照。

import type { BattleFacingHex } from '../../types';
import { ALL_FACINGS, type BattleCmdState, type RuntimeState } from './evidence';

export type { BattleCmdState, RuntimeState };

/** 状态 → 生产侧期望资产槽位（方案 §5 表逐行；`hit` 不占槽位故不在本表）。 */
export const EXPECTED_CLIP_BY_STATE: Readonly<Record<RuntimeState, string>> = {
  idle: 'idle',
  walk: 'walk',
  basic: 'atk',
  charge: 'cast',
  strike: 'cast',
  jump: 'jump',
  dead: 'idle', // dead 沿 idle 首帧（方案 §5 dead 行：不要求不存在的 3D die clip）
};

/** 六向（单一真源在 evidence.ALL_FACINGS）。 */
export const SIX_FACINGS: readonly BattleFacingHex[] = ALL_FACINGS;

/** 生产规则的宿主侧模拟（`ui/battle-hex-render.ts` character3DCommandOf 逐行同式）：
 *   有有效移动演出（未走满 && 未阵亡）⇒ 消费**演出创建时锁定**的 isJumpMove；否则 false。
 *   禁按 hopPx 猜（抛物线起落两点 hop=0），禁每帧直读快照（300ms 窗短于 0.6~1.2s 演出）。 */
export function lockedIsJump(
  anim: { isJumpMove: boolean; t: number; durationSec: number } | null,
  dead: boolean,
): boolean {
  return anim !== null && anim.t < anim.durationSec && !dead ? anim.isJumpMove : false;
}

export interface MoveLockCase {
  caseId: string;
  note: string;
  /** 原始快照意图（合成；= 移动**起点**那一刻的 SnapshotActor.isJump） */
  syntheticSnapshotIsJump: boolean;
  /** 快照窗（300ms）过后本帧快照的 isJump——用于说明「cmdIsJump 不跟着它变」 */
  snapshotIsJumpAtSample: boolean;
  intent: { isJumpMove: boolean; t: number; durationSec: number } | null;
  dead: boolean;
  /** 采样时的脚底世界坐标（物理像素） */
  footX: number;
  footY: number;
  hopPx: number;
  state: BattleCmdState;
  moveProgress: number | null;
  expectedClipKey: string;
  expectedCmdIsJump: boolean;
}

/** 轻功锁定三元用例（方案 §4.1 / arch seq=418 修订乙 + seq=421 文案要求）。 */
export const MOVE_LOCK_CASES: readonly MoveLockCase[] = [
  {
    caseId: 'jump-inside-300ms-window',
    note: '快照窗内（t=0.10s）：快照 isJump=true，命令消费锁定值 true',
    syntheticSnapshotIsJump: true,
    snapshotIsJumpAtSample: true,
    intent: { isJumpMove: true, t: 0.1, durationSec: 1.2 },
    dead: false,
    footX: 300, footY: 900, hopPx: 120, state: 'walk', moveProgress: 0.083,
    expectedClipKey: 'jump', expectedCmdIsJump: true,
  },
  {
    caseId: 'jump-after-300ms-snapshot-window',
    note: '★ seq=418 关键例：快照窗已过（本帧快照 isJump=false），但演出仍有效 ⇒ 命令仍 true、clip 仍 jump',
    syntheticSnapshotIsJump: true,
    snapshotIsJumpAtSample: false,
    intent: { isJumpMove: true, t: 0.45, durationSec: 1.2 },
    dead: false,
    footX: 420, footY: 900, hopPx: 240, state: 'walk', moveProgress: 0.375,
    expectedClipKey: 'jump', expectedCmdIsJump: true,
  },
  {
    caseId: 'walk-normal-no-jump',
    note: '普通移动：快照与命令均 false ⇒ clip=walk（不许被误判成轻功）',
    syntheticSnapshotIsJump: false,
    snapshotIsJumpAtSample: false,
    intent: { isJumpMove: false, t: 0.3, durationSec: 0.6 },
    dead: false,
    footX: 540, footY: 900, hopPx: 0, state: 'walk', moveProgress: 0.5,
    expectedClipKey: 'walk', expectedCmdIsJump: false,
  },
  {
    caseId: 'jump-endpoint-hop0',
    note: '★ 抛物线端点 hop=0（起跳瞬间 t=0.01）：不得按 hop 反推 ⇒ 命令仍 true、clip 仍 jump',
    syntheticSnapshotIsJump: true,
    snapshotIsJumpAtSample: true,
    intent: { isJumpMove: true, t: 0.01, durationSec: 1.2 },
    dead: false,
    footX: 660, footY: 900, hopPx: 0, state: 'walk', moveProgress: 0.008,
    expectedClipKey: 'jump', expectedCmdIsJump: true,
  },
  {
    caseId: 'jump-landing-hop0',
    note: '★ 抛物线端点 hop=0（落地下压前 t=1.19/1.2）：命令仍 true、clip 仍 jump',
    syntheticSnapshotIsJump: true,
    snapshotIsJumpAtSample: false,
    intent: { isJumpMove: true, t: 1.19, durationSec: 1.2 },
    dead: false,
    footX: 780, footY: 900, hopPx: 0, state: 'walk', moveProgress: 0.991,
    expectedClipKey: 'jump', expectedCmdIsJump: true,
  },
  {
    caseId: 'jump-released-after-duration',
    note: '演出走满 ⇒ 锁定值释放（cmdIsJump=false），后续普通移动回 walk（不串状态）',
    syntheticSnapshotIsJump: true,
    snapshotIsJumpAtSample: false,
    intent: { isJumpMove: true, t: 1.2, durationSec: 1.2 },
    dead: false,
    footX: 900, footY: 900, hopPx: 0, state: 'walk', moveProgress: 1,
    expectedClipKey: 'walk', expectedCmdIsJump: false,
  },
  {
    caseId: 'jump-died-releases',
    note: '★ 阵亡释放锁：即使演出未走满也不得再判轻功（死亡优先）',
    syntheticSnapshotIsJump: true,
    snapshotIsJumpAtSample: false,
    intent: { isJumpMove: true, t: 0.5, durationSec: 1.2 },
    dead: true,
    footX: 240, footY: 1200, hopPx: 0, state: 'dead', moveProgress: null,
    expectedClipKey: 'idle', expectedCmdIsJump: false,
  },
];

/** 六向 × 两态（idle / walk）的取景点（脚底，物理像素）；由宿主按视口等比铺开。 */
export interface FacingSample {
  facing: BattleFacingHex;
  state: BattleCmdState;
  expectedClipKey: string;
  /** 归一化取景位（0..1），宿主乘背衬尺寸得物理像素 */
  u: number;
  v: number;
}

export const FACING_SAMPLES: readonly FacingSample[] = SIX_FACINGS.map((facing, i) => ({
  facing,
  state: (i % 2 === 0 ? 'idle' : 'walk') as BattleCmdState,
  expectedClipKey: i % 2 === 0 ? 'idle' : 'walk',
  // 取景位：六向按 3 列 2 行铺开（u ∈ {1/6, 3/6, 5/6}，v 两档），全部落在画布内
  u: ((i % 3) + 0.5) / 3,
  v: i < 3 ? 0.3 : 0.62,
}));

/** 全状态取景（同一朝向 right，逐态一张；jump 用 walk+isJump+moveProgress 驱动）。 */
export interface StateSample {
  /** 证据标签（含 jump —— 它是**表现态**，不是快照 animState） */
  label: RuntimeState;
  /** 喂给命令的 animState（jump 态 = walk + isJump=true） */
  cmdState: BattleCmdState;
  isJump: boolean;
  expectedClipKey: string;
  stateElapsedSec: number;
  moveProgress: number | null;
  hopPx: number;
  squashY: number;
  alpha: number;
  /** 采样前喂多少帧（让交叉淡化走完，activeClipKey 稳定） */
  warmupFrames: number;
}

const STATE_WARMUP_FRAMES = 30; // 30 × 60fps ≈ 0.5s > 100ms 交叉淡化（visual only）

export const STATE_SAMPLES: readonly StateSample[] = [
  { label: 'idle', cmdState: 'idle', isJump: false, expectedClipKey: 'idle', stateElapsedSec: 0.4, moveProgress: null, hopPx: 0, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
  { label: 'walk', cmdState: 'walk', isJump: false, expectedClipKey: 'walk', stateElapsedSec: 0.4, moveProgress: 0.4, hopPx: 0, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
  { label: 'basic', cmdState: 'basic', isJump: false, expectedClipKey: 'atk', stateElapsedSec: 0.6, moveProgress: null, hopPx: 0, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
  { label: 'charge', cmdState: 'charge', isJump: false, expectedClipKey: 'cast', stateElapsedSec: 0.7, moveProgress: null, hopPx: 0, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
  { label: 'strike', cmdState: 'strike', isJump: false, expectedClipKey: 'cast', stateElapsedSec: 0.25, moveProgress: null, hopPx: 0, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
  { label: 'jump', cmdState: 'walk', isJump: true, expectedClipKey: 'jump', stateElapsedSec: 0.6, moveProgress: 0.5, hopPx: 150, squashY: 1, alpha: 1, warmupFrames: STATE_WARMUP_FRAMES },
  { label: 'dead', cmdState: 'dead', isJump: false, expectedClipKey: 'idle', stateElapsedSec: 0, moveProgress: null, hopPx: 0, squashY: 0.45, alpha: 0.35, warmupFrames: STATE_WARMUP_FRAMES },
];

/** 20 单位档采样计划（方案 §5.1/§5.2 原文：预热 10s、1/5/10 各 30s、20 单位 60s，每档 ≥1800 帧）。 */
export interface PerfStage {
  units: number;
  sampleSec: number;
}

export const SPEC_PROFILE: { name: string; warmupSec: number; stages: readonly PerfStage[] } = {
  name: 'spec',
  warmupSec: 10,
  stages: [
    { units: 1, sampleSec: 30 },
    { units: 5, sampleSec: 30 },
    { units: 10, sampleSec: 30 },
    { units: 20, sampleSec: 60 },
  ],
};

/** 浏览器 sim 的短档（只看「代码路径能出结论」；结果里 specProfile=false，判定被降级标注）。 */
export const SIM_PROFILE: { name: string; warmupSec: number; stages: readonly PerfStage[] } = {
  name: 'sim-short',
  warmupSec: 2,
  stages: [
    { units: 1, sampleSec: 3 },
    { units: 5, sampleSec: 3 },
    { units: 10, sampleSec: 3 },
    { units: 20, sampleSec: 6 },
  ],
};

/** 每单位 animation 相位错开步长（S0：i×0.137s 取模 idle 时长，防同相把 JS 骨架开销测低）。 */
export const UNIT_PHASE_STEP_SEC = 0.137;
