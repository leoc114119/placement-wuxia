// 微信小游戏环境最小类型声明（T02 骨架）：仅声明骨架用到的全局，随任务补全
interface WxCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  /** 微信小游戏主循环官方 API（全局无 requestAnimationFrame） */
  requestAnimationFrame(callback: () => void): void;
}

/** wx.createImage 产物（结构同 HTMLImageElement，仅声明用到的字段） */
interface WxImage {
  src: string;
  width: number;
  height: number;
  onload?: (() => void) | null;
  onerror?: ((err: unknown) => void) | null;
}

interface WxTouch {
  identifier: number;
  clientX: number;
  clientY: number;
}

interface WxTouchEvent {
  touches: WxTouch[];
  changedTouches: WxTouch[];
}

interface WxSystemInfo {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
}

declare const wx: {
  createCanvas(): WxCanvas;
  createImage(): WxImage;
  onTouchStart(callback: (e: WxTouchEvent) => void): void;
  onTouchMove(callback: (e: WxTouchEvent) => void): void;
  onTouchEnd(callback: (e: WxTouchEvent) => void): void;
  onTouchCancel(callback: (e: WxTouchEvent) => void): void;
  getSystemInfoSync(): WxSystemInfo;
};

