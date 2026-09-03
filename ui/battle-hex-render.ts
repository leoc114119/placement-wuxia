// 战斗六边形渲染器（T16 frontend · 只读快照绘制，主架构方案 §2）。
// 红线：本模块禁止 import battle-core（DoD 自动化扫描）；UI 只展示——所有游戏数值来自快照。
// 环境无关：ctx 与图片由外部注入（wx canvas / 浏览器 canvas 均可跑），坐标一律整数像素定位。
import type { BattleMode, BattleSnapshot, FrameContext, HexPos, SkillButtonInfo, SnapshotActor } from '../types';
import {
  ANIM_FRAMES,
  ANIM_LOOP_GROUPS,
  ARC_BTNS,
  BOARD,
  CAMERA,
  COMPONENT_LAYOUT,
  CTRL_ART,
  FIELD,
  CTRL_BUTTONS,
  FX,
  HIGHLIGHT,
  hexDist,
  jumpParamsFor,
  HUD,
  PIECE,
  PLAQUE_BUTTONS,
  TILE,
  TILE_H,
  TILE_SPRITES,
  TILE_W,
  ROW_H,
  SIDE_DEPTH,
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

/** 主角技能钮数据源（弧形四钮置灰判定）——契约类型唯一出处 types.ts（联调 F2 起由快照必选字段供给），
 * 此处 re-export 保持 mock_session 等既有引用零改。 */
export type { SkillButtonInfo };

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

/** 移动演出实例（跳跃/行走共用；演出期位置与帧组由本插值主导） */
export interface MoveAnim {
  from: HexPos; // 演出起点（axial）
  pos: HexPos; // 锁定终点（演出开始时的快照 pos；中途变更以快照为准续画）
  path: HexPos[]; // 逐格路径（格序列：绕行回退时由 BFS 产出；[0]=from 末位=pos）
  pathPx: Array<{ x: number; y: number }>; // 像素路径点列（格中心 hexToWorld；演出插值在像素空间——恒直无锯齿）
  t: number; // 已演出时长（秒）
  duration: number; // 演出总时长（跳跃按距离插值；行走 = moveLerpSec × max(1, dist)）
  hopHeight: number; // 抛物线顶高（普通行走=0）
}

interface FxItem {
  kind: 'slash' | 'hit' | 'note';
  x: number;
  y: number;
  t: number;
  sec: number;
  text?: string; // note 专属：头顶冒字文案
}

/** 演出视图状态（渲染层私有：相机/动画钟/特效/弹出进度/点选高亮）——不含任何结算数值 */
export interface BattleHexView {
  time: number;
  camDrag: { x: number; y: number };
  lastCamDrag: { x: number; y: number };
  camera: { x: number; y: number };
  camInit: boolean; // 镜头首帧定位标记
  anim: Map<string, AnimClock>;
  /** 移动演出（L 环终验：演出计时主导——演出期渲染位置/帧组完全由演出插值决定，
   * 结束帧无缝衔接快照 pos；终点不一致=快照被外部改动，以快照为准对齐） */
  moveAnims: Map<string, MoveAnim>;
  /** 演出已完成防重启标记：演出结束后 session 移动动画可能仍未结束（时长不同步），
   * 该单位离井 walk 前禁止再触发 walkRise（否则以中途小数为起点重启=左闪右闪根因） */
  moveDone: Set<string>;
  fx: FxItem[];
  skillPop: number; // 弧形四钮弹出进度 0~1
  selectedCell: HexPos | null; // 选中格高亮（演出态；会话侧契约无此字段）
  /** UI 状态反馈（宿主填充；托管/加速钮高亮显示——快照无此字段，演出态） */
  uiState: { mode?: BattleMode; speed?: boolean };
  layout: HitLayout;
}

export function createView(): BattleHexView {
  return {
    time: 0,
    camDrag: { x: 0, y: 0 },
    lastCamDrag: { x: 0, y: 0 },
    camera: { x: 0, y: 0 },
    camInit: false,
    anim: new Map(),
    moveAnims: new Map(),
    moveDone: new Set(),
    fx: [],
    skillPop: 0,
    selectedCell: null,
    uiState: {},
    layout: { skillBtns: [], ctrlRect: null, plaqueRect: null },
  };
}

// ============ 几何纯函数（导出供 node 用例；FE 自含——T15 hex.ts 仍在演进，不反向耦合） ============

/** 世界坐标 → 轴向格（压扁错位网格反算；点选拾取用，与 hexToWorld 严格互逆） */
export function worldToHex(wx: number, wy: number): HexPos {
  const row = Math.round(wy / ROW_H);
  const odd = Math.abs(row) % 2 === 1 ? 0.5 : 0;
  const col = Math.round(wx / TILE_W - odd);
  return { q: col - Math.floor(row / 2), r: row };
}

/** 轴向格 → offset col/row（odd-r：q = col - ⌊row/2⌋）；出界返回 null */
export function axialToOffset(p: HexPos): { col: number; row: number } | null {
  const row = p.r;
  const col = p.q + Math.floor(row / 2);
  if (row < 0 || row >= BOARD.rows || col < 0 || col >= BOARD.cols) return null;
  return { col, row };
}

/** 是否可动区（T15 R3 FIELD：col 4..11 / row 2..13；瓦片配色用） */
export function isMovableCell(p: HexPos): boolean {
  const off = axialToOffset(p);
  if (!off) return false;
  return off.col >= FIELD.colMin && off.col <= FIELD.colMax && off.row >= FIELD.rowMin && off.row <= FIELD.rowMax;
}

/** 棋盘世界包围盒（含六边形 extent 与立体厚度、边距）。
 * 角格：odd-r 下 r=15 行的 q ∈ [-7, 8]（q = col - ⌊15/2⌋）。 */
export function boardBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
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
  const halfW = TILE_W / 2 + 6; // 6 = 错位半格余量
  const halfH = TILE_H / 2 + SIDE_DEPTH;
  for (const c of corners) {
    const w = hexToWorld(c.q, c.r);
    if (w.x - halfW < minX) minX = w.x - halfW;
    if (w.x + halfW > maxX) maxX = w.x + halfW;
    if (w.y - halfH < minY) minY = w.y - halfH;
    if (w.y + halfH > maxY) maxY = w.y + halfH;
  }
  return {
    minX: minX - CAMERA.worldPad,
    minY: minY - CAMERA.worldPad,
    maxX: maxX + CAMERA.worldPad,
    maxY: maxY + CAMERA.worldPad,
  };
}

