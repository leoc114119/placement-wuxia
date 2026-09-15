// T31-FE-A · ui/character3d/math 用例（纯函数；六向口径与色彩管线）
//
// 覆盖方案 §4.2（六向 yaw 派生）与 §7（sRGB→线性→sRGB、光照模型）以及摆放矩阵的
// 「顺序 / 轴 / 不缩放 z」三条实测标定（probe README 踩坑 1）。

import { describe, expect, it } from 'vitest';
import * as math from '../ui/character3d/math';
import {
  HERO_3D_SOURCE_VIEW_YAW_DEG,
  normalizeSignedDeg,
  yawDegForFacing,
} from '../config/character-3d';
import type { BattleFacingHex } from '../types';

const FACINGS: BattleFacingHex[] = ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown'];

describe('六向（方案 §4.2）', () => {
  it('源视角表是方案表的逐字值', () => {
    expect(HERO_3D_SOURCE_VIEW_YAW_DEG).toEqual({
      right: 270,
      rightdown: 225,
      rightup: 315,
      left: 90,
      leftdown: 135,
      leftup: 45,
    });
  });

  it('yaw = normalizeSigned(sourceViewYaw − 180) 逐向对上（T31 FE 朝向整改后口径）', () => {
    expect(FACINGS.map(yawDegForFacing)).toEqual([90, 135, -135, -90, -45, 45]);
    expect(yawDegForFacing('right')).toBe(90);
    expect(yawDegForFacing('rightdown')).toBe(45);
    expect(yawDegForFacing('rightup')).toBe(135);
    expect(yawDegForFacing('left')).toBe(-90);
    expect(yawDegForFacing('leftdown')).toBe(-45);
    expect(yawDegForFacing('leftup')).toBe(-135);
  });

  it('★ 六向语义锁（朝向整改的回归门）：把前向向量转出来验「屏幕左右 / 朝不朝观众」', () => {
    // 基准（实测得出，见 config 注释）：相机在 +Z 看 −Z；模型自身前向 = (0,0,1)；
    // 故 F(θ) = R_y(θ)·(0,0,1) = (sinθ, 0, cosθ)，屏幕 x 向右、z 越大越靠相机。
    const forwardOf = (deg: number): { x: number; z: number } => {
      const r = (deg * Math.PI) / 180;
      return { x: Math.sin(r), z: Math.cos(r) };
    };
    /** 期望：fx 符号 = 屏幕左右（−/+）；fz 符号 = 背向/朝向观众（−/+）。 */
    const EXPECT: Record<BattleFacingHex, { sx: 1 | -1 | 0; sz: 1 | -1 | 0 }> = {
      right: { sx: 1, sz: 0 },
      rightdown: { sx: 1, sz: 1 },
      rightup: { sx: 1, sz: -1 },
      left: { sx: -1, sz: 0 },
      leftdown: { sx: -1, sz: 1 },
      leftup: { sx: -1, sz: -1 },
    };
    for (const facing of FACINGS) {
      const f = forwardOf(yawDegForFacing(facing));
      const e = EXPECT[facing];
      const sx = Math.abs(f.x) < 1e-9 ? 0 : f.x > 0 ? 1 : -1;
      const sz = Math.abs(f.z) < 1e-9 ? 0 : f.z > 0 ? 1 : -1;
      expect(sx, `${facing} 屏幕左右`).toBe(e.sx);
      expect(sz, `${facing} 朝向观众/背向`).toBe(e.sz);
    }
    // left* 全在屏幕左、right* 全在屏幕右（防左右不成镜像的历史缺陷复发）
    for (const facing of FACINGS) {
      const f = forwardOf(yawDegForFacing(facing));
      expect(Math.sign(f.x), facing).toBe(facing.startsWith('left') ? -1 : 1);
    }
    // 旧口径必须被明确拒绝（反射式换算：right 会渲成正面）
    const legacy = (v: number): number => { let d = (270 - v) % 360; if (d > 180) d -= 360; else if (d <= -180) d += 360; return d; };
    expect(legacy(HERO_3D_SOURCE_VIEW_YAW_DEG.right)).toBe(0);
    expect(yawDegForFacing('right')).not.toBe(legacy(HERO_3D_SOURCE_VIEW_YAW_DEG.right));
  });

  it('normalizeSignedDeg 保留 +180（不作为 -180）', () => {
    expect(normalizeSignedDeg(180)).toBe(180);
    expect(normalizeSignedDeg(-180)).toBe(180);
    expect(normalizeSignedDeg(225)).toBe(-135);
    expect(normalizeSignedDeg(540)).toBe(180);
    expect(normalizeSignedDeg(-45)).toBe(-45);
  });

  it('quatFromYawDeg 是单位四元数，且 0° 与 360° 等价、-135° 与 225° 等价', () => {
    const q0 = math.quatFromYawDeg(new Float32Array(4), 0);
    expect(Array.from(q0)).toEqual([0, 0, 0, 1]);
    for (const deg of [0, 45, -135, 180, 315, -200]) {
      const q = math.quatFromYawDeg(new Float32Array(4), deg);
      expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 6);
    }
    const a = math.quatFromYawDeg(new Float32Array(4), 0);
    const b = math.quatFromYawDeg(new Float32Array(4), 360);
    const c = math.quatFromYawDeg(new Float32Array(4), -135);
    const d = math.quatFromYawDeg(new Float32Array(4), 225);
    // 四元数双覆盖：q 与 -q 表示同一旋转（b/c/d 恰为负号形式）；
    // sin(π) 的 1.2e-16 残差按 1e-7 容差处理（Float32 存储后仍是可忽略量级）
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(b[i])).toBeCloseTo(Math.abs(a[i]), 7);
      expect(Math.abs(c[i])).toBeCloseTo(Math.abs(d[i]), 7);
    }
  });
});

