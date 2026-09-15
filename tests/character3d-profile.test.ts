// T31-FE-A · profile 与动作映射用例（方案 §9.1 自动化第 1 条）
//
// 「profile：SHA/byteLength/41 骨/1 primitive/clip/bone 名、六向映射完整；错误输入非零失败」。

import { describe, expect, it } from 'vitest';
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
  HERO_3D_CAST_CYCLE_SEC,
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
import { CAST_FRAME_PERIOD_MS, CHOREO, PIECE, TILE_H } from '../config/battle-hex';
import type { Character3DAssetRef, Character3DProfile, BattleFacingHex } from '../types';
import { heroModel } from './character3d-fixtures';

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

  it('modelHeight = 真实 bbox 的 y 跨度；参考屏高 = TILE_H × PIECE.heightPerTile', () => {
    const model = heroModel();
    const span = model.bounds.max[1] - model.bounds.min[1];
    expect(HERO_3D_PROFILE.modelHeight).toBeCloseTo(span, 12);
    expect(HERO_3D_PROFILE.screenHeightPxAtReference).toBeCloseTo(TILE_H * PIECE.heightPerTile, 10);
    // 与观感台默认人高 123px 同档（assets/_trial_20260913/look_webgl3d stage 的 curH）
    expect(HERO_3D_PROFILE.screenHeightPxAtReference).toBeCloseTo(123.2, 6);
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

  it('basic：单播、把 1.50s 源归一映射到既有 CHOREO.basicSec、尾帧保持（loop=false）', () => {
    expect(HERO_3D_ACTION_MAP.basic.clip).toBe('atk');
    expect(HERO_3D_ACTION_MAP.basic.playWindowSec).toBe(CHOREO.basicSec);
    expect(HERO_3D_ACTION_MAP.basic.progressSource).toBe('stateElapsed');
    expect(HERO_3D_ACTION_MAP.basic.loop).toBe(false);
    expect(HERO_3D_ACTION_MAP.basic.playWindowSec).toBeCloseTo(0.7, 12); // BASIC_DURATION_MS=700
  });

  it('charge：cast 循环，一轮 = 3 × CAST_FRAME_PERIOD_MS = 840ms（不参与结算时点）', () => {
    expect(HERO_3D_ACTION_MAP.charge.clip).toBe('cast');
    expect(HERO_3D_ACTION_MAP.charge.loop).toBe(true);
    expect(HERO_3D_CAST_CYCLE_SEC).toBeCloseTo((3 * CAST_FRAME_PERIOD_MS) / 1000, 12);
    expect(HERO_3D_CAST_CYCLE_SEC).toBeCloseTo(0.84, 12);
    expect(HERO_3D_ACTION_MAP.charge.playWindowSec).toBe(HERO_3D_CAST_CYCLE_SEC);
  });

  it('strike：同一 cast 源，从 2/3 归一位置播到末尾并保持（cast2→3 兼容）', () => {
    expect(HERO_3D_ACTION_MAP.strike.clip).toBe('cast');
    expect(HERO_3D_ACTION_MAP.strike.startRatio).toBeCloseTo(2 / 3, 12);
    expect(HERO_3D_STRIKE_START_RATIO).toBeCloseTo(2 / 3, 12);
    expect(HERO_3D_ACTION_MAP.strike.loop).toBe(false);
    // 剩余窗 = 一轮的 1/3 = 280ms = 一个 CAST_FRAME_PERIOD_MS
    expect((1 - HERO_3D_ACTION_MAP.strike.startRatio) * HERO_3D_CAST_CYCLE_SEC).toBeCloseTo(CAST_FRAME_PERIOD_MS / 1000, 12);
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

  it('jump：moveProgress 0→1 映射完整 1.5s 源，**root 三轴位移归零**（防双跳）', () => {
    expect(HERO_3D_ACTION_MAP.jump.clip).toBe('jump');
    expect(HERO_3D_ACTION_MAP.jump.progressSource).toBe('moveProgress');
    expect(HERO_3D_ACTION_MAP.jump.rootMotion).toBe('zero');
    expect(HERO_3D_ACTION_MAP.jump.playWindowSec).toBeCloseTo(1.5, 12);
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
