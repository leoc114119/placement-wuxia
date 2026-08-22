// 战斗界面渲染层（75 v2.1 §1b/§1c/§2/§3/§8b/§8c；只读 BattleSession 状态画出来）
// UI 全代码绘制（ref_battle_ui_v4 仅风格基准）；格子由代码绘制叠加 scene_battle（背景无格线，唯一几何真源）
import {
  BAR,
  BODY_ANCHOR,
  FOOT_DROP,
  PLATFORM,
  BODY_HEIGHT_RATIO,
  BOARD_COLS,
  BOARD_ROWS,
  BOSS_SCALE,
  BATTLE_FRAME,
  FX,
  MOVE,
  ROUND_BTN,
  SKILL_BTN,
  SPRITE_HEIGHT_PER_TILE,
  TILE_HALF_H,
  TILE_HALF_W,
  TOP_PANEL,
  CAMERA,
} from '../config/battle';
import { PALETTE } from '../config/numbers';
import { battleWalkFrame, gridToWorld, worldToGrid, type BattleSession } from '../systems/battle-ui';
import type { BattleActor, FrameContext } from '../types';

/** 战斗帧图资源（hero + NPC 池 + UI 素材；由 game.ts 预载注入） */
export interface BattleAssets {
  bg: WxImage | null;
  framesByKind: Map<string, Array<WxImage | null>>; // key：configId 或 'hero'
}

/** 演出特效实例（§8c 四段时序；battle-ui 结算时入队由渲染推进） */
export interface FxInstance {
  kind: 'skill' | 'basic';
  worldX: number;
  worldY: number;
  radiusTiles: number; // 范围球半径（格）
  grade: number; // 品阶 → 主效时长
  t: number; // 已播秒
  hitFlash: boolean;
}

export function createFxBook(): FxInstance[] {
  return [];
}

/** 出招时入队（battle-ui 调；渲染层只消费） */
export function spawnFx(book: FxInstance[], fx: Omit<FxInstance, 't'>): void {
  book.push({ ...fx, t: 0 });
}

/** 每帧渲染入口（渲染层只读；statusBarBottomPx 锚顶避胶囊，同 Q3-R2 口径） */
export function renderBattle(
  frame: FrameContext,
  session: BattleSession,
  assets: BattleAssets,
  fxBook: FxInstance[],
  statusBarBottomPx = 0,
  layoutInfo?: BattleLayoutInfo,
  dragOffset: { x: number; y: number } = { x: 0, y: 0 },
): void {
  const { ctx, width, height } = frame;
  ctx.fillStyle = '#F8F4EA';
  ctx.fillRect(0, 0, width, height);

  // 相机：以主角渲染位置为中心，视窗不出棋盘世界包围盒（§1b.2；无缩放）
  const cam = computeCamera(session, width, height, dragOffset);
  const L = layoutInfo ?? { btnHits: [], overlayText: null, panel: null };
  drawEnvLayer(ctx, assets, width, height); // Layer0 静态环境（不随 cam）
  drawPlatform(ctx, session, cam); // Layer1 代码台面
  drawGrid(ctx, session, cam);
  drawManualCells(ctx, session, cam);
  drawFxs(ctx, fxBook, cam, frame.dt);
  drawActors(ctx, session, assets, cam);
  drawTopPanel(ctx, session, width, height, statusBarBottomPx);
  drawCornerButtons(ctx, session, width, height, L);
  drawSkillButtons(ctx, session, width, height, cam, L);
  drawOverlay(ctx, session, width, height, L);
}

// ---------- 相机与坐标 ----------

export interface Camera {
  ox: number; // 世界原点在屏幕上的位置
  oy: number;
}

/** 格 → 世界（F2a：战斗朝向随机已后置至 PVP——75 v2.4 删除翻转分支，固定我方 y=10 屏幕左下/敌方 y=1 右上） */
function projectGrid(_session: BattleSession, x: number, y: number): { x: number; y: number } {
  return gridToWorld(x, y);
}

/** 屏幕点 → 逻辑格（触摸反变换；相机还原） */
export function screenToBattleGrid(
  _session: BattleSession,
  cam: Camera,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return worldToGrid(sx - cam.ox, sy - cam.oy);
}