describe('摆放矩阵（方案 §4.1）', () => {
  it('placementYaw 把旋转施加在**模型空间**（先转模型、再走 placement 的 y 翻转）', () => {
    const m = math.placementYaw(math.mat4(), 100, 200, 10, 90);
    const out = math.xformPoint(new Float32Array(3), m, 1, 0, 0);
    // rotY(90)·(1,0,0) = (0,0,-1) ⇒ placement 后 x=centerX、y=feetY、z 保持（z 不缩放）
    expect(out[0]).toBeCloseTo(100, 5);
    expect(out[1]).toBeCloseTo(200, 5);
    expect(out[2]).toBeCloseTo(-1, 6);
  });

  it('z 不乘像素级 scale（否则会被近/远平面裁成「丝带」）', () => {
    const m = math.placementYaw(math.mat4(), 0, 0, 900, 0);
    const deep = math.xformPoint(new Float32Array(3), m, 0, 0, 0.16);
    expect(deep[2]).toBeCloseTo(0.16, 6);
    // x/y 是像素级
    const wide = math.xformPoint(new Float32Array(3), m, 0.3, 1, 0);
    expect(Math.abs(wide[0])).toBeGreaterThan(100);
  });

  it('placementYawSquash 只压 Y（死亡压扁仍落原格）', () => {
    const m = math.placementYawSquash(math.mat4(), 50, 300, 120, 0, 0.5);
    const head = math.xformPoint(new Float32Array(3), m, 0, 1, 0);
    expect(head[1]).toBeCloseTo(300 - 0.5 * 120, 5);
    expect(head[0]).toBeCloseTo(50, 5);
    const m2 = math.placementYawSquash(math.mat4(), 50, 300, 120, 0, 1);
    const head2 = math.xformPoint(new Float32Array(3), m2, 0, 1, 0);
    expect(head2[1]).toBeCloseTo(300 - 120, 5);
  });

  it('y=0（脚底）恒落在 feetY：脚底锚就是 feetY', () => {
    for (const yaw of [0, 45, 135, 180, -135]) {
      const m = math.placementYaw(math.mat4(), 77, 333, 123.2, yaw);
      const feet = math.xformPoint(new Float32Array(3), m, 0, 0, 0);
      expect(feet[0]).toBeCloseTo(77, 4);
      expect(feet[1]).toBeCloseTo(333, 4);
    }
  });
});

