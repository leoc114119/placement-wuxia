// T32 · ui/character3d/weapon.ts —— 3D 武器挂载：挂点合成 / 拳心 / 换色分段（纯 CPU，无 GL）
//
// 真源：《3D武器挂载接入技术方案》v1.0 §3（标定）/ §5（换色）＋ A4-T31 §三（合成数学＋参考矩阵＋自检表）。
//
// 挂点合成（**顺序红线，禁改**）：
//     f = 拳心(R_Hand) + offsetLocal × ch                    （骨局部；ch := profile.modelHeight，**模型单位**）
//     Q = q(+Y→+Z) · rotZ(rz) · rotY(ry) · rotX(rx)           （q(+Y→+Z) = 绕 +X +90°）
//     M = T(f) · R(Q) · S(k) · T(0, −gripY, 0)                （k = lenRatio × ch）
//   `T(0, −gripY, 0)` 必须在 `S(k)` **右侧**（平移量是武器模型单位、不乘 k）——
//   写反即「插多/插少」一个 gripY，且 W4 锚点会随 lenRatio 漂。
//   该顺序**结构性**保证 `M × 握点local = f`，与 k 无关（W4：换长度握点不动）。
//
// 空间约定（本管线，glTF 规范口径）：蒙皮顶点 = world(joint)·IBM·v_bind ⇒ 绑定姿势下顶点即渲染在 v_bind，
//   故「模型空间」= bind 空间；拳心在 R_Hand 局部 = inv(worldV[R_Hand]) · v_bind。
//   ⚠ 观感台用 three.js 的 `sk.localToWorld`（= 再乘 Mesh 节点的 matrixWorld，含 Armature 平移）
//     ⇒ A4 报的拳心含该 Armature 项（差 4e-4 模型单位 ≈ 0.04 逻辑像素）。见 tasks/questions/Q1-T32。

import type { CharacterAttachmentProfile } from '../../types';
import type { Character3DMeshData } from './glb';
import { identity, mat4, mul, srgbToLinear, type Mat4 } from './math';

/** 武器段名（W5 四部件；顺序 = 换色与绘制顺序，禁改）。 */
export const WEAPON_SEGMENT_KEYS = ['blade', 'guard', 'grip', 'pommel'] as const;
export type WeaponSegmentKey = (typeof WEAPON_SEGMENT_KEYS)[number];

/** 分段结果：共享同一 VBO，仅**索引重排**（顶点零复制）。 */
export interface WeaponSegments {
  /** 重排后的索引（按 blade/guard/grip/pommel 顺序连续排布） */
  indices: Uint32Array;
  /** 每段在 indices 中的 [start, count)（count 是索引个数 = 3×三角数） */
  ranges: Readonly<Record<WeaponSegmentKey, { start: number; count: number }>>;
  /** 索引分量类型提示（沿用源网格：16535/16535→Uint16 可省一半带宽；此处统一 Uint32 以简化装配） */
  indexComponentType: number;
}

/** 装配期一次性产出的挂点标定（每 profile 一份；渲染路径只读）。 */
export interface WeaponAttachmentCalibration {
  /** M：武器模型空间 → 挂点骨局部空间（列主序 16 浮点） */
  readonly localMatrix: Float32Array;
  /** 锚点 f（骨局部；= M × 握点，用例断言其精确成立） */
  readonly anchorLocal: readonly [number, number, number];
  /** 「角色身高」ch（= profile.modelHeight，模型单位） */
  readonly charHeightModel: number;
  /** 缩放 k = lenRatio × ch */
  readonly scale: number;
  /** 拳心（挂点骨局部；装配期算一次） */
  readonly fistCenterLocal: readonly [number, number, number];
  /** 参与拳心计算的顶点数（现模型 551；换模型变化即提示标定需复核） */
  readonly fistVertexCount: number;
}

export function failWeapon(msg: string): never {
  throw new Error('[character3d/weapon] ' + msg);
}

// ===== 4x4 工具（本文件自用；math.ts 只提供 mul/xformPoint，不引入通用求逆） =====