/** 棋盘世界包围盒（含 pad）；相机中心 = 主角世界位，clamp 后原点 = 屏中心 - 相机中心 */
export function computeCamera(
  session: BattleSession,
  width: number,
  height: number,
  dragOffset: { x: number; y: number } = { x: 0, y: 0 },
): Camera {
  const hero = session.player;
  const heroW = projectGrid(session, hero.renderX, hero.renderY);
  // F1 拖动跟手：手指右滑 dx>0 → 画面内容右移 → 屏幕原点 ox 增 → 相机中心 cx 减（dragOffset 为手指累计位移）
  let cx = heroW.x - dragOffset.x;
  let cy = heroW.y - dragOffset.y;
  // 棋盘（台面）世界包围盒——与朝向翻转无关的常量式（flip 是对称 y 翻转，极值不变；
  // 按角点公式取格会在 flip 下角互换错位——clamp 用例坐实后修正）
  void projectGrid;
  const minX = -BOARD_ROWS * TILE_HALF_W - CAMERA.worldPad;
  const maxX = BOARD_COLS * TILE_HALF_W + CAMERA.worldPad;
  const minY = -TILE_HALF_H - CAMERA.worldPad;
  const maxY = (BOARD_COLS + BOARD_ROWS - 1) * TILE_HALF_H + TILE_HALF_H + CAMERA.worldPad;
  const halfW = width / 2;
  const halfH = height / 2;
  // 视窗若已能覆盖全包围盒则居中；否则 clamp 相机中心使视窗不脱出
  cx = maxX - minX <= width ? (minX + maxX) / 2 : Math.min(maxX - halfW, Math.max(minX + halfW, cx));
  cy = maxY - minY <= height ? (minY + maxY) / 2 : Math.min(maxY - halfH, Math.max(minY + halfH, cy));
  return { ox: width / 2 - cx, oy: height / 2 - cy };
}

const worldToScreen = (cam: Camera, wx: number, wy: number): { x: number; y: number } => ({
  x: wx + cam.ox,
  y: wy + cam.oy,
});

/** 菱形格路径（中心 cx,cy；半径 THW/THH） */
function diamondPath(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy - TILE_HALF_H);
  ctx.lineTo(sx + TILE_HALF_W, sy);
  ctx.lineTo(sx, sy + TILE_HALF_H);
  ctx.lineTo(sx - TILE_HALF_W, sy);
  ctx.closePath();
}

// ---------- L0 背景 + 格子 ----------

