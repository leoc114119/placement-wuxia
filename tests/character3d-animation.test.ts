// T31-FE-A · 动作采样与状态机用例（方案 §4.1 / §5 / §9.1 animation 条）
//
// §9.1 要求：五 clip 采样边界；charge 循环；basic/strike 尾帧；jump root 三轴归零；
//   180ms 混合；状态切换不串 actor。本文件逐条落地。

import { describe, expect, it } from 'vitest';
import {
  CHARACTER_3D_CROSS_FADE_SEC,
  CHARACTER_3D_JUMP_MOVE_SEC,
  CHARACTER_3D_JUMP_PHASE_ANCHORS,
  CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
  CHARACTER_3D_JUMP_Y_GAIN,
  CHARACTER_3D_JUMP_Y_GAIN_BAND_RATIO,
  HERO_3D_ACTION_MAP,
  HERO_3D_SKILL_WINDOW_SEC,
  HERO_3D_STRIKE_START_RATIO,
  type Character3DRootYGain,
} from '../config/character-3d';
import { CHOREO } from '../config/battle-hex';
import {
  applyEmbeddedClip,
  applyRetargetedClip,
  bindRetargetedClip,
  CharacterAnimController,
  clipDurationSec,
  createPose,
  gainedRootY,
  parseCharacter3DClipJson,
  remapPhaseByAnchors,
  resolvePose,
  type CharacterAnimInput,
  type Character3DPose,
  type Character3DRetargetedClip,
} from '../ui/character3d/animation';
import { digestFloats } from '../ui/character3d/glb';
import { nlerp } from '../ui/character3d/math';
import { heroClip, heroClipRegistry, heroClipRaw, heroModel } from './character3d-fixtures';

const model = heroModel();
const IDLE: CharacterAnimInput = { state: 'idle', stateElapsedSec: 0, moveProgress: null, isJump: false };

function newController() {
  return new CharacterAnimController({
    actionMap: HERO_3D_ACTION_MAP,
    crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
    jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
    clips: heroClipRegistry(model),
  });
}

/** 参考实现：直接（不经状态机）采样某 clip 的某个相位并求解 palette。
 *  root/endpointInclusive 按**方案 v1.1 §4.1** 的 jump 口径可传（'zero-xz' + 端点含末帧）。 */
function referencePalette(
  key: 'idle' | 'atk' | 'cast' | 'jump',
  phase: number,
  loop: boolean,
  root: 'track' | 'zero' | 'zero-xz' = 'track',
  pose: Character3DPose = createPose(model),
  endpointInclusive = false,
  yGain: Character3DRootYGain | null = null,
): number {
  const clip = heroClip(key);
  const bound = bindRetargetedClip(clip, model);
  applyRetargetedClip(clip, bound, model, pose, phase, root, loop, endpointInclusive, yGain);
  return digestFloats(resolvePose(model, pose), 1e-5);
}

/** 【R2-1 §4.1.2(2)】演出进度 p → 素材相位 φ（生产锚表，供参考实现对齐）。 */
function jumpPhaseOf(p: number): number {
  return remapPhaseByAnchors(p, CHARACTER_3D_JUMP_PHASE_ANCHORS);
}

function sampleDigest(controller: CharacterAnimController): number {
  const pose = createPose(model);
  const scratch = createPose(model);
  return digestFloats(controller.sample(model, pose, scratch), 1e-5);
}

function samplePalette(controller: CharacterAnimController): Float32Array {
  return controller.sample(model, createPose(model), createPose(model));
}

