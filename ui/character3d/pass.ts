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
import { HERO_3D_WEAPON_SHEATHED_ACTIONS, yawDegForFacing } from '../../config/character-3d';
import type { Character3DActionKey } from '../../config/character-3d';
import {
  calibrateWeaponAttachment,
  fistCenterLocalOf,
  tintSegmentsLinear,
  type WeaponAttachmentCalibration,
  type WeaponSegments,
} from './weapon';
import type { Character3DStaticMesh } from './glb';
import {
  CharacterAnimController,
  createPose,
  resetPose,
  resolvePose,
  type Character3DAnimConfig,
  type Character3DPose,
} from './animation';
import type { Character3DModel } from './glb';
import { mat4, mul, placementYawSquash, type Mat4 } from './math';
import type { Character3DRenderer } from './renderer';
import type { PlatformImageSource } from './platform';

/** 一个 profile 的运行时装配（模型 + 已解码底色贴图 + 动作注册表）。 */
export interface Character3DProfileRuntime {
  profile: Character3DProfile;
  model: Character3DModel;
  anim: Character3DAnimConfig;
}

/** 【T32】武器运行时：解析后的静态网格 + 分段 + 已解码贴图（装配期一次；GPU 资源由 renderer 共享，W7）。 */
export interface Character3DWeaponRuntime {
  assetId: string;
  mesh: Character3DStaticMesh;
  segments: WeaponSegments;
  vertexData: Float32Array;
}

export interface Character3DPassOptions {
  renderer: Character3DRenderer;
  /** 视口尺寸（物理像素，= 离屏画布背衬尺寸） */
  viewport: { width: number; height: number };
  /** profileRuntimeKey → 运行时。S1 只有主角一条，但**接口按多角色设计**（方案 §0） */
  runtimes: Readonly<Record<string, Character3DProfileRuntime>>;
  /** 资源门状态：未就绪时 pass 返回 loading/failed，不画半成品 */
  loadState?: 'ready' | 'loading' | 'failed';
  /** 【T32】武器运行时（可选）。不传 或 profile 未启用挂点 ⇒ 不画武器（既有行为零变化）。 */
  weapon?: Character3DWeaponRuntime | null;
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
  /** 【T32】运行时设置四段染色（**装备系统 WeaponSkin 契约的能力面**：一名/一武器一条配置；
   * 传 null = 全白合批。装配期从 profile 读一次，此接口供运行时换色与 W5 证据同帧对照）。 */
  setWeaponTints(tints: Record<string, string> | null): void;
  /** 【T32】武器本帧状态（诊断/证据面）：是否绘制 + 绘制单位 + 装配诊断 + 屏上关键点
   * （**禁**用于业务判定；关键点 = 武器矩阵对 pommel/grip/tip 三点的投影，物理像素，供 W4 屏长仪器）。 */
  readonly weaponState: {
    visible: boolean;
    actorId: string | null;
    enabled: boolean;
    diagnostics: readonly string[];
    screen: { pommel: [number, number]; grip: [number, number]; tip: [number, number] } | null;
  };
}

interface ActorView {
  controller: CharacterAnimController;
  pose: Character3DPose;
  scratchPose: Character3DPose;
}

