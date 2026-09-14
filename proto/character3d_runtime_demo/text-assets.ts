// T31-FE-C · proto/character3d_runtime_demo/text-assets.ts —— 包内文本资产（动作 json）的**结构不变量校验**
//
// 为什么需要（P0-4，现象先摆清）：真机 HONOR PTP-AN20 / SDK 3.17.3 出现
//   `idle:byteLength-mismatch:685411!=726299` —— 仓库 / Claw 导入目录 / proto/battle_demo/cdn 里的
//   idle_v4.json 都是 726299 字节；纯压缩 693640；文件纯 ASCII（非 ASCII 0）⇒ 设备读回的**内容本身**
//   与仓库不同（平台改写或读取/落盘截断），机制未定。
// 于是：**包内文本资产**改用结构不变量当门（字节不可比时也能继续跑），并把观测值如实记进结果；
//   二进制（GLB）与 CDN 下载路径**保持严格 byteLength+SHA 不变**（模型字节可比，是安全边界）。
//
// 真源复用（不另立一套结构口径）：
//   · `ui/character3d/animation.parseCharacter3DClipJson` —— 生产解析器，fail-fast（fps/nFrames/duration/
//     rootMode/boneTracks 形状/rootTrack 形状逐条查）；
//   · `config/character-3d.HERO_3D_CLIP_SOURCE_SEC` —— 各动作**源时长**清单真值（交叉核对，防截断/改写）。
//
// 失败关闭：任一不变量不成立即返回错误 ⇒ loader 拒收该文件且**不覆盖 LKG**（与 §6.2 一致）。

import { parseCharacter3DClipJson } from '../../ui/character3d/animation';
import { HERO_3D_CLIP_REFS, HERO_3D_CLIP_SOURCE_SEC } from '../../config/character-3d';
import type { Character3DAssetRef, Character3DClipKey } from '../../types';

/** 结构校验的实测账（进结果，供人一眼看出"读回来的这份东西是什么规格"）。 */
export interface ClipStructureAccount {
  clipKey: Character3DClipKey | null;
  fps: number;
  nFrames: number;
  declaredDurationSec: number;
  /** 清单期望时长（config 真值）；配套的 clip 不在清单内时为 null */
  expectedDurationSec: number | null;
  /** 骨轨道条数（coveredJoints 口径：json 里实际出现的骨名个数） */
  boneTrackCount: number;
  /** rootTrack 帧数（应与 nFrames 相等） */
  rootTrackFrames: number;
  /** 全部轨道值是否有限数（NaN/Infinity = 损坏） */
  allValuesFinite: boolean;
  rootMode: string;
  /** 时间轴单调：帧索引 i → t=i/fps 严格递增 ⇒ 采样器时长 > 0 即成立，这里记实测值 */
  samplerDurationSec: number;
}

export interface ClipStructureResult {
  /** 错误清单（**纯诊断**：身份判定看字节，这里只记录） */
  errors: string[];
  account: ClipStructureAccount | null;
  /** 人读一行（进 structuralDiagnostic.summary，便于把「设备读回的是哪种规格」抄给平台方） */
  summary: string;
  /** ★ 动作存活（arch seq=424 反例：结构全对但姿态恒定/全零 ⇒ 必须判失败） */
  motionStatic: boolean;
  /** ★ 硬失败原因（非空即判失败）：不是合法 JSON / 不符合生产解析器契约。
   *  与 `errors`（纯诊断）**分开**：诊断为"记"，fatal 为"拦"。 */
  fatalReason: string | null;
  /** 动作存活的实测账（最大帧间偏差等） */
  motionDetail: string;
}

/** assetId → clip 槽位（用清单反查，避免把 key 写死在调用处）。 */
function clipKeyOfAsset(ref: Character3DAssetRef): Character3DClipKey | null {
  for (const key of ['idle', 'walk', 'atk', 'cast', 'jump'] as const) {
    const entry = HERO_3D_CLIP_REFS[key];
    if (entry && !('embedded' in entry) && entry.id === ref.id) return key;
  }
  return null;
}

/** 解码文本：微信与浏览器都可能有/没有 TextDecoder —— 用一处兜底（本文件是宿主侧适配，允许）。 */
export function decodeTextUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i += 4096) {
    out += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + 4096)));
  }
  return out;
}

/**
 * 动作 json 的结构不变量校验（loader 的 textStructureValidator）。
 * 校验项（逐条对应 P0-4 要求）：JSON 可解析 → 生产解析器全过（fps/nFrames/duration/rootMode/形状）→
 * 时长与清单真值一致（防截断/改写）→ nFrames 与「清单时长 × fps」自洽 → 轨道值全为有限数 →
 * rootTrack 帧数自洽 → 骨轨道条数非空。
 */
