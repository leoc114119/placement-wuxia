// T31-FE-A · ui/character3d/pass.ts —— render command → 全视口透明人物层 + placed 输出
//
// 方案口径：
//   §4.1「单一坐标出口」：本文件**禁**从 q/r 推屏幕坐标；只用命令里的 footX/footY/hopPx。
//        脚底锚 = footY - hopPx，缩放 = screenHeightPxAtReference / modelHeight（不按 bbox 每帧自适应）。
//   §4.1.1（R2 · seq=438 取「甲」）`command.footX/footY` = **地面锚**，`placed` = **HUD 布局框**：
//        采样完成（含交叉混合）后，用该帧同一份最终 pose 求 Root 相对 rest 的平移增量，经父节点变换
//        与摆放矩阵的**线性部分**投影成物理像素 delta，加到 baseTop/baseCx 上（宽高沿既有稳定参考框）。
//        该补偿**只用于 placed**——人物矩阵/palette 不再额外平移（禁双抬升）。Root 索引装配期解析，
//        禁每帧 readPixels、禁 CPU 全网格蒙皮。
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
  resetPose,
  resolvePose,
  type Character3DAnimConfig,
  type Character3DPose,
} from './animation';
import type { Character3DModel } from './glb';
import { mat4, placementYawSquash, type Mat4 } from './math';
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

/** Root 节点装配信息（方案 §4.1.1）：**装配期**解析一次并缓存，热路径只读。 */
interface ProfileRootInfo {
  /** Root 节点下标（-1 = 模型无 'Root' 节点 ⇒ 不施加姿态补偿，placed 回到纯几何框） */
  nodeIndex: number;
  /** Root 的静止（rest）**世界**平移（模型空间三轴）：姿态增量 = 当帧世界平移 − 本值 */
  restWorldT: Float32Array;
}

export function createCharacter3DPass(options: Character3DPassOptions): Character3DPass {
  const { renderer, viewport, runtimes } = options;
  const actors = new Map<string, ActorView>();
  const diags: string[] = [];
  /** profile 运行时 → Root 装配信息（§4.1.1「Root 节点索引装配期解析」；禁每帧扫树） */
  const rootInfos = new Map<Character3DProfileRuntime, ProfileRootInfo>();
  /** 摆放矩阵 scratch（每帧每单位复用同一个数组，与 probe 的零分配口径一致）。
   * ⚠ 渲染端 uniformMatrix4fv 在调用当时就把值送进 GL，故复用安全；但**调用方不得持有该引用**
   *   （上一单位的值会被下一个单位覆盖）。需要留档请自行复制。 */
  const matrix = mat4();

  function note(msg: string): void {
    if (diags.indexOf(msg) < 0) diags.push(msg);
  }

  /** Root 节点下标 + rest 世界平移（装配期一次；无 Root 节点 ⇒ 记诊断并退化为零补偿）。 */
  function rootInfoOf(runtime: Character3DProfileRuntime): ProfileRootInfo {
    const hit = rootInfos.get(runtime);
    if (hit) return hit;
    const nodes = runtime.model.nodes.trs;
    let nodeIndex = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].name === 'Root') {
        nodeIndex = i;
        break;
      }
    }
    let restWorldT = new Float32Array(3);
    if (nodeIndex < 0) {
      note('no-root-node');
    } else {
      // 静止姿态解一次：rest 世界平移是「姿态增量」的基准（模型无额外父变换 ⇒ 与 rest 局部平移同值）
      const restPose = createPose(runtime.model);
      resetPose(restPose, runtime.model);
      resolvePose(runtime.model, restPose);
      const w = restPose.worldV[nodeIndex];
      restWorldT = Float32Array.from([w[12], w[13], w[14]]);
    }
    const info: ProfileRootInfo = { nodeIndex, restWorldT };
    rootInfos.set(runtime, info);
    return info;
  }

  /**
   * 本帧最终姿态的 Root 平移增量 → 屏幕**物理像素** delta（方案 §4.1.1，arch seq=438 取「甲」）。
   * · 基准 = Root 的 rest 世界平移（装配期解析）；增量在**模型空间**取、来自含交叉混合的同一份 pose；
   * · 投影 = **人物摆放矩阵的线性部分**（列主序 3×3；存在父节点旋转/缩放时自动正确）——
   *   现役主角无额外父变换 ⇒ `deltaY = m[5]·dy = −scale·squashY·dy`，与方案简式逐字一致；
   * · ★ 该 delta **只喂 placed**：人物矩阵/palette 不得再平移一次（禁双抬升）。
   */
  function rootDeltaPxOf(m: Mat4, info: ProfileRootInfo, pose: Character3DPose): { x: number; y: number } {
    if (info.nodeIndex < 0) return { x: 0, y: 0 };
    const w = pose.worldV[info.nodeIndex];
    const dx = w[12] - info.restWorldT[0];
    const dy = w[13] - info.restWorldT[1];
    const dz = w[14] - info.restWorldT[2];
    return {
      x: m[0] * dx + m[4] * dy + m[8] * dz,
      y: m[1] * dx + m[5] * dy + m[9] * dz,
    };
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
      const box = buildPlacement(matrix, cmd, runtime, yawDeg, view.pose);
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
   * return 的 top/h 与矩阵用的 feetY/scale/squashY 完全同源；
   * 【§4.1.1】top/cx 再叠加**本帧最终姿态的 Root 平移增量**（只进 placed，不进矩阵）。
   */
  function buildPlacement(
    out: Float32Array,
    cmd: CharacterRenderCommand,
    runtime: Character3DProfileRuntime,
    yawDeg: number,
    pose: Character3DPose,
  ): { cx: number; top: number; w: number; h: number } {
    const { profile, model } = runtime;
    const scale = profile.screenHeightPxAtReference / profile.modelHeight;
    // 地面锚（§4.1.1：command.footX/footY 是地面锚，语义不随本批变化）：
    // 3D 轻功 hopPx 恒 0 ⇒ 该式 = cmd.footY；未迁移 2D 路径的 hop 仍在此计一次。
    const feetY = cmd.footY - cmd.hopPx;
    const squashY = cmd.squashY > 0 ? cmd.squashY : 1;
    placementYawSquash(out, cmd.footX, feetY, scale, yawDeg, squashY);
    const h = profile.screenHeightPxAtReference * squashY;
    const xSpan = model.bounds.max[0] - model.bounds.min[0];
    const zSpan = model.bounds.max[2] - model.bounds.min[2];
    // 六向旋转会改变投影宽度：取 x/z 跨度较大者，避免转到侧向时 HUD 宽度偏窄
    const w = Math.max(xSpan, zSpan) * scale;
    // ★ §4.1.1：HUD 布局框 = 稳定参考框（baseTop/baseCx）＋ 最终姿态 Root 增量（矩阵线性部分投影）。
    //   宽高不按逐帧衣摆/手脚 bbox 重定尺；rest 位移不重复计入（增量本身已相对 rest）。
    const delta = rootDeltaPxOf(out, rootInfoOf(runtime), pose);
    return { cx: cmd.footX + delta.x, top: feetY - h + delta.y, w, h };
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
