// T31-FE-A · 动作采样与状态机用例（方案 §4.1 / §5 / §9.1 animation 条）
//
// §9.1 要求：五 clip 采样边界；charge 循环；basic/strike 尾帧；jump root 三轴归零；
//   180ms 混合；状态切换不串 actor。本文件逐条落地。

import { describe, expect, it } from 'vitest';
import {
  CHARACTER_3D_CROSS_FADE_SEC,
  CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
  HERO_3D_ACTION_MAP,
  HERO_3D_CAST_CYCLE_SEC,
  HERO_3D_STRIKE_START_RATIO,
  HERO_3D_STRIKE_WINDOW_SEC,
} from '../config/character-3d';
import { CAST_FRAME_PERIOD_MS, CHOREO } from '../config/battle-hex';
import {
  applyEmbeddedClip,
  applyRetargetedClip,
  bindRetargetedClip,
  CharacterAnimController,
  clipDurationSec,
  createPose,
  parseCharacter3DClipJson,
  resolvePose,
  type CharacterAnimInput,
  type Character3DPose,
  type Character3DRetargetedClip,
} from '../ui/character3d/animation';
import { digestFloats } from '../ui/character3d/glb';
import { nlerp } from '../ui/character3d/math';
import { heroClip, heroClipRegistry, heroClipRaw, heroModel } from './character3d-fixtures';

const model = heroModel();
const IDLE: CharacterAnimInput = { state: 'idle', stateElapsedSec: 0, moveProgress: null, hopPx: 0 };

function newController() {
  return new CharacterAnimController({
    actionMap: HERO_3D_ACTION_MAP,
    crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
    jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
    clips: heroClipRegistry(model),
  });
}

