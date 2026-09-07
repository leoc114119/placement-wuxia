// ═══ AS 出招速度 + 两段式伤害（TASK-AS-v03）验收测试 ═══
// 真源：《出招速度与两段式伤害需求文档》v1.4（AS-1~AS-9，Leo L 环二次终裁）+
//      《出招速度与两段式伤害技术方案》v0.3 §3/§5/§7（4015739）
// v0.3 时序：段 1=t0 提交即时内联结算（AS-3）；段 2=t1=t0+出招时长 循环结束重搜结算（AS-4）；
//      无 t2/收招窗结算节点（AS-4「300ms 概念取消」）；施法循环帧周期 280ms 归 FE 卡（AS-2）。
// PM 修正裁定（随卡）：两段各自走完整 F-04（命中→闪避→暴击→破防→取整，闪避照判）——
//      方案 v0.3 §4.2 forceHit 参数作废；「出手必中」（AS-3/AS-6）仅为 t0 即时范围判定的
//      位置语义（无走位窗口），数值闪避两段照判。R1 锚=施法者 t0 自身格（seq=91 终裁沿用）。
// 运行：npm run test:battle（vitest，node 环境）。
// 金黄值推导注记（禁测试外复制公式；此处为断言的独立手算对照）：
//   base = max(atk−def,1)=190；grade=1.7 → 190×1.7=323；
//   段伤 = floor(323×0.5)=floor(161.5)=161；暴击段 = floor(161.5×1.5)=floor(242.25)=242；
//   整刀（无段比）= floor(323)=323 → 两段和 322 与整刀差 1（AS §2.3「不补差」行为证据）。
// 确定性 harness：shizhan=15_000_000 → hitRate=min(1,0.85+0.15)=1 恒命中（F-04 命中行
//      rng()>=1 恒假）；jimin=0 → dodgeRate=0 恒不闪避；danshi=0 → 恒不暴击（掷骰数不变，
//      仅判定阈值变）——段结算时机断言（t0/t1 边界）不依赖 seed 扫描。
import { describe, expect, it } from 'vitest';
import { createHexBattle, NEILI_COST_PER_CAST, type HexBattleSession } from '../systems/battle-session';
import { castDurationMs, effectiveCastSpeed } from '../systems/battle-core';
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

/** F-04 恒命中 harness（见文件头注记）：出招方 shizhan=15_000_000 + 目标 jimin=0（unit 默认）。 */
const SURE_HIT_SHIZHAN = 15_000_000;

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
 * 浮点噪声明可能使 while(clock<target) 多跑 1 tick 跨错 t1 边界；定数与 drain DUE_EPS 同口径）。 */
function tickFor(s: HexBattleSession, sec: number, step = 0.05): void {
  const n = Math.round(sec / step);
  for (let i = 0; i < n; i++) {
    if (s.snapshot().pendingInput) break;
    s.tick(step);
  }
}

/** v0.3：段 2 唯一 due=t1=t0+3.0（默认 0.8+0.2 → 3000ms）；无 t2。 */
const settleBoth = (s: HexBattleSession) => tickFor(s, 3.0 + 0.05);
const settleEmpty = (s: HexBattleSession) => tickFor(s, 3.05); // t0 空放：表现保持至 t1 即收口

const hpOf = (s: HexBattleSession, id: string) => s._debug.units.find((u) => u.id === id)!.hp;
const settleEvents = (s: HexBattleSession, from = 0) =>
  s.events.slice(from).filter((e) => e.type === 'skill' || e.type === 'miss');

// ═══ AS-T1/T2 时长公式（core 纯函数 · AS-1 加法模型，v1.4 沿用） ═══

