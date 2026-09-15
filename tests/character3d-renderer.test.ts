// T31-FE-A · 渲染器用例（方案 §7 / §9.1 renderer 条）
//
// 用假 WebGL2 上下文验**分支决策与提交次数**（真机像素质量由 card C 的 runtime smoke 门）：
//   每 actor 一次 palette / 一次 draw；20u=20/20；resize 后 backbuffer 与 DPR；
//   context lost/restore；native-MSAA / FXAA 两分支；premultiplied alpha 无黑边。

import { describe, expect, it } from 'vitest';
import {
  CHARACTER3D_SHADER_SOURCES,
  createCharacter3DRenderer,
  type Character3DRenderer,
} from '../ui/character3d/renderer';
import type { PlatformDecodedImage } from '../ui/character3d/platform';
import {
  CHARACTER_3D_FXAA,
  CHARACTER_3D_LIGHT,
  CHARACTER_3D_ORTHO_Z_HALF,
  CHARACTER_3D_RENDER_SCALE,
  yawDegForFacing,
} from '../config/character-3d';
import type { CharacterRenderCommand } from '../types';
import { heroModel } from './character3d-fixtures';
import { createFakeCanvas, createFakeWebGL2, type FakeGlState } from './character3d-fake-gl';

const model = heroModel();
const fakeImage: PlatformDecodedImage = { image: { fake: 'image' }, width: 4096, height: 4096, mimeType: 'image/jpeg' };
const logs: string[] = [];
const platform = {
  now: () => 0,
  log: (level: string, message: string) => { logs.push(level + ':' + message); },
};

function makeRenderer(options: {
  antialias?: boolean;
  maxVertexUniformVectors?: number | null;
  nullUniforms?: string[];
  failShaderCompile?: boolean;
  forceEdgeMode?: 'native-msaa' | 'fxaa';
  renderScale?: number;
  /** 离屏画布初始背衬尺寸（默认 375×667）；【R3】用「画布已按目标背衬建好」的场景复现 early return */
  canvasSize?: [number, number];
} = {}): { renderer: Character3DRenderer; state: FakeGlState } {
  const { gl, state } = createFakeWebGL2({
    antialias: options.antialias,
    maxVertexUniformVectors: options.maxVertexUniformVectors,
    nullUniforms: options.nullUniforms,
    failShaderCompile: options.failShaderCompile,
  });
  const renderer = createCharacter3DRenderer({
    canvas: createFakeCanvas(gl, options.canvasSize?.[0] ?? 375, options.canvasSize?.[1] ?? 667),
    model,
    baseColor: fakeImage,
    platform,
    light: {
      ambientIntensity: CHARACTER_3D_LIGHT.ambientIntensity,
      directionalIntensity: CHARACTER_3D_LIGHT.directionalIntensity,
      direction: CHARACTER_3D_LIGHT.direction,
      diffuseNormalization: CHARACTER_3D_LIGHT.diffuseNormalization,
    },
    orthoZHalf: CHARACTER_3D_ORTHO_Z_HALF,
    renderScale: options.renderScale ?? CHARACTER_3D_RENDER_SCALE,
    fxaa: CHARACTER_3D_FXAA,
    forceEdgeMode: options.forceEdgeMode,
  });
  return { renderer, state };
}

const IDENTITY_PALETTE = (() => {
  const p = new Float32Array(41 * 16);
  for (let j = 0; j < 41; j++) {
    p[j * 16] = 1; p[j * 16 + 5] = 1; p[j * 16 + 10] = 1; p[j * 16 + 15] = 1;
  }
  return p;
})();
const IDENTITY_MODEL = (() => {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
})();