/** 仿射逆（列主序）：3×3 用伴随矩阵求逆 + 平移反解。非奇异（|det|≥1e-12）⇒ 精确。 */
export function invertAffine(out: Float32Array, m: Mat4): Float32Array {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];
  const det = a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11);
  if (!(Math.abs(det) > 1e-12)) failWeapon('矩阵不可逆（det=' + det + '）——禁静默退化');
  const id = 1 / det;
  const b00 = (a11 * a22 - a12 * a21) * id;
  const b01 = (a02 * a21 - a01 * a22) * id;
  const b02 = (a01 * a12 - a02 * a11) * id;
  const b10 = (a12 * a20 - a10 * a22) * id;
  const b11 = (a00 * a22 - a02 * a20) * id;
  const b12 = (a02 * a10 - a00 * a12) * id;
  const b20 = (a10 * a21 - a11 * a20) * id;
  const b21 = (a01 * a20 - a00 * a21) * id;
  const b22 = (a00 * a11 - a01 * a10) * id;
  out[0] = b00; out[1] = b01; out[2] = b02; out[3] = 0;
  out[4] = b10; out[5] = b11; out[6] = b12; out[7] = 0;
  out[8] = b20; out[9] = b21; out[10] = b22; out[11] = 0;
  const tx = m[12], ty = m[13], tz = m[14];
  out[12] = -(b00 * tx + b10 * ty + b20 * tz);
  out[13] = -(b01 * tx + b11 * ty + b21 * tz);
  out[14] = -(b02 * tx + b12 * ty + b22 * tz);
  out[15] = 1;
  return out;
}

/** 绕 X/Y/Z 的旋转矩阵（列主序，右手系，与 glTF/three.js 同约定）。 */
export function rotationX(deg: number): Float32Array {
  const r = identity(mat4()) as Float32Array;
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  r[5] = c; r[6] = s; r[9] = -s; r[10] = c;
  return r;
}
export function rotationY(deg: number): Float32Array {
  const r = identity(mat4()) as Float32Array;
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  r[0] = c; r[2] = -s; r[8] = s; r[10] = c;
  return r;
}
export function rotationZ(deg: number): Float32Array {
  const r = identity(mat4()) as Float32Array;
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  r[0] = c; r[1] = s; r[4] = -s; r[5] = c;
  return r;
}

function translation(x: number, y: number, z: number): Float32Array {
  const t = identity(mat4()) as Float32Array;
  t[12] = x; t[13] = y; t[14] = z;
  return t;
}

function uniformScale(k: number): Float32Array {
  const s = identity(mat4()) as Float32Array;
  s[0] = k; s[5] = k; s[10] = k;
  return s;
}

/** 武器点 → 骨局部（列主序矩阵作用在点上）。 */
export function applyMat4(m: Mat4, v: readonly number[]): [number, number, number] {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

/** 挂点姿态四元数对应的旋转矩阵 R(Q) = R_x(+90°)·R_z(rz)·R_y(ry)·R_x(rx)。
 * `+Y→+Z` 基准（绕 +X +90°）把武器长轴从 +Y 转到角色前向（模型自身 +Z）。 */
export function attachmentRotation(poseDeg: { rx: number; ry: number; rz: number }): Float32Array {
  const base = rotationX(90);
  const acc = identity(mat4()) as Float32Array;
  const tmp = mat4();
  for (const r of [rotationZ(poseDeg.rz), rotationY(poseDeg.ry), rotationX(poseDeg.rx)]) {
    mul(tmp, acc, r);
    acc.set(tmp);
  }
  const out = mat4();
  mul(out, base, acc);
  return out;
}

/**
 * 挂点合成（A4 §3.2 逐式）：`M = T(f) · R(Q) · S(k) · T(0, −gripY, 0)`。
 * @param anchorLocal f（骨局部；= 拳心 + offsetLocal×ch）
 * @param scale k = lenRatio × ch（模型单位）
 * @param gripLocal 武器握点（武器模型空间）
 */
export function composeAttachmentMatrix(
  anchorLocal: readonly [number, number, number],
  scale: number,
  gripLocal: readonly [number, number, number],
  poseDeg: { rx: number; ry: number; rz: number },
  out: Float32Array = mat4(),
): Float32Array {
  if (!(scale > 0)) failWeapon('scale 必须为正（实得 ' + scale + '）');
  const rot = attachmentRotation(poseDeg);
  const sMat = uniformScale(scale);
  // 「握点落到原点」的平移：**武器模型单位，不乘 k** ⇒ 必须在 S(k) 右侧
  const gripMat = translation(-gripLocal[0], -gripLocal[1], -gripLocal[2]);
  const rs = mat4();
  mul(rs, rot, sMat);
  const rst = mat4();
  mul(rst, rs, gripMat);
  const t = translation(anchorLocal[0], anchorLocal[1], anchorLocal[2]);
  mul(out, t, rst);
  return out;
}

/**
 * 拳心（挂点骨局部）：取「主骨（权重最大者）＝挂点骨 且 权重 > 0.5」的顶点重心，
 * 经 `inv(restWorldV[handNode])` 换算进骨局部（装配期一次，禁逐帧）。
 * @param restWorldV 绑定姿势（rest）的骨世界矩阵（列主序 16 浮点）
 * @param jointIndexInSkin 挂点骨在 `model.jointNodes` 里的下标
 */
export function fistCenterLocalOf(
  mesh: Character3DMeshData,
  restWorldV: Mat4,
  jointIndexInSkin: number,
): { center: [number, number, number]; vertexCount: number } {
  const inv = mat4();
  invertAffine(inv, restWorldV);
  const { positions, jointIndices, weights, vertexCount } = mesh;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < vertexCount; i++) {
    let bi = -1;
    let bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = weights[i * 4 + k];
      if (w > bw) {
        bw = w;
        bi = jointIndices[i * 4 + k];
      }
    }
    if (bi !== jointIndexInSkin || bw < 0.5) continue;
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    sx += inv[0] * x + inv[4] * y + inv[8] * z + inv[12];
    sy += inv[1] * x + inv[5] * y + inv[9] * z + inv[13];
    sz += inv[2] * x + inv[6] * y + inv[10] * z + inv[14];
    n++;
  }
  if (n === 0) failWeapon('拳心顶点集为空（挂点骨权重>0.5 无顶点）——禁静默空挂');
  return { center: [sx / n, sy / n, sz / n], vertexCount: n };
}

