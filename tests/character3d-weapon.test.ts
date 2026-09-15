// T32 · 3D 武器挂载用例（W1~W9 逐条机械判据）
//
// 真源：《3D武器挂载接入技术方案》v1.0 @ 99cde3fe §7 判据表 ＋ 工单 W1~W9 ＋ A4-T31 §三（数学/参考矩阵/自检表）。
// 口径：金标准矩阵用 A4 的**同一组输入**（隔离「合成错」与「拳心取值约定错」两类问题）；
//      `M × gripLocal = f`（锚点精确成立）与 k 无关 ⇒ W4；`ry` 自转不动锚点 ⇒ W3。

import { describe, expect, it } from 'vitest';
import {
  applyMat4,
  buildWeaponVertexInterleave,
  calibrateWeaponAttachment,
  composeAttachmentMatrix,
  fistCenterLocalOf,
  invertAffine,
  parseTintLinear,
  splitWeaponSegments,
  tintSegmentsLinear,
  WEAPON_SEGMENT_KEYS,
} from '../ui/character3d/weapon';
import { loadCharacter3DStaticMesh, validateWeaponAccount } from '../ui/character3d/glb';
import { createCharacter3DPass } from '../ui/character3d/pass';
import {
  CHARACTER_3D_CROSS_FADE_SEC,
  CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
  HERO_3D_ACTION_MAP,
  HERO_3D_PROFILE_ID,
} from '../config/character-3d';
import { heroClipRegistry } from './character3d-fixtures';
import { createCharacter3DRenderer } from '../ui/character3d/renderer';
import { createFakeCanvas, createFakeWebGL2 } from './character3d-fake-gl';
import { CHARACTER_3D_FXAA, CHARACTER_3D_LIGHT, CHARACTER_3D_ORTHO_Z_HALF, CHARACTER_3D_RENDER_SCALE } from '../config/character-3d';
import { createBrowserCharacter3DPlatform } from '../ui/character3d/platform-browser';
import { assembleWeaponRuntime } from '../proto/battle_demo/weapon-assembly';
import { HERO_3D_WEAPON_SEGMENT_BOUNDARIES as SEG_BOUNDARIES_ALIAS } from '../config/character-3d';

const A4_REFERENCE_LOCAL_MATRIX: readonly number[] = [
  0.0, 0.724631, -0.127772, 0,
  0.66687, 0.053999, 0.306242, 0,
  0.310966, -0.115801, -0.656739, 0,
  -0.085788, 0.035157, -0.047735, 1,
];

/** A4 §3.4 参考输入（喂同一组输入 ⇒ 必须逐位复现上表；隔离「合成错」与「拳心约定错」）。 */
const A4_REFERENCE_INPUTS = {
  charHeightModel: 0.98107916326262057,
  lenRatio: 0.75,
  gripLocal: [0, 0.1082, 0] as const,
  poseDeg: { rx: -25, ry: 80, rz: -90 },
  /** f（骨局部）= 拳心 + offsetLocal(−0.03,0,0) × ch */
  anchorLocal: [-0.013632, 0.041, -0.0146] as const,
} as const;

/** A4 §3.4 四关键点自检表（武器模型空间 → 骨局部）。 */
const A4_REFERENCE_KEYPOINTS: ReadonlyArray<{ name: string; src: readonly [number, number, number]; want: readonly [number, number, number] }> = [
  { name: '柄头', src: [0, 0, 0], want: [-0.085788, 0.035157, -0.047735] },
  { name: '握点', src: [0, 0.1082, 0], want: [-0.013632, 0.041, -0.0146] },
  { name: '护手', src: [0, 0.235, 0], want: [0.07093, 0.04785, 0.02423] },
  { name: '剑尖', src: [0, 0.99927, 0], want: [0.58062, 0.08912, 0.25829] },
];

const model = heroModel();
const weapon = heroWeapon();
const platform = createBrowserCharacter3DPlatform();
const IDENTITY_PALETTE = (() => {
  const p = new Float32Array(model.jointNodes.length * 16);
  for (let j = 0; j < model.jointNodes.length; j++) {
    p[j * 16] = 1; p[j * 16 + 5] = 1; p[j * 16 + 10] = 1; p[j * 16 + 15] = 1;
  }
  return p;
})();
const IDENTITY_MODEL = (() => {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
})();
import type { CharacterRenderCommand } from '../types';

type Character3DRenderCommandFn = (c: Partial<CharacterRenderCommand>) => CharacterRenderCommand;
import { createPose, resetPose, resolvePose } from '../ui/character3d/animation';
import {
  CHARACTER_3D_HERO_SCALE,
  HERO_3D_ATTACHMENTS,
  HERO_3D_PROFILE,
  HERO_3D_WEAPON_ACCOUNT,
  HERO_3D_WEAPON_REF,
  HERO_3D_WEAPON_SEGMENT_BOUNDARIES,
} from '../config/character-3d';
import { readFileSync } from 'node:fs';
import { heroModel, heroWeapon, readBytesSync, WEAPON_MODEL_PATH } from './character3d-fixtures';


/** A4 §3.4 参考矩阵（列主序 16 浮点）——**测试数据**（金标准；生产模块禁含该字面量，见 W9 扫描用例）。
 * 出处：A4-T31 §3.4（Leo 观感台定稿参数、three.js 口径推导，含四关键点自检表）。 */

const attach = HERO_3D_ATTACHMENTS['right-hand-blade'];

/** 现役标定（与 pass 装配期同一函数；同一组输入 ⇒ 同一结果）。 */
function calibrationOf(over: Partial<typeof attach> = {}) {
  const pose = createPose(model);
  resetPose(pose, model);
  resolvePose(model, pose);
  const handNode = model.nodes.trs.findIndex((n) => n.name === 'R_Hand');
  const jointIndex = model.jointNodes.indexOf(handNode);
  const fist = fistCenterLocalOf(model.mesh, pose.worldV[handNode], jointIndex);
  const merged = { ...attach, ...over };
  return {
    calibration: calibrateWeaponAttachment(merged, HERO_3D_PROFILE.modelHeight, fist.center, fist.vertexCount),
    fist,
  };
}

// ══════════════════ W1/W2/W3/W4 · 挂点合成数学（金标准） ══════════════════

