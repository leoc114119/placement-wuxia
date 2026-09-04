// T16 战斗 hex 表现层常量（frontend）——只读展示/几何参数（ADR-004 同口径：本文件禁止放结算公式）。
// 依据：战场布局规格-六边形战棋.md 96 号（s=31 / 7×7 视口 / 平顶公式）、战斗界面视觉骨架.md v8 定稿
//（色彩/组件布局）、主架构《战斗界面接入技术方案》§2（渲染分层）。数值真值仍在 battle-core / 云端 settle。

import { BATTLE_FRAME } from './battle';

// ===== 六边形几何（96 号定值：平顶 flat-top，s=31 → 格 62×54pt） =====
// ===== 瓦片投影规格（L 环投影改造·Leo 看稿修正：尖角朝上/朝下的压扁六边形——上下尖角、左右竖直边，
// 宽:高 ≈ 1:0.7；行错位半格 + 行距 0.75H 拼贴出边缘整齐的长方形战区（绘制层战区矩形裁剪）；立体侧面厚 12%） =====
export const TILE_SPEC = {
  w: 88, // 横向平边间距（L 环二反馈①：62→88，560 宽基准每行 6.4 格 ∈ 6-7 格口径）
  hRatio: 0.7, // 宽:高 = 1:0.7（纵向尖到尖，压扁）
  rowRatio: 0.75, // 行距 = 压扁格高 × 0.75（奇偶行错位半格宽）
  sideRatio: 0.12, // 下尖角/下斜边侧面厚 = 格高 × 12%
} as const;

export const TILE_W = TILE_SPEC.w;
export const TILE_H = TILE_W * TILE_SPEC.hRatio;
export const ROW_H = TILE_H * TILE_SPEC.rowRatio;
export const SIDE_DEPTH = TILE_H * TILE_SPEC.sideRatio;

/** 瓦片 sprite 素材（美术窗口产出：草绿/土黄立体瓦片，透明底；空串=未到位走代码绘制） */
export const TILE_SPRITES = {
  grass: '',
  dirt: '',
} as const;

/** 压扁错位网格像素投影（投影层唯一公式；逻辑格 q/r 不变，col = q + ⌊r/2⌋ odd-r）：
 * px = (col + (row&1 ? 0.5 : 0)) × TILE_W；py = row × ROW_H。 */
export function hexToWorld(q: number, r: number): { x: number; y: number } {
  const col = q + Math.floor(r / 2);
  return { x: (col + (Math.abs(r) % 2 === 1 ? 0.5 : 0)) * TILE_W, y: r * ROW_H };
}

// ===== 棋盘（offset odd-r 存储：16×16 地图；可动区=T15 R3 定版 FIELD：12 高 × 8 宽） =====
export const BOARD = {
  cols: 16,
  rows: 16,
} as const;

/** 可动区（战区）边界（T15 R3 定版：col 4..11 / row 2..13，12 高 × 8 宽纵向走廊） */
export const FIELD = {
  colMin: 4,
  colMax: 11,
  rowMin: 2,
  rowMax: 13,
} as const;

// ===== 视口与镜头（96 号 7×7 视口 + 旧 T06 已验拖动口径） =====
export const CAMERA = {
  viewportCells: 7, // 以镜头中心 hex 为准的视口宽（96 号）
  dragThresholdPx: 8, // 拖动生效判定（位移超过=拖镜头非点按，旧 T06 已验证）
  worldPad: 40, // 战区裁剪包围盒四周留白（drawCells 用）
  followPad: 96, // 镜头跟随聚焦：可动区外扩窄边（L 环二反馈①：土黄外围自然推出视口，绿区铺满主体）
  smoothingSec: 0.22, // 镜头平滑回拉时长常数（L 环追加③：仅主角条满时回拉，指数平滑 tau）
} as const;

