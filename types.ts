// 所有数据结构定义（模块间通过类型咬合，AGENTS.md 施工守则 5）
// T02 骨架阶段：仅放占位类型，玩法数据结构随 T03~T07 任务卡逐步补全

/** 规范色值（04-UI风格规范，UI 层只读引用） */
export interface Palette {
  ink: string; // 墨 #2B2B2B
  paper: string; // 宣纸 #F8F4EA
  cinnabar: string; // 朱砂 #E2574C
  bamboo: string; // 竹青 #7FB069
  gold: string; // 淡金 #D4AF37
}

/** 主循环帧上下文（渲染层只读） */
export interface FrameContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dt: number; // 距上一帧毫秒
}

// ============ T05 战斗核心（headless）类型 ============
// 公式依据：config/公式与数值总览.md（F-01/02/03/04/05、R-05/07/08/09）+ docs/80 拍板

/** 武器形态（R-05：范围档位由武器形态决定） */
export type WeaponType = 'sword' | 'fist' | 'staff' | 'club' | 'whip' | 'blade' | 'hidden';

/** 武功类型（R-08 冷却初值按类型：外功 0 / 特技 2 / 绝学 5 / 暗器 1） */
export type SkillKind = 'waiGong' | 'special' | 'ultimate' | 'hiddenWeapon' | 'qingGong' | 'sect';

/** 武功品阶（F-03：一阶 1.0 / 二阶 1.3 / 三阶 1.7；野猫剑法 0.5 为特殊过渡系数） */
export type GradeFactor = 1.0 | 1.3 | 1.7 | 0.5;

/** 武功定义（R-05 武器匹配 / R-08 冷却 / R-09 内力消耗） */
export interface SkillDef {
  id: string;
  name: string;
  kind: SkillKind;
  weapon: WeaponType | null; // null = 空手可用（拳法）；不匹配装备武器则无法出招（R-05）
  grade: GradeFactor; // 品阶系数（伤害倍率，F-01）
  growth: number; // 成长系数（F-02：攻击力 = … + 武功等级×成长）
  level: number; // 当前等级（决定范围档位：Lv 20/40/60 三档，R-05）
  cooldownTurns: number; // 冷却回合数（R-08）
  neiliCost: number; // 内力消耗（R-09）
  /** 【AS 出招速度 · 需求 v1.3 AS-1/schema v0.2】武功出招系数（个体差异快照）：初始 0.8，
   * 轻招可 <1、绝学可 2，随武功等级↑（成长曲线归 C 案）。缺省 = 0.8（MVP 默认，向后兼容）；
   * 与 CombatantInput.internalCastSpeed 加法合成、和封顶 ≤6（castDurationMs=3000÷min(6,和)）。 */
  castSpeed?: number;
}

/** 棋盘坐标（MVP 固定站位 P2-5：我方 y=10 / 敌方 y=1，棋盘 8×12） */
export interface GridPos {
  x: number;
  y: number;
}

/** 战斗单位输入（属性由调用方按 F-02/F-07 预算后传入，headless 不重复算属性成长） */
export interface CombatantInput {
  id: string;
  name: string;
  side: 'player' | 'enemy';
  hp: number;
  maxHp: number;
  neili: number;
  maxNeili: number;
  atk: number; // F-02 攻击力（调用方算好）
  def: number; // F-02 防御力
  neigongLevel: number; // F-05 行动条用
  jimin: number; // 机敏（F-05 速度 / F-04 闪避）
  danshi: number; // 胆识（F-04 暴击率）
  shizhan: number; // 实战（F-04 命中率）
  pos: GridPos;
  weapon: WeaponType | null; // 装备武器（R-05 匹配判定）
  skills: SkillDef[]; // 出招优先级按数组顺序
  /** 【AS 出招速度 · 需求 v1.3 AS-1】内功加成速度：成长域提供的快照值（初始 0.2，随内功等级↑，
   * 归内功系统 schema）。session 只读本快照，禁读 neigongLevel 反推；缺省 = 0.2（MVP 默认，
   * 向后兼容）；与 SkillDef.castSpeed 加法合成（唯一消费点 battle-core castDurationMs）。 */
  internalCastSpeed?: number;
}

