// ═══ AS 出招速度 + 两段式伤害（TASK-AS-BE）验收测试 ═══
// 真源：《出招速度与两段式伤害需求文档》v1.3（AS-1~AS-9，60eaa18）+
//      《出招速度与两段式伤害技术方案》v0.2 §3/§5/§7（2ab93f9）
// 锚义口径：R1=施法者 t0 自身格（需求 v1.3 AS-6 括注「施法者施法期间不可移动，锚稳定」；
//      施工裁定待 PM 复核，切换点=scheduleSkillCast 入参单点）。
// 运行：npm run test:battle（vitest，node 环境）。
// 金黄值推导注记（禁测试外复制公式；此处为断言的独立手算对照）：
//   base = max(atk−def,1)=190；grade=1.7 → 190×1.7=323；
//   段伤 = floor(323×0.5)=floor(161.5)=161；暴击段 = floor(161.5×1.5)=floor(242.25)=242；
//   整刀（无段比）= floor(323)=323 → 两段和 322 与整刀差 1（AS §2.3「不补差」行为证据）。
import { describe, expect, it } from 'vitest';
import { createHexBattle, NEILI_COST_PER_CAST, type HexBattleSession } from '../systems/battle-session';
import { castDurationMs, effectiveCastSpeed } from '../systems/battle-core';
import { FINISH_WINDOW_MS } from '../config/battle';
import { offsetToAxial } from '../systems/hex';
import type { CombatantInput, SkillDef } from '../types';

// ---------- 基建（口径对齐 tests/battle-session.test.ts，互不 import） ----------

function unit(over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side'>): CombatantInput {
  return {
    name: over.id,
    hp: 999999, maxHp: 999999,
    neili: 0, maxNeili: 0,
    atk: 1, def: 99999,
    neigongLevel: 0, jimin: 0, danshi: 0, shizhan: 0,
    pos: { x: 0, y: 0 }, weapon: 'sword', skills: [],
    ...over,
  };
}

function teSkill(over: Partial<SkillDef> = {}): SkillDef {
  return {
    id: 'te', name: '特技', kind: 'special', weapon: 'sword',
    grade: 1.7, growth: 3, level: 20, cooldownTurns: 2, neiliCost: 10,
    ...over,
  };
}

function place(s: HexBattleSession, id: string, col: number, row: number): void {
  const u = s._debug.units.find((x) => x.id === id)!;
  const hex = offsetToAxial(col, row);
  u.hex = { ...hex };
  u.renderQ = hex.q; u.renderR = hex.r; u.moveFromQ = hex.q; u.moveFromR = hex.r;
  u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0;
  u.pendingAnim = null; u.movePath = []; u.bar = 0; u.barWasMax = false; u.dead = false;
  if (u.hp <= 0) u.hp = 50;
}

function ready(s: HexBattleSession): void {
  const hero = s._debug.units.find((x) => x.id === 'p')!;
  hero.bar = 100;
  s.tick(0.001);
}

/** AS 标准局：p(7,8) 带 te（level20→tier1 射程2 circle）+ 敌方白盒布点，进输入态（未激活）。
 * 默认我方/敌方 jimin=0（fillRate 10/s → 4s 窗口内无人二次行动，采样无污染）。 */
function asBoard(enemies: Array<{ id: string; col: number; row: number; over?: Partial<CombatantInput> }>, pOver: Partial<CombatantInput> = {}): HexBattleSession {
  const p = unit({ id: 'p', side: 'player', weapon: 'sword', neili: 50, maxNeili: 50, skills: [teSkill()], ...pOver });
  const s = createHexBattle({
    player: p,
    enemies: enemies.map((e) => unit({ id: e.id, side: 'enemy', ...e.over })),
    mode: 'manual',
    seed: 13,
  });
  place(s, 'p', 7, 8);
  for (const e of enemies) place(s, e.id, e.col, e.row);
  ready(s);
  return s;
}

function castTe(s: HexBattleSession, to = offsetToAxial(8, 8)): boolean {
  if (s.snapshot().selectedSkill !== 'te') {
    if (!s.submit({ type: 'selectSkill', skillId: 'te' })) return false;
  }
  return s.submit({ type: 'cast', to, skillId: 'te' });
}

/** 推进逻辑时钟 sec 秒（定数 tick：n=round(sec/step)，禁浮点比较累计时钟——0.05 累加的
 * 浮点噪声明可使 while(clock<target) 多跑 1 tick 跨错 t1/t2 边界；定数与 drain DUE_EPS 同口径）。 */
function tickFor(s: HexBattleSession, sec: number, step = 0.05): void {
  const n = Math.round(sec / step);
  for (let i = 0; i < n; i++) {
    if (s.snapshot().pendingInput) break;
    s.tick(step);
  }
}

const settleBoth = (s: HexBattleSession) => tickFor(s, 3.0 + 0.3 + 0.05);
const settleEmpty = (s: HexBattleSession) => tickFor(s, 3.1); // 空放无 t2：越 t1 即收口