// ===== 轻功跳跃演出参数（L 环追加①② + Leo 实测反馈：参数随 hex 距离插值——
// 基准 2 格=0.6s/88px，每超 1 格 duration+0.15s、height+25%（线性），封顶防浮夸；短距 ≤2 格观感不变） =====
export const JUMP = {
  baseDuration: 0.6, // 基准演出时长（秒，≤2 格）
  baseHeight: 88, // 基准抛物线顶高（px，≤2 格）
  baseCells: 2, // 基准距离（格；≤ 此距离不加成）
  durationPerTile: 0.15, // 每超 1 格时长增量（秒）
  heightPerTileRatio: 0.25, // 每超 1 格高度增幅（基准的 25%，线性）
  maxDuration: 1.2, // 时长封顶
  maxHeight: 176, // 高度封顶（2 倍基准）
} as const;

/** 距离插值：hex 距离 → 演出时长/顶高（封顶防浮夸） */
export function jumpParamsFor(cells: number): { duration: number; height: number } {
  const extra = Math.max(0, cells - JUMP.baseCells);
  const duration = Math.min(JUMP.maxDuration, JUMP.baseDuration + JUMP.durationPerTile * extra);
  const height = Math.min(JUMP.maxHeight, JUMP.baseHeight * (1 + JUMP.heightPerTileRatio * extra));
  return { duration, height };
}

/** hex 距离（cube 口径，与 systems/hex 同式；渲染表现侧自含） */
export function hexDist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// ===== 瓦片配色（v8：草绿/土黄两族区域化分布，非棋盘交替；光照上暗下亮——底部光源氛围） =====
export const TILE = {
  topGrass: '#7d9b4a', // 草地绿（可移动区）
  topDirt: '#c49a52', // 土黄（可移动区外）
  side: '#57432a', // 侧面土层（左下段）
  sideShade: '#3e2f1c', // 侧面暗部（右下段，背光）
  sideLit: '#6b543a', // 侧面受光段（底缘，底部光源氛围）
  sideDepth: SIDE_DEPTH, // 立体厚度（压扁规格派生）
  edgeLight: '#d9c98f', // 顶面受光边描边
  edgeDark: '#2e2418', // 背光边描边
  strokeWidth: 1.5,
} as const;

// ===== 高亮层（L2：数据来自快照，渲染只画不算；moveKind 换色——绿=普通走位 / 金=轻功跳跃，联调 F1） =====
export const HIGHLIGHT = {
  move: 'rgba(110, 220, 110, 0.38)', // 移动范围（绿）
  moveEdge: 'rgba(160, 240, 160, 0.8)',
  jump: 'rgba(245, 205, 70, 0.45)', // 轻功跳跃可达（金）
  jumpEdge: 'rgba(255, 230, 130, 0.95)',
  attack: 'rgba(225, 70, 55, 0.42)', // 攻击范围（红）
  attackEdge: 'rgba(255, 120, 100, 0.85)',
  selected: 'rgba(245, 205, 70, 0.5)', // 选中格（金）
  selectedEdge: 'rgba(255, 230, 130, 0.95)',
} as const;

// ===== 棋子（L3；占位帧=既有 battle/ 小表，T14 Q 版帧到位换 spriteKey+定尺系数即可） =====
export const PIECE = {
  heightPerTile: 2.0, // 渲染高 = 压扁格高(TILE_H) × 本系数（定尺接口：T14 到位调此系数，O4）
  bossScale: 1.25, // Boss 放大
  walkFrameMs: 140, // 战斗步频（沿 config/battle BATTLE_FRAME 口径）
  moveLerpSec: 0.3, // 普通行走位移表现时长
  jumpHeightPx: 88, // 轻功抛物线顶高（L 环追加②：44→88 翻倍；=JUMP.height 同源）
  deadAlpha: 0.45, // 阵亡变灰透明度
  hitFlashSec: 0.15, // 受击红闪时长
} as const;

/** animState → 帧组（帧组播报铁律：组内单播、组间不跨——组切换从组首帧重放，禁 05→06 直切）
 * 帧号与 config/battle.ts BATTLE_FRAME 同源：01~03 行走 / 04 蓄力 / 05 出招挥出 / 06 普攻 / 07 侧身待机 */