describe('抗锯齿能力分支（方案 §7）', () => {
  it('有效 antialias=true ⇒ native-msaa（不建 FBO，直接渲默认帧缓冲）', () => {
    const { renderer, state } = makeRenderer({ antialias: true });
    expect(renderer.edgeMode).toBe('native-msaa');
    expect(state.createdFramebuffers).toBe(0);
    expect(renderer.diagnostics).toContain('edgeMode=native-msaa');
    renderer.beginFrame();
    expect(state.boundFramebuffer).toBeNull();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    renderer.endFrame();
    expect(state.drawElementsCalls).toHaveLength(1);
    expect(state.drawArraysCalls).toHaveLength(0); // 无 FXAA 全屏 pass
  });

  it('有效 antialias=false（实机口径）⇒ fxaa：中间 FBO + 全屏 pass', () => {
    const { renderer, state } = makeRenderer({ antialias: false });
    expect(renderer.edgeMode).toBe('fxaa');
    expect(state.createdFramebuffers).toBe(1);
    expect(state.createdRenderbuffers).toBe(1);
    renderer.beginFrame();
    expect(state.boundFramebuffer).not.toBeNull(); // 先渲进 FBO
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    renderer.endFrame();
    expect(state.drawArraysCalls).toHaveLength(1); // FXAA 全屏三角形
    expect(state.boundFramebuffer).toBeNull();     // 最后回到默认帧缓冲
  });

  it('判据是 getContextAttributes 的**有效值**，不是创建时的请求值（易错点 7）', () => {
    // 宿主收到 antialias:true 请求但有效值为 false —— S0 实机就是这种情况
    const { renderer } = makeRenderer({ antialias: false });
    expect(renderer.contextAttributes?.antialias).toBe(false);
    expect(renderer.edgeMode).toBe('fxaa');
    expect(renderer.diagnostics).toContain('antialias=false（实机有效值）');
  });

  it('抗锯齿策略与上下文属性一起进诊断（真机日志要能回放口径）', () => {
    const { renderer } = makeRenderer({ antialias: false });
    expect(renderer.diagnostics.some((d) => d.startsWith('edgeMode='))).toBe(true);
    expect(renderer.contextAttributes).toMatchObject({ antialias: false, alpha: true, premultipliedAlpha: true });
  });

  it('context attributes 取不到时不崩（context lost 后的宿主行为）', () => {
    const { gl } = createFakeWebGL2({ nullContextAttributes: true });
    const renderer = createCharacter3DRenderer({
      canvas: createFakeCanvas(gl, 100, 100),
      model,
      baseColor: fakeImage,
      platform,
      light: {
        ambientIntensity: CHARACTER_3D_LIGHT.ambientIntensity,
        directionalIntensity: CHARACTER_3D_LIGHT.directionalIntensity,
        direction: CHARACTER_3D_LIGHT.direction,
        diffuseNormalization: CHARACTER_3D_LIGHT.diffuseNormalization,
      },
      orthoZHalf: 4,
      renderScale: 1,
      fxaa: CHARACTER_3D_FXAA,
    });
    // 取不到有效值 ⇒ 不能假装有 MSAA，退 FXAA（方案 §7 第 2 条的安全侧）
    expect(renderer.edgeMode).toBe('fxaa');
    expect(renderer.contextAttributes).toBeNull();
  });
});