/** 圆角矩形路径（不用 ctx.roundRect，兼容旧基础库） */
function roundedRectPath(
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

/** Layer0 环境层（75 v2.3 §1b.4）：屏幕空间静态 cover——不随拖动/相机平移（只拖棋盘不动景）。
 * v3 环境图 9:16 无台面（零几何契约）；缺图降级宣纸底。 */
function drawEnvLayer(ctx: CanvasRenderingContext2D, assets: BattleAssets, w: number, h: number): void {
  const img = assets.bg;
  if (!img) return;
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img as unknown as CanvasImageSource, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Layer1 战斗台（75 v2.3 §1b.4）：8×12 菱形台面全代码绘制——外轮廓填充 + 厚度侧沿 + 描边 + 格线。
 * 几何唯一真源 = 代码常量（THW/THH 投影），无任何贴图采样，「重合」由构造保证。 */
function drawPlatform(ctx: CanvasRenderingContext2D, session: BattleSession, cam: Camera): void {
  // 外轮廓四角 = 格 (0,0)/(COLS-1,0)/(COLS-1,ROWS-1)/(0,ROWS-1) 的顶点外扩半格
  const corner = (x: number, y: number) => {
    const w0 = projectGrid(session, x, y);
    return worldToScreen(cam, w0.x, w0.y);
  };
  const top = corner(0, 0);
  const right = corner(BOARD_COLS - 1, 0);
  const bottom = corner(BOARD_COLS - 1, BOARD_ROWS - 1);
  const left = corner(0, BOARD_ROWS - 1);
  const edge = (dx: number, dy: number): { x: number; y: number } => ({ x: dx * TILE_HALF_W, y: dy * TILE_HALF_H });
  const eT = edge(0, -1);
  const eR = edge(1, 0);
  const eB = edge(0, 1);
  const eL = edge(-1, 0);
  const pt = (c: { x: number; y: number }, e: { x: number; y: number }) => ({ x: c.x + e.x, y: c.y + e.y });

  // 侧沿（厚度：下/右/左三条边向下挤出 sideDepth，模拟悬浮台侧立面）
  const d = PLATFORM.sideDepth;
  ctx.beginPath();
  ctx.moveTo(pt(left, eL).x, pt(left, eL).y);
  ctx.lineTo(pt(bottom, eB).x, pt(bottom, eB).y);
  ctx.lineTo(pt(right, eR).x, pt(right, eR).y);
  ctx.lineTo(pt(right, eR).x + d * 0.35, pt(right, eR).y + d);
  ctx.lineTo(pt(bottom, eB).x, pt(bottom, eB).y + d);
  ctx.lineTo(pt(left, eL).x - d * 0.35, pt(left, eL).y + d);
  ctx.closePath();
  ctx.fillStyle = PLATFORM.side;
  ctx.fill();

  // 台面填充（外轮廓菱形）
  ctx.beginPath();
  ctx.moveTo(pt(top, eT).x, pt(top, eT).y);
  ctx.lineTo(pt(right, eR).x, pt(right, eR).y);
  ctx.lineTo(pt(bottom, eB).x, pt(bottom, eB).y);
  ctx.lineTo(pt(left, eL).x, pt(left, eL).y);
  ctx.closePath();
  ctx.fillStyle = PLATFORM.fill;
  ctx.fill();
  ctx.strokeStyle = PLATFORM.edge;
  ctx.lineWidth = PLATFORM.edgeWidth;
  ctx.stroke();
}

function drawGrid(ctx: CanvasRenderingContext2D, session: BattleSession, cam: Camera): void {
  ctx.save();
  ctx.strokeStyle = PLATFORM.grid;
  ctx.lineWidth = PLATFORM.gridWidth;
  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      const w0 = projectGrid(session, x, y);
      const s = worldToScreen(cam, w0.x, w0.y);
      diamondPath(ctx, s.x, s.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawManualCells(ctx: CanvasRenderingContext2D, session: BattleSession, cam: Camera): void {
  const cells = session.manualCells();
  const gold = session.manualChoice === 'qinggong';
  ctx.save();
  for (const c of cells) {
    const w0 = projectGrid(session, c.x, c.y);
    const s = worldToScreen(cam, w0.x, w0.y);
    diamondPath(ctx, s.x, s.y);
    ctx.fillStyle = gold ? 'rgba(212, 175, 55, 0.30)' : 'rgba(127, 176, 105, 0.30)';
    ctx.fill();
    ctx.strokeStyle = gold ? PALETTE.gold : PALETTE.bamboo;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- L1 棋子 ----------

function actorFrames(assets: BattleAssets, a: BattleActor): Array<WxImage | null> | null {
  const key = a.configId ?? 'hero';
  return assets.framesByKind.get(key) ?? null;
}

function actorFrameIdx(a: BattleActor): number {
  switch (a.animState) {
    case 'walk':
      return battleWalkFrame(a.animMs);
    case 'charge':
      return BATTLE_FRAME.charge;
    case 'strike':
      return BATTLE_FRAME.strike;
    case 'basic':
      return BATTLE_FRAME.basic;
    default:
      return BATTLE_FRAME.idle;
  }
}

/** renderH = tileVisualH × spriteHeightPerTile × bossScale（§8b.4；tileVisualH = 2·THH = 格边长）
 * ——此为角色主体目标高度；画布绘制高 = renderH ÷ 主体占比（帧画布含空白，狼近半空白，直放会显著偏矮） */
export function actorRenderH(a: BattleActor): number {
  const tileVisualH = 2 * TILE_HALF_H;
  const per = a.bodyKind === 'wolf' ? SPRITE_HEIGHT_PER_TILE.wolf : SPRITE_HEIGHT_PER_TILE.humanoid;
  return tileVisualH * per * (a.isBoss ? BOSS_SCALE : 1);
}

/** 帧画布主体占比（hero/山贼/狼/狼王；alpha 包围盒实测，L 环 08-22 对齐） */
function bodyRatio(a: BattleActor): number {
  if (a.isBoss) return BODY_HEIGHT_RATIO.boss;
  if (!a.configId) return BODY_HEIGHT_RATIO.hero;
  return a.bodyKind === 'wolf' ? BODY_HEIGHT_RATIO.wolf : BODY_HEIGHT_RATIO.humanoid;
}

/** 帧画布主体锚点（L 环四轮：主体中心 x / 底缘 y，精确落格心） */
function bodyAnchor(a: BattleActor): { cx: number; bottom: number } {
  if (a.isBoss) return BODY_ANCHOR.boss;
  if (!a.configId) return BODY_ANCHOR.hero;
  return a.bodyKind === 'wolf' ? BODY_ANCHOR.wolf : BODY_ANCHOR.humanoid;
}

function drawActors(ctx: CanvasRenderingContext2D, session: BattleSession, assets: BattleAssets, cam: Camera): void {
  const sorted = session.actors.slice().sort((a, b) => a.renderY - b.renderY); // z-order 按 y 升序
  for (const a of sorted) {
    const rw = projectGrid(session, a.renderX, a.renderY);
    let s = worldToScreen(cam, rw.x, rw.y);
    let sy = s.y;
    if (a.isJump && a.moveT < 1) {
      sy -= Math.sin(a.moveT * Math.PI) * MOVE.qinggongArcTiles * (TILE_HALF_H * 2); // 抛物线
    }
    if (a.lungeT < 1) {
      // 普攻前冲半格 + 回位（§8c 10b.3：sin 双程，峰值 0.5 格；格向量按等距投影换算屏幕增量）
      const k = Math.sin(a.lungeT * Math.PI) * 0.5;
      const gx = a.lungeDirX * k;
      const gy = a.lungeDirY * k;
      s = { x: s.x + (gx - gy) * TILE_HALF_W, y: s.y + (gx + gy) * TILE_HALF_H };
      sy = s.y;
    }
    // 脚下阵营菱形光圈（§8b.2：我淡金/敌朱砂）
    ctx.save();
    diamondPath(ctx, s.x, sy);
    ctx.fillStyle = a.side === 'player' ? 'rgba(212,175,55,0.22)' : 'rgba(226,87,76,0.22)';
    ctx.fill();
    ctx.restore();

    // billboard 立绘（竖直；朝向翻转；阵亡变灰半透明）
    const frames = actorFrames(assets, a);
    const img = frames?.[actorFrameIdx(a)] ?? null;
    const dh = actorRenderH(a) / bodyRatio(a); // 画布高（含空白）；主体高 = actorRenderH
    ctx.save();
    if (a.dead) ctx.globalAlpha = 0.45;
    if (img) {
      const dw = dh * (img.width / img.height);
      const anchor = bodyAnchor(a);
      ctx.translate(s.x, sy);
      if (a.facing === 'right') ctx.scale(-1, 1); // 素材默认面左（§8b.1）
      // 主体中心 x = 格心、主体底缘 = 格心 + FOOT_DROP 微调（L 环四轮锚定）
      ctx.drawImage(
        img as unknown as CanvasImageSource,
        -anchor.cx * dw,
        -anchor.bottom * dh + FOOT_DROP * TILE_HALF_H * 2,
        dw,
        dh,
      );
    } else {
      // 无帧降级：墨色胶囊
      const dw = dh * 0.38;
      ctx.fillStyle = a.dead ? '#9a9a9a' : '#2B2B2B';
      ctx.beginPath();
      ctx.ellipse(s.x, sy - dh / 2, dw / 2, dh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    drawActorHeader(ctx, a, s.x, sy - dh);
    s = { x: 0, y: 0 };
    void s;
  }
}

/** 头顶三行（§1c）：名字（config 色）+ 淡金行动条 + 朱砂血条 */
function drawActorHeader(ctx: CanvasRenderingContext2D, a: BattleActor, cx: number, topY: number): void {
  const w = 56;
  const lineH = 5;
  const boxH = lineH * 3 + 4;
  const y0 = topY - boxH - 4;
  ctx.save();
  // L 环五轮d：名字行加贴身半透明墨色小胶囊（只包名字，非旧版三行大黑框）+ 白描边——浅色台面上可读
  const nameFont = a.isBoss ? 11 : 10;
  ctx.font = `${a.isBoss ? 'bold ' : ''}${nameFont}px sans-serif`;
  const nameW = Math.min(w, ctx.measureText(a.name).width + 10);
  const nameH = nameFont + 5;
  const nameY = y0 + 6;
  roundedRectPath(ctx, cx - nameW / 2, nameY - nameH / 2, nameW, nameH, nameH / 2);
  ctx.fillStyle = a.isBoss ? 'rgba(20,12,10,0.72)' : 'rgba(20,20,20,0.6)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(248,244,234,0.9)';
  ctx.strokeText(a.name, cx, nameY);
  ctx.fillStyle = a.side === 'player' ? BAR.nameColorAlly : BAR.nameColorEnemy;
  ctx.fillText(a.name, cx, nameY);
  // 行动条（淡金）
  const barY = y0 + 13;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(cx - w / 2 + 3, barY, w - 6, 3);
  ctx.fillStyle = BAR.actionBarColor;
  ctx.fillRect(cx - w / 2 + 3, barY, (w - 6) * Math.min(1, a.bar / BAR.max), 3);
  // 血条（朱砂）
  const hpY = y0 + 18;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(cx - w / 2 + 3, hpY, w - 6, 3);
  ctx.fillStyle = BAR.hpBarColor;
  ctx.fillRect(cx - w / 2 + 3, hpY, (w - 6) * Math.max(0, a.hp / a.maxHp), 3);
  ctx.restore();
}

// ---------- fx（§8c 四段时序；纯代码几何/渐变） ----------

function drawFxs(ctx: CanvasRenderingContext2D, fxBook: FxInstance[], cam: Camera, dtMs: number): void {
  for (let i = fxBook.length - 1; i >= 0; i--) {
    const fx = fxBook[i];
    fx.t += dtMs / 1000;
    const total = FX.chargeSec + (FX.mainSecMin + Math.min(fx.grade, 1.7) * 0.18) + FX.hitFlashSec + FX.fadeSec;
    if (fx.t >= total) {
      fxBook.splice(i, 1);
      continue;
    }
    const s = worldToScreen(cam, fx.worldX, fx.worldY);
    const r = fx.radiusTiles * (TILE_HALF_W + TILE_HALF_H) * 0.5;
    let alpha = 0.9;
    if (fx.t < FX.chargeSec) alpha = (fx.t / FX.chargeSec) * 0.5; // 蓄势
    else if (fx.t > total - FX.fadeSec) alpha = ((total - fx.t) / FX.fadeSec) * 0.9; // 消散
    ctx.save();
    ctx.globalAlpha = alpha;
    // 范围高亮菱形（朱砂描边 + 浅填充）
    diamondPath(ctx, s.x, s.y);
    ctx.fillStyle = 'rgba(226,87,76,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(226,87,76,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 主效：扩散环（剑气/掌风同模板，品阶换色深）
    if (fx.t >= FX.chargeSec) {
      const p = Math.min(1, (fx.t - FX.chargeSec) / 0.4);
      ctx.beginPath();
      ctx.arc(s.x, s.y - 6, r * (0.3 + p * 0.9), 0, Math.PI * 2);
      ctx.strokeStyle = fx.kind === 'skill' ? 'rgba(212,175,55,0.8)' : 'rgba(248,244,234,0.85)';
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.stroke();
    }
    // 命中闪白
    if (fx.t >= FX.chargeSec + 0.2 && fx.hitFlash) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#FFFFFF';
      diamondPath(ctx, s.x, s.y);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- UI：顶栏三件套 / 圆钮 / 特轻绝 / 遮罩 ----------

function drawTopPanel(
  ctx: CanvasRenderingContext2D,
  session: BattleSession,
  w: number,
  h: number,
  statusBarBottomPx: number,
): void {
  // 照 preview/battle-preview.html .topbar（规格配套看板，Leo 指认正确 UI 稿）：
  // 半屏宽木质渐变底 + 墨描边 + 顶部内高光 + 左内侧淡金条 + 金边圆头像 + 朱砂血条 + 黛蓝内力条（A1 Q2）
  const p = session.player;
  const panelW = w * 0.5; // 看板口径：width 50%
  const panelH = Math.max(44, h * 0.075); // 看板 50px/667 ≈ 7.5%
  const x = w * 0.021;
  const y = statusBarBottomPx + TOP_PANEL.padRatio * h;
  const r = 10;
  ctx.save();
  // 木质渐变底
  const grad = ctx.createLinearGradient(0, y, 0, y + panelH);
  grad.addColorStop(0, '#8B6F47');
  grad.addColorStop(1, '#6B4E2D');
  ctx.beginPath();
  roundedRectPath(ctx, x, y, panelW, panelH, r);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#2B2B2B';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 顶部内高光 + 左内侧淡金条
  ctx.beginPath();
  roundedRectPath(ctx, x + 2, y + 2, panelW - 4, panelH * 0.42, r * 0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  ctx.fillStyle = 'rgba(212,175,55,0.35)';
  ctx.fillRect(x + 3, y + 6, 2, panelH - 12);
  // 金边圆头像
  const av = panelH * 0.62;
  const acx = x + 10 + av / 2;
  const acy = y + panelH / 2;
  ctx.beginPath();
  ctx.arc(acx, acy, av / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#5a4a38';
  ctx.fill();
  ctx.strokeStyle = BAR.actionBarColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#F8F4EA';
  ctx.font = `bold ${Math.round(av * 0.5)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('侠', acx, acy + 0.5);
  // 名字 + Lv
  const textX = x + 14 + av;
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#F8F4EA';
  ctx.fillText(`${p.name} Lv.8`, textX, y + panelH * 0.26);
  // 双条（朱砂血 / 黛蓝内力——A1 Q2；看板旧版竹青已被 75 v2.1 蓝色口径取代）
  const barW = panelW - (textX - x) - 10;
  const bar = (yy: number, ratio: number, c1: string, c2: string, label: string) => {
    ctx.fillStyle = 'rgba(43,43,43,0.5)';
    roundedRectPath(ctx, textX, yy, barW, panelH * 0.14, 2);
    ctx.fill();
    const g2 = ctx.createLinearGradient(textX, 0, textX + barW, 0);
    g2.addColorStop(0, c1);
    g2.addColorStop(1, c2);
    ctx.fillStyle = g2;
    roundedRectPath(ctx, textX, yy, barW * Math.max(0, Math.min(1, ratio)), panelH * 0.14, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '8px sans-serif';
    ctx.fillText(label, textX + 3, yy + panelH * 0.07 + 0.5);
  };
  bar(y + panelH * 0.36, p.hp / p.maxHp, '#C94A40', '#E2574C', `${p.hp}/${p.maxHp}`);
  bar(y + panelH * 0.62, p.maxNeili > 0 ? p.neili / p.maxNeili : 0, '#3E6480', '#4A7A9B', `${p.neili}/${p.maxNeili}`);
  ctx.restore();
}

/** 圆钮布局（左下/右下竖排；特轻绝同规格——代码统一常量） */
export function cornerButtonLayout(w: number, h: number): Array<{ id: string; label: string; cx: number; cy: number; r: number }> {
  const r = ROUND_BTN.radiusRatio * w;
  const gap = ROUND_BTN.gapRatio * h;
  const bottom = h - ROUND_BTN.bottomInsetRatio * h - r;
  const left = [
    { id: 'attr', label: '属' },
    { id: 'equip', label: '装' },
    { id: 'exit', label: '退' },
  ];
  const right = [
    { id: 'mode', label: '⚙' },
    { id: 'speed', label: '⏩' },
  ];
  return [
    ...left.map((b, i) => ({ ...b, r, cx: r + w * 0.04, cy: bottom - (left.length - 1 - i) * (r * 2 + gap) })),
    ...right.map((b, i) => ({ ...b, r, cx: w - r - w * 0.04, cy: bottom - (right.length - 1 - i) * (r * 2 + gap) })),
  ];
}

export interface BattleLayoutInfo {
  btnHits: Array<{ id: string; cx: number; cy: number; r: number }>;
  overlayText: string | null;
  panel: 'attr' | 'equip' | null;
}

function drawCornerButtons(
  ctx: CanvasRenderingContext2D,
  session: BattleSession,
  w: number,
  h: number,
  L: BattleLayoutInfo,
): void {
  // 照 preview/battle-preview.html .float-btns：正圆形、墨色半透明底、1.5px 淡金描边、宣纸色字；
  // 激活态（自动模式/2×）与退出 = 朱砂（看板 .on 口径）
  for (const b of cornerButtonLayout(w, h)) {
    ctx.save();
    let label = b.label;
    let active = false;
    if (b.id === 'mode') {
      label = session.mode === 'auto' ? '自' : '手';
      active = session.mode === 'auto';
    }
    if (b.id === 'speed') {
      label = session.speed === 2 ? '2×' : '1×';
      active = session.speed === 2;
    }
    if (b.id === 'exit') active = true;
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    ctx.fillStyle = active ? 'rgba(226,87,76,0.92)' : 'rgba(43,43,43,0.8)';
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(226,87,76,0.95)' : 'rgba(212,175,55,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#F8F4EA';
    ctx.font = `bold ${Math.round(b.r * ROUND_BTN.iconFontR)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, b.cx, b.cy + 0.5);
    ctx.restore();
    L.btnHits.push({ id: b.id, cx: b.cx, cy: b.cy, r: b.r });
  }
}

function drawSkillButtons(
  ctx: CanvasRenderingContext2D,
  session: BattleSession,
  w: number,
  h: number,
  cam: Camera,
  L: BattleLayoutInfo,
): void {
  const hero = session.pendingManual;
  if (!hero) return;
  const st = session.skillBtnStates();
  const rw = projectGrid(session, hero.renderX, hero.renderY);
  const sc = worldToScreen(cam, rw.x, rw.y);
  const r = ROUND_BTN.radiusRatio * w;
  const cy = sc.y - actorRenderH(hero) - SKILL_BTN.aboveActorPx - r;
  const defs: Array<{ id: string; label: string; on: boolean }> = [
    { id: 'te', label: '特', on: st.te },
    { id: 'qing', label: '轻', on: st.qing },
    { id: 'jue', label: '绝', on: st.jue },
  ];
  const totalW = defs.length * (r * 2 + SKILL_BTN.gapRatio * w) - SKILL_BTN.gapRatio * w;
  defs.forEach((d, i) => {
    const cx = sc.x - totalW / 2 + r + i * (r * 2 + SKILL_BTN.gapRatio * w);
    ctx.save();
    ctx.globalAlpha = d.on ? 1 : 0.45; // 置灰（内力不足/冷却）
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(43,43,43,0.8)';
    ctx.fill();
    ctx.strokeStyle = d.on ? '#D4AF37' : 'rgba(212,175,55,0.4)'; // 看板 .skill-btn：淡金描边
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(r * 0.7)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.label, cx, cy + 0.5);
    ctx.restore();
    L.btnHits.push({ id: d.id, cx, cy, r });
  });
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  session: BattleSession,
  w: number,
  h: number,
  L: BattleLayoutInfo,
): void {
  if (session.phase === 'fighting') return;
  const won = session.phase === 'won';
  const fled = session.phase === 'fled';
  const text = fled ? '已撤退' : won ? '胜 利' : '败 北';
  ctx.save();
  ctx.fillStyle = 'rgba(20,20,20,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = won && !fled ? '#D4AF37' : '#F8F4EA';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h * 0.42);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(248,244,234,0.85)';
  const r = session.result();
  ctx.fillText(
    fled ? '无损失退出' : `历时 ${r.durationSec.toFixed(1)} 秒 · 存活气血 ${r.finalHp.player} vs ${r.finalHp.enemy}`,
    w / 2,
    h * 0.52,
  );
  if (!fled) {
    ctx.fillStyle = 'rgba(212,175,55,0.75)';
    ctx.fillText('奖励与疗伤结算（待 T07 接入）', w / 2, h * 0.58); // A1 Q5 占位文案
  }
  L.overlayText = text;
  ctx.restore();
}