describe('重定向动作 json 解析（fail-fast）', () => {
  const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(heroClipRaw('idle'))) as Record<string, unknown>;

  it('真实 4 条动作 json 全部解析通过：30fps / 40 骨 / 相位周期 = nFrames/fps', () => {
    const expectFrames: Record<string, number> = { idle: 200, atk: 45, cast: 136, jump: 46 };
    for (const key of ['idle', 'atk', 'cast', 'jump'] as const) {
      const clip = heroClip(key);
      expect(clip.fps, key).toBe(30);
      expect(clip.nFrames, key).toBe(expectFrames[key]);
      expect(Object.keys(clip.boneTracks).length, key).toBe(40); // 41 骨中 Root 走 rootTrack，不占旋转轨
      expect(clip.rootTrack.length, key).toBe(expectFrames[key]);
      expect(clip.mappedCount, key).toBe(40);
      expect(clip.samplerDurationSec, key).toBeCloseTo(expectFrames[key] / 30, 12);
    }
  });

  it('fps / nFrames / duration / rootMode 非法即抛', () => {
    const bad1 = clone();
    bad1.fps = 0;
    expect(() => parseCharacter3DClipJson(bad1, 'x')).toThrow(/fps/);
    const bad2 = clone();
    bad2.nFrames = 1;
    expect(() => parseCharacter3DClipJson(bad2, 'x')).toThrow(/nFrames/);
    const bad3 = clone();
    bad3.duration = 99;
    expect(() => parseCharacter3DClipJson(bad3, 'x')).toThrow(/duration/);
    const bad4 = clone();
    bad4.rootMode = 'zzz';
    expect(() => parseCharacter3DClipJson(bad4, 'x')).toThrow(/rootMode/);
    expect(() => parseCharacter3DClipJson(null, 'x')).toThrow(/不是对象/);
  });

  it('轨道帧数不符 / rootTrack 不符 / 四元数长度错即抛', () => {
    const bad1 = clone();
    (bad1.boneTracks as Record<string, number[][]>)['L_Thigh'] = [[0, 0, 0, 1]];
    expect(() => parseCharacter3DClipJson(bad1, 'x')).toThrow(/帧数/);
    const bad2 = clone();
    (bad2.boneTracks as Record<string, number[][]>)['L_Thigh'][0] = [0, 0, 1];
    expect(() => parseCharacter3DClipJson(bad2, 'x')).toThrow(/四元数/);
    const bad3 = clone();
    bad3.rootTrack = [[0, 0, 0]];
    expect(() => parseCharacter3DClipJson(bad3, 'x')).toThrow(/rootTrack/);
  });

  it('轨道骨名不在模型里 / 不是 skin.joints 成员即抛（禁静默跳过）', () => {
    const clip = heroClip('atk');
    const ghost: Character3DRetargetedClip = { ...clip, boneTracks: { ...clip.boneTracks, NoSuchBone: clip.boneTracks.L_Thigh } };
    expect(() => bindRetargetedClip(ghost, model)).toThrow(/不存在的骨/);
  });
});

