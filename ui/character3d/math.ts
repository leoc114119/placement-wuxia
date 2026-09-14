// T31-FE-A · ui/character3d/math.ts —— mat4 / quat / TRS 最小内核
//
// 算法来源：`proto/webgl2_probe/src/math.js`（S0 已验实现）**收编为有类型版本**。
// 对拍：tests/character3d-probe-parity.test.ts 用 probe 件逐算子比对（同输入逐位一致）。
// 口径（与 tools/glb2d/render.mjs 同源，已被 2D 出帧链路逐帧验证）：
//   · mat4 一律**列主序** Float32Array(16)，下标 m[col*4+row]，与 glTF / WebGL 一致；
//   · mul(a,b) 语义 = 先施加 b、再施加 a（即 a·b）；
//   · TRS 合成顺序 = T · R · S（glTF 规范）。
//
// 收编范围 = **渲染热路径**用到的算子（identity/mul/fromTRS/orthoPixel/placement/nlerp/xformPoint）。
// probe 里的统计/semver/hash32 属 A2 指标口径，不进生产运行时，故不迁（对拍脚本按同一清单逐算子比对）。
// 性能约定：所有算子写显式 out 参数、热路径零分配（probe 实测口径：subarray 进循环会每帧产生数千临时对象）。

/** 4x4 矩阵**只读视图**（列主序；长度 ≥16 的数值数组——Float32Array / Float64Array / 普通数组皆可）。
 * 用视图类型而非 Float32Array 是必需的：IBM 来自 GLB 解析（Float64Array），姿态缓冲是 Float32Array，
 * 两边的 mul 必须是同一份实现（否则对拍只能对一半）。 */
export type Mat4 = ArrayLike<number>;
/** 四元数 [x, y, z, w]（只读视图）。 */
export type Quat = ArrayLike<number>;
/** 三维向量（只读视图）。 */
export type Vec3 = ArrayLike<number>;
/** 可写入的 4x4 目标（TypedArray，能按下标赋值）。 */
export type Mat4Out = Float32Array | Float64Array;
/** 可写入的四元数目标。 */
export type QuatOut = Float32Array | Float64Array;
/** 可写入的三维目标。 */
export type Vec3Out = Float32Array | Float64Array;

/** 圆周率倒数：与 three r160 `RECIPROCAL_PI`（0.3183098861837907）同值，
 * 用于复现已认可观感台的 BRDF_Lambert（见 config/character-3d 的 CHARACTER_3D_LIGHT）。 */
export const RECIPROCAL_PI = 0.3183098861837907;

export function mat4(): Float32Array {
  return new Float32Array(16);
}

export function quat(): Float32Array {
  return new Float32Array(4);
}

export function vec3(): Float32Array {
  return new Float32Array(3);
}

export function identity(out: Mat4Out): Mat4Out {
  out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

/** out = a · b（先 b 后 a）。out 可与 a/b 同引用。 */
export function mul(out: Mat4Out, a: Mat4, b: Mat4): Mat4Out {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4]     = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }
  return out;
}

/** out = T(t) · R(q) · S(s)，q = [x,y,z,w]。 */
export function fromTRS(out: Mat4Out, t: ArrayLike<number>, q: ArrayLike<number>, s: ArrayLike<number>): Mat4Out {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const sx = s[0], sy = s[1], sz = s[2];
  out[0] = (1 - (yy + zz)) * sx; out[1] = (xy + wz) * sx; out[2] = (xz - wy) * sx; out[3] = 0;
  out[4] = (xy - wz) * sy; out[5] = (1 - (xx + zz)) * sy; out[6] = (yz + wx) * sy; out[7] = 0;
  out[8] = (xz + wy) * sz; out[9] = (yz - wx) * sz; out[10] = (1 - (xx + yy)) * sz; out[11] = 0;
  out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1;
  return out;
}

/**
 * 像素空间正交投影：世界坐标 (x∈[0,W], y∈[0,H]，y 轴向下) → 裁剪空间。
 * 深度：z 越大越靠近相机（深度测试 LEQUAL 即「近者胜」）。zHalf = 深度半程（世界单位）。
 * ★ 必须覆盖模型的 z 跨度：placement 的 z **不缩放**（模型 z ≈ ±0.16），若把 z 也乘上
 *   像素级 scale（900+），顶点会落到裁剪体之外被近/远平面裁掉，整块网格只剩中间一薄片
 *   ⇒ 渲染成「丝带」（T31 S0 实测踩过）。默认 4 见 CHARACTER_3D_ORTHO_Z_HALF。
 */
