// T31-FE-A · 人物层 pass 用例（方案 §4.1 / §4.3 / §9.1 battle 条的渲染侧半边）
//
// 关注点：
//   · 脚底锚与缩放只来自命令（禁从 q/r 重投影；禁 bbox 每帧自适应）；
//   · placed 与建矩阵**同源**（易错点 10：不同源会让 HUD 与技能钮漂移）；
//   · 整张透明人物层一次 drawImage 合成（方案 §4.3）；
//   · 状态传播：loading / failed / context-lost 不画半成品。

import { describe, expect, it, vi } from 'vitest';
import { createCharacter3DPass, type Character3DProfileRuntime } from '../ui/character3d/pass';
import type { Character3DRenderer, Character3DRenderStatus } from '../ui/character3d/renderer';
import type { CharacterRenderCommand } from '../types';
import {
  CHARACTER_3D_CROSS_FADE_SEC,
  CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
  HERO_3D_ACTION_MAP,
  HERO_3D_PROFILE,
  HERO_3D_PROFILE_ID,
  yawDegForFacing,
} from '../config/character-3d';
import { bindRetargetedClip, parseCharacter3DClipJson, type Character3DRetargetedClip } from '../ui/character3d/animation';
import { heroClip, heroClipRegistry, heroModel } from './character3d-fixtures';

const model = heroModel();
const runtime: Character3DProfileRuntime = {
  profile: HERO_3D_PROFILE,
  model,
  anim: {
    actionMap: HERO_3D_ACTION_MAP,
    crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
    jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
    clips: heroClipRegistry(model),
  },
};

/** 桩件：status 需要可变（模拟 lost/failed），故用 Omit 去掉只读修饰。 */
type StubRenderer = Omit<Character3DRenderer, 'status'> & {
  status: Character3DRenderer['status'];
  frames: number;
  draws: { palette: Float32Array; matrix: Float32Array; alpha: number }[];
  yaws: number[];
};

function createStubRenderer(overrides: Partial<Character3DRenderer> = {}): StubRenderer {
  const stub: StubRenderer = {
    canvas: { stub: 'canvas' },
    status: 'ready' as Character3DRenderStatus,
    edgeMode: 'fxaa',
    jointCount: 41,
    vertexCount: model.mesh.vertexCount,
    indexCount: model.mesh.indexCount,
    backbuffer: { width: 375, height: 667 },
    contextAttributes: { antialias: false } as WebGLContextAttributes,
    maxVertexUniformVectors: 1024,
    counters: { drawCalls: 0, paletteUploads: 0, frames: 0 },
    diagnostics: [],
    frames: 0,
    draws: [],
    yaws: [],
    beginFrame() { stub.frames++; },
    drawUnit(palette, matrix, alpha, yawDeg) {
      stub.yaws.push(yawDeg);
      // 复制一份：渲染端 uniformMatrix4fv 当场复制（pass 的 matrix 是每帧复用 scratch），
      // 桩件也照此语义快照，否则断言会读到被下一单位覆盖后的值。
      stub.draws.push({ palette: Float32Array.from(palette), matrix: Float32Array.from(matrix), alpha });
    },
    endFrame() { stub.counters.frames++; },
    resize() { /* noop */ },
    notifyContextLost() { stub.status = 'context-lost'; },
    handleContextRestored() { return true; },
    dispose() { stub.status = 'disposed'; },
    ...overrides,
  };
  return stub;
}

function command(overrides: Partial<CharacterRenderCommand> = {}): CharacterRenderCommand {
  return {
    actorId: 'hero',
    profileKey: HERO_3D_PROFILE_ID,
    footX: 187.5,
    footY: 420,
    depthKey: 10,
    facing: 'right',
    state: 'idle',
    isJump: false,
    stateElapsedSec: 0,
    moveProgress: null,
    hopPx: 0,
    alpha: 1,
    squashY: 1,
    ...overrides,
  };
}

const EXPECTED_HEIGHT = HERO_3D_PROFILE.screenHeightPxAtReference;

/** 建 pass。loadState **必须显式**（默认 loading = 资源门未过 ⇒ 不画半成品，方案 §6.2 口径）。 */
function makePass(renderer: Character3DRenderer, loadState: 'ready' | 'loading' | 'failed' = 'ready') {
  return createCharacter3DPass({
    renderer,
    viewport: { width: 375, height: 667 },
    runtimes: { [HERO_3D_PROFILE_ID]: runtime },
    loadState,
  });
}

