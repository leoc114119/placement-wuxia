// battle_demo preview 主入口（复用 home_demo 工程模式四件套）：
// ① 帧预解码（全部 decode 完才开播，防换帧闪烁）② 整数像素定位（渲染模块内 Math.round）
// ③ height 定尺（渲染高=格高×定尺系数，素材画布尺寸不参与）④ 资源版本号防缓存
// 数据源=mock 快照（T15 完成后对切真 session，本文件仅换数据源）。
import { BATTLE_HEX_RES } from '../../config/battle-hex';
import { createBattleInput } from '../../ui/battle-input';
import {
  createView,
  drawFrame,
  updateView,
  type BattleHexAssets,
  type ImgLike,
} from '../../ui/battle-hex-render';
import { createMockSession, type MockBattleSnapshot } from './mock_session';

// ===== 画布（逻辑分辨率 375×667 基线；dpr 放大保真） =====
const W = 375;
const H = 667;
const canvas = document.getElementById('cv') as HTMLCanvasElement;
const dpr = Math.min(3, window.devicePixelRatio || 1);
canvas.width = W * dpr;
canvas.height = H * dpr;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
ctx.scale(dpr, dpr);

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
function loadImg(url: string): Promise<HTMLImageElement | null> {
  const im = new Image();
  im.src = url;
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

// ===== 会话 / 视图 / 输入 =====
const session = createMockSession(42);
const view = createView();
let assets: BattleHexAssets = { env: null, topbar: null, plaque: null, ctrl: null, frames: new Map() };

const input = createBattleInput({
  dispatch: (req) => {
    session.dispatch(req);
  },
  onBlocked: (msg) => toast(msg),
  onPlaque: (label) => toast(`${label}（演示占位）`),
  mode: () => session.mode(),
});

function resetDemo(): void {
  session.reset();
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
  input.up(view, snap as MockBattleSnapshot, p.x, p.y, W, H);
});
document.addEventListener('dragstart', (e) => e.preventDefault());

// ===== 主循环 =====
let last = performance.now();
function loop(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
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