/** cube 舍入（hex_lerp 直线取格用） */
function cubeRound(x: number, y: number, z: number): HexPos {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: ry }; // cube y 轴 = axial r（z 轴是 s，勿取）
}

/** hex 直线路径（标准 hex_lerp + cube round）：视觉最直、锯齿最小——**优先走此路径**。
 * L 环终验实证：BFS 等距多解的锯齿/L 形路径在错位网格像素投影下每段横向偏移差 20-46px，
 * 即 Leo 观感"左闪右闪才到"的根因。 */
function hexLerpPath(from: HexPos, to: HexPos): HexPos[] {
  const n = hexDist(to, from);
  if (n === 0) return [{ ...from }];
  const path: HexPos[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const q = from.q + (to.q - from.q) * t;
    const r = from.r + (to.r - from.r) * t;
    path.push(cubeRound(q, r, -q - r));
  }
  return path;
}

/** BFS 逐格路径（渲染侧自含，与 session reachable 同参同数学：FIELD 内、6 邻、阻挡=占格）。
 * 仅当 hex 直线路径被占格/出界挡住时作为绕行回退（锯齿是绕行的必要代价）。路径含 from 与 pos。 */
function bfsMovePath(from: HexPos, to: HexPos, occupied: Set<string>): HexPos[] {
  const dirs: ReadonlyArray<HexPos> = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  const key = (c: HexPos): string => `${c.q},${c.r}`;
  const inField = (c: HexPos): boolean => {
    const off = axialToOffset(c);
    return !!off && off.col >= FIELD.colMin && off.col <= FIELD.colMax && off.row >= FIELD.rowMin && off.row <= FIELD.rowMax;
  };
  if (key(from) === key(to)) return [from];
  const seen = new Set<string>([key(from)]);
  const prev = new Map<string, string>();
  const queue: HexPos[] = [from];
  let found = false;
  while (queue.length && !found) {
    const cur = queue.shift()!;
    for (const d of dirs) {
      const nb: HexPos = { q: cur.q + d.q, r: cur.r + d.r };
      const k = key(nb);
      if (seen.has(k)) continue;
      if (!inField(nb)) continue;
      if (occupied.has(k) && k !== key(to)) continue; // 终点格允许为目标单位所在（攻击前站位）
      seen.add(k);
      prev.set(k, key(cur));
      if (k === key(to)) {
        found = true;
        break;
      }
      queue.push(nb);
    }
  }
  if (!found) return hexLerpPath(from, to); // 不可达防御：退化为直线
  const path: HexPos[] = [];
  let cur: string | undefined = key(to);
  while (cur) {
    const [q, r] = cur.split(',').map(Number);
    path.unshift({ q, r });
    cur = prev.get(cur);
  }
  return path;
}