export const ANIM_FRAMES: Record<string, readonly number[]> = {
  idle: [BATTLE_FRAME.idle],
  walk: [BATTLE_FRAME.walkStart, BATTLE_FRAME.walkStart + 1, BATTLE_FRAME.walkEnd],
  charge: [BATTLE_FRAME.charge],
  strike: [BATTLE_FRAME.strike],
  basic: [BATTLE_FRAME.basic],
  hit: [0],
  dead: [0],
} as const;

/** 循环型帧组（walk 循环重放；其余单播型：播到组尾帧保持，直到 session 切状态） */
export const ANIM_LOOP_GROUPS: readonly string[] = ['walk'];

/** 出招演出时序（🟡 手感项，preview 目验可调；mock 按此驱动 animState 时间线） */
export const CHOREO = {
  chargeSec: 0.1, // 蓄力段（04）
  strikeSec: 0.3, // 出招挥出（05）
  basicSec: 0.32, // 普攻全程（06+前冲回位口径）
  hitSec: 0.18, // 受击段
} as const;

// ===== 棋子 HUD（L4：v8 §1 头顶三件套——名字牌→绿行动条→红血条） =====
export const HUD = {
  nameFontPx: 9,
  nameAlly: '#a8d8a8', // 我方淡绿字（v8）
  nameEnemy: '#e89a9a', // 敌方淡红字（v8）
  barW: 46, // 条宽（px）
  barH: 4,
  barGap: 2, // 条间距
  aboveHead: 4, // 三件套距头顶偏移
  actionBarColor: '#5fd35f', // 绿行动条（v8）
  hpBarColor: '#e04540', // 红血条（v8）
  barBg: 'rgba(10, 10, 10, 0.6)',
  nameBg: 'rgba(10, 10, 10, 0.45)',
} as const;

// ===== 主角弧形特绝轻毒四钮（L4；v8：深色底鎏金描边金字；L 环反馈⑥：直径=头宽 2.4 倍放大可点面积） =====
export const ARC_BTNS = {
  ids: ['te', 'jue', 'qing', 'du'] as const, // 特技/绝学/轻功/毒功（与 ActionRequest.selectSkill 的 skillId 对表）
  labels: ['特', '绝', '轻', '毒'],
  headWidthRatio: 0.32, // 头宽 ≈ 棋子渲染宽 × 本系数
  diameterPerHead: 2.4, // 钮直径 ≈ 头宽 × 2.4（L 环⑥：1.8→2.4 放大可点面积）
  arcRadiusPerHead: 3.6, // 弧排布半径（×头宽）：弧距 = R×Δθ/3 ≈ 头宽×3.15 > 钮径，防重叠
  angleFromDeg: 195, // 弧起始角（度，屏幕坐标系：180=正左、270=正上）
  angleToDeg: 345, // 弧终止角
  popSec: 0.18, // 弹出动画时长
  colorBg: '#241a10',
  colorRim: '#d4af37',
  colorText: '#ffd870',
  colorTextDisabled: '#8a7a58',
  rimWidth: 2,
  rimWidthSelected: 3.5,
  rimColorSelected: '#fff0b0',
  disabledAlpha: 0.45, // 内力不足/冷却中置灰
} as const;

/** rejected 事件轻提示文案（T15 R3：拒绝可观测；按 reason 映射，头顶冒字） */
export const REJECT_HINTS: Record<string, string> = {
  bar: '行动条未就绪',
  range: '目标超出射程',
  invalid: '无法执行',
};

// ===== 特效（L6：纯代码 fx；Q1②裁决——本期由 animState 驱动） =====
export const FX = {
  slashSec: 0.28, // 出招斩击弧
  hitSec: 0.25, // 受击环
  slashColor: 'rgba(255, 235, 160, 0.9)',
  hitColor: 'rgba(230, 80, 60, 0.85)',
  maxRadius: 34,
} as const;

