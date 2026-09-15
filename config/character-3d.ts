// T31-FE-A · 2.5D 角色运行时配置（frontend 表现层）
//
// 真源：《2.5D角色运行时接入技术方案》v1.0 —— §3 冻结契约 / §4.2 六向 / §5 动作映射 /
//   §6 CDN 清单与缓存 / §7 管线与抗锯齿。与旧文档冲突处以该方案为准。
//
// 铁律：
//   ① **全部时长与画质常量集中在本文件**（方案 §5 末句、§3 末段）——渲染文件禁散落数字；
//   ② 本文件只放**只读展示参数**（ADR-004 同口径）：不含任何结算公式；动作 timeScale 只控制表现，
//      不改 session / 事件 / 伤害 / 出招结算时钟（方案 §5 末句、易错点 12）；
//   ③ urlPath 恒为**相对**已批准 CDN base URL；base URL 由环境配置注入 loader（方案 §6.1），
//      本文件与一切业务代码**禁**出现完整 URL。
//
// 资产账（唯一真源 = assets/characters/hero/model/README.md，2026-09-14）：
//   模型 hero_48k_20260914.glb：48,419 三角面 / 41 骨 / 1 mesh / 1 材质 / 1 primitive /
//   3 × 4096² JPEG；SHA-256 = ff9202b4…f816f0，4,040,728 B。模型无指骨、无武器（剑需另备 3D 资产）。

import { CAST_FRAME_PERIOD_MS, CHOREO, PIECE, TILE_H } from './battle-hex';
import type {
  BattleAnimState,
  BattleFacingHex,
  Character3DAssetRef,
  Character3DClipKey,
  Character3DProfile,
  SnapshotActor,
} from '../types';

/** profile 键（= CharacterRenderCommand.profileKey；S1 仅主角一条）。 */
export const HERO_3D_PROFILE_ID = 'hero-3d';

/** spriteKey → 3D profile 键（方案 §3 末段：由**本配置**决定该键走 3D 还是现有 2D profile）。
 * S1 只把 hero 切到 3D；敌型键不在此表内 ⇒ 继续走 config/battle-hex 的 2D directional profile。 */
export const CHARACTER_3D_PROFILE_BY_SPRITE_KEY: Readonly<Record<string, string>> = {
  hero: HERO_3D_PROFILE_ID,
};

/** 模型资产硬指标（方案 §6.2：41 骨 / 1 primitive 不符 ⇒ 不使用该文件，也不覆盖 last-known-good）。
 * 数值与 tools/glb2d 出帧链路同源，是 profile 门检与 loader 结构校验的同一份真值。 */
export const HERO_3D_MODEL_ACCOUNT = {
  triangleCount: 48419,
  vertexCount: 29281,
  jointCount: 41,
  primitiveCount: 1,
  meshCount: 1,
  materialCount: 1,
  textureCount: 3,
  bufferBytes: 3974376,
} as const;

/** 模型自带动画（GLB 内嵌）契约：名字、关键帧数与可用时间窗均**实测自 GLB 本体**（2026-09-14 解析复核）。
 * ★ 关键帧自 **1/24 s** 起（24fps 采样），**不是** 0，也不是出帧链路的 1/30 —— 相位 0 必须落在
 *   firstKeyTimeSec，否则首帧会被夹到最前段、动作整段偏移（本值由 character3d-profile.test 对解析结果锁定）。
 * 采样方式实测：Root/Pelvis 等 26 条旋转为 STEP（段内保持），四肢 15 条为 LINEAR（31/57 关键帧）——
 *   故嵌入 clip 采样必须按 sampler 自己的 interpolation 走，禁一律 nlerp（见 ui/character3d/animation）。
 * 播放窗 = lastKeyTimeSec − firstKeyTimeSec（walk 2.3333s / run 1.25s）。 */
export const HERO_3D_EMBEDDED_CLIPS = {
  walk: { name: 'preset:biped:walk', keyCount: 57, firstKeyTimeSec: 1 / 24, lastKeyTimeSec: 2.375 },
  run: { name: 'preset:biped:run', keyCount: 31, firstKeyTimeSec: 1 / 24, lastKeyTimeSec: 1.2916666666666667 },
} as const;