/** 移动路径（终验修法二版）：hex_lerp 直线 + **出界格 clamp 进 FIELD 带**——纵向窄走廊下斜向直线的
 * 中间格必然越带，不 clamp 会判 blocked 回退 BFS 锯齿，段间 20-46px 横跳 = Leo"左闪右闪"根因；
 * clamp 后去重相邻重复格。walk 仍规避占格（被挡回退 BFS）；jump 凌空无视占格恒直线。 */
export function computeMovePath(from: HexPos, to: HexPos, occupied: Set<string>, isJump = false): HexPos[] {
  const line = hexLerpPath(from, to);
  const clampField = (c: HexPos): HexPos => {
    const off = axialToOffset(c);
    if (!off) return c;
    const col = Math.min(FIELD.colMax, Math.max(FIELD.colMin, off.col));
    const row = Math.min(FIELD.rowMax, Math.max(FIELD.rowMin, off.row));
    return { q: col - Math.floor(row / 2), r: row };
  };
  const clamped: HexPos[] = [];
  for (const c of line) {
    const cc = clampField(c);
    const last = clamped[clamped.length - 1];
    if (last && last.q === cc.q && last.r === cc.r) continue; // 去重相邻重复格
    clamped.push(cc);
  }
  clamped[0] = { ...from };
  clamped[clamped.length - 1] = { ...to };
  if (isJump) return clamped; // 凌空：无视占格
  const innerBlocked = clamped.slice(1, -1).some((c) => occupied.has(`${c.q},${c.r}`));
  if (!innerBlocked) return clamped;
  return bfsMovePath(from, to, occupied);
}

/** 移动演出位置（像素空间插值：from_px→…→pos_px 沿路径点列线性——像素直线恒直，无错位网格锯齿） */
export function moveAnimDrawPosPx(ma: MoveAnim): { x: number; y: number } {
  const p = Math.min(1, ma.t / ma.duration);
  const pts = ma.pathPx.length >= 2 ? ma.pathPx : [hexToWorld(ma.from.q, ma.from.r), hexToWorld(ma.pos.q, ma.pos.r)];
  const segs = pts.length - 1;
  if (segs < 1) return { x: pts[0].x, y: pts[0].y };
  const f = p * segs;
  const i = Math.min(segs - 1, Math.floor(f));
  const lp = f - i;
  const a = pts[i];
  const b = pts[i + 1];
  return { x: a.x + (b.x - a.x) * lp, y: a.y + (b.y - a.y) * lp };
}
function drawPosXY(ma: MoveAnim): { x: number; y: number } {
  return moveAnimDrawPosPx(ma);
}

/** 镜头跟随聚焦包围盒：可动区 FIELD + 窄边（L 环二反馈①：土黄外围自然推出视口，绿区铺满主体） */
export function movableBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  const c0 = hexToWorld(FIELD.colMin, FIELD.rowMin); // 可动区西北格
  const c1 = hexToWorld(FIELD.colMax, FIELD.rowMax); // 东南格
  const pad = TILE_W / 2 + CAMERA.followPad; // 窄边余量
  return {
    minX: c0.x - TILE_W / 2 - pad,
    minY: c0.y - TILE_H / 2 - pad,
    maxX: c1.x + TILE_W / 2 + pad + TILE_W * 0.5, // 东南奇数行错位半格余量
    maxY: c1.y + TILE_H / 2 + SIDE_DEPTH + pad,
  };
}

/** 镜头：跟随 cameraTargetId（MVP 简化：恒跟主角/行动者）+ 拖动偏移 + 聚焦包围盒 clamp（旧 T06 口径） */
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
  const b = movableBounds();
  const clampAxis = (v: number, min: number, max: number, span: number): number =>
    span >= max - min ? (min + max) / 2 : Math.max(min + span / 2, Math.min(max - span / 2, v));
  return {
    x: clampAxis(base.x + camDrag.x, b.minX, b.maxX, width),
    y: clampAxis(base.y + camDrag.y, b.minY, b.maxY, height),
  };
}

/** 镜头策略（L 环追加③）：
 * - 非主角条满时镜头静止（敌方行动不牵引镜头；拖镜 delta 即时叠加保证跟手）
 * - 主角行动条满（等待输入）→ 镜头以指数平滑向主角理想机位回拉
 * - 跳跃表现位置参与取景（主角跳跃时镜头平滑跟随表现位） */
