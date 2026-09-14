// T31-FE-A · 对拍金标生成器（probe 件 → goldens）
//
// 用途：把 `proto/webgl2_probe/src/{math,glb-loader,anim-loader}.js`（S0 已验实现）
// 在**同一份真实资产**上的输出固化为金标 JSON，供 tests/character3d-probe-parity.test.ts
// 离线逐帧/逐算子比对迁移件与 probe 件。
//
// 为什么不在测试里直接 import probe：probe 属 T31 的**证据工程**（另一条分支），
// 生产分支不该携带它的副本；金标 + 本脚本 = 「对拍脚本与结果入库」的落法（任务卡 §5）。
//
// 用法（在仓库根执行；需要能访问 probe 分支的 ref）：
//   node tests/character3d-probe-parity-generate.mjs
// 环境变量：
//   PROBE_REF   probe 分支/提交（默认 origin/task/t31-webgl2-probe）
//   PROBE_REV   写入金标的 probe 修订号（默认按 PROBE_REF 自动解析）
//
// 注意：本脚本**不是**测试（vitest include 只收 tests/**/*.test.ts），也不会被 typecheck 覆盖；
// 它只在「probe 算法有改动」或「重新生成金标」时手工跑。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const PROBE_REF = process.env.PROBE_REF || 'origin/task/t31-webgl2-probe';
const MODEL_PATH = 'assets/characters/hero/model/hero_48k_20260914.glb';
const CLIP_PATHS = {
  idle: 'assets/characters/hero/model/anim/idle_v4.json',
  atk: 'assets/characters/hero/model/anim/atk_v4.json',
  cast: 'assets/characters/hero/model/anim/cast_v4.json',
  jump: 'assets/characters/hero/model/anim/jump_v6_1p5s.json',
};

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

