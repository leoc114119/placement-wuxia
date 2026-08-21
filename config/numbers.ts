// 只读展示参数（ADR-004：结算公式唯一真值在云函数 settle/core.js，此文件禁止放结算公式）
// T02 骨架阶段：仅放展示常量占位，后续任务按需求表补充

/** 规范色值（04-UI风格规范） */
export const PALETTE = {
  ink: '#2B2B2B',
  paper: '#F8F4EA',
  cinnabar: '#E2574C',
  bamboo: '#7FB069',
  gold: '#D4AF37',
} as const;

/** 清屏色：宣纸色 */
export const CLEAR_COLOR = PALETTE.paper;

/** FPS 日志间隔（毫秒），纯展示用 */
export const FPS_LOG_INTERVAL_MS = 5000;

// ============ T03 场景系统（只读展示参数，非结算公式） ============

/** 主角移动速度（逻辑坐标/秒，任务卡 §3 有限自由：建议 0.4，可调） */
export const HERO_WALK_SPEED = 0.4;

/** 可走区：中央走廊矩形（Q2-T03 定稿，对齐 scene_jianghu v6：野径远端起 y≈0.45 林带、底部路宽约半屏、底部 16% 留 UI 渐暗收边；区外点击 → 拉到最近走廊边界点，不拒绝） */
export const WALK_ZONE = {
  xMin: 0.24,
  xMax: 0.76,
  yMin: 0.46,
  yMax: 0.84,
} as const;

/** 到达判定距离（模块 02 §2.2：< 0.01 停止） */
export const ARRIVE_EPS = 0.01;

/** 主角出生点（逻辑坐标；(0.5, 0.72) 在 WALK_ZONE 走廊内 ✓） */
export const HERO_START = { x: 0.5, y: 0.72 };

/** 主角立绘显示高度占屏比（脚底锚点定位，模块 02 §1.1） */
export const HERO_HEIGHT_RATIO = 0.21; // L环反馈：0.3→0.21 缩小 30%

/**
 * hero 帧表映射（素材 v3 · Q1-T03 五轮定版）：
 * v3 实物（四项核验通过：腿位/朝向/收剑/腿间透明）——00 待机正面 / 01 左腿小步(侧左) / 02 右腿小步(侧左)
 * / 03 双脚收拢过渡(侧左) / 04 举手 / 05 挥出 / 06 普攻（threads 21:58 落地）。
 * 播报硬规则（Leo/CodeBuddy 22:00 定，T06 沿用）：走位 = 01~03 三帧循环；出招 = 04→05；普攻 = 06 单帧+代码动效。
 * 历程：①04 出招帧混入 walk（抬剑帧）②02/03 同侧迈开（滑）③01/02 抬脚不自然 ④素材 v3 重生成（小步交替+收剑）。
 */
export const HERO_FRAME = {
  idle: 0,
  walkStart: 1,
  walkEnd: 3,
  /** walk 单帧时长（毫秒） */
  walkFrameMs: 160,
  /** 预载帧数（00~03 共 4 张；04+ 出招帧 T06 再预载） */
  preloadCount: 4,
} as const;

/** hero 帧素材路径（实际文件为 hero_0X_transparent.png 透明版；白底 hero_0X.png 不用） */
export const heroFrameSrc = (i: number): string => `assets/ui/frames/hero/hero_0${i}_transparent.png`;

/** 场景名标签（左上角小胶囊：墨底淡金描边，需求表 #6；y=0.115 为胶囊中心，Q3-T03：下移至人物状态栏下沿之下，预留胶囊/状态栏区） */
export const SCENE_LABEL = {
  x: 0.05,
  y: 0.115,
  heightRatio: 0.045,
  fontRatio: 0.022,
  padXRatio: 0.018,
  radiusRatio: 0.012,
} as const;

/** 底部三按钮（圆形朱砂描边，图标大文字小，需求表 #8；yRatio=0.82 为按钮行中心，Q3-T03：上移至四 Tab 栏上沿 0.92 之上、场景面板内） */
export const SCENE_BUTTONS = {
  yRatio: 0.82,
  radiusRatio: 0.085, // 相对屏宽
  gap: 0.31, // 相邻按钮中心间距（占宽比，三钮等距）
  iconFontR: 0.72, // 图标字号 = r × 系数
  labelFontR: 0.34, // 小文字字号 = r × 系数
} as const;

/** 底部三按钮定义（id/图标字/小文字；点击仅占位 log，需求表 #8） */
export const SCENE_BUTTON_DEFS: ReadonlyArray<{ id: 'biguan' | 'guaji' | 'boss'; icon: string; label: string }> = [
  { id: 'biguan', icon: '闭', label: '闭关修炼' },
  { id: 'guaji', icon: '挂', label: '挂机' },
  { id: 'boss', icon: '战', label: '挑战Boss' },
];

// L环反馈：场景完整显示（contain 居中，宣纸底色补边），替代 cover 裁切
export const BG_FIT_CONTAIN = true;