/** 重定向动作源时长（秒）= 各 anim/*.json 的 duration 字段逐字值（30fps × nFrames，
 * nFrames=200/45/136/46）。资产侧不裁时长，实际演出快慢由本文件的播放窗控制（README「★给 runtime 的接口要求」）。 */
export const HERO_3D_CLIP_SOURCE_SEC = {
  idle: 6.666666666666667,
  atk: 1.5,
  cast: 4.533333333333333,
  jump: 1.5,
} as const;

/** 资产引用工厂：url 内容版本化（方案 §6.1「URL 必须内容版本化，禁止覆盖同 URL 内容」）——
 * 版本目录取该资产自身 SHA-256 前 12 位，同一 assetId 换内容必然换 URL。 */
function assetRef(
  id: string,
  sha256: string,
  byteLength: number,
  fileName: string,
  mediaType: Character3DAssetRef['mediaType'],
): Character3DAssetRef {
  return {
    id,
    urlPath: `characters/hero/${sha256.slice(0, 12)}/${fileName}`,
    sha256,
    byteLength,
    mediaType,
  };
}

/** 现役主角模型（48k）。SHA 与 byteLength 是 loader 的下载后校验真值。 */
export const HERO_3D_MODEL_REF: Character3DAssetRef = assetRef(
  'hero-model-48k-20260914',
  'ff9202b48470c92ccdad0333108e77e193a4135f873ce68e7e3498e979f816f0',
  4040728,
  'hero_48k_20260914.glb',
  'model/gltf-binary',
);

/** 动作资产（方案 §5 表）：idle/atk/cast/jump 走 CDN json；walk 为 GLB 内嵌预设。 */
export const HERO_3D_CLIP_REFS: Readonly<Record<Character3DClipKey, Character3DAssetRef | { embedded: string }>> = {
  idle: assetRef(
    'hero-clip-idle-v4',
    '0d3262385d45febcb2930318baf74346340d3e9ccac9c8c607ac59a819171766',
    726299,
    'idle_v4.json',
    'application/json',
  ),
  // 【T31 FE · P0-B】移动槽位（快照 animState='walk'）**改播 GLB 内嵌 run**：
  // 源视角表与其它槽位不变；只换嵌入式资产名（按名字取，禁按序号）。
  walk: { embedded: HERO_3D_EMBEDDED_CLIPS.run.name },
  atk: assetRef(
    'hero-clip-atk-v4',
    '546ec94f99065cc2779cf479dbb8821a101beca1851e6aeb1028b741dbfb5bd1',
    162924,
    'atk_v4.json',
    'application/json',
  ),
  cast: assetRef(
    'hero-clip-cast-v4',
    '3bca2412358226236a19f908952502adc50c799d7bbc499d34341b4ddc446448',
    490227,
    'cast_v4.json',
    'application/json',
  ),
  jump: assetRef(
    'hero-clip-jump-v6-1p5s',
    '2895612562c2a2b8bad8858e08bfbc2d90985a15a10c41172b50d538ef6222e5',
    166799,
    'jump_v6_1p5s.json',
    'application/json',
  ),
};

/** 六向 → **源视角 yaw**（方案 §4.2 表；沿已验证出帧方向表冻结，禁改）。
 * 运行时单位绕 Y 轴旋转由 ui/character3d/math 的 yawDegForFacing 按规范化口径推出：
 * `normalizeSigned(270° - sourceViewYawDeg[facing])` ⇒ right=0 / rightdown=45 / rightup=-45 /
 * left=180 / leftdown=135 / leftup=-135。**禁止运行时镜像模型或负 scale**（方案 §4.2 末句）。 */
export const HERO_3D_SOURCE_VIEW_YAW_DEG: Readonly<Record<BattleFacingHex, number>> = {
  right: 270,
  rightdown: 225,
  rightup: 315,
  left: 90,
  leftdown: 135,
  leftup: 45,
};

