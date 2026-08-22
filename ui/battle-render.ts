// 战斗界面渲染层（75 v2.1 §1b/§1c/§2/§3/§8b/§8c；只读 BattleSession 状态画出来）
// UI 全代码绘制（ref_battle_ui_v4 仅风格基准）；格子由代码绘制叠加 scene_battle（背景无格线，唯一几何真源）
import {
  BAR,
  BG_PLATFORM,
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

/** 战斗帧图资源（hero + NPC 池；由 game.ts 预载注入） */
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
  drawBoardBg(ctx, assets, cam);
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

/** 格 → 世界（战斗朝向随机：flip 时渲染层 y 翻转，逻辑坐标不变，§1b.1） */
function projectGrid(session: BattleSession, x: number, y: number): { x: number; y: number } {
  return session.facingFlip ? gridToWorld(x, BOARD_ROWS - 1 - y) : gridToWorld(x, y);
}

/** 屏幕点 → 逻辑格（触摸反变换；相机 + 朝向翻转双还原） */
export function screenToBattleGrid(
  session: BattleSession,
  cam: Camera,
  sx: number,
  sy: number,
): { x: number; y: number } {
  const g = worldToGrid(sx - cam.ox, sy - cam.oy);
  return session.facingFlip ? { x: g.x, y: BOARD_ROWS - 1 - g.y } : g;
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
  let cx = heroW.x + dragOffset.x;
  let cy = heroW.y + dragOffset.y;
  // 棋盘包围盒（0..COLS-1 / 0..ROWS-1 格中心的世界范围 + 半格 + pad）
  const minX = projectGrid(session, BOARD_COLS - 1, 0).x - TILE_HALF_W - CAMERA.worldPad;
  const maxX = projectGrid(session, 0, BOARD_ROWS - 1).x + TILE_HALF_W + CAMERA.worldPad;
  const minY = projectGrid(session, 0, 0).y - TILE_HALF_H - CAMERA.worldPad;
  const maxY = projectGrid(session, BOARD_COLS - 1, BOARD_ROWS - 1).y + TILE_HALF_H + CAMERA.worldPad;
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

function drawBoardBg(ctx: CanvasRenderingContext2D, assets: BattleAssets, cam: Camera): void {
  const img = assets.bg;
  if (!img) return; // 缺图降级宣纸底（加载器已打日志）
  // 素材原始像素 1:1 贴入世界系：BG_PLATFORM 锚点（台面顶面中心，像素实测）对齐棋盘菱形中心
  // （格 (3.5, 5.5) 投影点）——代码格叠素材台面重合的几何基础（L 环 08-22 对齐）
  const centerX = ((BOARD_COLS - 1) / 2 - (BOARD_ROWS - 1) / 2) * TILE_HALF_W;
  const centerY = ((BOARD_COLS - 1) / 2 + (BOARD_ROWS - 1) / 2) * TILE_HALF_H;
  const topLeft = worldToScreen(cam, centerX - BG_PLATFORM.anchorX, centerY - BG_PLATFORM.anchorY);
  ctx.drawImage(img as unknown as CanvasImageSource, topLeft.x, topLeft.y, img.width, img.height);
}

function drawGrid(ctx: CanvasRenderingContext2D, session: BattleSession, cam: Camera): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(43, 43, 43, 0.28)';
  ctx.lineWidth = 1;
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

function drawActors(ctx: CanvasRenderingContext2D, session: BattleSession, assets: BattleAssets, cam: Camera): void {
  const sorted = session.actors.slice().sort((a, b) => a.renderY - b.renderY); // z-order 按 y 升序
  for (const a of sorted) {
    const rw = projectGrid(session, a.renderX, a.renderY);
    let s = worldToScreen(cam, rw.x, rw.y);
    let sy = s.y;
    if (a.isJump && a.moveT < 1) {
      sy -= Math.sin(a.moveT * Math.PI) * MOVE.qinggongArcTiles * (TILE_HALF_H * 2); // 抛物线
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
      ctx.translate(s.x, sy);
      if (a.facing === 'right') ctx.scale(-1, 1); // 素材默认面左（§8b.1）
      ctx.drawImage(img as unknown as CanvasImageSource, -dw / 2, -dh, dw, dh);
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
  ctx.fillStyle = 'rgba(20,20,20,0.45)';
  ctx.fillRect(cx - w / 2, y0, w, boxH);
  // 名字（我竹青/敌朱砂；Boss 加大加粗）
  ctx.font = `${a.isBoss ? 'bold ' : ''}${a.isBoss ? 11 : 9}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = a.side === 'player' ? BAR.nameColorAlly : BAR.nameColorEnemy;
  ctx.fillText(a.name, cx, y0 + 6);
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
  const p = session.player;
  const panelH = TOP_PANEL.heightRatio * h;
  const y = statusBarBottomPx + TOP_PANEL.padRatio * h;
  const pad = TOP_PANEL.padRatio * w;
  const av = TOP_PANEL.avatarRatio * w;
  ctx.save();
  ctx.fillStyle = 'rgba(43,43,43,0.82)';
  ctx.fillRect(pad, y, w - pad * 2, panelH);
  // 头像（圆形 + 等级角标；用 hero 帧表 00 若有）
  const cy = y + panelH / 2;
  ctx.beginPath();
  ctx.arc(pad + av / 2 + panelH * 0.1, cy, av / 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(248,244,234,0.15)';
  ctx.fill();
  ctx.strokeStyle = BAR.actionBarColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#F8F4EA';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('侠', pad + av / 2 + panelH * 0.1, cy);
  // 名字 + 双条（朱砂血 / 黛蓝内力——A1 Q2）
  const barX = pad + av + panelH * 0.35;
  const barW = w - pad * 2 - av - panelH * 0.6;
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#F8F4EA';
  ctx.fillText(`${p.name} Lv.8`, barX, y + panelH * 0.24);
  const bar = (yy: number, ratio: number, color: string, label: string) => {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(barX, yy, barW, panelH * 0.14);
    ctx.fillStyle = color;
    ctx.fillRect(barX, yy, barW * Math.max(0, Math.min(1, ratio)), panelH * 0.14);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '9px sans-serif';
    ctx.fillText(label, barX + 4, yy + panelH * 0.07);
  };
  bar(y + panelH * 0.36, p.hp / p.maxHp, BAR.hpBarColor, `${p.hp}/${p.maxHp}`);
  bar(y + panelH * 0.62, p.maxNeili > 0 ? p.neili / p.maxNeili : 0, BAR.mpBarColor, `${p.neili}/${p.maxNeili}`);
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
  for (const b of cornerButtonLayout(w, h)) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.id === 'exit' ? 'rgba(226,87,76,0.85)' : 'rgba(248,244,234,0.85)';
    ctx.fill();
    ctx.strokeStyle = '#2B2B2B';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = b.id === 'exit' ? '#F8F4EA' : '#2B2B2B';
    ctx.font = `${Math.round(b.r * ROUND_BTN.iconFontR)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let label = b.label;
    if (b.id === 'mode') label = session.mode === 'auto' ? '自' : '手';
    if (b.id === 'speed') label = session.speed === 2 ? '2×' : '1×';
    ctx.fillText(label, b.cx, b.cy);
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
  const s = worldToScreen(cam, rw.x, rw.y);
  const r = ROUND_BTN.radiusRatio * w;
  const cy = s.y - actorRenderH(hero) - SKILL_BTN.aboveActorPx - r;
  const defs: Array<{ id: string; label: string; on: boolean }> = [
    { id: 'te', label: '特', on: st.te },
    { id: 'qing', label: '轻', on: st.qing },
    { id: 'jue', label: '绝', on: st.jue },
  ];
  const totalW = defs.length * (r * 2 + SKILL_BTN.gapRatio * w) - SKILL_BTN.gapRatio * w;
  defs.forEach((d, i) => {
    const cx = s.x - totalW / 2 + r + i * (r * 2 + SKILL_BTN.gapRatio * w);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = d.on ? 'rgba(248,244,234,0.92)' : 'rgba(200,200,200,0.55)'; // 置灰（内力不足/冷却）
    ctx.fill();
    ctx.strokeStyle = d.on ? '#E2574C' : '#9a9a9a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = d.on ? '#2B2B2B' : '#777';
    ctx.font = `bold ${Math.round(r * 0.8)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.label, cx, cy);
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
