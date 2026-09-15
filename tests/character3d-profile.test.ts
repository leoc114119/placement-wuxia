// T31-FE-A · profile 与动作映射用例（方案 §9.1 自动化第 1 条）
//
// 「profile：SHA/byteLength/41 骨/1 primitive/clip/bone 名、六向映射完整；错误输入非零失败」。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

declare const __dirname: string;
import {
  CHARACTER_3D_CROSS_FADE_SEC,
  CHARACTER_3D_FXAA,
  CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
  CHARACTER_3D_LIGHT,
  CHARACTER_3D_ORTHO_Z_HALF,
  CHARACTER_3D_PROFILE_BY_SPRITE_KEY,
  CHARACTER_3D_RENDER_SCALE,
  CHARACTER_3D_VERTEX_FLOATS,
  HERO_3D_ACTION_MAP,
  HERO_3D_ATTACHMENTS,
  CHARACTER_3D_BASIC_WINDOW_SEC,
  CHARACTER_3D_HERO_SCALE,
  CHARACTER_3D_JUMP_CHANNEL,
  CHARACTER_3D_JUMP_MOVE_SEC,
  CHARACTER_3D_JUMP_PHASE_ANCHORS,
  CHARACTER_3D_JUMP_Y_GAIN,
  CHARACTER_3D_JUMP_Y_GAIN_BAND_RATIO,
  HERO_3D_SKILL_WINDOW_SEC,
  jumpChannelProgressH,
  HERO_3D_CLIP_SOURCE_SEC,
  HERO_3D_EMBEDDED_CLIPS,
  HERO_3D_MODEL_ACCOUNT,
  HERO_3D_MODEL_REF,
  HERO_3D_PROFILE,
  HERO_3D_PROFILE_ERRORS,
  HERO_3D_PROFILE_ID,
  HERO_3D_STRIKE_START_RATIO,
  isRelativeAssetPath,
  validateCharacter3DProfile,
  yawDegForFacing,
} from '../config/character-3d';
import { BASIC_DURATION_MS } from '../config/battle';
import { CHOREO, PIECE, TILE_H } from '../config/battle-hex';
import type { Character3DAssetRef, Character3DProfile, BattleFacingHex } from '../types';
import { gainedRootY, remapPhaseByAnchors } from '../ui/character3d/animation';
import { heroClip, heroModel } from './character3d-fixtures';

const ROOT = path.resolve(__dirname, '..');

const FACINGS: BattleFacingHex[] = ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown'];
const CLIP_KEYS = ['idle', 'walk', 'atk', 'cast', 'jump'] as const;

/** 深拷贝一份 profile，供负例改写（结构完全一致的独立对象）。 */
function cloneProfile(): Character3DProfile {
  return JSON.parse(JSON.stringify(HERO_3D_PROFILE)) as Character3DProfile;
}