// ===== 受击反馈 DMG 参数组（T21 · 方案 §2.6 全表；ADR-004 只读展示参数，无结算公式——L 环真机手感可调） =====
export const DMG = {
  sec: 0.6, // 冒字寿命（s）
  risePx: 24, // 上浮量（px）
  fontPerH: 0.026, // 屏高定尺系数（667 屏 ≈ 17px；数字挂角色走屏高系，与 note 组件屏宽系刻意不同源——裁决①）
  fillColor: '#ffffff', // 白字
  strokeColor: '#1c1c1c', // 深描边
  strokeWidth: 3, // 描边宽（px）
  shakeSec: 0.2, // 震动时长（s）
  shakePx: 3, // 震动幅度（±px）
  shakeFreq: 55, // 震动频率（sin(t×freq)，rad/s）
  staggerPx: 6, // 同位错位步长（px×命中序）
  staggerWindowMs: 600, // 同位错位窗口（ms；滑动窗口，at=上一条 spawn 时刻——09-03 PM 裁 Q2）
  flushDeadlineSec: 1.5, // 挂起冲刷兜底超时（s；> walk 300ms + 余量）
  missText: '闪避', // miss 冒字文案（miss 不震动只冒字——§六确认点 1）
} as const;

// ===== 顶栏组件（L5；T23 实装：topbar_base.png 无字底图 + 代码条/名字/百分比/状态图标；
// 常量组按 topbar_meta.json 重标定 2026-09-04——meta 双格式统一转 {x,y,w,h}：
// bar_*_fill/name_bbox 原为 [x0,y0,x1,y1]、icon_* 原为 [x,y,w,h]、slots 原为 {x0,x1,y0,y1}，禁运行时读 json） =====
export const TOPBAR = {
  artW: 1440,
  artH: 300,
  dimAlpha: 0.25, // 代码压暗层（Leo：原稿过亮；目验可调，零行为变更保留）
  redFill: { x: 321, y: 94, w: 437, h: 43 }, // 血条槽（meta bar_red_fill [321,94,758,137] 实测原稿烘焙红填充严丝合缝）
  blueFill: { x: 322, y: 153, w: 315, h: 42 }, // 内力条槽（meta bar_blue_fill [322,153,637,195]）
  nameBox: { x: 322, y: 23, w: 149, h: 47 }, // 名字区（meta name_bbox [322,23,471,70]，左对齐垂直居中）
  statusSlots: [
    // 状态图标槽×4（meta slots {x0,x1,y0,y1} 转换；图标按槽中心对齐绘制）
    { x: 321, y: 206, w: 84, h: 78 },
    { x: 420, y: 206, w: 83, h: 78 },
    { x: 517, y: 206, w: 78, h: 78 },
    { x: 625, y: 206, w: 82, h: 78 },
  ],
  hpGradient: ['#e22a23', '#931a15'], // 血条纵向渐变 条顶→条底（开放点①默认：采样原稿，rgb(226,42,35)→rgb(147,26,21)）
  neiliGradient: ['#1a94f4', '#064faf'], // 内力条纵向渐变（rgb(26,148,244)→rgb(6,79,175)）
  nameFontPx: 44, // 名字字号（art px，×k 落屏）
  pctFontPx: 34, // 百分比字号（art px）
  pctPadRight: 6, // 百分比右对齐锚 = 填充末端 − 本值（art px，随填充末端移动复刻烘焙稿位）
  textFill: 'rgb(242, 228, 192)', // 奶黄字（ctrl_face_text_meta 同族）
  textStroke: 'rgb(42, 29, 18)', // 深描边（同族）
  textStrokeWidth: 5, // 描边宽（art px，strokeText 先描后填）
  fontStack: '"Songti SC","STSong","SimSun",serif', // 宋体栈（微信端无系统宋体回退 serif，M4 目验）
} as const;

// ===== 组件布局（L5；L 环反馈④：ctrl 改右下锚定+高度占比上限——任何窗口比例恒贴右下可见） =====
export const COMPONENT_LAYOUT = {
  /** 左侧木牌挂串（左上锚） */
  plaque: { leftRatio: 0.012, topRatio: 0.075, wRatio: 0.17, maxHRatio: 0.42 },
  /** 右下托管/加速/逃跑（右下锚）：w=min(wRatio×W, maxHRatio×H÷artH/artW) —— 短边约束防溢出 */
  ctrl: { rightRatio: 0.02, bottomRatio: 0.025, wRatio: 0.183, maxHRatio: 0.42 },
} as const;

