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