export function updateCamera(
  view: BattleHexView,
  snapshot: BattleSnapshot,
  dt: number,
  width: number,
  height: number,
): void {
  const hero = snapshot.actors.find((a) => a.side === 'player');
  const ma = hero ? view.moveAnims.get(hero.id) : null;
  const draw = ma && ma.t < ma.duration ? moveAnimDrawPosPx(ma) : hero ? hexToWorld(hero.renderPos.q, hero.renderPos.r) : null;
  const ideal = computeCamera(
    { ...snapshot, cameraTargetId: hero ? hero.id : snapshot.cameraTargetId },
    view.camDrag,
    width,
    height,
  );
  // 拖镜 delta 即时叠加（跟手）；首帧直接定位理想机位
  if (!view.camInit) {
    view.camera.x = ideal.x;
    view.camera.y = ideal.y;
    view.camInit = true;
    view.lastCamDrag = { ...view.camDrag };
    return;
  }
  const dx = view.camDrag.x - view.lastCamDrag.x;
  const dy = view.camDrag.y - view.lastCamDrag.y;
  view.camera.x += dx;
  view.camera.y += dy;
  view.lastCamDrag = { ...view.camDrag };
  // 主角条满 → 平滑回拉理想机位（目标点含跳跃表现位置）
  const heroTurn = snapshot.phase === 'fighting' && hero && snapshot.turnActorId === hero.id;
  if (heroTurn && draw) {
    const drawAxial = worldToHex(draw.x, draw.y);
    const dest = computeCamera(
      { ...snapshot, cameraTargetId: hero.id, actors: [{ ...hero, renderPos: drawAxial }] },
      view.camDrag,
      width,
      height,
    );
    const k = 1 - Math.exp(-dt / Math.max(0.001, CAMERA.smoothingSec));
    view.camera.x += (dest.x - view.camera.x) * k;
    view.camera.y += (dest.y - view.camera.y) * k;
  }
}

// ============ 演出状态推进（动画钟/特效/弹出/镜头；只消费快照，不改快照任何字段） ============

function easeOutCubic(p: number): number {
  const c = 1 - Math.max(0, Math.min(1, p));
  return 1 - c * c * c;
}

/** 拒绝轻提示（T15 R3 rejected 事件消费）：单位头顶冒小字，上浮渐隐 */
export function spawnNoteFx(view: BattleHexView, x: number, y: number, text: string): void {
  view.fx.push({ kind: 'note', x, y, t: 0, sec: 1.1, text });
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
    const prevAnim = view.moveAnims.get(a.id);
    // ---- 移动演出启动（查修一体定位：普通移动此前无演出插值、跳跃演出期帧组随快照切 idle——
    // 统一为演出计时主导：上升沿锁 from/pos/duration/hop，演出期位置与帧组全由演出决定） ----
    const jumpRise = a.isJump && !prevAnim; // 无演出中才启动（AnimClock 不再承担跳跃标记）
    const walkRise =
      !prevAnim && !view.moveDone.has(a.id) && a.animState === 'walk' &&
      (a.renderPos.q !== a.pos.q || a.renderPos.r !== a.pos.r);
    if (jumpRise || walkRise) {
      // from 取整到最近格：walkRise 可能在 session lerp 中途触发（小数 renderPos），
      // 小数起点会让 hexLerp/cubeRound 甩出界外乱路径（L 环终验实证）
      const from = { q: Math.round(a.renderPos.q), r: Math.round(a.renderPos.r) };
      const pos = { q: a.pos.q, r: a.pos.r };
      const dist = hexDist(pos, from);
      const jp = jumpParamsFor(dist);
      const occupied = new Set(
        snapshot.actors
          .filter((u) => u.id !== a.id && u.animState !== 'dead')
          .map((u) => `${u.pos.q},${u.pos.r}`),
      );
      const path = computeMovePath(from, pos, occupied, a.isJump);
      const dur = a.isJump ? jp.duration : PIECE.moveLerpSec * Math.max(1, dist);
      view.moveAnims.set(a.id, {
        from,
        pos,
        path,
        pathPx: path.map((c) => hexToWorld(c.q, c.r)),
        t: 0,
        duration: dur,
        hopHeight: a.isJump ? jp.height : 0,
      });
    }
    // ---- 移动演出推进（演出计时主导：到时不删、定格终点等快照到位/离开 walk 才释放） ----
    const anim = view.moveAnims.get(a.id);
    if (anim) {
      if (anim.t < anim.duration) anim.t = Math.min(anim.duration, anim.t + dt);
      // 终点变更（session 中途改目标）：以快照为准续画（无瞬移；此为快照真值变更非跳变）
      if (anim.pos.q !== a.pos.q || anim.pos.r !== a.pos.r) anim.pos = { q: a.pos.q, r: a.pos.r };
      // 演出时长已满：定格终点；快照位移到位（或 session 已离开 walk）才释放——
      // 释放即 moveDone：session 移动动画未结束时禁止 walkRise 重启（时长不同步防抖）
      if (anim.t >= anim.duration) {
        const settled =
          (a.renderPos.q === anim.pos.q && a.renderPos.r === anim.pos.r) || a.animState !== 'walk';
        if (settled) {
          view.moveAnims.delete(a.id);
          view.moveDone.add(a.id);
        }
      }
    }
    // 移动演出单位离开 walk（session 侧到位/转向）→ 解除防重启
    if (a.animState !== 'walk') view.moveDone.delete(a.id);
    // ---- 动画钟（帧组播报：组切换=新组从组首帧重放） ----
    if (!prev || prev.state !== a.animState) {
      const w = hexToWorld(a.renderPos.q, a.renderPos.r);
      if (prev && (a.animState === 'strike' || a.animState === 'basic')) {
        view.fx.push({ kind: 'slash', x: w.x, y: w.y, t: 0, sec: FX.slashSec });
      } else if (prev && a.animState === 'hit') {
        view.fx.push({ kind: 'hit', x: w.x, y: w.y, t: 0, sec: FX.hitSec });
      }
      view.anim.set(a.id, { state: a.animState, t: 0 });
    } else {
      prev.t += dt;
    }
  }
  // 特效寿命推进（含 note 冒字）
  const aliveFx: FxItem[] = [];
  for (const f of view.fx) {
    f.t += dt;
    if (f.t < f.sec) aliveFx.push(f);
  }
  view.fx = aliveFx;
  // 弧形四钮弹出进度（目标：主角行动条满等待输入）
  const popHero = snapshot.actors.find((a) => a.side === 'player');
  const popTarget =
    snapshot.phase === 'fighting' && snapshot.pendingInput && popHero && snapshot.turnActorId === popHero.id ? 1 : 0;
  const popK = Math.min(1, (dt / ARC_BTNS.popSec) * 3);
  view.skillPop += (popTarget - view.skillPop) * popK;
  if (Math.abs(view.skillPop - popTarget) < 0.02) view.skillPop = popTarget;
  // 镜头策略（L 环追加③）：镜头静止；仅主角行动条满时向主角平滑回拉；拖镜 delta 即时跟手
  updateCamera(view, snapshot, dt, width, height);
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