/** 单条战斗日志（需求表 #7：回合/行动者/动作/伤害/结果） */
export interface BattleLog {
  round: number; // 第几次行动（全场行动序号）
  t: number; // 发生时刻（秒，战斗内时间）
  actorId: string;
  actorSide: 'player' | 'enemy';
  action:
    | 'skill' // 武功出招
    | 'basic' // 普攻
    | 'fallback' // 内力不足/武器不匹配 → 普攻兜底（R-09/R-05）
    | 'miss' // 未命中/被闪避（0 伤害）
    | 'blocked' // 目标超出射程，本次行动无法出手
    | 'timeout-trust' // 手动 90s 无操作 → 本回合 AI 代行（docs/80 §4）
    | 'timeout-auto'; // 再 90s 无操作 → 切回自动模式
  skillId?: string;
  targetId?: string;
  damage: number; // 本次结算伤害（miss=0）
  crit: boolean;
  note?: string; // 结果备注（如破防保底/托管提示）
}

/** 战斗模式 */
export type BattleMode = 'auto' | 'manual';

/** 战斗结果 */
export interface BattleResult {
  winner: 'player' | 'enemy' | null; // null 不应出现（防死循环规则保证有胜负）
  reason: 'annihilate' | 'timeout-hp'; // 全灭 / 90s 总时长 hp 总量判定（F-05）
  logs: BattleLog[];
  duration: number; // 战斗时长（秒）
  finalHp: { player: number; enemy: number }; // 存活 hp 总量
}

/** runBattleHeadless 输入 */
export interface BattleConfig {
  player: CombatantInput; // MVP 我方仅 1 人（R-03 助战后置）
  enemies: CombatantInput[]; // 敌方阵容（数量由调用方按 R-07 档位生成，见 rollEnemyCount）
  mode: BattleMode; // 手动模式下玩家不操作时走 90s 托管状态机
  seed?: number; // RNG 种子（缺省用默认种子，保证确定性可测）
}

// ============ T03 场景系统类型（modules/02-场景系统.md §1/§2） ============

/** 逻辑坐标（0~1 占屏比例；px = x * canvas.width，模块 02 §1.1） */
export interface TouchPoint {
  x: number;
  y: number;
}

/** 角色朝向（立绘水平翻转依据；素材默认面左，朝右时翻转） */
export type Facing = 'left' | 'right';

/** 角色动作状态（fight/hangup 由模块 03/04/08 置位，T03 只驱动 idle/walk） */
export type AvatarState = 'idle' | 'walk' | 'fight' | 'hangup';

/** 主角化身（模块 02 §2.1） */
export interface PlayerAvatar {
  x: number; // 逻辑坐标 0~1（脚底锚点）
  y: number;
  speed: number; // 移动速度（逻辑坐标/秒）
  moving: boolean;
  targetX: number;
  targetY: number;
  state: AvatarState;
  direction: Facing;
}

/** 场景配置（数据源 config/场景与NPC配置.md；npcs/boss/hangup 由模块 03/04/08 任务卡补） */
export interface SceneConfig {
  id: string;
  name: string; // 左上角场景名标签
  bg: string; // 背景图路径
  unlockPractice: number; // 进入实战要求（0=新手）
}

/** 底部圆形按钮（代码绘制，需求表 #8；图标 = 透明 PNG，Q3-T03-R2 接线） */
export interface SceneButton {
  id: 'biguan' | 'guaji' | 'boss';
  iconSrc: string; // 图标素材路径（drawImage 绘制）
  label: string; // 小文字（代码绘制）
}

/** 场景图片资源（加载失败为 null → 渲染降级，需求表 #9） */
export interface SceneAssets {
  bg: WxImage | null;
  heroFrames: Array<WxImage | null>; // 索引=帧号（仅预载 00~04：idle 1 + walk 4）
  buttonIcons: Array<WxImage | null>; // 与 SCENE_BUTTON_DEFS 同序，缺图跳过图标只画文字
}