export function orthoPixel(out: Mat4Out, w: number, h: number, zHalf: number): Mat4Out {
  const zh = zHalf > 0 ? zHalf : 4;
  out[0] = 2 / w; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = -2 / h; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = -1 / zh; out[11] = 0;
  out[12] = -1; out[13] = 1; out[14] = 0; out[15] = 1;
  return out;
}

/**
 * 单位摆放矩阵：把模型（y 向上、脚底 y≈0）放进像素空间的一个格子里。
 * · 模型 y 向上、屏幕 y 向下 ⇒ 需要一次 y 翻转（winding 因此反转，故渲染端关闭背面剔除）。
 * · ★ z **不乘 scale**：见 orthoPixel 注释。
 */
export function placement(out: Mat4Out, centerX: number, feetY: number, scale: number): Mat4Out {
  out[0] = scale; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = -scale; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
  out[12] = centerX; out[13] = feetY; out[14] = 0; out[15] = 1;
  return out;
}

/**
 * 单位四元数 nlerp：q = nlerp(qa, qb, k)。qa/qb 为扁平数组的 [off, off+4) 区间。
 * ★ 权重方向：k=1 ⇒ 取 qa（= 原样返回），k=0 ⇒ 取 qb。对趾（dot<0）时翻转一侧，避免走长弧。
 *   时间域调用**必须**按「t=0→i0、t=1→i1」传 k=1−a（见 animation 的采样点）；
 *   本函数只做加权与归一，不承担时间极性的语义（arch seq=414：区间内倒播属缺陷，已在下游修正）。
 */
export function nlerp(
  out: QuatOut,
  qa: ArrayLike<number>, oa: number,
  qb: ArrayLike<number>, ob: number,
  k: number,
): QuatOut {
  const d = qa[oa] * qb[ob] + qa[oa + 1] * qb[ob + 1] + qa[oa + 2] * qb[ob + 2] + qa[oa + 3] * qb[ob + 3];
  const s = d < 0 ? -1 : 1;
  const x = qa[oa] * k + qb[ob] * (1 - k) * s;
  const y = qa[oa + 1] * k + qb[ob + 1] * (1 - k) * s;
  const z = qa[oa + 2] * k + qb[ob + 2] * (1 - k) * s;
  const w = qa[oa + 3] * k + qb[ob + 3] * (1 - k) * s;
  const L = Math.hypot(x, y, z, w) || 1;
  out[0] = x / L; out[1] = y / L; out[2] = z / L; out[3] = w / L;
  return out;
}

/** 扁平四元数 nlerp（取 a/b 的 [off, off+4) 区间），归一到 out。 */
export function nlerpQ(out: QuatOut, a: ArrayLike<number>, aOff: number, b: ArrayLike<number>, bOff: number, k: number): QuatOut {
  return nlerp(out, a, aOff, b, bOff, k);
}