describe('放置与 placed 输出（方案 §4.1 / §4.3）', () => {
  // 【T31-R2 · §4.1.1】下列「几何框」断言统一喂 dt=0：该帧最终姿态 = rest（Root 增量为 0），
  // placed 的姿态补偿项恰为 0 ⇒ 断言逐字锁几何关系（补偿本身由本文件 §4.1.1 专块逐条覆盖）。
  it('脚底锚 = footY - hopPx；placed.top = 脚底 − 参考屏高（同源）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    const res = pass.render([command({ footY: 420, hopPx: 0 })], 0);
    expect(res.status).toBe('ready');
    expect(res.canvas).toEqual({ width: 375, height: 667 });
    const placed = res.placed.get('hero');
    expect(placed?.cx).toBe(187.5);
    expect(placed?.h).toBeCloseTo(EXPECTED_HEIGHT, 10);
    expect(placed?.top).toBeCloseTo(420 - EXPECTED_HEIGHT, 10);
    // 矩阵里的平移列必须与 placed 同一组数（脚底 = 矩阵的平移 y）
    const matrix = renderer.draws[0].matrix;
    expect(matrix[13]).toBeCloseTo(420, 5);
    expect(matrix[12]).toBeCloseTo(187.5, 5);
  });

  it('hopPx 抬升：脚底与 placed.top 同步上移（不得只动一处）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    const res = pass.render([command({ footY: 420, hopPx: 88 })], 0);
    const placed = res.placed.get('hero');
    expect(placed?.top).toBeCloseTo(420 - 88 - EXPECTED_HEIGHT, 10);
    expect(renderer.draws[0].matrix[13]).toBeCloseTo(420 - 88, 5);
  });

  it('squashY 压扁：高度与顶部同步缩放，脚底不动（死亡压扁仍落原格）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    const res = pass.render([command({ footY: 420, squashY: 0.5 })], 0);
    const placed = res.placed.get('hero');
    expect(placed?.h).toBeCloseTo(EXPECTED_HEIGHT * 0.5, 10);
    expect(placed?.top).toBeCloseTo(420 - EXPECTED_HEIGHT * 0.5, 10);
    expect(renderer.draws[0].matrix[13]).toBeCloseTo(420, 5); // 脚底仍在原格
  });

  it('缩放 = 参考屏高 / modelHeight（不按 bbox 每帧自适应）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    pass.render([command()], 0.016);
    const m = renderer.draws[0].matrix;
    const expected = EXPECTED_HEIGHT / HERO_3D_PROFILE.modelHeight;
    // 【T31 FE 朝向整改】摆放矩阵 = placement · R_y(yaw)：x/z 元素随 yaw 变（θ=±90 时 m[0]≈0）。
    // 按**闭式**逐项断言（比原来的单元素断言更完整，且把「z 不缩放」钉死）：
    //   M = P·R_y(θ)，P = diag(s, −s, 1) ⇒ col_x = (s·cosθ, 0, −sinθ)、col_z = (s·sinθ, 0, cosθ)
    const th = (yawDegForFacing('right') * Math.PI) / 180;
    expect(m[0]).toBeCloseTo(expected * Math.cos(th), 4); // x 轴像的 x 分量 = s·cosθ
    expect(m[2]).toBeCloseTo(-Math.sin(th), 4);           // ★ x 轴像的 z 分量 = −sinθ（**无 s**）
    expect(m[8]).toBeCloseTo(expected * Math.sin(th), 4); // z 轴像的 x 分量 = s·sinθ
    expect(m[10]).toBeCloseTo(Math.cos(th), 4);           // ★ z 轴像的 z 分量 = cosθ（**无 s** ⇒ z 不缩放，否则裁成「丝带」）
    expect(-m[5]).toBeCloseTo(expected, 4);               // y 缩放（y 翻转，与 yaw 无关）
  });

  it('width 取 x/z 跨度较大者乘缩放（六向旋转不改变 HUD 宽度基准）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    const res = pass.render([command()], 0.016);
    const scale = EXPECTED_HEIGHT / HERO_3D_PROFILE.modelHeight;
    const xSpan = model.bounds.max[0] - model.bounds.min[0];
    const zSpan = model.bounds.max[2] - model.bounds.min[2];
    expect(res.placed.get('hero')?.w).toBeCloseTo(Math.max(xSpan, zSpan) * scale, 8);
    // 六向切换不改变 w
    const res2 = pass.render([command({ facing: 'leftup' })], 0.016);
    expect(res2.placed.get('hero')?.w).toBeCloseTo(res.placed.get('hero')?.w as number, 10);
  });

  it('六向：不同朝向的模型矩阵不同（yaw 真的进了矩阵）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    pass.render([command({ facing: 'right' })], 0.016);
    pass.render([command({ facing: 'left' })], 0.016);
    const [right, left] = renderer.draws.map((d) => Array.from(d.matrix));
    expect(right).not.toEqual(left);
    // right yaw=0 ⇒ 单位旋转；left yaw=180 ⇒ m[0] 反号
    expect(left[0]).toBeCloseTo(-right[0], 4);
  });

  it('placed 覆盖所有命令，且不含本帧缺席的 actor（不残留）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    const res = pass.render([
      command({ actorId: 'a' }),
      command({ actorId: 'b' }),
    ], 0.016);
    expect([...res.placed.keys()].sort()).toEqual(['a', 'b']);
    const res2 = pass.render([command({ actorId: 'a' })], 0.016);
    expect([...res2.placed.keys()]).toEqual(['a']);
    expect([...pass.controllers.keys()]).toEqual(['a']); // b 的控制器已回收
  });

  it('B1 · isJump 原样透传到动画状态机（hopPx=0 的端点帧仍走 jump 槽位）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    // 起点帧：isJump 已为 true，但 hop 恰好为 0
    pass.render([command({ state: 'walk', isJump: true, moveProgress: 0, hopPx: 0 })], 0.016);
    const ctrl = pass.controllers.get('hero');
    expect(ctrl?.actionKey).toBe('jump');
    expect(ctrl?.activeClipKey).toBe('jump');
    // 对照：非轻功的行走（hopPx 非 0 也不得被判成 jump）
    pass.render([command({ state: 'walk', isJump: false, moveProgress: 0.5, hopPx: 40 })], 0.016);
    expect(pass.controllers.get('hero')?.activeClipKey).toBe('walk');
  });

  it('六向 yaw 进入渲染（pass 把每个单位的 yaw 传给 renderer，供光向变换）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    // 【T31 FE 朝向整改】yaw 口径 = normalizeSigned(源视角yaw − 180)：left ⇒ −90、rightup ⇒ +135
    pass.render([command({ facing: 'left' })], 0.016);
    expect(renderer.yaws).toEqual([yawDegForFacing('left')]);
    pass.render([command({ facing: 'rightup' })], 0.016);
    expect(renderer.yaws[1]).toBe(yawDegForFacing('rightup'));
    expect(renderer.yaws[0]).toBe(-90);
    expect(renderer.yaws[1]).toBe(135);
  });

  it('20 单位容量：一次 beginFrame、20 次 drawUnit、20 条 placed', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    const commands = Array.from({ length: 20 }, (_v, i) => command({ actorId: 'u' + i, footX: 20 * i, depthKey: i }));
    const res = pass.render(commands, 0.016);
    expect(renderer.frames).toBe(1);
    expect(renderer.draws).toHaveLength(20);
    expect(res.placed.size).toBe(20);
    expect(pass.controllers.size).toBe(20);
  });

  it('不排序：命令顺序原样消费（排序是 2D 层按 depthKey 的职责，方案 §4.3）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    pass.render([
      command({ actorId: 'far', footX: 10, depthKey: 99 }),
      command({ actorId: 'near', footX: 20, depthKey: 1 }),
    ], 0.016);
    expect(renderer.draws[0].matrix[12]).toBeCloseTo(10, 4);
    expect(renderer.draws[1].matrix[12]).toBeCloseTo(20, 4);
  });

  it('alpha 透传（死亡淡出走渲染侧，不做数值判断）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    pass.render([command({ alpha: 0.45 })], 0.016);
    expect(renderer.draws[0].alpha).toBeCloseTo(0.45, 6);
    pass.render([command({ alpha: Number.NaN })], 0.016);
    expect(renderer.draws[1].alpha).toBe(1); // 非法值保守按不透明
  });

  it('每 actor 一套姿态/控制器（姿态缓冲不共享）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    pass.render([
      command({ actorId: 'a', state: 'idle' }),
      command({ actorId: 'b', state: 'charge', stateElapsedSec: 0.3 }),
    ], 0.016);
    const [a, b] = renderer.draws.map((d) => Array.from(d.palette));
    expect(a).not.toEqual(b);
    expect(pass.controllers.get('a')).not.toBe(pass.controllers.get('b'));
  });
});