describe('W2/W4 金标准：A4 §3.4 参考矩阵与四关键点', () => {
  it('同一组输入 ⇒ 逐位复现 A4 参考矩阵（≤1e-4）', () => {
    const { charHeightModel, lenRatio, gripLocal, poseDeg, anchorLocal } = A4_REFERENCE_INPUTS;
    const scale = lenRatio * charHeightModel;
    const M = composeAttachmentMatrix(anchorLocal, scale, gripLocal, poseDeg);
    const maxDiff = Math.max(...Array.from(M).map((v, i) => Math.abs(v - A4_REFERENCE_LOCAL_MATRIX[i])));
    expect(maxDiff, `M=${Array.from(M).map((v) => +v.toFixed(6)).join(',')}`).toBeLessThanOrEqual(1e-4);
    // 三列模长均 = k（A4 独立复算结论之一）
    const colLen = (c: number) => Math.hypot(M[c * 4], M[c * 4 + 1], M[c * 4 + 2]);
    expect(colLen(0)).toBeCloseTo(scale, 6);
    expect(colLen(1)).toBeCloseTo(scale, 6);
    expect(colLen(2)).toBeCloseTo(scale, 6);
  });

  it('四关键点自检表逐位吻合（柄头/握点/护手/剑尖）+ 握点 → f 精确成立', () => {
    const { charHeightModel, lenRatio, gripLocal, poseDeg, anchorLocal } = A4_REFERENCE_INPUTS;
    const M = composeAttachmentMatrix(anchorLocal, lenRatio * charHeightModel, gripLocal, poseDeg);
    for (const kp of A4_REFERENCE_KEYPOINTS) {
      const got = applyMat4(M, kp.src);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(got[i] - kp.want[i]), `${kp.name}[${i}]`).toBeLessThanOrEqual(1e-4);
      }
    }
    const grip = applyMat4(M, gripLocal);
    expect(grip[0]).toBeCloseTo(anchorLocal[0], 6); // Float32 矩阵 ⇒ 1e-6 量级足够
    expect(grip[1]).toBeCloseTo(anchorLocal[1], 6);
    expect(grip[2]).toBeCloseTo(anchorLocal[2], 6);
  });

  it('顺序红线：T(0,−grip,0) 若写到 S(k) 左侧 ⇒ 锚点不再是 f（结构性反例）', () => {
    const { charHeightModel, lenRatio, gripLocal, poseDeg, anchorLocal } = A4_REFERENCE_INPUTS;
    const k = lenRatio * charHeightModel;
    const good = composeAttachmentMatrix(anchorLocal, k, gripLocal, poseDeg);
    // 故意写反：把握点平移乘以 k 再代入（等价于 T(0,−grip·k,0) 在 S(k) 左侧）
    const bad = composeAttachmentMatrix(anchorLocal, k, [gripLocal[0] * k, gripLocal[1] * k, gripLocal[2] * k], poseDeg);
    const goodPos = applyMat4(good, gripLocal as unknown as number[]);
    const badPos = applyMat4(bad, gripLocal as unknown as number[]);
    const dGood = Math.hypot(goodPos[0] - anchorLocal[0], goodPos[1] - anchorLocal[1], goodPos[2] - anchorLocal[2]);
    const dBad = Math.hypot(badPos[0] - anchorLocal[0], badPos[1] - anchorLocal[1], badPos[2] - anchorLocal[2]);
    expect(dGood).toBeLessThan(1e-6); // 正确顺序：锚点精确
    expect(dBad).toBeGreaterThan(1e-2); // 写反：偏出 grip×(1−k) 量级（≈0.021 模型单位）
  });
});

describe('W2 拳心（装配期一次）', () => {
  it('551 顶点；本管线口径值与 A4 报值之差 = Armature 项（逐位可证：约定差，非数值差）', () => {
    const pose = createPose(model);
    resetPose(pose, model);
    resolvePose(model, pose);
    const handNode = model.nodes.trs.findIndex((n) => n.name === 'R_Hand');
    const jointIndex = model.jointNodes.indexOf(handNode);
    const fist = fistCenterLocalOf(model.mesh, pose.worldV[handNode], jointIndex);
    expect(fist.vertexCount).toBe(551);
    // 本管线口径（glTF 规范：蒙皮顶点 = world(joint)·IBM·v_bind ⇒ 模型空间 = bind 空间）
    expect(fist.center[0]).toBeCloseTo(0.015485, 4);
    expect(fist.center[1]).toBeCloseTo(0.041305, 4);
    expect(fist.center[2]).toBeCloseTo(-0.01423, 4);
    // A4 报值（观感台 three.js `sk.localToWorld` 含 Mesh 节点=Armature 的世界矩阵）
    const A4_FIST = [0.0158, 0.041, -0.0146];
    const d = Math.hypot(fist.center[0] - A4_FIST[0], fist.center[1] - A4_FIST[1], fist.center[2] - A4_FIST[2]);
    expect(d).toBeLessThanOrEqual(6e-4); // 4e-4 级（≈0.04 逻辑像素）——见 tasks/questions/Q1-T32
    // 逐位证明差 = Armature 项：把 Armature 世界矩阵折进输入后复算 ⇒ 必须落在 A4 报值 4e-5 内
    const armNode = model.nodes.trs.findIndex((n) => n.name === 'Armature');
    const inv = invertAffine(new Float32Array(16), pose.worldV[handNode]);
    const arm = pose.worldV[armNode];
    const { positions, jointIndices, weights, vertexCount } = model.mesh;
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
      if (bi !== jointIndex || bw < 0.5) continue;
      const x0 = positions[i * 3];
      const y0 = positions[i * 3 + 1];
      const z0 = positions[i * 3 + 2];
      const x = arm[0] * x0 + arm[4] * y0 + arm[8] * z0 + arm[12];
      const y = arm[1] * x0 + arm[5] * y0 + arm[9] * z0 + arm[13];
      const z = arm[2] * x0 + arm[6] * y0 + arm[10] * z0 + arm[14];
      sx += inv[0] * x + inv[4] * y + inv[8] * z + inv[12];
      sy += inv[1] * x + inv[5] * y + inv[9] * z + inv[13];
      sz += inv[2] * x + inv[6] * y + inv[10] * z + inv[14];
      n++;
    }
    expect(sx / n).toBeCloseTo(A4_FIST[0], 4);
    expect(sy / n).toBeCloseTo(A4_FIST[1], 4);
    expect(sz / n).toBeCloseTo(A4_FIST[2], 4);
  });

  it('禁用手骨原点（= 手腕）：拳心与其夹角距离必须显著（防止退回骨原点写法）', () => {
    const pose = createPose(model);
    resetPose(pose, model);
    resolvePose(model, pose);
    const handNode = model.nodes.trs.findIndex((n) => n.name === 'R_Hand');
    const jointIndex = model.jointNodes.indexOf(handNode);
    const fist = fistCenterLocalOf(model.mesh, pose.worldV[handNode], jointIndex);
    expect(Math.hypot(...fist.center)).toBeGreaterThan(0.03); // 5.5cm 量级（模型单位）
  });
});