describe('提交次数（方案 §7 / §9.1）', () => {
  it('每 actor 一次 palette 上传 + 一次 draw：20 单位 = 20/20', () => {
    for (const mode of ['native-msaa', 'fxaa'] as const) {
      const { renderer, state } = makeRenderer({ forceEdgeMode: mode });
      renderer.beginFrame();
      for (let i = 0; i < 20; i++) renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
      renderer.endFrame();
      // 【T32 审核必修 3】三类口径明确：人物 20 + 武器 0 + FXAA（fxaa 分支 1/帧、native 0）
      expect(renderer.counters.paletteUploads, mode).toBe(20);
      expect(renderer.counters.unitDraws, mode).toBe(20);
      expect(renderer.counters.weaponDraws, mode).toBe(0);
      expect(renderer.counters.fxaaDraws, mode).toBe(mode === 'fxaa' ? 1 : 0);
      expect(renderer.counters.drawCalls, mode).toBe(20 + (mode === 'fxaa' ? 1 : 0));
      // 恒等式（可加和对账）与 FakeGL 实际调用数一致
      expect(renderer.counters.drawCalls, mode).toBe(
        renderer.counters.unitDraws + renderer.counters.weaponDraws + renderer.counters.fxaaDraws,
      );
      expect(renderer.counters.drawCalls, mode).toBe(state.drawElementsCalls.length + state.drawArraysCalls.length);
      expect(state.uniformMatrix4fvCalls.filter((c) => c[0] === null)).toHaveLength(0);
      // 20 个单位不应出现 820 次 uniform 调用（易错点 1）
      const boneUploads = state.uniformMatrix4fvCalls.filter(
        (c) => (c[2] as Float32Array).length === 41 * 16,
      );
      expect(boneUploads, mode).toHaveLength(20);
    }
  });

  it('每帧一次 clear（全视口**透明**）与一次 projection 上传', () => {
    const { renderer, state } = makeRenderer();
    renderer.beginFrame();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    renderer.endFrame();
    expect(state.clearColor).toEqual([0, 0, 0, 0]);
    const projectionUploads = state.uniformMatrix4fvCalls.filter((c) => (c[2] as Float32Array).length === 16);
    expect(projectionUploads).toHaveLength(2); // projection + model（FXAA 分支不额外上传矩阵）
  });

  it('共享 VBO/IBO/纹理/程序：多帧多单位不再重建 GL 资源', () => {
    // native 分支：2 buffer（vbo+ibo）+ 1 贴图（底色）+ 1 程序（skin）
    const native = makeRenderer({ forceEdgeMode: 'native-msaa' });
    native.renderer.beginFrame();
    native.renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    for (let f = 0; f < 5; f++) {
      native.renderer.endFrame();
      native.renderer.beginFrame();
      native.renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
      native.renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    }
    native.renderer.endFrame();
    expect(native.state.createdBuffers).toBe(2); // vbo + ibo
    expect(native.state.createdTextures).toBe(1); // 仅底色贴图
    expect(native.state.createdPrograms).toBe(1); // skin
    // FXAA 分支：额外 1 张 FBO 贴图 + fxaa 程序
    const fx = makeRenderer({ forceEdgeMode: 'fxaa' });
    expect(fx.state.createdTextures).toBe(2);
    expect(fx.state.createdPrograms).toBe(2);
  });

  it('每 actor 一次 uniformMatrix4fv 上传整块 41×16（禁 41 次逐骨上传）', () => {
    const { renderer, state } = makeRenderer();
    renderer.beginFrame();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    renderer.endFrame();
    const uploads = state.uniformMatrix4fvCalls.filter((c) => (c[2] as Float32Array).length === 41 * 16);
    expect(uploads).toHaveLength(1);
    expect((uploads[0][2] as Float32Array).byteLength).toBe(41 * 16 * 4);
  });

  it('alpha 作为 uniform 下发（死亡淡出走渲染侧，不改任何数值）', () => {
    const { renderer, state } = makeRenderer();
    renderer.beginFrame();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 0.45, 0);
    renderer.endFrame();
    const alphaCalls = state.calls.get('uniform1f') ?? [];
    expect(alphaCalls.length).toBeGreaterThan(0);
    // 本用例走能力分支（FakeGL 默认 antialias=false ⇒ fxaa）：1 次人物 draw + 1 次 FXAA 全屏 pass
    expect(renderer.counters.unitDraws).toBe(1);
    expect(renderer.counters.drawCalls).toBe(renderer.edgeMode === 'fxaa' ? 2 : 1);
  });
});

describe('尺寸与 DPR（方案 §9.1）', () => {
  it('resize：backbuffer = round(css × dpr × renderScale)，viewport 同步', () => {
    const { renderer, state } = makeRenderer();
    renderer.resize(375, 667, 3);
    expect(renderer.backbuffer).toEqual({ width: 375 * 3, height: 667 * 3 });
    expect(state.viewport).toEqual([0, 0, 375 * 3, 667 * 3]);
    renderer.resize(560, 700, 2);
    expect(renderer.backbuffer).toEqual({ width: 1120, height: 1400 });
  });

  it('renderScale 恒为 1（不引入 1.25× 超采样，保持 S0 性能口径）', () => {
    const { renderer } = makeRenderer({ renderScale: CHARACTER_3D_RENDER_SCALE });
    renderer.resize(900, 560, 1);
    expect(renderer.backbuffer).toEqual({ width: 900, height: 560 });
  });

  it('resize 会重建 FXAA 中间目标（FBO 尺寸必须跟随背衬，否则人物被拉伸）', () => {
    const { renderer, state } = makeRenderer({ forceEdgeMode: 'fxaa' });
    const before = state.createdFramebuffers;
    renderer.resize(400, 800, 2);
    expect(state.createdFramebuffers).toBe(before + 1);
    expect(state.viewport).toEqual([0, 0, 800, 1600]);
  });

  it('尺寸未变时不做无谓重建', () => {
    const { renderer, state } = makeRenderer({ forceEdgeMode: 'fxaa' });
    renderer.resize(200, 200, 1);
    const after = state.createdFramebuffers;
    renderer.resize(200, 200, 1);
    expect(state.createdFramebuffers).toBe(after);
  });

  it('【R3】同尺寸首调 resize（early return）后 beginFrame 仍上传非零投影（「投影未初始化」归因已被 arch 驳回）', () => {
    // 场景 = 宿主按目标背衬尺寸直接建画布（T31-FE-B R3）后首调 resize：尺寸已相等 ⇒ 早退
    const { renderer, state } = makeRenderer({ canvasSize: [750, 1334] });
    renderer.resize(375, 667, 2); // = round(375×2)×round(667×2) 与画布同尺寸 → early return
    expect(renderer.backbuffer).toEqual({ width: 750, height: 1334 });
    const before = state.uniformMatrix4fvCalls.length;
    renderer.beginFrame(); // 唯一投影初始化点：上传 uProjection 前用 orthoPixel(backbuffer) 重建
    const uploads = state.uniformMatrix4fvCalls
      .slice(before)
      .filter((c) => (c[2] as Float32Array).length === 16);
    expect(uploads).toHaveLength(1); // 仅 projection（无 drawUnit ⇒ 无 model 上传）
    const p = uploads[0][2] as Float32Array;
    expect(p[0]).toBeCloseTo(2 / 750, 8); // 非零：x 缩放
    expect(p[5]).toBeCloseTo(-2 / 1334, 8); // 非零：y 翻转缩放
    expect(p[0]).not.toBe(0);
    expect(p[5]).not.toBe(0);
    expect(p[12]).toBeCloseTo(-1, 8);
    expect(p[13]).toBeCloseTo(1, 8);
  });
});