/** 【T32】武器装配信息（每 profile runtime 一份；装配期解析，热路径只读）。 */
interface WeaponRig {
  enabled: boolean;
  /** 挂点骨节点下标（-1 = 未解析/缺失） */
  handNode: number;
  /** 挂点标定（M/锚点/k/拳心；null = 未启用） */
  calibration: WeaponAttachmentCalibration | null;
  anchorLocal: readonly [number, number, number] | null;
  /** 四段线性染色（null = 全白合批，W5） */
  tints: readonly Float32Array[] | null;
  /** W6 甲：命中即**收剑**的动作键（移动演出/轻功） */
  sheathedActions: ReadonlySet<Character3DActionKey>;
  segments: WeaponSegments | null;
  attachmentName?: string;
  reason?: string;
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
  /** 【T32 证据面】本帧武器是否绘制（last-drawn 镜像；供宿主/证据脚本读） */
  let lastWeaponVisible = false;
  let lastWeaponActor: string | null = null;
  /** 【T32 证据面】本帧武器矩阵对三关键点的投影（物理像素；W4 屏长仪器用） */
  let lastWeaponScreen: { pommel: [number, number]; grip: [number, number]; tip: [number, number] } | null = null;
  const rootInfos = new Map<Character3DProfileRuntime, ProfileRootInfo>();
  /** profile 运行时 → 武器装配信息（T32：挂点骨索引 + 拳心 + M + 可见性表；**装配期一次**） */
  const weaponRigs = new Map<Character3DProfileRuntime, WeaponRig>();
  /** 每单位一次的 uModel scratch（placement × handWorld × M；与 matrix 同理复用安全） */
  const weaponMatrix = mat4();
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