describe('现役 profile 自检', () => {
  it('零问题', () => {
    expect(HERO_3D_PROFILE_ERRORS).toEqual([]);
    expect(validateCharacter3DProfile(HERO_3D_PROFILE)).toEqual([]);
  });

  it('模型资产账与 README 登记逐项一致', () => {
    expect(HERO_3D_MODEL_REF.sha256).toBe('ff9202b48470c92ccdad0333108e77e193a4135f873ce68e7e3498e979f816f0');
    expect(HERO_3D_MODEL_REF.byteLength).toBe(4040728);
    expect(HERO_3D_MODEL_REF.mediaType).toBe('model/gltf-binary');
    expect(HERO_3D_MODEL_ACCOUNT.triangleCount).toBe(48419);
    expect(HERO_3D_MODEL_ACCOUNT.jointCount).toBe(41);
    expect(HERO_3D_MODEL_ACCOUNT.primitiveCount).toBe(1);
    expect(HERO_3D_MODEL_ACCOUNT.textureCount).toBe(3);
    expect(HERO_3D_MODEL_ACCOUNT.bufferBytes).toBe(3974376);
    expect(HERO_3D_PROFILE.jointCount).toBe(41);
    expect(HERO_3D_PROFILE.primitiveCount).toBe(1);
    expect(HERO_3D_PROFILE.mode).toBe('webgl2-skinned');
  });

  it('模型账与真实 GLB 解析结果一致（不是手抄的常数）', () => {
    const model = heroModel();
    expect(model.account.triangleCount).toBe(HERO_3D_MODEL_ACCOUNT.triangleCount);
    expect(model.account.vertexCount).toBe(HERO_3D_MODEL_ACCOUNT.vertexCount);
    expect(model.account.jointCount).toBe(HERO_3D_MODEL_ACCOUNT.jointCount);
    expect(model.account.primitiveCount).toBe(HERO_3D_MODEL_ACCOUNT.primitiveCount);
    expect(model.account.textureCount).toBe(HERO_3D_MODEL_ACCOUNT.textureCount);
    expect(model.account.bufferBytes).toBe(HERO_3D_MODEL_ACCOUNT.bufferBytes);
    expect(model.account.generator).toBe('Tripo');
  });

  it('modelHeight = 真实 bbox 的 y 跨度；参考屏高 = TILE_H × PIECE.heightPerTile × 主角比例', () => {
    const model = heroModel();
    const span = model.bounds.max[1] - model.bounds.min[1];
    expect(HERO_3D_PROFILE.modelHeight).toBeCloseTo(span, 12);
    // 公式锁：格高定尺 × PIECE 定尺 × CHARACTER_3D_HERO_SCALE（R2-3 · §4.4）
    expect(HERO_3D_PROFILE.screenHeightPxAtReference).toBeCloseTo(TILE_H * PIECE.heightPerTile * CHARACTER_3D_HERO_SCALE, 10);
    // 改前基线 123.2（观感台 curH=123 同档）→ 0.78 ⇒ 96.096；比例常量是**唯一**缩放承载点
    expect(TILE_H * PIECE.heightPerTile).toBeCloseTo(123.2, 6);
    expect(CHARACTER_3D_HERO_SCALE).toBe(0.78);
    expect(HERO_3D_PROFILE.screenHeightPxAtReference).toBeCloseTo(96.096, 6);
    // 取值沿革链：123.2 × 0.6 = 73.92（首版）→ ×1.3 = 96.096（Leo 09-15 裁定）
    expect(123.2 * 0.6 * 1.3).toBeCloseTo(HERO_3D_PROFILE.screenHeightPxAtReference, 6);
  });

  it('R2-3 派生自动跟随：比例只改常量一处（缩放/PIECE 定尺与 2D 侧零改动）', () => {
    const cfgSrc = readFileSync(path.join(ROOT, 'config/character-3d.ts'), 'utf8');
    // 参考高只由公式派生，禁裸写 96.096 / 123.2
    expect(cfgSrc).not.toMatch(/screenHeightPxAtReference:\s*\d/);
    expect(cfgSrc).toContain('TILE_H * PIECE.heightPerTile * CHARACTER_3D_HERO_SCALE');
    // PIECE 定尺与 2D 敌方口径所在配置本批不动（敌方仍按原比例渲染）
    expect(PIECE.heightPerTile).toBeGreaterThan(0);
    const scale = HERO_3D_PROFILE.screenHeightPxAtReference / HERO_3D_PROFILE.modelHeight;
    expect(scale).toBeCloseTo((123.2 * CHARACTER_3D_HERO_SCALE) / HERO_3D_PROFILE.modelHeight, 6);
  });

  it('五个动作槽位齐全：4 条 CDN json + 1 条 GLB 内嵌', () => {
    for (const key of CLIP_KEYS) expect(HERO_3D_PROFILE.clips[key], `槽位 ${key}`).toBeTruthy();
    // 【T31 FE · P0-B】移动槽位改播 GLB 内嵌 **run**（Leo 口径）；按名字取，禁按序号
    expect(HERO_3D_PROFILE.clips.walk).toEqual({ embedded: HERO_3D_EMBEDDED_CLIPS.run.name });
    for (const key of ['idle', 'atk', 'cast', 'jump'] as const) {
      const ref = HERO_3D_PROFILE.clips[key] as Character3DAssetRef;
      expect(ref.mediaType).toBe('application/json');
      expect(ref.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(ref.byteLength).toBeGreaterThan(0);
      expect(ref.urlPath).toContain(ref.sha256.slice(0, 12)); // 内容版本化 URL
    }
  });

  it('内嵌 clip 名字与实测 GLB 一致（walk/run 的 keyCount 与时间窗）', () => {
    const model = heroModel();
    const names = model.clips.map((c) => c.name).sort();
    expect(names).toEqual([HERO_3D_EMBEDDED_CLIPS.walk.name, HERO_3D_EMBEDDED_CLIPS.run.name].sort());
    const walk = model.clips.find((c) => c.name === HERO_3D_EMBEDDED_CLIPS.walk.name);
    expect(walk?.keyCount).toBe(HERO_3D_EMBEDDED_CLIPS.walk.keyCount);
    expect(walk?.startTimeSec).toBeCloseTo(HERO_3D_EMBEDDED_CLIPS.walk.firstKeyTimeSec, 7);
    expect(walk?.endTimeSec).toBeCloseTo(HERO_3D_EMBEDDED_CLIPS.walk.lastKeyTimeSec, 7);
    // 方案 §5 表里 walk 走内嵌预设；run 不进 S1 动作表（配置里不引用）
    expect(model.clips.some((c) => c.name === HERO_3D_EMBEDDED_CLIPS.run.name)).toBe(true);
  });

  it('重定向动作源时长与 json 声明值一致（idle 6.6667 / atk 1.5 / cast 4.5333 / jump 1.5）', () => {
    expect(HERO_3D_CLIP_SOURCE_SEC.idle).toBeCloseTo(6.666666666666667, 12);
    expect(HERO_3D_CLIP_SOURCE_SEC.atk).toBeCloseTo(1.5, 12);
    expect(HERO_3D_CLIP_SOURCE_SEC.cast).toBeCloseTo(4.533333333333333, 12);
    expect(HERO_3D_CLIP_SOURCE_SEC.jump).toBeCloseTo(1.5, 12);
  });

  it('六向映射完整（六向全有 yaw，派生值对上方案表）', () => {
    for (const facing of FACINGS) {
      expect(typeof HERO_3D_PROFILE.sourceViewYawDeg[facing]).toBe('number');
    }
    // T31 FE 朝向整改：yaw = normalizeSigned(源视角yaw − 180)（推导见 config 注释；语义锁在 math 用例）
    expect(FACINGS.map(yawDegForFacing)).toEqual([90, 135, -135, -90, -45, 45]);
  });

  it('挂点：bone 是模型真骨、localMatrix 16 个数、enabled=false（素材过门前不得启用）', () => {
    const model = heroModel();
    const entries = Object.entries(HERO_3D_ATTACHMENTS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, att] of entries) {
      expect(att.enabled, `挂点 ${name} 不得启用`).toBe(false);
      expect(att.localMatrix.length, `挂点 ${name} localMatrix`).toBe(16);
      expect(att.assetId, `挂点 ${name} 素材未生产不得填 assetId`).toBe('');
      expect(Object.keys(HERO_3D_PROFILE.clips)).not.toContain(att.assetId);
      expect(model.jointNames, `挂点 ${name} 的骨必须存在`).toContain(att.bone);
    }
  });

  it('spriteKey → profile 映射：S1 仅 hero 走 3D，敌型键不在表内', () => {
    expect(CHARACTER_3D_PROFILE_BY_SPRITE_KEY.hero).toBe(HERO_3D_PROFILE_ID);
    expect(CHARACTER_3D_PROFILE_BY_SPRITE_KEY['npc-shanzei-a']).toBeUndefined();
    expect(CHARACTER_3D_PROFILE_BY_SPRITE_KEY['npc-shanzei-b']).toBeUndefined();
  });
});