describe('重定向 clip 采样（方案 §4.1）', () => {
  it('循环相位取模回卷（0 与 1 同帧）；单播相位夹取（≥1 全部停在同一末帧姿态）', () => {
    for (const key of ['idle', 'atk'] as const) {
      const clip = heroClip(key);
      const bound = bindRetargetedClip(clip, model);
      const at = (phase: number, loop: boolean): number => {
        const pose = createPose(model);
        applyRetargetedClip(clip, bound, model, pose, phase, 'track', loop);
        return digestFloats(pose.q, 1e-6);
      };
      expect(at(1, true), `${key} 循环回卷`).toBe(at(0, true));
      // 尾帧保持：相位 1 与相位 1.7 完全同帧（夹取），且与首帧不同
      expect(at(1, false), `${key} 单播 ≥1 稳定`).toBe(at(1.7, false));
      expect(at(1, false), `${key} 末帧 ≠ 首帧`).not.toBe(at(0, false));
    }
  });

  it('时间极性为 t=0→i0（**有意更正**：不再沿用 probe/render.mjs 的历史反向口径）', () => {
    // 历史实现（probe 与 tools/glb2d/render.mjs）把 nlerp 权重 k=a 给 i0 ⇒ a=0 取 i1、a→1 回 i0，
    // 即区间内倒播，且与 root 位移的时间方向相反。arch seq=414 判定为缺陷并要求标准化。
    // 本用例锁的是**更正后**口径；对拍金标已按镜像子帧时刻重生成并标 intentional correction
    //（见 tests/character3d-parity-golden/probe-golden.json 的 meta.corrections）。
    const clip = heroClip('atk');
    const bound = bindRetargetedClip(clip, model);
    const bone = bound.tracks.find((t) => t.name === 'L_Thigh');
    if (!bone) throw new Error('夹具缺 L_Thigh');
    const q0 = clip.boneTracks.L_Thigh[2];
    const q1 = clip.boneTracks.L_Thigh[3];
    const pose = createPose(model);
    const maxDiff = (v: ArrayLike<number>, q: ArrayLike<number>): number => {
      let d = 0;
      for (let i = 0; i < 4; i++) d = Math.max(d, Math.abs(v[i] - q[i]));
      return d;
    };
    // a=0 ⇒ k=1（取 i0）
    applyRetargetedClip(clip, bound, model, pose, 2 / clip.nFrames, 'track', true);
    const expectK1 = nlerp(new Float32Array(4), q0, 0, q1, 0, 1);
    expect(maxDiff(pose.qV[bone.node], expectK1)).toBeLessThan(1e-6);
    // a=0.25 ⇒ k=0.75
    applyRetargetedClip(clip, bound, model, pose, 2.25 / clip.nFrames, 'track', true);
    const expectK075 = nlerp(new Float32Array(4), q0, 0, q1, 0, 0.75);
    expect(maxDiff(pose.qV[bone.node], expectK075)).toBeLessThan(1e-6);
    // 反向口径（k=a=0.25）必须与之显著不同 —— 若有人回退极性，本断言立刻报警
    const legacyK025 = nlerp(new Float32Array(4), q0, 0, q1, 0, 0.25);
    expect(maxDiff(expectK075, legacyK025)).toBeGreaterThan(1e-4);
  });

  it('jump 剥离 rootTrack 三轴位移（防双跳）：zero 时 Root 恒为静止位移', () => {
    const clip = heroClip('jump');
    const bound = bindRetargetedClip(clip, model);
    const pose = createPose(model);
    for (const phase of [0, 0.1, 0.333, 0.5, 0.777, 1]) {
      applyRetargetedClip(clip, bound, model, pose, phase, 'zero');
      expect(pose.tV[bound.rootNode][0], `phase=${phase} x`).toBeCloseTo(bound.rootRest[0], 12);
      expect(pose.tV[bound.rootNode][1], `phase=${phase} y`).toBeCloseTo(bound.rootRest[1], 12);
      expect(pose.tV[bound.rootNode][2], `phase=${phase} z`).toBeCloseTo(bound.rootRest[2], 12);
    }
    // 对照：track 时 y 确实在动（否则本用例是空断言）
    const ys = [0, 0.25, 0.5, 0.75, 1].map((phase) => {
      applyRetargetedClip(clip, bound, model, pose, phase, 'track');
      return pose.tV[bound.rootNode][1];
    });
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.1);
    // 源本身水平分量恒 0（README：动作全部为原地），三轴里只有 y 有内容
    expect(clip.rootTrack.every((r) => r[0] === 0 && r[2] === 0)).toBe(true);
  });

  it('root 增量按帧线性插值叠加在静止位移上（抽第 2 帧整点核对）', () => {
    const clip = heroClip('jump');
    const bound = bindRetargetedClip(clip, model);
    const pose = createPose(model);
    const phase = 1 / clip.nFrames; // 恰好落在第 1 帧（i0=1, a=0）
    applyRetargetedClip(clip, bound, model, pose, phase, 'track');
    expect(pose.tV[bound.rootNode][1]).toBeCloseTo(bound.rootRest[1] + clip.rootTrack[1][1], 6);
  });

  it('采样确定性：同相位重复采样逐位一致', () => {
    const clip = heroClip('idle');
    const bound = bindRetargetedClip(clip, model);
    const a = createPose(model);
    const b = createPose(model);
    applyRetargetedClip(clip, bound, model, a, 0.371, 'track');
    applyRetargetedClip(clip, bound, model, b, 0.371, 'track');
    expect(Array.from(resolvePose(model, a))).toEqual(Array.from(resolvePose(model, b)));
  });
});

