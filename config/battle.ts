// 战斗界面演出常量（75 v2.1 + A1-T06 v2 裁决；全部为表现/布局参数，结算公式唯一真值在 systems/battle-core.ts）

// ===== 棋盘几何（§1/§1b.1 方向 A 等距投影） =====
export const BOARD_COLS = 8;
export const BOARD_ROWS = 12;
export const PLAYER_ROW_Y = 10; // P2-5 我方布阵行
export const ENEMY_ROW_Y = 1; // P2-5 敌方布阵行

/** 菱形格边长（TS）——两层架构代码常量（75 v2.3 §1b.4：几何唯一真源=代码，背景零几何契约）。
 * 初值 77（棋盘世界轮廓 20·THW≈1333 × 20·THH≈770，拖动查看全场）；L 环可调。 */
export const TILE_SIZE = 54; // L 环二轮：77→54（格子过大不精致，Leo 08-22 定）
/** THW = TS·cos30°，THH = TS·sin30°（75 §1b.1 定式） */
export const TILE_HALF_W = TILE_SIZE * 0.866;
export const TILE_HALF_H = TILE_SIZE * 0.5;

/** 镜头（75 v2.3 §1b.2）：以主角为中心自动跟随 + 手动拖动偏移；clamp 于台面包围盒+边距（v2.3：环境背景
 * 屏幕空间静态不参与视野夹取）；无缩放 */
export const CAMERA = {
  /** 台面（棋盘）世界包围盒四周留白（px）——拖动/跟随 clamp 边距 */
  worldPad: 40,
  /** 拖动生效判定：位移超过此值（物理 px）视为拖镜头而非点按 */
  dragThresholdPx: 8,
} as const;

// ===== 战斗台（Layer1 全代码绘制，75 v2.3 §1b.4：无贴图采样、几何唯一真源=代码常量） =====
export const PLATFORM = {
  /** 台面填充（石面暖调，规格色板系内取色） */
  fill: 'rgba(163, 177, 138, 0.92)',
  /** 台面描边 */
  edge: 'rgba(43, 43, 43, 0.75)',
  edgeWidth: 3,
  /** 厚度侧沿（悬浮台侧立面，下缘两条边向下挤出） */
  side: 'rgba(74, 90, 62, 0.95)',
  sideDepth: 18, // 侧沿厚度（px）
  /** 格线（L 环二轮：调淡调细，棋盘精致化） */
  grid: 'rgba(43, 43, 43, 0.20)',
  gridWidth: 1,
} as const;

// ===== 棋子比例（§8b.4：renderH = tileVisualH × spriteHeightPerTile × bossScale；按主体占比反推画布绘制高） =====
export const SPRITE_HEIGHT_PER_TILE = {
  humanoid: 1.6, // L 环四轮：1.2→1.35→1.6（Leo 定，观感不够再调）
  wolf: 0.8, // 四足狼形（区间 0.75~0.85）
} as const;
export const BOSS_SCALE = 1.3; // 狼王 ×（狼基线 0.8×1.3≈1.05）
/** 帧画布主体高度占比（素材出厂标定后固化为 config 常量，A2 #3 终态采纳；§8b 分母铁律管的是
 * renderH 的 tileVisualH=2·THH——本表只做画布空白换算，非运行时量测） */
export const BODY_HEIGHT_RATIO = {
  hero: 0.972,
  humanoid: 0.833, // 山贼帧表
  wolf: 0.533, // 野狼帧表
  boss: 0.983, // 狼王帧表
} as const;

/** 帧画布主体锚点（L 环四轮：主体中心 x 比例 / 主体底缘 y 比例，00~03 帧包围盒均值标定）——
 * 立绘以「主体中心 x = 格心、主体底缘 = 格心」精确落位（画布默认 -dw/2,-dh 假设 0.5/1.0，
 * 实测 0.488/0.96~0.99，底部空白把脚悬空、中心偏差使主体显偏右上） */
/** 脚点垂直微调（格视觉高 2·THH 的比例；正=下移）。默认 0 = 主体底缘锚格心；
 * L 环观感如需整体下压/上提，改这一个数（如 0.1 = 下移 10% 格高） */
export const FOOT_DROP = 0;

export const BODY_ANCHOR = {
  // cx = 脚部中心（主体底部 12% 带的水平中点均值，00~03 标定）——真实站姿落点，比包围盒中心
  // （0.488，被侧伸的剑/手臂拉偏）更准；L 环四轮b：0.488 锚致脚偏左、躯干显偏右。
  hero: { cx: 0.527, bottom: 0.986 },
  humanoid: { cx: 0.546, bottom: 0.963 }, // 山贼
  wolf: { cx: 0.506, bottom: 0.961 }, // 野狼
  boss: { cx: 0.447, bottom: 0.977 }, // 狼王（脚部中心实测，构图偏画布左）
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
  basicLungeSec: 0.16, // 普攻半格前冲 + 回位（各半）——basicTotalSec 的构成基准
  strikeSec: 0.3, // 出招 05 挥出帧持续（04 蓄力 = chargeSec 0.1）
  basicTotalSec: 0.32, // 普攻 06 单帧 + 前冲回位全程（两段 basicLungeSec）
} as const;

// ===== 帧映射（硬规则：出招 04→05 两帧、普攻 06 单帧+代码动效、移动 01~03 循环、禁 05→06 直切） =====
export const BATTLE_FRAME = {
  idle: 3, // L 环三轮：战斗待机用侧身收拢站姿帧（03）——00 正面立绘水平翻转无效（翻了仍是正脸），
            // 战场待机应侧向对手；03 为双腿收拢过渡帧，静态显示最接近立正站姿。江湖场景 idle 仍用 00（正面合理）
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