/** 空资源（加载完成前的初始态） */
export const EMPTY_SCENE_ASSETS: SceneAssets = { bg: null, heroFrames: [], buttonIcons: [] };

// ============ T04 NPC 氛围版类型（modules/03 v1.2 §2.0/§2.1；纯氛围无战斗交互） ============

/** 场景内一只 NPC（渲染与 wander 状态机共享的运行时状态） */
export interface NpcAvatar {
  configId: string; // 引用 NpcConfig.id（npc-shanzei / npc-lang）
  x: number; // 逻辑坐标（脚底锚点，恒在 WALK_ZONE 内）
  y: number;
  homeX: number; // 散布出生点（wander 选点圆心）
  homeY: number;
  targetX: number;
  targetY: number;
  moving: boolean;
  state: 'idle' | 'walk';
  direction: Facing; // 朝向翻转复用主角逻辑
  wanderTimerSec: number; // idle 剩余停留时间（3~5s 随机）
  walkMs: number; // walk 动画累计（与主角同口径 01~03 循环）
}

/** NPC 帧图资源（每种 NPC 一组：索引=帧号 00~03） */
export interface NpcFrameAssets {
  frames: Array<WxImage | null>;
}

/** 渲染层 NPC 视图（只读快照） */
export interface NpcView {
  avatar: NpcAvatar;
  frameIdx: number; // 当前帧号
}

// ============ T06 战斗界面演出类型（75 v2.1 + A1-T06 v2 裁决） ============

export type BattleFacing = 'left' | 'right';
/** 名义六向朝向（六向帧接线 §2.1 契约冻结 2026-09-06）：受限字符串而非任意 HexPos，
 * 使渲染、路径表和测试都能穷举。由 session 已有 Runner.hexFacing 单点导出
 *（battle-session 穷举映射函数），渲染层禁根据坐标/目标/旧左右字段猜方向。 */
export type BattleFacingHex =
  | 'right'
  | 'rightup'
  | 'leftup'
  | 'left'
  | 'leftdown'
  | 'rightdown';
export type BattleAnimState = 'idle' | 'walk' | 'charge' | 'strike' | 'basic';
export type BattlePhase = 'fighting' | 'won' | 'lost' | 'timeout' | 'fled';

/** 演出层战斗单位：结算字段与引擎 CombatantInput 同源 + 冷却/行动条/朝向/动画态 */
export interface BattleActor extends CombatantInput {
  cooldowns: Map<string, number>; // skillId → 剩余冷却（resolveAction 副作用契约）
  bar: number; // 行动条 0~100（fillRate 引擎公式填充）
  facing: BattleFacing; // billboard 左右翻转（移动水平分量定，dx≈0 防抖）
  configId?: string; // NPC 帧表引用（玩家侧空 → hero 帧表）
  bodyKind: 'hero' | 'humanoid' | 'wolf'; // §8b.4 体型档
  isBoss: boolean; // Boss 叠 BOSS_SCALE + 朱砂大字
  renderX: number; // 渲染逻辑格（lerp 追 pos；移动表现）
  renderY: number;
  moveT: number; // 移动动画进度 0~1（<1 = 移动中；walk 帧）
  moveFromX: number;
  moveFromY: number;
  isJump: boolean; // 轻功抛物线（vs 普通贴地 lerp）
  animState: BattleAnimState; // 帧组播报硬规则：walk=01~03 / 出招 04→05 / 普攻 06
  animMs: number; // 当前动画态累计
  dead: boolean; // 阵亡变灰
  /** 普攻前冲（§8c 10b.3：半格 lerp + 回位；0~1 双程，>=1 结束） */
  lungeT: number;
  lungeDirX: number; // 前冲方向（朝目标单位，格向量归一）
  lungeDirY: number;
}

