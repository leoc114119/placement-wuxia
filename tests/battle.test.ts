// T05 战斗核心单测（需求表 #1~#8 对应用例）
// 运行：npm run test:battle（vitest，框架选择理由见 tasks/done/T05-done.md）
import { describe, expect, it } from 'vitest';
import {
  MANUAL_TIMEOUT_S,
  fillRate,
  makeEnemy,
  makeInitialPlayer,
  makeRng,
  rollEnemyCount,
  runBattleHeadless,
  stepManualTimeout,
  type ManualTimeoutState,
} from '../systems/battle-core';
import type { BattleConfig, CombatantInput } from '../types';

/** 快速造战斗单位（属性按用例需要覆写） */
function unit(over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side'>): CombatantInput {
  return {
    name: over.id,
    hp: 100,
    maxHp: 100,
    neili: 0,
    maxNeili: 0,
    atk: 100,
    def: 10,
    neigongLevel: 0,
    jimin: 27,
    danshi: 0, // 用例默认不暴击（胆识 0）
    shizhan: 0,
    pos: { x: 4, y: 9 }, // 默认贴脸（距离 1），保证普攻可达
    weapon: null,
    skills: [],
    ...over,
  };
}

function battle(player: CombatantInput, enemies: CombatantInput[], mode: 'auto' | 'manual' = 'auto', seed = 20260821) {
  const config: BattleConfig = { player, enemies, mode, seed };
  return runBattleHeadless(config);
}

// ---------- 用例 1：行动条 F-05（满 100 即行动，速度决定顺序） ----------
describe('F-05 行动条', () => {
  it('速度快者先出手；fillRate 公式 = (100+内功×3+机敏)/10', () => {
    expect(fillRate(unit({ id: 'p', side: 'player', neigongLevel: 10, jimin: 27 }))).toBeCloseTo(15.7);
    const fast = unit({ id: 'fast', side: 'player', jimin: 100 }); // 20/s
    const slow = unit({ id: 'slow', side: 'enemy', jimin: 0, atk: 1, hp: 9999, maxHp: 9999 }); // 10/s
    const r = battle(fast, [slow]);
    expect(r.logs[0].actorId).toBe('fast'); // 行动条先满者先行动
    expect(r.logs[0].round).toBe(1);
  });
});

