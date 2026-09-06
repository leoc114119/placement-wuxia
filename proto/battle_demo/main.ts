// battle_demo preview 主入口（复用 home_demo 工程模式四件套）：
// ① 帧预解码（全部 decode 完才开播，防换帧闪烁）② 整数像素定位（渲染模块内 Math.round）
// ③ height 定尺（渲染高=格高×定尺系数，素材画布尺寸不参与）④ 资源版本号防缓存
// 数据源=真 battle-session（联调工单：mock→真 session 单点替换；reset=重建对局）。
import type { CombatantInput } from '../../types';
import { BATTLE_HEX_RES, DMG, FACINGS, REJECT_HINTS, hexToWorld, type BattleClip } from '../../config/battle-hex';
import { createBattleInput, createPointerTracker } from '../../ui/battle-input';
import {
  createView,
  drawFrame,
  enqueueHit,
  frameKeyOf,
  pieceHop,
  spawnNoteFx,
  updateView,
  type BattleHexAssets,
  type DirectionalFrameStore,
  type ImgLike,
  type LegacyFrameStrip,
} from '../../ui/battle-hex-render';
import { createHexBattle } from '../../systems/battle-session';

// ===== 画布（逻辑分辨率自适应窗口实际比例，L 环反馈④；dpr 放大保真） =====
// W/H 初值 = 0（未测量哨兵，09-06 补卡）：舞台 #cvWrap 为 9:16，375×667 视口下 rect 恰为
// 旧默认初值 375/667 → resize() 首调 `w===W && h===H` 早退 → canvas 缓冲滞留 HTML 默认
// 300×150（画面左上裁区非均匀拉伸）。初值归 0 后首调必不早退（钳制下限 280×420 > 0），
// 缓冲与 dpr transform 必在首帧前落设（缺陷锁 = tests/battle-demo-resize.test.ts）。
let W = 0;
let H = 0;
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
  const frames = new Map<string, LegacyFrameStrip | DirectionalFrameStore>();
  // 【六向帧接线 §3.1】loader 按 profile 预解码：legacy=帧号条；directional=clip×facing×ordinal
  // 网格（sharedSrc 共用帧按 clip 键只解码一次——die_common 六向共用）
  for (const [kind, profile] of Object.entries(BATTLE_HEX_RES.profiles)) {
    if (profile.mode === 'legacy') {
      const jobs: Array<Promise<ImgLike | null>> = [];
      for (let i = 0; i < profile.frameCount; i++) jobs.push(loadImg(q(profile.frameSrc(i))));
      frameJobs.push(
        Promise.all(jobs).then((arr) => {
          frames.set(kind, arr);
        }),
      );
    } else {
      const jobs: Array<Promise<readonly [string, ImgLike | null]>> = [];
      for (const clip of Object.keys(profile.clipCounts) as BattleClip[]) {
        const shared = profile.sharedSrc[clip];
        if (shared !== undefined) {
          jobs.push(loadImg(q(shared)).then((im) => [clip, im] as const)); // 共用帧：键=clip 名
          continue;
        }
        const count = profile.clipCounts[clip];
        for (const facing of FACINGS) {
          for (let o = 1; o <= count; o++) {
            const key = frameKeyOf(clip, facing, o);
            jobs.push(loadImg(q(profile.frameSrc(clip, facing, o))).then((im) => [key, im] as const));
          }
        }
      }
      frameJobs.push(
        Promise.all(jobs).then((pairs) => {
          frames.set(kind, { mode: 'directional', frames: new Map(pairs) });
        }),
      );
    }
  }
  // T23：ctrl 三钮独立脸 + 状态图标三枚（key 词表 poison/blood/skull = config BATTLE_HEX_RES.statusIcons）
  const faceEntries = Object.entries(BATTLE_HEX_RES.ctrlFaces) as Array<[string, string]>;
  const faceJobs = faceEntries.map(async ([key, path]) => [key, await loadImg(q(path))] as const);
  const iconEntries = Object.entries(BATTLE_HEX_RES.statusIcons) as Array<[string, string]>;
  const iconJobs = iconEntries.map(async ([key, path]) => [key, await loadImg(q(path))] as const);
  const [env, topbar, plaque, facePairs, iconPairs] = await Promise.all([
    loadImg(q(BATTLE_HEX_RES.env)),
    loadImg(q(BATTLE_HEX_RES.topbar)),
    loadImg(q(BATTLE_HEX_RES.plaque)),
    Promise.all(faceJobs),
    Promise.all(iconJobs),
    ...frameJobs,
  ]);
  const ctrlFaces: BattleHexAssets['ctrlFaces'] = { tuoguan: null, jiasu: null, flee: null };
  for (const [key, img] of facePairs) {
    if (key === 'tuoguan' || key === 'jiasu' || key === 'flee') ctrlFaces[key] = img;
  }
  const statusIcons = new Map<string, ImgLike | null>(iconPairs);
  const ok = (i: HTMLImageElement | null): string => (i ? 'ok' : 'MISS');
  const frameStat = (v: LegacyFrameStrip | DirectionalFrameStore): string =>
    Array.isArray(v)
      ? `${v.filter(Boolean).length}/${v.length}`
      : `${[...v.frames.values()].filter(Boolean).length}/${v.frames.size}`;
  console.log(
    `[battle_demo] 资源：env=${ok(env)} topbar=${ok(topbar)} plaque=${ok(plaque)} ` +
      `ctrlFaces=[${facePairs.map(([k2, v]) => `${k2}:${ok(v)}`).join(' ')}] ` +
      `statusIcons=[${iconPairs.map(([k2, v]) => `${k2}:${ok(v)}`).join(' ')}] ` +
      `帧=[${[...frames.entries()].map(([k2, v]) => `${k2}:${frameStat(v)}`).join(' ')}]`,
  );
  return { env, topbar, plaque, ctrlFaces, statusIcons, frames };
}