/** 演出层事件流（同 seed + 同操作序列 → 全等；node 断言口径） */
export interface BattleUiEvent {
  t: number; // 逻辑时钟（秒，含加速倍率）
  type:
    | 'bar-max' // 行动条满（进入决策）
    | 'move' // 移动（二选一的移动段）
    | 'skill' | 'basic' | 'miss' | 'fallback' | 'blocked' // 出招族（resolveAction 同源）
    | 'death'
    | 'trust' | 'switch-auto' // 手动托管双阈值
    | 'win' | 'lose' | 'timeout-hp' // 胜负
    | 'flee' // 逃跑（零结算）
    | 'rejected'; // 请求被拒（L 环回归修复：拒绝可观测——FE 消费做轻提示，未消费前忽略无害）
  actorId?: string;
  targetId?: string;
  skillId?: string;
  damage?: number;
  crit?: boolean;
  toX?: number;
  toY?: number;
  /** rejected 专属：拒绝原因（bar=行动条未就绪/重积中；range=目标超出射程；invalid=非法格/目标；
   * mode=非手动模式无输入态资格【GATE-1 v2.4 · Leo 09-05 裁决放行本联合扩展，红线豁免随卡留痕】） */
  reason?: 'bar' | 'range' | 'invalid' | 'mode';
}

/** 演出层对局结果（结算占位口径：胜负+统计；奖励/疗伤文案占位待 T07） */
export interface BattleUiResult {
  phase: Exclude<BattlePhase, 'fighting'>;
  durationSec: number;
  finalHp: { player: number; enemy: number };
  events: BattleUiEvent[];
}

/** 渲染层场景视图（渲染层只读，AGENTS.md「UI 只展示」） */
export interface SceneView {
  scene: SceneConfig;
  avatar: PlayerAvatar;
  heroFrameIdx: number; // 当前帧号（00 idle / 01~04 walk）
  assets: SceneAssets;
  bobMs: number; // 行走累计时间（降级颠簸/动画共用）
}

// ============ T15 战斗 hex 适配层（主架构方案 §3 契约冻结 2026-09-02） ============
// 冻结来源：《战斗界面接入技术方案》§3.2/3.3/3.4 · 冻结后变更走工单。
// 裁决落实：O1 行动预算=二选一（session 内部实现，不在类型层）；O2 射程三形态由
// systems/hex.ts 纯函数承载；O3 无部署 UI → BattleSnapshot.phase 不含 'deploy'（PM 批复 Q3）。
// 边界：本节类型只描述数据，不含任何公式；数值真值仍在 battle-core / 云端 settle。

/** 六边形轴向坐标（cube 系的二维投影，s = -q - r 按需计算；96 号定 cube 系） */
export interface HexPos {
  q: number;
  r: number;
}

/** 快照单单位（session → render，每帧重建，渲染只读不可变约定）。
 * 与 T06 BattleActor 的区别：不带任何可变演出计时器（lerp/lunge 进度等），
 * 渲染层凭 renderPos+animState+事件流自行驱动表现，保证快照可整体替换。 */
export interface SnapshotActor {
  id: string;
  side: 'player' | 'enemy';
  name: string;
  pos: HexPos; // 逻辑格（结算真值）
  renderPos: HexPos; // 渲染格（session 内 lerp 追 pos，移动表现；方案 §2.3 L3）
  hp: number;
  maxHp: number;
  neili: number;
  maxNeili: number;
  actionBar: number; // 0~100（F-05，fillRate 推进）
  facing: BattleFacing; // 立绘翻转用左右朝向（dx≈0 防抖，T06 已验口径；legacy profile 消费）
  facingHex: BattleFacingHex; // 名义六向（六向帧接线 §2.1；directional profile 消费，session 单点导出）
  animState: 'idle' | 'walk' | 'charge' | 'strike' | 'basic' | 'hit' | 'dead'; // hit/dead 为 hex 层新增（T06 BattleAnimState 不含）
  statusIcons: string[]; // 顶栏四槽数据源（中毒/流血/内伤…；MVP 恒空数组，字段先冻结）
  isBoss: boolean;
  spriteKey: string; // 帧表资源键（走资源管理器+配置表，禁代码写死路径）
  /** 本次移动是否跳跃型（轻功抛物线 vs 贴地 lerp；验收 F1：快照真值，禁渲染启发式猜）。
   * 仅在该单位移动 lerp 窗口内为 true。 */
  isJump: boolean;
  /** 敌型身份（NPC 帧表键，依托模板 name；玩家侧 undefined 走 hero 帧表）。
   * 约定：敌方 spriteKey = configId（验收 F3；config 侧 BATTLE_HEX_RES.spriteKinds 对齐归 FE 卡）。 */
  configId?: string;
}