  /**
   * 武器装配（T32 · 方案 §3/§4）：**装配期**解析挂点骨 + 拳心 + 合成 M（禁逐帧）。
   * 失败一律「无剑 + 诊断」（方案 §6 裁定：武器失败不阻塞战斗；角色失败才阻塞）。
   */
  function weaponRigOf(runtime: Character3DProfileRuntime): WeaponRig {
    const hit = weaponRigs.get(runtime);
    if (hit) return hit;
    const rig: WeaponRig = {
      enabled: false,
      handNode: -1,
      calibration: null,
      anchorLocal: null,
      tints: null,
      sheathedActions: new Set(HERO_3D_WEAPON_SHEATHED_ACTIONS),
      segments: null,
    };
    const weapon = options.weapon ?? null;
    const attachments = runtime.profile.attachments ?? {};
    const entry = Object.entries(attachments).find(([, att]) => att.enabled === true && att.assetId === weapon?.assetId);
    if (!weapon) {
      rig.reason = 'weapon-not-injected';
    } else if (!entry) {
      rig.reason = 'attachment-disabled-or-mismatch';
    } else {
      const [name, att] = entry;
      if (att.assetId !== weapon.assetId) {
        rig.reason = 'asset-mismatch';
      } else {
        const nodes = runtime.model.nodes.trs;
        let handNode = -1;
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].name === att.bone) {
            handNode = i;
            break;
          }
        }
        const jointIndexInSkin = handNode >= 0 ? runtime.model.jointNodes.indexOf(handNode) : -1;
        if (handNode < 0 || jointIndexInSkin < 0) {
          // 方案 §3.4：换模型/换骨名 ⇒ 装配期 fail-fast，**禁静默空挂**（此处按 §6 降级为诊断 + 不画）
          rig.reason = 'hand-bone-missing:' + att.bone;
          note('weapon-' + rig.reason);
        } else {
          // 【T32 · 审核必修 1】挂点标定/染色解析是**独立失败边界**：任何异常都不得冒泡出 render
          //（方案 §6 裁定：武器失败 = 无剑 + 诊断，不阻塞战斗；角色照常 ready）。
          try {
            // 绑定姿势（rest）下取一次手骨世界矩阵 + 拳心（rest 时几何 = 绑定姿势）
            const restPose = createPose(runtime.model);
            resetPose(restPose, runtime.model);
            resolvePose(runtime.model, restPose);
            const fist = fistCenterLocalOf(runtime.model.mesh, restPose.worldV[handNode], jointIndexInSkin);
            const calibration = calibrateWeaponAttachment(
              att,
              runtime.profile.modelHeight,
              fist.center,
              fist.vertexCount,
            );
            rig.enabled = true;
            rig.handNode = handNode;
            rig.calibration = calibration;
            rig.anchorLocal = calibration.anchorLocal;
            rig.tints = tintSegmentsLinear(att.tints);
            rig.attachmentName = name;
            rig.segments = weapon.segments;
            note('weapon-ready:' + name + ':' + weapon.assetId);
            note('weapon-k=' + calibration.scale.toFixed(6) + ':ch=' + calibration.charHeightModel.toFixed(6));
          } catch (error) {
            rig.enabled = false;
            rig.reason = 'weapon-calibration-failed';
            note('weapon-calibration-failed:' + name + ':' + (error instanceof Error ? error.message : String(error)));
          }
        }
      }
    }
    weaponRigs.set(runtime, rig);
    return rig;
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
    lastWeaponVisible = false;
    lastWeaponActor = null;
    lastWeaponScreen = null;
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
      // ---- 【T32】武器（静态网格）第二条 draw：uModel = placement × worldV[挂点骨] × M ----
      // 可见性读**控制器解析后的动作键**（含轻功闩锁 / hit 继承；读快照必错——轻功期间快照是 walk）
      // 规则表在 config（W6 甲：移动演出期间收剑）。
      const rig = weaponRigOf(runtime);
      if (rig.enabled && rig.calibration && !rig.sheathedActions.has(view.controller.actionKey)) {
        // 【T32 · 审核必修 1】逐帧武器绘制同属失败边界：任何异常只关掉本 rig 并记诊断，不冒泡出 render
        try {
          mul(weaponMatrix, matrix, view.pose.worldV[rig.handNode]);
          mul(weaponMatrix, weaponMatrix, rig.calibration.localMatrix);
          renderer.drawWeapon(weaponMatrix, clampAlpha(cmd.alpha), rig.tints);
          lastWeaponVisible = true;
          lastWeaponActor = cmd.actorId;
          // 证据面（W4 屏长仪器）：武器矩阵对「柄头 / 握点 / 剑尖」三点的投影（物理像素）
          const entry = runtime.profile.attachments?.[rig.attachmentName ?? 'right-hand-blade'];
          const gripPoint = entry?.gripLocal ?? [0, 0, 0];
          const tipY = options.weapon?.mesh.bounds?.max?.[1] ?? 1;
          lastWeaponScreen = {
            pommel: point2(weaponMatrix, 0, 0, 0),
            grip: point2(weaponMatrix, gripPoint[0], gripPoint[1], gripPoint[2]),
            tip: point2(weaponMatrix, 0, tipY > 0 ? tipY : 1, 0),
          };
        } catch (error) {
          rig.enabled = false;
          rig.reason = 'weapon-draw-failed';
          lastWeaponVisible = false;
          lastWeaponScreen = null;
          note('weapon-draw-failed:' + (error instanceof Error ? error.message : String(error)));
        }
      }
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
    setWeaponTints(tints: Record<string, string> | null): void {
      // 缺省段补 #ffffff（装备系统只写「要改的那几段」；null/空 = 全白合批）
      const full = tints
        ? { blade: '#ffffff', guard: '#ffffff', grip: '#ffffff', pommel: '#ffffff', ...tints }
        : null;
      const parsed = tintSegmentsLinear(full as never);
      for (const rig of weaponRigs.values()) rig.tints = parsed;
    },
    get weaponState() {
      const rigs = Array.from(weaponRigs.values());
      const enabled = rigs.some((r) => r.enabled);
      return {
        visible: lastWeaponVisible,
        actorId: lastWeaponActor,
        enabled,
        diagnostics: rigs.map((r) => (r.enabled ? 'enabled:' + String(r.attachmentName) : 'disabled:' + String(r.reason))),
        screen: lastWeaponScreen,
      };
    },
  };
}

function combineDiagnostics(a: readonly string[], b: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const x of a) if (out.indexOf(x) < 0) out.push(x);
  for (const x of b) if (out.indexOf(x) < 0) out.push(x);
  return out;
}

/** 【T32 证据面】武器矩阵投影一个模型空间点 → 屏幕物理像素 [x,y]（列主序）。 */
function point2(m: Mat4, x: number, y: number, z: number): [number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
  ];
}

function clampAlpha(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