/** 尖角压扁六边形路径（pointy-top：上下尖角、左右竖直边；宽 TILE_W × 高 TILE_H） */
function tilePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  const hw = w / 2;
  const hh = h / 2;
  const q = h / 4; // 竖直边半高（正六边形拓扑：竖边端点在 ±h/4）
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh); // 上尖
  ctx.lineTo(cx + hw, cy - q); // 右上
  ctx.lineTo(cx + hw, cy + q); // 右下（右竖直边）
  ctx.lineTo(cx, cy + hh); // 下尖
  ctx.lineTo(cx - hw, cy + q); // 左下
  ctx.lineTo(cx - hw, cy - q); // 左上（左竖直边）
  ctx.closePath();
}

// ============ L1 立体瓦片 / L2 高亮 ============

/** 单块压扁立体瓦片（临时代码版；TILE_SPRITES 素材到位即贴 sprite）：
 * 顶面尖角压扁形 + 下尖角/下斜边深色侧面（厚 SIDE_DEPTH）+ 上暗下亮光照描边。 */
function drawTile(ctx: CanvasRenderingContext2D, cx: number, cy: number, movable: boolean): void {
  const sprite = movable ? TILE_SPRITES.grass : TILE_SPRITES.dirt;
  if (sprite) {
    const img = tileSpriteImg(sprite);
    if (img) {
      drawImg(ctx, img, cx - TILE_W / 2, cy - TILE_H / 2 + (TILE_H - img.height) / 2 + 0, TILE_W, TILE_H);
      return;
    }
  }
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  const q = TILE_H / 4;
  const P = (dx: number, dy: number): [number, number] => [cx + dx, cy + dy];
  // 顶点序：上尖(0,-hh) 右上(hw,-q) 右下(hw,q) 下尖(0,hh) 左下(-hw,q) 左上(-hw,-q)
  const top = P(0, -hh);
  const rt = P(hw, -q);
  const rb = P(hw, q);
  const bot = P(0, hh);
  const lb = P(-hw, q);
  const lt = P(-hw, -q);
  // 侧面：下尖角与两条下斜边向外挤出（深色/受光分段——底部光源氛围）
  const sidePolys: Array<{ pts: Array<[number, number]>; color: string }> = [
    { pts: [rt, bot, [bot[0], bot[1] + SIDE_DEPTH], [rt[0], rt[1] + SIDE_DEPTH]], color: TILE.side }, // 右下斜边
    { pts: [bot, lb, [lb[0], lb[1] + SIDE_DEPTH], [bot[0], bot[1] + SIDE_DEPTH]], color: TILE.sideShade }, // 左下斜边（背光）
    { pts: [lb, lt, [lt[0], lt[1] + SIDE_DEPTH], [lb[0], lb[1] + SIDE_DEPTH]], color: TILE.sideShade }, // 左竖直边下段
  ];
  for (const poly of sidePolys) {
    ctx.beginPath();
    poly.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = poly.color;
    ctx.fill();
  }
  // 顶面
  tilePath(ctx, cx, cy, TILE_W - 1, TILE_H - 1);
  ctx.fillStyle = movable ? TILE.topGrass : TILE.topDirt;
  ctx.fill();
  // 光照描边：上尖两斜边暗（上暗）/ 下尖两斜边亮+底缘受光线（下亮）
  ctx.lineWidth = TILE.strokeWidth;
  ctx.strokeStyle = TILE.edgeDark;
  for (const [a, b] of [
    [top, rt],
    [top, lt],
  ] as Array<Array<[number, number]>>) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.strokeStyle = TILE.edgeLight;
  for (const [a, b] of [
    [rb, bot],
    [bot, lb],
    [rt, rb],
    [lt, lb],
  ] as Array<Array<[number, number]>>) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
}

