// T31-FE-A · 测试夹具（真实资产 + 装配助手；仅测试用）
//
// 用**仓库内真实资产**跑用例（不是合成假数据）：模型账、41 骨、动作时长与相位全部落回真值，
// 这样「数值对拍」之外，「资产账与 profile 声明一致」也被覆盖（§9.1 profile 条）。
// 模型解析较慢（4MB GLB），故按进程缓存。

import { readFileSync } from 'node:fs';
import type { Character3DClipKey } from '../types';
import { HERO_3D_PROFILE } from '../config/character-3d';
import { loadCharacter3DModel, loadCharacter3DStaticMesh, type Character3DModel, type Character3DStaticMesh } from '../ui/character3d/glb';
import {
  parseCharacter3DClipJson,
  resolveClipSource,
  type Character3DClipRegistry,
  type Character3DRetargetedClip,
} from '../ui/character3d/animation';

/** env.d.ts 只声明了 `readFileSync(path, encoding)`；二进制读取的真实签名在此显式断言。 */
export const readBytesSync = readFileSync as unknown as (path: string) => Uint8Array;

export const HERO_MODEL_PATH = 'assets/characters/hero/model/hero_48k_20260914.glb';

export const HERO_CLIP_PATHS: Record<'idle' | 'atk' | 'cast' | 'jump', string> = {
  idle: 'assets/characters/hero/model/anim/idle_v4.json',
  atk: 'assets/characters/hero/model/anim/atk_v4.json',
  cast: 'assets/characters/hero/model/anim/cast_v4.json',
  jump: 'assets/characters/hero/model/anim/jump_v6_1p5s.json',
};

/** 【T32】剑资产路径（与 config 的 HERO_3D_WEAPON_REF.urlPath 同源真值）。 */
export const WEAPON_MODEL_PATH = 'assets/characters/hero/model/weapon/sword_3d_medieval.glb';

let cachedWeapon: Character3DStaticMesh | null = null;

/** 现役剑（静态网格）：真实资产解析（机械门已过，见 config 的 HERO_3D_WEAPON_ACCOUNT）。 */
export function heroWeapon(): Character3DStaticMesh {
  if (!cachedWeapon) cachedWeapon = loadCharacter3DStaticMesh(readBytesSync(WEAPON_MODEL_PATH));
  return cachedWeapon;
}

let cachedModel: Character3DModel | null = null;

export function heroModel(): Character3DModel {
  if (!cachedModel) cachedModel = loadCharacter3DModel(readBytesSync(HERO_MODEL_PATH));
  return cachedModel;
}

export function heroClipRaw(key: 'idle' | 'atk' | 'cast' | 'jump'): unknown {
  return JSON.parse(readFileSync(HERO_CLIP_PATHS[key], 'utf8'));
}

const clipCache = new Map<string, Character3DRetargetedClip>();

export function heroClip(key: 'idle' | 'atk' | 'cast' | 'jump'): Character3DRetargetedClip {
  const hit = clipCache.get(key);
  if (hit) return hit;
  const clip = parseCharacter3DClipJson(heroClipRaw(key), key);
  clipCache.set(key, clip);
  return clip;
}

/** 完整动作注册表（4 条重定向 json + 1 条 GLB 内嵌 walk）。 */
export function heroClipRegistry(model: Character3DModel = heroModel()): Character3DClipRegistry {
  const registry: Character3DClipRegistry = {};
  const keys: Character3DClipKey[] = ['idle', 'atk', 'cast', 'jump', 'walk'];
  for (const key of keys) {
    const entry = HERO_3D_PROFILE.clips[key];
    registry[key] = resolveClipSource(key, entry, model, 'embedded' in entry ? undefined : heroClipRaw(key as 'idle'));
  }
  return registry;
}
