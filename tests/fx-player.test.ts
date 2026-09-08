// ═══ T25 trial_fx_01 光影组合播放器（方案 §6 测试面）验收测试 ═══
// 真源：《光影组合试点方案-trial_fx_01-v0.1》§2/§3.1/§4.2/§5 + 《光影序列素材库》§6.1。
// 纯逻辑用例（时窗/帧序/终止清理）不依赖微信运行时与真实 Canvas：ctx 用记录型 stub，
// 图片用 {width,height} 结构 stub（FxImg 最小接口）。
// 素材接线用例：40 张实际 PNG 口径（Q-FX-01 裁决 B：L3 七逻辑帧剔 1 空帧，12+22+6）锁目录与清单。
// 运行：npm run test:battle（vitest，node 环境）。
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// vitest 运行时注入（vite-node）；node:fs / node:path 的最小类型声明见 env.d.ts（全局 ambient）
declare const __dirname: string;
import { FxCastGate, FxPlayer, findCastSnapshot, loadFxFramePack, pickLayerFrame, validateRecipe, type FxFramePack } from '../ui/fx-player';
import { TRIAL_FX_01, TRIAL_FX_FALLBACK_DURATION_MS } from '../config/battle-hex';
import { createHexBattle } from '../systems/battle-session';
import { offsetToAxial } from '../systems/hex';
import type { CombatantInput, FxRecipe, SkillDef } from '../types';

const ROOT = path.resolve(__dirname, '..');

// ---------- 基建：记录型 ctx stub（只记 drawImage/globalCompositeOperation/save/restore） ----------

interface DrawCall {
  img: { width: number; height: number };
  x: number;
  y: number;
  w: number;
  h: number;
}