describe('动作映射（方案 §5 表逐行）', () => {
  it('idle：循环、6.67s 源、root 按源', () => {
    expect(HERO_3D_ACTION_MAP.idle).toMatchObject({
      clip: 'idle', progressSource: 'viewClock', loop: true, playWindowSec: null, startRatio: 0, rootMotion: 'track',
    });
  });

  it('walk：GLB 内嵌预设、循环、时钟由 view 演出钟推进', () => {
    expect(HERO_3D_ACTION_MAP.walk).toMatchObject({ clip: 'walk', progressSource: 'viewClock', loop: true });
  });

  it('basic（T31-R2-basic · Leo 09-15 裁定）：**3D 专用窗 1.5s**（整段 atk 源 1.0× 播完）、尾帧保持', () => {
    expect(HERO_3D_ACTION_MAP.basic.clip).toBe('atk');
    expect(HERO_3D_ACTION_MAP.basic.playWindowSec).toBe(CHARACTER_3D_BASIC_WINDOW_SEC);
    expect(HERO_3D_ACTION_MAP.basic.progressSource).toBe('stateElapsed');
    expect(HERO_3D_ACTION_MAP.basic.loop).toBe(false);
    expect(CHARACTER_3D_BASIC_WINDOW_SEC).toBeCloseTo(1.5, 12);
    // 1.0× 原速：窗长 == atk 源时长（数值相等是**意图**，不是从源推导）
    expect(HERO_3D_ACTION_MAP.basic.playWindowSec).toBeCloseTo(HERO_3D_CLIP_SOURCE_SEC.atk, 12);
    expect(HERO_3D_CLIP_SOURCE_SEC.atk).toBeCloseTo(1.5, 12);
    // ★ 2D/BE 真值不动：BASIC_DURATION_MS 仍 700、CHOREO.basicSec 仍 0.7（未迁移 2D 角色不自动扩大）
    expect(BASIC_DURATION_MS).toBe(700);
    expect(CHOREO.basicSec).toBeCloseTo(0.7, 12);
    expect(HERO_3D_ACTION_MAP.basic.playWindowSec).not.toBe(CHOREO.basicSec);
  });

  it('basic 窗取值形态：3D 专用常量承载（禁从源时长推导、禁压回 0.7s）', () => {
    const cfgSrc = readFileSync(path.join(ROOT, 'config/character-3d.ts'), 'utf8');
    expect(cfgSrc).toContain('export const CHARACTER_3D_BASIC_WINDOW_SEC = 1.5;');
    // 槽位必须引用常量本身（若有人写回 CHOREO.basicSec / 0.7，本断言报警）
    expect(cfgSrc).not.toMatch(/playWindowSec:\s*CHOREO\.basicSec/);
    expect(cfgSrc).not.toMatch(/CHARACTER_3D_BASIC_WINDOW_SEC\s*=\s*HERO_3D_CLIP_SOURCE_SEC/);
    // 2D 真值源文件（config/battle.ts）本卡未碰
    const battleSrc = readFileSync(path.join(ROOT, 'config/battle.ts'), 'utf8');
    expect(battleSrc).toContain('export const BASIC_DURATION_MS = 700;');
  });

  it('charge（R2-2 §4.1.3）：整段 cast 源映射进固定 3s 窗循环（840ms 一轮旧口径已废止）', () => {
    expect(HERO_3D_ACTION_MAP.charge.clip).toBe('cast');
    expect(HERO_3D_ACTION_MAP.charge.loop).toBe(true);
    expect(HERO_3D_SKILL_WINDOW_SEC).toBeCloseTo(3.0, 12);
    expect(HERO_3D_ACTION_MAP.charge.playWindowSec).toBe(HERO_3D_SKILL_WINDOW_SEC);
    // 源 4.5333s 压进 3s ⇒ 等效 1.511×（不是 840ms 循环的 5.4×）
    expect(HERO_3D_CLIP_SOURCE_SEC.cast / HERO_3D_SKILL_WINDOW_SEC).toBeCloseTo(1.5111, 3);
    // 废止常量不再存在于本配置（防有人改回 840ms 循环口径）
    const cfgSrc = readFileSync(path.join(ROOT, 'config/character-3d.ts'), 'utf8');
    expect(cfgSrc).not.toContain('HERO_3D_CAST_CYCLE_SEC =');
    expect(cfgSrc).not.toContain('HERO_3D_STRIKE_WINDOW_SEC =');
  });

  it('strike（R2-2 §4.1.3）：末姿保持（startRatio=1 ⇒ 相位恒 1），不再 2/3 起播重扫', () => {
    expect(HERO_3D_ACTION_MAP.strike.clip).toBe('cast');
    expect(HERO_3D_STRIKE_START_RATIO).toBe(1);
    expect(HERO_3D_ACTION_MAP.strike.startRatio).toBe(1);
    expect(HERO_3D_ACTION_MAP.strike.loop).toBe(false);
    expect(HERO_3D_ACTION_MAP.strike.playWindowSec).toBe(HERO_3D_SKILL_WINDOW_SEC);
    // span = 1 − startRatio = 0 ⇒ 任何 stateElapsed 都落在同一相位（相位恒 1）
    expect(1 - HERO_3D_ACTION_MAP.strike.startRatio).toBe(0);
  });

  it('hit：不切专用动作（clip=null）且不重起混合', () => {
    expect(HERO_3D_ACTION_MAP.hit.clip).toBeNull();
    expect(HERO_3D_ACTION_MAP.hit.crossFadeOnEnter).toBe(false);
  });

  it('dead：走 idle 首帧（hold），不要求不存在的 3D die clip，且不混回', () => {
    expect(HERO_3D_ACTION_MAP.dead.clip).toBe('idle');
    expect(HERO_3D_ACTION_MAP.dead.progressSource).toBe('hold');
    expect(HERO_3D_ACTION_MAP.dead.startRatio).toBe(0);
    expect(HERO_3D_ACTION_MAP.dead.crossFadeOnEnter).toBe(false);
  });

  it('jump（R2-1）：1.0s 演出窗 + 素材相位锚表 + 正段增益；**只剥 root x/z 保留 y**、端点含末帧', () => {
    expect(HERO_3D_ACTION_MAP.jump.clip).toBe('jump');
    expect(HERO_3D_ACTION_MAP.jump.progressSource).toBe('moveProgress');
    // 【方案 v1.1 §4.1】只剥水平（'zero-xz'）：竖直唯一来源＝素材 root y；旧 'zero'（三轴全清）已废止
    expect(HERO_3D_ACTION_MAP.jump.rootMotion).toBe('zero-xz');
    expect(HERO_3D_ACTION_MAP.jump.endpointInclusive).toBe(true);
    // 【R2-1 §4.1.2(1)】演出窗 1.0 演出秒；与源时长**解耦**（禁再由源时长派生）
    expect(CHARACTER_3D_JUMP_MOVE_SEC).toBeCloseTo(1.0, 12);
    expect(HERO_3D_ACTION_MAP.jump.playWindowSec).toBe(CHARACTER_3D_JUMP_MOVE_SEC);
    expect(CHARACTER_3D_JUMP_MOVE_SEC).not.toBe(HERO_3D_CLIP_SOURCE_SEC.jump);
    // 【R2-1 §4.1.2(2)】相位锚表：深蹲 0.25 / 腾空 0.50 / 落地 0.25（锚值落 config，渲染层无数字）
    expect(HERO_3D_ACTION_MAP.jump.phaseAnchors).toEqual(CHARACTER_3D_JUMP_PHASE_ANCHORS);
    expect(CHARACTER_3D_JUMP_PHASE_ANCHORS.map((a) => a.p)).toEqual([0, 0.25, 0.75, 1]);
    expect(CHARACTER_3D_JUMP_PHASE_ANCHORS.map((a) => a.phase)).toEqual([0, 0.44, 0.73, 1]);
    // 【R2-1 §4.1.2(3)】水平通道：位移窗 = 腾空段（0.25→0.75），两端速度为零
    expect(CHARACTER_3D_JUMP_CHANNEL).toEqual({ moveStartP: 0.25, moveEndP: 0.75 });
    expect(jumpChannelProgressH(0, CHARACTER_3D_JUMP_CHANNEL)).toBe(0);
    expect(jumpChannelProgressH(0.24, CHARACTER_3D_JUMP_CHANNEL)).toBe(0);   // 深蹲段恒 0（禁滑步）
    expect(jumpChannelProgressH(0.5, CHARACTER_3D_JUMP_CHANNEL)).toBeCloseTo(0.5, 12);
    expect(jumpChannelProgressH(0.76, CHARACTER_3D_JUMP_CHANNEL)).toBe(1);   // 落地段恒 1（原地缓冲）
    expect(jumpChannelProgressH(1, CHARACTER_3D_JUMP_CHANNEL)).toBe(1);
    // 两端速度为零（smoothstep）：0.25 与 0.75 附近的增量远小于中段
    const eps = 1e-3;
    const slopeAt = (p: number): number => (jumpChannelProgressH(p + eps, CHARACTER_3D_JUMP_CHANNEL) - jumpChannelProgressH(p, CHARACTER_3D_JUMP_CHANNEL)) / eps;
    const midSlope = slopeAt(0.5);
    expect(midSlope).toBeGreaterThan(1); // 中段最快（smoothstep 峰值斜率 = 1.5）
    expect(slopeAt(0.25)).toBeLessThan(0.1 * midSlope); // 起跳端速度≈0
    expect(slopeAt(0.749)).toBeLessThan(0.1 * midSlope); // 落地端速度≈0
    // 【R2-1 §4.1.2(4) · v1.3.1】正段增益 ×k + 过零带 8%（y≤0 段不加系数）
    expect(HERO_3D_ACTION_MAP.jump.rootYGain).toEqual({
      gain: CHARACTER_3D_JUMP_Y_GAIN,
      bandRatio: CHARACTER_3D_JUMP_Y_GAIN_BAND_RATIO,
    });
    // 【方案 v1.3.1 · Leo 09-15 现场裁定】k = 3.2（目标「腾空 ≈ 身高 73%」，判据带 [0.65,0.80]）
    expect(CHARACTER_3D_JUMP_Y_GAIN).toBe(3.2);
    expect(CHARACTER_3D_JUMP_Y_GAIN_BAND_RATIO).toBeCloseTo(0.08, 12);
    // 增益只对正段生效：负 y 原样、0 原样、带外 ×k（用真实素材峰值定带）
    const peak = heroClip('jump').rootTrackPeakY;
    const gain = HERO_3D_ACTION_MAP.jump.rootYGain!;
    expect(gainedRootY(-0.17, gain, peak)).toBe(-0.17);
    expect(gainedRootY(0, gain, peak)).toBe(0);
    expect(gainedRootY(peak, gain, peak)).toBeCloseTo(peak * CHARACTER_3D_JUMP_Y_GAIN, 12);
    const band = peak * CHARACTER_3D_JUMP_Y_GAIN_BAND_RATIO;
    // 带内渐入：k(y) 由 1 线性升到 k ⇒ 带中点增益 = 1 + (k−1)/2
    expect(gainedRootY(band / 2, gain, peak)).toBeCloseTo(
      (band / 2) * (1 + (CHARACTER_3D_JUMP_Y_GAIN - 1) / 2),
      12,
    ); // 带内渐入中值
    expect(gainedRootY(-0.001, gain, peak)).toBeLessThan(0); // 负侧连续（不跳变）
    // 其它 clip 的 root 策略不被本次改动波及（无锚表、无增益、无端点策略）
    for (const key of ['idle', 'walk', 'basic', 'charge', 'strike'] as const) {
      expect(HERO_3D_ACTION_MAP[key].rootMotion, key).toBe('track');
      expect(HERO_3D_ACTION_MAP[key].endpointInclusive, key).toBeUndefined();
      expect(HERO_3D_ACTION_MAP[key].phaseAnchors, key).toBeUndefined();
      expect(HERO_3D_ACTION_MAP[key].rootYGain, key).toBeUndefined();
    }
  });

  it('时长常量：交叉淡化 100ms、jump→idle 180ms', () => {
    expect(CHARACTER_3D_CROSS_FADE_SEC).toBeCloseTo(0.1, 12);
    expect(CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC).toBeCloseTo(0.18, 12);
  });
});