/** 主角技能钮数据源（弧形四钮置灰判定 = 会话真值：内力/冷却/武器匹配）。
 * 验收 F2 契约化：T16 侧 ui 内同形临时定义以本类型为准（结构咬合零改消费）。 */
export interface SkillButtonInfo {
  id: string; // 技能 id（施放请求回传用）
  label: string; // 钮面文字/资源键（SkillDef.name）
  disabled: boolean; // 置灰 = 内力不足 || 冷却中 || 武器不匹配
}

/** hex 对局阶段。O3 定版无部署 UI：出生=初始范围随机布点，开局即 fighting；
 * 90s 总时长到点由 session 按 F-05 尾规则判胜并落 won/lost（事件流记 timeout-hp）。 */
export type BattleSnapshotPhase = 'fighting' | 'won' | 'lost' | 'fled';

/** 对局快照（session → render，每帧产出，渲染只读）。
 * moveCells/attackCells 由 session 用 hex 度量算好（O2 三形态），渲染层只画不算。
 * selectedSkill 为轻功（kind='qingGong'）时：moveCells=跳跃可达格（金格高亮）+
 * moveKind='jump'、attackCells 置空（验收 F1：移动型技能分支，方案 §3.2 契约语义补角）。 */
export interface BattleSnapshot {
  phase: BattleSnapshotPhase;
  turnActorId: string | null; // 当前行动者（行动条满者；无则 null）
  pendingInput: boolean; // 等待主角输入（行动条满 + 手动模式；期间世界照常推进，镜像 core 口径）
  moveCells: HexPos[]; // 可移动高亮：普通态=普通可达（绿，不可穿越单位，C 案 A3）/轻功激活态=跳跃可达（金，moveKind='jump'）
  moveKind: 'walk' | 'jump'; // 当前 moveCells 形态（渲染换色：绿=普通 / 金=轻功跳跃）
  attackCells: HexPos[]; // 攻击范围高亮（红，激活攻击型技能后；O2 三形态，锥形按六向 facing 轴）
  selectedSkill: string | null; // 已激活待施放的技能 id
  heroSkills: SkillButtonInfo[]; // 主角弧形技能钮（验收 F2：置灰数据源=会话真值，Ext 过渡段降级删除）
  actors: SnapshotActor[];
  cameraTargetId: string; // 镜头跟随目标（自动模式跟当前行动者；MVP 简化为主角/行动者）
}

/** 玩家输入（input → session）。session 校验（预算/距离/内力/冷却）合法才执行，
 * 非法静默拒绝（submit 返回 boolean 供输入层反馈）。
 * attack.skillId=null=普攻；selectSkill/cancelSkill 与 attack.skillId 两条激活路径并存，
 * session 均接受（方案 §3.3 原样冻结）。 */
export type ActionRequest =
  | { type: 'move'; to: HexPos }
  | { type: 'attack'; targetId: string; skillId: string | null }
  | { type: 'cast'; to: HexPos; skillId: string }   // 对格施放（ATK-2/6/7 v2.0）：to=目标格（axial），skillId=选中攻击技
  | { type: 'selectSkill'; skillId: string }
  | { type: 'cancelSkill' }
  | { type: 'setMode'; mode: BattleMode }
  | { type: 'toggleSpeed' }
  | { type: 'flee' };
