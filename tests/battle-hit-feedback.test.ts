// T21 受击反馈用例（R1-R10 · 命名沿方案 §五）：掉血数字 + 受击震动的渲染层机制与红线锁。
// 观测面：单测=vitest 驱动 updateView/drawFrame（Proxy ctx 线性探针）；R9=浏览器 e2e
//（resetDemo 在宿主 main.ts，vitest 不可达——behavior_e2e.mjs HF4 承载）。
// 镜像说明：入队一律走生产口 enqueueHit（宿主 main.ts 白名单判定后调用的同一函数），
// 白名单本身属宿主消费段——R4 以源码形状断言锁（battle-structure 模式）+ e2e 行为面（HF2 空放）。
// 运行：npm run test:battle
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

declare const __dirname: string;
import { DMG } from '../config/battle-hex';
import {
  createView,
  drawFrame,
  enqueueHit,
  updateView,
  type BattleHexAssets,
  type BattleHexView,
} from '../ui/battle-hex-render';
import type { BattleSnapshot, SnapshotActor } from '../types';

const ROOT = path.resolve(__dirname, '..');
const H = 667; // 逻辑屏高（定尺断言基准，E6/F6：禁用 dpr 放大后的物理高）
const EMPTY_ASSETS: BattleHexAssets = {
  env: null,
  topbar: null,
  plaque: null,
  ctrlFaces: { tuoguan: null, jiasu: null, flee: null },
  statusIcons: new Map(),
  frames: new Map(),
}; // T23：BattleHexAssets 增 ctrlFaces/statusIcons（缺图降级形状不变）

// ---------- 夹具 ----------
function makeSnapshot(parts: Array<Partial<SnapshotActor>>): BattleSnapshot {
  const base: SnapshotActor = {
    id: 'x', side: 'player', name: '单位', pos: { q: 1, r: 8 }, renderPos: { q: 1, r: 8 },
    hp: 50, maxHp: 50, neili: 30, maxNeili: 30, actionBar: 0, facing: 'right',
    animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'hero', isJump: false,
  };
  return {
    phase: 'fighting',
    turnActorId: null,
    pendingInput: false,
    moveCells: [],
    moveKind: 'walk',
    attackCells: [],
    selectedSkill: null,
    heroSkills: [],
    actors: parts.map((p) => ({ ...base, ...p })),
    cameraTargetId: 'hero',
  };
}

/** 攻/受双方最小快照（hero=攻击者，e1=受击者；renderPos=pos 保证无 moveAnims 干扰） */
function twoActorSnap(attacker: Partial<SnapshotActor>, target: Partial<SnapshotActor>): BattleSnapshot {
  return makeSnapshot([
    { id: 'hero', side: 'player', name: '攻方', pos: { q: 4, r: 8 }, renderPos: { q: 4, r: 8 }, ...attacker },
    {
      id: 'e1', side: 'enemy', name: '受方', pos: { q: 5, r: 8 }, renderPos: { q: 5, r: 8 },
      spriteKey: 'npc-shanzei', ...target,
    },
  ]);
}

/** 宿主次序镜像（F1）：main.ts 主循环=先消费事件入队、后 updateView 冲刷——次序写反会把正常实现误判失效 */
function feed(view: BattleHexView, snap: BattleSnapshot, dt = 0.016): void {
  updateView(view, snap, dt, 375, H);
}

/** 探针 ctx：线性记录属性写（set:prop=value）与方法调用（call:prop）——dmg 绘制序/字号断言用（F6 按绘制序取值） */
function makeProbeCtx(): { ctx: CanvasRenderingContext2D; ops: string[] } {
  const ops: string[] = [];
  const base = {
    canvas: { width: 375, height: H },
    measureText: (): { width: number } => ({ width: 10 }),
    createLinearGradient: (): { addColorStop: () => void } => ({ addColorStop: () => {} }),
  } as unknown as CanvasRenderingContext2D;
  const ctx = new Proxy(base, {
    get(t, prop) {
      const rec = t as unknown as Record<string | symbol, unknown>;
      if (prop in rec) return rec[prop];
      return () => {
        ops.push(`call:${String(prop)}`);
      };
    },
    set(t, prop, v) {
      ops.push(`set:${String(prop)}=${String(v)}`);
      return true;
    },
  });
  return { ctx, ops };
}