/**
 * 六向 → 模型绕 Y 轴旋转角（度）。派生自**本文件的**源视角表；测试逐向锁定。
 *
 * ★【T31 FE 朝向整改】公式为 `normalizeSigned(源视角yaw − 180)`，替换旧口径 `270 − 源视角yaw`。
 *   推导依据（**实测基准 + 代数**，不是试错调参；证据：`proto/battle_demo/shots/face_*.png` 与
 *   `tools/measure_facing_runtime.mjs` 的肤/发重心判据）：
 *   ① 运行时正交相机固定：`orthoPixel` 的 z 映射为 `−z/zHalf`（z 越大越靠近相机）⇒ 相机在 **+Z** 看 **−Z**；
 *   ② θ=0 时实拍看到人物**正面**（face_right.png，肤/发重心对称且肤色占比最高）⇒ 模型自身前向 = **+Z**；
 *   ③ 美术参照帧语义（实测 + 目验）：`battle_idle_leftup` 是**背面** ⇒ 帧名 up/down 为标准 RPG 语义
 *      （down=朝观众、up=背向观众），且 `battle_idle_left` = 纯左profile（肤/发重心 = −29.9）；
 *   ④ 于是人物前向 `F(θ) = R_y(θ)·(0,0,1) = (sinθ, 0, cosθ)`（屏幕 x 向右、z 朝相机）。逐向要求：
 *      right ⇒ F=+X ⇒ θ=+90；left ⇒ θ=−90；rightdown ⇒ (+x,+z) ⇒ +45；rightup ⇒ (+x,−z) ⇒ +135；
 *      leftdown ⇒ (−x,+z) ⇒ −45；leftup ⇒ (−x,−z) ⇒ −135；
 *   ⑤ 与源视角表逐向对上：`θ = normalizeSigned(源视角yaw − 180)`。
 *   旧口径 `270 − 源视角yaw` 是**反射**而非常数偏置 ⇒ 六向整体错位、左右不成镜像、上下互换
 *   （实测：旧口径下 right 渲成正面、left 渲成背面）。**禁**再回到旧式。
 */
export function yawDegForFacing(facing: BattleFacingHex): number {
  return normalizeSignedDeg(HERO_3D_SOURCE_VIEW_YAW_DEG[facing] - 180);
}

/** 把角度夹到 (-180, 180]（180 保留为 +180：方案 §4.2 明文 left=180°，非 -180°）。
 * 与旋转语义等价区间一致，但**保留方案给的数值形状**，便于逐向验收对表。 */
export function normalizeSignedDeg(deg: number): number {
  let v = deg % 360;
  if (v > 180) v -= 360;
  else if (v <= -180) v += 360;
  return v;
}

/** 挂点（方案 §11）：从 S1 预留，**素材不过双门不得启用**。
 * assetId 暂空 = 3D 剑素材尚未生产（README「已知边界：模型无武器」）；
 * localMatrix = 单位阵（未定标），过门前不得填值、不得置 enabled=true。 */
export const HERO_3D_ATTACHMENTS: Character3DProfile['attachments'] = {
  'right-hand-blade': {
    bone: 'R_Hand',
    assetId: '',
    enabled: false,
    localMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  },
};

/** 主角 3D profile（清单随代码发布；payload 走 CDN）。 */
export const HERO_3D_PROFILE: Character3DProfile = {
  mode: 'webgl2-skinned',
  model: HERO_3D_MODEL_REF,
  clips: HERO_3D_CLIP_REFS,
  jointCount: 41,
  primitiveCount: 1,
  /** 模型静止姿态 bbox 高（模型单位）= accessor.min/max 的 y 跨度 0.9814453 - 0.0003661；
   * 用于把人物缩放到参考屏高，**禁**按 bbox 每帧自适应（方案 §4.1）。 */
  modelHeight: 0.98107916326262057,
  /** 参考屏高（**逻辑像素**；= 2D 世界层的逻辑坐标口径）：沿既有 PIECE 定尺——格高 TILE_H ×
   * PIECE.heightPerTile。与观感台默认人高 123px 同档（assets/_trial_20260913/look_webgl3d 的 curH=123）。
   * 【T31-FE-B · R2 = arch seq=418 Q2-1】本值是**逻辑**参考高；GL 正交像素空间是物理像素，故宿主在
   * 装配 pass 时统一乘一次 pixelRatio（运行时 profile 副本 = 物理参考高），pass 内禁再乘第二次。
   * 旧注释「画布物理像素」是错误口径（会误导成 pass 侧重复换算 → hidpi 下人物 ×dpr 过大）。 */
  screenHeightPxAtReference: TILE_H * PIECE.heightPerTile,
  sourceViewYawDeg: HERO_3D_SOURCE_VIEW_YAW_DEG,
  attachments: HERO_3D_ATTACHMENTS,
};