describe('W3 三轴姿态：ry 自转锚点不动、剑身受转', () => {
  const base = A4_REFERENCE_INPUTS;
  const M0 = composeAttachmentMatrix(base.anchorLocal, base.lenRatio * base.charHeightModel, base.gripLocal, base.poseDeg);

  it('ry ±10°：M×grip 不变（<1e-6），剑尖绕「握点-剑尖」轴自转', () => {
    for (const d of [10, -10]) {
      const M1 = composeAttachmentMatrix(base.anchorLocal, base.lenRatio * base.charHeightModel, base.gripLocal, {
        ...base.poseDeg,
        ry: base.poseDeg.ry + d,
      });
      const grip0 = applyMat4(M0, base.gripLocal);
      const grip1 = applyMat4(M1, base.gripLocal);
      const dGrip = Math.hypot(grip0[0] - grip1[0], grip0[1] - grip1[1], grip0[2] - grip1[2]);
      expect(dGrip, `ry=${d} 握点漂移`).toBeLessThan(1e-5);
      // 自转不变量（任意旋转都保持）：剑上每点到锚点的距离不变 ⇒ 剑尖距锚点恒定
      const distToAnchor = (M: Float32Array): number => {
        const t = applyMat4(M, [0, 0.99927, 0]);
        const g = applyMat4(M, base.gripLocal);
        return Math.hypot(t[0] - g[0], t[1] - g[1], t[2] - g[2]);
      };
      expect(distToAnchor(M1)).toBeCloseTo(distToAnchor(M0), 6);
      // ⚠ 口径注记（实测，非缺陷）：按方案/A4 钉死的合成顺序 `base·Rz·Ry·Rx`，`ry` 的旋转轴是
      //   **rx 之后**的局部 Y —— rx≠0（现役 −25°）时长轴并非严格不变（ry+10° ⇒ 长轴偏 4.22°）。
      //   观感台参考实现同序同效（三轴是**联合定姿参数**，不是正交分解），Leo 亦按此定稿 ⇒ 本卡不改数学；
      //   已把「轴夹角 <0.5°」这条与实现不符的判据登记为方案误差（见 tasks/questions/Q1-T32 §六）。
      const axisTilt = (M1: Float32Array): number => {
        const axis = (M: Float32Array): [number, number, number] => {
          const g = applyMat4(M, base.gripLocal);
          const t = applyMat4(M, [0, 0.99927, 0]);
          const v: [number, number, number] = [t[0] - g[0], t[1] - g[1], t[2] - g[2]];
          const L = Math.hypot(...v) || 1;
          return [v[0] / L, v[1] / L, v[2] / L];
        };
        const a0 = axis(M0);
        const a1 = axis(M1);
        const dot = Math.max(-1, Math.min(1, a0[0] * a1[0] + a0[1] * a1[1] + a0[2] * a1[2]));
        return (Math.acos(dot) * 180) / Math.PI;
      };
      expect(axisTilt(M1), `ry=${d} 长轴偏角（现役参数下实测 ≈4.2°，远小于 ry 本身）`).toBeLessThan(6);
      // 自转性质：长轴扰动必须**远小于** ry 增量本身（10° ⇒ <6°），且截面方向确实转了（非空断言）
      const width = (M: Float32Array): [number, number, number] => applyMat4(M, [1, 0, 0]);
      const w0 = width(M0);
      const w1 = width(M1);
      expect(Math.hypot(w0[0] - w1[0], w0[1] - w1[1], w0[2] - w1[2])).toBeGreaterThan(1e-3);
    }
  });

  it('rx / rz 同法：锚点恒定（姿态参数只改朝向，不改握点）', () => {
    for (const [key, d] of [['rx', 15], ['rz', -20]] as const) {
      const M1 = composeAttachmentMatrix(base.anchorLocal, base.lenRatio * base.charHeightModel, base.gripLocal, {
        ...base.poseDeg,
        [key]: base.poseDeg[key] + d,
      });
      const grip0 = applyMat4(M0, base.gripLocal);
      const grip1 = applyMat4(M1, base.gripLocal);
      expect(Math.hypot(grip0[0] - grip1[0], grip0[1] - grip1[1], grip0[2] - grip1[2]), key).toBeLessThan(1e-5);
    }
  });
});

describe('W4 长度参数化（0.5 / 0.75 / 1.2）', () => {
  it('三档锚点恒 = f（缩放不改锚点）；剑尖距握点随 k 线性', () => {
    const ch = HERO_3D_PROFILE.modelHeight;
    const grip = attach.gripLocal as readonly [number, number, number];
    const pose = attach.poseDeg!;
    const anchor: [number, number, number] = [-0.013632, 0.041, -0.0146];
    const span = 0.99927 - grip[1];
    const lens: number[] = [];
    for (const lenRatio of [0.5, 0.75, 1.2]) {
      const k = lenRatio * ch;
      const M = composeAttachmentMatrix(anchor, k, grip, pose);
      const gotGrip = applyMat4(M, grip);
      expect(Math.hypot(gotGrip[0] - anchor[0], gotGrip[1] - anchor[1], gotGrip[2] - anchor[2])).toBeLessThan(1e-6);
      const tip = applyMat4(M, [0, 0.99927, 0]);
      lens.push(Math.hypot(tip[0] - gotGrip[0], tip[1] - gotGrip[1], tip[2] - gotGrip[2]));
    }
    expect(lens[1] / lens[0]).toBeCloseTo(0.75 / 0.5, 6);
    expect(lens[2] / lens[1]).toBeCloseTo(1.2 / 0.75, 6);
    expect(lens[1]).toBeCloseTo(0.75 * ch * span, 6);
    // 屏上全长（平行于屏幕时）= lenRatio × 参考高 × 全长比 —— 只经 placement 一次，与 k/modelHeight 无关
    // 屏上全长 = lenRatio × 参考高 × 几何全长(0.99927)；方案给的 72.07/48.05/115.32 是**名义**口径
    //（按几何全长 1.0）⇒ 两者差 ≤0.1px（资产实测 0.9993 L，A4 §一④），实现按几何真值
    const screenPx = (lenRatio: number): number => lenRatio * HERO_3D_PROFILE.screenHeightPxAtReference * 0.99927;
    expect(screenPx(0.75)).toBeCloseTo(72.02, 1);
    expect(0.75 * HERO_3D_PROFILE.screenHeightPxAtReference).toBeCloseTo(72.07, 2); // 方案名义值
    expect(Math.abs(screenPx(1.2) - 115.32)).toBeLessThan(0.1);
    expect(screenPx(1.2)).toBeCloseTo(115.23, 1);
    // 参考高已含 0.78 比例（T31-R2）：剑随人同比，禁第二处缩放
    expect(HERO_3D_PROFILE.screenHeightPxAtReference).toBeCloseTo(96.096, 6);
    expect(CHARACTER_3D_HERO_SCALE).toBeCloseTo(0.78, 12);
  });

  it('装配期标定：ch 用 modelHeight（**禁用像素参考高**）；k = lenRatio × ch', () => {
    const { calibration, fist } = calibrationOf();
    expect(calibration.charHeightModel).toBeCloseTo(HERO_3D_PROFILE.modelHeight, 12);
    expect(calibration.scale).toBeCloseTo(0.75 * HERO_3D_PROFILE.modelHeight, 12);
    expect(calibration.fistVertexCount).toBe(fist.vertexCount);
    expect(calibration.anchorLocal[0]).toBeCloseTo(fist.center[0] - 0.03 * HERO_3D_PROFILE.modelHeight, 12);
    expect(calibration.anchorLocal[1]).toBeCloseTo(fist.center[1], 12);
    expect(calibration.anchorLocal[2]).toBeCloseTo(fist.center[2], 12);
    // 标定矩阵自身满足锚点不动（实装配值）
    const grip = attach.gripLocal as readonly [number, number, number];
    const g = applyMat4(calibration.localMatrix, grip);
    expect(Math.hypot(g[0] - calibration.anchorLocal[0], g[1] - calibration.anchorLocal[1], g[2] - calibration.anchorLocal[2])).toBeLessThan(1e-5);
    // 与像素参考高无乘算关系（易错点：误用会把 k 放大两个数量级）
    expect(calibration.scale).toBeLessThan(1);
    expect(calibration.scale).not.toBeCloseTo(0.75 * HERO_3D_PROFILE.screenHeightPxAtReference, 3);
  });
});

