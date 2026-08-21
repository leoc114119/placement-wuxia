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

/** 点击目标 clamp 边界（模块 02 §2.2） */
export const TARGET_CLAMP_MIN = 0.05;
export const TARGET_CLAMP_MAX = 0.95;

/** 到达判定距离（模块 02 §2.2：< 0.01 停止） */
export const ARRIVE_EPS = 0.01;

/** 主角出生点（逻辑坐标，模块 02 §0「立绘居中」+ 贴近地面行走的展示取值） */
export const HERO_START = { x: 0.5, y: 0.72 };

/** 主角立绘显示高度占屏比（脚底锚点定位，模块 02 §1.1） */
export const HERO_HEIGHT_RATIO = 0.21; // L环反馈：0.3→0.21 缩小 30%

/**
 * hero 帧表映射（Q1-T03 两轮修正定版）：
 * 素材实物 = 77 §2.2 六帧表口径——00 待机/01 左脚(起步抬腿,步幅大)/02 右脚/03 左脚/04 举手预备/05 挥出/06 普攻。
 * ①一轮：walk 01~04 → 01~03（04 出招预备混入 = 「抬剑帧」根因）；
 * ②二轮（Leo 复验拍板「左右走交替就可以了」）：01 起步抬腿帧观感夸张 → 弃用，walk = 02~03 左右两帧镜像交替。
 * 04~06 留给 T06 战斗出招。
 */
export const HERO_FRAME = {
  idle: 0,
  walkStart: 2,
  walkEnd: 3,
  /** walk 单帧时长（毫秒） */
  walkFrameMs: 160,
  /** 预载帧数（00~03 共 4 张；04+ 出招帧 T06 再预载） */
  preloadCount: 4,
} as const;

/** hero 帧素材路径（实际文件为 hero_0X_transparent.png 透明版；白底 hero_0X.png 不用） */
export const heroFrameSrc = (i: number): string => `assets/ui/frames/hero/hero_0${i}_transparent.png`;

/** 场景名标签（左上角小胶囊：墨底淡金描边，需求表 #6） */
export const SCENE_LABEL = {
  x: 0.05,
  y: 0.055,
  heightRatio: 0.045,
  fontRatio: 0.022,
  padXRatio: 0.018,
  radiusRatio: 0.012,
} as const;

/** 底部三按钮（圆形朱砂描边，图标大文字小，需求表 #8；布局参考 UI 基准等距排布） */
export const SCENE_BUTTONS = {
  yRatio: 0.885,
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