/** ctrl 组件美术标定尺寸（锚定/行映射用它，弱化对图片对象尺寸的依赖） */
export const CTRL_ART = { w: 223, h: 448 } as const;

/** plaque 组件美术标定尺寸（T20-FE D-13：pickPlaqueButton 的 art→屏换算用，与 CTRL_ART 对称） */
export const PLAQUE_ART = { w: 310, h: 680 } as const;

/**
 * 组件热区容差（T20-FE D-13 / HIT-1）：标定矩形四边外扩 短边×ratio，分部件定值。
 * 【2026-09-03 Leo/PM 裁决】方案 §4.2 单值 tolRatio=0.15 与 §2.4/§4.3/§九-5 冲突（ctrl 钮容差
 * ≈19px art 会吞没钮间隙 33px 与左右边缘 2~5px，热区=外接矩形全覆盖、收缩量为负）——裁决：
 * ctrl=0（满宽条带实体，标定矩形本体即热区，间隙+边缘自然 fall-through）；plaque=0.15
 *（≈21px art ≈4.5px 屏，与弧钮 1.3 半径容差折算精度同量级）。ADR-004 口径展示参数，preview 手感可调。
 */
export const HIT_TOL = { ctrl: 0, plaque: 0.15 } as const;

/**
 * ctrl_r_alpha.png（=CTRL_ART 尺寸）三钮热区标定矩形（art 坐标系）→ ActionRequest 映射。
 * T20-FE D-13 复量核定（行剖面 alpha>240，measure_hotzones.mjs）：实体 bbox 钮1 {x:3,w:218} /
 * 钮2 {x:2,w:219} / 钮3 {x:2,w:219}，行宽下限 202——落库值取方案 §4.2 参考值（收 2~3px 安全边，
 * 防素材边缘半透明噪点；容差 19px 外扩下手感无差）。装饰性边缘光晕不设热区。
 */
export const CTRL_BUTTONS: ReadonlyArray<{ x: number; y: number; w: number; h: number; action: 'mode' | 'speed' | 'flee' }> = [
  { x: 5, y: 2, w: 216, h: 128, action: 'mode' }, // 托管
  { x: 5, y: 163, w: 213, h: 126, action: 'speed' }, // 加速
  { x: 5, y: 319, w: 213, h: 127, action: 'flee' }, // 逃跑
];

/**
 * ctrl 代码字样式（T23 · ctrl_face_text_meta.json 落库 2026-09-04；ADR-004 只读展示参数）。
 * 比例位以钮本体宽 216 为基准（切图=钮本体 1:1，meta 的 252×164 canvas 为设计画布溯源、代码不使用）；
 * text_center [132,66] 为 Leo 09-04 右移定值（避开骷髅/双刀装饰图标，meta note），需求文档旧值 122 已勘误。
 */
export const CTRL_TEXT = {
  fontStack: '"Songti SC","STSong","SimSun",serif', // 宋体（meta font Songti；微信端回退 serif，M4 目验）
  sizeRatio: 50 / 216, // 字号 50 @钮本体 216 宽（等比 ×btnW）
  fill: 'rgb(242, 228, 192)', // 奶黄
  stroke: 'rgb(42, 29, 18)', // 深描边
  strokeWidthRatio: 5 / 216, // 描边宽 5 @216（strokeText 先描后填）
  shadowOffsetRatio: 3 / 216, // 阴影偏移 3 @216（深色错位垫底实现）
  centerRatio: { x: 132 / 216, y: 66 / 216 }, // 文字中心在钮矩形内的比例位（meta text_center [132,66]）
  normal: { mode: '托管', speed: '加速' }, // 常态字（meta normal_text）
  active: { mode: '自动', speed: '两倍' }, // 激活字（meta active_text）；逃跑=静态图不叠字
} as const;