/** 参考实现：直接（不经状态机）采样某 clip 的某个相位并求解 palette。 */
function referencePalette(
  key: 'idle' | 'atk' | 'cast' | 'jump',
  phase: number,
  loop: boolean,
  root: 'track' | 'zero' = 'track',
  pose: Character3DPose = createPose(model),
): number {
  const clip = heroClip(key);
  const bound = bindRetargetedClip(clip, model);
  applyRetargetedClip(clip, bound, model, pose, phase, root, loop);
  return digestFloats(resolvePose(model, pose), 1e-5);
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

  it('帧间插值口径与 tools/glb2d/render.mjs 同源：k=a 权重给 i0（勿「顺手改正」）', () => {
    // 该口径是 2D 出帧链路（已被 Leo 认可的成品帧）一直在用的同一实现，
    // probe 与迁移件都逐位复现它；对拍用例（character3d-probe-parity）锁定的是同一件事。
    const clip = heroClip('atk');
    const bound = bindRetargetedClip(clip, model);
    const pose = createPose(model);
    const probeLike = new Float32Array(4);
    nlerp(probeLike, clip.boneTracks.L_Thigh[2], 0, clip.boneTracks.L_Thigh[3], 0, 0.25);
    applyRetargetedClip(clip, bound, model, pose, 2.25 / clip.nFrames, 'track', true);
    const q = pose.qV[bound.tracks.find((t) => t.name === 'L_Thigh')!.node];
    for (let i = 0; i < 4; i++) expect(q[i]).toBeCloseTo(probeLike[i], 6);
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
    c.update(0.016, { state: 'walk', stateElapsedSec: 0.1, moveProgress: 0.2, hopPx: 12 });
    expect(c.actionKey).toBe('jump');
    expect(c.activeClipKey).toBe('jump');
    c.update(0.016, { state: 'walk', stateElapsedSec: 0.2, moveProgress: 0.9, hopPx: 2 });
    expect(c.activeClipKey).toBe('jump'); // 闩锁：一次移动窗口内不因 hop 归零而回落
    c.update(0.016, { state: 'idle', stateElapsedSec: 0, moveProgress: null, hopPx: 0 });
    expect(c.activeClipKey).toBe('idle');
  });

  it('jump 采样期间 root 三轴归零（状态机透传 rootMotion=zero）', () => {
    const c = newController();
    c.update(0.016, { state: 'walk', stateElapsedSec: 0.1, moveProgress: 0.5, hopPx: 20 });
    const palette = samplePalette(c);
    expect(palette.length).toBe(41 * 16);
    const reference = referencePalette('jump', 0.5, false, 'zero');
    // 相位 = moveProgress（0.5）× 完整 1.5s 源 ⇒ 与参考实现同帧
    const c2 = newController();
    c2.update(0.016, { state: 'walk', stateElapsedSec: 0.1, moveProgress: 0.5, hopPx: 20 });
    expect(sampleDigest(c2)).toBe(reference);
  });

  it('basic：把 1.50s 源归一映射到 CHOREO.basicSec，窗尾保持末帧（不跳回首帧）', () => {
    const c = newController();
    c.update(0.016, { state: 'basic', stateElapsedSec: 0, moveProgress: null, hopPx: 0 });
    expect(c.activeClipKey).toBe('atk');
    expect(sampleDigest(c)).toBe(referencePalette('atk', 0, false));
    c.update(0.016, { state: 'basic', stateElapsedSec: CHOREO.basicSec, moveProgress: null, hopPx: 0 });
    const atWindowEnd = sampleDigest(c);
    expect(atWindowEnd).toBe(referencePalette('atk', 1, false)); // 末帧
    expect(atWindowEnd).not.toBe(referencePalette('atk', 0, false)); // 不是首帧
    // 窗后仍保持末帧
    c.update(0.016, { state: 'basic', stateElapsedSec: CHOREO.basicSec * 3, moveProgress: null, hopPx: 0 });
    expect(sampleDigest(c)).toBe(atWindowEnd);
  });

  it('charge：cast 循环，一轮 = 840ms（相位 0 与 0.84 同帧、0.42 不同帧）', () => {
    const c = newController();
    c.update(0.016, { state: 'charge', stateElapsedSec: 0, moveProgress: null, hopPx: 0 });
    expect(c.activeClipKey).toBe('cast');
    const p0 = sampleDigest(c);
    c.update(0.016, { state: 'charge', stateElapsedSec: HERO_3D_CAST_CYCLE_SEC, moveProgress: null, hopPx: 0 });
    expect(sampleDigest(c)).toBe(p0);
    c.update(0.016, { state: 'charge', stateElapsedSec: HERO_3D_CAST_CYCLE_SEC / 2, moveProgress: null, hopPx: 0 });
    expect(sampleDigest(c)).not.toBe(p0);
  });

  it('strike：从 2/3 播到末尾并保持，走完一帧节拍（280ms）即到位', () => {
    const c = newController();
    c.update(0.016, { state: 'strike', stateElapsedSec: 0, moveProgress: null, hopPx: 0 });
    expect(c.activeClipKey).toBe('cast');
    expect(HERO_3D_ACTION_MAP.strike.playWindowSec).toBeCloseTo(CAST_FRAME_PERIOD_MS / 1000, 12);
    expect(HERO_3D_STRIKE_WINDOW_SEC).toBeCloseTo(0.28, 12);
    // 起点 = 2/3（与 reference 的 2/3 相位同帧）
    c.update(0.016, { state: 'charge', stateElapsedSec: 0, moveProgress: null, hopPx: 0 });
    const c2 = newController();
    c2.update(0.016, { state: 'strike', stateElapsedSec: 0, moveProgress: null, hopPx: 0 });
    expect(sampleDigest(c2)).toBe(referencePalette('cast', HERO_3D_STRIKE_START_RATIO, false));
    // 一帧节拍后 = 末帧
    c2.update(0.016, { state: 'strike', stateElapsedSec: HERO_3D_STRIKE_WINDOW_SEC, moveProgress: null, hopPx: 0 });
    expect(sampleDigest(c2)).toBe(referencePalette('cast', 1, false));
  });

  it('charge→strike 不重启 clip（同一 cast 槽位、无抽搐式回到首帧）', () => {
    const c = newController();
    c.update(0.016, { state: 'charge', stateElapsedSec: 0.6, moveProgress: null, hopPx: 0 });
    const chargeDigest = sampleDigest(c);
    c.update(0.016, { state: 'strike', stateElapsedSec: 0, moveProgress: null, hopPx: 0 });
    expect(c.activeClipKey).toBe('cast');
    const strikeDigest = sampleDigest(c);
    // strike 从 2/3 起播（不是从 0），且与 charge 相位不同的位置
    expect(strikeDigest).toBe(referencePalette('cast', HERO_3D_STRIKE_START_RATIO, false));
    expect(strikeDigest).not.toBe(chargeDigest);
    expect(strikeDigest).not.toBe(referencePalette('cast', 0, false));
  });

  it('hit：不切专用动作（沿用当前 clip），dead：idle 首帧且不混回', () => {
    const c = newController();
    c.update(0.016, { ...IDLE, state: 'walk' });
    c.update(0.016, { state: 'hit', stateElapsedSec: 0.05, moveProgress: null, hopPx: 0 });
    expect(c.actionKey).not.toBe('hit'); // hit 继承的是上一个动作键
    expect(c.activeClipKey).toBe('walk');
    expect(c.fadeWeight).toBe(1); // 不重起混合
    c.update(0.016, { state: 'dead', stateElapsedSec: 0, moveProgress: null, hopPx: 0 });
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
    d.update(0, { state: 'walk', stateElapsedSec: 0.05, moveProgress: 0.3, hopPx: 9 });
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
      b.update(dt, { state: 'charge', stateElapsedSec: i * dt, moveProgress: null, hopPx: 0 });
      soloB.update(dt, { state: 'charge', stateElapsedSec: i * dt, moveProgress: null, hopPx: 0 });
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
