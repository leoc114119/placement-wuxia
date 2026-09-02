// T16 战斗 hex 表现层常量（frontend）——只读展示/几何参数（ADR-004 同口径：本文件禁止放结算公式）。
// 依据：战场布局规格-六边形战棋.md 96 号（s=31 / 7×7 视口 / 平顶公式）、战斗界面视觉骨架.md v8 定稿
//（色彩/组件布局）、主架构《战斗界面接入技术方案》§2（渲染分层）。数值真值仍在 battle-core / 云端 settle。

import { BATTLE_FRAME } from './battle';

// ===== 六边形几何（96 号定值：平顶 flat-top，s=31 → 格 62×54pt） =====
export const HEX = {
  s: 31, // 外接圆半径（96 号定值；MVP 单档，缩放档位仅留常量）
  zoomTiers: [31, 24, 16], // 96 号三档缩放（MVP 只用第 0 档）
  zoomIndex: 0,
  sqrt3: Math.sqrt(3),
} as const;

/** 平顶六边形像素投影（方案 §2.2）：px = s×1.5×q；py = s×√3×(r + q/2)。返回相对棋盘原点的世界坐标 */
export function hexToWorld(q: number, r: number, s: number = HEX.s): { x: number; y: number } {
  return { x: s * 1.5 * q, y: s * HEX.sqrt3 * (r + q / 2) };
}

// ===== 棋盘（offset odd-r 存储：16×16 地图，可移动区居中 8×8） =====
export const BOARD = {
  cols: 16,
  rows: 16,
  movable: 8, // 可移动区边长（居中）
} as const;

// ===== 视口与镜头（96 号 7×7 视口 + 旧 T06 已验拖动口径） =====
export const CAMERA = {
  viewportCells: 7, // 以镜头中心 hex 为准的视口宽（96 号）
  dragThresholdPx: 8, // 拖动生效判定（位移超过=拖镜头非点按，旧 T06 已验证）
  worldPad: 40, // 棋盘世界包围盒四周留白（clamp 边距）
} as const;

// ===== 瓦片配色（v8 定稿：顶面草地绿/土黄、侧面深色土层、边缘高光描边） =====
export const TILE = {
  topGrass: '#7d9b4a', // 草地绿（可移动区）
  topDirt: '#c49a52', // 土黄（可移动区外）
  altBrightness: 1.07, // 相邻格高光交替系数（(q+r)&1 纹理）
  side: '#57432a', // 侧面土层
  sideShade: '#3e2f1c', // 侧面暗部（背光边）
  sideDepth: 12, // 立体厚度（px）
  edgeLight: '#d9c98f', // 顶面受光边描边
  edgeDark: '#2e2418', // 背光边描边
  strokeWidth: 1.5,
} as const;

// ===== 高亮层（L2：数据来自快照，渲染只画不算） =====
export const HIGHLIGHT = {
  move: 'rgba(110, 220, 110, 0.38)', // 移动范围（绿）
  moveEdge: 'rgba(160, 240, 160, 0.8)',
  attack: 'rgba(225, 70, 55, 0.42)', // 攻击范围（红）
  attackEdge: 'rgba(255, 120, 100, 0.85)',
  selected: 'rgba(245, 205, 70, 0.5)', // 选中格（金）
  selectedEdge: 'rgba(255, 230, 130, 0.95)',
} as const;