describe('状态传播（不画半成品）', () => {
  it('loadState=loading ⇒ status=loading、canvas=null、零提交', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer, 'loading');
    const res = pass.render([command()], 0.016);
    expect(res.status).toBe('loading');
    expect(res.canvas).toBeNull();
    expect(renderer.draws).toHaveLength(0);
    expect(renderer.frames).toBe(0);
    expect(res.placed.size).toBe(0);
  });

  it('loadState=failed ⇒ status=failed（资源门失败不静默降级 2D）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer, 'failed');
    expect(pass.render([command()], 0.016).status).toBe('failed');
  });

  it('renderer 处于 context-lost ⇒ status=context-lost 且零提交', () => {
    const renderer = createStubRenderer();
    renderer.notifyContextLost();
    const pass = makePass(renderer);
    const res = pass.render([command()], 0.016);
    expect(res.status).toBe('context-lost');
    expect(renderer.draws).toHaveLength(0);
  });

  it('renderer=disposed/failed ⇒ status=failed', () => {
    for (const status of ['disposed', 'failed'] as Character3DRenderStatus[]) {
      const renderer = createStubRenderer({ status });
      const pass = makePass(renderer);
      expect(pass.render([command()], 0.016).status).toBe('failed');
    }
  });

  it('未知 profileKey ⇒ 跳过该命令并留诊断（不画错 profile）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    const res = pass.render([command({ profileKey: 'npc-unknown' })], 0.016);
    expect(renderer.draws).toHaveLength(0);
    expect(res.placed.size).toBe(0);
    expect(res.diagnostics.some((d) => d.startsWith('unknown-profile:'))).toBe(true);
  });

  it('诊断合并 renderer 与控制器两处（真机日志单点可取）', () => {
    const renderer = createStubRenderer({ diagnostics: ['edgeMode=fxaa'] });
    const pass = createCharacter3DPass({
      renderer,
      viewport: { width: 375, height: 667 },
      runtimes: { [HERO_3D_PROFILE_ID]: { ...runtime, anim: { ...runtime.anim, clips: {} } } },
      loadState: 'ready',
    });
    const res = pass.render([command()], 0.016);
    expect(res.diagnostics).toContain('edgeMode=fxaa');
    expect(res.diagnostics.some((d) => d.startsWith('hero:missing-clip:'))).toBe(true);
  });
});