// ---------- R1 普攻冒字 + 震动 ----------
describe('R1 普攻冒字+震动（V1/E6/E9）', () => {
  it('入队形状→idle→basic 上升沿当帧冲刷：dmg fx text 全等 String(damage)、shakes 含受击者、下一帧不重复 spawn', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'idle' }, { animState: 'idle' });
    feed(view, snap); // 首帧登记 idle 组首
    // 宿主白名单映射（main.ts §2.2）：basic 且 targetId 且 damage>0 → { text:String(damage), shake:true }
    enqueueHit(view, 'hero', 'e1', String(11), true);
    expect(view.pendingHits).toHaveLength(1);
    expect(view.pendingHits[0]).toMatchObject({ attackerId: 'hero', targetId: 'e1', text: '11', shake: true });
    expect(view.pendingHits[0].t).toBe(view.time); // 入队时刻=view.time 同源（超时/错位窗口判定基准）
    snap.actors[0].animState = 'basic'; // idle→basic 上升沿（普攻同帧切换）
    feed(view, snap);
    expect(view.pendingHits).toHaveLength(0); // 冲刷即出队
    const dmgs = view.fx.filter((f) => f.kind === 'dmg');
    expect(dmgs).toHaveLength(1);
    expect(dmgs[0].text).toBe('11'); // E9：直读全等（禁 '11.0'/取整/千分位）
    expect(view.shakes.has('e1')).toBe(true); // 只震受击者
    feed(view, snap); // b 已在态停留期（F2）：不得连帧重复 spawn
    expect(view.fx.filter((f) => f.kind === 'dmg')).toHaveLength(1);
  });

  it('字号=round(H×fontPerH)（667 屏=17 屏高定尺，E6）+ 先描后填 + lineJoin round', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'idle' }, { animState: 'idle' });
    feed(view, snap);
    enqueueHit(view, 'hero', 'e1', String(11), true);
    snap.actors[0].animState = 'basic';
    feed(view, snap);
    expect(Math.round(H * DMG.fontPerH)).toBe(17); // 方案 §2.6 注：667 屏 ≈ 17px
    const { ctx, ops } = makeProbeCtx();
    drawFrame({ ctx, width: 375, height: H, dt: 0.016 }, snap, EMPTY_ASSETS, view);
    const dmgFont = `bold ${Math.round(H * DMG.fontPerH)}px "PingFang SC","Microsoft YaHei",sans-serif`;
    expect(ops).toContain(`set:font=${dmgFont}`);
    const st = ops.indexOf('call:strokeText');
    expect(st).toBeGreaterThanOrEqual(0);
    expect(ops.slice(st, st + 3)).toEqual(['call:strokeText', `set:fillStyle=${DMG.fillColor}`, 'call:fillText']); // 先描后填
    expect(ops).toContain('set:lineJoin=round'); // 防尖刺
    expect(ops).toContain(`set:strokeStyle=${DMG.strokeColor}`);
  });

  it('震动计时推进与到期删除（≥shakeSec；F3：按历时判定，禁 sin 幅度归零判定）', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'idle' }, { animState: 'idle' });
    feed(view, snap);
    enqueueHit(view, 'hero', 'e1', String(11), true);
    snap.actors[0].animState = 'basic';
    feed(view, snap);
    expect(view.shakes.get('e1')).toBe(0); // 冲刷帧起振
    feed(view, snap, 0.1);
    expect(view.shakes.get('e1')).toBeCloseTo(0.1, 5); // 独立衰减时钟推进
    feed(view, snap, 0.1); // 累计 0.2 = shakeSec → 到期删除
    expect(view.shakes.has('e1')).toBe(false);
  });
});

// ---------- R2 特技 strike 对齐 ----------
describe('R2 特技 strike 对齐（V2 前半/E1）', () => {
  it('skill 入队→charge 帧不冲刷→charge→strike 帧冲刷且同帧 fx 同时含 slash（与出招弧同沿）', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'idle' }, { animState: 'idle' });
    feed(view, snap);
    enqueueHit(view, 'hero', 'e1', String(14), true); // 宿主 skill 分支映射（同 basic）
    snap.actors[0].animState = 'charge';
    feed(view, snap);
    expect(view.fx.filter((f) => f.kind === 'dmg')).toHaveLength(0); // 蓄力段不出字
    expect(view.pendingHits).toHaveLength(1);
    snap.actors[0].animState = 'strike';
    feed(view, snap);
    expect(view.pendingHits).toHaveLength(0);
    const kinds = view.fx.map((f) => f.kind);
    expect(kinds).toContain('dmg');
    expect(kinds).toContain('slash'); // 同沿（既有上升沿 slash 派生）
    expect(view.fx.find((f) => f.kind === 'dmg')?.text).toBe('14');
    expect(view.shakes.has('e1')).toBe(true);
  });
});