// ===== 动作映射（方案 §5 表）=====

/** 动作键 = session 的 animState ∪ {jump}。
 * jump 不是 BattleAnimState 成员：轻功移动在快照里是 `animState='walk' + SnapshotActor.isJump=true`，
 * 3D 侧由 CharacterRenderCommand 的 **isJump**（= 该次移动演出创建时锁定的意图）识别并**闩锁**本次移动
 * 窗口，详见 animation。【T31-FE-B · R1 = arch seq=418 修订乙】旧注释「由 hopPx 识别」是错误口径——
 * 抛物线起落两点 hop 恰为 0，且 session 的 isJump 窗（300ms）短于演出（0.6~1.2s），两者都不能当判据。 */
export type Character3DActionKey = BattleAnimState | 'hit' | 'dead' | 'jump';

/** 归一化位置的推进源（时钟一律来自 view 表现态，方案 §4.1「混合钟属于 view 表现态」）：
 * - `viewClock`：view 演出钟（循环相位）；
 * - `stateElapsed`：快照 stateElapsedSec 归一化进 playWindowSec；
 * - `moveProgress`：快照 moveProgress 0→1 直接映射（jump 专用，方案 §5 末行）；
 * - `hold`：停在固定归一化位置（dead=idle 首帧）。 */
export type Character3DProgressSource = 'viewClock' | 'stateElapsed' | 'moveProgress' | 'hold';

/** 分段线性锚点：`p` = 演出/墙钟归一进度，`phase` = 该处的素材相位（方案 §4.1.2(2) 锚表）。
 * 锚值全部落本文件（渲染层禁散落数字）。 */
export interface Character3DPhaseAnchor {
  readonly p: number;
  readonly phase: number;
}

/** 素材 root y **正段**增益（方案 §4.1.2(4)，口径变更：arch 前「不加系数、沿素材」已废止）。
 * `gain` 施于 y>0 段（y≤0 段 ×1，深蹲深度不变）；`bandRatio` = 过零线性渐入带的上沿
 * （= 素材 root y 峰值 × 本比例，峰值在 clip 解析期求得，禁硬编码绝对值），防过零处速度折点。 */
export interface Character3DRootYGain {
  readonly gain: number;
  readonly bandRatio: number;
}

/** 单个动作槽位的播放规则（字段逐条对应方案 §5 表，本文件之外禁写时长）。 */
export interface Character3DActionSpec {
  /** 目标资产槽位；null = 不切专用动作（hit 沿用当前 clip，方案 §5 hit 行）。 */
  readonly clip: Character3DClipKey | null;
  readonly progressSource: Character3DProgressSource;
  /** 循环播（idle/walk/charge）还是播到窗尾保持（basic 尾帧保持至状态退出）。 */
  readonly loop: boolean;
  /** 归一化播放窗（秒）：把**整段源**映射到该窗内播完；null = 按源时长 1:1。 */
  readonly playWindowSec: number | null;
  /** 归一化起点 [0,1)：出招槽位的起播位置（strike startRatio=1 ⇒ 末姿保持）。
   *  【v1.1 历史口径】曾为 strike「从 2/3 起播到末尾」（兼容既有 cast2→3 帧语义）。 */
  readonly startRatio: number;
  /** 根位移策略（方案 v1.1 §4.1）：
   *  · `'track'` = 按源叠加 rootTrack 三轴增量（walk 等）；
   *  · `'zero-xz'` = **只清水平增量、保留 y**（jump：`Root.translation = rest + [0, sampledY, 0]`，
   *    竖直唯一来源＝素材；不得抹掉 rest 平移、不钳负 y 蹲姿）；
   *  · `'zero'` = 只留静止位移（历史口径，防双跳时代用过；当前无调用方）。 */
  readonly rootMotion: 'track' | 'zero' | 'zero-xz';
  /** 单播端点策略（方案 v1.1 §4.1，jump 专用）：true ⇒ 采样 `fi = phase × (nFrames − 1)`，
   *  phase=1 **正好落末帧**（46 帧 ⇒ fi=0/22.5/45）；缺省 false = `phase × nFrames` 夹取（其它 clip 不变）。 */
  readonly endpointInclusive?: boolean;
  /** 【R2-1 · §4.1.2(2)】素材相位重映射锚表（缺省 = 进度即相位）：演出进度 p → 素材相位 φ，分段线性。
   * 仅 jump 声明（深蹲压缩 / 滞空扩展 / 落地缓冲，见 CHARACTER_3D_JUMP_PHASE_ANCHORS）。 */
  readonly phaseAnchors?: readonly Character3DPhaseAnchor[];
  /** 【R2-1 · §4.1.2(4)】素材 root y 正段增益（缺省 = 不加系数）。 */
  readonly rootYGain?: Character3DRootYGain;
  /** 进入本状态时是否重置混合（dead 不混回，方案 §5 末段）。 */
  readonly crossFadeOnEnter: boolean;
}