// ===== 对局构造（联调：真 session；演示阵容=主角四技 vs 山贼双敌（Leo 09-04 裁定摘狼：设计无狼 NPC），R-07 档位语义占位） =====
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
let speedOn = false;
let evCursor = 0; // session.events 消费游标（累积数组）
function makeSession() {
  // 敌方 name=configId（F3 约定：spriteKey=configId → 帧表键；名字牌暂显模板名，美化留后续）
  return createHexBattle({
    player: demoUnit({ id: 'hero', side: 'player', name: '小虾米', skills: DEMO_SKILLS }),
    enemies: [
      demoUnit({ id: 'e1', side: 'enemy', name: 'npc-shanzei', hp: 70, maxHp: 70, atk: 8, jimin: 5 }),
      demoUnit({ id: 'e2', side: 'enemy', name: 'npc-shanzei', hp: 60, maxHp: 60, atk: 9, jimin: 6 }),
    ],
    mode: 'manual',
    seed: 42,
  });
}

const view = createView();
let assets: BattleHexAssets = {
  env: null,
  topbar: null,
  plaque: null,
  ctrlFaces: { tuoguan: null, jiasu: null, flee: null },
  statusIcons: new Map(),
  frames: new Map(),
};

const input = createBattleInput({
  dispatch: (req) => {
    const ok = session.submit(req);
    if (ok && req.type === 'toggleSpeed') speedOn = !speedOn; // 演出态：加速中可视反馈
  },
  onBlocked: (msg) => toast(msg),
  // T23 开放点③默认：onPlaque 回调移除——牌面点击由 input 层静默吞掉（不穿透、无提示，纯占位）
  mode: () => session._debug.mode(),
});

function resetDemo(): void {
  input.reset(); // A07：重开清输入拖动态（结算瞬间按住/拖镜不跨局残留）
  session = makeSession();
  evCursor = 0;
  speedOn = false;
  view.anim.clear();
  view.moveAnims.clear();
  view.camInit = false; // 重开重新定位镜头
  view.fx.length = 0;
  view.pendingHits.length = 0; // T21/E4：重开残留清理（旧对局挂起/震动/错位序号不跨局冒出）
  view.shakes.clear();
  view.dmgStagger.clear();
  view.selectedCell = null;
  view.skillPop = 0;
  view.camDrag.x = 0;
  view.camDrag.y = 0;
}