// ---------- R3 miss 冒字不震 ----------
describe('R3 miss 冒字不震（V3/E7）', () => {
  it('miss 入队 shake=false 入队即定；冲刷后 text=DMG.missText；shakes 不含受击者', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'idle' }, { animState: 'idle' });
    feed(view, snap);
    enqueueHit(view, 'hero', 'e1', DMG.missText, false); // 宿主 miss 分支映射（damage=0 不参与 text）
    expect(view.pendingHits[0]).toMatchObject({ text: '闪避', shake: false }); // 入队即定，非冲刷时修正
    snap.actors[0].animState = 'basic';
    feed(view, snap);
    const dmg = view.fx.find((f) => f.kind === 'dmg');
    expect(dmg?.text).toBe('闪避'); // 同动效冒字，无数字
    expect(view.shakes.has('e1')).toBe(false); // 闪避=未受击，不震（§六确认点 1，Leo 背书）
  });
});

// ---------- R4 白名单外零入队（宿主消费段源码形状，battle-structure 模式） ----------
describe('R4 白名单外零入队（E8：main.ts 消费段形状锁；行为面由 e2e HF2 空放补证）', () => {
  const MAIN = readFileSync(path.join(ROOT, 'proto/battle_demo/main.ts'), 'utf8');
  const seg = MAIN.split('for (; evCursor < evs.length; evCursor++)')[1] ?? '';
  const loop = seg.split('updateView(view, snap, dt, W, H)')[0] ?? '';

  it('空放 skill（无 targetId 无 damage，session:768 形状）被 targetId 守卫排除', () => {
    expect(loop).toContain("e.type === 'basic' || e.type === 'skill'");
    expect(loop).toContain('e.targetId');
  });

  it('fallback/blocked damage=0 与 damage=undefined 被「number 且 >0」守卫排除', () => {
    expect(loop).toContain('typeof e.damage');
    expect(loop).toContain('e.damage > 0');
  });

  it('text=String(e.damage) 直读转型、miss 文案走 DMG.missText（禁换算/禁散落字面量）', () => {
    expect(loop).toContain('String(e.damage)');
    expect(loop).toContain('DMG.missText, false'); // miss → shake=false
  });

  it('rejected 走既有 note 冒字；death/move/win/lose 等白名单外事件零入队分支', () => {
    expect(loop).toContain("e.type === 'rejected'");
    expect(loop).toContain('spawnNoteFx');
    for (const t of ['fallback', 'blocked', 'death', 'move', 'win', 'lose', 'bar-max', 'trust', 'switch-auto', 'flee']) {
      expect(loop.includes(`'${t}'`)).toBe(false);
    }
    expect(loop.split('enqueueHit(').length - 1).toBe(2); // 入队口收敛：basic/skill + miss 恰两处
  });
});

// ---------- R5 ATK-3 延后冲刷（两时序 + b 兜底） ----------
describe('R5 冲刷时序（V4/E1/E3）', () => {
  it('时序一 同帧：入队帧即 idle→basic 上升沿 → 当帧出字零附加延迟', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'idle' }, { animState: 'idle' });
    feed(view, snap);
    enqueueHit(view, 'hero', 'e1', String(9), true);
    snap.actors[0].animState = 'basic';
    feed(view, snap); // 同一帧：上升沿收集（演出循环）→ 统一冲刷
    expect(view.pendingHits).toHaveLength(0);
    expect(view.fx.filter((f) => f.kind === 'dmg')).toHaveLength(1);
  });

  it('时序二 延后（ATK-3 补播形状）：walk 快照多帧不冲刷，walk→basic 切换帧出字（首现帧序 ≥ 切换帧序）；断言基准=快照 animState 非渲染插值（E3 注记）', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'walk' }, { animState: 'idle' });
    feed(view, snap); // 登记 walk 组首
    enqueueHit(view, 'hero', 'e1', String(9), true); // 消费帧攻击者仍在 walk（session:365-366 pendingAnim）
    const frames: Array<{ anim: string; dmg: boolean }> = [];
    for (let f = 0; f < 10; f++) {
      if (f === 7) snap.actors[0].animState = 'basic'; // 补播切换（移动演出结束后）
      feed(view, snap, 0.05);
      frames.push({ anim: snap.actors[0].animState, dmg: view.fx.some((x) => x.kind === 'dmg') });
    }
    expect(frames.slice(0, 7).every((x) => !x.dmg)).toBe(true); // walk 期恒不冲刷（喂 7 帧 ≥2）
    const switchIdx = frames.findIndex((x) => x.anim === 'basic');
    const dmgIdx = frames.findIndex((x) => x.dmg);
    expect(switchIdx).toBe(7);
    expect(dmgIdx).toBeGreaterThanOrEqual(switchIdx); // V4 方向：不早于切换帧
  });

  it('时序三 b 已在态兜底：入队时攻击者已是 basic（消费帧与切换帧错位，E1）→ 下一帧即冲刷', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'basic' }, { animState: 'idle' });
    feed(view, snap); // 首帧登记组首（prev 为空，无上升沿）
    expect(view.fx.filter((f) => f.kind === 'dmg')).toHaveLength(0);
    enqueueHit(view, 'hero', 'e1', String(7), true);
    feed(view, snap);
    expect(view.pendingHits).toHaveLength(0); // 无需「必须亲眼看到切换帧」
    expect(view.fx.some((f) => f.kind === 'dmg')).toBe(true);
  });
});