describe('画质常量（方案 §7）', () => {
  it('光照 = 观感台的 2.15 / 1.15 / (-0.4,0.85,1) / 1π 归一', () => {
    expect(CHARACTER_3D_LIGHT.ambientIntensity).toBe(2.15);
    expect(CHARACTER_3D_LIGHT.directionalIntensity).toBe(1.15);
    expect([...CHARACTER_3D_LIGHT.direction]).toEqual([-0.4, 0.85, 1]);
    expect(CHARACTER_3D_LIGHT.diffuseNormalization).toBeCloseTo(1 / Math.PI, 15);
  });

  it('不采用超采样（renderScale=1，保持 S0 已证口径）；正交深度半程=4', () => {
    expect(CHARACTER_3D_RENDER_SCALE).toBe(1);
    expect(CHARACTER_3D_ORTHO_Z_HALF).toBe(4);
  });

  it('顶点布局 16 float/顶点（与 probe 已验布局一致）', () => {
    expect(CHARACTER_3D_VERTEX_FLOATS).toBe(16);
  });

  it('FXAA 参数落在合理区间（阈值/搜索步/亚像素质量/alpha 门限）', () => {
    expect(CHARACTER_3D_FXAA.edgeThreshold).toBeGreaterThan(0);
    expect(CHARACTER_3D_FXAA.edgeThreshold).toBeLessThan(1);
    expect(CHARACTER_3D_FXAA.edgeThresholdMin).toBeGreaterThan(0);
    expect(CHARACTER_3D_FXAA.searchSteps).toBeGreaterThanOrEqual(1);
    expect(CHARACTER_3D_FXAA.searchSteps).toBeLessThanOrEqual(16);
    expect(CHARACTER_3D_FXAA.subpixelQuality).toBeGreaterThanOrEqual(0);
    expect(CHARACTER_3D_FXAA.subpixelQuality).toBeLessThanOrEqual(1);
    expect(CHARACTER_3D_FXAA.alphaThreshold).toBeGreaterThan(0);
  });

  it('渲染文件禁散落数字：时长/画质只在本配置导出（抽查关键常量来自本文件）', () => {
    // 若有人把时长写回渲染文件，这里引用的常量会失去唯一出处；本用例锁「配置确有这些字段」
    expect(Object.keys(HERO_3D_ACTION_MAP).sort()).toEqual(
      ['basic', 'charge', 'dead', 'hit', 'idle', 'jump', 'strike', 'walk'].sort(),
    );
  });
});

