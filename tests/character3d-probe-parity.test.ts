// T31-FE-A · probe 输出对拍（任务卡 §5「必须做输出对拍」）
//
// 对拍对象：S0 已验实现 `proto/webgl2_probe/src/{math,glb-loader,anim-loader}.js`
//   ↔ 迁移件 `ui/character3d/{math,glb,animation}.ts`。
// 口径：**同输入逐帧/逐算子一致**；金标由 tests/character3d-probe-parity-generate.mjs 生成，
//   生成时 probe 件从 `origin/task/t31-webgl2-probe` 取出到临时目录执行（生产分支不携带 probe 副本）。
// 容差：0（两侧同为 Float32 写入 + 同一运算序）；若未来某算子改为 Float64 累加，本文件会先报出差异。
//
// 覆盖范围说明（与任务卡「允许收编 math/glb-loader/anim-loader/skinning-renderer 已验算法」对齐）：
//   · math：identity/mul/fromTRS/orthoPixel/placement/xformPoint/nlerp（含对趾分支与别名写入）；
//   · glb-loader：模型账 / 包围盒 / 节点序与静止 TRS / 全部属性摘要 / IBM 摘要 / 内嵌贴图 / 顶点交错缓冲；
//   · anim-loader：4 条重定向动作 × 4 个相位 × root 位移策略的 **41 骨 palette** 与 Root 平移；
//   · skinning-renderer：其纯部分（16 float/顶点交错布局 + 索引类型）在此对拍，
//     其 GL 部分（palette 上传次数、双分支抗锯齿）由 character3d-renderer.test.ts 用假 GL 覆盖。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as math from '../ui/character3d/math';
import {
  buildVertexInterleave,
  digestFloats,
  loadCharacter3DModel,
} from '../ui/character3d/glb';
import {
  applyRetargetedClip,
  bindRetargetedClip,
  createPose,
  parseCharacter3DClipJson,
  resolvePose,
} from '../ui/character3d/animation';

const GOLDEN = JSON.parse(
  readFileSync('tests/character3d-parity-golden/probe-golden.json', 'utf8'),
) as Golden;

/** env.d.ts 只声明了 `readFileSync(path, encoding)` 这一种形态，而 GLB 必须读**二进制**：
 * 这里把运行时真实签名（省略 encoding 时返回 Buffer，Buffer 是 Uint8Array 的子类）显式断言出来。
 * 断言点集中在测试内，生产代码不触文件系统。 */
const readBytesSync = readFileSync as unknown as (path: string) => Uint8Array;

interface Golden {
  meta: {
    probeRef: string;
    probeRev: string;
    modelPath: string;
    modelSha256: string;
    clipPaths: Record<string, string>;
    note: string;
  };
  math: {
    identity: number[];
    mulIdentityIdentity: number[];
    trs: number[][];
    mulAB: number[];
    mulBA: number[];
    mulSelfAlias: number[];
    orthoPixel: number[];
    orthoPixelNoZHalf: number[];
    placement: number[];
    placementNegative: number[];
    xformPoint: number[];
    nlerp: { k: number; flip: boolean; qa: number[]; qb: number[]; out: number[] }[];
  };
  glb: {
    account: Record<string, number | string>;
    bounds: { min: number[]; max: number[]; source: string };
    indexType: number;
    jointNodes: number[];
    nodeNames: string[];
    nodeOrder: number[];
    nodeParents: number[];
    restTRS: { t: number[]; q: number[]; s: number[] }[];
    digests: Record<string, number>;
    imageMeta: { index: number; mimeType: string; byteLength: number; digest: number }[];
    vertexInterleave: { length: number; digest: number; head: number[] };
  };
  animation: Record<
    string,
    {
      fps: number;
      nFrames: number;
      declaredDurationSec: number;
      coveredJoints: number;
      rootNode: number;
      rootRest: number[];
      cases: {
        phase: number;
        rootDisplacement: 'track' | 'zero';
        timeSec: number;
        paletteDigest: number;
        paletteSample: number[];
        sampleJointIndices: number[];
        rootTranslation: number[];
      }[];
    }
  >;
}

const TRS_CASES = [
  0, 45, -45, 135, 180, -135, 270, 315, 90, 225, 117.5, -200,
].map((deg, i) => ({
  deg,
  t: [0.125 * (i - 5), -0.75 + 0.1 * i, 1.5 - 0.05 * i],
  q: (() => {
    const h = (deg * Math.PI) / 360;
    return [0, Math.sin(h), 0, Math.cos(h)];
  })(),
  s: [1 + 0.01 * i, 1, 1 - 0.005 * i],
}));