function toLogical(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

// ===== 指针生命周期（A07）：同指针配对 + pointercancel/失焦重置 =====
const ptr = createPointerTracker();
canvas.addEventListener('pointerdown', (e) => {
  if (!ptr.down(e.pointerId)) return; // 多指交叉：非活动指忽略（同 id 重复 down=丢失 up 的自愈重锚）
  const p = toLogical(e);
  const snap = session.snapshot();
  if (snap.phase !== 'fighting') return; // 结算遮罩期点击=重开（抬起触发）
  input.down(view, snap, p.x, p.y, W, H);
});
canvas.addEventListener('pointermove', (e) => {
  if (!ptr.owns(e.pointerId) || !input.pointer.down) return; // 配对：非活动指的 move 忽略
  const p = toLogical(e);
  input.move(view, p.x, p.y);
});
canvas.addEventListener('pointerup', (e) => {
  if (!ptr.release(e.pointerId)) return; // 配对：id 不匹配/无活动指的 up 忽略（非配对释放不产生点击）
  const p = toLogical(e);
  const snap = session.snapshot();
  if (snap.phase !== 'fighting') {
    resetDemo();
    return;
  }
  input.up(view, snap, p.x, p.y, W, H);
});
canvas.addEventListener('pointercancel', (e) => {
  if (!ptr.release(e.pointerId)) return; // 非活动指的 cancel 忽略
  input.reset(); // A07：cancel=系统接管异常终止——视作未发生的按下：清拖动态，不产生点击
});
window.addEventListener('blur', () => {
  ptr.reset(); // A07：失焦清指针归属
  input.reset(); // 清拖动态（拖镜中失焦不残留 dragging）
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
function sampleHeroDrawPos(): { q: number; r: number; hop: number } {
  const hero = session.snapshot().actors.find((a) => a.id === 'hero');
  if (!hero) return { q: 0, r: 0, hop: 0 };
  const ma = view.moveAnims.get(hero.id);
  const mp = ma ? Math.min(1, ma.t / ma.duration) : 1;
  const q = ma ? ma.from.q + (ma.pos.q - ma.from.q) * mp : hero.renderPos.q;
  const r = ma ? ma.from.r + (ma.pos.r - ma.from.r) * mp : hero.renderPos.r;
  return { q: +q.toFixed(3), r: +r.toFixed(3), hop: +pieceHop(view, hero).toFixed(1) };
}

(window as unknown as Record<string, unknown>).__demo = {
  get session() {
    return session;
  },
  getView: () => view,
  get W() {
    return W;
  },
  get H() {
    return H;
  },
  /** 格 → 页面坐标（自动化点击用） */
  cellCss(q: number, r: number): CssPoint {
    const w = hexToWorld(q, r);
    return logicalToCss(w.x - view.camera.x + W / 2, w.y - view.camera.y + H / 2);
  },
  /** 主角演出绘制位置采样（终验：移动帧序列单调性断言用） */
  sampleHeroDraw(): { q: number; r: number; hop: number } {
    return sampleHeroDrawPos();
  },
  /** 真实 rAF 逐帧位置录制（终验闪烁实证：Performance.now 时间轴） */
  startFrameLog(): void {
    frameLog = [];
    frameLogOn = true;
  },
  stopFrameLog(): Array<{ t: number; q: number; r: number; hop: number }> {
    frameLogOn = false;
    return frameLog;
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
let frameLog: Array<{ t: number; q: number; r: number; hop: number }> = [];
let frameLogOn = false;
function loop(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  resize(); // 每帧检测窗口尺寸变化（resize 事件不可靠场景兜底）
  if (frameLogOn) frameLog.push({ t: Math.round(performance.now()), ...sampleHeroDrawPos() });
  session.tick(dt);
  const snap = session.snapshot();
  view.uiState = { mode: session._debug.mode(), speed: speedOn };
  // 事件消费（rejected 冒字 T15 R3 + T21 受击反馈白名单入队，方案 §2.2——其余一切不入队）
  const evs = session.events;
  for (; evCursor < evs.length; evCursor++) {
    const e = evs[evCursor];
    if (e.type === 'rejected') {
      if (!e.actorId) continue;
      const actor = snap.actors.find((a) => a.id === e.actorId);
      if (!actor) continue;
      const w = hexToWorld(actor.renderPos.q, actor.renderPos.r);
      spawnNoteFx(view, w.x, w.y, REJECT_HINTS[e.reason ?? 'invalid'] ?? '无法执行');
      continue;
    }
    // T21 白名单（§2.2）：basic/skill 且有 targetId 且 damage>0 → 冒数字+震动；
    // miss 且有 targetId → 冒「闪避」不震（闪避=未受击）。fallback/blocked damage=0、
    // 空放 skill（无 targetId 无 damage，session:768）、death/move/win/lose 等天然不入队。
    // 数值铁律：text=String(e.damage) 直读事件字段禁任何换算（真值在 core，UI 只展示）。
    if ((e.type === 'basic' || e.type === 'skill') && e.targetId && typeof e.damage === 'number' && e.damage > 0) {
      enqueueHit(view, e.actorId ?? '', e.targetId, String(e.damage), true);
    } else if (e.type === 'miss' && e.targetId) {
      enqueueHit(view, e.actorId ?? '', e.targetId, DMG.missText, false);
    }
  }
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