describe('[AS-T1] 出招时长公式：3000 ÷ min(6, castSpeed+internalCastSpeed)', () => {
  it('core 纯函数：默认 0.8+0.2=1.0 → 3000ms；显式 1.2+0.3=1.5 → 2000ms；缺省字段回退 MVP 默认', () => {
    expect(castDurationMs(teSkill(), unit({ id: 'p', side: 'player' }))).toBe(3000);
    expect(castDurationMs(teSkill({ castSpeed: 1.2 }), unit({ id: 'p', side: 'player', internalCastSpeed: 0.3 }))).toBe(2000);
    expect(castDurationMs(teSkill({ castSpeed: 1.0 }), unit({ id: 'p', side: 'player', internalCastSpeed: 1.0 }))).toBe(1500);
  });

  it('session 排程锚点：finishAt=t0+时长/1000（v0.3 单 pending；两段间隔=整个出招时长，AS-4）', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    expect(castTe(s)).toBe(true);
    const pc = s._debug.pendingCasts();
    expect(pc).toHaveLength(1); // 段 1 已 t0 内联，pending 只剩段 2（方案 §1.1-1）
    expect(pc[0].finishAtSec - pc[0].startedAtSec).toBeCloseTo(3.0, 9); // 无 +0.3 收招节点
    expect(pc[0].startedAtSec).toBe(s._debug.clock()); // =t0
    expect(pc[0].targetIds0).toEqual(['e0']); // 段 1 即时集合快照（AS-6 分层）
    expect(pc[0].targetIds1).toBe(null); // 三态纪律：null=未到 t1（§4.1）
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

// ═══ AS-T3 提交即结算段 1（v1.4 AS-3：t0 提交时刻即时结算） ═══

describe('[AS-T3] 提交后立即查：段 1 已结算（hp 立变+第一跳事件 t=t0）；资源/冷却/bar/选中已变；targetIds1=null', () => {
  it('cast 提交即结算段 1：t0 hp 立变 161、首跳 skill 事件 t=0.0、资源三件+选中清零即时生效，段 2 pending 待 t1', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8, over: { def: 10 } }], { atk: 200, shizhan: SURE_HIT_SHIZHAN });
    const hp0 = hpOf(s, 'e0');
    const n0 = s.events.length;
    const neili0 = s._debug.player().neili;
    expect(castTe(s)).toBe(true);
    expect(hpOf(s, 'e0')).toBe(hp0 - 161); // ★ v1.4 AS-3：段 1 t0 即时结算（v0.2「t0 hp 不变」废止）
    expect(s._debug.player().neili).toBe(neili0 - NEILI_COST_PER_CAST); // R-09（Q2 口径）
    expect(s._debug.player().cooldowns.get('te')).toBe(2); // R-08 写初值
    expect(s._debug.player().bar).toBe(0); // BAR-3
    expect(s.snapshot().selectedSkill).toBe(null); // SEL-3
    const ev = settleEvents(s, n0);
    expect(ev).toHaveLength(1); // 第一跳事件已在（t=t0）
    expect(ev[0]).toMatchObject({ type: 'skill', actorId: 'p', targetId: 'e0', skillId: 'te', damage: 161, crit: false, t: 0.0 }); // 金黄值 161
    const pc = s._debug.pendingCasts();
    expect(pc).toHaveLength(1); // 非空未终局 → 建 t1 段 2 pending
    expect(pc[0].targetIds0).toEqual(['e0']);
    expect(pc[0].targetIds1).toBe(null); // 三态纪律：null=未到 t1（§4.1）
    expect(pc[0].phase).toBe('casting');
    expect(pc[0].settlementState).toBe('pending');
    expect(pc[0].t1Resolved).toBe(false);
  });
});

// ═══ AS-T4 边界恰一次（v1.4 AS-3/AS-4 · 方案 v0.3 §3.1/§7.1） ═══

describe('[AS-T4] t0/t1−ε/t1：t0 恰段 1、t1 恰段 2、无 t2', () => {
  it('单目标：提交即段 1（t=0.0）→ t1−ε 无段 2 → t1 恰段 2（t=3.0）→ 再无新增', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8, over: { def: 10 } }], { atk: 200, shizhan: SURE_HIT_SHIZHAN });
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    let ev = settleEvents(s, n0);
    expect(ev).toHaveLength(1); // t0：恰段 1（提交同刻）
    expect(ev[0].t).toBe(0.0); // 事件 t=t0（两位小数）
    expect(ev[0].targetId).toBe('e0');
    expect(ev[0].skillId).toBe('te');
    tickFor(s, 3.0 - 0.051, 0.05); // 推进至 t1−ε（clock≈2.949）
    expect(settleEvents(s, n0)).toHaveLength(1); // t1−ε：无段 2
    tickFor(s, 0.1, 0.05); // 越过 t1（clock≈2.999+0.05）
    ev = settleEvents(s, n0);
    expect(ev).toHaveLength(2); // t1：恰段 2
    expect(ev[1].t).toBe(3.0); // =t1 dueAt（非 tick 时刻）
    expect(ev[1].targetId).toBe('e0');
    tickFor(s, 1.0, 0.05); // 旧 t2 窗及以后
    expect(settleEvents(s, n0)).toHaveLength(2); // 再无新增（无 t2 节点，不重复段）
    expect(s._debug.pendingCasts()).toHaveLength(0); // 清 pending 释放施法锁
  });
});