/** 把 4x4 矩阵变换后的齐次点写进 out3（只做投影/摆放，不做蒙皮）。 */
export function xformPoint(out3: Vec3Out, m: Mat4, x: number, y: number, z: number): Vec3Out {
  out3[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out3[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out3[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out3;
}

// ---------- 六向朝向（方案 §4.2）----------

/** 绕 Y 轴旋转 deg 度的四元数（右手、+Y 向上；q = [0, sin, 0, cos]）。 */
export function quatFromYawDeg(out: QuatOut, deg: number): QuatOut {
  const half = (deg * Math.PI) / 360;
  out[0] = 0; out[1] = Math.sin(half); out[2] = 0; out[3] = Math.cos(half);
  return out;
}

/** 单位摆放矩阵 = placement(中心/脚底/缩放) · rotY(yawDeg)。
 * 旋转在**模型空间**先施加（旋模型自身），再走 placement 的 y 翻转与像素缩放——
 * 顺序反了会让旋转轴跟着翻转（人物绕水平轴翻倒）。
 * 方案 §4.2：运行时相机固定正交，单位绕 Y 轴旋转承担六向，禁镜像/负 scale。 */
export function placementYaw(
  out: Mat4Out,
  centerX: number,
  feetY: number,
  scale: number,
  yawDeg: number,
): Mat4Out {
  const rot = scratchRot;
  quatFromYawDeg(scratchQuat, yawDeg);
  scratchT[0] = 0; scratchT[1] = 0; scratchT[2] = 0;
  scratchS[0] = 1; scratchS[1] = 1; scratchS[2] = 1;
  fromTRS(rot, scratchT, scratchQuat, scratchS);
  placement(out, centerX, feetY, scale);
  return mul(out, out, rot);
}

/** 单位摆放矩阵（含 Y 向压扁：死亡压扁/落地缓冲，方案 §5 dead 行）。squashY<1 = 压扁。 */
export function placementYawSquash(
  out: Mat4Out,
  centerX: number,
  feetY: number,
  scale: number,
  yawDeg: number,
  squashY: number,
): Mat4Out {
  const rot = scratchRot2;
  quatFromYawDeg(scratchQuat2, yawDeg);
  scratchT2[0] = 0; scratchT2[1] = 0; scratchT2[2] = 0;
  scratchS2[0] = 1; scratchS2[1] = squashY; scratchS2[2] = 1;
  fromTRS(rot, scratchT2, scratchQuat2, scratchS2);
  placement(out, centerX, feetY, scale);
  return mul(out, out, rot);
}

// 模块级 scratch：摆放矩阵每帧每单位调用一次，避免热路径分配。
// ⚠ 非重入：placementYaw/placementYawSquash 之间禁嵌套调用（本文件内无嵌套）。
const scratchRot = mat4();
const scratchRot2 = mat4();
const scratchQuat = quat();
const scratchQuat2 = quat();
const scratchT = new Float32Array(3);
const scratchT2 = new Float32Array(3);
const scratchS = new Float32Array(3);
const scratchS2 = new Float32Array(3);

// ---------- 色彩空间（方案 §7：sRGB 采样 → 线性光照 → sRGB 输出）----------

/** sRGB 传输函数 → 线性（IEC 61966-2-1 精确分段式，非 2.2 近似）。 */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 线性 → sRGB 传输函数。 */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** 逐通道 sRGB→线性（原地写 out）。 */
export function srgbToLinearRgb(out: Float32Array, rgb: ArrayLike<number>): Float32Array {
  out[0] = srgbToLinear(rgb[0]);
  out[1] = srgbToLinear(rgb[1]);
  out[2] = srgbToLinear(rgb[2]);
  return out;
}

/** 逐通道线性→sRGB（原地写 out）。 */
export function linearToSrgbRgb(out: Float32Array, rgb: ArrayLike<number>): Float32Array {
  out[0] = linearToSrgb(rgb[0]);
  out[1] = linearToSrgb(rgb[1]);
  out[2] = linearToSrgb(rgb[2]);
  return out;
}

/** 归一化三维向量（写回同一数组）。零向量返回 [0,0,1]（与 GLSL normalize 的退化约定不同，
 * 这里显式给一个确定值，避免 0 向量把光照整个吃掉）。 */
export function normalize3(out: Float32Array, x: number, y: number, z: number): Float32Array {
  const L = Math.hypot(x, y, z);
  if (L < 1e-12) {
    out[0] = 0; out[1] = 0; out[2] = 1;
    return out;
  }
  out[0] = x / L; out[1] = y / L; out[2] = z / L;
  return out;
}

/**
 * 单点漫反射照度（CPU 侧同源实现，供测试与外观回归锁定；GPU 侧见 renderer 的 GLSL）。
 * `linear = albedo · (ambient + directional · max(N·L, 0)) / π`
 * 观感台口径见 config/character-3d 的 CHARACTER_3D_LIGHT 注释。
 */
export function diffuseLightFactor(
  nx: number, ny: number, nz: number,
  lx: number, ly: number, lz: number,
  ambient: number, directional: number,
): number {
  // 走双精度：这是**参照实现**（对照 GPU 与锁定外观回归），Float32 中间量会带进 ~1e-7 噪声
  const nL = Math.hypot(nx, ny, nz) || 1;
  const lL = Math.hypot(lx, ly, lz) || 1;
  const ndl = Math.max(
    (nx / nL) * (lx / lL) + (ny / nL) * (ly / lL) + (nz / nL) * (lz / lL),
    0,
  );
  return (ambient + directional * ndl) * RECIPROCAL_PI;
}