describe('清单校验（错误输入非零失败）', () => {
  it('isRelativeAssetPath：放行相对路径，拒绝完整 URL / 协议 / 前导斜杠 / 上跳 / 空段', () => {
    expect(isRelativeAssetPath('characters/hero/abc/hero.glb')).toBe(true);
    for (const bad of [
      'https://cdn.example.com/a.glb',
      'http://x/a.glb',
      '//cdn/a.glb',
      '/characters/a.glb',
      'characters/../secret',
      'characters//a.glb',
      ' characters/a.glb',
      'characters/a.glb ',
      '',
    ]) {
      expect(isRelativeAssetPath(bad), `应拒绝: ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it('sha256 非 64 位小写十六进制即报错', () => {
    const p = cloneProfile();
    p.model = { ...p.model, sha256: 'FF9202B4' + p.model.sha256.slice(8) };
    expect(validateCharacter3DProfile(p).some((e) => e.includes('sha256'))).toBe(true);
  });

  it('byteLength 非正整数即报错', () => {
    for (const bad of [0, -1, 1.5]) {
      const p = cloneProfile();
      p.model = { ...p.model, byteLength: bad };
      expect(validateCharacter3DProfile(p).some((e) => e.includes('byteLength'))).toBe(true);
    }
  });

  it('urlPath 是完整 URL 即报错', () => {
    const p = cloneProfile();
    p.model = { ...p.model, urlPath: 'https://cdn.example.com/hero.glb' };
    expect(validateCharacter3DProfile(p).some((e) => e.includes('urlPath'))).toBe(true);
  });

  it('41 骨 / 1 primitive 不符即报错', () => {
    const a = cloneProfile();
    a.jointCount = 40 as unknown as 41;
    expect(validateCharacter3DProfile(a).some((e) => e.includes('jointCount'))).toBe(true);
    const b = cloneProfile();
    b.primitiveCount = 2 as unknown as 1;
    expect(validateCharacter3DProfile(b).some((e) => e.includes('primitiveCount'))).toBe(true);
  });

  it('缺动作槽位 / 缺六向即报错', () => {
    const a = cloneProfile();
    delete (a.clips as Record<string, unknown>).cast;
    expect(validateCharacter3DProfile(a).some((e) => e.includes('cast'))).toBe(true);
    const b = cloneProfile();
    delete (b.sourceViewYawDeg as Record<string, unknown>).leftup;
    expect(validateCharacter3DProfile(b).some((e) => e.includes('leftup'))).toBe(true);
  });

  it('挂点被启用 / localMatrix 长度错即报错（素材双门）', () => {
    const a = cloneProfile();
    const name = Object.keys(a.attachments)[0];
    (a.attachments as unknown as Record<string, { enabled: boolean }>)[name].enabled = true;
    expect(validateCharacter3DProfile(a).some((e) => e.includes(name))).toBe(true);
    const b = cloneProfile();
    (b.attachments as unknown as Record<string, { localMatrix: number[] }>)[name].localMatrix = [1, 0, 0];
    expect(validateCharacter3DProfile(b).some((e) => e.includes('localMatrix'))).toBe(true);
  });

  it('mode 非法即报错', () => {
    const a = cloneProfile();
    a.mode = 'sprite' as unknown as 'webgl2-skinned';
    expect(validateCharacter3DProfile(a).some((e) => e.includes('mode'))).toBe(true);
  });
});