describe('context lost / restore（方案 §6.2）', () => {
  it('lost 后暂停提交（session 继续，但不画半成品）', () => {
    const { renderer, state } = makeRenderer();
    renderer.beginFrame();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    renderer.endFrame();
    renderer.notifyContextLost();
    expect(renderer.status).toBe('context-lost');
    const drawsBefore = state.drawElementsCalls.length;
    renderer.beginFrame();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    renderer.endFrame();
    expect(state.drawElementsCalls.length).toBe(drawsBefore); // 零提交
    expect(renderer.diagnostics).toContain('context-lost');
  });

  it('restore 成功：重建程序与缓冲（GL 对象失效后必须重传），状态回 ready', () => {
    const { renderer, state } = makeRenderer();
    const programsAfterInit = state.createdPrograms;
    renderer.notifyContextLost();
    expect(renderer.handleContextRestored()).toBe(true);
    expect(renderer.status).toBe('ready');
    expect(state.createdPrograms).toBeGreaterThan(programsAfterInit); // 确实重建了
    // lost 时**不**去 delete 已随上下文失效的句柄（避免用死句柄），故 deletedPrograms 保持 0
    expect(state.deletedPrograms).toBe(0);
    expect(renderer.diagnostics).toContain('context-restored');
    renderer.beginFrame();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    renderer.endFrame();
    expect(state.drawElementsCalls.length).toBeGreaterThan(0);
  });

  it('只重建一次：第二次 restore 直接 failed（不让「隐形人物战斗」继续）', () => {
    const { renderer } = makeRenderer();
    renderer.notifyContextLost();
    expect(renderer.handleContextRestored()).toBe(true);
    renderer.notifyContextLost();
    expect(renderer.handleContextRestored()).toBe(false);
    expect(renderer.status).toBe('failed');
    expect(renderer.diagnostics).toContain('restore-failed');
  });

  it('重建抛错 ⇒ failed（不是静默继续）', () => {
    const { gl } = createFakeWebGL2({ failShaderCompile: false });
    const renderer = createCharacter3DRenderer({
      canvas: createFakeCanvas(gl, 100, 100),
      model,
      baseColor: fakeImage,
      platform,
      light: {
        ambientIntensity: 1, directionalIntensity: 1, direction: [0, 1, 0], diffuseNormalization: 1,
      },
      orthoZHalf: 4,
      renderScale: 1,
      fxaa: CHARACTER_3D_FXAA,
    });
    expect(renderer.status).toBe('ready');
    renderer.notifyContextLost();
    // 让下一次编译失败
    (gl as unknown as { getShaderParameter: () => boolean }).getShaderParameter = () => false;
    expect(renderer.handleContextRestored()).toBe(false);
    expect(renderer.status).toBe('failed');
    expect(renderer.diagnostics.some((d) => d.startsWith('restore-threw:'))).toBe(true);
  });

  it('dispose 后不再接受提交', () => {
    const { renderer, state } = makeRenderer();
    renderer.dispose();
    expect(renderer.status).toBe('disposed');
    const before = state.drawElementsCalls.length;
    renderer.beginFrame();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    expect(state.drawElementsCalls.length).toBe(before);
    expect(renderer.handleContextRestored()).toBe(false);
  });
});

