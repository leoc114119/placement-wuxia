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

import { PIECE, TILE_H } from './battle-hex';
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

/** ===== T32 · 3D 武器（剑）资产与挂点参数 =====
 *
 * 真源：《3D武器挂载接入技术方案》v1.0 @ `99cde3fe`（§2 渲染 / §3 标定 / §4 W6 甲 / §5 换色）＋
 *   A4-T31（挂点合成数学＋参考矩阵＋关键点自检表）＋主规格《武器挂载规格与接入需求》。
 *
 * 铁律：
 *   ① **结构化参数为真源、`localMatrix` 为装配期派生物**（composer 合成；禁把 16 浮点写死进本文件）；
 *   ② `gripLocal` 等**逐资产**值只允许出现在本文件的武器资产条目里（渲染/加载文件零硬编码，用例做源码扫描）；
 *   ③ `ch`（角色身高）一律取 `profile.modelHeight`（**模型单位**）；**禁用** `screenHeightPxAtReference`
 *     （那是像素、且已乘 CHARACTER_3D_HERO_SCALE ⇒ 会把 k 放大两个数量级）；
 *   ④ 合成顺序红线：`M = T(f)·R(Q)·S(k)·T(0,−gripY,0)`——`T(0,−gripY,0)` 必须在 `S(k)` **右侧**
 *     （平移量是武器模型单位、不乘 k），写反即「插多/插少」一个 gripY（且 W4 锚点会随长度漂）。 */

/** 剑资产（Leo 09-14 交付；贴图内嵌；与「剑的比例规格」不同源——规格值属早期 2D 剑 B，见 A4 §一⑥）。
 * URL 内容版本化：版本目录 = 该资产 SHA-256 前 12 位（7a5fe0e54ad6）。 */
export const HERO_3D_WEAPON_REF: Character3DAssetRef = assetRef(
  'sword-3d-medieval',
  '7a5fe0e54ad660eeae17323dddc2bd99a73bc7639057b8545ad297a798ecf1d4',
  218456,
  'sword_3d_medieval.glb',
  'model/gltf-binary',
);

/** 武器资产**机械门**（研发 PM 09-15 实测，全 PASS；结构门常量与 loader/用例同源）。
 * `doubleSided` 是 **W8 的资产前提**（薄几何必须双面；管线当前全局不开背面剔除）。 */
export const HERO_3D_WEAPON_ACCOUNT = {
  triangleCount: 1758,
  vertexCount: 1457,
  meshCount: 1,
  materialCount: 1,
  textureCount: 1,
  skinCount: 0,
  animationCount: 0,
  doubleSided: true,
  textureSize: 1024,
} as const;

/** W5 换色：几何 Y 分段界（离**柄头端**的比例）——剑首 | 柄 | 护手 | 剑身。
 * 出处：观感台 `splitSwordMesh`（A4 §3.6）。段间共享同一 VBO，仅索引重排（顶点零复制）。 */
export const HERO_3D_WEAPON_SEGMENT_BOUNDARIES: readonly number[] = [0.06, 0.2, 0.27];

/** W6（**甲** · Leo 09-15 现场裁定）**收剑规则**：**移动演出期间（离开 A 起到抵达 B）不显示剑**，
 * 演出结束（回待机）立即显示；**轻功同样收剑**。
 * 实现语义 = 控制器**解析后的动作键**命中本表即收剑（`walk` = 移动演出槽位，播的是 run 资产；
 * `jump` = 轻功闩锁）——**读快照必错**：轻功期间快照 animState 是 `walk`、且演出长于快照窗。
 * ⚠ 与主规格 §5-W6 字句「walk 可见」的差异是**有意**的（该字句系 walk→run 并轨前的观感台语境；
 * 甲 = 移动即收，正是 Leo 在观感台批的「run 收剑」观感）。改判乙（走路持剑）只改本表一行。 */
export const HERO_3D_WEAPON_SHEATHED_ACTIONS: readonly Character3DActionKey[] = ['walk', 'jump'];

