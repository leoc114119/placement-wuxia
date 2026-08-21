// 渲染层：只读数据、画出来（AGENTS.md 架构原则）
// T03 分层渲染：L0 背景（cover 裁切）→ L1 主角（脚底锚点/朝向翻转）→ L2 UI 浮层（需求表 #1~#8）
import {
  BG_FIT_CONTAIN,
  CLEAR_COLOR,
  HERO_HEIGHT_RATIO,
  PALETTE,
  SCENE_BUTTONS,
  SCENE_LABEL,
} from '../config/numbers';
import { layoutSceneButtons } from '../systems/scene';
import type { FrameContext, PlayerAvatar, SceneConfig, SceneView } from '../types';

/** 每帧渲染入口（view 由场景系统提供，渲染层只读） */
export function render(frame: FrameContext, view: SceneView | null): void {
  const { ctx, width, height } = frame;
  // L0 背景：缺图降级宣纸纯色（加载器已打日志，需求表 #9）
  ctx.fillStyle = CLEAR_COLOR;
  ctx.fillRect(0, 0, width, height);
  if (!view) return;

  if (view.assets.bg) drawCover(ctx, view.assets.bg, width, height);
  drawHero(ctx, width, height, view);
  drawSceneLabel(ctx, width, height, view.scene);
  drawButtons(ctx, width, height);
  // 助战入口 MVP 隐藏，不渲染（需求表 #7 / R-03）
}

/** 铺底：BG_FIT_CONTAIN=true 完整显示居中（宣纸底补边）；否则 cover 裁切 */
function drawCover(ctx: CanvasRenderingContext2D, img: WxImage, w: number, h: number): void {
  const scale = BG_FIT_CONTAIN
    ? Math.min(w / img.width, h / img.height)
    : Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img as unknown as CanvasImageSource, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** L1 主角：脚底锚点 = 逻辑坐标像素点；朝向右时水平翻转（素材默认面左，需求表 #2/#4） */
function drawHero(ctx: CanvasRenderingContext2D, w: number, h: number, view: SceneView): void {
  const a: PlayerAvatar = view.avatar;
  const img = view.assets.heroFrames[view.heroFrameIdx] ?? null;
  const footX = a.x * w;
  const footY = a.y * h;

  if (img) {
    const dh = HERO_HEIGHT_RATIO * h;
    const dw = dh * (img.width / img.height);
    ctx.save();
    ctx.translate(footX, footY);
    if (a.direction === 'right') ctx.scale(-1, 1); // 面左素材 → 朝右翻转
    ctx.drawImage(img as unknown as CanvasImageSource, -dw / 2, -dh, dw, dh);
    ctx.restore();
    return;
  }

  // 无帧降级：墨色胶囊 + 行走上下颠簸（模块 02 §2.2「无帧时回退代码颠簸」）
  const bob = a.moving ? Math.sin((view.bobMs / HERO_FALLBACK_BOB_PERIOD) * Math.PI * 2) * h * 0.006 : 0;
  const dh = HERO_HEIGHT_RATIO * h;
  const dw = dh * 0.38;
  ctx.fillStyle = PALETTE.ink;
  roundedRect(ctx, footX - dw / 2, footY - dh + bob, dw, dh, dw / 2);
  ctx.fill();
}

const HERO_FALLBACK_BOB_PERIOD = 320; // 降级颠簸周期（毫秒）

/** L2 场景名标签：左上角小胶囊，墨底淡金描边（需求表 #6） */
function drawSceneLabel(ctx: CanvasRenderingContext2D, w: number, h: number, scene: SceneConfig): void {
  const fontPx = Math.round(SCENE_LABEL.fontRatio * h);
  ctx.font = `${fontPx}px sans-serif`;
  const textW = ctx.measureText(scene.name).width;
  const padX = SCENE_LABEL.padXRatio * w;
  const boxH = SCENE_LABEL.heightRatio * h;
  const x = SCENE_LABEL.x * w;
  const y = SCENE_LABEL.y * h - boxH / 2;
  const boxW = textW + padX * 2;

  ctx.fillStyle = PALETTE.ink;
  roundedRect(ctx, x, y, boxW, boxH, SCENE_LABEL.radiusRatio * h);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = Math.max(1, h * 0.0015);
  roundedRect(ctx, x, y, boxW, boxH, SCENE_LABEL.radiusRatio * h);
  ctx.stroke();

  ctx.fillStyle = PALETTE.paper;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(scene.name, x + padX, y + boxH / 2);
}

/** L2 底部三按钮：圆形朱砂描边，图标大文字小（需求表 #8，点击判定在 systems/scene） */
function drawButtons(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (const b of layoutSceneButtons({ width: w, height: h })) {
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(248, 244, 234, 0.92)'; // 宣纸底（微透，压得住背景）
    ctx.fill();
    ctx.strokeStyle = PALETTE.cinnabar;
    ctx.lineWidth = Math.max(2, b.r * 0.07);
    ctx.stroke();

    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(b.r * SCENE_BUTTONS.iconFontR)}px sans-serif`;
    ctx.fillText(b.button.icon, b.cx, b.cy - b.r * 0.18);
    ctx.font = `${Math.round(b.r * SCENE_BUTTONS.labelFontR)}px sans-serif`;
    ctx.fillText(b.button.label, b.cx, b.cy + b.r * 0.45);
  }
}

/** 圆角矩形路径（不用 ctx.roundRect，兼容旧基础库） */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