/** 3D 轻功**水平通道**（方案 §4.1.2(3)）：位移只发生在腾空段——深蹲期脚不离地即恒 0（禁滑步）、
 * 落地缓冲原地完成；两端水平速度为零（smoothstep）。`h(p)`：p ≤ start 恒 0 / 中段 smoothstep / p ≥ end 恒 1。
 * MoveAnim 创建时**仅对 3D 轻功**（isJumpMove 且 hopHeight=0）写入本通道；2D 敌型路径插值零改动。 */
export interface Character3DJumpChannel {
  readonly moveStartP: number;
  readonly moveEndP: number;
}

/** 水平通道进度（纯函数；MoveAnim 唯一消费点与用例共用，禁第二处实现）。 */
export function jumpChannelProgressH(p: number, channel: Character3DJumpChannel): number {
  if (!(p > channel.moveStartP)) return 0;
  if (p >= channel.moveEndP) return 1;
  const t = (p - channel.moveStartP) / (channel.moveEndP - channel.moveStartP);
  return t * t * (3 - 2 * t); // smoothstep：两端速度为零
}

/** charge / strike 共用的 cast 循环周期：一轮 = 既有 cast 三帧节拍 3 × CAST_FRAME_PERIOD_MS = 840ms
 *（方案 §5 charge/strike 行；不参与结算时点）。 */
export const HERO_3D_CAST_CYCLE_SEC = (3 * CAST_FRAME_PERIOD_MS) / 1000;

/** strike 归一起点 = 2/3（cast2→3 兼容，方案 §5 strike 行）。 */
export const HERO_3D_STRIKE_START_RATIO = 2 / 3;

/** strike 段表现窗（秒）= **一个** cast 帧周期 280ms。
 * 依据：charge 的 840ms 一轮 = 三帧节拍三等分；strike 只走最后一等分（2/3 → 1），
 * 故走完这一等分的时间 = 一个 CAST_FRAME_PERIOD_MS，与既有 cast2→3 一拍在时长上等价
 *（也与 CHOREO.strikeSec=0.3 的收招窗同量级）。 */
export const HERO_3D_STRIKE_WINDOW_SEC = CAST_FRAME_PERIOD_MS / 1000;

/** 【R2-1 · §4.1.2(1)】3D 轻功**演出窗**（秒）：1.0 演出秒（x1 墙钟 1.0s；x2 沿既有演出钟 0.5s，
 * 禁额外距离倍率）。与素材源时长（1.5s）**解耦**——由本条相位重映射与增益承担观感，
 * 故**禁止**再由 HERO_3D_CLIP_SOURCE_SEC.jump 派生（旧口径 1.5 已废止）。 */
export const CHARACTER_3D_JUMP_MOVE_SEC = 1.0;

/** 【R2-1 · §4.1.2(2)】轻功素材相位锚表（演出进度 p → 素材相位 φ，分段线性）：
 *   深蹲蓄势（素材 0~0.44）压缩进 0.25s ／ 腾空滞空（素材 0.44~0.73）扩展为 0.50s ／
 *   落地缓冲（素材 0.73~1）0.25s。锚值全部落此处（渲染层禁散落数字）。 */
export const CHARACTER_3D_JUMP_PHASE_ANCHORS: readonly Character3DPhaseAnchor[] = [
  { p: 0.0, phase: 0.0 },
  { p: 0.25, phase: 0.44 },
  { p: 0.75, phase: 0.73 },
  { p: 1.0, phase: 1.0 },
];