/** 挂点（T32 起启用右手剑）。**localMatrix 是装配期派生物**（composer 合成，见 ui/character3d/weapon.ts）：
 * 此处置单位阵为占位，渲染路径不读它做几何（只读结构化参数）；用例锁「本文件不含写死的 16 浮点」。 */
export const HERO_3D_ATTACHMENTS: Character3DProfile['attachments'] = {
  'right-hand-blade': {
    bone: 'R_Hand', // 41 骨 Mixamo 命名，逐版本一致
    assetId: HERO_3D_WEAPON_REF.id,
    enabled: true, // 双门：①Leo 审美（工单 seq=443，原话「这剑效果很好」）②规格/技术门（方案 v1.0 + 复核）
    localMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    // —— 结构化标定参数（真源；Leo 在观感台目视调定，换长度/颜色都不动这组）——
    gripLocal: [0, 0.1082, 0], // 握点（武器模型空间，逐资产实测；A4 §一④）
    lenRatio: 0.75, // 剑全长 = lenRatio × 角色身高（模型单位）；域 0.50~1.20
    poseDeg: { rx: -25, ry: 80, rz: -90 }, // 剑局部三轴（ry = 绕剑自身长轴自转）
    offsetLocal: [-0.03, 0, 0], // 骨局部偏移（×ch 后并入 f）
    doubleSided: true, // 资产属性留档（W8；管线全局不剔面 ⇒ 生效）
    // tints 缺省全白 = 原贴图观感（Leo 已批对照图）；装备系统按 WeaponSkin 只加配置行
  },
};

/** 【R2-3 · §4.4】主角 3D 显示比例：**唯一缩放参数承载点**（禁第二处裸写数值）。
 * 只缩 3D 主角，2D 敌方与 PIECE 定尺/headOffsetPx 不动（S2 敌方 3D 化时按同参数口径对齐）。
 * 派生全部自动：顶点统一缩放、placed.h/w、攻钮/四技能钮/名条锚/热区随框缩小；脚底对格心不受影响。
 * 取值沿革：0.6（R2-3 首版，Leo 09-15 目验）→ **0.78**（Leo 09-15 现场裁定「在现在基础上 ×1.3」，
 * 基数 = 0.6 ⇒ 0.6×1.3 整除；名义显示高 73.92 → 96.096 逻辑像素）。 */
export const CHARACTER_3D_HERO_SCALE = 0.78;

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
   * PIECE.heightPerTile，再乘 CHARACTER_3D_HERO_SCALE（R2-3 · §4.4：123.2 → 96.096）。
   * 旧口径「与观感台默认人高 123px 同档」（assets/_trial_20260913/look_webgl3d 的 curH=123）为改前基线。
   * 【T31-FE-B · R2 = arch seq=418 Q2-1】本值是**逻辑**参考高；GL 正交像素空间是物理像素，故宿主在
   * 装配 pass 时统一乘一次 pixelRatio（运行时 profile 副本 = 物理参考高），pass 内禁再乘第二次。
   * 旧注释「画布物理像素」是错误口径（会误导成 pass 侧重复换算 → hidpi 下人物 ×dpr 过大）。 */
  screenHeightPxAtReference: TILE_H * PIECE.heightPerTile * CHARACTER_3D_HERO_SCALE,
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

