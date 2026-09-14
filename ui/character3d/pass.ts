// T31-FE-A · ui/character3d/pass.ts —— render command → 全视口透明人物层 + placed 输出
//
// 方案口径：
//   §4.1「单一坐标出口」：本文件**禁**从 q/r 推屏幕坐标；只用命令里的 footX/footY/hopPx。
//        脚底锚 = footY - hopPx，缩放 = screenHeightPxAtReference / modelHeight（不按 bbox 每帧自适应）。
//   §4.2 六向：绕 Y 轴 yaw 由 config 的 sourceViewYawDeg 表推出；禁镜像/负 scale。
//   §4.3 层序：S1 只有主角是 3D，本 pass 产出**整张**透明人物层，2D 层在 hero 槽位只合成一次。
//        本 pass **不排序**（排序是 2D 层按 depthKey 的职责）；过渡期严禁同一角色同时画 2D 与 3D。
//   易错点 10：placed 的 bbox 必须与建矩阵用的是**同一组数**，否则 HUD 与技能钮漂移
//        —— 故 placed 与模型矩阵都由 buildPlacement 一处产出。
// 状态机的钟是 view 表现态（dt 由调用方喂），**与 session/结算零耦合**。

import type { Character3DPassResult, Character3DProfile, CharacterRenderCommand } from '../../types';
import { yawDegForFacing } from '../../config/character-3d';
import {
  CharacterAnimController,
  createPose,
  type Character3DAnimConfig,
  type Character3DPose,
} from './animation';
import type { Character3DModel } from './glb';
import { mat4, placementYawSquash } from './math';
import type { Character3DRenderer } from './renderer';
import type { PlatformImageSource } from './platform';

/** 一个 profile 的运行时装配（模型 + 已解码底色贴图 + 动作注册表）。 */
export interface Character3DProfileRuntime {
  profile: Character3DProfile;
  model: Character3DModel;
  anim: Character3DAnimConfig;
}

export interface Character3DPassOptions {
  renderer: Character3DRenderer;
  /** 视口尺寸（物理像素，= 离屏画布背衬尺寸） */
  viewport: { width: number; height: number };
  /** profileRuntimeKey → 运行时。S1 只有主角一条，但**接口按多角色设计**（方案 §0） */
  runtimes: Readonly<Record<string, Character3DProfileRuntime>>;
  /** 资源门状态：未就绪时 pass 返回 loading/failed，不画半成品 */
  loadState?: 'ready' | 'loading' | 'failed';
}

/** Canvas 2D 最小注入面（wx canvas 与浏览器 canvas 共用；避免本文件依赖具体宿主）。 */
export interface Canvas2DCompositeTarget {
  drawImage(image: PlatformImageSource, dx: number, dy: number): void;
}

export interface Character3DPass {
  render(commands: readonly CharacterRenderCommand[], dtSec: number): Character3DPassResult;
  /** 2D 世界层在 hero 的 depth 槽位**调用一次**：整张透明人物层一次 drawImage（方案 §4.3）。 */
  composite(target: Canvas2DCompositeTarget, dx: number, dy: number): boolean;
  /** 离屏画布本体（宿主 drawImage 需要它；wx/浏览器形状不同，由调用方按平台取用）。 */
  readonly canvas: PlatformImageSource;
  /** 当前活跃的动画控制器（诊断/测试用，只读） */
  readonly controllers: ReadonlyMap<string, CharacterAnimController>;
}

interface ActorView {
  controller: CharacterAnimController;
  pose: Character3DPose;
  scratchPose: Character3DPose;
}