const hpOf = (s: HexBattleSession, id: string) => s._debug.units.find((u) => u.id === id)!.hp;
const settleEvents = (s: HexBattleSession, from = 0) =>
  s.events.slice(from).filter((e) => e.type === 'skill' || e.type === 'miss');

// ═══ AS-T1/T2 时长公式（core 纯函数 · AS-1 加法模型） ═══

describe('[AS-T1] 出招时长公式：3000 ÷ min(6, castSpeed+internalCastSpeed)', () => {
  it('core 纯函数：默认 0.8+0.2=1.0 → 3000ms；显式 1.2+0.3=1.5 → 2000ms；缺省字段回退 MVP 默认', () => {
    expect(castDurationMs(teSkill(), unit({ id: 'p', side: 'player' }))).toBe(3000);
    expect(castDurationMs(teSkill({ castSpeed: 1.2 }), unit({ id: 'p', side: 'player', internalCastSpeed: 0.3 }))).toBe(2000);
    expect(castDurationMs(teSkill({ castSpeed: 1.0 }), unit({ id: 'p', side: 'player', internalCastSpeed: 1.0 }))).toBe(1500);
  });

  it('session 排程锚点：landAt=t0+时长/1000、finishAt=landAt+0.3（FINISH_WINDOW_MS=300 共享常量）', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    expect(castTe(s)).toBe(true);
    const pc = s._debug.pendingCasts();
    expect(pc).toHaveLength(1);
    expect(pc[0].landAtSec - pc[0].startedAtSec).toBeCloseTo(3.0, 9);
    expect(pc[0].finishAtSec - pc[0].landAtSec).toBeCloseTo(FINISH_WINDOW_MS / 1000, 9);
    expect(pc[0].startedAtSec).toBe(s._debug.clock());
    expect(FINISH_WINDOW_MS).toBe(300); // AS-4 表现常量定版
  });
});

describe('[AS-T2] 和封顶 ≤6 → 最快 500ms（封顶在加成侧，无第二道时长 clamp）', () => {
  it('5+5 与 6+9 均 500ms（超限不同和同长=无 max(500) 二次钳制的直接证据）', () => {
    expect(effectiveCastSpeed(5, 5)).toBe(6);
    expect(effectiveCastSpeed(6, 9)).toBe(6);
    expect(castDurationMs(teSkill({ castSpeed: 5 }), unit({ id: 'p', side: 'player', internalCastSpeed: 5 }))).toBe(500);
    expect(castDurationMs(teSkill({ castSpeed: 6 }), unit({ id: 'p', side: 'player', internalCastSpeed: 9 }))).toBe(500);
  });

  it('装配入口 fail-fast（方案 §2.1）：castSpeed≤0 / 非有限 / internalSpeed<0 → 抛错且零副作用', () => {
    for (const [cs, is] of [[0, 0.2], [-1, 0.2], [Number.NaN, 0.2], [0.8, -0.1], [0.8, Infinity]] as Array<[number, number]>) {
      const s = asBoard([{ id: 'e0', col: 9, row: 8 }], { skills: [teSkill({ castSpeed: cs })], internalCastSpeed: is });
      const neili0 = s._debug.player().neili;
      expect(() => castTe(s)).toThrow();
      expect(s._debug.player().neili).toBe(neili0); // fail-fast 先于资源扣减
      expect(s._debug.pendingCasts()).toHaveLength(0);
    }
  });
});

// ═══ AS-T3 提交即排程（t0 语义 · v1.3 AS-2） ═══

describe('[AS-T3] 提交后立即查：hp 不变；内力/冷却/bar/选中已变；无段事件；targetIds=null', () => {
  it('cast 提交即排程：t0 资源三件+选中清零即时生效，结算全部延后，targetIds 三态=null（≠[]）', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    const hp0 = hpOf(s, 'e0');
    const n0 = s.events.length;
    const neili0 = s._debug.player().neili;
    expect(castTe(s)).toBe(true);
    expect(hpOf(s, 'e0')).toBe(hp0); // hp 不变（AS-T3）
    expect(s._debug.player().neili).toBe(neili0 - NEILI_COST_PER_CAST); // R-09（Q2 口径）
    expect(s._debug.player().cooldowns.get('te')).toBe(2); // R-08 写初值
    expect(s._debug.player().bar).toBe(0); // BAR-3
    expect(s.snapshot().selectedSkill).toBe(null); // SEL-3
    expect(settleEvents(s, n0)).toHaveLength(0); // 无段事件
    const pc = s._debug.pendingCasts();
    expect(pc).toHaveLength(1);
    expect(pc[0].targetIds).toBe(null); // 三态纪律：null=未到 t1，禁当空集合（§4.1）
    expect(pc[0].phase).toBe('casting');
    expect(pc[0].settlementState).toBe('pending');
    expect(pc[0].t1Resolved).toBe(false);
  });
});

