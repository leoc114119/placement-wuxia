// 战斗六边形渲染器（T16 frontend · 只读快照绘制，主架构方案 §2）。
// 红线：本模块禁止 import battle-core（DoD 自动化扫描）；UI 只展示——所有游戏数值来自快照。
// 环境无关：ctx 与图片由外部注入（wx canvas / 浏览器 canvas 均可跑），坐标一律整数像素定位。
import type { BattleSnapshot, FrameContext, HexPos, SnapshotActor } from '../types';
import {
  ANIM_FRAMES,
  ANIM_LOOP_GROUPS,
  ARC_BTNS,
  BOARD,
  CAMERA,
  COMPONENT_LAYOUT,
  FX,
  HEX,
  HIGHLIGHT,
  HUD,
  PIECE,
  TILE,
  TOPBAR,
  hexToWorld,
} from '../config/battle-hex';

// ============ 资源与视图类型 ============

/** 最小图片接口（WxImage / HTMLImageElement 结构均满足；drawImage 处统一收敛转型） */
export interface ImgLike {
  width: number;
  height: number;
}

/** 渲染资源包（加载器分环境实现：wx 侧 M4 接入，preview 侧 DOM loader） */
export interface BattleHexAssets {
  env: ImgLike | null;
  topbar: ImgLike | null;
  plaque: ImgLike | null;
  ctrl: ImgLike | null;
  /** spriteKey（config BATTLE_HEX_RES.spriteKinds）→ 帧数组（帧组播报按帧号取） */
  frames: Map<string, Array<ImgLike | null>>;
}

/** 主角技能钮数据源（置灰判定：内力/冷却）。
 * 契约缺口补充：BattleSnapshot 冻结版无此字段——mock 期由 mock 快照扩展供给，
 * T15 对切时若 session 供给同形字段即零改接入（否则登记工单补契约）。 */
export interface SkillButtonInfo {
  id: string;
  label: string;
  disabled: boolean;
}

/** 快照扩展段（渲染可选消费） */
export interface BattleSnapshotExt {
  heroSkills?: SkillButtonInfo[];
}

/** 命中布局（渲染几何唯一出处，输入层只消费不重算） */
export interface HitLayout {
  skillBtns: Array<{ id: string; x: number; y: number; r: number; disabled: boolean }>;
  ctrlRect: { x: number; y: number; w: number; h: number } | null;
  plaqueRect: { x: number; y: number; w: number; h: number } | null;
}

interface AnimClock {
  state: string;
  t: number;
}

interface FxItem {
  kind: 'slash' | 'hit';
  x: number;
  y: number;
  t: number;
  sec: number;
}

/** 演出视图状态（渲染层私有：相机/动画钟/特效/弹出进度/点选高亮）——不含任何结算数值 */
export interface BattleHexView {
  time: number;
  camDrag: { x: number; y: number };
  camera: { x: number; y: number };
  anim: Map<string, AnimClock>;
  moveFrom: Map<string, { x: number; y: number }>;
  fx: FxItem[];
  skillPop: number; // 弧形四钮弹出进度 0~1
  selectedCell: HexPos | null; // 选中格高亮（演出态；会话侧契约无此字段）
  layout: HitLayout;
}

export function createView(): BattleHexView {
  return {
    time: 0,
    camDrag: { x: 0, y: 0 },
    camera: { x: 0, y: 0 },
    anim: new Map(),
    moveFrom: new Map(),
    fx: [],
    skillPop: 0,
    selectedCell: null,
    layout: { skillBtns: [], ctrlRect: null, plaqueRect: null },
  };
}

// ============ 几何纯函数（导出供 node 用例；FE 自含——T15 hex.ts 仍在演进，不反向耦合） ============