// ---- ① 取 probe 件到临时目录（不进仓库） ----
const probeRev = process.env.PROBE_REV || git(['rev-parse', PROBE_REF]);
const probeDir = mkdtempSync(join(tmpdir(), 'pw-probe-'));
for (const name of ['math.js', 'glb-loader.js', 'anim-loader.js']) {
  const src = execFileSync('git', ['show', `${PROBE_REF}:proto/webgl2_probe/src/${name}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(join(probeDir, name), src);
}
const probeMath = (await import(pathToFileURL(join(probeDir, 'math.js')).href)).default;
const probeGlb = (await import(pathToFileURL(join(probeDir, 'glb-loader.js')).href)).default;
const probeAnim = (await import(pathToFileURL(join(probeDir, 'anim-loader.js')).href)).default;

// ---- ② 确定性输入（两侧同输入） ----
const DEG = [0, 45, -45, 135, 180, -135, 270, 315, 90, 225, 117.5, -200];
const TRS_CASES = DEG.map((deg, i) => ({
  deg,
  t: [0.125 * (i - 5), -0.75 + 0.1 * i, 1.5 - 0.05 * i],
  q: quatFromYaw(deg),
  s: [1 + 0.01 * i, 1, 1 - 0.005 * i],
}));

function quatFromYaw(deg) {
  const h = (deg * Math.PI) / 360;
  return [0, Math.sin(h), 0, Math.cos(h)];
}

function f32(values) {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i];
  return Array.from(out);
}

/** 量化摘要（与 ui/character3d/glb.ts 的 digestFloats 同式；此处独立实现以便对拍时互为参照）。 */
function digestFloats(values, quantum = 1e-4) {
  let h = 0x811c9dc5;
  const bump = (byte) => {
    h ^= byte & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  };
  for (let i = 0; i < values.length; i++) {
    const q = Math.round(values[i] / quantum) | 0;
    bump(q & 0xff);
    bump((q >>> 8) & 0xff);
    bump((q >>> 16) & 0xff);
  }
  return h >>> 0;
}

const golden = {
  meta: {
    generatedBy: 'tests/character3d-probe-parity-generate.mjs',
    probeRef: PROBE_REF,
    probeRev,
    probeFiles: ['proto/webgl2_probe/src/math.js', 'proto/webgl2_probe/src/glb-loader.js', 'proto/webgl2_probe/src/anim-loader.js'],
    modelPath: MODEL_PATH,
    modelSha256: sha256Hex(readFileSync(join(repoRoot, MODEL_PATH))),
    clipPaths: CLIP_PATHS,
    note: '迁移件（ui/character3d/*）与本文件逐算子/逐帧比对；容差与比较口径见 character3d-probe-parity.test.ts',
    corrections: {
      'nlerp-time-polarity': 'animation.rotationCases 的 probe 侧喂镜像子帧时刻 (i0 + (1−a))：'
        + 'arch seq=414 判定历史口径（k=a 权重给 i0）为区间内倒播缺陷并要求标准化为 t=0→i0、t=1→i1。'
        + 'root 轨道极性本就正确，故 rootCases 用同时刻零容差对拍（该对拍面未变）。'
        + 'math / glb 对拍面完全未变。',
    },
  },
  math: {},
  glb: {},
  animation: {},
};

// ---- ③ math 对拍 ----
const m = probeMath;
const idA = m.identity(m.mat4());
const idB = m.identity(m.mat4());
const mulOut = m.mul(m.mat4(), idA, idB);
golden.math.identity = f32(idA);
golden.math.mulIdentityIdentity = f32(mulOut);
golden.math.trs = TRS_CASES.map((c) => f32(m.fromTRS(m.mat4(), c.t, c.q, c.s)));
// mul 次序敏感性：a·b 与 b·a 必须不同，证明口径不是「碰巧对称」。
// 输入必须能由金标里的确定性用例表（TRS_CASES 下标 3 / 9）重建 —— 两侧输入不同的话差异没有意义。
const fromA = m.fromTRS(m.mat4(), [1, 2, 3], TRS_CASES[3].q, [1, 1, 1]);
const fromB = m.fromTRS(m.mat4(), [-2, 0.5, 4], TRS_CASES[9].q, [1.2, 1, 0.8]);
golden.math.mulAB = f32(m.mul(m.mat4(), fromA, fromB));
golden.math.mulBA = f32(m.mul(m.mat4(), fromB, fromA));
golden.math.mulSelfAlias = f32(m.mul(fromA, fromA, fromB));
golden.math.orthoPixel = [[375, 667], [900, 560], [1098, 2400]]
  .flatMap(([w, h]) => f32(m.orthoPixel(m.mat4(), w, h, 4)));
golden.math.orthoPixelNoZHalf = f32(m.orthoPixel(m.mat4(), 375, 667));
golden.math.placement = f32(m.placement(m.mat4(), 123.5, 456.25, 125.6));
golden.math.placementNegative = f32(m.placement(m.mat4(), -10.5, -0.25, 0.5));
// ⚠ mulSelfAlias 会**原地**改写 fromA（probe 的 mul 支持 out===a），故此处必须另起一份矩阵，
//   否则测的是「被 mul 改过的矩阵」，会把差异假报成迁移件的问题。
golden.math.xformPoint = [
  ...f32(m.xformPoint([0, 0, 0], m.fromTRS(m.mat4(), [1, 2, 3], TRS_CASES[3].q, [1, 1, 1]), 0.1, 0.2, 0.3)),
  ...f32(m.xformPoint([0, 0, 0], Float32Array.from(golden.math.placement), -1, 2, -3)),
];
golden.math.nlerp = [];
for (const k of [0, 0.25, 0.5, 0.75, 1, 1.5, -0.5]) {
  // 覆盖对趾（dot<0）分支：第二组四元数取第一组的相反号
  for (const flip of [false, true]) {
    const qa = [0.1, -0.2, 0.3, Math.sqrt(1 - 0.14)];
    const qb = [flip ? -0.4 : 0.4, 0.5, -0.6, 0.2];
    golden.math.nlerp.push({
      k,
      flip,
      qa,
      qb,
      out: f32(m.nlerp(new Float32Array(4), qa, 0, qb, 0, k)),
    });
  }
}

function sha256Hex(buffer) {
  return execFileSync('shasum', ['-a', '256', '-'], { input: buffer, encoding: 'utf8' }).trim().split(/\s+/)[0];
}

// ---- ④ glb 对拍 ----
const modelBytes = readFileSync(join(repoRoot, MODEL_PATH));
const probeModel = probeGlb.load(new Uint8Array(modelBytes));
golden.glb.account = probeModel.account;
golden.glb.bounds = { min: probeModel.bounds.min, max: probeModel.bounds.max, source: probeModel.bounds.source };
golden.glb.indexType = probeModel.indexType;
golden.glb.jointNodes = probeModel.jointNodes.slice();
golden.glb.nodeNames = probeModel.nodes.trs.map((n) => n.name);
golden.glb.nodeOrder = Array.from(probeModel.nodes.order);
golden.glb.nodeParents = Array.from(probeModel.nodes.parents);
golden.glb.restTRS = probeModel.nodes.trs.map((n) => ({ t: n.t, q: n.q, s: n.s }));
golden.glb.digests = {
  positions: digestFloats(probeModel.positions, 1e-5),
  normals: digestFloats(probeModel.normals, 1e-5),
  uvs: digestFloats(probeModel.uvs, 1e-5),
  jointIndices: digestFloats(probeModel.jointIndices, 1e-5),
  weights: digestFloats(probeModel.weights, 1e-5),
  indices: digestFloats(probeModel.indices, 1e-5),
  ibm: digestFloats(probeModel.ibm, 1e-5),
};
golden.glb.imageMeta = probeModel.images.map((img) => ({
  index: img.index,
  mimeType: img.mimeType,
  byteLength: img.bytes.byteLength,
  digest: digestFloats(img.bytes, 1),
}));
// 蒙皮渲染器的可对拍纯部分：16 float/顶点交错缓冲（GPU 上传载荷）
{
  const vcount = probeModel.account.vertexCount;
  const inter = new Float32Array(vcount * 16);
  for (let v = 0; v < vcount; v++) {
    const o = v * 16;
    inter[o] = probeModel.positions[v * 3]; inter[o + 1] = probeModel.positions[v * 3 + 1]; inter[o + 2] = probeModel.positions[v * 3 + 2];
    inter[o + 3] = probeModel.normals[v * 3]; inter[o + 4] = probeModel.normals[v * 3 + 1]; inter[o + 5] = probeModel.normals[v * 3 + 2];
    inter[o + 6] = probeModel.uvs[v * 2]; inter[o + 7] = probeModel.uvs[v * 2 + 1];
    inter[o + 8] = probeModel.jointIndices[v * 4]; inter[o + 9] = probeModel.jointIndices[v * 4 + 1];
    inter[o + 10] = probeModel.jointIndices[v * 4 + 2]; inter[o + 11] = probeModel.jointIndices[v * 4 + 3];
    inter[o + 12] = probeModel.weights[v * 4]; inter[o + 13] = probeModel.weights[v * 4 + 1];
    inter[o + 14] = probeModel.weights[v * 4 + 2]; inter[o + 15] = probeModel.weights[v * 4 + 3];
  }
  golden.glb.vertexInterleave = { length: inter.length, digest: digestFloats(inter, 1e-5), head: Array.from(inter.slice(0, 32)) };
}

// ---- ⑤ 重定向动作采样对拍（palette） ----
//
// ★ intentional correction（arch seq=414）：nlerp 的时间极性被有意更正为 t=0→i0、t=1→i1。
//   历史实现（probe 与 tools/glb2d/render.mjs）把权重 k=a 给 i0，导致区间内倒播。
//   因此本节的**旋转**对拍把 probe 喂到「镜像子帧时刻」(i0 + (1−a))，使 probe 产出与更正后同极性的结果，
//   从而继续锁住「除极性外的整条采样链」（nlerp 数学 → TRS → 拓扑 world → palette = world·IBM）。
//   旧 probe golden 不得用来锁这个缺陷（arch 原话），故旧 anim 金标整体作废并重生成。
//   **root 位移**不参与该镜像：probe 的 root 轨道本就是 t=0→r0 的正确极性，
//   故 root 用**同时刻**对拍（零容差），保证这一段的对拍面完全不变。
const SEGMENT_CASES = [
  { frame: 0, a: 0.25 },
  { frame: 0, a: 0.75 },
  { frame: 17, a: 0.5 },
  { frame: 99, a: 0.25 },
];
const probePose = probeAnim.createPose(probeModel);
for (const [key, path] of Object.entries(CLIP_PATHS)) {
  const raw = JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
  const clip = probeAnim.parseAnim(raw);
  const bound = probeAnim.bindToModel(clip, probeModel);
  const nF = clip.nFrames;
  const fps = clip.fps;
  const joints = [0, 16, 40];
  const rotationCases = [];
  const rootCases = [];
  for (const seg of SEGMENT_CASES) {
    const phase = (seg.frame + seg.a) / nF;
    // ★ 与迁移件/probe 内部同口径：相位先按帧数取模（frame 可能跨圈），再取段下标与子帧权重。
    //   否则 frame > nF 的用例会算出负的镜像时刻（曾实测：atk nF=45 时 frame=99 爆出负时间）。
    let fi = phase * nF;
    fi = fi - Math.floor(fi / nF) * nF;
    const i0 = Math.min(nF - 1, Math.floor(fi));
    const aActual = fi - i0;
    // --- 旋转：probe 喂镜像子帧时刻（root 轨道先置零，隔离出旋转链） ---
    const savedRoot = clip.rootTrack;
    clip.rootTrack = new Array(nF).fill([0, 0, 0]);
    const mirroredTimeSec = (i0 + (1 - aActual)) / fps;
    const mirroredPalette = probeAnim.sampleToPalette(clip, bound, probeModel, probePose, mirroredTimeSec);
    clip.rootTrack = savedRoot;
    rotationCases.push({
      frame: seg.frame,
      a: seg.a,
      phase,
      wrappedPhase: fi / nF,
      aActual,
      mirroredTimeSec,
      paletteDigest: digestFloats(mirroredPalette, 1e-5),
      paletteSample: joints.flatMap((j) => Array.from(Float32Array.from(mirroredPalette.subarray(j * 16, j * 16 + 16)))),
      sampleJointIndices: joints,
    });
    // --- root 位移：probe 用**同时刻**（极性本就一致），零容差对拍面 ---
    const nominalTimeSec = (seg.frame + seg.a) / fps;
    probeAnim.sampleToPalette(clip, bound, probeModel, probePose, nominalTimeSec);
    rootCases.push({
      frame: seg.frame,
      a: seg.a,
      timeSec: nominalTimeSec,
      rootTranslation: Array.from(Float32Array.from(probePose.tV[bound.rootNode])),
    });
  }
  golden.animation[key] = {
    fps: clip.fps,
    nFrames: clip.nFrames,
    declaredDurationSec: clip.duration,
    coveredJoints: bound.coveredJoints,
    rootNode: bound.rootNode,
    rootRest: bound.rootRest,
    correction: 'nlerp-time-polarity（intentional correction · arch seq=414）',
    rotationCases,
    rootCases,
  };
}

const outDir = join(repoRoot, 'tests', 'character3d-parity-golden');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'probe-golden.json');
writeFileSync(outPath, JSON.stringify(golden, null, 1) + '\n');
const sizeKb = Math.round(Buffer.byteLength(JSON.stringify(golden)) / 1024);
console.log(`[parity] probe rev ${probeRev}`);
console.log(`[parity] wrote ${outPath} (${sizeKb} KB)`);
console.log(`[parity] math cases: trs=${golden.math.trs.length} nlerp=${golden.math.nlerp.length}`);
console.log(`[parity] glb account: ${JSON.stringify(golden.glb.account)}`);
console.log(`[parity] animation clips: ${Object.keys(golden.animation).join(', ')}`);
console.log(`[parity] animation rotationCases=${Object.values(golden.animation).reduce((n, c) => n + c.rotationCases.length, 0)}`
  + ` rootCases=${Object.values(golden.animation).reduce((n, c) => n + c.rootCases.length, 0)}`
  + '（旋转=镜像子帧 · intentional correction；root=同时刻零容差）');