function stubCtx() {
  const draws: DrawCall[] = [];
  const ops: string[] = []; // save/restore/composite 轨（泄漏断言用）
  let current = 'source-over';
  const ctx = {
    save: () => ops.push('save'),
    restore: () => {
      ops.push('restore');
      current = 'source-over';
    },
    drawImage: (img: { width: number; height: number }, x: number, y: number, w: number, h: number) => {
      draws.push({ img, x, y, w, h, composite: current } as DrawCall & { composite: string });
    },
    set globalCompositeOperation(v: string) {
      current = v;
      ops.push(`gco:${v}`);
    },
    get globalCompositeOperation(): string {
      return current;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, draws, ops };
}

/** 帧图 stub：宽=高=side（素材正方形帧口径）；pack 按 layer.frameDir+帧名填充 */
function stubPack(sideByLayer: Record<string, number>, missLayers: string[] = []): FxFramePack {
  const pack: FxFramePack = new Map();
  for (const layer of TRIAL_FX_01.layers) {
    for (const name of layer.frames) {
      const side = sideByLayer[layer.id] ?? 100;
      pack.set(`${layer.frameDir}/${name}`, missLayers.includes(layer.id) ? null : { width: side, height: side });
    }
  }
  return pack;
}

function recipeOver(over: Partial<FxRecipe>): FxRecipe {
  return { ...JSON.parse(JSON.stringify(TRIAL_FX_01)) as FxRecipe, ...over };
}

// ---------- 配方约束（方案 §2） ----------

describe('T25 · validateRecipe 配方约束', () => {
  it('TRIAL_FX_01 配方常量合法（零违规）', () => {
    expect(validateRecipe(TRIAL_FX_01)).toEqual([]);
  });

  it('时窗 0 ≤ start < end ≤ 1：start≥end / end>1 / start<0 均报违规', () => {
    const r = recipeOver({});
    r.layers[0].windowStart = 0.5;
    r.layers[0].windowEnd = 0.5; // start>=end
    r.layers[1].windowEnd = 1.2; // end>1
    r.layers[2].windowStart = -0.1; // start<0
    const errs = validateRecipe(r).join(' ');
    expect(errs).toContain('layers[0]');
    expect(errs).toContain('layers[1]');
    expect(errs).toContain('layers[2]');
  });

  it('frames 空数组 / scale ≤ 0 / blendMode ≠ lighter 均报违规', () => {
    const r = recipeOver({});
    r.layers[0].frames = [];
    r.layers[1].scale = 0;
    (r.layers[2].blendMode as string) = 'source-over';
    const errs = validateRecipe(r).join(' ');
    expect(errs).toContain('layers[0]');
    expect(errs).toContain('layers[1]');
    expect(errs).toContain('layers[2]');
  });

  it('结构枚举：durationSource/anchor 只收方案口径两值', () => {
    const r = recipeOver({ durationSource: 'free' as FxRecipe['durationSource'], anchor: 'targetCell' as FxRecipe['anchor'] });
    const errs = validateRecipe(r).join(' ');
    expect(errs).toContain('durationSource');
    expect(errs).toContain('anchor');
  });
});

// ---------- 帧选择（方案 §2/§5.1：左闭右开 + 末段层夹取末帧） ----------

describe('T25 · pickLayerFrame 时窗与帧序', () => {
  const T = 3000; // 演示口径 T=3000ms（castDurationMs 缺省合成 0.8+0.2=1.0 → 3000）

  it('t < windowStart 返回 -1（该层不画）', () => {
    // L2 窗 [0.35, 0.90)：t=0.34T 未进窗
    expect(pickLayerFrame(22, 0.35, 0.9, 0.34 * T, T)).toBe(-1);
  });

  it('窗内等分帧序：t=windowStart 恰帧 0（左闭）；帧号随 progress 单调推进', () => {
    expect(pickLayerFrame(22, 0.35, 0.9, 0.35 * T, T)).toBe(0); // 左闭
    expect(pickLayerFrame(22, 0.35, 0.9, 0.35 * T + 1, T)).toBe(0); // 帧宽=0.55T/22=75ms
    expect(pickLayerFrame(22, 0.35, 0.9, 0.35 * T + 100, T)).toBe(1); // 等分推进（断言避开浮点帧界）
    expect(pickLayerFrame(12, 0, 0.45, 0, T)).toBe(0); // L1 从 t=0 起
    expect(pickLayerFrame(12, 0, 0.45, 0.44 * T, T)).toBe(11); // 窗尾邻域=末帧
  });

  it('L1/L2 窗尾右开：t ≥ windowEnd 停播（-1），不定格残留', () => {
    expect(pickLayerFrame(12, 0, 0.45, 0.45 * T, T)).toBe(-1);
    expect(pickLayerFrame(22, 0.35, 0.9, 0.9 * T, T)).toBe(-1);
  });

  it('末段层 windowEnd=1（L3 [.78T, T] 闭）：窗内等分，夹取末帧播到 T（浮点尾帧不丢）', () => {
    expect(pickLayerFrame(6, 0.78, 1, 0.77 * T, T)).toBe(-1); // 未进窗
    expect(pickLayerFrame(6, 0.78, 1, 0.78 * T, T)).toBe(0); // 左闭
  });

  it('L3 等分精确值：帧宽=0.22T/6=110ms，t=0.78T+330ms → 帧 3', () => {
    expect(pickLayerFrame(6, 0.78, 1, 0.78 * T + 330, T)).toBe(3);
    expect(pickLayerFrame(6, 0.78, 1, T - 1, T)).toBe(5); // T 前一瞬仍末帧
    expect(pickLayerFrame(6, 0.78, 1, T, T)).toBe(5); // t=T 夹取末帧
  });

  it('越界防御：frameCount=0 / durationMs=0 返回 -1 不抛', () => {
    expect(pickLayerFrame(0, 0, 1, 0, 1000)).toBe(-1);
    expect(pickLayerFrame(6, 0.78, 1, 100, 0)).toBe(-1);
  });
});

// ---------- 生命周期（方案 §3.1/§5.2：start/update/draw/clear；死亡不截断；重建清空） ----------

describe('T25 · FxPlayer 生命周期', () => {
  const T_LEN = 3000;

  it('start 返回实例 ID 单调不复用；update 到期清理（播完 t0+T 即收，不提前）', () => {
    const p = new FxPlayer(stubPack({}));
    const t0 = 100;
    const id1 = p.start(TRIAL_FX_01, { x: 0, y: 0 }, t0, T_LEN);
    const id2 = p.start(TRIAL_FX_01, { x: 0, y: 0 }, t0, T_LEN);
    expect(id1).not.toBe(id2); // ID 不复用
    expect(p.activeCount).toBe(2);
    p.update(t0 + (T_LEN - 1) / 1000); // update 收秒（演出钟），T_LEN 为毫秒
    expect(p.activeCount).toBe(2); // T 前不截断（死亡/终局不回滚——实例照常在）
    p.update(t0 + T_LEN / 1000);
    expect(p.activeCount).toBe(0); // 播完 t0+T 清理
  });

  it('三层时窗叠加：重叠区按层各画一帧（lighter 叠加面），非重叠区单层/零层', () => {
    const p = new FxPlayer(stubPack({}));
    const t0 = 0;
    p.start(TRIAL_FX_01, { x: 0, y: 0 }, t0, 1000);
    const { ctx, draws } = stubCtx();
    // t=0.2T：仅 L1（窗 [0,0.45)）
    p.update(0.2); // 秒（T=1000ms）
    p.draw(ctx, { x: 0, y: 0 }, 375, 667);
    expect(draws.length).toBe(1);
    // t=0.4T：L1+L2 重叠（[0.35,0.45)∩[0,0.45)）
    draws.length = 0;
    p.update(0.4);
    p.draw(ctx, { x: 0, y: 0 }, 375, 667);
    expect(draws.length).toBe(2);
    // t=0.5T：仅 L2
    draws.length = 0;
    p.update(0.5);
    p.draw(ctx, { x: 0, y: 0 }, 375, 667);
    expect(draws.length).toBe(1);
    // t=0.8T：L2+L3 重叠（[0.78,0.90)）
    draws.length = 0;
    p.update(0.8);
    p.draw(ctx, { x: 0, y: 0 }, 375, 667);
    expect(draws.length).toBe(2);
    // t=0.95T：仅 L3（末段层夹取末帧）
    draws.length = 0;
    p.update(0.95);
    p.draw(ctx, { x: 0, y: 0 }, 375, 667);
    expect(draws.length).toBe(1);
  });

  it('绘制形态：lighter 经 save/restore 包围不泄漏；中心对齐 ×scale（L2=150×1.4=210）', () => {
    const p = new FxPlayer(stubPack({ L1: 350, L2: 150, L3: 150 }));
    p.start(TRIAL_FX_01, { x: 100, y: 200 }, 0, 1000);
    const { ctx, draws, ops } = stubCtx();
    p.update(0.4); // L1+L2
    p.draw(ctx, { x: 10, y: 20 }, 375, 667);
    // save/restore 与层绘制一一配对；restore 后回 source-over（无泄漏）
    expect(ops.filter((o) => o === 'save').length).toBe(2);
    expect(ops.filter((o) => o === 'restore').length).toBe(2);
    expect(draws.every((d) => (d as DrawCall & { composite: string }).composite === 'lighter')).toBe(true);
    // 屏幕锚 = 世界锚 − cam + 视口/2（渲染层 drawFrame 同款换算）
    const cxBase = 100 - 10 + 375 / 2;
    const cyBase = 200 - 20 + 667 / 2;
    // L2：img 150² ×1.4=210，中心对齐
    const l2 = draws[1];
    expect(l2.w).toBe(210);
    expect(l2.h).toBe(210);
    expect(l2.x).toBe(Math.round(cxBase - 210 / 2));
    expect(l2.y).toBe(Math.round(cyBase - 210 / 2));
    // anchorOffsetPx=0 默认：L1 锚同点，350×0.5=175
    const l1 = draws[0];
    expect(l1.w).toBe(175);
    expect(l1.h).toBe(175);
    expect(l1.x).toBe(Math.round(cxBase - 175 / 2));
    expect(l1.y).toBe(Math.round(cyBase - 175 / 2));
  });

  it('缺图跳帧：该帧 null 槽跳过不抛，其余层照画', () => {
    const p = new FxPlayer(stubPack({}, ['L2'])); // L2 全缺
    p.start(TRIAL_FX_01, { x: 0, y: 0 }, 0, 1000);
    const { ctx, draws } = stubCtx();
    p.update(0.4); // 本应 L1+L2
    expect(() => p.draw(ctx, { x: 0, y: 0 }, 375, 667)).not.toThrow();
    expect(draws.length).toBe(1); // L1 照画，L2 跳帧
  });

  it('clear(id) 单实例清除；clearAll 全清（session 重建语义）；ID 仍不复用', () => {
    const p = new FxPlayer(stubPack({}));
    const a = p.start(TRIAL_FX_01, { x: 0, y: 0 }, 0, 1000);
    const b = p.start(TRIAL_FX_01, { x: 0, y: 0 }, 0, 1000);
    p.clear(a);
    expect(p.activeCount).toBe(1);
    p.start(TRIAL_FX_01, { x: 0, y: 0 }, 0, 1000);
    expect(p.start(TRIAL_FX_01, { x: 0, y: 0 }, 0, 1000)).toBeGreaterThan(b); // seq 单调
    p.clearAll();
    expect(p.activeCount).toBe(0);
  });
});

// ---------- 预载器（方案 §4.2：注入式，全部 settle；缺图告警+null 槽） ----------

describe('T25 · loadFxFramePack 注入式预载', () => {
  it('40 张全部请求；全就绪 missing=[]；失败帧 null 槽+missing 记路径+数量字段', async () => {
    const requested: string[] = [];
    const loadImage = async (url: string): Promise<{ width: number; height: number } | null> => {
      requested.push(url);
      return url.includes('125-1_f06') ? null : { width: 150, height: 150 };
    };
    const { pack, missing, expectedCount, loadedCount } = await loadFxFramePack(TRIAL_FX_01, loadImage);
    expect(requested.length).toBe(40); // 12+22+6
    expect(pack.size).toBe(40);
    expect(missing).toEqual(['assets/ui/fx/trial_fx_01/L3/125-1_f06.png']);
    expect(pack.get('assets/ui/fx/trial_fx_01/L3/125-1_f06.png')).toBeNull();
    expect(expectedCount).toBe(40);
    expect(loadedCount).toBe(39);
  });

  it('【T25-R2 缺陷 2】注入 loader reject 收敛为 null 槽+warn：预载 Promise 链不失败', async () => {
    const loadImage = async (url: string): Promise<{ width: number; height: number } | null> => {
      if (url.includes('14-1_f01')) throw new Error('decode boom'); // reject 路径（非 resolve null）
      return { width: 150, height: 150 };
    };
    const { pack, missing, expectedCount, loadedCount } = await loadFxFramePack(TRIAL_FX_01, loadImage);
    expect(pack.get('assets/ui/fx/trial_fx_01/L2/14-1_f01.png')).toBeNull(); // 收敛为缺帧槽
    expect(missing).toEqual(['assets/ui/fx/trial_fx_01/L2/14-1_f01.png']);
    expect(expectedCount).toBe(40);
    expect(loadedCount).toBe(39); // 数量不符显式暴露（DoD 断言面）
  });

  it('非法配方 fail-fast throw（进场阶段暴露，不进战斗中途）', async () => {
    const bad = recipeOver({});
    bad.layers[0].windowEnd = 2;
    await expect(loadFxFramePack(bad, async () => null)).rejects.toThrow(/非法/);
  });
});

// ---------- 素材接线一致性（Q-FX-01 裁决 B：40 张实际 PNG=12+22+6） ----------

describe('T25 · 素材目录与配方一致（40 张口径）', () => {
  const FX_DIR = path.join(ROOT, 'assets/ui/fx/trial_fx_01');

  it('L1=12 / L2=22 / L3=6 张，目录文件名与配方 frames 数组逐一对应', () => {
    const counts: Record<string, number> = { L1: 12, L2: 22, L3: 6 };
    for (const layer of TRIAL_FX_01.layers) {
      const dir = path.join(FX_DIR, layer.id);
      expect(existsSync(dir)).toBe(true);
      const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
      expect(files).toEqual([...layer.frames].sort()); // 配方与目录零漂移
      expect(files.length).toBe(counts[layer.id]);
    }
  });

  it('SHA256SUMS.txt 恰 40 行且每行指向存在的 PNG', () => {
    const sums = readFileSync(path.join(FX_DIR, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
    expect(sums.length).toBe(40);
    for (const line of sums) {
      const [hash, rel] = line.trim().split(/\s+/);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(existsSync(path.join(FX_DIR, rel))).toBe(true);
    }
  });
});

// ---------- 触发矩阵（T25-R2 缺陷 1：真 session 四路径 × FxCastGate，事件流驱动） ----------
// 口径：方案 §5.1「accepted cast 的 t0 必启动一次，非伤害事件监听」——段 1 命中发 skill /
// 闪避发 miss / 空放发 skill / 致死终局 cast 挪 presentationCasts，四路径 gate 均恰启动一次，
// 且 findCastSnapshot 合并队列（pending+presentation）必可达（T=快照差值，禁重算）。

/**
 * 宿主事件循环同构（T26-R1 身份制，触发矩阵/同刻重入矩阵共用）：先 findCastSnapshot 配 cast
 * 身份（core 快照唯一真值），再过 gate；放行则 commitStart 登记身份。cast=null 仅段 1 致胜
 * 终局（AS-9 cast 未及入队）——gate 无快照分支放行，durMs 走表现域兜底（与 main.ts 同谓词）。
 */
function driveGate(s: ReturnType<typeof createHexBattle>, gate: FxCastGate): Array<{ evT: number; durMs: number | null }> {
  const starts: Array<{ evT: number; durMs: number | null }> = [];
  const casts = [...s._debug.pendingCasts(), ...s._debug.presentationCasts()];
  for (const e of s.events) {
    if ((e.type === 'skill' || e.type === 'miss') && e.actorId && e.skillId) {
      const cast = findCastSnapshot(casts, e.actorId, e.skillId, e.t);
      if (!gate.shouldStart(e, cast)) continue;
      const durMs = cast ? Math.round((cast.finishAtSec - cast.startedAtSec) * 1000) : TRIAL_FX_FALLBACK_DURATION_MS;
      gate.commitStart(e.actorId, cast ? cast.startedAtSec : e.t, durMs, e.skillId); // 登记身份
      starts.push({ evT: e.t, durMs });
    }
  }
  return starts;
}

describe('T25-R2 · 触发矩阵：命中/全 miss/空放/段 1 致死终局 四路径 FX 均启动一次', () => {
  const teSkill = (over: Partial<SkillDef> = {}): SkillDef => ({
    id: 'te', name: '特技', kind: 'special', weapon: 'sword',
    grade: 1.7, growth: 3, level: 20, cooldownTurns: 2, neiliCost: 10,
    ...over,
  });
  function unit(over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side'>): CombatantInput {
    return {
      name: over.id,
      hp: 999999, maxHp: 999999,
      neili: 60, maxNeili: 100,
      atk: 12, def: 3,
      neigongLevel: 0, jimin: 0, danshi: 0, shizhan: 0,
      pos: { x: 0, y: 0 }, weapon: 'sword', skills: [],
      ...over,
    };
  }
  /** 布点（offset col/row → axial；hero=可动区左下 (4,13)，敌默认同行 col+2=cube 距 2） */
  function place(s: ReturnType<typeof createHexBattle>, id: string, col: number, row: number, over: Partial<CombatantInput> = {}): void {
    const u = s._debug.units.find((x) => x.id === id)!;
    const hex = offsetToAxial(col, row);
    u.hex = { ...hex };
    u.renderQ = hex.q; u.renderR = hex.r; u.moveFromQ = hex.q; u.moveFromR = hex.r;
    u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0;
    u.pendingAnim = null; u.movePath = []; u.bar = 0; u.barWasMax = false; u.dead = false;
    Object.assign(u, over);
    if (u.hp <= 0) u.hp = 50;
  }
  function makeSession(heroOver: Partial<CombatantInput>, foeOver: Partial<CombatantInput>) {
    return createHexBattle({
      player: unit({ id: 'p', side: 'player', skills: [teSkill()], ...heroOver }),
      enemies: [unit({ id: 'e1', side: 'enemy', ...foeOver })],
      mode: 'manual',
      seed: 42,
    });
  }
  function ready(s: ReturnType<typeof createHexBattle>): void {
    const hero = s._debug.units.find((x) => x.id === 'p')!;
    hero.bar = 100;
    s.tick(0.001);
  }

  it('路径 1 命中：skill 事件 → 启动 1 次，T=快照差值（恒命中 harness：shizhan=15_000_000）', () => {
    const s = makeSession({ shizhan: 15_000_000 }, {});
    place(s, 'p', 4, 13);
    place(s, 'e1', 6, 13);
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true); // 选中态=cast 受理前提(BE1 同款)
    expect(s.submit({ type: 'cast', to: offsetToAxial(6, 13), skillId: 'te' })).toBe(true);
    const kinds = s.events.map((e) => e.type);
    expect(kinds).toContain('skill');
    expect(kinds).not.toContain('miss');
    // 推进到 t1：段 2 结算再发 skill 事件（t=finishAtSec，AS-4）——gate 必须判别拦截（浏览器实证回归锁）
    for (let i = 0; i < 100 && s.events.filter((e) => e.type === 'skill').length < 2; i++) s.tick(0.05);
    expect(s.events.filter((e) => e.type === 'skill').length).toBeGreaterThanOrEqual(2); // 段 1+段 2 事件俱在
    const gate = new FxCastGate(new Set(['te']));
    const starts = driveGate(s, gate);
    expect(starts.length).toBe(1); // 段 1+段 2 全事件流恰一次启动
    expect(starts[0].durMs).toBe(3000); // castSpeed 缺省合成 1.0 → 3000ms
  });

  it('路径 2 全 miss：只发 miss 事件（缺陷 1 修复点）→ 仍启动 1 次（hitRate<0 恒 miss harness）', () => {
    // shizhan=-85_000_001 → hitRate=0.85-0.85000001<0 → rng()>=hitRate 恒真 → 首掷恒 miss（F-04）
    const s = makeSession({ shizhan: -85_000_001 }, {});
    place(s, 'p', 4, 13);
    place(s, 'e1', 6, 13);
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.submit({ type: 'cast', to: offsetToAxial(6, 13), skillId: 'te' })).toBe(true);
    const kinds = s.events.map((e) => e.type);
    expect(kinds).not.toContain('skill'); // 全闪避：无 skill 事件可挂（旧实现缺口）
    expect(kinds).toContain('miss');
    const gate = new FxCastGate(new Set(['te']));
    const starts = driveGate(s, gate);
    expect(starts.length).toBe(1); // miss 双源兜住：仍恰启动一次
    expect(starts[0].durMs).toBe(3000);
  });

  it('路径 3 空放：射程内无存活敌 → 无目标 skill 事件 → 启动 1 次', () => {
    const s = makeSession({ shizhan: 15_000_000 }, {});
    place(s, 'p', 4, 13);
    place(s, 'e1', 11, 2); // 拉到对角：t0 圈内无敌（AS-6 空放）
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.submit({ type: 'cast', to: offsetToAxial(6, 13), skillId: 'te' })).toBe(true); // 点射程内空格=空放受理（BE2 口径）
    const skillEvs = s.events.filter((e) => e.type === 'skill');
    expect(skillEvs.length).toBe(1);
    expect(skillEvs[0].targetId).toBeUndefined(); // 无目标空放事件
    const gate = new FxCastGate(new Set(['te']));
    const starts = driveGate(s, gate);
    expect(starts.length).toBe(1);
    expect(starts[0].durMs).toBe(3000);
  });

  it('路径 4 段 1 致死终局：skill+death 事件、phase=won、cast 入 presentationCasts → 仍启动 1 次', () => {
    const s = makeSession({ shizhan: 15_000_000, atk: 999 }, { hp: 1, maxHp: 1 }); // 段 1 必杀
    place(s, 'p', 4, 13);
    place(s, 'e1', 6, 13);
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.submit({ type: 'cast', to: offsetToAxial(6, 13), skillId: 'te' })).toBe(true);
    const kinds = s.events.map((e) => e.type);
    expect(kinds).toContain('skill');
    expect(kinds).toContain('death');
    expect(kinds).toContain('win'); // 唯一敌段 1 阵亡 → 立即终局（AS-9）
    expect(s.phase).toBe('won');
    const gate = new FxCastGate(new Set(['te']));
    const starts = driveGate(s, gate); // 合并队列含 presentationCasts（终局挪入）
    expect(starts.length).toBe(1);
    expect(starts[0].durMs).toBe(3000);
  });

  it('gate 去重（T26-R1 身份制）：段 1 双源/多目标只首条 true；段 2/身份不符拦截；同刻重入新 cast 凭身份放行；reset 清键', () => {
    // 【T26-R1 改写声明】本用例由 T25-R2 时间窗启发式调用形态改写为身份配对形态——断言语义
    // 一一对应不变（首条放行/双源去重/段 2 拦截/新 cast 放行/reset 清键）；根因=seq=169 证伪：
    // 同刻重入下「旧 t1==新 t0」无法从事件四元组区分，启发式时间窗误拦新 cast。
    const gate = new FxCastGate(new Set(['te']));
    const cast1 = { actorId: 'p', skillId: 'te', startedAtSec: 5.0, finishAtSec: 8.0 };
    const seg1 = { type: 'skill', actorId: 'p', skillId: 'te', t: 5.0 };
    expect(gate.shouldStart(seg1, cast1)).toBe(true); // 段 1 首条（身份未登记）
    gate.commitStart('p', 5.0, 3000, 'te');
    expect(gate.shouldStart({ ...seg1, type: 'miss' }, cast1)).toBe(false); // 同 cast 段 1 的 miss 事件（双源/多目标）
    expect(gate.shouldStart({ ...seg1 }, cast1)).toBe(false); // 段 1 重复 feed
    expect(gate.shouldStart({ ...seg1, t: 8.0 }, null)).toBe(false); // 段 2 结算事件（快照已收口，配不到=非段 1 必拦）
    expect(gate.shouldStart({ ...seg1, t: 8.0, type: 'miss' }, null)).toBe(false); // 段 2 的 miss 形态同拦
    expect(gate.shouldStart({ ...seg1, type: 'basic' }, cast1)).toBe(false); // 非双源事件
    expect(gate.shouldStart({ ...seg1, skillId: 'jue' }, null)).toBe(false); // 非特功
    // 【T26-R1 · seq=169 P1 修复本体】同刻重入：新 cast t0 == 旧 cast t1=8.0——凭自身快照身份
    // 放行（旧时间窗启发式此处把新 cast 段 1 误判为旧 cast 段 2 而误拦）
    const cast2 = { actorId: 'p', skillId: 'te', startedAtSec: 8.0, finishAtSec: 11.0 };
    expect(gate.shouldStart({ ...seg1, t: 8.0 }, cast2)).toBe(true);
    gate.commitStart('p', 8.0, 3000, 'te');
    expect(gate.shouldStart({ ...seg1, t: 8.0 }, cast2)).toBe(false); // cast2 段 1 双源/重放去重
    expect(gate.shouldStart({ ...seg1, t: 11.0 }, { ...cast2, startedAtSec: 11.0, finishAtSec: 14.0 })).toBe(true); // 串接第二跳（t0==cast2 t1）
    gate.commitStart('p', 11.0, 3000, 'te');
    expect(gate.shouldStart({ ...seg1, t: 9.99 }, { ...cast2, startedAtSec: 9.99, finishAtSec: 12.99 })).toBe(true); // 窗外新 cast（t0 未登记）放行（旧用例同语义）
    gate.reset();
    expect(gate.shouldStart(seg1, cast1)).toBe(true); // 跨局清键后重新放行
  });

  it('gate 无快照分支：段 1 致胜终局（AS-9 无快照）放行；段 2 同技拦/换技放行', () => {
    const gate = new FxCastGate(new Set(['te', 'jue']));
    // (a) 无任何登记：段 1 致胜终局首条事件（cast 未及入队）→ 放行（T25 路径 4 语义保持）
    expect(gate.shouldStart({ type: 'skill', actorId: 'p', skillId: 'jue', t: 5.0 }, null)).toBe(true);
    gate.commitStart('p', 5.0, 3000, 'jue');
    // (b) 已登记后：同技事件撞已启动 cast 的 t1 → 段 2（保守拦，不可区分角落回执声明）
    expect(gate.shouldStart({ type: 'skill', actorId: 'p', skillId: 'jue', t: 8.0 }, null)).toBe(false);
    // (a') 同刻撞前 cast t1 但换技（te 冷却轮换的 AI 连放形态）→ 无快照新 cast 段 1 → 放行
    expect(gate.shouldStart({ type: 'skill', actorId: 'p', skillId: 'te', t: 8.0 }, null)).toBe(true);
    gate.commitStart('p', 8.0, 3000, 'te');
    expect(gate.shouldStart({ type: 'miss', actorId: 'p', skillId: 'te', t: 8.0 }, null)).toBe(false); // 新 cast 段 1 双源
  });
});