describe('能力与硬失败', () => {
  it('MAX_VERTEX_UNIFORM_VECTORS 不够 ⇒ 初始化失败（不静默降级）', () => {
    const { renderer } = makeRenderer({ maxVertexUniformVectors: 32 });
    expect(renderer.status).toBe('failed');
    expect(renderer.diagnostics.some((d) => d.includes('装不下'))).toBe(true);
  });

  it('宿主不返回该常量（null）不判死：硬判据是 link 成功（probe 真机踩坑）', () => {
    const { renderer } = makeRenderer({ maxVertexUniformVectors: null });
    expect(renderer.status).toBe('ready');
    expect(renderer.maxVertexUniformVectors).toBeNull();
    expect(renderer.jointCount).toBe(41);
  });

  it('uBones[0] 被优化掉 ⇒ 硬失败（否则 A1-03 级通路根本没走）', () => {
    const { renderer } = makeRenderer({ nullUniforms: ['uBones[0]'] });
    expect(renderer.status).toBe('failed');
    expect(renderer.diagnostics.some((d) => d.includes('uBones[0]'))).toBe(true);
  });

  it('着色器编译失败 ⇒ failed 且把原因落到诊断与平台日志', () => {
    logs.length = 0;
    const { renderer } = makeRenderer({ failShaderCompile: true });
    expect(renderer.status).toBe('failed');
    expect(renderer.diagnostics.some((d) => d.startsWith('init-failed:'))).toBe(true);
    expect(logs.some((l) => l.startsWith('error:'))).toBe(true);
  });

  it('无 webgl2 上下文 ⇒ failed（不抛异常打断宿主）', () => {
    const renderer = createCharacter3DRenderer({
      canvas: { width: 10, height: 10, getContext: () => null } as unknown as Parameters<typeof createCharacter3DRenderer>[0]['canvas'],
      model,
      baseColor: fakeImage,
      platform,
      light: { ambientIntensity: 1, directionalIntensity: 1, direction: [0, 1, 0], diffuseNormalization: 1 },
      orthoZHalf: 4,
      renderScale: 1,
      fxaa: CHARACTER_3D_FXAA,
    });
    expect(renderer.status).toBe('failed');
    expect(renderer.diagnostics).toContain('webgl2-context-unavailable');
  });
});

describe('B4 · FXAA 中间目标完整性（失败关闭）', () => {
  it('FBO 不完整 ⇒ 初始化 failed，不静默拿着坏目标继续画', () => {
    const { gl, state } = createFakeWebGL2({ antialias: false, framebufferStatus: 0x8cd6 });
    const renderer = createCharacter3DRenderer({
      canvas: createFakeCanvas(gl, 375, 667),
      model,
      baseColor: fakeImage,
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
    });
    expect(state.framebufferStatusChecks).toBeGreaterThan(0);
    expect(renderer.status).toBe('failed');
    expect(renderer.diagnostics.some((d) => d.includes('framebuffer'))).toBe(true);
    // 失败即零提交
    renderer.beginFrame();
    renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, 0);
    expect(state.drawElementsCalls).toHaveLength(0);
  });

  it('FBO 完整时正常 ready，且确实做过完整性检查', () => {
    const { renderer, state } = makeRenderer({ antialias: false });
    expect(renderer.status).toBe('ready');
    expect(state.framebufferStatusChecks).toBeGreaterThan(0);
  });

  it('native-MSAA 分支无需 FBO ⇒ 不做完整性检查', () => {
    const { renderer, state } = makeRenderer({ antialias: true });
    expect(renderer.status).toBe('ready');
    expect(state.framebufferStatusChecks).toBe(0);
  });
});