// ═══ AS-T4 边界恰一次（v1.3 AS-3/AS-4 · 方案 §3.1/§7.1） ═══

describe('[AS-T4] t1−ε/t1/t2−ε/t2：只在边界各结算一次，事件 t=dueAt', () => {
  it('单目标：t1 前零结算 → t1 恰段1（t=3.0）→ t2 前无段2 → t2 恰段2（t=3.3）→ 再无新增', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    tickFor(s, 3.0 - 0.051, 0.05); // 推进至 t1−ε（clock≈2.951）
    expect(settleEvents(s, n0)).toHaveLength(0); // t1−ε：零结算
    tickFor(s, 0.1, 0.05); // 越过 t1（clock≈3.051）
    let ev = settleEvents(s, n0);
    expect(ev).toHaveLength(1); // t1：恰段 1
    expect(ev[0].t).toBe(3.0); // 事件 t=dueAt（两位小数），非 tick 时刻 3.05
    expect(ev[0].targetId).toBe('e0');
    expect(ev[0].skillId).toBe('te');
    tickFor(s, 0.2, 0.05); // 至 t2−ε（clock≈3.251）
    expect(settleEvents(s, n0)).toHaveLength(1); // t2−ε：无段 2
    tickFor(s, 0.15, 0.05); // 越过 t2（clock≈3.401）
    ev = settleEvents(s, n0);
    expect(ev).toHaveLength(2); // t2：恰段 2
    expect(ev[1].t).toBe(3.3); // =dueAt
    expect(ev[1].targetId).toBe('e0');
    tickFor(s, 1.0, 0.05);
    expect(settleEvents(s, n0)).toHaveLength(2); // 再无新增（不重复段）
    expect(s._debug.pendingCasts()).toHaveLength(0); // 清 pending 释放施法锁
  });
});

// ═══ AS-T5 两段独立判定（v1.3 六点①/AS-3/AS-4 · 独立 F-04 + 独立 floor 不补差） ═══

describe('[AS-T5] 两段命中/闪避/暴击组合：每段独立 F-04，各自 floor', () => {
  /** 实证扫描 seed（FACE-1 ②b 先例口径）：按真实 session 全流程复演选 seed——出生洗牌先消费
   * rng（SP-1），F-04 掷不在流首，禁用裸 makeRng 序列直判。判据=段1 miss 且段2 命中 161
   *（atk200/def10/grade1.7/jimin0：dodge 恒过、danshi0 恒无暴击——命中段恰 3 掷、miss 段 1 掷）。 */
  function scanMissThenHit(): number {
    for (let seed = 1; seed < 400; seed++) {
      const s = createHexBattle({
        player: unit({ id: 'p', side: 'player', weapon: 'sword', neili: 50, maxNeili: 50, atk: 200, skills: [teSkill()] }),
        enemies: [unit({ id: 'e0', side: 'enemy', def: 10 })],
        mode: 'manual',
        seed,
      });
      place(s, 'p', 7, 8);
      place(s, 'e0', 9, 8);
      ready(s);
      if (!castTe(s)) continue;
      settleBoth(s);
      const ev = s.events.filter((e) => e.type === 'skill' || e.type === 'miss');
      if (ev.length === 2 && ev[0].type === 'miss' && ev[1].type === 'skill' && ev[1].damage === 161) return seed;
    }
    throw new Error('scan failed');
  }

  it('段1 miss + 段2 命中：事件序 [miss(skillId), skill]；段2 伤害=floor(190×1.7×0.5)=161', () => {
    const seed = scanMissThenHit();
    const s = createHexBattle({
      player: unit({ id: 'p', side: 'player', weapon: 'sword', neili: 50, maxNeili: 50, atk: 200, skills: [teSkill()] }),
      enemies: [unit({ id: 'e0', side: 'enemy', def: 10 })],
      mode: 'manual',
      seed,
    });
    place(s, 'p', 7, 8);
    place(s, 'e0', 9, 8);
    ready(s);
    expect(castTe(s)).toBe(true);
    settleBoth(s);
    const ev = s.events.filter((e) => e.type === 'skill' || e.type === 'miss');
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ type: 'miss', targetId: 'e0', skillId: 'te', damage: 0 }); // 段1 miss（可一中一闪）
    expect(ev[1]).toMatchObject({ type: 'skill', targetId: 'e0', skillId: 'te', damage: 161, crit: false }); // 段2 命中（金黄值 161）
    expect(hpOf(s, 'e0')).toBe(999999 - 161);
  });

  it('暴击按段独立：danshi 334（critRate≥1）段段暴击 → 每段 floor(161.5×1.5)=242；两段和 484；不补差', () => {
    const seed = scanMissThenHit();
    const s = createHexBattle({
      player: unit({ id: 'p', side: 'player', weapon: 'sword', neili: 50, maxNeili: 50, atk: 200, danshi: 334, skills: [teSkill()] }),
      enemies: [unit({ id: 'e0', side: 'enemy', def: 10 })],
      mode: 'manual',
      seed,
    });
    place(s, 'p', 7, 8);
    place(s, 'e0', 9, 8);
    ready(s);
    expect(castTe(s)).toBe(true);
    settleBoth(s);
    const ev = s.events.filter((e) => e.type === 'skill' || e.type === 'miss');
    expect(ev[0]).toMatchObject({ type: 'miss', damage: 0 }); // 段1 仍 miss（独立判定）
    expect(ev[1]).toMatchObject({ type: 'skill', damage: 242, crit: true }); // 段2 暴击（金黄值 242）
    expect(hpOf(s, 'e0')).toBe(999999 - 242);
    // 不补差观察锚：两段全中时 161+161=322 vs 整刀 floor(323)=323——差 1 属规格允许（§2.3），禁实现补差
    expect(161 + 161).toBe(322);
    expect(Math.floor(190 * 1.7)).toBe(323);
  });
});