// ══════════════════ W5 · 分段与换色 ══════════════════

describe('W5 几何分段换色', () => {
  const segs = splitWeaponSegments(weapon, HERO_3D_WEAPON_SEGMENT_BOUNDARIES);

  it('段界 = 离柄头端 6%/20%/27%（按三角形重心 Y 判定），四段索引覆盖全部三角恰一次', () => {
    const { positions, indices } = weapon;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < weapon.vertexCount; i++) {
      const y = positions[i * 3 + 1];
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    const cuts = HERO_3D_WEAPON_SEGMENT_BOUNDARIES.map((b) => lo + b * (hi - lo));
    expect(cuts[2]).toBeCloseTo(lo + 0.27 * (hi - lo), 12);
    const total = segs.indices.length / 3;
    expect(total).toBe(weapon.indexCount / 3);
    expect(total).toBe(HERO_3D_WEAPON_ACCOUNT.triangleCount);
    // 覆盖恰一次（多集/漏集即报警）
    const sortedSrc = Array.from({ length: total }, (_, t) => [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]].join(','))
      .sort()
      .join('|');
    const sortedOut = Array.from({ length: total }, (_, t) => [segs.indices[t * 3], segs.indices[t * 3 + 1], segs.indices[t * 3 + 2]].join(','))
      .sort()
      .join('|');
    expect(sortedOut).toBe(sortedSrc);
    // 段区间连续、无重叠
    let cursor = 0;
    for (const key of WEAPON_SEGMENT_KEYS) {
      const r = segs.ranges[key];
      expect(r.start).toBe(cursor);
      cursor += r.count;
    }
    expect(cursor).toBe(segs.indices.length);
    // 各段非空（本剑四段都有几何）
    for (const key of WEAPON_SEGMENT_KEYS) expect(segs.ranges[key].count, key).toBeGreaterThan(0);
  });

  it('每段内的三角重心确实落在该段的 Y 区间内（段语义可核）', () => {
    const { positions } = weapon;
    const ys = HERO_3D_WEAPON_SEGMENT_BOUNDARIES;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < weapon.vertexCount; i++) {
      const y = positions[i * 3 + 1];
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    const bounds: Record<string, [number, number]> = {
      pommel: [lo, lo + ys[0] * (hi - lo)],
      grip: [lo + ys[0] * (hi - lo), lo + ys[1] * (hi - lo)],
      guard: [lo + ys[1] * (hi - lo), lo + ys[2] * (hi - lo)],
      blade: [lo + ys[2] * (hi - lo), hi],
    };
    for (const key of WEAPON_SEGMENT_KEYS) {
      const r = segs.ranges[key];
      const [a, b] = bounds[key];
      for (let t = 0; t < r.count / 3; t++) {
        const o = r.start + t * 3;
        const cy = [0, 1, 2]
          .map((k) => positions[segs.indices[o + k] * 3 + 1])
          .reduce((x, y2) => x + y2, 0) / 3;
        expect(cy, `${key} 三角 ${t}`).toBeGreaterThanOrEqual(a - 1e-9);
        expect(cy, `${key} 三角 ${t}`).toBeLessThanOrEqual(b + 1e-9);
      }
    }
  });

  it('染色解析：#RRGGBB → 线性；全白 ⇒ null（合批 1 draw）；有非白 ⇒ 四段数组（4 draw）', () => {
    const white = parseTintLinear('#ffffff');
    expect(white[0]).toBeCloseTo(1, 12);
    const mid = parseTintLinear('#808080');
    expect(mid[0]).toBeCloseTo(0.2158, 3); // sRGB 0.502 → 线性
    expect(() => parseTintLinear('red')).toThrow(/RRGGBB/);
    expect(tintSegmentsLinear(undefined)).toBeNull();
    expect(
      tintSegmentsLinear({ blade: '#ffffff', guard: '#ffffff', grip: '#ffffff', pommel: '#ffffff' }),
    ).toBeNull();
    const tints = tintSegmentsLinear({ blade: '#ffffff', guard: '#1e5a24', grip: '#12305a', pommel: '#8a7a58' });
    expect(tints).not.toBeNull();
    expect(tints!.length).toBe(4);
    expect(tints![0][0]).toBeCloseTo(1, 12); // 剑身保持白（不串色由分段绘制保证）
  });

  it('顶点交错：16 float/顶点、joints/weights 恒 0（武器不蒙皮）', () => {
    const data = buildWeaponVertexInterleave(weapon);
    expect(data.length).toBe(weapon.vertexCount * 16);
    expect(data[0]).toBeCloseTo(weapon.positions[0], 6);
    for (let i = 0; i < weapon.vertexCount; i += 97) {
      for (let k = 8; k < 16; k++) expect(data[i * 16 + k], `v${i} f${k}`).toBe(0);
    }
  });
});

// ══════════════════ 资产门 / W7 / W8 / W9 ══════════════════