describe('B5 · 固定方向光必须随 facing 变换（语义：光在世界空间固定）', () => {
  const expectVec = (actual: Float32Array | null, expected: number[], label: string): void => {
    expect(actual, `${label} 未上传光向`).not.toBeNull();
    const v = actual as Float32Array;
    for (let i = 0; i < 3; i++) expect(v[i], `${label} 分量 ${i}`).toBeCloseTo(expected[i], 5);
  };

  it('right / rightup / left 逐向断言（模型空间光向 = R_y(−yaw) · 世界光向，归一）', () => {
    const { renderer, state } = makeRenderer();
    // 期望值 = R_y(−yaw) · 世界光向（测试内独立重算：x/z 在屏幕平面内按 −yaw 旋转，y 不变）。
    // 【T31 FE 朝向整改】yaw 口径 = 源视角yaw − 180 ⇒ right=+90 / rightup=+135 / left=−90。
    const WORLD_LIGHT = [-0.4, 0.85, 1];
    const wl = ((): number[] => {
      const n = Math.hypot(WORLD_LIGHT[0], WORLD_LIGHT[1], WORLD_LIGHT[2]);
      return [WORLD_LIGHT[0] / n, WORLD_LIGHT[1] / n, WORLD_LIGHT[2] / n];
    })();
    const expectedLightModel = (yawDeg: number): number[] => {
      const r = (-yawDeg * Math.PI) / 180;
      return [wl[0] * Math.cos(r) + wl[2] * Math.sin(r), wl[1], -wl[0] * Math.sin(r) + wl[2] * Math.cos(r)];
    };
    const cases: [CharacterRenderCommand['facing'], number[]][] = [
      ['right', expectedLightModel(yawDegForFacing('right'))],
      ['rightup', expectedLightModel(yawDegForFacing('rightup'))],
      ['left', expectedLightModel(yawDegForFacing('left'))],
    ];
    // 抽样硬编码（防"测试里也写错"）：right ⇒ (−z, y, x) 形态；left ⇒ (z, y, −x)
    expect(expectedLightModel(90)[0]).toBeCloseTo(-0.728841, 5);
    expect(expectedLightModel(90)[2]).toBeCloseTo(-0.291536, 5);
    expect(expectedLightModel(-90)[0]).toBeCloseTo(0.728841, 5);
    for (const [facing, expected] of cases) {
      renderer.beginFrame();
      renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, yawDegForFacing(facing));
      renderer.endFrame();
      expectVec(state.lastUniform3fv[1], expected, facing);
    }
  });

  it('六个朝向的光向互不相同（right 与 left 必须反号 y/z 分量）', () => {
    const { renderer, state } = makeRenderer();
    const seen = new Map<string, number[]>();
    for (const facing of ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown'] as const) {
      renderer.beginFrame();
      renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, yawDegForFacing(facing));
      renderer.endFrame();
      seen.set(facing, Array.from(state.lastUniform3fv[1] as Float32Array));
    }
    expect(new Set([...seen.values()].map((v) => v.map((x) => x.toFixed(4)).join(','))).size).toBe(6);
    const right = seen.get('right') as number[];
    const left = seen.get('left') as number[];
    expect(left[0]).toBeCloseTo(-right[0], 5);
    expect(left[2]).toBeCloseTo(-right[2], 5);
    expect(left[1]).toBeCloseTo(right[1], 6); // y 分量不随绕 Y 旋转变化
  });

  it('世界空间不变性：dot(n_model, L_model) === dot(R_y(yaw)·n_model, L_world)', () => {
    const { renderer, state } = makeRenderer();
    const n0 = [0.3, 0.8, 0.5];
    const nNorm = Math.hypot(n0[0], n0[1], n0[2]);
    const n = n0.map((v) => v / nNorm);
    const dot = (a: number[], b: ArrayLike<number>): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const rotY = (v: number[], deg: number): number[] => {
      const h = (deg * Math.PI) / 180;
      const c = Math.cos(h);
      const s = Math.sin(h);
      return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
    };
    const lNorm = Math.hypot(...CHARACTER_3D_LIGHT.direction);
    const worldLight = CHARACTER_3D_LIGHT.direction.map((v) => v / lNorm);
    for (const facing of ['right', 'rightup', 'left'] as const) {
      const yaw = yawDegForFacing(facing);
      renderer.beginFrame();
      renderer.drawUnit(IDENTITY_PALETTE, IDENTITY_MODEL, 1, yaw);
      renderer.endFrame();
      const lModel = state.lastUniform3fv[1] as Float32Array;
      expect(dot(n, lModel), facing).toBeCloseTo(dot(rotY(n, yaw), worldLight), 6);
    }
  });
});

