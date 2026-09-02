// battle_demo preview 主入口（复用 home_demo 工程模式四件套）：
// ① 帧预解码（全部 decode 完才开播，防换帧闪烁）② 整数像素定位（渲染模块内 Math.round）
// ③ height 定尺（渲染高=格高×定尺系数，素材画布尺寸不参与）④ 资源版本号防缓存
// 数据源=真 battle-session（联调工单：mock→真 session 单点替换；reset=重建对局）。
import type { CombatantInput } from '../../types';
import { BATTLE_HEX_RES, hexToWorld } from '../../config/battle-hex';
import { createBattleInput } from '../../ui/battle-input';
import {
  createView,
  drawFrame,
  updateView,
  type BattleHexAssets,
  type ImgLike,
} from '../../ui/battle-hex-render';
import { createHexBattle } from '../../systems/battle-session';

// ===== 画布（逻辑分辨率自适应窗口实际比例，L 环反馈④；dpr 放大保真） =====
let W = 375;
let H = 667;
const canvas = document.getElementById('cv') as HTMLCanvasElement;
const dpr = Math.min(3, window.devicePixelRatio || 1);
function resize(): void {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(280, Math.round(r.width));
  const h = Math.max(420, Math.round(r.height));
  if (w === W && h === H) return;
  W = w;
  H = h;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
resize();
window.addEventListener('resize', resize);

// ===== toast =====
const toastEl = document.getElementById('toast') as HTMLElement;
let toastTimer = 0;
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.style.opacity = '1';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.style.opacity = '0'), 1400);
}

// ===== 资源加载（版本号防缓存 + 帧预解码，失败降级 null 不崩） =====
// config 路径=小游戏包根相对（生产唯一真值）；file:// 预览页位于 proto/battle_demo/，需回退到仓库根
const FILE_PREFIX = location.protocol === 'file:' ? '../../' : '';
function loadImg(url: string): Promise<HTMLImageElement | null> {
  const im = new Image();
  im.src = FILE_PREFIX + url;
  return im.decode().then(() => im).catch(() => null);
}

async function loadAssets(): Promise<BattleHexAssets> {
  const q = (p: string): string => `${p}?v=${BATTLE_HEX_RES.ver}`;
  const frameJobs: Array<Promise<unknown>> = [];
  const frames = new Map<string, Array<ImgLike | null>>();
  for (const kind of BATTLE_HEX_RES.spriteKinds) {
    const jobs: Array<Promise<ImgLike | null>> = [];
    for (let i = 0; i < BATTLE_HEX_RES.frameCount; i++) jobs.push(loadImg(q(BATTLE_HEX_RES.frameSrc(kind, i))));
    frameJobs.push(
      Promise.all(jobs).then((arr) => {
        frames.set(kind, arr);
      }),
    );
  }
  const [env, topbar, plaque, ctrl] = await Promise.all([
    loadImg(q(BATTLE_HEX_RES.env)),
    loadImg(q(BATTLE_HEX_RES.topbar)),
    loadImg(q(BATTLE_HEX_RES.plaque)),
    loadImg(q(BATTLE_HEX_RES.ctrl)),
    ...frameJobs,
  ]);
  const ok = (i: HTMLImageElement | null): string => (i ? 'ok' : 'MISS');
  console.log(
    `[battle_demo] 资源：env=${ok(env)} topbar=${ok(topbar)} plaque=${ok(plaque)} ctrl=${ok(ctrl)} ` +
      `帧=[${[...frames.entries()].map(([k, v]) => `${k}:${v.filter(Boolean).length}/${v.length}`).join(' ')}]`,
  );
  return { env, topbar, plaque, ctrl, frames };
}

// ===== 对局构造（联调：真 session；演示阵容=主角四技 vs 山贼+野狼，R-07 档位语义占位） =====
/** 演示技能表（id 与 ui ARC_BTNS.ids 对齐；数值走 SkillDef 结构由 core 结算，此处非真值来源） */
const DEMO_SKILLS = [
  { id: 'te', name: '特', kind: 'special' as const, weapon: 'fist' as const, grade: 1.3 as const, growth: 1, level: 20, cooldownTurns: 2, neiliCost: 20 },
  { id: 'jue', name: '绝', kind: 'ultimate' as const, weapon: 'fist' as const, grade: 1.7 as const, growth: 1, level: 20, cooldownTurns: 5, neiliCost: 35 },
  { id: 'qing', name: '轻', kind: 'qingGong' as const, weapon: null, grade: 1.0 as const, growth: 1, level: 20, cooldownTurns: 3, neiliCost: 15 },
  { id: 'du', name: '毒', kind: 'hiddenWeapon' as const, weapon: 'hidden' as const, grade: 1.0 as const, growth: 1, level: 20, cooldownTurns: 1, neiliCost: 10 },
];