/** 【R2-1 · §4.1.2(3)】轻功水平通道锚：位移窗 = 腾空段（p ∈ [0.25, 0.75]，两端速度为零）。 */
export const CHARACTER_3D_JUMP_CHANNEL: Character3DJumpChannel = { moveStartP: 0.25, moveEndP: 0.75 };

/** 【R2-1 · §4.1.2(4)】素材 root y 正段增益：推荐值 ×2.0（备案 ×1.85 / ×2.4，仅备查不启用）；
 * 过零线性渐入带 = 峰值 × 8%。增益作用于模型单位空间、**先于 scale**，与显示比例正交。 */
export const CHARACTER_3D_JUMP_Y_GAIN = 2.0;
export const CHARACTER_3D_JUMP_Y_GAIN_BAND_RATIO = 0.08;

export const HERO_3D_ACTION_MAP: Readonly<Record<Character3DActionKey, Character3DActionSpec>> = {
  idle: {
    clip: 'idle',
    progressSource: 'viewClock',
    loop: true,
    playWindowSec: null,
    startRatio: 0,
    rootMotion: 'track',
    crossFadeOnEnter: true,
  },
  walk: {
    // 【T31 FE · P0-B】移动态改播 GLB 内嵌 **run**（Leo 09-11「战斗内移动改用 run 素材」口径；
    // 方案 §5 原表写 walk，现按 Leo 明确口径改为 run）。槽位键仍是 'walk'（= 快照 animState），
    // 但**资产**取 `preset:biped:run`（按名字解析，禁按序号；见 HERO_3D_EMBEDDED_CLIPS.run）。
    clip: 'walk',
    progressSource: 'viewClock',
    loop: true,
    playWindowSec: null,
    startRatio: 0,
    rootMotion: 'track',
    crossFadeOnEnter: true,
  },
  basic: {
    // 单播：把完整 1.50s 源归一映射到既有 CHOREO.basicSec 表现窗（= BASIC_DURATION_MS/1000），尾帧保持
    clip: 'atk',
    progressSource: 'stateElapsed',
    loop: false,
    playWindowSec: CHOREO.basicSec,
    startRatio: 0,
    rootMotion: 'track',
    crossFadeOnEnter: true,
  },
  charge: {
    clip: 'cast',
    progressSource: 'stateElapsed',
    loop: true,
    playWindowSec: HERO_3D_CAST_CYCLE_SEC,
    startRatio: 0,
    rootMotion: 'track',
    crossFadeOnEnter: true,
  },
  strike: {
    clip: 'cast',
    progressSource: 'stateElapsed',
    loop: false,
    playWindowSec: HERO_3D_STRIKE_WINDOW_SEC,
    startRatio: HERO_3D_STRIKE_START_RATIO,
    rootMotion: 'track',
    crossFadeOnEnter: true,
  },
  hit: {
    // 不切专用动作：继续消费当前 clip 相位 + T21 事件震动（震动在 2D 层）
    clip: null,
    progressSource: 'viewClock',
    loop: true,
    playWindowSec: null,
    startRatio: 0,
    rootMotion: 'track',
    crossFadeOnEnter: false,
  },
  dead: {
    // 沿既有死亡表现做 Y 向压扁 + alpha 淡出，不要求不存在的 3D die clip（方案 §5 dead 行）
    clip: 'idle',
    progressSource: 'hold',
    loop: false,
    playWindowSec: null,
    startRatio: 0,
    rootMotion: 'track',
    crossFadeOnEnter: false,
  },
  jump: {
    // 【R2-1 · §4.1.2】moveProgress 0→1 = 演出窗进度 p（不再等于素材相位）；**素材相位由锚表重映射**
    // （深蹲压缩 / 滞空扩展 / 落地缓冲）；**只剥 root x/z、保留 y**（竖直由素材提供），程序 hop 恒 0；
    // root y 正段 ×CHARACTER_3D_JUMP_Y_GAIN（深蹲负段不加深，过零带线性渐入）；
    // endpointInclusive：fi = φ×(46−1) ⇒ φ=1 正好落末帧（禁 φ×46 提前到末帧）。
    clip: 'jump',
    progressSource: 'moveProgress',
    loop: false,
    playWindowSec: CHARACTER_3D_JUMP_MOVE_SEC,
    startRatio: 0,
    rootMotion: 'zero-xz',
    endpointInclusive: true,
    phaseAnchors: CHARACTER_3D_JUMP_PHASE_ANCHORS,
    rootYGain: { gain: CHARACTER_3D_JUMP_Y_GAIN, bandRatio: CHARACTER_3D_JUMP_Y_GAIN_BAND_RATIO },
    crossFadeOnEnter: true,
  },
};