/** 【T31-R2-basic · Leo 09-15 现场裁定】3D 主角**普攻表现窗**（秒）= **1.5 ＝ atk 源时长 ⇒ 1.0× 原速**
 *（Leo 原话：「普攻的动作有点太快了吧，我记得我们是有个 1.5s 的？现在看是加速的」）。
 *
 * **只改 3D 槽位**：`config/battle.ts` 的 `BASIC_DURATION_MS = 700`（**2D/BE 唯一真值**）**不动**。
 * 历史（禁改回的缘由）：700ms 是 **Leo 09-07 在 L 环亲裁**（原 1000ms，理由「出拳后收得太慢」），
 * 当时普攻是 **2 帧素材**，0.7s 只是**帧保持窗**、不存在「加速播放」；现役 3D `atk` 是 **1.5s 真实动作**，
 * 沿用 0.7s 会把整段压进 0.7s 播 ＝ **2.14×**（Leo 09-15 目验所指）。故本条不是推翻 09-07 的判断，
 * 而是 **3D 时代需要自己的窗**（沿轻功先例：`CHARACTER_3D_JUMP_MOVE_SEC` 为 3D 专用、2D 仍走 jumpParams）。
 * ⚠ 与源时长数值相等是**意图（原速）**，**不是**从 `HERO_3D_CLIP_SOURCE_SEC.atk` 推导（禁重新压回 0.7s）。
 * 未迁移 2D 角色（敌方 2D 帧）保持 `CHOREO.basicSec` = 0.7s（方案既有口径「不自动扩大到未迁移 2D 角色」）。 */
export const CHARACTER_3D_BASIC_WINDOW_SEC = 1.5;

/** 【R2-2 · §4.1.3（Leo 已裁）】特技/绝学**固定 3s 表现窗**（演出秒）：
 * charge 槽位把**整段源**映射进窗——源 >3s ⇒ 按窗压缩、3s 内播完一遍（现役 cast 源 4.5333s ⇒
 * 压缩比 0.662、等效 1.511×）；源 <3s ⇒ 循环填满（1.5s 源恰 2 遍）。
 * **不设独立播放速度参数**（后续「出招速度」系统的接缝＝`types.ts` 的 `stateWindowSec`，本批只留条文）。
 * ⚠ 与 session 默认档 castDurationMs=3000ms 数值相等属**巧合不是耦合**：两常量独立演化，禁互相推导。
 * 本条**废止**原 `HERO_3D_CAST_CYCLE_SEC`(840ms 一轮 = 5.4× 加速) 与 `HERO_3D_STRIKE_WINDOW_SEC`(280ms)。 */
export const HERO_3D_SKILL_WINDOW_SEC = 3.0;

/** strike 归一起点 = **1（末姿保持）**（§4.1.3(2)：charge 窗结束即源已播完，strike 不再从 2/3 起播重扫
 *（原口径该段等效 10.8× 加速，是「还是加速播放」观感成因）；相位恒 1 至状态退出，随后既有 100ms 混合回 idle。
 * 既有 2D directional 分支的 cast2→3 帧语义不变——本条只改 3D 槽位）。 */
export const HERO_3D_STRIKE_START_RATIO = 1;

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

/** 【R2-1 · §4.1.2(4) · 方案 v1.3.1 收口】素材 root y 正段增益：**k = 3.2**（Leo 09-15 现场裁定目标
 * 「腾空 ≈ 身高 73%」；arch 出 v1.3.1（commit 64e071b7）把判据带钉为 **峰值÷名义参考高 ∈ [0.65, 0.80]**，
 * 偏离处置依次 3.0 / 3.4）。
 * 口径（条文钉死）：y>0 段乘 k、y≤0 段乘 1（深蹲深度不变）、过零带 [0, 峰值×8%] 线性渐入；
 * 峰值 = 逐帧取**人物层包围盒底边**相对 `placed.groundAnchorY` 的最大抬升，分母 = 名义参考高
 * （现 96.096），**以像素仪器为准**（CPU 探针只作预检，约 −6px 恒定偏置）。
 * 增益作用于模型单位空间、**先于 scale**，与显示比例正交。 */