describe('材质与纹理上传口径（方案 §7 / probe 标定）', () => {
  it('glTF 贴图必须 UNPACK_FLIP_Y_WEBGL = false（翻转会把人物碎成色块）', () => {
    const { state } = makeRenderer({ forceEdgeMode: 'native-msaa' });
    expect(state.lastUnpackFlipY).toBe(false);
    const flipCalls = state.pixelStoreiCalls.filter(([pname]) => pname === 0x9240);
    expect(flipCalls.length).toBeGreaterThan(0);
    // 传的是布尔 false（WebGL 接受布尔），按数值语义判等
    expect(flipCalls.every(([, value]) => Number(value) === 0)).toBe(true);
  });

  it('只上传底色贴图（S1 材质是漫反射单色，法线/金属粗糙度不参与着色）', () => {
    const { state } = makeRenderer({ forceEdgeMode: 'native-msaa' });
    expect(state.createdTextures).toBe(1);
    expect(state.texImage2DCalls).toHaveLength(1);
    expect(state.calls.get('generateMipmap')).toHaveLength(1);
    // 上传的是图像对象（不是 FBO 那种 null 分配）
    expect(state.texImage2DCalls[0].length).toBe(6);
  });

  it('关闭背面剔除与混合、开启深度 LEQUAL（placement 含 y 翻转 ⇒ winding 已反）', () => {
    const { state } = makeRenderer();
    expect(state.cullFace).toBe(false);
    expect(state.blend).toBe(false);
    expect(state.depthTest).toBe(true);
    expect(state.calls.get('depthFunc')).toHaveLength(1);
  });

  it('顶点属性 5 路：pos3/nrm3/uv2/joints4/weights4（与 probe 布局同序）', () => {
    const { state } = makeRenderer();
    expect(state.calls.get('enableVertexAttribArray')).toHaveLength(5);
    expect(state.calls.get('vertexAttribPointer')).toHaveLength(5);
  });
});

describe('着色器静态口径（alpha-aware FXAA / sRGB 管线）', () => {
  const fxaaSrc = CHARACTER3D_SHADER_SOURCES.fxaaFragment;
  const skinFrag = CHARACTER3D_SHADER_SOURCES.skinFragment;
  const skinVert = CHARACTER3D_SHADER_SOURCES.skinVertex(41);

  it('皮肤着色器：sRGB → 线性 → 光照 → sRGB，且输出预乘 alpha', () => {
    expect(skinFrag).toContain('srgbToLinear(texture(uBaseColor, vUv).rgb)');
    expect(skinFrag).toContain('linearToSrgb(lit)');
    expect(skinFrag).toContain('vec4(linearToSrgb(lit) * uAlpha, uAlpha)');
    expect(skinFrag).toContain('uDiffuseNorm');
  });

  it('顶点着色器：声明 uBones[N]（N=41）、每顶点 4 骨加权、法线跟蒙皮', () => {
    expect(skinVert).toContain('uniform mat4 uBones[41]');
    expect(skinVert).toContain('mat4 skin = uBones[j0] * aWeights.x');
    expect(skinVert).toContain('vNormal = mat3(skin) * aNormal');
  });

  it('FXAA：亮度按**未预乘**颜色算 + alpha 门限（否则浅底黑边，易错点 6）', () => {
    expect(fxaaSrc).toContain('dot(c.rgb, vec3(0.299, 0.587, 0.114)) / max(c.a, 1e-4)');
    expect(fxaaSrc).toContain('bool inside(vec4 c) { return c.a > uAlphaThreshold; }');
    expect(fxaaSrc).toContain('!inside(sNeg)');
  });

  it('FXAA：中心在透明区时只做预乘空间均值（不引入透明区 RGB）', () => {
    expect(fxaaSrc).toContain('if (!inside(cM))');
    expect(fxaaSrc).toContain('acc += texture(uTex, vUv + vec2(float(i), float(j)) * t);');
    expect(fxaaSrc).toContain('fragColor = acc / 9.0;');
  });

  it('FXAA：搜索步数可配且被夹在 [1,16]，边缘阈值/亚像素参数来自 uniform（不硬编码）', () => {
    expect(fxaaSrc).toContain('uniform int uSearchSteps;');
    expect(fxaaSrc).toContain('const int MAX_SEARCH_STEPS = 16;');
    expect(fxaaSrc).toContain('uEdgeThreshold');
    expect(fxaaSrc).toContain('uSubpixelQuality');
  });
});