/** 状态切换默认交叉淡化 100ms；jump→idle 固定 180ms（方案 §5 末段）。 */
export const CHARACTER_3D_CROSS_FADE_SEC = 0.1;
export const CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC = 0.18;

/** 被快照直接消费的 state 集（CharacterRenderCommand.state 的可达值）。 */
export type Character3DSnapshotState = SnapshotActor['animState'];

// ===== 画质与管线（方案 §7）=====

/** 光照与材质：**对齐 Leo 已认可观感台**（assets/_trial_20260913/look_webgl3d/index.html
 * `AmbientLight(0xffffff, 2.15)` + `DirectionalLight(0xffffff, 1.15).position=(-0.4,0.85,1)`，
 * three r160 / useLegacyLights=false）。
 * `diffuseNormalization` = 1/π：three r160 的 `BRDF_Lambert = RECIPROCAL_PI * diffuseColor`，
 * 裸 WebGL2 要复现该观感必须一并搬过来（否则成品比观感台亮约 π 倍、贴图洗白）。 */
export const CHARACTER_3D_LIGHT = {
  ambientIntensity: 2.15,
  directionalIntensity: 1.15,
  direction: [-0.4, 0.85, 1] as const,
  diffuseNormalization: 1 / Math.PI,
} as const;

/** 正交相机深度半程（世界单位）：placement 的 z **不缩放**（模型 z ≈ ±0.16），
 * 该值只要覆盖模型 z 跨度即可；乘像素级 scale 会把顶点裁到近/远平面外、
 * 网格塌成「丝带」（probe README 踩坑 1）。 */
export const CHARACTER_3D_ORTHO_Z_HALF = 4;

/** 抗锯齿：能力分支固定（方案 §7）。
 * 实机请求 antialias:true 但有效 context attributes 为 false ⇒ 必须**读 getContextAttributes()**，
 * 禁把请求值当启用值（易错点 7）。 */
export type Character3DEdgeMode = 'native-msaa' | 'fxaa';

/** FXAA 参数（alpha-aware 单遍；方案 §7 第 2 条）。
 * 关键：禁采透明区 RGB 造成黑边，所有采样与混合保持 **premultiplied alpha**。 */
export const CHARACTER_3D_FXAA = {
  /** 边缘对比阈值（相对 max luma 的比例）：低于此值直接返回原色。 */
  edgeThreshold: 0.166,
  /** 绝对最小对比：暗部平坦区避免无谓搜索。 */
  edgeThresholdMin: 0.0833,
  /** 沿边搜索步数（每侧）。 */
  searchSteps: 8,
  /** 亚像素混入质量 [0,1]。 */
  subpixelQuality: 0.75,
  /** 亚像素项的对比下限归一化系数。 */
  subpixelTrim: 1 / 8,
  /** alpha 低于该值的邻居视为「外」，不参与方向搜索（防透明区把边缘拉出去）。 */
  alphaThreshold: 0.05,
} as const;

/** 内部渲染尺度：S0 的 20 单位性能基线是在 1098×2400、renderScale=1 上取得，
 * 扩大内部缓冲会改变已证口径 ⇒ 不采用盲目 1.25× 超采样（方案 §7 末段）。 */
export const CHARACTER_3D_RENDER_SCALE = 1;

/** 顶点布局（与 probe 已验蒙皮渲染器同序）：pos3 + nrm3 + uv2 + joints4 + weights4 = 16 float。 */
export const CHARACTER_3D_VERTEX_FLOATS = 16;

// ===== profile 校验（方案 §9.1 自动化第 1 条：错误输入非零失败）=====