// ---------- 用例 2：R-07 敌方档位 ----------
describe('R-07 敌方数量档位', () => {
  it('<100 → 固定 1；边界 100 → 进入 1-3 档；边界 10000 → 进入 1-6 档', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 50; i++) expect(rollEnemyCount(99, rng)).toBe(1);
    for (let i = 0; i < 200; i++) {
      const n = rollEnemyCount(100, rng);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
    for (let i = 0; i < 200; i++) {
      const n = rollEnemyCount(10000, rng);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('概率分布符合 docs/80 §2.2（大样本频率 ±5%）', () => {
    const rng = makeRng(7);
    const N = 20000;
    const mid = [0, 0, 0, 0];
    const high = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      mid[rollEnemyCount(5000, rng)]++;
      high[rollEnemyCount(99999, rng)]++;
    }
    // 1-3 档 50/35/15
    expect(mid[1] / N).toBeCloseTo(0.5, 1);
    expect(mid[2] / N).toBeCloseTo(0.35, 1);
    expect(mid[3] / N).toBeCloseTo(0.15, 1);
    // 1-6 档 10/25/30/20/10/5
    expect(high[1] / N).toBeCloseTo(0.1, 1);
    expect(high[3] / N).toBeCloseTo(0.3, 1);
    expect(high[6] / N).toBeCloseTo(0.05, 1);
  });
});

// ---------- 用例 3：R-08 冷却 ----------
describe('R-08 冷却（回合制，随自身行动递减）', () => {
  it('冷却 2 的武功：出招后 2 次行动内不可再用，第 3 次行动恢复', () => {
    const player = unit({
      id: 'p',
      side: 'player',
      neili: 999,
      maxNeili: 999,
      weapon: 'sword',
      pos: { x: 4, y: 10 },
      atk: 30, // 低攻拖长战斗，观察多次行动
      skills: [
        {
          id: 'skill-cd2',
          name: '特技',
          kind: 'special',
          weapon: 'sword',
          grade: 1.0,
          growth: 3,
          level: 10,
          cooldownTurns: 2,
          neiliCost: 10,
        },
      ],
    });
    const enemy = unit({
      id: 'e',
      side: 'enemy',
      hp: 99999,
      maxHp: 99999,
      atk: 1,
      pos: { x: 4, y: 9 }, // 距离 1，剑档 1 射程内
    });
    const r = battle(player, [enemy]);
    const playerLogs = r.logs.filter((l) => l.actorId === 'p' && (l.action === 'skill' || l.action === 'fallback'));
    expect(playerLogs[0].action).toBe('skill'); // 第 1 次行动：出招
    expect(playerLogs[0].skillId).toBe('skill-cd2');
    expect(playerLogs[1].action).toBe('fallback'); // 冷却 2 → 普攻兜底
    expect(playerLogs[2].action).toBe('fallback');
    expect(playerLogs[3].action).toBe('skill'); // 冷却耗尽，恢复出招
    expect(playerLogs[3].skillId).toBe('skill-cd2');
  });
});

// ---------- 用例 4：R-09 内力（不足 → 普攻兜底）+ 玩家初始 ----------
describe('R-09 内力消耗', () => {
  it('初始玩家（0 内力）全程仅普攻兜底，野猫剑法不可出招', () => {
    const p = makeInitialPlayer(); // 100 血 / 0 内力 / 野猫剑法耗内 10
    expect(p.hp).toBe(100);
    expect(p.neili).toBe(0);
    expect(p.atk).toBe(119);
    expect(p.def).toBe(70);
    const enemy = unit({ id: 'e', side: 'enemy', hp: 1, maxHp: 1, atk: 1, pos: { x: 4, y: 9 } });
    const r = battle(p, [enemy]);
    expect(r.winner).toBe('player');
    const playerActions = r.logs.filter((l) => l.actorId === 'player');
    expect(playerActions.length).toBeGreaterThan(0);
    for (const l of playerActions) {
      expect(l.skillId).toBeUndefined(); // 从未出武功
      expect(['fallback', 'basic', 'miss']).toContain(l.action); // fallback=兜底提示，basic=普攻伤害
    }
  });

  it('内力耗尽后自动降级普攻（R-02：耗尽只能普攻）', () => {
    const player = unit({
      id: 'p',
      side: 'player',
      neili: 10, // 只够 1 次
      maxNeili: 10,
      weapon: 'sword',
      atk: 30,
      skills: [
        {
          id: 'yemao',
          name: '野猫剑法',
          kind: 'waiGong',
          weapon: 'sword',
          grade: 0.5,
          growth: 1.5,
          level: 10,
          cooldownTurns: 0,
          neiliCost: 10,
        },
      ],
    });
    const enemy = unit({ id: 'e', side: 'enemy', hp: 99999, maxHp: 99999, atk: 1, pos: { x: 4, y: 9 } });
    const r = battle(player, [enemy]);
    const acts = r.logs.filter((l) => l.actorId === 'p' && (l.action === 'skill' || l.action === 'fallback'));
    expect(acts[0].action).toBe('skill'); // 第 1 次：内力够
    for (let i = 1; i < acts.length; i++) expect(acts[i].action).toBe('fallback'); // 之后内力空 → 兜底
  });
});

// ---------- 用例 5：R-05 射程（暗器 4-6-9，普攻自动寻敌） ----------
describe('R-05 射程', () => {
  const hiddenSkill = {
    id: 'anqi',
    name: '满天花雨',
    kind: 'hiddenWeapon' as const,
    weapon: 'hidden' as const,
    grade: 1.0 as const,
    growth: 3,
    cooldownTurns: 1,
    neiliCost: 0,
    level: 60, // 档 3 → 射程 9
  };
  const thrower = (pos: { x: number; y: number }) =>
    unit({ id: 'p', side: 'player', weapon: 'hidden', skills: [{ ...hiddenSkill }], pos });

  it('满档暗器射程 9：距离 9 可及，距离 13 超射程无法出手', () => {
    const far = unit({ id: 'e', side: 'enemy', hp: 1, maxHp: 1, atk: 1, pos: { x: 0, y: 1 } }); // 4+9=13
    const r1 = battle(thrower({ x: 4, y: 10 }), [unit({ id: 'e', side: 'enemy', hp: 1, maxHp: 1, atk: 1, pos: { x: 4, y: 1 } })]); // 距离 9
    expect(r1.logs.some((l) => l.action === 'skill' && l.skillId === 'anqi')).toBe(true);
    const r2 = battle(thrower({ x: 4, y: 10 }), [far]);
    expect(r2.logs.filter((l) => l.actorId === 'p').every((l) => l.action === 'blocked')).toBe(true);
  });

  it('低档暗器（Lv10）射程仅 4：距离 9 的敌人打不到', () => {
    const low = thrower({ x: 4, y: 10 });
    low.skills = [{ ...hiddenSkill, level: 10 }];
    const r = battle(low, [unit({ id: 'e', side: 'enemy', hp: 1, maxHp: 1, atk: 1, pos: { x: 4, y: 1 } })]);
    expect(r.logs.filter((l) => l.actorId === 'p').every((l) => l.action === 'blocked')).toBe(true);
  });
});

// ---------- 用例 6：手动 90s 托管状态机 ----------
describe('手动超时状态转移（docs/80 §4）', () => {
  it('满 90s → trust 代行；再满 90s → switchAuto 切自动；事件之间无跳变', () => {
    let s: ManualTimeoutState = { stage: 0, idleSec: 0 };
    const dt = 1;
    let trustAt = -1;
    let autoAt = -1;
    for (let sec = 1; sec <= 200; sec++) {
      const r = stepManualTimeout(s, dt);
      s = r.state;
      if (r.event === 'trust' && trustAt < 0) trustAt = sec;
      if (r.event === 'switchAuto' && autoAt < 0) autoAt = sec;
    }
    expect(trustAt).toBe(MANUAL_TIMEOUT_S); // 第 90s 托管
    expect(autoAt).toBe(2 * MANUAL_TIMEOUT_S); // 第 180s 切自动
  });

  it('自动模式无操作超时（不产生任何超时事件）', () => {
    // 自动模式下战斗不需要玩家操作：跑一局自动战斗，日志不含 timeout-* 事件
    const r = battle(unit({ id: 'p', side: 'player', atk: 200 }), [
      unit({ id: 'e', side: 'enemy', hp: 50, maxHp: 50, atk: 1 }),
    ]);
    expect(r.winner).toBe('player');
    expect(r.logs.some((l) => l.action.startsWith('timeout'))).toBe(false);
  });
});

// ---------- 用例 7：胜负判定 + 防死循环 ----------
describe('胜负与防死循环（F-05）', () => {
  it('全灭判胜（annihilate）：强玩家秒杀敌', () => {
    const r = battle(unit({ id: 'p', side: 'player', atk: 500 }), [
      unit({ id: 'e', side: 'enemy', hp: 30, maxHp: 30, atk: 1 }),
    ]);
    expect(r.winner).toBe('player');
    expect(r.reason).toBe('annihilate');
    expect(r.finalHp.enemy).toBe(0);
    expect(r.duration).toBeLessThan(90);
  });

  it('90s 未分胜负 → hp 总量高者胜（timeout-hp）；总量相同判玩家负', () => {
    const mk = (hp: number) => [unit({ id: 'e', side: 'enemy', hp, maxHp: hp, atk: 1, pos: { x: 4, y: 1 } })];
    // 双方射程外互相打不到（剑 3 / 拳 1 vs 距离 9）→ 死磕到 90s
    const pHigh = unit({ id: 'p', side: 'player', hp: 200, maxHp: 200, weapon: 'sword', pos: { x: 4, y: 10 } });
    expect(battle(pHigh, mk(100)).winner).toBe('player'); // 200 > 100
    const pLow = unit({ id: 'p', side: 'player', hp: 50, maxHp: 50, weapon: 'sword', pos: { x: 4, y: 10 } });
    expect(battle(pLow, mk(100)).winner).toBe('enemy'); // 50 < 100
    const pEq = unit({ id: 'p', side: 'player', hp: 100, maxHp: 100, weapon: 'sword', pos: { x: 4, y: 10 } });
    const tie = battle(pEq, mk(100));
    expect(tie.reason).toBe('timeout-hp');
    expect(tie.winner).toBe('enemy'); // 总量相同 → 判玩家负（防利用）
    expect(tie.duration).toBe(90);
  });

  it('玩家阵亡判敌方胜', () => {
    const r = battle(unit({ id: 'p', side: 'player', hp: 5, maxHp: 5, atk: 1, danshi: 0 }), [
      unit({ id: 'e', side: 'enemy', atk: 200, jimin: 0 }),
    ]);
    expect(r.winner).toBe('enemy');
  });
});

// ---------- 用例 8：BattleLog 类型 + makeEnemy 工厂 ----------
describe('BattleLog 类型与工厂', () => {
  it('日志字段完整（回合/行动者/动作/伤害/结果），敌方工厂按 R-07 布点', () => {
    const e = makeEnemy(0, { name: '山贼', hp: 52, atk: 30, def: 15, jimin: 5, danshi: 2, shizhan: 120 });
    expect(e.id).toBe('enemy-0');
    expect(e.pos.y).toBe(1); // 敌方 y=1 行（P2-5）
    expect(e.weapon).toBe('fist');
    const r = battle(unit({ id: 'p', side: 'player', atk: 500, weapon: 'fist' }), [
      { ...e, hp: 1, maxHp: 1, pos: { x: 4, y: 9 } },
    ]);
    const hit = r.logs.find((l) => l.damage > 0);
    expect(hit).toBeDefined();
    expect(hit!.round).toBeGreaterThan(0);
    expect(hit!.t).toBeGreaterThanOrEqual(0);
    expect(hit!.actorId).toBe('p');
    expect(hit!.action).toBe('basic');
    expect(hit!.targetId).toBe('enemy-0');
    expect(hit!.crit).toBe(false);
  });
});