export const CHARACTER_3D_JUMP_Y_GAIN = 3.2;
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
    // 【T31-R2-basic · Leo 09-15 现场裁定】单播：整段 1.50s atk 源映射到 **3D 专用**表现窗
    //（CHARACTER_3D_BASIC_WINDOW_SEC = 1.5 ⇒ 1.0× 原速），尾帧保持至状态退出。
    // 2D/BE 的 BASIC_DURATION_MS=700 与 CHOREO.basicSec 不动（2D 敌方仍 0.7s 帧保持窗）。
    clip: 'atk',
    progressSource: 'stateElapsed',
    loop: false,
    playWindowSec: CHARACTER_3D_BASIC_WINDOW_SEC,
    startRatio: 0,
    rootMotion: 'track',
    crossFadeOnEnter: true,
  },
  charge: {
    // 【R2-2 §4.1.3(1)】整段 cast 源映射进固定 3s 窗：源 >3s ⇒ 压缩播完一遍；源 <3s ⇒ 循环填满。
    // 相位 = (elapsed / 3) 取模（loop=true）；无 840ms 周期回卷（旧口径已废止）。
    clip: 'cast',
    progressSource: 'stateElapsed',
    loop: true,
    playWindowSec: HERO_3D_SKILL_WINDOW_SEC,
    startRatio: 0,
    rootMotion: 'track',
    crossFadeOnEnter: true,
  },
  strike: {
    // 【R2-2 §4.1.3(2)】末姿保持：startRatio=1 ⇒ span=0 ⇒ 相位恒 1（t1 后 300ms 不再重扫），
    // 随后既有 100ms 混合回 idle。session 时间轴/结算时点零改动。
    clip: 'cast',
    progressSource: 'stateElapsed',
    loop: false,
    playWindowSec: HERO_3D_SKILL_WINDOW_SEC,
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
    // 【T32】启用门（方案 §3.2）：素材过**双门**后方可 enabled=true —— 逐条机械核对，缺一即报错：
    //   ① assetId 非空且能在武器资产账里找到；② 武器资产门常量齐（面数/顶点/单 mesh/单材质/单贴图/0 骨/0 动画/双面）；
    //   ③ 结构化标定参数齐（gripLocal 3 数 / lenRatio ∈ 0.5~1.2 / poseDeg 三轴 / offsetLocal 3 数）。
    if (!att.enabled) continue;
    if (!att.assetId) {
      errors.push(`挂点 ${name} 启用但 assetId 为空（素材未过双门不得启用，方案 §11）`);
      continue;
    }
    if (att.assetId !== HERO_3D_WEAPON_REF.id) {
      errors.push(`挂点 ${name} 的 assetId=${att.assetId} 不在武器资产账内（未知武器）`);
      continue;
    }
    const acc = HERO_3D_WEAPON_ACCOUNT;
    if (acc.skinCount !== 0 || acc.animationCount !== 0) {
      errors.push(`武器资产门异常：skinCount=${acc.skinCount} animationCount=${acc.animationCount}（武器不得带骨架/动画）`);
    }
    if (!att.gripLocal || att.gripLocal.length !== 3 || !att.gripLocal.every((v) => Number.isFinite(v))) {
      errors.push(`挂点 ${name} 启用但 gripLocal 非 3 个有限数（W9：握点逐资产必填）`);
    }
    if (att.lenRatio === undefined || !(att.lenRatio >= 0.5 && att.lenRatio <= 1.2)) {
      errors.push(`挂点 ${name} lenRatio=${String(att.lenRatio)} 越界（已验域 0.50~1.20，W4）`);
    }
    if (!att.poseDeg || ![att.poseDeg.rx, att.poseDeg.ry, att.poseDeg.rz].every((v) => Number.isFinite(v))) {
      errors.push(`挂点 ${name} 启用但 poseDeg 三轴不全（W3）`);
    }
    if (!att.offsetLocal || att.offsetLocal.length !== 3 || !att.offsetLocal.every((v) => Number.isFinite(v))) {
      errors.push(`挂点 ${name} 启用但 offsetLocal 非 3 个有限数`);
    }
    if (att.doubleSided !== true) {
      errors.push(`挂点 ${name} 未声明 doubleSided=true（W8：薄几何必须双面，否则剑身破洞）`);
    }
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