/** 瓦片 sprite 解析（素材键 → 已加载图；未加载返回 null 走代码绘制） */
function tileSpriteImg(_key: string): ImgLike | null {
  return null; // 素材未到位；loader 接入时按键取已加载瓦片图
}

function fillHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  fill: string,
  edge: string,
): void {
  tilePath(ctx, cx, cy, TILE_W - 2, TILE_H - 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** L1+L2：格子与高亮（仅绘视口内；数据来自快照，渲染只画不算；moveKind 换色——绿=走 / 金=轻功跳，联调 F1） */
/** L1+L2：格子与高亮（仅绘视口内；数据来自快照，渲染只画不算；moveKind 换色——绿=走 / 金=轻功跳）。
 * 战区矩形裁剪：错位行的半格出界部分裁平 → 边缘整齐的长方形战区（Leo 要求，勿出锯齿菱形边）。 */
function drawCells(
  ctx: CanvasRenderingContext2D,
  snapshot: BattleSnapshot,
  cam: { x: number; y: number },
  width: number,
  height: number,
  selected: HexPos | null,
): void {
  const center = worldToHex(cam.x, cam.y);
  const span = CAMERA.viewportCells + 2;
  const keyOf = (c: HexPos): string => `${c.q},${c.r}`;
  const jump = snapshot.moveKind === 'jump';
  const moveFill = jump ? HIGHLIGHT.jump : HIGHLIGHT.move;
  const moveEdge = jump ? HIGHLIGHT.jumpEdge : HIGHLIGHT.moveEdge;
  const moveSet = new Set(snapshot.moveCells.map(keyOf));
  const attackSet = new Set(snapshot.attackCells.map(keyOf));
  const selKey = selected ? keyOf(selected) : null;
  // 战区矩形（世界系外接框，长边含错位半格）
  const b = boardBounds();
  const zoneL = Math.round(b.minX - CAMERA.worldPad);
  const zoneT = Math.round(b.minY - CAMERA.worldPad);
  const zoneR = Math.round(b.maxX + CAMERA.worldPad);
  const zoneB = Math.round(b.maxY + SIDE_DEPTH + CAMERA.worldPad);
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    Math.round(zoneL - cam.x + width / 2),
    Math.round(zoneT - cam.y + height / 2),
    zoneR - zoneL,
    zoneB - zoneT,
  );
  ctx.clip();
  for (let r = center.r - span; r <= center.r + span; r++) {
    for (let q = center.q - span; q <= center.q + span; q++) {
      if (!axialToOffset({ q, r })) continue;
      const w = hexToWorld(q, r);
      const sx = Math.round(w.x - cam.x + width / 2);
      const sy = Math.round(w.y - cam.y + height / 2);
      if (sx < -TILE_W * 2 || sx > width + TILE_W * 2 || sy < -TILE_H * 2 - SIDE_DEPTH || sy > height + TILE_H * 2) continue;
      drawTile(ctx, sx, sy, isMovableCell({ q, r }));
      const key = `${q},${r}`;
      if (moveSet.has(key)) fillHex(ctx, sx, sy, moveFill, moveEdge);
      else if (attackSet.has(key)) fillHex(ctx, sx, sy, HIGHLIGHT.attack, HIGHLIGHT.attackEdge);
      if (selKey === key) fillHex(ctx, sx, sy, HIGHLIGHT.selected, HIGHLIGHT.selectedEdge);
    }
  }
  ctx.restore();
}

// ============ L3 棋子 / L4 HUD ============

/** 当前帧号（帧组播报：循环组取模循环；单播组夹到组尾保持，组切换由 updateView 重置） */
function frameOf(view: BattleHexView, actor: SnapshotActor, stateOverride?: string): number {
  const state = stateOverride ?? actor.animState;
  const clock = view.anim.get(actor.id);
  const group = ANIM_FRAMES[state] ?? ANIM_FRAMES.idle;
  if (!clock || clock.state !== state) return group[0];
  const idx = Math.floor((clock.t * 1000) / PIECE.walkFrameMs);
  if (ANIM_LOOP_GROUPS.includes(state)) return group[idx % group.length];
  return group[Math.min(idx, group.length - 1)];
}

interface PlacedPiece {
  actor: SnapshotActor;
  cx: number;
  top: number;
  h: number;
  w: number;
}

/** 跳跃抛物线高度（纯函数，导出供用例；联调 F1：跳跃真值=快照 isJump，禁启发式猜）。
 * done = 已走位移占比（相位基准 view.moveFrom，updateView 在跳跃上升沿记录）。 */
export function pieceHop(view: BattleHexView, actor: SnapshotActor): number {
  const ma = view.moveAnims.get(actor.id);
  if (!ma || ma.hopHeight <= 0) return 0;
  const p = Math.min(1, ma.t / ma.duration);
  return Math.sin(Math.PI * p) * ma.hopHeight;
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
  const hexH = TILE_H; // 压扁格高（棋子定尺基准）
  // y 排序遮挡（移动演出期按演出位置排序，保证跃过单位时遮挡正确）
  const sorted = [...snapshot.actors].sort((a, b) => {
    const aa = view.moveAnims.get(a.id);
    const ab = view.moveAnims.get(b.id);
    const wa = aa ? drawPosXY(aa) : hexToWorld(a.renderPos.q, a.renderPos.r);
    const wb = ab ? drawPosXY(ab) : hexToWorld(b.renderPos.q, b.renderPos.r);
    return wa.y - wb.y;
  });
  const placed: PlacedPiece[] = [];
  for (const actor of sorted) {
    const ma = view.moveAnims.get(actor.id);
    const draw = ma ? moveAnimDrawPosPx(ma) : hexToWorld(actor.renderPos.q, actor.renderPos.r); // 演出期=像素空间插值（双轨消灭）
    const sx = Math.round(draw.x - cam.x + width / 2);
    const syGround = Math.round(draw.y - cam.y + height / 2);
    const scale = actor.isBoss ? PIECE.bossScale : 1;
    const h = hexH * PIECE.heightPerTile * scale;
    const frameState = ma && ma.t < ma.duration ? 'walk' : actor.animState; // 演出期帧组强制 walk（空中不站立滑行）
    const img = assets.frames.get(actor.spriteKey)?.[frameOf(view, actor, frameState)] ?? null;
    const w = img ? (h * img.width) / img.height : h * 0.5;
    if (frameState === 'dead') {
      // 阵亡：压扁淡出倒地
      if (img) {
        ctx.save();
        ctx.globalAlpha = PIECE.deadAlpha;
        drawImg(ctx, img, sx - w / 2, syGround - h * 0.3, w, h * 0.3);
        ctx.restore();
      }
      continue;
    }
    const hop = pieceHop(view, actor); // 轻功抛物线（演出期参数随距离插值）
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
  // 主角弧形特绝轻毒四钮（行动条满弹出；置灰=内力/冷却/武器不匹配——联调 F2 会话真值）
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
  const skills = snapshot.heroSkills ?? [];
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
  // 顶栏：切图全宽贴屏顶（v8 同构图）+ 代码压暗层（Leo：原稿过亮）+ 动态条/状态槽叠绘；缺图时代码兜底
  const tb = assets.topbar;
  const topH = (width * (tb ? tb.height : TOPBAR.artH)) / (tb ? tb.width : TOPBAR.artW);
  if (tb) drawImg(ctx, tb, 0, 0, width, topH);
  else {
    ctx.fillStyle = '#4a3826';
    ctx.fillRect(0, 0, Math.round(width), Math.round(topH));
  }
  ctx.fillStyle = `rgba(0,0,0,${TOPBAR.dimAlpha})`;
  ctx.fillRect(0, 0, Math.round(width), Math.round(topH));
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
    // 状态图标槽×4（横向四等分盖住烘焙图标；statusIcons 真值接入前恒空槽色）
    const slot = TOPBAR.statusSlots;
    const cell = slot.w / 4;
    for (let i = 0; i < 4; i++) {
      const icon = hero.statusIcons[i] ?? 'empty';
      const color = TOPBAR.statusColors[icon] ?? TOPBAR.statusColors.empty;
      ctx.fillStyle = TOPBAR.slotBg;
      ctx.fillRect(
        Math.round((slot.x + i * cell) * k),
        Math.round(slot.y * k),
        Math.round(cell * 0.9 * k),
        Math.round(slot.h * k),
      );
      ctx.fillStyle = color;
      ctx.fillRect(
        Math.round((slot.x + i * cell + cell * 0.12) * k),
        Math.round((slot.y + slot.h * 0.12) * k),
        Math.round(cell * 0.66 * k),
        Math.round(slot.h * 0.76 * k),
      );
    }
  }
  // 左侧木牌挂串（左上锚；缺图时代码占位牌，热区照常产出）
  const pl = assets.plaque;
  const pw = Math.min(COMPONENT_LAYOUT.plaque.wRatio * width, (COMPONENT_LAYOUT.plaque.maxHRatio * height) / (pl ? pl.height / pl.width : 2.19));
  const ph = (pw * (pl ? pl.height : 680)) / (pl ? pl.width : 310);
  const px = COMPONENT_LAYOUT.plaque.leftRatio * width;
  const py = COMPONENT_LAYOUT.plaque.topRatio * height;
  if (pl) {
    drawImg(ctx, pl, px, py, pw, ph);
  } else {
    // 占位牌：深木双牌+金字（视觉降级，功能不缺位）
    ctx.fillStyle = '#3a2c18';
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    for (const b of PLAQUE_BUTTONS) {
      const by = py + b.yRatio * ph;
      const bh = b.hRatio * ph;
      ctx.fillRect(Math.round(px + pw * 0.06), Math.round(by), Math.round(pw * 0.88), Math.round(bh));
      ctx.strokeRect(Math.round(px + pw * 0.06), Math.round(by), Math.round(pw * 0.88), Math.round(bh));
      ctx.fillStyle = '#ffd870';
      ctx.font = `bold ${Math.round(pw * 0.22)}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, px + pw * 0.5, by + bh / 2);
      ctx.fillStyle = '#3a2c18';
    }
  }
  view.layout.plaqueRect = { x: px, y: py, w: pw, h: ph };
  // 右下托管/加速/逃跑（右下锚：L 环反馈④——任何窗口比例恒贴右下可见；缺图时代码占位钮）
  const ct = assets.ctrl;
  const artAR = CTRL_ART.h / CTRL_ART.w; // 448/223（与图片解耦，防异常尺寸）
  const cw = Math.min(COMPONENT_LAYOUT.ctrl.wRatio * width, (COMPONENT_LAYOUT.ctrl.maxHRatio * height) / artAR);
  const ch = cw * artAR;
  const cx = Math.round(width - COMPONENT_LAYOUT.ctrl.rightRatio * width - cw);
  const cy = Math.round(height - COMPONENT_LAYOUT.ctrl.bottomRatio * height - ch);
  if (ct) {
    drawImg(ctx, ct, cx, cy, cw, ch);
  } else {
    // 占位钮：深木底圆角矩形+金字（视觉降级，功能不缺位）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of CTRL_BUTTONS) {
      const by = cy + (b.y / 448) * ch;
      const bh = (b.h / 448) * ch;
      ctx.fillStyle = '#3a2c18';
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(cx + cw * 0.04, by, cw * 0.92, bh, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd870';
      ctx.font = `bold ${Math.round(bh * 0.42)}px "PingFang SC","Microsoft YaHei",sans-serif`;
      const label = b.action === 'mode' ? '托管' : b.action === 'speed' ? '加速' : '逃跑';
      ctx.fillText(label, cx + cw * 0.5, by + bh / 2);
    }
  }
  // 状态高亮（L 环二反馈②：托管中/加速中的可视反馈——状态来自宿主填充的演出态）
  const rim =
    view.uiState.mode === 'auto' ? 'rgba(255, 235, 160, 0.95)' : view.uiState.speed ? 'rgba(160, 240, 160, 0.9)' : null;
  if (rim) {
    const row = view.uiState.mode === 'auto' ? CTRL_BUTTONS[0] : CTRL_BUTTONS[1];
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cx + cw * 0.04, cy + (row.y / CTRL_ART.h) * ch, cw * 0.92, (row.h / CTRL_ART.h) * ch);
  }
  view.layout.ctrlRect = { x: cx, y: cy, w: cw, h: ch };
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
    if (f.kind === 'note') {
      ctx.fillStyle = '#ffb84a';
      ctx.font = `bold ${Math.round(width * 0.032)}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text ?? '', sx, Math.round(sy - TILE_H - 26 - p * 22)); // 头顶上浮
    } else if (f.kind === 'slash') {
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
  snapshot: BattleSnapshot,
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
  drawPieceHud(ctx, placed, snapshot, view);
  drawFx(ctx, view, cam, width, height);
  ctx.restore();
  drawComponents(ctx, snapshot, assets, width, height, view);
  drawPhaseOverlay(ctx, snapshot, width, height);
}