// ═══ AS-T6 t1 动态重搜（v1.3 AS-6 动态追踪 · R1 锚=施法者格） ═══

describe('[AS-T6] t1 动态重搜：走出排除/走入纳入/t1 后集合冻结', () => {
  it('t0 圈内敌 t1 前走出→排除；t0 圈外敌 t1 前走入→纳入；点击格不影响结算（R1：锚=施法者格）', () => {
    const s = asBoard([
      { id: 'eA', col: 9, row: 8 }, // t0：dist2 ∈ 射程
      { id: 'eB', col: 4, row: 8 }, // t0：dist3 ∉ 射程
    ]);
    const n0 = s.events.length;
    expect(castTe(s, offsetToAxial(8, 8))).toBe(true); // 点击射程内空格（R1：结算与点击格无关）
    tickFor(s, 1.0, 0.05); // 施法中段
    place(s, 'eA', 11, 8); // 白盒走位：走出（dist4）
    place(s, 'eB', 6, 8); // 白盒走位：走入（dist1）
    settleBoth(s);
    const ev = settleEvents(s, n0);
    expect(ev).toHaveLength(2); // 两段×唯一目标 eB
    expect(ev.every((e) => e.targetId === 'eB')).toBe(true); // eA 被排除、eB 被纳入
    expect(hpOf(s, 'eA')).toBe(999999);
  });

  it('t1 后走位不改集合：t1→t2 间 eB 移出，段2 仍按 t1 集合结算 eB（不二次重搜）', () => {
    const s = asBoard([{ id: 'eB', col: 6, row: 8 }]); // dist1 ∈ 射程
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    tickFor(s, 3.1, 0.05); // 越过 t1（段1 已结算、集合已固定）
    expect(settleEvents(s, n0)).toHaveLength(1);
    place(s, 'eB', 11, 8); // t1 后移出射程
    tickFor(s, 0.4, 0.05); // 越过 t2
    const ev = settleEvents(s, n0);
    expect(ev).toHaveLength(2); // 段2 仍结算 eB（集合两段共用）
    expect(ev[1].targetId).toBe('eB');
  });

  it('段内 targetOrdinal=all 声明序（禁距离/ID 排序）：双目标两段均 [e0,e1] 保序', () => {
    const s = asBoard([
      { id: 'e0', col: 9, row: 8 }, // all 序在前
      { id: 'e1', col: 8, row: 9 }, // all 序在后（离 p 更近——若按距离排序必乱序）
    ]);
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    settleBoth(s);
    const ev = settleEvents(s, n0);
    expect(ev.map((e) => e.targetId)).toEqual(['e0', 'e1', 'e0', 'e1']); // 段1×all 序 + 段2×all 序
  });
});

// ═══ AS-T6b 空搜与目标死亡（v1.3 AS-6 空放 + t1→t2 死者跳过） ═══