/** 世界坐标 → 轴向格（cube 舍入取整；点选拾取用） */
export function worldToHex(wx: number, wy: number, s: number = HEX.s): HexPos {
  const qf = wx / (s * 1.5);
  const rf = wy / (s * HEX.sqrt3) - qf / 2;
  // axial → cube → 舍入 → axial
  const xf = qf;
  const zf = rf;
  const yf = -xf - zf;
  let rx = Math.round(xf);
  let ry = Math.round(yf);
  let rz = Math.round(zf);
  const dx = Math.abs(rx - xf);
  const dy = Math.abs(ry - yf);
  const dz = Math.abs(rz - zf);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

/** 轴向格 → offset col/row（odd-r：q = col - ⌊row/2⌋）；出界返回 null */
export function axialToOffset(p: HexPos): { col: number; row: number } | null {
  const row = p.r;
  const col = p.q + Math.floor(row / 2);
  if (row < 0 || row >= BOARD.rows || col < 0 || col >= BOARD.cols) return null;
  return { col, row };
}

/** 是否可移动区（offset 居中 8×8；瓦片配色用） */
export function isMovableCell(p: HexPos): boolean {
  const off = axialToOffset(p);
  if (!off) return false;
  const half = (BOARD.cols - BOARD.movable) / 2;
  return off.col >= half && off.col < half + BOARD.movable && off.row >= half && off.row < half + BOARD.movable;
}

/** 棋盘世界包围盒（含六边形 extent 与立体厚度、边距）。
 * 角格：odd-r 下 r=15 行的 q ∈ [-7, 8]（q = col - ⌊15/2⌋）。 */
export function boardBounds(s: number = HEX.s): { minX: number; minY: number; maxX: number; maxY: number } {
  const corners: Array<HexPos> = [
    { q: 0, r: 0 },
    { q: BOARD.cols - 1, r: 0 },
    { q: -Math.floor((BOARD.rows - 1) / 2), r: BOARD.rows - 1 },
    { q: BOARD.cols - 1 - Math.floor((BOARD.rows - 1) / 2), r: BOARD.rows - 1 },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const w = hexToWorld(c.q, c.r, s);
    if (w.x - s < minX) minX = w.x - s;
    if (w.x + s > maxX) maxX = w.x + s;
    if (w.y - s < minY) minY = w.y - s;
    if (w.y + s > maxY) maxY = w.y + s;
  }
  return {
    minX: minX - CAMERA.worldPad,
    minY: minY - CAMERA.worldPad,
    maxX: maxX + CAMERA.worldPad,
    maxY: maxY + TILE.sideDepth + CAMERA.worldPad,
  };
}

/** 镜头：跟随 cameraTargetId（MVP 简化：恒跟主角/行动者）+ 拖动偏移 + 包围盒 clamp（旧 T06 口径） */
export function computeCamera(
  snapshot: BattleSnapshot,
  camDrag: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  const target =
    snapshot.actors.find((a) => a.id === snapshot.cameraTargetId) ??
    snapshot.actors.find((a) => a.side === 'player') ??
    snapshot.actors[0];
  const base = target ? hexToWorld(target.renderPos.q, target.renderPos.r) : { x: 0, y: 0 };
  const b = boardBounds();
  const clampAxis = (v: number, min: number, max: number, span: number): number =>
    span >= max - min ? (min + max) / 2 : Math.max(min + span / 2, Math.min(max - span / 2, v));
  return {
    x: clampAxis(base.x + camDrag.x, b.minX, b.maxX, width),
    y: clampAxis(base.y + camDrag.y, b.minY, b.maxY, height),
  };
}

// ============ 演出状态推进（动画钟/特效/弹出/镜头；只消费快照，不改快照任何字段） ============

function easeOutCubic(p: number): number {
  const c = 1 - Math.max(0, Math.min(1, p));
  return 1 - c * c * c;
}

/** 每帧推进视图状态。dt 秒。帧组播报铁律：状态切换=新组从组首帧重放（组间不跨）。 */
export function updateView(
  view: BattleHexView,
  snapshot: BattleSnapshot,
  dt: number,
  width: number,
  height: number,
): void {
  view.time += dt;
  for (const a of snapshot.actors) {
    const prev = view.anim.get(a.id);
    if (!prev || prev.state !== a.animState) {
      // 组切换：出招/普攻→斩击特效；受击→红环特效；起走→记录位移起点（跳跃相位基准）
      const w = hexToWorld(a.renderPos.q, a.renderPos.r);
      if (prev && (a.animState === 'strike' || a.animState === 'basic')) {
        view.fx.push({ kind: 'slash', x: w.x, y: w.y, t: 0, sec: FX.slashSec });
      } else if (prev && a.animState === 'hit') {
        view.fx.push({ kind: 'hit', x: w.x, y: w.y, t: 0, sec: FX.hitSec });
      } else if (prev && a.animState === 'walk') {
        view.moveFrom.set(a.id, { x: w.x, y: w.y });
      }
      view.anim.set(a.id, { state: a.animState, t: 0 });
    } else {
      prev.t += dt;
    }
  }
  // 特效寿命
  const alive: FxItem[] = [];
  for (const f of view.fx) {
    f.t += dt;
    if (f.t < f.sec) alive.push(f);
  }
  view.fx = alive;
  // 弧形四钮弹出进度（目标：主角行动回合等待输入）
  const hero = snapshot.actors.find((a) => a.side === 'player');
  const popTarget =
    snapshot.phase === 'fighting' && snapshot.pendingInput && hero && snapshot.turnActorId === hero.id ? 1 : 0;
  const k = Math.min(1, (dt / ARC_BTNS.popSec) * 3);
  view.skillPop += (popTarget - view.skillPop) * k;
  if (Math.abs(view.skillPop - popTarget) < 0.02) view.skillPop = popTarget;
  // 镜头
  view.camera = computeCamera(snapshot, view.camDrag, width, height);
}

// ============ 绘制工具 ============

function drawImg(
  ctx: CanvasRenderingContext2D,
  img: ImgLike,
  x: number,
  y: number,
  w?: number,
  h?: number,
): void {
  // 整数像素定位（亚像素抖动防虚影，home_demo 已验口径）
  ctx.drawImage(
    img as unknown as CanvasImageSource,
    Math.round(x),
    Math.round(y),
    Math.round(w ?? img.width),
    Math.round(h ?? img.height),
  );
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const ang = (Math.PI / 3) * k;
    const px = cx + s * Math.cos(ang);
    const py = cy + s * Math.sin(ang);
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function shiftColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = (c: number) => Math.min(255, Math.round(c * factor));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ============ L1 立体瓦片 / L2 高亮 ============

function drawTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  movable: boolean,
  alt: boolean,
): void {
  const v: Array<[number, number]> = [];
  for (let k = 0; k < 6; k++) {
    const ang = (Math.PI / 3) * k;
    v.push([cx + s * Math.cos(ang), cy + s * Math.sin(ang)]);
  }
  // 侧面（下三边挤出：k0→k1 右下 / k1→k2 底 / k2→k3 左下）
  const sideEdges: Array<[number, number, string]> = [
    [0, 1, TILE.sideShade],
    [1, 2, TILE.side],
    [2, 3, TILE.side],
  ];
  for (const [a, b, color] of sideEdges) {
    ctx.beginPath();
    ctx.moveTo(v[a][0], v[a][1]);
    ctx.lineTo(v[b][0], v[b][1]);
    ctx.lineTo(v[b][0], v[b][1] + TILE.sideDepth);
    ctx.lineTo(v[a][0], v[a][1] + TILE.sideDepth);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  // 顶面（草地绿/土黄 + (q+r)&1 高光交替）
  const base = movable ? TILE.topGrass : TILE.topDirt;
  hexPath(ctx, cx, cy, s - 0.5);
  ctx.fillStyle = alt ? shiftColor(base, TILE.altBrightness) : base;
  ctx.fill();
  // 分边描边：上三边受光 / 下三边背光
  ctx.lineWidth = TILE.strokeWidth;
  ctx.strokeStyle = TILE.edgeLight;
  for (const [a, b] of [
    [3, 4],
    [4, 5],
    [5, 0],
  ] as Array<[number, number]>) {
    ctx.beginPath();
    ctx.moveTo(v[a][0], v[a][1]);
    ctx.lineTo(v[b][0], v[b][1]);
    ctx.stroke();
  }
  ctx.strokeStyle = TILE.edgeDark;
  for (const [a, b] of [
    [0, 1],
    [1, 2],
    [2, 3],
  ] as Array<[number, number]>) {
    ctx.beginPath();
    ctx.moveTo(v[a][0], v[a][1]);
    ctx.lineTo(v[b][0], v[b][1]);
    ctx.stroke();
  }
}

function fillHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  fill: string,
  edge: string,
): void {
  hexPath(ctx, cx, cy, s - 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** L1+L2：格子与高亮（仅绘视口内；数据来自快照，渲染只画不算） */
function drawCells(
  ctx: CanvasRenderingContext2D,
  snapshot: BattleSnapshot,
  cam: { x: number; y: number },
  width: number,
  height: number,
  selected: HexPos | null,
): void {
  const s = HEX.s;
  const center = worldToHex(cam.x, cam.y);
  const span = CAMERA.viewportCells + 2;
  const keyOf = (c: HexPos): string => `${c.q},${c.r}`;
  const moveSet = new Set(snapshot.moveCells.map(keyOf));
  const attackSet = new Set(snapshot.attackCells.map(keyOf));
  const selKey = selected ? keyOf(selected) : null;
  for (let r = center.r - span; r <= center.r + span; r++) {
    for (let q = center.q - span; q <= center.q + span; q++) {
      if (!axialToOffset({ q, r })) continue;
      const w = hexToWorld(q, r);
      const sx = Math.round(w.x - cam.x + width / 2);
      const sy = Math.round(w.y - cam.y + height / 2);
      if (sx < -s * 2 || sx > width + s * 2 || sy < -s * 2 - TILE.sideDepth || sy > height + s * 2) continue;
      drawTile(ctx, sx, sy, s, isMovableCell({ q, r }), ((q + r) & 1) === 0);
      const key = `${q},${r}`;
      if (moveSet.has(key)) fillHex(ctx, sx, sy, s, HIGHLIGHT.move, HIGHLIGHT.moveEdge);
      else if (attackSet.has(key)) fillHex(ctx, sx, sy, s, HIGHLIGHT.attack, HIGHLIGHT.attackEdge);
      if (selKey === key) fillHex(ctx, sx, sy, s, HIGHLIGHT.selected, HIGHLIGHT.selectedEdge);
    }
  }
}

// ============ L3 棋子 / L4 HUD ============

/** 当前帧号（帧组播报：循环组取模循环；单播组夹到组尾保持，组切换由 updateView 重置） */
function frameOf(view: BattleHexView, actor: SnapshotActor): number {
  const clock = view.anim.get(actor.id);
  const group = ANIM_FRAMES[actor.animState] ?? ANIM_FRAMES.idle;
  if (!clock || clock.state !== actor.animState) return group[0];
  const idx = Math.floor((clock.t * 1000) / PIECE.walkFrameMs);
  if (ANIM_LOOP_GROUPS.includes(actor.animState)) return group[idx % group.length];
  return group[Math.min(idx, group.length - 1)];
}

interface PlacedPiece {
  actor: SnapshotActor;
  cx: number;
  top: number;
  h: number;
  w: number;
}

function drawPieces(
  ctx: CanvasRenderingContext2D,
  snapshot: BattleSnapshot,
  assets: BattleHexAssets,
  view: BattleHexView,
  cam: { x: number; y: number },
  width: number,
  height: number,
): PlacedPiece[] {
  const s = HEX.s;
  const hexH = s * HEX.sqrt3;
  // y 排序遮挡
  const sorted = [...snapshot.actors].sort((a, b) => {
    const wa = hexToWorld(a.renderPos.q, a.renderPos.r);
    const wb = hexToWorld(b.renderPos.q, b.renderPos.r);
    return wa.y - wb.y;
  });
  const placed: PlacedPiece[] = [];
  for (const actor of sorted) {
    const w0 = hexToWorld(actor.renderPos.q, actor.renderPos.r);
    const sx = Math.round(w0.x - cam.x + width / 2);
    const syGround = Math.round(w0.y - cam.y + height / 2);
    const scale = actor.isBoss ? PIECE.bossScale : 1;
    const h = hexH * PIECE.heightPerTile * scale;
    const img = assets.frames.get(actor.spriteKey)?.[frameOf(view, actor)] ?? null;
    const w = img ? (h * img.width) / img.height : h * 0.5;
    if (actor.animState === 'dead') {
      // 阵亡：压扁淡出倒地
      if (img) {
        ctx.save();
        ctx.globalAlpha = PIECE.deadAlpha;
        drawImg(ctx, img, sx - w / 2, syGround - h * 0.3, w, h * 0.3);
        ctx.restore();
      }
      continue;
    }
    // 轻功抛物线：位移格距超阈值 → 正弦hop（相位=已走位移占比；基准点 updateView 记录）
    let hop = 0;
    const distCells = Math.hypot(actor.renderPos.q - actor.pos.q, actor.renderPos.r - actor.pos.r);
    const from = view.moveFrom.get(actor.id);
    if (distCells > 0.05 && from && distCells > PIECE.jumpMinCells) {
      const total = Math.hypot(w0.x - from.x, w0.y - from.y);
      const remaining = Math.hypot(
        hexToWorld(actor.pos.q, actor.pos.r).x - w0.x,
        hexToWorld(actor.pos.q, actor.pos.r).y - w0.y,
      );
      const done = total > 0.001 ? Math.max(0, 1 - remaining / total) : 1;
      hop = Math.sin(Math.PI * Math.min(1, done)) * PIECE.jumpHeightPx;
    }
    const shake = actor.animState === 'hit' ? Math.sin(view.time * 70) * 2 : 0;
    const cx = sx + shake;
    const top = syGround - h - hop;
    placed.push({ actor, cx, top, h, w });
    if (img) {
      ctx.save();
      if (actor.facing === 'left') {
        ctx.translate(Math.round(cx * 2), 0);
        ctx.scale(-1, 1);
      }
      drawImg(ctx, img, cx - w / 2, top, w, h);
      ctx.restore();
    } else {
      // 占位降级：无帧资源画剪影椭圆（永不空窗，L 环反馈防御）
      ctx.fillStyle = actor.side === 'player' ? 'rgba(90,160,90,0.9)' : 'rgba(170,80,70,0.9)';
      ctx.beginPath();
      ctx.ellipse(cx, top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return placed;
}

function drawPieceHud(
  ctx: CanvasRenderingContext2D,
  placed: PlacedPiece[],
  snapshot: BattleSnapshot,
  view: BattleHexView,
  ext: BattleSnapshotExt,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of placed) {
    const a = p.actor;
    if (a.animState === 'dead') continue;
    const y0 = p.top - HUD.aboveHead;
    // 名字牌（我方淡绿/敌方淡红）
    ctx.fillStyle = HUD.nameBg;
    ctx.fillRect(Math.round(p.cx - HUD.barW / 2 - 2), Math.round(y0 - 7), HUD.barW + 4, 10);
    ctx.font = `${HUD.nameFontPx}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.fillStyle = a.side === 'player' ? HUD.nameAlly : HUD.nameEnemy;
    ctx.fillText(a.name, Math.round(p.cx), Math.round(y0 - 2));
    // 绿行动条（0~100 展示口径）
    ctx.fillStyle = HUD.barBg;
    ctx.fillRect(Math.round(p.cx - HUD.barW / 2), Math.round(y0 + 4), HUD.barW, HUD.barH);
    ctx.fillStyle = HUD.actionBarColor;
    ctx.fillRect(
      Math.round(p.cx - HUD.barW / 2),
      Math.round(y0 + 4),
      Math.round(HUD.barW * Math.max(0, Math.min(1, a.actionBar / 100))),
      HUD.barH,
    );
    // 红血条
    ctx.fillStyle = HUD.barBg;
    ctx.fillRect(Math.round(p.cx - HUD.barW / 2), Math.round(y0 + 4 + HUD.barH + HUD.barGap), HUD.barW, HUD.barH);
    ctx.fillStyle = HUD.hpBarColor;
    ctx.fillRect(
      Math.round(p.cx - HUD.barW / 2),
      Math.round(y0 + 4 + HUD.barH + HUD.barGap),
      Math.round(HUD.barW * Math.max(0, Math.min(1, a.hp / Math.max(1, a.maxHp)))),
      HUD.barH,
    );
  }
  // 主角弧形特绝轻毒四钮（行动条满弹出；内力/冷却置灰——数据来自快照扩展段）
  const hero = snapshot.actors.find((a) => a.side === 'player');
  const showPop = snapshot.phase === 'fighting' && snapshot.pendingInput && hero && snapshot.turnActorId === hero.id;
  const pop = showPop ? easeOutCubic(view.skillPop) : 0;
  view.layout.skillBtns = [];
  if (!hero || pop <= 0.01) return;
  const p = placed.find((x) => x.actor.id === hero.id);
  if (!p) return;
  const headW = p.w * ARC_BTNS.headWidthRatio;
  const d = headW * ARC_BTNS.diameterPerHead;
  const R = headW * ARC_BTNS.arcRadiusPerHead;
  const headCx = p.cx;
  const headCy = p.top + headW * 0.6;
  const from = (ARC_BTNS.angleFromDeg * Math.PI) / 180;
  const to = (ARC_BTNS.angleToDeg * Math.PI) / 180;
  const skills = ext.heroSkills ?? [];
  for (let i = 0; i < ARC_BTNS.ids.length; i++) {
    const id = ARC_BTNS.ids[i];
    const ang = from + ((to - from) * i) / (ARC_BTNS.ids.length - 1);
    const bx = headCx + Math.cos(ang) * R * pop;
    const by = headCy + Math.sin(ang) * R * pop;
    const info = skills.find((sk) => sk.id === id);
    const disabled = info ? info.disabled : false;
    view.layout.skillBtns.push({ id, x: bx, y: by, r: d / 2, disabled });
    ctx.save();
    ctx.globalAlpha = pop * (disabled ? ARC_BTNS.disabledAlpha : 1);
    ctx.beginPath();
    ctx.arc(bx, by, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = ARC_BTNS.colorBg;
    ctx.fill();
    ctx.lineWidth = snapshot.selectedSkill === id ? ARC_BTNS.rimWidthSelected : ARC_BTNS.rimWidth;
    ctx.strokeStyle = snapshot.selectedSkill === id ? ARC_BTNS.rimColorSelected : ARC_BTNS.colorRim;
    ctx.stroke();
    ctx.fillStyle = disabled ? ARC_BTNS.colorTextDisabled : ARC_BTNS.colorText;
    ctx.font = `bold ${Math.round(d * 0.52)}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.fillText(ARC_BTNS.labels[i], Math.round(bx), Math.round(by + 1));
    ctx.restore();
  }
}

// ============ L5 定稿组件 ============

function drawComponents(
  ctx: CanvasRenderingContext2D,
  snapshot: BattleSnapshot,
  assets: BattleHexAssets,
  width: number,
  height: number,
  view: BattleHexView,
): void {
  view.layout.plaqueRect = null;
  view.layout.ctrlRect = null;
  // 顶栏：切图全宽贴屏顶（v8 同构图）+ 代码压暗层（Leo：原稿过亮）+ 动态条/状态槽叠绘
  const tb = assets.topbar;
  if (tb) {
    const h = (width * tb.height) / tb.width;
    drawImg(ctx, tb, 0, 0, width, h);
    ctx.fillStyle = `rgba(0,0,0,${TOPBAR.dimAlpha})`;
    ctx.fillRect(0, 0, Math.round(width), Math.round(h));
    const k = width / TOPBAR.artW;
    const hero = snapshot.actors.find((a) => a.side === 'player');
    if (hero) {
      const drawBar = (cover: { x: number; y: number; w: number; h: number }, frac: number, color: string): void => {
        ctx.fillStyle = TOPBAR.slotBg;
        ctx.fillRect(Math.round(cover.x * k), Math.round(cover.y * k), Math.round(cover.w * k), Math.round(cover.h * k));
        const inset = TOPBAR.barInset * k;
        ctx.fillStyle = color;
        ctx.fillRect(
          Math.round(cover.x * k + inset),
          Math.round(cover.y * k + inset),
          Math.round((cover.w * k - inset * 2) * Math.max(0, Math.min(1, frac))),
          Math.round(TOPBAR.barH * k),
        );
      };
      drawBar(TOPBAR.coverRed, hero.hp / Math.max(1, hero.maxHp), TOPBAR.hpColor);
      drawBar(TOPBAR.coverBlue, hero.neili / Math.max(1, hero.maxNeili), TOPBAR.neiliColor);
      // 状态图标槽×4（Q1③ 占位枚举：poison/bleed/internal/empty 色块）
      const slot = TOPBAR.statusSlots;
      const cell = slot.h / 4;
      for (let i = 0; i < 4; i++) {
        const icon = hero.statusIcons[i] ?? 'empty';
        const color = TOPBAR.statusColors[icon] ?? TOPBAR.statusColors.empty;
        ctx.fillStyle = TOPBAR.slotBg;
        ctx.fillRect(
          Math.round((slot.x + i * cell) * k),
          Math.round(slot.y * k),
          Math.round(cell * 0.86 * k),
          Math.round(slot.h * 0.86 * k),
        );
        ctx.fillStyle = color;
        ctx.fillRect(
          Math.round((slot.x + i * cell + cell * 0.12) * k),
          Math.round((slot.y + cell * 0.12) * k),
          Math.round(cell * 0.62 * k),
          Math.round(slot.h * 0.62 * k),
        );
      }
    }
  }
  // 左侧木牌挂串（透明化产物；文字烘焙在切图内）
  const pl = assets.plaque;
  if (pl) {
    const w = COMPONENT_LAYOUT.plaque.wRatio * width;
    const h = (w * pl.height) / pl.width;
    const x = COMPONENT_LAYOUT.plaque.xRatio * width;
    const y = COMPONENT_LAYOUT.plaque.yRatio * height;
    drawImg(ctx, pl, x, y, w, h);
    view.layout.plaqueRect = { x, y, w, h };
  }
  // 右下托管/加速/逃跑（透明化产物）
  const ct = assets.ctrl;
  if (ct) {
    const w = COMPONENT_LAYOUT.ctrl.wRatio * width;
    const h = (w * ct.height) / ct.width;
    const x = COMPONENT_LAYOUT.ctrl.xRatio * width;
    const y = COMPONENT_LAYOUT.ctrl.yRatio * height;
    drawImg(ctx, ct, x, y, w, h);
    view.layout.ctrlRect = { x, y, w, h };
  }
}

// ============ L6 特效 + 结算遮罩 ============

function drawFx(
  ctx: CanvasRenderingContext2D,
  view: BattleHexView,
  cam: { x: number; y: number },
  width: number,
  height: number,
): void {
  for (const f of view.fx) {
    const p = f.t / f.sec;
    const sx = Math.round(f.x - cam.x + width / 2);
    const sy = Math.round(f.y - cam.y + height / 2);
    ctx.save();
    ctx.globalAlpha = 1 - p;
    if (f.kind === 'slash') {
      ctx.strokeStyle = FX.slashColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy - 14, FX.maxRadius * (0.5 + p * 0.7), -0.9 + p * 1.6, 0.5 + p * 1.6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = FX.hitColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sx, sy - 10, FX.maxRadius * (0.3 + p * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPhaseOverlay(ctx: CanvasRenderingContext2D, snapshot: BattleSnapshot, width: number, height: number): void {
  if (snapshot.phase === 'fighting') return;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe9b8';
  ctx.font = `bold ${Math.round(width * 0.16)}px "PingFang SC","Microsoft YaHei",sans-serif`;
  const main = snapshot.phase === 'won' ? '胜' : snapshot.phase === 'lost' ? '败' : '已撤离';
  ctx.fillText(main, width / 2, height / 2 - width * 0.04);
  ctx.font = `${Math.round(width * 0.04)}px "PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.fillStyle = '#d9c896';
  ctx.fillText('点击任意处重开演示', width / 2, height / 2 + width * 0.07);
}

// ============ 主入口 ============

/** 每帧绘制（L0→L6 顺序）。快照与资源只读；演出状态由 view 承载。 */
export function drawFrame(
  fc: FrameContext,
  snapshot: BattleSnapshot & BattleSnapshotExt,
  assets: BattleHexAssets,
  view: BattleHexView,
): void {
  const { ctx, width, height } = fc;
  const cam = view.camera;
  // L0 环境底图：屏幕空间静态、不随镜头（75 v2.3 已验口径）；缺失降级纯色
  if (assets.env) drawImg(ctx, assets.env, 0, 0, width, height);
  else {
    ctx.fillStyle = '#1c2416';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  drawCells(ctx, snapshot, cam, width, height, view.selectedCell);
  const placed = drawPieces(ctx, snapshot, assets, view, cam, width, height);
  drawPieceHud(ctx, placed, snapshot, view, snapshot);
  drawFx(ctx, view, cam, width, height);
  ctx.restore();
  drawComponents(ctx, snapshot, assets, width, height, view);
  drawPhaseOverlay(ctx, snapshot, width, height);
}