describe('色彩管线（方案 §7）', () => {
  it('sRGB ↔ 线性互为逆（往返误差 < 1e-6；pow(2.4) 往返本身有 ~3e-8 的浮点残差）', () => {
    for (const v of [0, 0.001, 0.04045, 0.2, 0.5, 0.9, 1]) {
      expect(math.linearToSrgb(math.srgbToLinear(v))).toBeCloseTo(v, 6);
      expect(math.srgbToLinear(math.linearToSrgb(v))).toBeCloseTo(v, 6);
    }
  });

  it('sRGB→线性在暗部走线性段（不是 2.2 幂近似）', () => {
    expect(math.srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 12);
    expect(math.srgbToLinear(0.5)).toBeCloseTo(Math.pow((0.5 + 0.055) / 1.055, 2.4), 12);
  });

  it('RECIPROCAL_PI 与 three r160 的常量同值（观感台口径）', () => {
    expect(math.RECIPROCAL_PI).toBe(0.3183098861837907);
    expect(math.RECIPROCAL_PI).toBeCloseTo(1 / Math.PI, 15);
  });

  it('漫反射照度：N∥L 取满光照、N⊥L 只吃环境光（公式 (ambient + dir·ndl)/π）', () => {
    const l = [-0.4, 0.85, 1] as const;
    const full = math.diffuseLightFactor(l[0], l[1], l[2], l[0], l[1], l[2], 2.15, 1.15);
    expect(full).toBeCloseTo((2.15 + 1.15) / Math.PI, 12);
    const back = math.diffuseLightFactor(-l[0], -l[1], -l[2], l[0], l[1], l[2], 2.15, 1.15);
    expect(back).toBeCloseTo(2.15 / Math.PI, 12);
    const side = math.diffuseLightFactor(0, 0, 1, 1, 0, 0, 2.15, 1.15);
    expect(side).toBeCloseTo(2.15 / Math.PI, 12); // N·L = 0
  });

  it('归一化三维向量：零向量给确定值 [0,0,1]（不让光照被零向量吃掉）', () => {
    const out = math.normalize3(new Float32Array(3), 0, 0, 0);
    expect(Array.from(out)).toEqual([0, 0, 1]);
    const n = math.normalize3(new Float32Array(3), 0, 3, 4);
    expect(n[1]).toBeCloseTo(0.6, 6);
    expect(n[2]).toBeCloseTo(0.8, 6);
  });
});

describe('正交投影（方案 §4.1）', () => {
  it('像素空间 → NDC：x_ndc = 2x/W - 1，y_ndc = 1 - 2y/H', () => {
    const W = 375;
    const H = 667;
    const m = math.orthoPixel(math.mat4(), W, H, 4);
    const leftTop = math.xformPoint(new Float32Array(3), m, 0, 0, 0);
    expect(leftTop[0]).toBeCloseTo(-1, 6);
    expect(leftTop[1]).toBeCloseTo(1, 6);
    const rightBottom = math.xformPoint(new Float32Array(3), m, W, H, 0);
    expect(rightBottom[0]).toBeCloseTo(1, 6);
    expect(rightBottom[1]).toBeCloseTo(-1, 6);
    const center = math.xformPoint(new Float32Array(3), m, W / 2, H / 2, 0);
    expect(center[0]).toBeCloseTo(0, 6);
    expect(center[1]).toBeCloseTo(0, 6);
  });

  it('深度：世界 z 越大越靠近相机，映射到更小的 NDC z（LEQUAL 近者胜）；zHalf 缺省 = 4', () => {
    const m = math.orthoPixel(math.mat4(), 100, 100, 4);
    const near = math.xformPoint(new Float32Array(3), m, 0, 0, 0.16);
    const far = math.xformPoint(new Float32Array(3), m, 0, 0, -0.16);
    expect(near[2]).toBeLessThan(far[2]); // 近者 NDC z 更小 ⇒ LEQUAL 下胜出
    expect(near[2]).toBeCloseTo(-0.04, 6);
    expect(far[2]).toBeCloseTo(0.04, 6);
    expect(near[2]).toBeGreaterThanOrEqual(-1);
    expect(far[2]).toBeLessThanOrEqual(1);
    expect(math.orthoPixel(math.mat4(), 100, 100, 4)).toEqual(math.orthoPixel(math.mat4(), 100, 100, 0));
  });
});
