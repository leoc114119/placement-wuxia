// 渲染层：只读数据、画出来（AGENTS.md 架构原则）。T02 仅实现清屏，界面随 T03+ 任务卡补全
import { CLEAR_COLOR } from '../config/numbers';
import type { FrameContext } from '../types';

/** 每帧渲染入口 */
export function render(frame: FrameContext): void {
  frame.ctx.fillStyle = CLEAR_COLOR;
  frame.ctx.fillRect(0, 0, frame.width, frame.height);
}