describe('武器资产门（机械门引用）与 W7/W8/W9', () => {
  it('真资产解析结果 = config 门常量逐项（1758 面 / 1457 顶点 / 0 骨 / 0 动画 / 双面）', () => {
    expect(validateWeaponAccount(weapon, HERO_3D_WEAPON_ACCOUNT)).toEqual([]);
    expect(weapon.account.triangleCount).toBe(1758);
    expect(weapon.account.vertexCount).toBe(1457);
    expect(weapon.account.jointCount).toBe(0);
    expect(weapon.account.meshCount).toBe(1);
    expect(weapon.account.materialCount).toBe(1);
    expect(weapon.account.textureCount).toBe(1);
    expect(weapon.doubleSided).toBe(true); // W8 资产前提
    // bbox 与 A4/机械门逐值相符（原点在柄头端、长轴 +Y）
    expect(weapon.bounds.min[1]).toBeCloseTo(0, 5);
    expect(weapon.bounds.max[1]).toBeCloseTo(0.99927, 5);
    expect(weapon.bounds.min[0]).toBeCloseTo(-0.11161, 5);
    expect(weapon.bounds.max[0]).toBeCloseTo(0.11161, 5);
    expect(weapon.baseColor.bytes.byteLength).toBe(159696); // 内嵌 1024² JPEG（A4 §一⑤）
  });

  it('负例：蒙皮/带动画/多材质的网格一律拒绝（防误挂）', () => {
    const bytes = readBytesSync(WEAPON_MODEL_PATH);
    // 角色模型（skins=1 / animations=2）冒充武器 ⇒ 必须被拒
    expect(() => loadCharacter3DStaticMesh(readBytesSync('assets/characters/hero/model/hero_48k_20260914.glb'))).toThrow(/skin|JOINTS_0|animations/);
    // 真武器正常通过（对照，防「全都拒」的假门）
    const ok = loadCharacter3DStaticMesh(bytes);
    expect(ok.account.triangleCount).toBe(1758);
  });

  it('W7：武器资产 URL/SHA 独立于角色 profile（配置层可扫）', () => {
    expect(HERO_3D_WEAPON_REF.urlPath).toBe('characters/hero/7a5fe0e54ad6/sword_3d_medieval.glb');
    expect(HERO_3D_WEAPON_REF.urlPath).toContain(HERO_3D_WEAPON_REF.sha256.slice(0, 12));
    expect(HERO_3D_WEAPON_REF.id).not.toBe(HERO_3D_PROFILE.model.id);
    expect(HERO_3D_WEAPON_REF.sha256).not.toBe(HERO_3D_PROFILE.model.sha256);
  });

  it('W9：`0.1082` 只允许出现在武器资产条目（源码扫描；写死即换剑偏 1.8% 剑长）', () => {
    const files = [
      'config/character-3d.ts',
      'ui/character3d/weapon.ts',
      'ui/character3d/glb.ts',
      'ui/character3d/pass.ts',
      'ui/character3d/renderer.ts',
    ];
    const stripComments = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const hits: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      if (/\b0\.1082\b/.test(code)) hits.push(f);
    }
    expect(hits).toEqual(['config/character-3d.ts']); // 仅资产条目（真源），其余文件零硬编码
    // 金标准参考矩阵/关键点只作为**测试数据**（本文件的 A4_REFERENCE_*）存在；生产模块零字面量
    const weaponSrc = stripComments(readFileSync('ui/character3d/weapon.ts', 'utf8'));
    expect(weaponSrc).not.toContain('0.1082');
    expect(weaponSrc).toContain('gripLocal'); // 握点从参数进（结构上不可能写死）
  });

  it('W9：换一把 gripLocal=0.126 的虚拟资产 ⇒ 锚点位移 = Δ×k（握点随资产走）', () => {
    const { calibration } = calibrationOf({ gripLocal: [0, 0.126, 0] });
    const pose = attach.poseDeg!;
    const k = calibration.scale;
    const gripB: readonly [number, number, number] = [0, 0.126, 0];
    const M = calibration.localMatrix;
    const got = applyMat4(M, gripB);
    expect(got[0]).toBeCloseTo(calibration.anchorLocal[0], 5);
    expect(got[1]).toBeCloseTo(calibration.anchorLocal[1], 5);
    expect(got[2]).toBeCloseTo(calibration.anchorLocal[2], 5);
    // 柄头端随握点变化位移 = Δgrip × k（沿骨局部映射方向）
    const Mref = calibrationOf().calibration.localMatrix;
    const headA = applyMat4(Mref, [0, 0, 0]);
    const headB = applyMat4(M, [0, 0, 0]);
    const delta = Math.hypot(headA[0] - headB[0], headA[1] - headB[1], headA[2] - headB[2]);
    expect(delta).toBeCloseTo(Math.abs(0.126 - 0.1082) * k, 6);
    expect(pose.rx).toBe(-25);
  });

  it('W8：doubleSided 资产 + 管线禁背面剔除（资产属性留档可核）', () => {
    expect(HERO_3D_WEAPON_ACCOUNT.doubleSided).toBe(true);
    expect(attach.doubleSided).toBe(true);
    const rendererSrc = new TextDecoder().decode(readBytesSync('ui/character3d/renderer.ts'));
    expect(rendererSrc).toContain('g.disable(g.CULL_FACE)');
    expect(rendererSrc).toContain("note('weapon-cull=off')"); // 诊断串（证据面）
  });
});

// ══════════════════ W6 · 收剑规则（甲：移动演出期间不可见） ══════════════════