/**
 * ctrl 激活态样式（判定源=view.uiState 宿主镜像，渲染层禁直调 session._debug）。
 * Leo 09-04 L环拍板：去叠亮/柔光，激活态=金框+换字（meta active_fx 的 brighten/glow 五参数随之失效删除，仅存 gold_frame）。
 */
export const CTRL_ACTIVE = {
  goldFrame: 'rgba(255, 205, 95, 0.95)', // 金框（meta gold_frame [255,205,95]）
  frameWidthRatio: 4 / 216, // 金框线宽 @216（≈4）
} as const;

/**
 * plaque_l_alpha.png（=PLAQUE_ART 尺寸）两块木牌热区标定矩形（牌面占比；文字已烘焙在切图内）。
 * T20-FE D-13 复量核定（最长连续实体 run 口径，系绳孔收腰防全行计数高估）：落库 x/w 取方案 §4.2
 * 参考值 26/273（可点主体，左右透明边+侧穗不设热区）；y/hRatio 沿 2026-09-02 牌面标定不动
 *（0.26/0.55、0.21 ≈ 方案 h:143px 口径；run 复核牌体带 y 177..306/367..504 落在现带内，收腰段保留可点）。
 * 装饰件（顶部横杆/挂绳/流苏）不设热区——HIT-1「可点部件的实际图形」收窄解释（方案 §九-5）。
 */
export const PLAQUE_BUTTONS: ReadonlyArray<{ xRatio: number; yRatio: number; wRatio: number; hRatio: number; label: string }> = [
  { xRatio: 26 / 310, yRatio: 0.26, wRatio: 273 / 310, hRatio: 0.21, label: '装备' },
  { xRatio: 26 / 310, yRatio: 0.55, wRatio: 273 / 310, hRatio: 0.21, label: '武功' },
];

// ===== 素材路径表（资源外置铁律：路径唯一出处=本表；版本号防缓存，preview 换图 bump） =====
export const BATTLE_HEX_RES = {
  ver: 't23v1',
  env: 'assets/ui/pixel/battle/raw/battle_env_pure.png', // L0 纯环境底图（无格无 UI，1088×1920）
  topbar: 'assets/ui/pixel/battle/components/topbar_base.png', // T23：无字底图（名字/百分比/条由代码绘制）
  plaque: 'assets/ui/pixel/battle/components/plaque_l_alpha.png',
  /** T23：ctrl 三钮独立脸（切图=CTRL_BUTTONS 钮本体 1:1 预裁；缺图逐钮代码占位兜底） */
  ctrlFaces: {
    tuoguan: 'assets/ui/pixel/battle/components/ctrl_tuoguan_face.png',
    jiasu: 'assets/ui/pixel/battle/components/ctrl_jiasu_face.png',
    flee: 'assets/ui/pixel/battle/components/ctrl_flee.png',
  },
  /** T23：状态图标映射表（key 词表 poison/blood/skull，与 types.ts:290 冻结字段注释语义对齐；
   * 传入 key 命中即点亮，MVP 快照恒空数组=空槽；第 4 槽无素材预留不映射） */
  statusIcons: {
    poison: 'assets/ui/pixel/battle/components/icon_status_poison.png',
    blood: 'assets/ui/pixel/battle/components/icon_status_blood.png',
    skull: 'assets/ui/pixel/battle/components/icon_status_skull.png',
  },
  /** 占位帧表：沿用既有 battle/ 小表（frameSrc 与 ui/assets.ts 同源），T14 Q 版帧到位即换表 */
  frameSrc: (kind: string, i: number): string => {
    const dir = kind === 'hero' ? 'hero' : 'spr_' + kind.replace('npc-', '').replace(/-/g, '_');
    return `assets/ui/frames/battle/${dir}/${dir}_0${i}_transparent.png`;
  },
  frameCount: 8, // 00~07（BATTLE_FRAME.idle=7 需全量 8 帧）
  /** 预载帧表键（联调 F3：敌方 spriteKey=configId，按 T15 敌型对齐；玩家恒 'hero'） */
  spriteKinds: ['hero', 'npc-shanzei', 'npc-lang'],
} as const;
