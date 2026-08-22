// 战斗界面演出常量（75 v2.1 + A1-T06 v2 裁决；全部为表现/布局参数，结算公式唯一真值在 systems/battle-core.ts）

// ===== 棋盘几何（§1/§1b.1 方向 A 等距投影） =====
export const BOARD_COLS = 8;
export const BOARD_ROWS = 12;
export const PLAYER_ROW_Y = 10; // P2-5 我方布阵行
export const ENEMY_ROW_Y = 1; // P2-5 敌方布阵行

/** 菱形格边长（TS）。08-22 L 环对齐定值：scene_battle 台面顶面菱形水平对角线实测 ≈1330px（左 40~右 1379，
 * 像素扫描+视觉双证据），棋盘 8×12 投影轮廓对角线 = 20·THW → THW=66.5 → TS≈77。
 * 台面垂直对角线 920px（上 880~下 1800，1960 起为侧立面）比例 1.446 ≠ 等距 1.732（素材带透视俯角）——
 * 按宽对齐内切：左右压线重合，上下居中留边（20·THH=770 < 920）。比例根治待素材管线出标准 2:1 台面。 */
export const TILE_SIZE = 77;
/** THW = TS·cos30°，THH = TS·sin30°（75 §1b.1 定式） */
export const TILE_HALF_W = TILE_SIZE * 0.866;
export const TILE_HALF_H = TILE_SIZE * 0.5;

/** 镜头跟随（§1b.2）：以主角为中心平移 + 手动拖动偏移（L 环 08-22 加）；视窗不出棋盘世界包围盒；无缩放 */
export const CAMERA = {
  /** 棋盘世界四周留白（px）——视窗 clamp 时允许压到的边距 */
  worldPad: 40,
  /** 拖动生效判定：位移超过此值（物理 px）视为拖镜头而非点按 */
  dragThresholdPx: 8,
} as const;

/** 战场背景世界锚点：scene_battle.png 原始像素 1:1 贴入世界系，
 * 素材该点（台面顶面菱形中心，像素实测）对齐棋盘世界中心（格(3.5,5.5) 投影点）。 */
export const BG_PLATFORM = {
  anchorX: 720,
  anchorY: 1340,
} as const;

// ===== 棋子比例（§8b.4：renderH = tileVisualH × spriteHeightPerTile × bossScale；按主体占比反推画布绘制高） =====
export const SPRITE_HEIGHT_PER_TILE = {
  humanoid: 1.2, // 人形直立（主角/山贼；L 环可调区间 1.1~1.35）
  wolf: 0.8, // 四足狼形（区间 0.75~0.85）
} as const;
export const BOSS_SCALE = 1.3; // 狼王 ×（狼基线 0.8×1.3≈1.05）
/** 帧画布主体高度占比（alpha 包围盒实测 08-22；§8b.4 禁止按画布直放——画布高=renderH/占比，
 * 狼画布近半空白，直放会显著矮于规格高度） */
export const BODY_HEIGHT_RATIO = {
  hero: 0.972,
  humanoid: 0.833, // 山贼帧表
  wolf: 0.533, // 野狼帧表
  boss: 0.983, // 狼王帧表
} as const;

// ===== 移动表现（§8b.3 + A1 Q8 老网金二选一） =====
export const MOVE = {
  lerpSec: 0.3, // 普通移动贴格中心平滑时长
  qinggongArcTiles: 0.6, // 轻功抛物线顶高（格高）
  baseRange: 2, // F-06 基础移动力（+装配轻功加成 + ⌊轻功等级/5⌋；MVP 玩家无轻功 → 2）
  qinggongRangeFactor: 2, // [轻]跳跃范围 = 移动力 × 此系数（金色格）
  qinggongMpCost: 10, // A1 Q9：轻功内力消耗（R-09 表）；冷却 0
} as const;

// ===== 武功光影时序（§8c.2 四段式） =====
export const FX = {
  chargeSec: 0.1, // 蓄势
  mainSecMin: 0.3, // 主体光效时长下限
  mainSecMax: 0.5, // 上限（按品阶在区间取值：一阶 0.3 / 二阶 0.4 / 三阶 0.5）
  hitFlashSec: 0.15, // 命中闪白
  fadeSec: 0.12, // 收尾消散
  shakeSec: 0.15, // 绝学/Boss 出招全屏微震时长
  shakeAmpPx: 5, // 震幅（幅度小）
  basicLungeSec: 0.16, // 普攻半格前冲 + 回位（各半）
} as const;

// ===== 帧映射（硬规则：出招 04→05 两帧、普攻 06 单帧+代码动效、移动 01~03 循环、禁 05→06 直切） =====
export const BATTLE_FRAME = {
  idle: 0,
  walkStart: 1,
  walkEnd: 3,
  charge: 4, // 出招预备（蓄力段）
  strike: 5, // 出招挥出
  basic: 6, // 普攻单帧
  walkFrameMs: 140, // 战斗内步频略快于江湖
} as const;

// ===== 行动条 / 顶栏（§1c/§2） =====
export const BAR = {
  max: 100, // 与引擎 BAR_MAX 同值（展示口径）
  nameColorAlly: '#4A7A6B', // 竹青（§1c 我方字色）
  nameColorEnemy: '#E2574C', // 朱砂（敌方）
  actionBarColor: '#D4AF37', // 淡金行动条
  hpBarColor: '#E2574C', // 朱砂血条
  mpBarColor: '#4A7A9B', // A1 Q2 定版黛蓝（非竹青系）
} as const;

// ===== 顶栏三件套（A1 Q3：头像+朱砂血条+黛蓝内力条一整块面板；右上避胶囊——锚顶复用 getStatusBarBottomPx） =====
export const TOP_PANEL = {
  padRatio: 0.03, // 面板距状态栏底的间距（占屏高）
  heightRatio: 0.11, // 面板高（占屏高）
  avatarRatio: 0.075, // 头像直径（占屏宽）
} as const;

// ===== 圆钮（左下 [属性][装备][退出] / 右下 [⚙][⏩] / 特轻绝同规格——代码统一常量，A1/工单口径） =====
export const ROUND_BTN = {
  radiusRatio: 0.07, // 半径（占屏宽）
  gapRatio: 0.025, // 竖排钮间距（占屏高）
  bottomInsetRatio: 0.03, // 距屏底（占屏高）
  iconFontR: 0.62, // 图标字号 = r × 系数
  labelFontR: 0.3,
} as const;

// ===== 特/轻/绝悬浮钮（行动条满时主角上方；与圆钮同规格） =====
export const SKILL_BTN = {
  gapRatio: 0.02, // 三钮横排间距（占屏宽）
  aboveActorPx: 90, // 悬浮于主角头顶上方偏移（逻辑 px）
} as const;

// ===== 加速（A1 Q13：全局时间倍率，演出层 dt × 系数） =====
export const SPEED_FACTOR = { normal: 1, fast: 2 } as const;

// ===== 结算遮罩 / 占位（A1 Q5：胜负遮罩+战报统计，奖励与疗伤占位文案） =====
export const RESULT_OVERLAY = {
  fadeInSec: 0.3,
} as const;

// ===== 调试入口（A1 Q12：preview ?battle=1&seed=N + console wx.__enterBattle(seed)） =====
export const DEBUG_ENTRY = {
  queryFlag: '__BATTLE_DEBUG__' as const, // globalThis 标记（preview 页设置后再加载 game.js）
} as const;