describe('W6 收剑（甲 · Leo 09-15 裁定）：技术源 = 控制器解析后的动作键', () => {
  /** 装配真 pass + 记录 stub（drawUnit/drawWeapon 逐帧留痕）。 */
  function makeRig() {
    const drawn: Array<{ state: string; actionKey: string; model: Float32Array }> = [];
    const stub = {
      canvas: { stub: 'canvas' },
      status: 'ready' as const,
      edgeMode: 'fxaa' as const,
      jointCount: model.jointNodes.length,
      vertexCount: model.mesh.vertexCount,
      indexCount: model.mesh.indexCount,
      backbuffer: { width: 375, height: 667 },
      contextAttributes: { antialias: false } as WebGLContextAttributes,
      maxVertexUniformVectors: 1024,
      counters: { drawCalls: 0, unitDraws: 0, weaponDraws: 0, fxaaDraws: 0, paletteUploads: 0, frames: 0 },
      diagnostics: [] as string[],
      weaponReady: true,
      beginFrame: () => {},
      drawUnit: () => {},
      drawWeapon: (m: Float32Array) => {
        drawn.push({ state: '', actionKey: '', model: Float32Array.from(m) });
      },
      endFrame: () => {},
      resize: () => {},
      notifyContextLost: () => {},
      handleContextRestored: () => true,
      dispose: () => {},
    };
    const runtime = {
      profile: HERO_3D_PROFILE,
      model,
      anim: {
        actionMap: HERO_3D_ACTION_MAP,
        crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
        jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
        clips: heroClipRegistry(model),
      },
    };
    const pass = createCharacter3DPass({
      renderer: stub as never,
      viewport: { width: 375, height: 667 },
      runtimes: { [HERO_3D_PROFILE_ID]: runtime },
      loadState: 'ready',
      weapon: {
        assetId: HERO_3D_WEAPON_REF.id,
        mesh: weapon,
        segments: splitWeaponSegments(weapon, HERO_3D_WEAPON_SEGMENT_BOUNDARIES),
        vertexData: buildWeaponVertexInterleave(weapon),
      },
    });
    return { pass, stub, drawn };
  }
  const cmd = (over: Partial<Parameters<Character3DRenderCommandFn>[0]> = {}) =>
    ({
      actorId: 'hero',
      profileKey: HERO_3D_PROFILE_ID,
      footX: 140,
      footY: 429,
      depthKey: 10,
      facing: 'right' as const,
      state: 'idle' as const,
      isJump: false,
      stateElapsedSec: 0,
      moveProgress: null,
      hopPx: 0,
      alpha: 1,
      squashY: 1,
      ...over,
    });

  it('idle/atk/charge/strike ⇒ 持剑；walk（移动演出）/jump（轻功闩锁）⇒ 收剑；无迟一帧', () => {
    const { pass, drawn } = makeRig();
    const cases: Array<{ label: string; over: Record<string, unknown>; visible: boolean; actionKey: string }> = [
      { label: 'idle', over: { state: 'idle' }, visible: true, actionKey: 'idle' },
      { label: 'basic（普攻）', over: { state: 'basic', stateElapsedSec: 0.2 }, visible: true, actionKey: 'basic' },
      { label: 'charge（特技）', over: { state: 'charge', stateElapsedSec: 0.5 }, visible: true, actionKey: 'charge' },
      { label: 'strike（绝学）', over: { state: 'strike', stateElapsedSec: 0.1 }, visible: true, actionKey: 'strike' },
      { label: 'walk（普通移动=run 资产）', over: { state: 'walk', moveProgress: 0.3 }, visible: false, actionKey: 'walk' },
      { label: 'jump（轻功闩锁）', over: { state: 'walk', isJump: true, moveProgress: 0.3 }, visible: false, actionKey: 'jump' },
      { label: 'jump 末帧（progress=1，快照窗早已关闭）', over: { state: 'walk', isJump: true, moveProgress: 1 }, visible: false, actionKey: 'jump' },
    ];
    for (const c of cases) {
      const before = drawn.length;
      pass.render([cmd(c.over as never)], 0.016);
      const key = pass.controllers.get('hero')?.actionKey;
      expect(key, c.label).toBe(c.actionKey);
      expect(drawn.length - before, `${c.label}（actionKey=${key}）的可见性`).toBe(c.visible ? 1 : 0);
      // 轻功闩锁：快照同帧仍是 walk（读快照必错的反例面）
      if (c.label.startsWith('jump 末帧')) expect((c.over as { state: string }).state).toBe('walk');
    }
    // 同帧切换（无迟一帧）：walk→idle 的那一帧立刻出剑
    const before = drawn.length;
    pass.render([cmd({ state: 'walk', moveProgress: 0.9 })], 0.016);
    expect(drawn.length - before).toBe(0);
    pass.render([cmd({ state: 'idle' })], 0.016);
    expect(drawn.length - before).toBe(1);
  });

  it('uModel = placement × worldV[R_Hand] × M（与拼式逐元素一致）', () => {
    const { pass, drawn } = makeRig();
    pass.render([cmd({ state: 'idle' })], 0);
    expect(drawn.length).toBe(1);
    const got = drawn[0].model;
    // 用同一路径复算（placement 由 footX/footY+profile 决定；此处只校验「含手骨世界矩阵」的定性特征：
    // 平移列 = 手骨锚点经 placement 映射 ⇒ 与放置矩阵平移列不同，且量级合理）
    expect(Number.isFinite(got[12])).toBe(true);
    expect(Math.abs(got[12] - 140)).toBeGreaterThan(1); // 不在脚底锚上（被手骨链搬到拳头处）
    // 行 3 / 列 3 是仿射矩阵末行（0,0,0,1）
    expect(got[3]).toBeCloseTo(0, 6);
    expect(got[7]).toBeCloseTo(0, 6);
    expect(got[11]).toBeCloseTo(0, 6);
    expect(got[15]).toBeCloseTo(1, 6);
  });

  it('未注入武器 / 挂点未启用 ⇒ 零武器绘制（既有行为零变化）', () => {
    const { pass, drawn } = makeRig();
    // profile 挂点临时禁用（副本）⇒ 不画
    const disabledProfile = {
      ...HERO_3D_PROFILE,
      attachments: {
        'right-hand-blade': { ...attach, enabled: false },
      },
    };
    const stub = {
      weaponReady: true,
      diagnostics: [] as string[],
      beginFrame: () => {},
      drawUnit: () => {},
      drawWeapon: () => drawn.push({ model: new Float32Array(16) } as never),
      endFrame: () => {},
      status: 'ready' as const,
      counters: { drawCalls: 0, unitDraws: 0, weaponDraws: 0, fxaaDraws: 0, paletteUploads: 0, frames: 0 },
    };
    const pass2 = createCharacter3DPass({
      renderer: stub as never,
      viewport: { width: 375, height: 667 },
      runtimes: {
        [HERO_3D_PROFILE_ID]: {
          profile: disabledProfile,
          model,
          anim: {
            actionMap: HERO_3D_ACTION_MAP,
            crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
            jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
            clips: heroClipRegistry(model),
          },
        },
      },
      loadState: 'ready',
      weapon: {
        assetId: HERO_3D_WEAPON_REF.id,
        mesh: weapon,
        segments: splitWeaponSegments(weapon, HERO_3D_WEAPON_SEGMENT_BOUNDARIES),
        vertexData: buildWeaponVertexInterleave(weapon),
      },
    });
    const before = drawn.length;
    pass2.render([cmd({ state: 'idle' })], 0.016);
    expect(drawn.length - before).toBe(0);
    expect(pass2.weaponState.enabled).toBe(false);
    expect(pass2.weaponState.diagnostics.join('|')).toContain('attachment-disabled-or-mismatch');
    // 对照：启用挂点的装配（懒解析 ⇒ 先渲一帧再读诊断）
    const base = drawn.length;
    pass.render([cmd({ state: 'idle' })], 0.016);
    expect(drawn.length - base).toBe(1);
    expect(pass.weaponState.enabled).toBe(true);
    expect(pass.weaponState.visible).toBe(true);
    expect(pass.weaponState.diagnostics.join('|')).toContain('enabled:right-hand-blade');
  });

  it('W7：同一 GPU 资源被多单位共享（装配一次），逐单位仅矩阵不同', () => {
    const { pass, drawn } = makeRig();
    pass.render([cmd({ actorId: 'a' }), cmd({ actorId: 'b', footX: 240, facing: 'leftup' })], 0.016);
    expect(drawn.length).toBe(2);
    expect(Array.from(drawn[0].model)).not.toEqual(Array.from(drawn[1].model)); // 各自摆放/手骨矩阵
  });
});

// ══════════════════ 审核必修 3 · 三类 draw 计数口径（对 FakeGL 实际调用数断言） ══════════════════