describe('合成（方案 §4.3）', () => {
  it('composite 只调一次 drawImage，把整张透明人物层交给 2D 世界层', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    pass.render([command()], 0.016);
    const drawImage = vi.fn();
    expect(pass.composite({ drawImage }, 0, -12)).toBe(true);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(renderer.canvas, 0, -12);
  });

  it('未就绪时 composite 返回 false（不把空层盖上去）', () => {
    const renderer = createStubRenderer({ status: 'failed' });
    const pass = makePass(renderer);
    const drawImage = vi.fn();
    expect(pass.composite({ drawImage }, 0, 0)).toBe(false);
    expect(drawImage).not.toHaveBeenCalled();
  });
});

describe('时钟口径（方案 §4.1：混合钟属 view 表现态）', () => {
  it('dt 只推进表现相位，不影响任何外部状态（pass 无副作用出口）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    const cmd = command({ state: 'basic', stateElapsedSec: 0.1 });
    const first = pass.render([cmd], 0.016);
    const firstPalette = Array.from(renderer.draws[0].palette);
    // 同一条命令重复渲染：basic 相位由 stateElapsedSec 派生 ⇒ 结果稳定（与 dt 无关）
    pass.render([cmd], 5.0);
    expect(Array.from(renderer.draws[1].palette)).toEqual(firstPalette);
    expect(first.placed.size).toBe(1);
  });
});