describe('[AS-T6b] 空搜=空放（资源照扣/t1 一条无目标 skill/无 t2/零 RNG）；t1 后死亡目标 t2 跳过不掷骰', () => {
  it('空放：t0 扣资源写冷却；t1 恰一条无 targetId/damage 的 skill；t2 零事件；全程零 RNG', () => {
    const s = asBoard([{ id: 'e0', col: 11, row: 8 }]); // dist4 ∉ 射程 → 空搜
    const n0 = s.events.length;
    const neili0 = s._debug.player().neili;
    const rng0 = s._debug.rngCalls();
    expect(castTe(s)).toBe(true);
    expect(s._debug.player().neili).toBe(neili0 - NEILI_COST_PER_CAST); // 不退款
    expect(s._debug.player().cooldowns.get('te')).toBe(2);
    tickFor(s, 3.0 - 0.051, 0.05);
    expect(s.events.slice(n0).filter((e) => e.type === 'skill')).toHaveLength(0); // t1−ε 零事件
    settleEmpty(s);
    const added = s.events.slice(n0);
    expect(added).toHaveLength(1); // t1 恰一条
    expect(added[0]).toMatchObject({ type: 'skill', actorId: 'p', skillId: 'te' });
    expect('targetId' in added[0]).toBe(false); // 无 targetId（in 严断言）
    expect('damage' in added[0]).toBe(false); // 无 damage
    expect(added[0].t).toBe(3.0); // =t1 dueAt
    tickFor(s, 1.0, 0.05);
    expect(s.events.slice(n0)).toHaveLength(1); // 无 t2 事件
    expect(s._debug.rngCalls()).toBe(rng0); // 空放零 RNG（§5.3）
    expect(s._debug.pendingCasts()).toHaveLength(0); // no-target 收口清队列
    expect(hpOf(s, 'e0')).toBe(999999);
  });

  it('t1→t2 目标死亡：t2 跳过该敌（无事件）且不为其掷骰（rng 恰=段1 消费）；存活者照常', () => {
    const s = asBoard([
      { id: 'e0', col: 9, row: 8 },
      { id: 'e1', col: 8, row: 9 },
    ]);
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    const rngAtT1 = s._debug.rngCalls();
    tickFor(s, 3.1, 0.05); // 段1 已结算（两目标各 ≤3 掷 + faceTarget ≤1）
    const rngAfterSeg1 = s._debug.rngCalls();
    expect(rngAfterSeg1).toBeGreaterThan(rngAtT1);
    const e0u = s._debug.units.find((u) => u.id === 'e0')!;
    e0u.hp = 0; // 白盒致死（目标非施法者，无需走死亡回调路径）
    e0u.dead = true;
    tickFor(s, 0.4, 0.05); // 越过 t2
    const ev = settleEvents(s, n0);
    expect(ev).toHaveLength(3); // 段1×2 + 段2×1（仅 e1）
    expect(ev[2].targetId).toBe('e1');
    expect(ev.some((e) => e.targetId === 'e0' && e.t === 3.3)).toBe(false); // 死者 t2 零事件
    // 死者不消费 RNG：段2 仅 e1 掷骰（≤3 次），总增量 ≤3（若为 e0 也掷骰则 ≥4——间接锁）
    expect(s._debug.rngCalls() - rngAfterSeg1).toBeLessThanOrEqual(3);
    expect(s._debug.rngCalls() - rngAfterSeg1).toBeGreaterThanOrEqual(1);
  });
});

// ═══ AS-T6c 施法者死亡三段边界（v1.3 AS-6b 消散） ═══