/** 装配期标定：由结构化参数（真源）合成 M 与锚点（派生物）。 */
export function calibrateWeaponAttachment(
  attach: Pick<CharacterAttachmentProfile, 'gripLocal' | 'lenRatio' | 'poseDeg' | 'offsetLocal'>,
  charHeightModel: number,
  fistCenterLocal: readonly [number, number, number],
  fistVertexCount: number,
): WeaponAttachmentCalibration {
  const grip = attach.gripLocal;
  const len = attach.lenRatio;
  const pose = attach.poseDeg;
  if (!grip || grip.length !== 3) failWeapon('缺 gripLocal（W9：握点逐资产必填，禁写死常数）');
  if (len === undefined || !(len > 0)) failWeapon('lenRatio 非法: ' + String(len));
  if (!pose) failWeapon('缺 poseDeg（W3：三轴姿态必填）');
  const off = attach.offsetLocal ?? [0, 0, 0];
  if (!(charHeightModel > 0)) failWeapon('charHeight 必须为正（实得 ' + charHeightModel + '）');
  const anchorLocal: [number, number, number] = [
    fistCenterLocal[0] + off[0] * charHeightModel,
    fistCenterLocal[1] + off[1] * charHeightModel,
    fistCenterLocal[2] + off[2] * charHeightModel,
  ];
  const scale = len * charHeightModel;
  const localMatrix = composeAttachmentMatrix(anchorLocal, scale, grip, pose);
  return {
    localMatrix,
    anchorLocal,
    charHeightModel,
    scale,
    fistCenterLocal,
    fistVertexCount,
  };
}

/**
 * W5 分段：按**三角形重心 Y** 与「离柄头端比例」段界切 4 段，输出重排索引 + 段区间。
 * 顶点零复制（同一 VBO）；段内顺序保持源顺序（不改 winding）。
 * @param boundaries 段界比例（离柄头端）＝ [剑首|柄, 柄|护手, 护手|剑身]，默认 [0.06, 0.20, 0.27]
 */