// ══════════════════ 【T31-R2 · §4.1.1】placed = 随最终姿态平移的 HUD 布局框 ══════════════════
// 判据（arch seq=438 取「甲」）：
//   · `command.footX/footY` = 地面锚（不动）；placed = baseTop/baseCx ＋ 最终 pose 的 Root 增量
//     经「父节点变换 ＋ 摆放矩阵线性部分」投影出的物理像素 delta；
//   · 增量只进 placed，**人物矩阵/palette 不得再平移**（禁双抬升）；
//   · 宽高沿稳定参考框（不按逐帧衣摆 bbox 重定尺）；rest 位移不重复计入；
//   · 覆盖：正/负/0 y、起跳与落地、180ms 混合中点、dpr 1/2/3、死亡与 reset 不残留。
//
// 抗后续条文变动：主用例用**合成 clip**（4 帧、rootTrack y=[0,+0.2,−0.2,0]、fps=1）——
// 相位与增量都能闭式解析，不依赖现役素材的相位口径（R2-1 重映射不会碰到本块）。
function syntheticClip(): Character3DRetargetedClip {
  return parseCharacter3DClipJson(
    {
      fps: 1,
      nFrames: 4,
      duration: 4,
      rootMode: 'y',
      boneTracks: { L_Thigh: [[0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1]] },
      rootTrack: [[0, 0, 0], [0, 0.2, 0], [0, -0.2, 0], [0, 0, 0]],
    },
    'synthetic',
  );
}

const SYNTH_DY = [0, 0.2, -0.2, 0];

/** 合成运行时：atk 槽位挂合成 clip，basic 槽位把它按 0.4s 窗归一（相位 = elapsed/0.4）。 */
function syntheticRuntime(profile: typeof HERO_3D_PROFILE = HERO_3D_PROFILE): Character3DProfileRuntime {
  const clip = syntheticClip();
  return {
    profile,
    model,
    anim: {
      actionMap: {
        ...HERO_3D_ACTION_MAP,
        // 合成槽位：把合成 clip 挂到 atk 键，按 0.4s 窗归一（相位 = elapsed/0.4，四帧逐点可解析）
        basic: {
          clip: 'atk',
          progressSource: 'stateElapsed',
          loop: false,
          playWindowSec: 0.4,
          startRatio: 0,
          rootMotion: 'track',
          crossFadeOnEnter: true,
        },
      },
      crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
      jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
      clips: { atk: { kind: 'retargeted', ref: null, clip, bound: bindRetargetedClip(clip, model) } },
    },
  };
}

function passWith(rt: Character3DProfileRuntime, renderer: Character3DRenderer, loadState: 'ready' = 'ready') {
  return createCharacter3DPass({
    renderer,
    viewport: { width: 375, height: 667 },
    runtimes: { [HERO_3D_PROFILE_ID]: rt },
    loadState,
  });
}