/** 逐元素严格相等（Float32 值在 JSON 中是精确 double，故可要求零容差）。 */
function expectSameFloats(actual: ArrayLike<number>, expected: readonly number[], label: string): void {
  expect(actual.length, `${label} 长度`).toBe(expected.length);
  let maxDiff = 0;
  let firstBad = -1;
  for (let i = 0; i < expected.length; i++) {
    const d = Math.abs(actual[i] - expected[i]);
    if (d > maxDiff) {
      maxDiff = d;
      if (firstBad < 0 && d !== 0) firstBad = i;
    }
  }
  expect(maxDiff, `${label} 逐元素差异（首个不符下标 ${firstBad}）`).toBe(0);
}

const model = loadCharacter3DModel(readBytesSync(GOLDEN.meta.modelPath));

describe('probe 对拍 · math（同输入零容差）', () => {
  it('identity', () => {
    expectSameFloats(math.identity(math.mat4()), GOLDEN.math.identity, 'identity');
  });

  it('mul(identity, identity)', () => {
    const a = math.identity(math.mat4());
    const b = math.identity(math.mat4());
    expectSameFloats(math.mul(math.mat4(), a, b), GOLDEN.math.mulIdentityIdentity, 'mul');
  });

  it('fromTRS 全角度/全缩放用例', () => {
    GOLDEN.math.trs.forEach((want, i) => {
      const c = TRS_CASES[i];
      expectSameFloats(math.fromTRS(math.mat4(), c.t, c.q, c.s), want, `fromTRS[${i}] (${c.deg}°)`);
    });
  });

  it('mul 非交换性（a·b 与 b·a 都逐位一致，且两者互不相同）', () => {
    const a = math.fromTRS(math.mat4(), [1, 2, 3], TRS_CASES[3].q, [1, 1, 1]);
    const b = math.fromTRS(math.mat4(), [-2, 0.5, 4], TRS_CASES[9].q, [1.2, 1, 0.8]);
    const ab = math.mul(math.mat4(), a, b);
    const ba = math.mul(math.mat4(), b, a);
    expectSameFloats(ab, GOLDEN.math.mulAB, 'mulAB');
    expectSameFloats(ba, GOLDEN.math.mulBA, 'mulBA');
    expect(Array.from(ab)).not.toEqual(Array.from(ba));
  });

  it('mul 允许 out 与 a 同引用（别名写入）', () => {
    const a = math.fromTRS(math.mat4(), [1, 2, 3], TRS_CASES[3].q, [1, 1, 1]);
    const b = math.fromTRS(math.mat4(), [-2, 0.5, 4], TRS_CASES[9].q, [1.2, 1, 0.8]);
    expectSameFloats(math.mul(a, a, b), GOLDEN.math.mulSelfAlias, 'mulSelfAlias');
  });

  it('orthoPixel（三种视口尺寸 + zHalf 缺省）', () => {
    const sizes: [number, number][] = [[375, 667], [900, 560], [1098, 2400]];
    const got: number[] = [];
    for (const [w, h] of sizes) got.push(...Array.from(math.orthoPixel(math.mat4(), w, h, 4)));
    expectSameFloats(got, GOLDEN.math.orthoPixel, 'orthoPixel');
    expectSameFloats(math.orthoPixel(math.mat4(), 375, 667, 4), GOLDEN.math.orthoPixelNoZHalf, 'orthoPixel 默认 zHalf');
  });

  it('placement（含负数坐标）', () => {
    expectSameFloats(math.placement(math.mat4(), 123.5, 456.25, 125.6), GOLDEN.math.placement, 'placement');
    expectSameFloats(math.placement(math.mat4(), -10.5, -0.25, 0.5), GOLDEN.math.placementNegative, 'placement 负值');
  });

  it('xformPoint', () => {
    const a = math.fromTRS(math.mat4(), [1, 2, 3], TRS_CASES[3].q, [1, 1, 1]);
    const got: number[] = [];
    got.push(...Array.from(math.xformPoint(new Float32Array(3), a, 0.1, 0.2, 0.3)));
    got.push(...Array.from(math.xformPoint(new Float32Array(3), math.placement(math.mat4(), 123.5, 456.25, 125.6), -1, 2, -3)));
    expectSameFloats(got, GOLDEN.math.xformPoint, 'xformPoint');
  });

  it('nlerp（含对趾翻转与 k 超界 1.5/-0.5）', () => {
    GOLDEN.math.nlerp.forEach((c, i) => {
      const out = math.nlerp(new Float32Array(4), c.qa, 0, c.qb, 0, c.k);
      expectSameFloats(out, c.out, `nlerp[${i}] k=${c.k} flip=${c.flip}`);
    });
  });
});