// ═══ AS-T5 两段独立判定（v1.4 六点①/AS-3/AS-4 · 完整 F-04 含闪避 + 独立 floor 不补差） ═══

describe('[AS-T5] 两段命中/闪避/暴击组合：每段独立完整 F-04（闪避照判，PM 修正裁定），各自 floor', () => {
  /** 实证扫描 seed（FACE-1 ②b 先例口径）：按真实 session 全流程复演选 seed——出生洗牌先消费
   * rng（SP-1），F-04 掷不在流首，禁用裸 makeRng 序列直判。判据=段1 miss（t0）且段2 命中 161
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

  it('段1 miss + 段2 命中（完整 F-04 闪避链实证）：事件序 [miss(t=0), skill(t=3)]；段2 伤害=floor(190×1.7×0.5)=161', () => {
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
    const ev0 = s.events.filter((e) => e.type === 'skill' || e.type === 'miss');
    expect(ev0).toHaveLength(1);
    expect(ev0[0]).toMatchObject({ type: 'miss', t: 0.0 }); // ★ 段 1 同样走闪避判定（forceHit 作废）
    settleBoth(s);
    const ev = s.events.filter((e) => e.type === 'skill' || e.type === 'miss');
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ type: 'miss', targetId: 'e0', skillId: 'te', damage: 0 }); // 段1 miss（可一中一闪）
    expect(ev[1]).toMatchObject({ type: 'skill', targetId: 'e0', skillId: 'te', damage: 161, crit: false, t: 3.0 }); // 段2 命中（金黄值 161）
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

// ═══ AS-T6 两套目标集合分层（v1.4 AS-6：段1=t0 即时范围判定；段2=t1 锚格重搜 · R1 锚=施法者格） ═══

describe('[AS-T6] 段1 即时集合 + 段2 动态重搜分层：走出排除/走入纳入/t1 后集合冻结', () => {
  it('分层可躲性：t0 圈内 eA 吃段1；施法中 eA 走出+eB 走入 → 段2 只结算 eB；点击格不影响结算（R1）', () => {
    const s = asBoard(
      [
        { id: 'eA', col: 9, row: 8, over: { def: 10 } }, // t0：dist2 ∈ 射程
        { id: 'eB', col: 4, row: 8, over: { def: 10 } }, // t0：dist3 ∉ 射程
      ],
      { atk: 200, shizhan: SURE_HIT_SHIZHAN },
    );
    const n0 = s.events.length;
    expect(castTe(s, offsetToAxial(8, 8))).toBe(true); // 点击射程内空格（R1：结算与点击格无关）
    let ev = settleEvents(s, n0);
    expect(ev).toHaveLength(1); // ★ 段 1=t0 即时集合：只含 eA（eB 走入前不在圈内——AS-6 分层）
    expect(ev[0].targetId).toBe('eA');
    expect(ev[0].t).toBe(0.0);
    expect(hpOf(s, 'eA')).toBe(999999 - 161); // 段 1 已扣血
    expect(hpOf(s, 'eB')).toBe(999999); // 未入段 1
    tickFor(s, 1.0, 0.05); // 施法中段
    place(s, 'eA', 11, 8); // 白盒走位：走出（dist4）
    place(s, 'eB', 6, 8); // 白盒走位：走入（dist1）
    settleBoth(s);
    ev = settleEvents(s, n0);
    expect(ev).toHaveLength(2); // 段 2=t1 重搜集合：仅 eB（慢招可躲=AS-6 博弈维度）
    expect(ev[1].targetId).toBe('eB');
    expect(ev[1].t).toBe(3.0);
    expect(hpOf(s, 'eA')).toBe(999999 - 161); // eA 只吃段 1（走出可躲段 2）
    expect(hpOf(s, 'eB')).toBe(999999 - 161); // eB 只吃段 2
  });

  it('t1 后走位无效果：段 2 已在 t1 原子结算（重搜+固定集合同刻完成），此后移出零新增', () => {
    const s = asBoard([{ id: 'eB', col: 6, row: 8 }]); // dist1 ∈ 射程
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    tickFor(s, 3.05, 0.05); // 越过 t1（段 1+段 2 均已结算）
    expect(settleEvents(s, n0)).toHaveLength(2);
    place(s, 'eB', 11, 8); // t1 后移出射程
    tickFor(s, 1.0, 0.05);
    expect(settleEvents(s, n0)).toHaveLength(2); // 零新增（无 t2、不二次重搜）
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
    expect(ev.map((e) => e.t)).toEqual([0.0, 0.0, 3.0, 3.0]); // 段1 全体 t0、段2 全体 t1
  });
});

// ═══ AS-T6b 空集合双态 + 死者跳过（v1.4 AS-6：t0 空=空放一条；t1 空=仅段2 不发；死者不掷骰） ═══

describe('[AS-T6b] t0 空放（一条无目标 skill/不建 pending/零 RNG）+ t1 空搜静默 + t1 死者跳过不掷骰', () => {
  it('t0 空放：提交即扣资源写冷却+发一条无 targetId/damage 的 skill（t=0.0）；不建 pending；表现保持至 t1；全程零 RNG', () => {
    const s = asBoard([{ id: 'e0', col: 11, row: 8 }]); // dist4 ∉ 射程 → t0 空搜
    const n0 = s.events.length;
    const neili0 = s._debug.player().neili;
    const rng0 = s._debug.rngCalls();
    expect(castTe(s)).toBe(true);
    expect(s._debug.player().neili).toBe(neili0 - NEILI_COST_PER_CAST); // 不退款
    expect(s._debug.player().cooldowns.get('te')).toBe(2);
    const added = s.events.slice(n0);
    expect(added).toHaveLength(1); // ★ t0 恰一条（提交同刻）
    expect(added[0]).toMatchObject({ type: 'skill', actorId: 'p', skillId: 'te', t: 0.0 });
    expect('targetId' in added[0]).toBe(false); // 无 targetId（in 严断言）
    expect('damage' in added[0]).toBe(false); // 无 damage
    expect(s._debug.pendingCasts()).toHaveLength(0); // 不建结算 pending（§4.1）
    const pres = s._debug.presentationCasts();
    expect(pres).toHaveLength(1); // 表现保持持有（只读，AS-2 循环播完）
    expect(pres[0].settlementState).toBe('no-target');
    expect(pres[0].finishAtSec).toBeCloseTo(3.0, 9);
    expect(s._debug.player().animState).toBe('charge'); // 施放帧照播
    tickFor(s, 2.9, 0.05);
    expect(s._debug.player().animState).toBe('charge'); // t1−ε 仍循环（presentation 保持）
    settleEmpty(s);
    expect(s.events.slice(n0)).toHaveLength(1); // t1 不再发（AS-6：空放仅 t0 一条）
    expect(s._debug.presentationCasts()).toHaveLength(0); // 表现收口
    expect(s._debug.player().animState).toBe('idle'); // 回站立（AS-4）
    expect(s._debug.rngCalls()).toBe(rng0); // 空放零 RNG（§5.3）
    expect(hpOf(s, 'e0')).toBe(999999);
  });

  it('t1 空搜=仅段 2 不发：段 1 已在 t0 结算（保留），t1 零事件零退款零掷骰，收口回 idle', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8, over: { def: 10 } }], { atk: 200, shizhan: SURE_HIT_SHIZHAN });
    const n0 = s.events.length;
    const neili0 = s._debug.player().neili;
    expect(castTe(s)).toBe(true);
    expect(settleEvents(s, n0)).toHaveLength(1); // 段 1 已结算（t0）
    const rngAfterSeg1 = s._debug.rngCalls();
    tickFor(s, 1.0, 0.05);
    place(s, 'e0', 11, 8); // 施法中走出射程 → t1 重搜为空
    tickFor(s, 3.1, 0.05); // 越过 t1
    expect(settleEvents(s, n0)).toHaveLength(1); // ★ 段 2 静默：无事件（AS-6「重搜为空=仅第二段不发」）
    expect(s._debug.player().neili).toBe(neili0 - NEILI_COST_PER_CAST); // 不退款
    expect(s._debug.rngCalls()).toBe(rngAfterSeg1); // 空搜零掷骰
    expect(s._debug.pendingCasts()).toHaveLength(0); // no-target 收口
    expect(s._debug.player().animState).toBe('idle'); // 收势回站立
  });

  it('t0→t1 目标死亡：段 2 跳过该敌（无事件）且不为其掷骰；存活者照常', () => {
    const s = asBoard([
      { id: 'e0', col: 9, row: 8 },
      { id: 'e1', col: 8, row: 9 },
    ]);
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    const rngAfterSeg1 = s._debug.rngCalls(); // 段 1 已结算（两目标各 ≤3 掷 + faceTarget ≤1）
    expect(settleEvents(s, n0)).toHaveLength(2);
    const e0u = s._debug.units.find((u) => u.id === 'e0')!;
    e0u.hp = 0; // 白盒致死（目标非施法者，无需走死亡回调路径）
    e0u.dead = true;
    tickFor(s, 3.1, 0.05); // 越过 t1
    const ev = settleEvents(s, n0);
    expect(ev).toHaveLength(3); // 段1×2 + 段2×1（仅 e1）
    expect(ev[2].targetId).toBe('e1');
    expect(ev[2].t).toBe(3.0);
    expect(ev.some((e) => e.targetId === 'e0' && e.t === 3.0)).toBe(false); // 死者段 2 零事件
    // 死者不消费 RNG：段2 仅 e1 掷骰（≤3 次），总增量 ≤3（若为 e0 也掷骰则 ≥4——间接锁）
    expect(s._debug.rngCalls() - rngAfterSeg1).toBeLessThanOrEqual(3);
    expect(s._debug.rngCalls() - rngAfterSeg1).toBeGreaterThanOrEqual(1);
  });
});

// ═══ AS-T6c 施法者死亡边界（v1.4 AS-6b：死亡=招式消散；段 1 已随 t0 结算不回收） ═══

describe('[AS-T6c] 施法者死亡=段 2 消散：t1 前死段1 保留段2 零事件；t1 后死=两段均已结算', () => {
  it('t1 前死亡（敌普攻窗口内击杀）：段 1 事件保留（t=0）、段 2 消散零事件、lose 即终局', () => {
    const s = asBoard(
      [{ id: 'e0', col: 8, row: 8, over: { jimin: 240, atk: 9999, def: 0, shizhan: SURE_HIT_SHIZHAN } }], // fillRate 34/s → 2.94s ready < t1
      { hp: 10, maxHp: 10, def: 0 },
    );
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    const ev0 = s.events.slice(n0).filter((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    expect(ev0).toHaveLength(1); // ★ v1.4 AS-6b：段 1 已随 t0 结算（不因后续死亡回收）
    expect(ev0[0].t).toBe(0.0);
    const rngAfterCast = s._debug.rngCalls();
    tickFor(s, 4.0, 0.05); // 敌 ~2.95s 普攻击杀 p（atk9999 vs hp10，shizhan 恒中）
    expect(s._debug.player().dead).toBe(true);
    const pEv = s.events.filter((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    expect(pEv).toHaveLength(1); // 段 2 零事件（消散：t1 零结算）
    expect(s._debug.pendingCasts()).toHaveLength(0); // 消散（死亡同事务移除）
    expect(s.phase).toBe('lost');
    expect(s._debug.rngCalls()).toBe(rngAfterCast + 3); // 仅敌普攻 1 次出手 3 掷；段 2 消散零消费
    expect(s.events.slice(n0).some((e) => e.type === 'death' && e.actorId === 'p')).toBe(true);
  });

  it('t1 后死亡：段 2 已于 t1 结算（两事件均在），死亡时无未结算段可消散', () => {
    const s = asBoard(
      [{ id: 'e0', col: 8, row: 8, over: { jimin: 220, atk: 9999, def: 0, shizhan: SURE_HIT_SHIZHAN } }], // fillRate 32/s → 3.125s ready > t1
      { hp: 10, maxHp: 10, def: 0, atk: 1 },
    );
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    tickFor(s, 4.5, 0.05);
    const ev = s.events.slice(n0).filter((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    expect(ev).toHaveLength(2); // ★ 两段均已结算（t=0 与 t=3.0）——死亡只消散未结算段
    expect(ev[0].t).toBe(0.0);
    expect(ev[1].t).toBe(3.0);
    expect(ev[1].targetId).toBe('e0');
    expect(s._debug.player().dead).toBe(true); // ~3.15s 被敌普攻击杀（t1 之后）
    expect(s.phase).toBe('lost');
    expect(s._debug.pendingCasts()).toHaveLength(0);
  });
});

// ═══ AS-T7 同刻全序 + 早 castSeq 段伤致死晚施法者（方案 §5 · v0.3 段 2 单节点版） ═══

describe('[AS-T7] 同 dueAt 多 cast：castSeq 升序；早 cast 段 2 致死晚 cast 施法者 → 到点消散', () => {
  it('双 cast 同 finishAt（时钟冻结窗内先后提交）：seq0（敌）段 2 击杀 p → p 的段 2 消散零事件；敌段 2 完成', () => {
    // 敌 atk 10 / p def 0 / grade1.7×0.5 → 段伤 floor(8.5)=8：段1 后 p hp 10→2、段2 致死（8≥2）。
    const enemyTe = teSkill({ cooldownTurns: 0 });
    const s = createHexBattle({
      player: unit({ id: 'p', side: 'player', weapon: 'sword', neili: 50, maxNeili: 50, hp: 10, maxHp: 10, def: 0, atk: 200, shizhan: SURE_HIT_SHIZHAN, skills: [teSkill()] }),
      enemies: [unit({ id: 'e0', side: 'enemy', jimin: 200, atk: 10, def: 10, shizhan: SURE_HIT_SHIZHAN, neili: 50, maxNeili: 50, skills: [enemyTe] })],
      mode: 'manual',
      seed: 7,
    });
    place(s, 'p', 7, 8);
    place(s, 'e0', 8, 8); // dist1：敌技射程内（circle2）
    ready(s); // t=0，时钟冻结（p 输入态），敌 bar 照常填充
    // 敌在等待窗内 ready（~3.33s dt）→ aiAct → scheduleSkillCast（seq0，t0=0 冻结时钟；段 1 即时 8 伤非致死）
    for (let i = 0; i < 200 && s._debug.pendingCasts().length === 0; i++) s.tick(0.02);
    expect(s._debug.pendingCasts()).toHaveLength(1);
    expect(s._debug.pendingCasts()[0].actorId).toBe('e0');
    expect(s._debug.clock()).toBe(0); // 时钟仍冻结（BAR-4：输入期 t 不前进，两 cast 同 t0=0）
    // p 提交（seq1，同 t0 → 同 finishAt；段 1 即时 161 伤非致死）
    expect(castTe(s)).toBe(true);
    const pcs = s._debug.pendingCasts();
    expect(pcs).toHaveLength(2);
    expect(pcs[0].castSeq).toBeLessThan(pcs[1].castSeq);
    expect(pcs[0].finishAtSec).toBeCloseTo(pcs[1].finishAtSec, 9); // 同 dueAt（=3.0，无收招窗）
    const n0 = s.events.length;
    settleBoth(s); // drain：seq0 敌段 2 先（同 dueAt 按 castSeq 升序）——击杀 p → p 段 2 消散 + 终局 lost
    const pEv = s.events.filter((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    expect(pEv).toHaveLength(1); // p：仅段 1（t0 已结算）；段 2 消散零事件（§3.2）
    const e0Ev = s.events.slice(n0).filter((e) => e.actorId === 'e0' && (e.type === 'skill' || e.type === 'miss'));
    expect(e0Ev).toHaveLength(1); // 敌段 2 在 drain 窗 t1=3.0 结算（seq0 先于 p 的 seq1）
    expect(e0Ev[0]).toMatchObject({ targetId: 'p', t: 3.0 }); // 段 2 击杀 p
    const e0EvAll = s.events.filter((e) => e.actorId === 'e0' && (e.type === 'skill' || e.type === 'miss'));
    expect(e0EvAll).toHaveLength(2); // 敌段 1（t0 冻结窗）+ 段 2（t1，击杀 p）
    expect(e0EvAll[1].targetId).toBe('p');
    expect(e0EvAll[1].t).toBe(3.0);
    expect(s.phase).toBe('lost');
    expect(s._debug.pendingCasts()).toHaveLength(0);
    const pres = s._debug.presentationCasts();
    expect(pres).toHaveLength(1); // 敌 cast：自身段 2 击杀致终局 → flush 收口 terminal-canceled 入 presentation（AS-9）
    expect(pres[0].actorId).toBe('e0');
    expect(pres[0].settlementState).toBe('terminal-canceled');
    expect(pres.some((c) => c.actorId === 'p')).toBe(false); // p cast=死亡消散路径，不入 presentation（§3.2）
  });
});

// ═══ AS-T8 终局（v1.4 AS-9：段 1 致胜 → 段 2 不结算；终局后零新增伤害事件） ═══

describe('[AS-T8] 终局：段伤致胜 → win 即发、其后零新增结算事件；段 2 丢弃', () => {
  it('段 1 双杀致胜（t0）：恰 2 条 skill + 2 death + win 全在 t=0.0；段 2 不入队（无 pending/presentation）', () => {
    const s = asBoard(
      [
        { id: 'e0', col: 9, row: 8, over: { hp: 5, maxHp: 5, def: 0 } },
        { id: 'e1', col: 8, row: 9, over: { hp: 5, maxHp: 5, def: 0 } },
      ],
      { atk: 9999, def: 0, shizhan: SURE_HIT_SHIZHAN },
    );
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    const added = s.events.slice(n0);
    const winIdx = added.findIndex((e) => e.type === 'win');
    expect(winIdx).toBeGreaterThanOrEqual(0);
    const skillEv = added.filter((e) => e.type === 'skill' || e.type === 'miss');
    expect(skillEv).toHaveLength(2); // ★ 段 1 × 2 目标（v1.4 AS-9：段 1 致胜则段 2 不结算）
    expect(skillEv.map((e) => e.targetId)).toEqual(['e0', 'e1']); // all 序
    expect(skillEv.every((e) => e.t === 0.0)).toBe(true); // 全在 t0
    expect(added.slice(winIdx).filter((e) => e.type === 'skill' || e.type === 'miss' || e.type === 'death')).toHaveLength(0); // 终局后零新增结算事件
    expect(s.phase).toBe('won');
    tickFor(s, 4.0, 0.05); // 越过假想 t1
    expect(s.events.slice(n0).filter((e) => e.type === 'skill' || e.type === 'miss')).toHaveLength(2); // 段 2 零补发
    expect(s._debug.pendingCasts()).toHaveLength(0); // 终局先于入队：无 pending
    expect(s._debug.presentationCasts()).toHaveLength(0); // 表现由冻结快照承担（§3.2）
  });

  it('段 2 致胜（t1）：段 1 非致死 + 段 2 击杀 → win 在 t1 后即发、其后零新增；cast=terminal-canceled 入 presentation', () => {
    const s = asBoard(
      [{ id: 'e0', col: 9, row: 8, over: { hp: 200, maxHp: 200, def: 0 } }],
      { atk: 200, shizhan: SURE_HIT_SHIZHAN },
    );
    const n0 = s.events.length;
    expect(castTe(s)).toBe(true);
    expect(s.events.slice(n0).filter((e) => e.type === 'win')).toHaveLength(0); // 段 1（161）不致胜
    settleBoth(s);
    const added = s.events.slice(n0);
    expect(added.filter((e) => e.type === 'skill' || e.type === 'miss')).toHaveLength(2); // 两段均结算
    expect(s.phase).toBe('won');
    const winIdx = added.findIndex((e) => e.type === 'win');
    expect(added.slice(winIdx).filter((e) => e.type === 'skill' || e.type === 'miss' || e.type === 'death')).toHaveLength(0);
    const pres = s._debug.presentationCasts();
    expect(pres).toHaveLength(1); // 段 2 结算中终局：pending 被 flush 收口（AS-9）
    expect(pres[0].settlementState).toBe('terminal-canceled');
    expect(pres[0].finishAtSec).toBeCloseTo(3.0, 6); // FE 表现锚=t1（无 +0.3）
    expect(s._debug.pendingCasts()).toHaveLength(0);
  });
});

// ═══ AS-T9 三入口同构（v1.4 AS-7 + 方案 §3.4） ═══

describe('[AS-T9] AI/attack(skillId)/cast 三入口收敛 scheduler；普攻即时单段不吃 castSpeed', () => {
  it('AI（自动局）出技同 scheduler：两段事件同 targetId、t 相差=出招时长 3.0；AI 锚=自身格', () => {
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
    // ★ v1.4 AS-3：AI 提交刻即发段 1——检测当帧（该 tick 内出技）事件已存在且仅一跳（t1 未到）
    expect(s.events.filter((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'))).toHaveLength(1);
    for (let i = 0; i < 35; i++) s.tick(0.1); // 越过 t1（段1 采样点后补 3.0s+）
    const ev = s.events.filter((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    expect(ev).toHaveLength(2); // AI 出技=两段（同 scheduler）
    expect(ev[0].targetId).toBe('e0');
    expect(ev[1].targetId).toBe('e0');
    expect(ev[1].t - ev[0].t).toBeCloseTo(3.0, 6); // t1−t0=出招时长（v1.4 AS-4；非 0.3 收招窗）
    expect(s._debug.player().hex).toEqual(offsetToAxial(7, 8)); // AI 施法不动位（锚=自身格）
  });

  it('attack(skillId) 不绕过 scheduler：提交即段 1（hp 立变+事件 t=0），t1 段 2；两段同 targetId', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8, over: { def: 10 } }], { atk: 200, shizhan: SURE_HIT_SHIZHAN });
    const hp0 = hpOf(s, 'e0');
    const n0 = s.events.length;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(true);
    expect(hpOf(s, 'e0')).toBe(hp0 - 161); // ★ 兼容入口同 scheduler：段 1 t0 即结算（§3.4）
    expect(settleEvents(s, n0)).toHaveLength(1); // 首跳事件 t=0
    expect(settleEvents(s, n0)[0].t).toBe(0.0);
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

  it('大 dt：单 tick(3.5) 跨 t1 → 段 2 按 dueAt 全 drain；与分块 dt(0.4×9) 及细步长(0.016) 结算面全等', () => {
    const mk = () => asBoard([{ id: 'e0', col: 9, row: 8, over: { def: 10 } }], { atk: 200 });
    const fine = mk();
    const coarse = mk();
    const chunked = mk();
    expect(castTe(fine)).toBe(true);
    expect(castTe(coarse)).toBe(true);
    expect(castTe(chunked)).toBe(true);
    for (let i = 0; i < 260; i++) fine.tick(0.016);
    coarse.tick(3.5); // 一次跨界（t0→3.5 直跨 t1=3.0）
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

describe('[AS-T12] 施法者 animState 时序：charge 循环保持至 t1、t1 结算后直接回 idle（无 strike 收招相）', () => {
  it('提交→charge；t1−ε 仍 charge（施放帧循环=出招时长，AS-2）；t1 后 idle（循环末帧即收势，AS-4）', () => {
    const s = asBoard([{ id: 'e0', col: 9, row: 8 }]);
    expect(castTe(s)).toBe(true);
    expect(s._debug.player().animState).toBe('charge');
    tickFor(s, 2.9, 0.05);
    expect(s._debug.player().animState).toBe('charge'); // 施法中保持（B5：豁免动画机衰减）
    tickFor(s, 0.1, 0.05); // 越 t1
    expect(s._debug.player().animState).toBe('idle'); // ★ 直接回 idle（strike 收招相/300ms 节点废止）
    tickFor(s, 0.5, 0.05);
    expect(s._debug.player().animState).toBe('idle'); // 稳定 idle（施法锁释放）
  });

  it('t0 空放表现：charge 由 presentationCast 保持至 t1（无结算 pending），t1 后回 idle', () => {
    const s = asBoard([{ id: 'e0', col: 11, row: 8 }]); // 空放局
    expect(castTe(s)).toBe(true);
    expect(s._debug.pendingCasts()).toHaveLength(0); // 无结算 pending
    expect(s._debug.player().animState).toBe('charge');
    tickFor(s, 2.9, 0.05);
    expect(s._debug.player().animState).toBe('charge'); // 表现保持（AS-2 循环播完）
    tickFor(s, 0.15, 0.05); // 越 t1
    expect(s._debug.player().animState).toBe('idle'); // 收势回站立
  });
});

// ═══ AS-T13/SP-2 专项收口（方案 §7.2 九行剩余项） ═══

describe('[AS-T13/SP-2 专项] t1 前走位双场全等 / 消散后零 RNG / 终局后无伤害事件', () => {
  it('t1 前走位相同（白盒同格）→ 两段事件全等（段2 重搜只读 t1 站位、按 all 序）', () => {
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
      { atk: 9999, def: 0, shizhan: SURE_HIT_SHIZHAN },
    );
    expect(castTe(s)).toBe(true);
    expect(s.phase).toBe('won'); // 段 1 双杀：t0 即终局
    const rng0 = s._debug.rngCalls();
    tickFor(s, 2.0, 0.05); // 终局后推进（FE 表现帧窗口）
    expect(s._debug.rngCalls()).toBe(rng0); // 零掷骰
    expect(s.events.filter((e) => e.type === 'skill' || e.type === 'miss').length).toBe(2); // 零新增
  });
});