// ===== 棋子（L3；占位帧=既有 battle/ 小表，T14 Q 版帧到位换 spriteKey+定尺系数即可） =====
export const PIECE = {
  heightPerTile: 1.5, // 渲染高 = 格高(√3·s) × 本系数（定尺接口：T14 到位调此系数，O4）
  bossScale: 1.25, // Boss 放大
  walkFrameMs: 140, // 战斗步频（沿 config/battle BATTLE_FRAME 口径）
  moveLerpSec: 0.3, // 移动位移表现时长（session renderPos 追 pos 的参考口径；mock 同值）
  jumpMinCells: 1.5, // 位移超过该格距按轻功抛物线表现（否则行走）
  jumpHeightPx: 44, // 抛物线顶高
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

// ===== 主角弧形特绝轻毒四钮（L4；v8：深色底鎏金描边金字，直径≈头部宽 1.8 倍） =====
export const ARC_BTNS = {
  ids: ['te', 'jue', 'qing', 'du'] as const, // 特技/绝学/轻功/毒功（与 ActionRequest.selectSkill 的 skillId 对表）
  labels: ['特', '绝', '轻', '毒'],
  headWidthRatio: 0.3, // 头宽 ≈ 棋子渲染宽 × 本系数
  diameterPerHead: 1.8, // 钮直径 ≈ 头宽 × 1.8（v8）
  arcRadiusPerHead: 3.0, // 弧排布半径（×头宽）：四钮在头顶上方浅弧展开（间距>钮径防重叠）
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

// ===== 特效（L6：纯代码 fx；Q1②裁决——本期由 animState 驱动） =====
export const FX = {
  slashSec: 0.28, // 出招斩击弧
  hitSec: 0.25, // 受击环
  slashColor: 'rgba(255, 235, 160, 0.9)',
  hitColor: 'rgba(230, 80, 60, 0.85)',
  maxRadius: 34,
} as const;

// ===== 顶栏组件（L5；v8：定稿切图 + 代码压暗层 + 动态条/状态图标叠绘） =====
export const TOPBAR = {
  artW: 1440,
  artH: 300,
  dimAlpha: 0.25, // 代码压暗层（Leo：原稿过亮；目验可调）
  // 以下为 topbar.png 像素系标定值（cutout/measure.mjs 实测 2026-09-02）
  coverRed: { x: 318, y: 88, w: 534, h: 54 }, // 红条槽覆盖区（盖住烘焙血条后代码重画）
  coverBlue: { x: 318, y: 146, w: 538, h: 54 }, // 蓝条槽覆盖区
  barInset: 7, // 动态条内缩
  barH: 40, // 动态条高（槽内）
  hpColor: '#c0342c',
  neiliColor: '#2c62c0',
  slotBg: '#1a1410', // 槽底色
  statusSlots: { x: 321, y: 208, w: 396, h: 70 }, // 状态图标槽×4 区域（Q1③：占位枚举色块渲染）
  statusColors: {
    poison: '#5fae32', // 中毒
    bleed: '#c03028', // 流血
    internal: '#8a4ad0', // 内伤
    empty: '#241c12', // 空槽
  } as Record<string, string>,
} as const;

// ===== 组件布局（L5；v8 1440×2560 实测屏占比标定） =====
export const COMPONENT_LAYOUT = {
  plaque: { xRatio: 0.012, yRatio: 0.075, wRatio: 0.17 }, // 左侧木牌挂串
  ctrl: { xRatio: 0.795, yRatio: 0.758, wRatio: 0.183 }, // 右下托管/加速/逃跑
} as const;

/** ctrl_r_alpha.png（223×448）三钮行标定（measure.mjs 实测）→ ActionRequest 映射 */
export const CTRL_BUTTONS: ReadonlyArray<{ y: number; h: number; action: 'mode' | 'speed' | 'flee' }> = [
  { y: 2, h: 128, action: 'mode' }, // 托管
  { y: 163, h: 126, action: 'speed' }, // 加速
  { y: 319, h: 127, action: 'flee' }, // 逃跑
];

/** plaque_l_alpha.png（310×680）两块木牌标签热区（牌面占比标定 2026-09-02；文字已烘焙在切图内） */
export const PLAQUE_BUTTONS: ReadonlyArray<{ yRatio: number; hRatio: number; label: string }> = [
  { yRatio: 0.26, hRatio: 0.21, label: '装备' },
  { yRatio: 0.55, hRatio: 0.21, label: '武功' },
];

// ===== 素材路径表（资源外置铁律：路径唯一出处=本表；版本号防缓存，preview 换图 bump） =====
export const BATTLE_HEX_RES = {
  ver: 't16v2',
  env: 'assets/ui/pixel/battle/raw/battle_env_pure.png', // L0 纯环境底图（无格无 UI，1088×1920）
  topbar: 'assets/ui/pixel/battle/components/topbar.png',
  plaque: 'assets/ui/pixel/battle/components/plaque_l_alpha.png',
  ctrl: 'assets/ui/pixel/battle/components/ctrl_r_alpha.png',
  /** 占位帧表：沿用既有 battle/ 小表（frameSrc 与 ui/assets.ts 同源），T14 Q 版帧到位即换表 */
  frameSrc: (kind: string, i: number): string => {
    const dir = kind === 'hero' ? 'hero' : 'spr_' + kind.replace('npc-', '').replace(/-/g, '_');
    return `assets/ui/frames/battle/${dir}/${dir}_0${i}_transparent.png`;
  },
  frameCount: 8, // 00~07（BATTLE_FRAME.idle=7 需全量 8 帧）
  spriteKinds: ['hero', 'npc-shanzei'], // 占位阵容：主角 + 山贼
} as const;
