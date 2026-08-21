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