const HEX64 = /^[0-9a-f]{64}$/;
const CLIP_KEYS: readonly Character3DClipKey[] = ['idle', 'walk', 'atk', 'cast', 'jump'];
const FACING_KEYS: readonly BattleFacingHex[] = ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown'];

/** 相对 urlPath 检查：禁完整 URL / 禁协议 / 禁前导斜杠 / 禁上跳（方案 §6.1）。 */
export function isRelativeAssetPath(urlPath: string): boolean {
  if (!urlPath || urlPath.trim() !== urlPath) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlPath)) return false; // scheme://
  if (urlPath.startsWith('//') || urlPath.startsWith('/')) return false;
  return urlPath.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** 逐项校验 profile（结构 / 资产账 / 六向完整性 / 挂点门禁）。
 * @returns 问题清单；空数组 = 通过。调用方按「非空即失败」处理（§9.1）。 */
export function validateCharacter3DProfile(profile: Character3DProfile): string[] {
  const errors: string[] = [];
  if (profile.mode !== 'webgl2-skinned') errors.push(`mode 非法: ${String(profile.mode)}`);
  if (profile.jointCount !== HERO_3D_MODEL_ACCOUNT.jointCount) {
    errors.push(`jointCount=${profile.jointCount} 应为 ${HERO_3D_MODEL_ACCOUNT.jointCount}`);
  }
  if (profile.primitiveCount !== HERO_3D_MODEL_ACCOUNT.primitiveCount) {
    errors.push(`primitiveCount=${profile.primitiveCount} 应为 ${HERO_3D_MODEL_ACCOUNT.primitiveCount}`);
  }
  if (!(profile.modelHeight > 0)) errors.push(`modelHeight 非正: ${profile.modelHeight}`);
  if (!(profile.screenHeightPxAtReference > 0)) {
    errors.push(`screenHeightPxAtReference 非正: ${profile.screenHeightPxAtReference}`);
  }
  errors.push(...validateAssetRef('model', profile.model));

  for (const key of CLIP_KEYS) {
    const entry = profile.clips[key];
    if (!entry) {
      errors.push(`缺动作槽位 ${key}`);
      continue;
    }
    if ('embedded' in entry) {
      if (!entry.embedded.trim()) errors.push(`槽位 ${key} 的 embedded 名为空`);
      continue;
    }
    errors.push(...validateAssetRef(`clips.${key}`, entry));
  }

  for (const facing of FACING_KEYS) {
    const yaw = profile.sourceViewYawDeg[facing];
    if (typeof yaw !== 'number' || !Number.isFinite(yaw)) errors.push(`六向 ${facing} 缺 sourceViewYawDeg`);
  }

  for (const [name, att] of Object.entries(profile.attachments)) {
    if (!att.bone) errors.push(`挂点 ${name} 缺 bone`);
    if (att.enabled) errors.push(`挂点 ${name} 已启用——素材未过双门不得启用（方案 §11）`);
    if (att.localMatrix.length !== 16) {
      errors.push(`挂点 ${name} localMatrix 长度 ${att.localMatrix.length} 应为 16`);
    }
  }
  return errors;
}

function validateAssetRef(label: string, ref: Character3DAssetRef): string[] {
  const errors: string[] = [];
  if (!ref.id) errors.push(`${label} 缺 id`);
  if (!HEX64.test(ref.sha256)) errors.push(`${label} sha256 非 64 位小写十六进制: ${ref.sha256}`);
  if (!Number.isInteger(ref.byteLength) || ref.byteLength <= 0) {
    errors.push(`${label} byteLength 非正整数: ${ref.byteLength}`);
  }
  if (!isRelativeAssetPath(ref.urlPath)) {
    errors.push(`${label} urlPath 必须是相对 CDN base 的路径（禁完整 URL/前导斜杠/上跳）: ${ref.urlPath}`);
  }
  if (ref.mediaType !== 'model/gltf-binary' && ref.mediaType !== 'application/json') {
    errors.push(`${label} mediaType 未识别: ${String(ref.mediaType)}`);
  }
  return errors;
}

/** 现役 profile 的自检结果：**必须为空**（测试逐项锁定；非空即资产门/清单不合规）。 */
export const HERO_3D_PROFILE_ERRORS: readonly string[] = validateCharacter3DProfile(HERO_3D_PROFILE);