// ---------- T26-R1 · 同刻重入矩阵（seq=169 P1 回归锁） ----------
// 口径：自动模式下 drainDueCasts 收口旧 cast（释放施法锁）后，同一 tick BAR-2 ready 轮转即可
// 受理新 cast（bar 施法期回满 clamp 100）→ 新 t0 == 旧 t1 同刻。本矩阵锁三个语义：
// ① 纯事件流串接 N cast（含全 miss 旧 cast/换技组合）每次恰启动一次；
// ② 真 session auto 模式 AI 连放（含同刻重入形态）不哑火；
// ③ 全 miss 连放不污染后续 cast。

describe('T26-R1 · 同刻重入矩阵', () => {
  /** 纯事件流串接驱动：N cast 同刻串接（新 t0==旧 t1），宿主同构 find-first→gate→commitStart */
  function driveChained(seq: Array<{ skillId: string; missOnly: boolean }>): number {
    const gate = new FxCastGate(new Set(['te', 'jue']));
    const casts: Array<{ actorId: string; skillId: string; startedAtSec: number; finishAtSec: number }> = [];
    const events: Array<{ type: string; actorId: string; skillId: string; t: number }> = [];
    let t0 = 5.0;
    for (const s of seq) {
      const T = 3.0;
      casts.push({ actorId: 'p', skillId: s.skillId, startedAtSec: t0, finishAtSec: t0 + T });
      const t1 = t0 + T;
      const seg1 = s.missOnly ? 'miss' : 'skill'; // 全 miss=段 1 只有 miss 事件；命中=skill（双源另一形态一并喂）
      events.push({ type: seg1, actorId: 'p', skillId: s.skillId, t: t0 });
      events.push({ type: seg1 === 'skill' ? 'miss' : 'skill', actorId: 'p', skillId: s.skillId, t: t0 }); // 双源/多目标第二发
      events.push({ type: 'skill', actorId: 'p', skillId: s.skillId, t: t1 }); // 段 2（t1==串接时即下一 cast t0）
      events.push({ type: 'miss', actorId: 'p', skillId: s.skillId, t: t1 }); // 段 2 另一目标形态
      t0 = t1; // 同刻串接
    }
    let starts = 0;
    const keys = new Set<string>();
    for (const e of events) {
      const cast = findCastSnapshot(casts, 'p', e.skillId, e.t);
      if (!gate.shouldStart(e, cast)) continue;
      gate.commitStart('p', cast ? cast.startedAtSec : e.t, 3000, e.skillId);
      keys.add(`p|${cast ? cast.startedAtSec : e.t}`);
      starts += 1;
    }
    expect(keys.size).toBe(starts); // 每次启动身份互异（一次 accepted cast 恰一次）
    return starts;
  }

  it('纯事件流：同技连放 N=6（全 miss 交替）每次恰启动一次', () => {
    const seq = Array.from({ length: 6 }, (_, i) => ({ skillId: 'te', missOnly: i % 2 === 1 }));
    expect(driveChained(seq)).toBe(6);
  });

  it('纯事件流：换技连放（te/jue 冷却轮换形态）+ 全 miss 旧 cast + 紧接新 cast 组合，N=6 恰启动一次', () => {
    const seq = [
      { skillId: 'jue', missOnly: false },
      { skillId: 'te', missOnly: true }, // 全 miss 旧 cast
      { skillId: 'jue', missOnly: false }, // 紧接新 cast（同刻）
      { skillId: 'te', missOnly: true },
      { skillId: 'jue', missOnly: false },
      { skillId: 'te', missOnly: false },
    ];
    expect(driveChained(seq)).toBe(6);
  });

  /** auto 真 session 连放 harness：主角 te+jue、大血敌（不终局），tick 驱动 N 秒后全事件流过门 */
  function autoChainSession(): ReturnType<typeof createHexBattle> {
    const skills: SkillDef[] = [
      { id: 'te', name: '特技', kind: 'special', weapon: 'sword', grade: 1.3, growth: 3, level: 20, cooldownTurns: 2, neiliCost: 10 },
      { id: 'jue', name: '绝学', kind: 'ultimate', weapon: 'sword', grade: 1.7, growth: 3, level: 20, cooldownTurns: 5, neiliCost: 20 },
    ];
    const mk = (over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side'>): CombatantInput => ({
      name: over.id,
      hp: 999999, maxHp: 999999,
      neili: 60, maxNeili: 100,
      atk: 12, def: 3,
      neigongLevel: 0, jimin: 0, danshi: 0, shizhan: 15_000_000,
      pos: { x: 0, y: 0 }, weapon: 'sword', skills: [],
      ...over,
    });
    // 同刻重入机制（seq=169 实证路径）：hero jimin=300 → fillRate=40/s（F-05），3s 施法期内
    // 行动条回满 clamp 100 → t1 收口（drainDueCasts 释放施法锁）后同一 tick BAR-2 ready 轮转
    // 即受理新 cast——新 t0 == 旧 t1 同刻串接，正是旧时间窗启发式误拦的形态。
    const s = createHexBattle({
      player: mk({ id: 'p', side: 'player', skills, jimin: 300 }),
      enemies: [mk({ id: 'e1', side: 'enemy' })],
      mode: 'auto', // 双侧 AI：hero 自动出技（planSkill 品阶降序 jue>te，冷却轮换）
      seed: 42,
    });
    // 摆位（offset col/row → axial）：hero(4,13) / e1(6,13) cube 2=射程内，敌大血不终局
    const hex = offsetToAxial(4, 13);
    const p = s._debug.units.find((x) => x.id === 'p')!;
    p.hex = { ...hex };
    p.renderQ = hex.q; p.renderR = hex.r; p.moveFromQ = hex.q; p.moveFromR = hex.r; p.moveT = 1; p.movePath = [];
    p.jimin = 300; // fillRate=40/s：施法期内 bar 回满 → t1 同刻重入（见上机制注）
    const foe = offsetToAxial(6, 13);
    const e1 = s._debug.units.find((x) => x.id === 'e1')!;
    e1.hex = { ...foe };
    e1.renderQ = foe.q; e1.renderR = foe.r; e1.moveFromQ = foe.q; e1.moveFromR = foe.r; e1.moveT = 1; e1.movePath = [];
    return s;
  }

  it('真 session auto 连放：AI 持续出技不哑火（≥6 次），含同刻重入（相邻启动间隔==T）', () => {
    const s = autoChainSession();
    for (let i = 0; i < 1200 && s.phase === 'fighting'; i++) s.tick(0.05); // 60s 模拟
    const gate = new FxCastGate(new Set(['te', 'jue']));
    const starts = driveGate(s, gate).filter((st) => st.durMs !== null);
    expect(starts.length).toBeGreaterThanOrEqual(6); // 持续出技不哑火（旧缺陷=同刻重入后永不再启动）
    expect(starts.every((st) => st.durMs === 3000)).toBe(true); // T=快照差值（缺省出招合成 0.8 → 3000ms）
    // 同刻重入证据：存在相邻两次启动间隔==T（±60ms，emitAt 2 位取整容差）——旧 t1 同刻受理新 cast 且未丢
    //（AI 品阶轮换 jue→te 相邻两动作皆出招：前一 cast t1 收口同 tick 受理 te，事件 t 相同）
    const gaps: number[] = [];
    for (let i = 1; i < starts.length; i++) gaps.push(+(starts[i].evT - starts[i - 1].evT).toFixed(3));
    expect(gaps.some((g) => Math.abs(g - 3.0) <= 0.06)).toBe(true);
  });

  it('真 session auto 全 miss 连放：shizhan 负值恒 miss，连放不因全 miss 污染（≥3 次恰启动）', () => {
    const s = autoChainSession();
    const hero = s._debug.units.find((x) => x.id === 'p')!;
    hero.shizhan = -85_000_001; // hitRate<0 恒 miss（F-04 首掷恒 miss harness）
    for (let i = 0; i < 1200 && s.phase === 'fighting'; i++) s.tick(0.05); // 60s 模拟
    const gate = new FxCastGate(new Set(['te', 'jue']));
    const starts = driveGate(s, gate).filter((st) => st.durMs !== null);
    expect(starts.length).toBeGreaterThanOrEqual(3); // 全 miss 不哑火（miss 双源兜住 + 同刻重入不误拦）
  });
});
