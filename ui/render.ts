// 渲染层：只读数据、画出来（AGENTS.md 架构原则）
// 分层：全屏宣纸底 → L0 背景（SCENE_RECT 内 cover 裁切）→ L1 角色（主角+NPC 按 y 排序 z-order，T04）→ L2 UI 浮层（锚定布局）
import { CLEAR_COLOR, HERO_HEIGHT_RATIO, NPC_LABEL, PALETTE, SCENE_BUTTONS, SCENE_LABEL } from '../config/numbers';
import type { NpcConfig } from '../config/npcs';
import { computeSceneLayout, layoutSceneButtons, type SceneLayout } from '../systems/scene';
import type { FrameContext, NpcFrameAssets, NpcView, PlayerAvatar, SceneConfig, SceneView } from '../types';

/** 每帧渲染入口（view 由场景系统提供，渲染层只读）。
 * statusBarBottomPx：真机胶囊下沿（canvas 物理 px），0/缺省 = 无胶囊走 fallback 比例。
 * npcViews/npcConfigs/npcFrames：T04 NPC 氛围层（缺省空 = 无 NPC）。 */
export function render(
  frame: FrameContext,
  view: SceneView | null,
  statusBarBottomPx = 0,
  npcViews: NpcView[] = [],
  npcConfigs: Map<string, NpcConfig> = new Map(),
  npcFrames: Map<string, NpcFrameAssets> = new Map(),
): void {
  const { ctx, width, height } = frame;
  // 立绘大幅下采样（帧画布 512×1024 → 显示 ~90px）：高质量插值防糊（Canvas 默认 low）
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // 全屏宣纸底（含状态栏/Tab 预留区，Q3-R2）
  ctx.fillStyle = CLEAR_COLOR;
  ctx.fillRect(0, 0, width, height);
  if (!view) return;

  const layout = computeSceneLayout({ width, height, statusBarBottomPx });
  if (view.assets.bg) drawSceneBg(ctx, view.assets.bg, layout);

  // L1 角色统一按 y 排序 z-order（远→近；NPC 与主角同规则互相遮挡）
  const heroDraw = {
    y: view.avatar.y,
    draw: () => drawHero(ctx, width, height, view),
  };
  const npcDraws = npcViews.map((nv) => ({
    y: nv.avatar.y,
    draw: () => drawNpc(ctx, width, height, nv, npcConfigs.get(nv.avatar.configId), npcFrames.get(nv.avatar.configId)?.frames),
  }));
  [...npcDraws, heroDraw].sort((a, b) => a.y - b.y).forEach((d) => d.draw());

  drawSceneLabel(ctx, width, height, layout, view.scene);
  drawButtons(ctx, width, height, layout, view);
  // 助战入口 MVP 隐藏，不渲染（需求表 #7 / R-03）
}

/** L0 背景：SCENE_RECT 内 cover 居中裁切（短边撑满窗口、长边居中裁；不拉伸，Q3-R2 需求 #3） */
function drawSceneBg(ctx: CanvasRenderingContext2D, img: WxImage, layout: SceneLayout): void {
  const r = layout.sceneRect;
  const scale = Math.max(r.width / img.width, r.height / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.width, r.height);
  ctx.clip();
  ctx.drawImage(img as unknown as CanvasImageSource, r.x + (r.width - dw) / 2, r.y + (r.height - dh) / 2, dw, dh);
  ctx.restore();
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

/** L1 NPC：帧表绘制 + 头顶名字标签（脚底锚点贴地、朝向翻转复用主角规则、比例走 config，T04） */
function drawNpc(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  nv: NpcView,
  config: NpcConfig | undefined,
  frames: Array<WxImage | null> | undefined,
): void {
  if (!config) return;
  const a = nv.avatar;
  const img = frames?.[nv.frameIdx] ?? null;
  const footX = a.x * w;
  const footY = a.y * h;
  const dh = config.heightRatio * h;

  let topY = footY - dh; // 标签定位兜底（无图时也正确）
  if (img) {
    const dw = dh * (img.width / img.height);
    topY = footY - dh;
    ctx.save();
    ctx.translate(footX, footY);
    if (a.direction === 'right') ctx.scale(-1, 1); // 素材默认面左 → 朝右翻转（同主角）
    ctx.drawImage(img as unknown as CanvasImageSource, -dw / 2, -dh, dw, dh);
    ctx.restore();
  }

  // 名字标签：头顶墨底胶囊淡金小字（与场景名标签同风格；血条不做）
  const fontPx = Math.max(9, Math.round(NPC_LABEL.fontRatio * h));
  ctx.font = `${fontPx}px sans-serif`;
  const textW = ctx.measureText(config.name).width;
  const padX = NPC_LABEL.padXRatio * w;
  const boxH = NPC_LABEL.heightRatio * h;
  const boxW = textW + padX * 2;
  const bx = footX - boxW / 2;
  const by = topY - NPC_LABEL.offsetY * h - boxH / 2;

  ctx.fillStyle = PALETTE.ink;
  roundedRect(ctx, bx, by, boxW, boxH, fontPx * 0.5);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(config.name, footX, by + boxH / 2 + fontPx * 0.05);
}

/** L2 场景名标签：状态栏下胶囊（墨底淡金描边，需求表 #6；中心 y 由三段式布局锚定，Q3-R2） */
function drawSceneLabel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layout: SceneLayout,
  scene: SceneConfig,
): void {
  const fontPx = Math.round(SCENE_LABEL.fontRatio * h);
  ctx.font = `${fontPx}px sans-serif`;
  const textW = ctx.measureText(scene.name).width;
  const padX = SCENE_LABEL.padXRatio * w;
  const boxH = SCENE_LABEL.heightRatio * h;
  const x = SCENE_LABEL.x * w;
  const y = layout.labelCy - boxH / 2;
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

/** L2 底部三按钮：圆形朱砂描边 + 图标 PNG + 小文字（需求表 #8；行中心由布局锚定贴 Tab 栏上方） */
function drawButtons(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layout: SceneLayout,
  view: SceneView,
): void {
  layoutSceneButtons({ width: w, height: h }).forEach((b, i) => {
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(248, 244, 234, 0.92)'; // 宣纸底（微透，压得住背景）
    ctx.fill();
    ctx.strokeStyle = PALETTE.cinnabar;
    ctx.lineWidth = Math.max(2, b.r * 0.07);
    ctx.stroke();

    const icon = view.assets.buttonIcons[i] ?? null;
    if (icon) {
      const side = b.r * SCENE_BUTTONS.iconSizeR;
      ctx.drawImage(
        icon as unknown as CanvasImageSource,
        b.cx - side / 2,
        b.cy - b.r * 0.22 - side / 2,
        side,
        side,
      );
    } // 缺图降级：跳过图标只画文字（加载器已打日志）

    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(b.r * SCENE_BUTTONS.labelFontR)}px sans-serif`;
    ctx.fillText(b.button.label, b.cx, b.cy + b.r * 0.45);
  });
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