// ---------- R6 击杀不震冒字 ----------
describe('R6 击杀一击（E2）', () => {
  it('冲刷帧快照 target 已 dead → 数字仍冒（hp 减少即冒字），shakes 不含 target（单点判定）', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'idle' }, { animState: 'idle' });
    feed(view, snap);
    enqueueHit(view, 'hero', 'e1', String(20), true);
    snap.actors[0].animState = 'basic';
    snap.actors[1].animState = 'dead'; // doAttack 同步置 dead 且不可逆（battle-session:391-396）
    feed(view, snap);
    expect(view.fx.find((f) => f.kind === 'dmg')?.text).toBe('20');
    expect(view.shakes.has('e1')).toBe(false); // 死亡者不震动（需求 #4）
  });

  it('d 条件（攻击者 dead+target 同帧亡）：立即冲刷冒字不震（互杀帧形状）', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'idle' }, { animState: 'idle' });
    feed(view, snap);
    enqueueHit(view, 'hero', 'e1', String(12), true);
    snap.actors[0].animState = 'dead';
    snap.actors[1].animState = 'dead';
    feed(view, snap, 0.016);
    expect(view.pendingHits).toHaveLength(0);
    expect(view.fx.find((f) => f.kind === 'dmg')?.text).toBe('12');
    expect(view.shakes.has('e1')).toBe(false);
  });
});

// ---------- R7 同位错位不合并 ----------
describe('R7 同帧/近帧同目标错位不合并（PM 裁决②+Q2 滑动窗口）', () => {
  it('窗口内连续 spawn seq 0/1/2 → dx=0/6/12 且 text 各自保留；窗口过期归零 dx=0', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'basic' }, { animState: 'idle' });
    feed(view, snap); // 登记 basic（b 兜底路径冲刷，聚焦错位机制本身）
    const dmgOf = (text: string): { text?: string; dx?: number } | undefined =>
      view.fx.find((f) => f.kind === 'dmg' && f.text === text);
    enqueueHit(view, 'hero', 'e1', String(5), true);
    feed(view, snap);
    enqueueHit(view, 'hero', 'e1', String(6), true);
    feed(view, snap);
    expect(view.fx.filter((f) => f.kind === 'dmg')).toHaveLength(2);
    expect(dmgOf('5')?.text).toBe('5'); // 不合并数值
    expect(dmgOf('6')?.text).toBe('6');
    expect(dmgOf('5')?.dx).toBe(0); // seq=0
    expect(dmgOf('6')?.dx).toBe(DMG.staggerPx); // seq=1 → 6px
    for (let i = 0; i < 25; i++) feed(view, snap, 0.016); // +0.4s：滑动窗口内（at=上一条 spawn 时刻）
    enqueueHit(view, 'hero', 'e1', String(7), true);
    feed(view, snap);
    expect(dmgOf('7')?.dx).toBe(DMG.staggerPx * 2); // 滑动窗口语义（Q2 裁决）：seq 续累
    for (let i = 0; i < 40; i++) feed(view, snap, 0.016); // +0.64s：距上一条 >600ms（此前冒字已过寿命自然消亡）
    enqueueHit(view, 'hero', 'e1', String(8), true);
    feed(view, snap);
    expect(dmgOf('8')?.dx).toBe(0); // 窗口过期序号归零
  });
});