describe('【T31-R2 · §4.1.1】placed 姿态补偿（HUD 布局框，不动人物）', () => {
  it('正/负/0 y：placed.top 增量 = 摆放矩阵线性部分 × Root 增量；矩阵自身不平移', () => {
    for (const [elapsed, dy] of [[0, 0], [0.1, SYNTH_DY[1]], [0.2, SYNTH_DY[2]], [0.4, SYNTH_DY[3]]] as const) {
      const renderer = createStubRenderer();
      const pass = passWith(syntheticRuntime(), renderer);
      const res = pass.render([command({ state: 'basic', stateElapsedSec: elapsed, footY: 420, footX: 187.5 })], 0.016);
      const placed = res.placed.get('hero')!;
      const m = renderer.draws[0].matrix;
      const base = 420 - EXPECTED_HEIGHT;
      // 容差 1e-4：摆放矩阵是 Float32Array（m[5] 带 float32 量化 ≈4.6e-8 相对误差），非算法偏差
      expect(placed.top, `elapsed=${elapsed}（期望 dy=${dy}）`).toBeCloseTo(base + m[5] * dy, 4);
      expect(placed.cx, `elapsed=${elapsed}`).toBeCloseTo(187.5 + m[4] * dy, 4);
      // ★ 人物矩阵**不得**被姿态补偿推移（禁双抬升）：平移列恒为地面锚
      expect(m[13], `elapsed=${elapsed} 矩阵 y`).toBeCloseTo(420, 6);
      expect(m[12], `elapsed=${elapsed} 矩阵 x`).toBeCloseTo(187.5, 6);
      // 符号：正 y 蹲姿/腾空抬升 ⇒ 框上移（top 变小）；负 y 蹲姿 ⇒ 框下移
      if (dy > 0) expect(placed.top).toBeLessThan(base - 1e-9);
      else if (dy < 0) expect(placed.top).toBeGreaterThan(base + 1e-9);
      else expect(placed.top).toBeCloseTo(base, 9);
      // 宽高沿稳定参考框（不随姿态重定尺）
      expect(placed.h).toBeCloseTo(EXPECTED_HEIGHT, 10);
    }
  });

  it('同一命令、不同姿态帧：矩阵平移列逐位相同（人不动，只有布局框动）', () => {
    const renderer = createStubRenderer();
    const pass = passWith(syntheticRuntime(), renderer);
    pass.render([command({ state: 'basic', stateElapsedSec: 0.1 })], 0.016); // dy=+0.2
    pass.render([command({ state: 'basic', stateElapsedSec: 0.2 })], 0.016); // dy=−0.2
    const [a, b] = renderer.draws.map((d) => Array.from(d.matrix));
    expect(a.slice(12, 15)).toEqual(b.slice(12, 15)); // 平移列（地面锚）不变
    expect(a.slice(0, 12)).toEqual(b.slice(0, 12));   // 线性部分（yaw/scale）不变
    expect(Array.from(renderer.draws[0].palette)).not.toEqual(Array.from(renderer.draws[1].palette)); // 姿态确实不同
  });

  it('dpr 1/2/3：placed 增量随 dpr 线性（逻辑口径 dpr 无关），且 h/top 逻辑值恒等', () => {
    const logicalRefH = HERO_3D_PROFILE.screenHeightPxAtReference;
    const dy = SYNTH_DY[1];
    for (const dpr of [1, 2, 3]) {
      const renderer = createStubRenderer();
      const rt = syntheticRuntime({ ...HERO_3D_PROFILE, screenHeightPxAtReference: logicalRefH * dpr });
      const pass = passWith(rt, renderer);
      const res = pass.render(
        [command({ state: 'basic', stateElapsedSec: 0.1, footX: 187.5 * dpr, footY: 420 * dpr })],
        0.016,
      );
      const placed = res.placed.get('hero')!;
      const m = renderer.draws[0].matrix;
      const scale = (logicalRefH * dpr) / HERO_3D_PROFILE.modelHeight;
      expect(m[5], `dpr=${dpr}`).toBeCloseTo(-scale, 4);
      // 逻辑口径：placed.top/dpr 的增量 = −(参考高/modelHeight)·dy（与 dpr 无关）
      const logicalDelta = -((logicalRefH / HERO_3D_PROFILE.modelHeight) * dy);
      expect((placed.top - 420 * dpr) / dpr - -logicalRefH, `dpr=${dpr} 逻辑增量`).toBeCloseTo(logicalDelta, 4);
      expect(placed.h / dpr, `dpr=${dpr} 逻辑高`).toBeCloseTo(logicalRefH, 6);
    }
  });

  it('死亡压扁：delta 与 h 同乘 squashY（框随压扁同步缩，脚底不动）', () => {
    const renderer = createStubRenderer();
    const pass = passWith(syntheticRuntime(), renderer);
    const res = pass.render([command({ state: 'basic', stateElapsedSec: 0.1, squashY: 0.3, footY: 420 })], 0.016);
    const placed = res.placed.get('hero')!;
    const m = renderer.draws[0].matrix;
    expect(placed.h).toBeCloseTo(EXPECTED_HEIGHT * 0.3, 8);
    expect(placed.top).toBeCloseTo(420 - EXPECTED_HEIGHT * 0.3 + m[5] * SYNTH_DY[1], 6);
    expect(m[13]).toBeCloseTo(420, 6);
  });

  it('reset/换状态不残留：回到零增量姿态后 placed.top 精确回到 baseTop', () => {
    const rt = syntheticRuntime();
    const renderer = createStubRenderer();
    const pass = passWith(rt, renderer);
    // 先来一帧大增量
    const withDelta = pass.render([command({ state: 'basic', stateElapsedSec: 0.1 })], 0.016).placed.get('hero')!;
    expect(Math.abs(withDelta.top - (420 - EXPECTED_HEIGHT))).toBeGreaterThan(1);
    // 再回到零增量帧（合成 clip 的 phase 0 ⇒ 帧 0 的 root 增量 = 0）
    const zero = pass.render([command({ state: 'basic', stateElapsedSec: 0 })], 0.016).placed.get('hero')!;
    expect(zero.top).toBeCloseTo(420 - EXPECTED_HEIGHT, 9);
    expect(zero.cx).toBeCloseTo(187.5, 9);
    // 换新 actor 同帧：新控制器同样从帧 0 起（不继承别人的补偿）
    const pass2 = passWith(rt, createStubRenderer());
    const fresh = pass2.render([command({ actorId: 'hero2', state: 'basic', stateElapsedSec: 0.2 })], 0.016);
    expect(fresh.placed.get('hero2')!.top).toBeGreaterThan(420 - EXPECTED_HEIGHT);
  });

  it('jump→idle 180ms 混合中点：placed 增量 = 两端姿态按混合权重线性组合（不另采跳跃曲线）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer); // 现役 profile + 现役动作表（真实 jump / idle 素材）
    const jumpClip = heroClip('jump');
    const idleClip = heroClip('idle');
    const jumpSamplerSec = jumpClip.nFrames / jumpClip.fps;
    const idleSamplerSec = idleClip.nFrames / idleClip.fps;
    /** 逐帧 Root 增量（与 animation.applyRetargetedClip 同式）：phase → rootTrack y。 */
    const dyAt = (clip: typeof jumpClip, phase: number, endpointInclusive: boolean, loop: boolean): number => {
      const nF = clip.nFrames;
      let fi = endpointInclusive && !loop ? phase * (nF - 1) : phase * clip.samplerDurationSec * clip.fps;
      if (loop) fi -= Math.floor(fi / nF) * nF;
      else fi = Math.min(nF - 1, Math.max(0, fi));
      const i0 = Math.min(nF - 1, Math.max(0, Math.floor(fi)));
      const i1 = loop ? (i0 + 1) % nF : Math.min(nF - 1, i0 + 1);
      const a = fi - Math.floor(fi);
      return clip.rootTrack[i0][1] * (1 - a) + clip.rootTrack[i1][1] * a;
    };
    // 起跳帧：jump，顶点附近（moveProgress 0.6 ⇒ 足底接近顶点）
    const dt1 = 0.016;
    pass.render([command({ state: 'walk', isJump: true, moveProgress: 0.6 })], dt1);
    // 切 idle：**本帧**建立 180ms 混合（update 先推钟、后建淡化 ⇒ 建立帧权重恰为 0）
    const dt2 = 0.03;
    pass.render([command({ state: 'idle', isJump: false, moveProgress: null })], dt2);
    expect(pass.controllers.get('hero')!.fadeWeight).toBe(0);
    // 再推半窗 ⇒ 混合权重 0.5（来源相位继续按来源自己的口径推进）
    const dt3 = CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC / 2;
    const res = pass.render([command({ state: 'idle', isJump: false, moveProgress: null })], dt3);
    const w = pass.controllers.get('hero')!.fadeWeight;
    expect(w).toBeCloseTo(0.5, 6);
    const viewClock1 = dt1;
    const fromPhase = Math.min(1, 0.6 + (dt2 + dt3) / jumpSamplerSec); // jump 单播：夹取到 1
    const toPhase = ((viewClock1 + dt2 + dt3) % idleSamplerSec) / idleSamplerSec;
    const dyFrom = dyAt(jumpClip, fromPhase, true, false);
    const dyTo = dyAt(idleClip, toPhase, false, true);
    const dyBlend = dyFrom * (1 - w) + dyTo * w;
    const m = renderer.draws[renderer.draws.length - 1].matrix;
    const placed = res.placed.get('hero')!;
    expect(placed.top).toBeCloseTo(420 - EXPECTED_HEIGHT + m[5] * dyBlend, 4);
    // 中点确实在两段之间（不是二选一、也不是再采一条跳跃曲线）
    expect(Math.abs(m[5] * dyBlend - m[5] * dyFrom)).toBeGreaterThan(1e-3);
  });
});