describe('GLB 内嵌 clip 采样（STEP / LINEAR 分流）', () => {
  const walk = model.clips.find((c) => c.name === 'preset:biped:walk');

  it('walk 存在且时长 = 2.3333s（相位 0 落首关键帧、相位 1 折回本身）', () => {
    expect(walk).toBeTruthy();
    if (!walk) return;
    expect(clipDurationSec({ kind: 'embedded', name: walk.name, clip: walk })).toBeCloseTo(2.375 - 1 / 24, 6);
  });

  it('STEP 轨段内保持（Root 旋转在两关键帧之间不插值）', () => {
    const pose = createPose(model);
    const rootNode = model.nodes.trs.findIndex((n) => n.name === 'Root');
    const digests = [0, 0.25, 0.5, 0.75].map((phase) => {
      applyEmbeddedClip(walk!, model, pose, phase, 'track');
      return [...pose.qV[rootNode]];
    });
    for (const d of digests) expect(d).toEqual(digests[0]);
  });

  it('LINEAR 轨段内插值（L_Thigh 在两个端点之间取中间姿态）', () => {
    const pose = createPose(model);
    const thigh = model.nodes.trs.findIndex((n) => n.name === 'L_Thigh');
    applyEmbeddedClip(walk!, model, pose, 0, 'track');
    const atStart = [...pose.qV[thigh]];
    applyEmbeddedClip(walk!, model, pose, 0.02, 'track');
    const slightlyLater = [...pose.qV[thigh]];
    expect(slightlyLater).not.toEqual(atStart);
  });

  it('循环回卷：相位 0 与 1 同姿态；rootDisplacement=zero 时 Root 平移保持静止值', () => {
    const poseA = createPose(model);
    const poseB = createPose(model);
    applyEmbeddedClip(walk!, model, poseA, 0, 'track');
    applyEmbeddedClip(walk!, model, poseB, 1, 'track');
    expect(digestFloats(poseA.q, 1e-6)).toBe(digestFloats(poseB.q, 1e-6));
    const rootIdx = model.nodes.trs.findIndex((n) => n.name === 'Root');
    const rest = model.nodes.trs[rootIdx].t;
    const poseZero = createPose(model);
    for (const phase of [0, 0.3, 0.7]) {
      applyEmbeddedClip(walk!, model, poseZero, phase, 'zero');
      expect(poseZero.tV[rootIdx][0]).toBeCloseTo(rest[0], 12);
      expect(poseZero.tV[rootIdx][1]).toBeCloseTo(rest[1], 12);
      expect(poseZero.tV[rootIdx][2]).toBeCloseTo(rest[2], 12);
    }
  });

  it('walk 的 Root 平移在 STEP 下表现为常值（不在原位移上飘）', () => {
    const rootIdx = model.nodes.trs.findIndex((n) => n.name === 'Root');
    const pose = createPose(model);
    const ys = [0, 0.2, 0.5, 0.9].map((phase) => {
      applyEmbeddedClip(walk!, model, pose, phase, 'track');
      return pose.tV[rootIdx][1];
    });
    expect(new Set(ys.map((v) => v.toFixed(6))).size).toBe(1);
  });
});