export function splitWeaponSegments(
  mesh: Pick<Character3DMeshData, 'positions' | 'indices' | 'vertexCount' | 'indexComponentType'>,
  boundaries: readonly number[] = [0.06, 0.2, 0.27],
): WeaponSegments {
  if (boundaries.length !== 3) failWeapon('段界必须是 3 个比例（4 段）');
  const { positions, indices } = mesh;
  const triCount = Math.floor(indices.length / 3);
  if (triCount * 3 !== indices.length) failWeapon('索引数 ' + indices.length + ' 不是 3 的倍数');
  // 局部 Y 范围（几何自带；本剑 [0, 0.99927]）
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const y = positions[i * 3 + 1];
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const span = hi - lo;
  if (!(span > 0)) failWeapon('几何 Y 跨度为 0，无法分段');
  const cuts = boundaries.map((b) => lo + b * span);
  // pommel | grip | guard | blade（离柄头端越近越靠前）
  // ⚠ 每个桶按**索引个数**分配（3×三角数）：按三角数分配会让越界写入被静默丢弃 ⇒ 输出出现 0 三角
  const bucket: Uint32Array[] = [
    new Uint32Array(triCount * 3),
    new Uint32Array(triCount * 3),
    new Uint32Array(triCount * 3),
    new Uint32Array(triCount * 3),
  ];
  const counts = [0, 0, 0, 0];
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3];
    const b = indices[t * 3 + 1];
    const c = indices[t * 3 + 2];
    const cy = (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3;
    const seg = cy < cuts[0] ? 3 /* pommel */ : cy < cuts[1] ? 2 /* grip */ : cy < cuts[2] ? 1 /* guard */ : 0 /* blade */;
    const arr = bucket[seg];
    arr[counts[seg] * 3] = a;
    arr[counts[seg] * 3 + 1] = b;
    arr[counts[seg] * 3 + 2] = c;
    counts[seg]++;
  }
  // 按 blade → guard → grip → pommel 排布（= WEAPON_SEGMENT_KEYS 顺序，与换色绘制顺序一致）
  const total = counts[0] + counts[1] + counts[2] + counts[3];
  const out = new Uint32Array(total * 3);
  const order: WeaponSegmentKey[] = ['blade', 'guard', 'grip', 'pommel'];
  const bucketOf: Record<WeaponSegmentKey, number> = { blade: 0, guard: 1, grip: 2, pommel: 3 };
  const ranges = {} as Record<WeaponSegmentKey, { start: number; count: number }>;
  let cursor = 0;
  for (const key of order) {
    const bi = bucketOf[key];
    const n = counts[bi];
    out.set(bucket[bi].subarray(0, n * 3), cursor * 3);
    ranges[key] = { start: cursor * 3, count: n * 3 };
    cursor += n;
  }
  if (cursor !== total) failWeapon('分段丢三角（' + cursor + ' != ' + total + '）');
  return { indices: out, ranges, indexComponentType: mesh.indexComponentType };
}

/** 顶点交错（16 float/顶点；joints/weights 恒 0——武器不走蒙皮，占位只为与角色同一套上传/布局代码）。
 * 兼容既有 `buildVertexInterleave` 的语义（pos3/nrm3/uv2/joints4/weights4）。 */
export function buildWeaponVertexInterleave(
  mesh: Pick<Character3DMeshData, 'positions' | 'normals' | 'uvs' | 'vertexCount'>,
): Float32Array {
  const n = mesh.vertexCount;
  const out = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    out[o] = mesh.positions[i * 3];
    out[o + 1] = mesh.positions[i * 3 + 1];
    out[o + 2] = mesh.positions[i * 3 + 2];
    out[o + 3] = mesh.normals[i * 3];
    out[o + 4] = mesh.normals[i * 3 + 1];
    out[o + 5] = mesh.normals[i * 3 + 2];
    out[o + 6] = mesh.uvs[i * 2];
    out[o + 7] = mesh.uvs[i * 2 + 1];
    // out[8..15] = joints/weights = 0（武器不蒙皮）
  }
  return out;
}

/** `#RRGGBB` → 线性空间 RGB（与 shader 内 srgbToLinear 同式；供 uTint 上传）。 */
export function parseTintLinear(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) failWeapon('染色值必须是 #RRGGBB（实得 ' + hex + '）');
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** 四段染色（缺省全白 = 原贴图观感 ⇒ 合批 1 draw；有非白段 ⇒ 4 draw）。
 * @returns null = 全白（走合批）；否则按 WEAPON_SEGMENT_KEYS 顺序的线性 RGB 数组 */
export function tintSegmentsLinear(
  tints: CharacterAttachmentProfile['tints'] | undefined,
): Float32Array[] | null {
  if (!tints) return null;
  const all = ['blade', 'guard', 'grip', 'pommel'] as const;
  const anyNonWhite = all.some((k) => tints[k].toLowerCase() !== '#ffffff');
  if (!anyNonWhite) return null;
  return all.map((k) => Float32Array.from(parseTintLinear(tints[k])));
}