export function createCharacter3DPass(options: Character3DPassOptions): Character3DPass {
  const { renderer, viewport, runtimes } = options;
  const actors = new Map<string, ActorView>();
  const diags: string[] = [];
  /** 摆放矩阵 scratch（每帧每单位复用同一个数组，与 probe 的零分配口径一致）。
   * ⚠ 渲染端 uniformMatrix4fv 在调用当时就把值送进 GL，故复用安全；但**调用方不得持有该引用**
   *   （上一单位的值会被下一个单位覆盖）。需要留档请自行复制。 */
  const matrix = mat4();

  function note(msg: string): void {
    if (diags.indexOf(msg) < 0) diags.push(msg);
  }

  function statusOf(): Character3DPassResult['status'] {
    if (options.loadState === 'failed') return 'failed';
    if (renderer.status === 'context-lost') return 'context-lost';
    if (renderer.status === 'failed' || renderer.status === 'disposed') return 'failed';
    if (options.loadState !== 'ready') return 'loading';
    return 'ready';
  }

  /** 每 actor 一套控制器 + 姿态缓冲（禁共享：共享会让两个单位的相位互相串）。 */
  function actorViewFor(actorId: string, runtime: Character3DProfileRuntime): ActorView {
    const existing = actors.get(actorId);
    if (existing) return existing;
    const created: ActorView = {
      controller: new CharacterAnimController({ ...runtime.anim }),
      pose: createPose(runtime.model),
      scratchPose: createPose(runtime.model),
    };
    actors.set(actorId, created);
    return created;
  }

  function render(commands: readonly CharacterRenderCommand[], dtSec: number): Character3DPassResult {
    const placed = new Map<string, { cx: number; top: number; w: number; h: number }>();
    const status = statusOf();
    if (status !== 'ready') {
      return {
        status,
        canvas: null,
        placed,
        diagnostics: combineDiagnostics(diags, renderer.diagnostics),
      };
    }

    const seen = new Set<string>();
    renderer.beginFrame();
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const runtime = runtimes[cmd.profileKey];
      if (!runtime) {
        note('unknown-profile:' + cmd.profileKey);
        continue;
      }
      seen.add(cmd.actorId);
      const view = actorViewFor(cmd.actorId, runtime);
      view.controller.update(dtSec, {
        state: cmd.state,
        isJump: cmd.isJump, // 轻功意图原样透传（禁 hopPx 猜，方案 §4.1）
        stateElapsedSec: cmd.stateElapsedSec,
        moveProgress: cmd.moveProgress,
      });
      const palette = view.controller.sample(runtime.model, view.pose, view.scratchPose);
      const yawDeg = yawDegForFacing(cmd.facing);
      const box = buildPlacement(matrix, cmd, runtime, yawDeg);
      // yaw 同源传两份消费者：摆放矩阵与光向变换（两处不得各算一次，否则会漂）
      renderer.drawUnit(palette, matrix, clampAlpha(cmd.alpha), yawDeg);
      placed.set(cmd.actorId, box);
      for (const d of view.controller.diagnostics) note(cmd.actorId + ':' + d);
    }
    renderer.endFrame();

    // 清掉本帧不在场的 actor（避免单位死亡后控制器与姿态缓冲常驻）
    for (const id of Array.from(actors.keys())) {
      if (!seen.has(id)) actors.delete(id);
    }

    return {
      status,
      canvas: { width: viewport.width, height: viewport.height },
      placed,
      diagnostics: combineDiagnostics(diags, renderer.diagnostics),
    };
  }

  /**
   * 摆放矩阵 + placed bbox：**同一处**产出（易错点 10）。
   * return 的 top/h 与矩阵用的 feetY/scale/squashY 完全同源。
   */
  function buildPlacement(
    out: Float32Array,
    cmd: CharacterRenderCommand,
    runtime: Character3DProfileRuntime,
    yawDeg: number,
  ): { cx: number; top: number; w: number; h: number } {
    const { profile, model } = runtime;
    const scale = profile.screenHeightPxAtReference / profile.modelHeight;
    const feetY = cmd.footY - cmd.hopPx; // 垂直位移唯一来自 pieceHop（方案 §4.1）
    const squashY = cmd.squashY > 0 ? cmd.squashY : 1;
    placementYawSquash(out, cmd.footX, feetY, scale, yawDeg, squashY);
    const h = profile.screenHeightPxAtReference * squashY;
    const xSpan = model.bounds.max[0] - model.bounds.min[0];
    const zSpan = model.bounds.max[2] - model.bounds.min[2];
    // 六向旋转会改变投影宽度：取 x/z 跨度较大者，避免转到侧向时 HUD 宽度偏窄
    const w = Math.max(xSpan, zSpan) * scale;
    return { cx: cmd.footX, top: feetY - h, w, h };
  }

  return {
    render,
    composite(target: Canvas2DCompositeTarget, dx: number, dy: number): boolean {
      if (statusOf() !== 'ready') return false;
      target.drawImage(renderer.canvas, dx, dy);
      return true;
    },
    get canvas() {
      return renderer.canvas;
    },
    get controllers() {
      const map = new Map<string, CharacterAnimController>();
      for (const [id, view] of actors) map.set(id, view.controller);
      return map;
    },
  };
}

function combineDiagnostics(a: readonly string[], b: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const x of a) if (out.indexOf(x) < 0) out.push(x);
  for (const x of b) if (out.indexOf(x) < 0) out.push(x);
  return out;
}

function clampAlpha(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