describe('probe 对拍 · glb-loader（真实 48k 模型）', () => {
  it('模型账逐项一致', () => {
    // probe 的 account 不含 meshCount/materialCount（迁移件为结构门补的两个字段），逐字段比对共有部分
    for (const key of Object.keys(GOLDEN.glb.account)) {
      expect(model.account[key as keyof typeof model.account], key).toBe(GOLDEN.glb.account[key]);
    }
  });

  it('包围盒与来源标记一致', () => {
    expect(model.bounds.min).toEqual(GOLDEN.glb.bounds.min);
    expect(model.bounds.max).toEqual(GOLDEN.glb.bounds.max);
    expect(model.bounds.source).toBe(GOLDEN.glb.bounds.source);
  });

  it('索引类型 / joints 顺序 / 节点名 / 拓扑序与父表 / 静止 TRS 一致', () => {
    expect(model.mesh.indexComponentType).toBe(GOLDEN.glb.indexType);
    expect(model.jointNodes).toEqual(GOLDEN.glb.jointNodes);
    expect(model.nodes.trs.map((n) => n.name)).toEqual(GOLDEN.glb.nodeNames);
    expect(Array.from(model.nodes.order)).toEqual(GOLDEN.glb.nodeOrder);
    expect(Array.from(model.nodes.parents)).toEqual(GOLDEN.glb.nodeParents);
    model.nodes.trs.forEach((n, i) => {
      expect(n.t, `node[${i}].t`).toEqual(GOLDEN.glb.restTRS[i].t);
      expect(n.q, `node[${i}].q`).toEqual(GOLDEN.glb.restTRS[i].q);
      expect(n.s, `node[${i}].s`).toEqual(GOLDEN.glb.restTRS[i].s);
    });
  });

  it('全部顶点属性 / 索引 / IBM 的量化摘要一致', () => {
    const got = {
      positions: digestFloats(model.mesh.positions, 1e-5),
      normals: digestFloats(model.mesh.normals, 1e-5),
      uvs: digestFloats(model.mesh.uvs, 1e-5),
      jointIndices: digestFloats(model.mesh.jointIndices, 1e-5),
      weights: digestFloats(model.mesh.weights, 1e-5),
      indices: digestFloats(model.mesh.indices, 1e-5),
      ibm: digestFloats(model.ibm, 1e-5),
    };
    expect(got).toEqual(GOLDEN.glb.digests);
  });

  it('内嵌贴图（3 × 4096² JPEG）字节摘要一致', () => {
    expect(model.images.length).toBe(GOLDEN.glb.imageMeta.length);
    model.images.forEach((img, i) => {
      expect(img.index, `image[${i}].index`).toBe(GOLDEN.glb.imageMeta[i].index);
      expect(img.mimeType, `image[${i}].mimeType`).toBe(GOLDEN.glb.imageMeta[i].mimeType);
      expect(img.bytes.byteLength, `image[${i}].length`).toBe(GOLDEN.glb.imageMeta[i].byteLength);
      expect(digestFloats(img.bytes, 1), `image[${i}].digest`).toBe(GOLDEN.glb.imageMeta[i].digest);
    });
  });

  it('skinning-renderer 纯部分：16 float/顶点交错缓冲逐位一致', () => {
    const inter = buildVertexInterleave(model);
    expect(inter.length).toBe(GOLDEN.glb.vertexInterleave.length);
    expect(digestFloats(inter, 1e-5)).toBe(GOLDEN.glb.vertexInterleave.digest);
    expectSameFloats(inter.slice(0, 32), GOLDEN.glb.vertexInterleave.head, 'vertexInterleave.head');
  });
});

describe('probe 对拍 · anim-loader（41 骨 palette）', () => {
  const pose = createPose(model);

  for (const key of Object.keys(GOLDEN.meta.clipPaths)) {
    it(`${key} 全相位 palette 与 Root 平移逐位一致`, () => {
      const golden = GOLDEN.animation[key];
      const raw = JSON.parse(readFileSync(GOLDEN.meta.clipPaths[key], 'utf8'));
      const clip = parseCharacter3DClipJson(raw, key);
      const bound = bindRetargetedClip(clip, model);

      expect(clip.fps).toBe(golden.fps);
      expect(clip.nFrames).toBe(golden.nFrames);
      expect(clip.declaredDurationSec).toBeCloseTo(golden.declaredDurationSec, 12);
      expect(bound.coveredJoints).toBe(golden.coveredJoints);
      expect(bound.rootNode).toBe(golden.rootNode);
      expect(bound.rootRest).toEqual(golden.rootRest);

      for (const c of golden.cases) {
        expect(clip.samplerDurationSec * c.phase).toBeCloseTo(c.timeSec, 12);
        applyRetargetedClip(clip, bound, model, pose, c.phase, c.rootDisplacement);
        const palette = resolvePose(model, pose);
        const label = `${key} phase=${c.phase} root=${c.rootDisplacement}`;
        expect(digestFloats(palette, 1e-5), `${label} paletteDigest`).toBe(c.paletteDigest);
        const sample = c.sampleJointIndices.flatMap((j) => Array.from(palette.subarray(j * 16, j * 16 + 16)));
        expectSameFloats(sample, c.paletteSample, `${label} paletteSample`);
        expectSameFloats(pose.tV[bound.rootNode], c.rootTranslation, `${label} rootTranslation`);
      }
    });
  }
});