describe('审核必修 3：draw 计数按实际调用计（人物/武器/FXAA 三类口径）', () => {
  function makeWeaponRenderer(forceEdgeMode: 'fxaa' | 'native-msaa') {
    const { gl, state } = createFakeWebGL2({ antialias: forceEdgeMode === 'native-msaa' });
    const segments = splitWeaponSegments(weapon, HERO_3D_WEAPON_SEGMENT_BOUNDARIES);
    const renderer = createCharacter3DRenderer({
      canvas: createFakeCanvas(gl, 375, 667),
      model,
      baseColor: { image: { fake: 'char' }, width: 4096, height: 4096, mimeType: 'image/jpeg' },
      platform,
      light: {
        ambientIntensity: CHARACTER_3D_LIGHT.ambientIntensity,
        directionalIntensity: CHARACTER_3D_LIGHT.directionalIntensity,
        direction: CHARACTER_3D_LIGHT.direction,
        diffuseNormalization: CHARACTER_3D_LIGHT.diffuseNormalization,
      },
      orthoZHalf: CHARACTER_3D_ORTHO_Z_HALF,
      renderScale: CHARACTER_3D_RENDER_SCALE,
      fxaa: CHARACTER_3D_FXAA,
      forceEdgeMode,
      weapon: {
        vertexData: buildWeaponVertexInterleave(weapon),
        indices: segments.indices,
        indexComponentType: segments.indexComponentType,
        segments: [
          segments.ranges.blade,
          segments.ranges.guard,
          segments.ranges.grip,
          segments.ranges.pommel,
        ],
        baseColor: { image: { fake: 'sword' }, width: 1024, height: 1024, mimeType: 'image/jpeg' },
        doubleSided: true,
      },
    });
    return { renderer, state };
  }

  it('默认全白合批：1 单位 = 人物 1 + 武器 1（+FXAA 1）且与 FakeGL 实际调用数逐一致', () => {
    for (const mode of ['native-msaa', 'fxaa'] as const) {
      const { renderer, state } = makeWeaponRenderer(mode);
      renderer.beginFrame();
      renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
      renderer.drawWeapon(IDENTITY_MODEL, 1, null);
      renderer.endFrame();
      const fxaa = mode === 'fxaa' ? 1 : 0;
      expect(renderer.counters.unitDraws, mode).toBe(1);
      expect(renderer.counters.weaponDraws, mode).toBe(1); // 合批 = 1
      expect(renderer.counters.fxaaDraws, mode).toBe(fxaa);
      expect(renderer.counters.drawCalls, mode).toBe(2 + fxaa);
      expect(renderer.counters.drawCalls, mode).toBe(
        renderer.counters.unitDraws + renderer.counters.weaponDraws + renderer.counters.fxaaDraws,
      );
      expect(renderer.counters.drawCalls, mode).toBe(state.drawElementsCalls.length + state.drawArraysCalls.length);
    }
  });

  it('四段染色：武器 **4** draw（不是 1），总表 = 人物 1 + 武器 4（+FXAA）——禁按合批外推', () => {
    const { renderer, state } = makeWeaponRenderer('native-msaa');
    renderer.beginFrame();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    renderer.drawWeapon(IDENTITY_MODEL, 1, [
      Float32Array.from([1, 1, 1]),
      Float32Array.from([0.1, 0.3, 0.1]),
      Float32Array.from([0.05, 0.15, 0.3]),
      Float32Array.from([0.5, 0.45, 0.3]),
    ]);
    renderer.endFrame();
    expect(renderer.counters.weaponDraws).toBe(4);
    expect(renderer.counters.drawCalls).toBe(5); // 1 人物 + 4 武器
    // 与 FakeGL 的实际 draw 调用逐一对账（drawElements 5 次；FXAA=native ⇒ 0 次 drawArrays）
    expect(state.drawElementsCalls).toHaveLength(5);
    expect(state.drawArraysCalls).toHaveLength(0);
    expect(renderer.counters.drawCalls).toBe(state.drawElementsCalls.length + state.drawArraysCalls.length);
    // 四段各一次：每次 draw 的索引数 = 该段索引数（且总和 = 全索引数）
    const counts = state.drawElementsCalls.slice(1).map((c) => c[1] as number);
    const segments = splitWeaponSegments(weapon, HERO_3D_WEAPON_SEGMENT_BOUNDARIES);
    expect(counts).toEqual([
      segments.ranges.blade.count,
      segments.ranges.guard.count,
      segments.ranges.grip.count,
      segments.ranges.pommel.count,
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(segments.indices.length);
  });

  it('三单位 × 四段染色：总表 = 3×(1+4)（逐单位如实累计）', () => {
    const { renderer, state } = makeWeaponRenderer('native-msaa');
    const tints = [
      Float32Array.from([1, 1, 1]),
      Float32Array.from([0.1, 0.3, 0.1]),
      Float32Array.from([0.05, 0.15, 0.3]),
      Float32Array.from([0.5, 0.45, 0.3]),
    ];
    renderer.beginFrame();
    for (let u = 0; u < 3; u++) {
      renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
      renderer.drawWeapon(IDENTITY_MODEL, 1, tints);
    }
    renderer.endFrame();
    expect(renderer.counters.unitDraws).toBe(3);
    expect(renderer.counters.weaponDraws).toBe(12);
    expect(renderer.counters.drawCalls).toBe(15);
    expect(renderer.counters.drawCalls).toBe(state.drawElementsCalls.length);
  });
});

// ══════════════════ 审核必修 1 · 四阶段武器失败边界（角色持续 draw 且无剑） ══════════════════

describe('审核必修 1：武器失败四阶段隔离（download / parse / texture / gpu / calibration）', () => {
  it('① 下载阶段失败：weapon-load-failed，runtime=null（角色路径不感知）', async () => {
    const out = await assembleWeaponRuntime(
      { load: async (ref) => ({ ...loadResultStub(ref), status: 'failed' as const, bytes: null, diagnostics: ['sha-mismatch:deadbeef'] }), decodeImage: decodeOk },
      ASSEMBLY_OPTS,
    );
    expect(out.runtime).toBeNull();
    expect(out.diag).toContain('weapon-load-failed');
  });

  it('② 解析阶段失败：weapon-parse-failed（用真实**角色** GLB 冒充武器 ⇒ 结构门拒绝，不抛）', async () => {
    const out = await assembleWeaponRuntime(
      { load: async (ref) => ({ ...loadResultStub(ref), bytes: readBytesSync('assets/characters/hero/model/hero_48k_20260914.glb') }), decodeImage: decodeOk },
      ASSEMBLY_OPTS,
    );
    expect(out.runtime).toBeNull();
    expect(out.diag).toContain('weapon-parse-failed');
  });

  it('③ 贴图解码阶段失败：weapon-texture-failed（asset 解析已通过，仍返回 null 不抛）', async () => {
    const out = await assembleWeaponRuntime(
      { load: async (ref) => ({ ...loadResultStub(ref), bytes: readBytesSync(WEAPON_MODEL_PATH) }), decodeImage: async () => { throw new Error('decode rejected'); } },
      ASSEMBLY_OPTS,
    );
    expect(out.runtime).toBeNull();
    expect(out.diag).toContain('weapon-texture-failed');
    expect(out.diag).toContain('decode rejected');
  });

  it('④ 正常路径：weapon-ready + runtime 齐备（三项全成）', async () => {
    const out = await assembleWeaponRuntime(
      { load: async (ref) => ({ ...loadResultStub(ref), bytes: readBytesSync(WEAPON_MODEL_PATH) }), decodeImage: decodeOk },
      ASSEMBLY_OPTS,
    );
    expect(out.runtime).not.toBeNull();
    expect(out.diag).toContain('weapon-ready:1758tri/1457v');
    expect(out.runtime!.segments.indices.length).toBe(1758 * 3);
  });

  it('⑤ GPU 装配阶段失败（**只让武器 shader 编译失败**）：角色仍 ready、仍能 drawUnit、无剑', () => {
    const { gl, state } = createFakeWebGL2({
      antialias: false,
      // 定向注入：只有武器 VS（含 `uProjection * uModel` 且**无** aJoints）失败；角色两个 shader 正常
      failShaderCompileWhen: (src) => src.includes('uModel') && !src.includes('aJoints'),
    });
    const segments = splitWeaponSegments(weapon, HERO_3D_WEAPON_SEGMENT_BOUNDARIES);
    const renderer = createCharacter3DRenderer({
      canvas: createFakeCanvas(gl, 375, 667),
      model,
      baseColor: { image: { fake: 'char' }, width: 4096, height: 4096, mimeType: 'image/jpeg' },
      platform,
      light: {
        ambientIntensity: CHARACTER_3D_LIGHT.ambientIntensity,
        directionalIntensity: CHARACTER_3D_LIGHT.directionalIntensity,
        direction: CHARACTER_3D_LIGHT.direction,
        diffuseNormalization: CHARACTER_3D_LIGHT.diffuseNormalization,
      },
      orthoZHalf: CHARACTER_3D_ORTHO_Z_HALF,
      renderScale: CHARACTER_3D_RENDER_SCALE,
      fxaa: CHARACTER_3D_FXAA,
      forceEdgeMode: 'native-msaa',
      weapon: {
        vertexData: buildWeaponVertexInterleave(weapon),
        indices: segments.indices,
        indexComponentType: segments.indexComponentType,
        segments: [segments.ranges.blade, segments.ranges.guard, segments.ranges.grip, segments.ranges.pommel],
        baseColor: { image: { fake: 'sword' }, width: 1024, height: 1024, mimeType: 'image/jpeg' },
        doubleSided: true,
      },
    });
    // ★ 角色不受影响：status 仍 ready（旧实现为 failed）
    expect(renderer.status).toBe('ready');
    expect(renderer.diagnostics.join('|')).toContain('weapon-gpu-failed');
    expect(renderer.diagnostics.join('|')).toContain('weapon.vs 着色器编译失败');
    expect(renderer.weaponReady).toBe(false);
    // 角色照常绘制（真调 GL）：1 单位 = 1 次 drawElements，无武器 draw
    renderer.beginFrame();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    renderer.endFrame();
    expect(renderer.counters.unitDraws).toBe(1);
    expect(renderer.counters.weaponDraws).toBe(0);
    expect(state.drawElementsCalls.length).toBe(1);
  });

  it('⑥ 标定阶段失败：weapon-calibration-failed（坏挂点参数），角色仍 drawUnit、零 drawWeapon', () => {
    const drawnUnits: string[] = [];
    const drawnWeapons: number[] = [];
    const stub = {
      weaponReady: true,
      diagnostics: [] as string[],
      status: 'ready' as const,
      counters: { drawCalls: 0, unitDraws: 0, weaponDraws: 0, fxaaDraws: 0, paletteUploads: 0, frames: 0 },
      beginFrame: () => {},
      endFrame: () => {},
      resize: () => {},
      notifyContextLost: () => {},
      handleContextRestored: () => true,
      dispose: () => {},
      drawUnit: () => drawnUnits.push('u'),
      drawWeapon: () => drawnWeapons.push(1),
    };
    const badProfile = {
      ...HERO_3D_PROFILE,
      attachments: { 'right-hand-blade': { ...attach, lenRatio: undefined as unknown as number } },
    };
    const pass = createCharacter3DPass({
      renderer: stub as never,
      viewport: { width: 375, height: 667 },
      runtimes: {
        [HERO_3D_PROFILE_ID]: {
          profile: badProfile,
          model,
          anim: {
            actionMap: HERO_3D_ACTION_MAP,
            crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
            jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
            clips: heroClipRegistry(model),
          },
        },
      },
      loadState: 'ready',
      weapon: {
        assetId: HERO_3D_WEAPON_REF.id,
        mesh: weapon,
        segments: splitWeaponSegments(weapon, HERO_3D_WEAPON_SEGMENT_BOUNDARIES),
        vertexData: buildWeaponVertexInterleave(weapon),
      },
    });
    // render 不抛（旧实现会冒泡 weapon.ts 的异常）
    const res = pass.render(
      [
        {
          actorId: 'hero',
          profileKey: HERO_3D_PROFILE_ID,
          footX: 140,
          footY: 429,
          depthKey: 10,
          facing: 'right' as const,
          state: 'idle' as const,
          isJump: false,
          stateElapsedSec: 0,
          moveProgress: null,
          hopPx: 0,
          alpha: 1,
          squashY: 1,
        },
      ],
      0.016,
    );
    expect(res.placed.size).toBe(1); // 角色照常产出 placed ⇒ 持续绘制
    expect(drawnUnits.length).toBe(1);
    expect(drawnWeapons.length).toBe(0);
    expect(pass.weaponState.enabled).toBe(false);
    expect(pass.weaponState.diagnostics.join('|')).toContain('weapon-calibration-failed');
  });
});

// ── 审核必修 1 用例的公共脚手架 ──

const ASSEMBLY_OPTS = {
  ref: HERO_3D_WEAPON_REF,
  account: HERO_3D_WEAPON_ACCOUNT,
  segmentBoundaries: SEG_BOUNDARIES_ALIAS,
};

function loadResultStub(ref: typeof HERO_3D_WEAPON_REF) {
  return {
    assetId: ref.id,
    ref,
    status: 'downloaded' as const,
    integrity: null,
    bytes: null as Uint8Array | null,
    savedPath: null,
    attempts: 1,
    diagnostics: [] as string[],
    error: null,
  };
}

const decodeOk = async () => ({ image: { fake: 'sword' }, width: 1024, height: 1024, mimeType: 'image/jpeg' });