describe('动作状态机（方案 §5）', () => {
  it('idle 走 idle 槽位；walk 走 GLB 内嵌 walk 槽位', () => {
    const c = newController();
    c.update(0.016, IDLE);
    expect(c.activeClipKey).toBe('idle');
    c.update(0.016, { ...IDLE, state: 'walk' });
    expect(c.activeClipKey).toBe('walk');
  });

  it('walk + moveProgress + hopPx>0 ⇒ 轻功（jump 槽位）；moveProgress 归 null 后回到 idle', () => {
    const c = newController();
    c.update(0.016, { state: 'walk', stateElapsedSec: 0.1, moveProgress: 0.2, isJump: true });
    expect(c.actionKey).toBe('jump');
    expect(c.activeClipKey).toBe('jump');
    c.update(0.016, { state: 'walk', stateElapsedSec: 0.2, moveProgress: 0.9, isJump: true });
    expect(c.activeClipKey).toBe('jump'); // 闩锁：一次移动窗口内不因 hop 归零而回落
    c.update(0.016, { state: 'idle', stateElapsedSec: 0, moveProgress: null, isJump: false });
    expect(c.activeClipKey).toBe('idle');
  });

  it('jump 采样：**只剥 root x/z、保留 y** + 相位锚表重映射 + 正段增益（R2-1 §4.1.2）', () => {
    const c = newController();
    c.update(0.016, { state: 'walk', stateElapsedSec: 0.1, moveProgress: 0.5, isJump: true });
    const palette = samplePalette(c);
    expect(palette.length).toBe(41 * 16);
    // 演出进度 0.5 ⇒ 素材相位 φ=0.44+((0.5−0.25)/0.5)×(0.73−0.44)=0.585 ⇒ fi = φ×(46−1)
    expect(jumpPhaseOf(0.5)).toBeCloseTo(0.585, 12);
    const gain = HERO_3D_ACTION_MAP.jump.rootYGain ?? null;
    const reference = referencePalette('jump', jumpPhaseOf(0.5), false, 'zero-xz', createPose(model), true, gain);
    const c2 = newController();
    c2.update(0.016, { state: 'walk', stateElapsedSec: 0.1, moveProgress: 0.5, isJump: true });
    expect(sampleDigest(c2)).toBe(reference);
    // 锚表确实起作用（若回退成「进度即相位」，采样结果必不同）
    // 反例自证：若有人把「进度即相位」写回（φ 恒等），同一 progress 的采样必与此参考不同
    const c3 = newController();
    c3.update(0.016, { state: 'walk', stateElapsedSec: 0.1, moveProgress: 0.5, isJump: true });
    expect(sampleDigest(c3)).not.toBe(referencePalette('jump', 0.5, false, 'zero-xz', createPose(model), true, gain));
  });

  it('jump 相位锚表：深蹲压缩 / 滞空扩展 / 落地缓冲 三段各自锚值对上；端点 p=0/1 不变', () => {
    expect(jumpPhaseOf(0)).toBe(0);
    expect(jumpPhaseOf(0.25)).toBeCloseTo(0.44, 12);
    expect(jumpPhaseOf(0.75)).toBeCloseTo(0.73, 12);
    expect(jumpPhaseOf(1)).toBe(1);
    // 分段线性：中值点各自落在锚线上
    expect(jumpPhaseOf(0.125)).toBeCloseTo(0.22, 12);
    expect(jumpPhaseOf(0.5)).toBeCloseTo(0.585, 12);
    expect(jumpPhaseOf(0.875)).toBeCloseTo(0.865, 12);
    // 单调不减（禁回卷/倒播）
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const phi = jumpPhaseOf(i / 100);
      expect(phi).toBeGreaterThanOrEqual(prev);
      prev = phi;
    }
    // 缺省锚表 = 恒等（其它 clip 的 progressSource 不受影响）
    expect(remapPhaseByAnchors(0.37, undefined)).toBe(0.37);
  });

  it('jump 正段增益（v1.3.1 k=3.2）：y>0 ×k、y≤0 ×1（深蹲深度不变）、过零带线性渐入', () => {
    const gain = { gain: CHARACTER_3D_JUMP_Y_GAIN, bandRatio: CHARACTER_3D_JUMP_Y_GAIN_BAND_RATIO };
    const clip = heroClip('jump');
    const peak = clip.rootTrackPeakY;
    expect(peak).toBeCloseTo(0.16655, 5);
    expect(gain.gain).toBe(3.2);
    const band = peak * gain.bandRatio;
    expect(gainedRootY(-0.176, gain, peak)).toBeCloseTo(-0.176, 12); // 蹲底原样（不加深）
    expect(gainedRootY(peak, gain, peak)).toBeCloseTo(peak * gain.gain, 12); // 峰值 ×k
    // 带内线性渐入：带中点增益 = 1 + (k−1)/2
    expect(gainedRootY(band / 2, gain, peak)).toBeCloseTo((band / 2) * (1 + (gain.gain - 1) / 2), 12);
    expect(gainedRootY(band * 2, gain, peak)).toBeCloseTo(band * 2 * gain.gain, 12); // 带外恒 k
    // 过零连续：0⁻ → 0⁻、0 → 0，且左右极限一致（无速度折点式跳变）
    expect(gainedRootY(0, gain, peak)).toBe(0);
    expect(gainedRootY(-1e-9, gain, peak)).toBe(-1e-9); // 负侧原样（连续，不跳变）
    // 跨零连续：左右极限都≈0（差 < 3ε，无跳变）
    expect(Math.abs(gainedRootY(1e-9, gain, peak) - gainedRootY(-1e-9, gain, peak))).toBeLessThan(3e-9);
    expect(gainedRootY(1e-9, gain, peak)).toBeLessThan(2e-9);
    // 控制器实采：峰值相位处 root y 必须 = gainedRootY(源值)（用状态机取同一素材）
    const c = newController();
    const pose = createPose(model);
    const scratch = createPose(model);
    c.update(0.016, { state: 'walk', stateElapsedSec: 0, moveProgress: 0.55, isJump: true });
    c.sample(model, pose, scratch);
    const phi = jumpPhaseOf(0.55);
    const fi = phi * (clip.nFrames - 1); // endpointInclusive：fi = φ×(46−1)
    const i0 = Math.floor(fi);
    const a = fi - i0;
    const dyRaw = clip.rootTrack[i0][1] * (1 - a) + clip.rootTrack[i0 + 1][1] * a; // 与采样器同式
    const bound = bindRetargetedClip(clip, model);
    expect(pose.tV[bound.rootNode][1] - bound.rootRest[1]).toBeCloseTo(gainedRootY(dyRaw, gain, peak), 6);
  });

  it('B1 · 轻功判据 = isJump 透传：hopPx 为 0 的端点帧也全程走 jump 槽位', () => {
    // 方案 §4.1（arch 9e824cb5）：isJump 必须从 SnapshotActor.isJump 原样透传；
    // 禁用 hopPx!==0 猜轻功 —— 抛物线起点/终点 hop 恰为 0，猜会各漏一帧。
    const c = newController();
    // 轻功窗口第一帧：moveProgress 已非 null 但 hop 仍为 0
    c.update(0.016, { state: 'walk', stateElapsedSec: 0, moveProgress: 0, isJump: true });
    expect(c.actionKey, '起点帧').toBe('jump');
    expect(c.activeClipKey, '起点帧').toBe('jump');
    const startDigest = sampleDigest(c);
    expect(startDigest).toBe(referencePalette('jump', jumpPhaseOf(0), false, 'zero-xz', createPose(model), true, HERO_3D_ACTION_MAP.jump.rootYGain ?? null));
    // 窗口末帧：hop 回到 0、moveProgress 仍非 null
    c.update(0.016, { state: 'walk', stateElapsedSec: 1.5, moveProgress: 1, isJump: true });
    expect(c.actionKey, '终点帧').toBe('jump');
    expect(sampleDigest(c)).toBe(referencePalette('jump', jumpPhaseOf(1), false, 'zero-xz', createPose(model), true, HERO_3D_ACTION_MAP.jump.rootYGain ?? null));
    // 非轻功：hopPx 非 0 也不得被判成 jump（判据只认 isJump）
    c.update(0.016, { state: 'walk', stateElapsedSec: 0.2, moveProgress: 0.4, isJump: false });
    expect(c.actionKey).toBe('walk');
    expect(c.activeClipKey).toBe('walk');
  });

  it('basic：把 1.50s 源归一映射到 CHOREO.basicSec，窗尾保持末帧（不跳回首帧）', () => {
    const c = newController();
    c.update(0.016, { state: 'basic', stateElapsedSec: 0, moveProgress: null, isJump: false });
    expect(c.activeClipKey).toBe('atk');
    expect(sampleDigest(c)).toBe(referencePalette('atk', 0, false));
    c.update(0.016, { state: 'basic', stateElapsedSec: CHOREO.basicSec, moveProgress: null, isJump: false });
    const atWindowEnd = sampleDigest(c);
    expect(atWindowEnd).toBe(referencePalette('atk', 1, false)); // 末帧
    expect(atWindowEnd).not.toBe(referencePalette('atk', 0, false)); // 不是首帧
    // 窗后仍保持末帧
    c.update(0.016, { state: 'basic', stateElapsedSec: CHOREO.basicSec * 3, moveProgress: null, isJump: false });
    expect(sampleDigest(c)).toBe(atWindowEnd);
  });

  it('charge（R2-2 §4.1.3）：固定 3s 窗循环——相位 0 与 3.0 同帧、1.5 不同帧；无 840ms 周期回卷', () => {
    const c = newController();
    c.update(0.016, { state: 'charge', stateElapsedSec: 0, moveProgress: null, isJump: false });
    expect(c.activeClipKey).toBe('cast');
    const p0 = sampleDigest(c);
    // 3.0s 走满整遍源 ⇒ 回到相位 0（窗取模）
    c.update(0.016, { state: 'charge', stateElapsedSec: HERO_3D_SKILL_WINDOW_SEC, moveProgress: null, isJump: false });
    expect(sampleDigest(c)).toBe(p0);
    // 半窗（1.5s）= 源相位 1/3（4.5333s 源被压进 3s），与相位 0 不同
    c.update(0.016, { state: 'charge', stateElapsedSec: HERO_3D_SKILL_WINDOW_SEC / 2, moveProgress: null, isJump: false });
    expect(sampleDigest(c)).not.toBe(p0);
    // ★ 旧口径回归断言：840ms 处**不得**回到相位 0（若有人改回 840ms 循环，本断言立刻报警）
    c.update(0.016, { state: 'charge', stateElapsedSec: 0.84, moveProgress: null, isJump: false });
    expect(sampleDigest(c)).not.toBe(p0);
    // 840ms 处的相位 = 0.28（= 840/3000），与「相位 0.28 的参考采样」逐位一致
    expect(sampleDigest(c)).toBe(referencePalette('cast', 0.28, true));
  });

  it('charge 相位斜率为 1/3（源 4.5333s 压进 3s ⇒ 等效 1.511×），逐点单调无回卷', () => {
    const c = newController();
    const at = (t: number): number => {
      c.update(0.016, { state: 'charge', stateElapsedSec: t, moveProgress: null, isJump: false });
      return sampleDigest(c);
    };
    const frames = [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0];
    const digests = frames.map(at);
    // 窗内帧间两两不同（相位严格递增、无 840ms 级回卷）；窗尾（3.0s）恰回到相位 0（整遍播完）
    expect(new Set(digests.slice(0, -1)).size).toBe(frames.length - 1);
    expect(digests[digests.length - 1]).toBe(digests[0]);
    // 每个采样点等于「相位 = t/3」的参考采样（压缩比逐点可验）
    for (const t of [0.9, 1.5, 2.1]) {
      expect(at(t)).toBe(referencePalette('cast', t / HERO_3D_SKILL_WINDOW_SEC, true));
    }
  });

  it('strike（R2-2 §4.1.3）：末姿保持——窗内任意时刻相位恒 1（不再从 2/3 重扫）', () => {
    const c2 = newController();
    c2.update(0.016, { state: 'strike', stateElapsedSec: 0, moveProgress: null, isJump: false });
    expect(c2.activeClipKey).toBe('cast');
    const last = referencePalette('cast', 1, false);
    expect(sampleDigest(c2)).toBe(last);
    // 300ms 快照窗内逐点恒为末帧（相位不推进、帧索引不变）
    for (const t of [0.05, 0.1, 0.2, 0.29]) {
      c2.update(0.016, { state: 'strike', stateElapsedSec: t, moveProgress: null, isJump: false });
      expect(sampleDigest(c2), `t=${t}`).toBe(last);
    }
    // 反例自证：旧口径起点 2/3 与末帧不同（即「不再重扫」确有可观测差别）
    expect(referencePalette('cast', 2 / 3, false)).not.toBe(last);
  });

  it('charge→strike 不重启 clip（同一 cast 槽位）：charge 窗尾即源末帧，strike 续保持不再回扫', () => {
    const c = newController();
    c.update(0.016, { state: 'charge', stateElapsedSec: HERO_3D_SKILL_WINDOW_SEC, moveProgress: null, isJump: false });
    const chargeDigest = sampleDigest(c);
    expect(chargeDigest).toBe(referencePalette('cast', 0, true)); // 窗尾相位回卷到 0（= 源首帧）
    c.update(0.016, { state: 'strike', stateElapsedSec: 0, moveProgress: null, isJump: false });
    expect(c.activeClipKey).toBe('cast');
    const strikeDigest = sampleDigest(c);
    expect(strikeDigest).toBe(referencePalette('cast', 1, false)); // 末姿保持
    expect(strikeDigest).not.toBe(chargeDigest);
  });

  it('hit：不切专用动作（沿用当前 clip），dead：idle 首帧且不混回', () => {
    const c = newController();
    c.update(0.016, { ...IDLE, state: 'walk' });
    c.update(0.016, { state: 'hit', stateElapsedSec: 0.05, moveProgress: null, isJump: false });
    expect(c.actionKey).not.toBe('hit'); // hit 继承的是上一个动作键
    expect(c.activeClipKey).toBe('walk');
    expect(c.fadeWeight).toBe(1); // 不重起混合
    c.update(0.016, { state: 'dead', stateElapsedSec: 0, moveProgress: null, isJump: false });
    expect(c.activeClipKey).toBe('idle');
    expect(sampleDigest(c)).toBe(referencePalette('idle', 0, false));
  });

  it('交叉淡化 100ms；jump→idle 固定 180ms；淡化中确实是混合姿态', () => {
    const maxDiff = (a: Float32Array, b: Float32Array): number => {
      let d = 0;
      for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
      return d;
    };
    const c = newController();
    c.update(0.016, IDLE);
    const pureIdle = samplePalette(c);
    // idle → walk：100ms
    c.update(0, { ...IDLE, state: 'walk' });
    expect(c.fadeWeight).toBe(0);
    const w0 = samplePalette(c);
    expect(maxDiff(w0, pureIdle), '权重 0 ⇒ 仍是上一段姿态').toBeLessThan(1e-5);
    // 淡化期间保持目标状态不变（否则会立刻反向切换，淡化被重置）
    c.update(CHARACTER_3D_CROSS_FADE_SEC / 2, { ...IDLE, state: 'walk' });
    expect(c.fadeWeight).toBeCloseTo(0.5, 6);
    const mid = samplePalette(c);
    expect(maxDiff(mid, pureIdle), '淡化中不得等于起点').toBeGreaterThan(1e-4);
    c.update(CHARACTER_3D_CROSS_FADE_SEC / 2, { ...IDLE, state: 'walk' });
    expect(c.fadeWeight).toBe(1);
    const done = samplePalette(c);
    expect(maxDiff(done, mid), '权重 1 应继续走向目标姿态').toBeGreaterThan(1e-4);
    expect(maxDiff(done, pureIdle)).toBeGreaterThan(1e-3);
    // jump → idle：180ms（时长由配置固定，且长于默认 100ms）
    const d = newController();
    d.update(0.016, IDLE);
    d.update(0, { state: 'walk', stateElapsedSec: 0.05, moveProgress: 0.3, isJump: true });
    expect(d.activeClipKey).toBe('jump');
    d.update(0, IDLE);
    expect(d.fadeWeight).toBe(0);
    d.update(CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC / 2, IDLE);
    expect(d.fadeWeight).toBeCloseTo(0.5, 6);
    d.update(CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC / 2, IDLE);
    expect(d.fadeWeight).toBe(1);
    expect(CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC).toBeGreaterThan(CHARACTER_3D_CROSS_FADE_SEC);
  });

  it('状态切换不串 actor：两个控制器的输出与各自独立实例逐位一致', () => {
    const a = newController();
    const b = newController();
    const soloA = newController();
    const soloB = newController();
    for (let i = 0; i < 20; i++) {
      const dt = 0.016;
      a.update(dt, IDLE);
      soloA.update(dt, IDLE);
      b.update(dt, { state: 'charge', stateElapsedSec: i * dt, moveProgress: null, isJump: false });
      soloB.update(dt, { state: 'charge', stateElapsedSec: i * dt, moveProgress: null, isJump: false });
    }
    expect(sampleDigest(a)).toBe(sampleDigest(soloA));
    expect(sampleDigest(b)).toBe(sampleDigest(soloB));
    expect(sampleDigest(a)).not.toBe(sampleDigest(b));
    expect(a.activeClipKey).toBe('idle');
    expect(b.activeClipKey).toBe('cast');
  });

  it('缺槽位时给出诊断而不是崩溃（加载未完成不得画半成品）', () => {
    const c = new CharacterAnimController({
      actionMap: HERO_3D_ACTION_MAP,
      crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
      jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
      clips: {},
    });
    c.update(0.016, IDLE);
    const palette = c.sample(model, createPose(model), createPose(model));
    expect(palette.length).toBe(41 * 16);
    expect(c.diagnostics.some((d) => d.startsWith('missing-clip:'))).toBe(true);
  });
});