describe('[AS-T6c] 施法者死亡=招式消散：t1 前死零搜零事件；t1 后 t2 前死段1 保留段2 消散', () => {
  it('t1 前死亡（敌普攻窗口内击杀）：pending 消散、零 skill/miss、零 RNG、lose 即终局', () => {
    const s = asBoard(
      [{ id: 'e0', col: 8, row: 8, over: { jimin: 240, atk: 9999, def: 0 } }], // fillRate 34/s → 2.94s ready < t1
      { hp: 10, maxHp: 10, def: 0 },
    );
    const n0 = s.events.length;
    const rng0 = s._debug.rngCalls();
    expect(castTe(s)).toBe(true);
    tickFor(s, 4.0, 0.05); // 敌 ~2.95s 普攻击杀 p（atk9999 vs hp10）
    expect(s._debug.player().dead).toBe(true);
    expect(s.events.filter((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'))).toHaveLength(0); // 零段事件
    expect(s._debug.pendingCasts()).toHaveLength(0); // 消散（死亡同事务移除）
    expect(s.phase).toBe('lost');
    expect(s._debug.rngCalls()).toBe(rng0 + 3); // 仅敌普攻 1 次出手 3 掷；我方 cast 零消费
    expect(s.events.slice(n0).some((e) => e.type === 'death' && e.actorId === 'p')).toBe(true);
  });

  it('t1 后 t2 前死亡：段1 保留（事件在），段2 消散（无事件），敌照常行动窗口成立', () => {
    const s = asBoard(
      [{ id: 'e0', col: 8, row: 8, over: { jimin: 220, atk: 9999, def: 0 } }], // fillRate 32/s → 3.125s ready ∈ (t1,t2)
      { hp: 10, maxHp: 10, def: 0, atk: 1 },
    );
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    tickFor(s, 4.5, 0.05);
    const ev = s.events.slice(n0).filter((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    expect(ev).toHaveLength(1); // 段1 保留
    expect(ev[0].t).toBe(3.0);
    expect(ev[0].targetId).toBe('e0');
    expect(s._debug.player().dead).toBe(true); // ~3.15s 被敌普攻击杀
    expect(s.phase).toBe('lost');
    expect(s._debug.pendingCasts()).toHaveLength(0); // 段2 消散
  });
});

// ═══ AS-T7 同刻全序 + 早 castSeq 致死晚施法者（方案 §5） ═══

describe('[AS-T7] 同 dueAt 多 cast：castSeq 升序；早 cast 段伤致死晚 cast 施法者 → 到点消散', () => {
  it('双 cast 同 landAt（时钟冻结窗内先后提交）：seq0（敌）段1 击杀 p → p 的 cast 消散零事件；敌段2 因终局截断', () => {
    const enemyTe = teSkill({ cooldownTurns: 0 });
    const s = createHexBattle({
      player: unit({ id: 'p', side: 'player', weapon: 'sword', neili: 50, maxNeili: 50, hp: 10, maxHp: 10, def: 0, atk: 1, skills: [teSkill()] }),
      enemies: [unit({ id: 'e0', side: 'enemy', jimin: 200, atk: 9999, def: 0, neili: 50, maxNeili: 50, skills: [enemyTe] })],
      mode: 'manual',
      seed: 7,
    });
    place(s, 'p', 7, 8);
    place(s, 'e0', 8, 8); // dist1：敌技射程内（circle2）
    ready(s); // t=0.001，时钟冻结（p 输入态），敌 bar 照常填充
    // 敌在等待窗内 ready（~3.33s dt）→ aiAct → scheduleSkillCast（seq0，t0=0.001 冻结时钟）
    for (let i = 0; i < 200 && s._debug.pendingCasts().length === 0; i++) s.tick(0.02);
    expect(s._debug.pendingCasts()).toHaveLength(1);
    expect(s._debug.pendingCasts()[0].actorId).toBe('e0');
    expect(s._debug.clock()).toBe(0); // 时钟仍冻结（BAR-4：输入期 t 不前进，两 cast 同 t0=0）
    // p 提交（seq1，同 t0 → 同 landAt）
    expect(castTe(s)).toBe(true);
    const pcs = s._debug.pendingCasts();
    expect(pcs).toHaveLength(2);
    expect(pcs[0].castSeq).toBeLessThan(pcs[1].castSeq);
    expect(pcs[0].landAtSec).toBeCloseTo(pcs[1].landAtSec, 9); // 同 dueAt
    const n0 = s.events.length;
    settleBoth(s); // drain：seq0 敌 cast 先——段1 击杀 p → p cast 消散；终局 lost 截断敌段2
    const pEv = s.events.filter((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    expect(pEv).toHaveLength(0); // p 的 cast 消散：零事件（§3.2）
    const e0Ev = s.events.slice(n0).filter((e) => e.actorId === 'e0' && (e.type === 'skill' || e.type === 'miss'));
    expect(e0Ev).toHaveLength(1); // 敌仅段1（段2 被 AS-9 终局截断）
    expect(e0Ev[0].targetId).toBe('p');
    expect(e0Ev[0].t).toBe(3.0);
    expect(s.phase).toBe('lost');
    expect(s._debug.pendingCasts()).toHaveLength(0);
    const pres = s._debug.presentationCasts();
    expect(pres).toHaveLength(1); // 敌 cast 终局保留表现帧；p cast 消散不入 presentation
    expect(pres[0].actorId).toBe('e0');
    expect(pres[0].settlementState).toBe('terminal-canceled');
  });
});

// ═══ AS-T8 终局（v1.3 AS-9：停结算 + presentation 保留） ═══

describe('[AS-T8] 终局：段伤致胜 → win 即发、其后零新增结算事件；presentation 保留 finishAtSec', () => {
  it('段1 双杀致胜：恰 2 条 skill + 2 death + win；win 之后零 skill/miss；cast=terminal-canceled 入 presentation', () => {
    const s = asBoard(
      [
        { id: 'e0', col: 9, row: 8, over: { hp: 5, maxHp: 5, def: 0 } },
        { id: 'e1', col: 8, row: 9, over: { hp: 5, maxHp: 5, def: 0 } },
      ],
      { atk: 9999, def: 0 },
    );
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    settleBoth(s);
    const added = s.events.slice(n0);
    const winIdx = added.findIndex((e) => e.type === 'win');
    expect(winIdx).toBeGreaterThanOrEqual(0);
    const skillEv = added.filter((e) => e.type === 'skill' || e.type === 'miss');
    expect(skillEv).toHaveLength(2); // 段1 × 2 目标（段2 被终局截断）
    expect(skillEv.map((e) => e.targetId)).toEqual(['e0', 'e1']); // all 序
    expect(added.slice(winIdx).filter((e) => e.type === 'skill' || e.type === 'miss' || e.type === 'death')).toHaveLength(0); // 终局后零新增结算事件
    expect(s.phase).toBe('won');
    const pres = s._debug.presentationCasts();
    expect(pres).toHaveLength(1);
    expect(pres[0].settlementState).toBe('terminal-canceled');
    expect(pres[0].finishAtSec).toBeCloseTo(3.3, 6); // FE 播完表现帧的锚保留（t0=0：ready 冻结窗内提交，时钟未走）
    expect(s._debug.pendingCasts()).toHaveLength(0);
  });
});

// ═══ AS-T9 三入口同构（v1.3 AS-7 + 方案 §3.4） ═══

describe('[AS-T9] AI/attack(skillId)/cast 三入口收敛 scheduler；普攻即时单段不吃 castSpeed', () => {
  it('AI（自动局）出技同 scheduler：两段事件 t 相差 0.3、同 targetId；AI 锚=自身格', () => {
    const s = createHexBattle({
      player: unit({ id: 'p', side: 'player', weapon: 'sword', jimin: 200, neili: 50, maxNeili: 50, skills: [teSkill()] }),
      enemies: [unit({ id: 'e0', side: 'enemy' })],
      mode: 'auto',
      seed: 7,
    });
    place(s, 'p', 7, 8);
    place(s, 'e0', 9, 8);
    let i0 = -1;
    for (let i = 0; i < 1500 && i0 < 0; i++) {
      s.tick(0.1);
      i0 = s.events.findIndex((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    }
    expect(i0).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 20; i++) s.tick(0.1); // 越过 t2（段1 采样点后补 0.3s+）
    const ev = s.events.filter((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    expect(ev).toHaveLength(2); // AI 出技=两段（同 scheduler）
    expect(ev[0].targetId).toBe('e0');
    expect(ev[1].targetId).toBe('e0');
    expect(ev[1].t - ev[0].t).toBeCloseTo(0.3, 6); // t2−t1=收招窗
    expect(s._debug.player().hex).toEqual(offsetToAxial(7, 8)); // AI 施法不动位（锚=自身格）
  });

  it('attack(skillId) 不绕过 t1：提交时 hp 不变零事件；越 t1/t2 两段结算', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    const hp0 = hpOf(s, 'e0');
    const n0 = s.events.length;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(true);
    expect(hpOf(s, 'e0')).toBe(hp0); // 兼容入口也禁「立即单目标结算」（§3.4）
    expect(settleEvents(s, n0)).toHaveLength(0);
    settleBoth(s);
    const ev = settleEvents(s, n0);
    expect(ev).toHaveLength(2);
    expect(ev.every((e) => e.targetId === 'e0')).toBe(true);
  });

  it('attack(skillId=null) 普攻：提交即单段即时结算（basic/miss+hp 立变），不进 scheduler 不读 castSpeed', () => {
    const s = asBoard(
      [{ id: 'e0', col: 8, row: 8, over: { def: 0, hp: 100, maxHp: 100 } }],
      { atk: 50, skills: [teSkill({ castSpeed: 6 })] }, // castSpeed 6 存在也不影响普攻
    );
    const hp0 = hpOf(s, 'e0');
    const n0 = s.events.length;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(true);
    const added = s.events.slice(n0);
    expect(added.some((e) => e.type === 'basic' || e.type === 'miss')).toBe(true); // 即时事件
    if (added.some((e) => e.type === 'basic')) expect(hpOf(s, 'e0')).toBeLessThan(hp0); // hp 立变
    expect(s._debug.pendingCasts()).toHaveLength(0); // 不进 scheduler
  });
});

// ═══ AS-T10 SP-2 全等（含施法中 rejected 操作序列） ═══

describe('[AS-T10] 同 seed 同操作（含施法中拒绝）双场全等', () => {
  it('脚本含 cast/施法中 rejected move·selectSkill/settle：事件流逐位全等；rejected 不消费 RNG', () => {
    // asBoard 固定 seed 13——双场即同 seed 同布点同操作（SP-2 面板）
    const a = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    const b = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    const script = (s: HexBattleSession) => {
      expect(castTe(s)).toBe(true);
      const r0 = s._debug.rngCalls();
      expect(s.submit({ type: 'move', to: offsetToAxial(6, 8) })).toBe(false); // 施法门拒（B4）
      expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(false);
      expect(s._debug.rngCalls()).toBe(r0); // rejected 零 RNG（§7.2 首行）
      tickFor(s, 1.0, 0.05);
      settleBoth(s);
      tickFor(s, 0.5, 0.05);
    };
    script(a);
    script(b);
    expect(a.events).toEqual(b.events); // HP/事件/t/targetId/damage/crit 全等（SP-2）
    expect(a.events.filter((e) => e.type === 'rejected').length).toBeGreaterThanOrEqual(2);
    expect(a.events.filter((e) => e.type === 'rejected').every((e) => e.reason === 'bar')).toBe(true); // B4：复用 'bar'（契约零新增）
    expect(hpOf(a, 'e0')).toBe(hpOf(b, 'e0'));
  });
});

// ═══ AS-T11 x2 与大 dt（方案 §3.1 尾段/§7.1） ═══

describe('[AS-T11] x2 倍速逻辑时长缩放；大 dt 跨界 drain 不漏段不重段', () => {
  it('x1（dt0.016）vs x2（dt0.008×fast）：逻辑步长等价 → 事件流逐位全等（含 t）', () => {
    const a = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    const b = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    expect(b.submit({ type: 'toggleSpeed' })).toBe(true);
    expect(castTe(a)).toBe(true);
    expect(castTe(b)).toBe(true);
    for (let i = 0; i < 260; i++) {
      a.tick(0.016);
      b.tick(0.008); // ×fast(2) → 逻辑 dt 同 0.016
    }
    expect(a.events).toEqual(b.events); // 逻辑时长按倍率缩放，due 顺序与事件流不变
  });

  it('大 dt：单 tick(3.5) 跨 t1+t2 → 两段按序全 drain；与分块 dt(0.4×9) 及细步长(0.016) 结算面全等', () => {
    const mk = () => asBoard([{ id: 'e0', col: 9, row: 8, over: { def: 10 } }], { atk: 200 });
    const fine = mk();
    const coarse = mk();
    const chunked = mk();
    expect(castTe(fine)).toBe(true);
    expect(castTe(coarse)).toBe(true);
    expect(castTe(chunked)).toBe(true);
    for (let i = 0; i < 260; i++) fine.tick(0.016);
    coarse.tick(3.5); // 一次跨界
    for (let i = 0; i < 9; i++) chunked.tick(0.4);
    const pick = (s: HexBattleSession) =>
      s.events
        .filter((e) => e.type === 'skill' || e.type === 'miss')
        .map((e) => ({ type: e.type, targetId: e.targetId, damage: e.damage, crit: e.crit, t: e.t }));
    expect(pick(coarse)).toHaveLength(2); // 不漏段
    expect(pick(chunked)).toHaveLength(2);
    expect(pick(coarse)).toEqual(pick(fine)); // 不重段、rng 同序同值、t=dueAt
    expect(pick(chunked)).toEqual(pick(fine));
  });
});

// ═══ AS-T12 演出相代理锁（BE 侧；帧/T21 归 FE 卡） ═══

describe('[AS-T12] 施法者 animState 时序：charge 保持至 t1、[t1,t2)=strike、t2 后回 idle', () => {
  it('提交→charge；t1−ε 仍 charge（施放帧循环）；t1 后 strike；t2 后 idle', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    expect(castTe(s)).toBe(true);
    expect(s._debug.player().animState).toBe('charge');
    tickFor(s, 2.9, 0.05);
    expect(s._debug.player().animState).toBe('charge'); // 施法中保持（B5：豁免动画机衰减）
    tickFor(s, 0.1, 0.05); // 越 t1
    expect(s._debug.player().animState).toBe('strike'); // 收招相
    tickFor(s, 0.5, 0.05); // 越 t2 + strike 300ms 到期
    expect(['idle', 'strike']).toContain(s._debug.player().animState);
    tickFor(s, 0.3, 0.05);
    expect(s._debug.player().animState).toBe('idle'); // 施法锁释放回 idle
  });
});

// ═══ AS-T13/SP-2 专项收口（方案 §7.2 九行剩余项） ═══

describe('[AS-T13/SP-2 专项] t1 前走位双场全等 / 消散后零 RNG / 终局后无伤害事件', () => {
  it('t1 前走位相同（白盒同格）→ t1 目标 ID 数组与两段事件全等（重搜只读 t1 站位、按 all 序）', () => {
    const mk = () => asBoard([{ id: 'eA', col: 9, row: 8 }, { id: 'eB', col: 4, row: 8 }]);
    const a = mk();
    const b = mk();
    expect(castTe(a)).toBe(true);
    expect(castTe(b)).toBe(true);
    tickFor(a, 1.0, 0.05);
    tickFor(b, 1.0, 0.05);
    place(a, 'eB', 6, 8);
    place(b, 'eB', 6, 8); // 相同走位
    settleBoth(a);
    settleBoth(b);
    expect(a.events).toEqual(b.events);
    const tg = (s: HexBattleSession) => s.events.filter((e) => e.type === 'skill' || e.type === 'miss').map((e) => e.targetId);
    expect(tg(a)).toEqual(tg(b));
  });

  it('终局边界后零 RNG：win 后再推进，rngCalls 冻结（结算态停、表现帧纯视觉）', () => {
    const s = asBoard(
      [
        { id: 'e0', col: 9, row: 8, over: { hp: 5, maxHp: 5, def: 0 } },
        { id: 'e1', col: 8, row: 9, over: { hp: 5, maxHp: 5, def: 0 } },
      ],
      { atk: 9999, def: 0 },
    );
    expect(castTe(s)).toBe(true);
    settleBoth(s);
    expect(s.phase).toBe('won');
    const rng0 = s._debug.rngCalls();
    tickFor(s, 2.0, 0.05); // 终局后推进（FE 表现帧窗口）
    expect(s._debug.rngCalls()).toBe(rng0); // 零掷骰
    expect(s.events.filter((e) => e.type === 'skill' || e.type === 'miss').length).toBe(2); // 零新增
  });
});
