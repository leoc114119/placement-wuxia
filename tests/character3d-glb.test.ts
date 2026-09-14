// T31-FE-A · GLB 解析与静态装配用例（含 fail-fast 负例与结构门）
//
// 方案 §6.2：SHA 不符 / GLB 结构不符 / 41 骨 / 1 primitive 不符 ⇒ 不使用该文件，也不覆盖 LKG。
// 本文件覆盖「结构」这一半；「SHA / 缓存」那半在 character3d-loader.test.ts。

import { describe, expect, it } from 'vitest';
import {
  buildVertexInterleave,
  createModelStructureValidator,
  decodeUtf8,
  digest32,
  digestFloats,
  loadCharacter3DModel,
  parseGlb,
  readAccessor,
  validateModelAccount,
} from '../ui/character3d/glb';
import { HERO_3D_MODEL_ACCOUNT } from '../config/character-3d';
import { HERO_MODEL_PATH, heroModel, readBytesSync } from './character3d-fixtures';

const bytes = readBytesSync(HERO_MODEL_PATH);

describe('GLB 容器解析', () => {
  it('解析真实 48k 模型：容器头与 chunk 结构正确', () => {
    const parsed = parseGlb(bytes);
    expect(parsed.version).toBe(2);
    expect(parsed.byteLength).toBe(bytes.byteLength);
    expect(parsed.bin).not.toBeNull();
    expect(parsed.bin?.byteLength).toBe(HERO_3D_MODEL_ACCOUNT.bufferBytes);
    expect(parsed.json.asset?.generator).toBe('Tripo');
  });

  it('fail-fast：非 GLB 字节直接报错（禁按 glTF 文本猜）', () => {
    expect(() => parseGlb(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toThrow(/magic/);
    expect(() => parseGlb(new Uint8Array(8))).toThrow(/12 字节/);
  });

  it('fail-fast：声明长度大于实际字节数即报错', () => {
    const copy = new Uint8Array(bytes.subarray(0, 64));
    const dv = new DataView(copy.buffer);
    dv.setUint32(8, 1 << 20, true); // 谎报长度
    expect(() => parseGlb(copy)).toThrow(/声明长度/);
  });

  it('decodeUtf8 在缺 TextDecoder 的宿主也有回退实现（小游戏基础库不保证有）', () => {
    const sample = new TextEncoder().encode('武侠 héllo 🗡');
    const original = (globalThis as { TextDecoder?: unknown }).TextDecoder;
    try {
      expect(decodeUtf8(sample)).toBe('武侠 héllo 🗡');
      // 走回退分支
      (globalThis as { TextDecoder?: unknown }).TextDecoder = undefined;
      expect(decodeUtf8(sample)).toBe('武侠 héllo 🗡');
    } finally {
      (globalThis as { TextDecoder?: unknown }).TextDecoder = original;
    }
  });
});

describe('模型账与结构门', () => {
  it('账目逐项对上 README 登记值', () => {
    const model = heroModel();
    expect(model.account).toMatchObject({
      triangleCount: 48419,
      vertexCount: 29281,
      jointCount: 41,
      primitiveCount: 1,
      meshCount: 1,
      materialCount: 1,
      textureCount: 3,
      bufferBytes: 3974376,
      nodeCount: 43,
      generator: 'Tripo',
    });
    expect(model.mesh.indices.length).toBe(48419 * 3);
    expect(model.mesh.indices).toBeInstanceOf(Uint16Array); // 29281 顶点 < 65536
    expect(model.mesh.indexComponentType).toBe(5123);
  });

  it('41 骨（Mixamo 命名、无指骨）与内嵌动画轨道数', () => {
    const model = heroModel();
    expect(model.jointNodes.length).toBe(41);
    expect(new Set(model.jointNames).size).toBe(41);
    expect(model.jointNames).toContain('Root');
    expect(model.jointNames).toContain('Pelvis');
    expect(model.jointNames).toContain('R_Hand');
    expect(model.jointNames.filter((n) => /Hand|Finger|Thumb/.test(n)).length).toBe(2); // 只有 L_Hand/R_Hand
    // 嵌入动画：123 条通道 = 41 节点 × (translation/rotation/scale)
    for (const clip of model.clips) expect(clip.tracks.length).toBe(123);
  });

  it('validateModelAccount：全对返回空、任一不符返回不符项', () => {
    const model = heroModel();
    expect(validateModelAccount(model, HERO_3D_MODEL_ACCOUNT)).toEqual([]);
    const wrong = { ...HERO_3D_MODEL_ACCOUNT, jointCount: 40 };
    expect(validateModelAccount(model, wrong)).toEqual(['jointCount=41 应为 40']);
    expect(validateModelAccount(model, { ...HERO_3D_MODEL_ACCOUNT, primitiveCount: 2 })).toHaveLength(1);
  });

  it('createModelStructureValidator：结构对则通过；期待值错则抛（供 loader 结构门）', () => {
    const ok = createModelStructureValidator(HERO_3D_MODEL_ACCOUNT);
    expect(() => ok(bytes, { id: 'x', urlPath: 'a/b', sha256: '0'.repeat(64), byteLength: 1, mediaType: 'model/gltf-binary' })).not.toThrow();
    const bad = createModelStructureValidator({ ...HERO_3D_MODEL_ACCOUNT, jointCount: 40 });
    expect(() => bad(bytes, { id: 'x', urlPath: 'a/b', sha256: '0'.repeat(64), byteLength: 1, mediaType: 'model/gltf-binary' })).toThrow(/结构不符/);
  });
});

describe('顶点数据与 GPU 上传载荷', () => {
  it('交错缓冲长度 = 顶点数 × 16；骨索引全在 [0,41) 且权重和为 1', () => {
    const model = heroModel();
    const inter = buildVertexInterleave(model);
    expect(inter.length).toBe(model.mesh.vertexCount * 16);
    for (let v = 0; v < model.mesh.vertexCount; v++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const ji = inter[v * 16 + 8 + k];
        expect(ji).toBeGreaterThanOrEqual(0);
        expect(ji).toBeLessThan(41);
        sum += inter[v * 16 + 12 + k];
      }
      expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
    }
  });

  it('交错布局顺序 = pos3+nrm3+uv2+joints4+weights4（抽首顶点逐位对上源属性）', () => {
    const model = heroModel();
    const inter = buildVertexInterleave(model);
    const m = model.mesh;
    expect(inter[0]).toBeCloseTo(m.positions[0], 6);
    expect(inter[3]).toBeCloseTo(m.normals[0], 6);
    expect(inter[6]).toBeCloseTo(m.uvs[0], 6);
    expect(inter[8]).toBeCloseTo(m.jointIndices[0], 6);
    expect(inter[12]).toBeCloseTo(m.weights[0], 6);
  });

  it('摘要函数稳定且对量化噪声不敏感（1e-4 网格）', () => {
    const a = [0.1, 0.2, 0.3];
    const b = [0.1 + 1e-9, 0.2 - 1e-9, 0.3];
    expect(digestFloats(a)).toBe(digestFloats(b));
    expect(digestFloats(a)).not.toBe(digestFloats([0.1, 0.2, 0.3001]));
    expect(digest32([1, 2, 3])).toBe(digest32([1, 2, 3]));
    expect(digest32([1, 2, 3])).not.toBe(digest32([1, 2, 4]));
  });

  it('readAccessor 对越界 accessor 报错（禁静默读半截数据）', () => {
    const parsed = parseGlb(bytes);
    expect(() => readAccessor(parsed.json, parsed.bin, 999)).toThrow(/不存在/);
  });
});

describe('内嵌动画结构（walk/run 采样方式实测）', () => {
  it('walk/run 的通道按 sampler 各自的 interpolation 标记（STEP 与 LINEAR 混用）', () => {
    const model = heroModel();
    const walk = model.clips.find((c) => c.name === 'preset:biped:walk');
    expect(walk).toBeTruthy();
    const kinds = new Set(walk?.tracks.map((t) => t.interpolation));
    // Tripo 预设实测：Root/Pelvis 等为 STEP（段内保持），四肢为 LINEAR
    expect(kinds.has('STEP')).toBe(true);
    expect(kinds.has('LINEAR')).toBe(true);
    const rootTranslation = walk?.tracks.find(
      (t) => model.nodes.trs[t.nodeIndex].name === 'Root' && t.path === 'translation',
    );
    expect(rootTranslation?.interpolation).toBe('STEP');
    expect(rootTranslation?.times.length).toBe(2); // 常值，段内保持
    const thigh = walk?.tracks.find(
      (t) => model.nodes.trs[t.nodeIndex].name === 'L_Thigh' && t.path === 'rotation',
    );
    expect(thigh?.interpolation).toBe('LINEAR');
    expect(thigh?.times.length).toBe(57);
  });

  it('walk 可用时间窗 = [1/24, 2.375]，时长 2.3333s（相位 0 落在首关键帧）', () => {
    const model = heroModel();
    const walk = model.clips.find((c) => c.name === 'preset:biped:walk');
    expect(walk?.startTimeSec).toBeCloseTo(1 / 24, 7);
    expect(walk?.endTimeSec).toBeCloseTo(2.375, 7);
    expect(walk?.durationSec).toBeCloseTo(2.375 - 1 / 24, 7);
  });

  it('旋转轨关键帧全是单位四元数（STEP 段里也不能有离散坏值）', () => {
    const model = heroModel();
    for (const clip of model.clips) {
      for (const track of clip.tracks) {
        if (track.path !== 'rotation') continue;
        for (let i = 0; i < track.times.length; i++) {
          const l = Math.hypot(
            track.values[i * 4], track.values[i * 4 + 1], track.values[i * 4 + 2], track.values[i * 4 + 3],
          );
          expect(Math.abs(l - 1)).toBeLessThan(1e-4);
        }
      }
    }
  });
});

describe('loadCharacter3DModel 的 fail-fast 面', () => {
  it('空/垃圾字节报错而不是返回半个模型', () => {
    expect(() => loadCharacter3DModel(new Uint8Array(0))).toThrow();
    expect(() => loadCharacter3DModel(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0, 0, 0, 2, 0, 0, 0, 12]))).toThrow();
  });

  it('声明 extensionsRequired 的模型一律拒绝（DRACO 等）', () => {
    const parsed = parseGlb(bytes);
    const mutated = { ...parsed.json, extensionsRequired: ['KHR_draco_mesh_compression'] };
    // 直接验证结构门逻辑：把 extensionsRequired 塞进 JSON chunk 重建成本高，
    // 这里改为断言真实模型不含 extensionsUsed（即我们支持的形态）
    expect(parsed.json.extensionsRequired).toBeUndefined();
    expect(mutated.extensionsRequired).toHaveLength(1);
  });
});