// ---------- R8 攻击者阵亡/deadline 兜底 ----------
describe('R8 挂死兜底（E10）', () => {
  it('c 超时边界：攻击者恒 idle（pendingAnim 永不触发形状）——1.45s 未冲刷、>1.5s 已冲刷（两侧小步喂防跨边界；恰等点浮点敏感不作断言）', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'idle' }, { animState: 'idle' });
    feed(view, snap);
    enqueueHit(view, 'hero', 'e1', String(9), true);
    for (let i = 0; i < 28; i++) feed(view, snap, 0.05); // 累计 1.4s
    expect(view.pendingHits).toHaveLength(1);
    expect(view.fx.some((f) => f.kind === 'dmg')).toBe(false);
    feed(view, snap, 0.05); // 1.45s < flushDeadlineSec
    expect(view.pendingHits).toHaveLength(1);
    feed(view, snap, 0.05); // ~1.5s
    feed(view, snap, 0.05); // ~1.55s > flushDeadlineSec → 冲刷
    expect(view.pendingHits).toHaveLength(0);
    expect(view.fx.some((f) => f.kind === 'dmg')).toBe(true); // 数字仍冒
  });

  it('d 条件：攻击者 animState=dead → 下一帧立即冲刷（远早于 deadline），受击者存活照常震动', () => {
    const view = createView();
    const snap = twoActorSnap({ animState: 'idle' }, { animState: 'idle' });
    feed(view, snap);
    enqueueHit(view, 'hero', 'e1', String(12), true);
    snap.actors[0].animState = 'dead'; // 同 tick 后续行动者反杀
    feed(view, snap, 0.016);
    expect(view.pendingHits).toHaveLength(0);
    expect(view.fx.find((f) => f.kind === 'dmg')?.text).toBe('12');
    expect(view.shakes.has('e1')).toBe(true); // target 存活 → 正常震动（与 R6 死亡分支互为对照）
  });
});

// ---------- R9 reset 清理 ----------
// R9 承载 = proto/battle_demo/behavior_e2e.mjs HF4（resetDemo 在宿主 main.ts，vitest 不可达——DoR 疑义 1 PM 裁决）。
// 此处仅登记索引，防用例清单缺号被误删。

// ---------- R10 红线自查 ----------
describe('R10 红线自查（V5/E5：禁碰文件源码锁+渲染层无 core/session import+DMG 组全表）', () => {
  const RENDER = readFileSync(path.join(ROOT, 'ui/battle-hex-render.ts'), 'utf8');
  const MAIN = readFileSync(path.join(ROOT, 'proto/battle_demo/main.ts'), 'utf8');
  const refRe = (name: string): RegExp =>
    new RegExp(`from\\s+['"][^'"]*${name}|require\\(\\s*['"][^'"]*${name}`);

  it('渲染层禁 import battle-core/battle-session（宿主中转模式，渲染文件零引用）', () => {
    expect(refRe('battle-core').test(RENDER)).toBe(false);
    expect(refRe('battle-session').test(RENDER)).toBe(false);
    expect(refRe('battle-core').test(MAIN)).toBe(false); // 宿主亦不经手 core（数值零计算）
  });

  it('休眠 hit 钩子字节存活：updateView hit fx 分支与 drawPieces shake 行原文不动（不删不接）', () => {
    expect(RENDER).toContain("view.fx.push({ kind: 'hit', x: w.x, y: w.y, t: 0, sec: FX.hitSec });");
    expect(RENDER).toContain("const shake = actor.animState === 'hit' ? Math.sin(view.time * 70) * 2 : 0;");
  });

  it('双处 T21 互指注释存在（防后人误判存在两套受击震动）', () => {
    expect(RENDER.split('【T21 受击反馈互指】').length - 1).toBe(2);
  });

  it('DMG 参数组 13 键与方案 §2.6 全等（L 环可调前的基线锁）', () => {
    expect(DMG).toEqual({
      sec: 0.6,
      risePx: 24,
      fontPerH: 0.026,
      fillColor: '#ffffff',
      strokeColor: '#1c1c1c',
      strokeWidth: 3,
      shakeSec: 0.2,
      shakePx: 3,
      shakeFreq: 55,
      staggerPx: 6,
      staggerWindowMs: 600,
      flushDeadlineSec: 1.5,
      missText: '闪避',
    });
  });
});
