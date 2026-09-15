// T32 · 武器运行时装配（下载 → 解析/结构门 → 分段 → 贴图解码）——**逐阶段失败边界**
//
// 方案 §6 裁定：武器失败 = **无剑进战斗 + 诊断**（角色失败才阻塞）；本模块把该裁定落成四个明确的失败边界，
// 每阶段失败都只返回 `runtime: null` + 专用诊断串，**不向调用方抛出**（角色装配与战斗不受影响）：
//   · `weapon-load-failed`        下载/完整性门失败（走既有 loader：CDN 版本化 URL + SHA/byteLength 门 + LKG）
//   · `weapon-parse-failed`       解析失败或**武器结构门**不过（1 mesh/0 骨/0 动画/单材质/单贴图/双面）
//   · `weapon-texture-failed`     底色贴图解码失败
//   · `weapon-gpu-failed`         GPU 装配失败（在 renderer 侧记录，见 ui/character3d/renderer）
//   · `weapon-calibration-failed` 挂点标定/染色解析失败（在 pass 侧记录，见 ui/character3d/pass）
// ⚠ 真正的 WebGL context 丢失**不走本路径**（由 renderer 的整体恢复处理）。

import type { Character3DAssetRef } from '../../types';
import type { CharacterAssetLoadResult } from '../../net/character-asset-loader';
import {
  loadCharacter3DStaticMesh,
  validateWeaponAccount,
  type Character3DStaticMesh,
  type ExpectedWeaponAccount,
} from '../../ui/character3d/glb';
import {
  buildWeaponVertexInterleave,
  splitWeaponSegments,
  type WeaponSegments,
} from '../../ui/character3d/weapon';
import type { PlatformDecodedImage } from '../../ui/character3d/platform';

/** 武器运行时：解析后的静态网格 + 分段 + 交错顶点 + **已解码贴图**（任一阶段失败即整体为 null）。 */
export interface WeaponRuntimeBundle {
  assetId: string;
  mesh: Character3DStaticMesh;
  segments: WeaponSegments;
  vertexData: Float32Array;
  baseColor: PlatformDecodedImage;
  /** 装配诊断（成功时 = `weapon-ready:{tri}tri/{v}v`；便于日志/证据面留痕） */
  diag: string;
}

export interface WeaponAssemblyDeps {
  /** 既有 loader（`net/character-asset-loader` 的 `load`）——武器 ref 走同一条 CDN/校验/LKG 通道 */
  load(ref: Character3DAssetRef): Promise<CharacterAssetLoadResult>;
  /** 平台贴图解码（与角色贴图同一入口） */
  decodeImage(bytes: Uint8Array, mimeType: string, name: string): Promise<PlatformDecodedImage>;
}

export interface WeaponAssemblyOptions {
  ref: Character3DAssetRef;
  account: ExpectedWeaponAccount;
  segmentBoundaries: readonly number[];
}

/**
 * 逐阶段装配武器运行时（**任何失败都不抛**，只返回 `{ runtime: null, diag }`）。
 * 调用方在 `runtime === null` 时按 diag 记录诊断并继续（角色照常出剑前的一切照旧）。
 */
export async function assembleWeaponRuntime(
  deps: WeaponAssemblyDeps,
  options: WeaponAssemblyOptions,
): Promise<{ runtime: WeaponRuntimeBundle | null; diag: string }> {
  // ① 下载（含完整性门与 LKG）
  let bytes: Uint8Array | null = null;
  try {
    const res = await deps.load(options.ref);
    if (res.status === 'failed' || !res.bytes) {
      const detail = res.diagnostics.filter((d) => d.includes('failed') || d.includes('mismatch')).slice(0, 2).join('|');
      return { runtime: null, diag: 'weapon-load-failed' + (detail ? ':' + detail : '') };
    }
    bytes = res.bytes;
  } catch (error) {
    return { runtime: null, diag: 'weapon-load-failed:' + msgOf(error) };
  }

  // ② 解析 + 武器结构门 + 分段 + 顶点交错
  let mesh: Character3DStaticMesh;
  let segments: WeaponSegments;
  let vertexData: Float32Array;
  try {
    mesh = loadCharacter3DStaticMesh(bytes);
    const errs = validateWeaponAccount(mesh, options.account);
    if (errs.length) return { runtime: null, diag: 'weapon-parse-failed:' + errs.slice(0, 2).join('；') };
    segments = splitWeaponSegments(mesh, options.segmentBoundaries);
    vertexData = buildWeaponVertexInterleave(mesh);
  } catch (error) {
    return { runtime: null, diag: 'weapon-parse-failed:' + msgOf(error) };
  }

  // ③ 底色贴图解码
  try {
    const baseColor = await deps.decodeImage(mesh.baseColor.bytes, mesh.baseColor.mimeType, mesh.baseColor.name);
    return {
      runtime: {
        assetId: options.ref.id,
        mesh,
        segments,
        vertexData,
        baseColor,
        diag: `weapon-ready:${mesh.account.triangleCount}tri/${mesh.account.vertexCount}v`,
      },
      diag: `weapon-ready:${mesh.account.triangleCount}tri/${mesh.account.vertexCount}v`,
    };
  } catch (error) {
    return { runtime: null, diag: 'weapon-texture-failed:' + msgOf(error) };
  }
}

function msgOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