function demoUnit(over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side' | 'name'>): CombatantInput {
  return {
    hp: 100,
    maxHp: 100,
    neili: 60,
    maxNeili: 100,
    atk: 12,
    def: 3,
    neigongLevel: 5,
    jimin: 8,
    danshi: 0,
    shizhan: 60, // 演示高命中（保普攻可观测；命中率真值在 core F-04）
    pos: { x: 0, y: 0 }, // 出生位由 session 按 O3 随机覆盖
    weapon: 'fist',
    skills: [],
    ...over,
  };
}

let session = makeSession();
function makeSession() {
  // 敌方 name=configId（F3 约定：spriteKey=configId → 帧表键；名字牌暂显模板名，美化留后续）
  return createHexBattle({
    player: demoUnit({ id: 'hero', side: 'player', name: '小虾米', skills: DEMO_SKILLS }),
    enemies: [
      demoUnit({ id: 'e1', side: 'enemy', name: 'npc-shanzei', hp: 70, maxHp: 70, atk: 8, jimin: 5 }),
      demoUnit({ id: 'e2', side: 'enemy', name: 'npc-lang', hp: 60, maxHp: 60, atk: 9, jimin: 6 }),
    ],
    mode: 'manual',
    seed: 42,
  });
}

const view = createView();
let assets: BattleHexAssets = { env: null, topbar: null, plaque: null, ctrl: null, frames: new Map() };

const input = createBattleInput({
  dispatch: (req) => {
    session.submit(req);
  },
  onBlocked: (msg) => toast(msg),
  onPlaque: (label) => toast(`${label}（演示占位）`),
  mode: () => session._debug.mode(),
});

function resetDemo(): void {
  session = makeSession();
  view.anim.clear();
  view.moveFrom.clear();
  view.fx.length = 0;
  view.selectedCell = null;
  view.skillPop = 0;
  view.camDrag.x = 0;
  view.camDrag.y = 0;
}

function toLogical(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

canvas.addEventListener('pointerdown', (e) => {
  const p = toLogical(e);
  const snap = session.snapshot();
  if (snap.phase !== 'fighting') return; // 结算遮罩期点击=重开（抬起触发）
  input.down(view, snap, p.x, p.y, W, H);
});
canvas.addEventListener('pointermove', (e) => {
  if (!input.pointer.down) return;
  const p = toLogical(e);
  input.move(view, p.x, p.y);
});
canvas.addEventListener('pointerup', (e) => {
  const p = toLogical(e);
  const snap = session.snapshot();
  if (snap.phase !== 'fighting') {
    resetDemo();
    return;
  }
  input.up(view, snap, p.x, p.y, W, H);
});
document.addEventListener('dragstart', (e) => e.preventDefault());

// ===== 调试挂载（preview 目验/自动化驱动用；正式接入不含此段） =====
interface CssPoint {
  x: number;
  y: number;
}
function logicalToCss(x: number, y: number): CssPoint {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + (x / W) * r.width, y: r.top + (y / H) * r.height };
}
(window as unknown as Record<string, unknown>).__demo = {
  get session() {
    return session;
  },
  getView: () => view,
  W,
  H,
  /** 格 → 页面坐标（自动化点击用） */
  cellCss(q: number, r: number): CssPoint {
    const w = hexToWorld(q, r);
    return logicalToCss(w.x - view.camera.x + W / 2, w.y - view.camera.y + H / 2);
  },
  /** 逻辑坐标 → 页面坐标（ctrl 等布局热区换算用） */
  cssOf(lx: number, ly: number): CssPoint {
    return logicalToCss(lx, ly);
  },
  /** 弧形技能钮 → 页面坐标 */
  btnCss(id: string): CssPoint | null {
    const b = view.layout.skillBtns.find((x) => x.id === id);
    return b ? logicalToCss(b.x, b.y) : null;
  },
};

// ===== 主循环 =====
let last = performance.now();
function loop(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  resize(); // 每帧检测窗口尺寸变化（resize 事件不可靠场景兜底）
  session.tick(dt);
  const snap = session.snapshot();
  updateView(view, snap, dt, W, H);
  drawFrame({ ctx, width: W, height: H, dt }, snap, assets, view);
  requestAnimationFrame(loop);
}

void loadAssets().then((a) => {
  assets = a;
  requestAnimationFrame((t) => {
    last = t;
    loop(t);
  });
});