export function validateClipJsonStructure(bytes: Uint8Array, ref: Character3DAssetRef): ClipStructureResult {
  const errors: string[] = [];
  const text = decodeTextUtf8(bytes);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    // 截断/损坏最典型的形态：JSON 解析不过
    return {
      errors: ['JSON 解析失败（疑似截断/损坏）：' + (error instanceof Error ? error.message : String(error)) +
        ' · tail=' + text.slice(-32).replace(/\s+/g, ' ')],
      account: null,
      summary: 'JSON 不可解析',
      // 解析不了 ⇒ 无法判动作存活；但字节身份门（SHA/长度）已经会拦下这类文件
      motionStatic: false,
      motionDetail: 'JSON 不可解析，未评估',
      fatalReason: 'JSON 解析失败',
    };
  }
  const key = clipKeyOfAsset(ref);
  let clip;
  try {
    clip = parseCharacter3DClipJson(raw, ref.id);
  } catch (error) {
    return {
      errors: ['生产解析器拒绝：' + (error instanceof Error ? error.message : String(error))],
      account: null,
      summary: '结构不符（生产解析器 fail-fast）',
      motionStatic: false,
      motionDetail: '结构不符，未评估',
      fatalReason: '不符合生产解析器契约',
    };
  }
  // 只有走 CDN 的动作槽位才有源时长清单真值（walk 是 GLB 内嵌预设，不在本表）
  const expected = key !== null && key in HERO_3D_CLIP_SOURCE_SEC
    ? HERO_3D_CLIP_SOURCE_SEC[key as keyof typeof HERO_3D_CLIP_SOURCE_SEC]
    : null;
  if (expected !== null && Math.abs(clip.declaredDurationSec - expected) > 0.05) {
    errors.push(
      'duration ' + clip.declaredDurationSec + ' 与清单真值 ' + expected + ' 不符（>0.05s）',
    );
  }
  const derivedFrames = Math.round(clip.samplerDurationSec * clip.fps);
  if (Math.abs(derivedFrames - clip.nFrames) > 0) {
    errors.push('nFrames 与 samplerDuration×fps 不自洽：' + clip.nFrames + ' vs ' + derivedFrames);
  }
  let allFinite = true;
  for (const name of Object.keys(clip.boneTracks)) {
    const track = clip.boneTracks[name];
    for (let f = 0; f < track.length && allFinite; f++) {
      for (let c = 0; c < track[f].length; c++) {
        if (!Number.isFinite(track[f][c])) { allFinite = false; break; }
      }
    }
    if (!allFinite) { errors.push('轨道 ' + name + ' 含非有限数（NaN/Infinity）'); break; }
  }
  if (allFinite) {
    for (let f = 0; f < clip.rootTrack.length; f++) {
      for (let c = 0; c < clip.rootTrack[f].length; c++) {
        if (!Number.isFinite(clip.rootTrack[f][c])) { allFinite = false; errors.push('rootTrack 含非有限数'); break; }
      }
      if (!allFinite) break;
    }
  }
  const boneTrackCount = Object.keys(clip.boneTracks).length;
  if (boneTrackCount < 1) errors.push('骨轨道为空（coveredJoints=0）');
  if (clip.samplerDurationSec <= 0) errors.push('采样器时长非正数（时间轴不单调）');

  const account: ClipStructureAccount = {
    clipKey: key,
    fps: clip.fps,
    nFrames: clip.nFrames,
    declaredDurationSec: clip.declaredDurationSec,
    expectedDurationSec: expected,
    boneTrackCount,
    rootTrackFrames: clip.rootTrack.length,
    allValuesFinite: allFinite,
    rootMode: clip.rootMode,
    samplerDurationSec: clip.samplerDurationSec,
  };
  // ★ 动作存活：全帧姿态是否恒定/全零（四元数恒为单位 + root 恒为零 ⇒ 动作是死的）
  const motion = measureMotion(clip);
  if (motion.motionStatic) errors.push('动作静态化：' + motion.motionDetail);

  const summary =
    '结构化：fps=' + clip.fps + ' nFrames=' + clip.nFrames + ' duration=' + clip.declaredDurationSec +
    '（清单 ' + String(expected) + '）骨轨道=' + boneTrackCount + ' rootTrack=' + clip.rootTrack.length +
    ' rootMode=' + clip.rootMode + ' 值有限=' + allFinite + ' · ' + motion.motionDetail;
  return {
    errors,
    account,
    summary,
    motionStatic: motion.motionStatic,
    motionDetail: motion.motionDetail,
    fatalReason: motion.motionStatic ? '动作静态化' : null,
  };
}

/** 动作存活实测：骨四元数与单位四元数的最大偏差 + root 位移的最大绝对值。 */
function measureMotion(clip: {
  boneTracks: Record<string, number[][]>;
  rootTrack: number[][];
}): { motionStatic: boolean; motionDetail: string } {
  const EPS = 1e-6;
  let maxQuatDev = 0;
  for (const name of Object.keys(clip.boneTracks)) {
    for (const row of clip.boneTracks[name]) {
      // 与单位四元数 (0,0,0,1) 的偏差（含 ±w 两种朝向）
      const dev = Math.min(
        Math.hypot(row[0], row[1], row[2], row[3] - 1),
        Math.hypot(row[0], row[1], row[2], row[3] + 1),
      );
      if (dev > maxQuatDev) maxQuatDev = dev;
    }
  }
  let maxRootAbs = 0;
  for (const row of clip.rootTrack) {
    for (const v of row) if (Math.abs(v) > maxRootAbs) maxRootAbs = Math.abs(v);
  }
  const motionStatic = maxQuatDev <= EPS && maxRootAbs <= EPS;
  return {
    motionStatic,
    motionDetail: 'maxQuatDev=' + maxQuatDev.toExponential(3) + ' maxRootAbs=' + maxRootAbs.toExponential(3) +
      (motionStatic ? '（动作静态化）' : ''),
  };
}
