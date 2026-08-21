// 微信小游戏环境最小类型声明（T02 骨架）：仅声明骨架用到的全局，随任务补全
interface WxCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  /** 微信小游戏主循环官方 API（全局无 requestAnimationFrame） */
  requestAnimationFrame(callback: () => void): void;
}

declare const wx: {
  createCanvas(): WxCanvas;
};

