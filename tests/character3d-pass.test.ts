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
import { heroClipRegistry, heroModel } from './character3d-fixtures';

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
  it('脚底锚 = footY - hopPx；placed.top = 脚底 − 参考屏高（同源）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    const res = pass.render([command({ footY: 420, hopPx: 0 })], 0.016);
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
    const res = pass.render([command({ footY: 420, hopPx: 88 })], 0.016);
    const placed = res.placed.get('hero');
    expect(placed?.top).toBeCloseTo(420 - 88 - EXPECTED_HEIGHT, 10);
    expect(renderer.draws[0].matrix[13]).toBeCloseTo(420 - 88, 5);
  });

  it('squashY 压扁：高度与顶部同步缩放，脚底不动（死亡压扁仍落原格）', () => {
    const renderer = createStubRenderer();
    const pass = makePass(renderer);
    const res = pass.render([command({ footY: 420, squashY: 0.5 })], 0.016);
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
