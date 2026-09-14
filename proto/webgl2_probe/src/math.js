// src/math.js —— 最小 4x4 矩阵 / 四元数 / 统计工具（S0 只有这里用得到的公式）
//
// 约定（与 tools/glb2d/render.mjs 同口径，该口径已被 2D 输出链路逐帧验证过）：
//   · mat4 一律 **列主序** Float32Array(16)，下标 m[col*4+row]，与 glTF / WebGL 一致。
//   · mul(a,b) 语义 = 先施加 b、再施加 a（即 a·b）。
//   · TRS 合成顺序 = T · R · S（glTF 规范）。
// 模块形态：UMD（见 README「模块形态」）。微信端走 CommonJS，浏览器端挂 globalThis.PWProbe。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.PWProbe = root.PWProbe || {}; root.PWProbe.math = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function mat4() { return new Float32Array(16); }

  function identity(out) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }

  /** out = a · b（先 b 后 a）。out 可与 a/b 同引用。 */
  function mul(out, a, b) {
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
  function fromTRS(out, t, q, s) {
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
   * 深度：z 越大越靠近相机（深度测试 LEQUAL 即"近者胜"）。zHalf = 深度半程（世界单位），
   * ★ 必须覆盖模型的 z 跨度：placement 的 z **不缩放**（模型 z ≈ ±0.16），若把 z 也乘上
   *   像素级 scale（900+），顶点会落到裁剪体之外被**近/远平面裁掉**，
   *   整块网格只剩中间一薄片 ⇒ 渲染成"丝带"（T31 实测踩过）。
   */
  function orthoPixel(out, w, h, zHalf) {
    const zh = zHalf || 4;
    out[0] = 2 / w; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = -2 / h; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = -1 / zh; out[11] = 0;
    out[12] = -1; out[13] = 1; out[14] = 0; out[15] = 1;
    return out;
  }

  /**
   * 单位摆放矩阵：把模型（y 向上、脚底 y≈0）放进像素空间的一个格子里。
   * · 模型 y 向上、屏幕 y 向下 ⇒ 需要一次 y 翻转（winding 因此反转，故渲染端关闭背面剔除）。
   * · ★ z **不乘 scale**：见 orthoPixel 注释（乘了会被深度裁剪成薄片）。
   *   代价：跨单位的 z 不再可比 —— S0 的网格摆放本身不重叠，Y 轴遮挡排序不在 S0 范围。
   */
  function placement(out, centerX, feetY, scale) {
    out[0] = scale; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = -scale; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = centerX; out[13] = feetY; out[14] = 0; out[15] = 1;
    return out;
  }

  /** 单位四元数 nlerp：q = nlerp(qa, qb, k)。qa/qb 为扁平数组的 [off, off+4) 区间。 */
  function nlerp(out, qa, oa, qb, ob, k) {
    let d = qa[oa] * qb[ob] + qa[oa + 1] * qb[ob + 1] + qa[oa + 2] * qb[ob + 2] + qa[oa + 3] * qb[ob + 3];
    const s = d < 0 ? -1 : 1;
    const x = qa[oa] * k + qb[ob] * (1 - k) * s;
    const y = qa[oa + 1] * k + qb[ob + 1] * (1 - k) * s;
    const z = qa[oa + 2] * k + qb[ob + 2] * (1 - k) * s;
    const w = qa[oa + 3] * k + qb[ob + 3] * (1 - k) * s;
    const L = Math.hypot(x, y, z, w) || 1;
    out[0] = x / L; out[1] = y / L; out[2] = z / L; out[3] = w / L;
    return out;
  }

  /** 把 4x4 矩阵变换后的齐次点写进 out3（只做投影/摆放，不做蒙皮）。 */
  function xformPoint(out3, m, x, y, z) {
    out3[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out3[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out3[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return out3;
  }

  // ---------- 统计（A2 指标；口径见 README「指标定义」） ----------

  function sortAsc(nums) { return nums.slice().sort((a, b) => a - b); }

  /** 最近秩百分位：p ∈ (0,1]。 */
  function percentile(sorted, p) {
    if (!sorted.length) return NaN;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx];
  }

  function mean(nums) {
    if (!nums.length) return NaN;
    let s = 0;
    for (let i = 0; i < nums.length; i++) s += nums[i];
    return s / nums.length;
  }

  /** 1% low：最差的 ceil(n*0.01) 帧的平均帧时 → 取倒数的等效 FPS。 */
  function onePercentLowFps(sortedFrameMs) {
    if (!sortedFrameMs.length) return NaN;
    const n = Math.max(1, Math.ceil(sortedFrameMs.length * 0.01));
    let s = 0;
    for (let i = 0; i < n; i++) s += sortedFrameMs[sortedFrameMs.length - 1 - i];
    return 1000 / (s / n);
  }

  function ratioOver(sorted, limit) {
    if (!sorted.length) return NaN;
    let i = sorted.length;
    while (i > 0 && sorted[i - 1] > limit) i--;
    return (sorted.length - i) / sorted.length;
  }

  /** 语义版本比较：'2.24.0' vs '2.9.1' → 1（禁字符串字典序）。非法输入返回 null。 */
  function compareSemver(a, b) {
    const pa = parseSemver(a), pb = parseSemver(b);
    if (!pa || !pb) return null;
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
    }
    return 0;
  }

  function parseSemver(v) {
    if (typeof v !== 'string') return null;
    const m = /^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v);
    if (!m) return null;
    return [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
  }

  /** 稳定短哈希（deviceHash / nonce 用）。FNV-1a 32bit → base36。 */
  function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  return {
    mat4: mat4, identity: identity, mul: mul, fromTRS: fromTRS,
    orthoPixel: orthoPixel, placement: placement, nlerp: nlerp, xformPoint: xformPoint,
    sortAsc: sortAsc, percentile: percentile, mean: mean,
    onePercentLowFps: onePercentLowFps, ratioOver: ratioOver,
    compareSemver: compareSemver, hash32: hash32,
  };
});
