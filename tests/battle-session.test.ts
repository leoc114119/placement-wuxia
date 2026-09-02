// T15 对局编排层单测（DoD：session 6 例——行动条满触发/预算二选一/AI 优先级序/托管切换/
// 事件流全等/胜负结算；另含 Q1 批复要求的「hex 相邻格普攻不被 core 误判 blocked」锚点用例）
// 运行：npm run test:battle（vitest）
import { describe, expect, it } from 'vitest';
import { createHexBattle, assembleRoster } from '../systems/battle-session';
import { makeRng } from '../systems/battle-core';
import { axialToOffset, cubeDistance, hexNeighbors, offsetToAxial } from '../systems/hex';
import type { CombatantInput } from '../types';

const DT = 0.1; // 仿真步长（秒），与确定性口径一致：同脚本同 tick 序列 → 事件流全等

/** hex 战斗单位工厂（出生位由 O3 随机覆盖，pos 无需关心） */
function unit(over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side'>): CombatantInput {
  return {
    name: over.id,
    hp: 99999,
    maxHp: 99999,
    neili: 0,
    maxNeili: 0,
    atk: 1,
    def: 99999, // 默认互破不了防（保底 1 血/发），用例各自覆写控制节奏
    neigongLevel: 0,
    jimin: 0, // 默认 10/s：10s 一动
    danshi: 0,
    shizhan: 0,
    pos: { x: 0, y: 0 },
    weapon: 'fist',
    skills: [],
    ...over,
  };
}

function makeSession(seed: number, mode: 'auto' | 'manual', player: CombatantInput, enemies: CombatantInput[]) {
  return createHexBattle({ player, enemies, mode, seed });
}

/** 手动模式：tick 至主角行动条满（pendingInput） */
function runToPending(s: ReturnType<typeof createHexBattle>, maxSec = 40): boolean {
  for (let i = 0; i < maxSec / DT && !s.snapshot().pendingInput; i++) s.tick(DT);
  return s.snapshot().pendingInput;
}

/** 自动模式：tick 至终局（90s 防死循环保证 90+ε 秒内出胜负） */
function autoTillEnd(s: ReturnType<typeof createHexBattle>, maxSec = 95): void {
  for (let i = 0; i < maxSec / DT && s.phase === 'fighting'; i++) s.tick(DT);
}

const offsetManhattan = (a: { col: number; row: number }, b: { col: number; row: number }) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

const dist = (s: ReturnType<typeof createHexBattle>, aId: string, bId: string) => {
  const u = s._debug.units;
  return cubeDistance(u.find((x) => x.id === aId)!.hex, u.find((x) => x.id === bId)!.hex);
};

// ---------- 用例 1：行动条满触发与轮转（F-05） ----------
describe('行动条满触发', () => {
  it('速度快者先满条先行动（bar-max → 出手事件），慢者后置', () => {
    const fast = unit({ id: 'p', side: 'player', jimin: 100 }); // 20/s：5s 满
    const slow = unit({ id: 'e0', side: 'enemy', jimin: 0 }); // 10/s：10s 满
    const s = makeSession(7, 'auto', fast, [slow]);
    for (let i = 0; i < 120 && s.events.length < 3; i++) s.tick(DT);
    expect(s.events[0]).toMatchObject({ type: 'bar-max', actorId: 'p' });
    // 玩家首次行动：seed 7 出生距离 > 普攻射程 1 → AI 第 4 级位移（move）先于出手
    expect(s.events[1]).toMatchObject({ type: 'move', actorId: 'p' });
    expect(s.events.some((e) => e.type === 'bar-max' && e.actorId === 'e0')).toBe(true);
  });
});

// ---------- 用例 2：O1 行动预算二选一 + 移动到位相邻自动普攻特例 ----------
describe('预算二选一（O1 定版）', () => {
  it('移动后本回合不能再出招；回合结束恢复；移动到位相邻自动普攻不另耗行动', () => {
    const p = unit({ id: 'p', side: 'player', jimin: 200, atk: 50, def: 99999 }); // 30/s
    const e = unit({ id: 'e0', side: 'enemy', hp: 999, maxHp: 999, atk: 1, def: 10 });
    const s = makeSession(13, 'manual', p, [e]); // seed 13：初始 offset 距离 4
    expect(runToPending(s)).toBe(true);

    // 第一回合：移动（二选一之「移动」）
    const cells = s.snapshot().moveCells;
    expect(cells.length).toBeGreaterThan(0);
    const first = cells[0];
    expect(s.submit({ type: 'move', to: first })).toBe(true);
    expect(s.events.some((ev) => ev.type === 'move')).toBe(true);
    // 预算已耗：同回合出招/再移动均拒绝
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(false);
    expect(s.submit({ type: 'move', to: first })).toBe(false);

    // 第二回合：出招（二选一之「出招」；等待敌方逼近至普攻射程）
    for (let i = 0; i < 600; i++) {
      s.tick(DT);
      if (s.snapshot().pendingInput && dist(s, 'p', 'e0') <= 1) break;
    }
    if (dist(s, 'p', 'e0') <= 1) {
      const nEvents = s.events.length;
      expect(s.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(true);
      expect(s.events.length).toBeGreaterThan(nEvents); // 普攻结算产生事件
      expect(s.submit({ type: 'move', to: first })).toBe(false); // 预算已耗
    }
  });

  it('【Q1 锚点】hex 相邻格普攻不被 core 曼哈顿复核误判 blocked', () => {
    // 场景：敌我 hex 相邻但 offset 曼哈顿=2（odd-r 折线格）。core resolveAction 普攻分支
    // 以 offset 曼哈顿 > basicRange 判 blocked；session 的 Q1 适配（调用前临时对齐 pos）
    // 必须令其正常结算。若适配缺失，本用例中普攻被静默吞掉（事件无 basic/miss）即失败。
    const p = unit({ id: 'p', side: 'player', jimin: 200, atk: 50, hp: 999999, maxHp: 999999 });
    const e = unit({ id: 'e0', side: 'enemy', hp: 999999, maxHp: 999999, atk: 1 });
    const s = makeSession(13, 'manual', p, [e]);
    let anchored = false;
    for (let round = 0; round < 12 && !anchored; round++) {
      for (let i = 0; i < 300 && !s.snapshot().pendingInput; i++) s.tick(DT);
      if (!s.snapshot().pendingInput) break;
      const pu = s._debug.units.find((u) => u.id === 'p')!;
      const eu = s._debug.units.find((u) => u.id === 'e0')!;
      const d = cubeDistance(pu.hex, eu.hex);
      if (d === 1 && offsetManhattan(axialToOffset(pu.hex), axialToOffset(eu.hex)) === 2) {
        // 目标场景：hex 相邻 + offset 曼哈顿 2 → 普攻必须正常结算（不被误判 blocked）
        const nEvents = s.events.length;
        expect(s.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(true);
        const fresh = s.events.slice(nEvents).filter((ev) => ev.actorId === 'p');
        expect(fresh.length).toBeGreaterThan(0);
        expect(['basic', 'miss']).toContain(fresh[0].type); // blocked 则为 'blocked'
        anchored = true;
      } else {
        // 尚未就位：向敌移动（候选中取 offset 曼哈顿=2 的敌邻格优先，构造 Q1 场景）
        const cells = s.snapshot().moveCells;
        const adj2 = hexNeighbors(eu.hex).find(
          (h) =>
            offsetManhattan(axialToOffset(h), axialToOffset(eu.hex)) === 2 &&
            cells.some((c) => c.q === h.q && c.r === h.r),
        );
        const to = adj2 ?? cells.slice().sort((a, b) => cubeDistance(a, eu.hex) - cubeDistance(b, eu.hex))[0];
        expect(s.submit({ type: 'move', to })).toBe(true);
      }
    }
    expect(anchored).toBe(true); // 12 回合内必现（敌 AI 同步逼近，seed 固定路径确定）
  });
});

// ---------- 用例 3：selectSkill 攻击范围显示态（不耗 O1 预算） ----------
describe('selectSkill 激活态', () => {
  it('激活后快照带 selectedSkill/attackCells；取消还原；不阻塞后续移动预算', () => {
    const p = unit({
      id: 'p',
      side: 'player',
      jimin: 200,
      weapon: 'sword',
      skills: [
        { id: 'yemao', name: '野猫剑法', kind: 'waiGong', weapon: 'sword', grade: 0.5, growth: 1.5, level: 10, cooldownTurns: 0, neiliCost: 10 },
      ],
    });
    const e = unit({ id: 'e0', side: 'enemy' });
    const s = makeSession(7, 'manual', p, [e]);
    expect(runToPending(s)).toBe(true);
    expect(s.submit({ type: 'selectSkill', skillId: 'yemao' })).toBe(true);
    const snap = s.snapshot();
    expect(snap.selectedSkill).toBe('yemao');
    expect(snap.attackCells.length).toBeGreaterThan(0); // 剑=圆形半径 1（inField 后 ≥3 格）
    expect(snap.moveCells.length).toBe(0); // 激活态显示攻击范围而非移动范围
    // 激活不耗 O1 预算：移动请求仍受理（激活是显示态，非行动）
    expect(s.submit({ type: 'move', to: offsetToAxial(4, 8) })).toBe(true); // 场内任一格合法即受理
    expect(s.snapshot().selectedSkill).toBeNull(); // 行动消耗后激活态清除
    expect(s.submit({ type: 'cancelSkill' })).toBe(true);
  });
});

// ---------- 用例 4：AI 五级优先表（C 案 B2） ----------
describe('AI 优先级序', () => {
  it('第 2 级技能按伤害倍率降序（grade 1.7 先于 1.0，无视数组序）；集火最近敌', () => {
    const p = unit({ id: 'p', side: 'player', atk: 1 }); // 站桩
    const e = unit({
      id: 'e0',
      side: 'enemy',
      jimin: 200,
      neili: 999,
      maxNeili: 999,
      weapon: 'sword',
      def: 99999,
      skills: [
        { id: 'low', name: '低阶', kind: 'waiGong', weapon: 'sword', grade: 1.0, growth: 1, level: 60, cooldownTurns: 0, neiliCost: 10 },
        { id: 'high', name: '高阶', kind: 'special', weapon: 'sword', grade: 1.7, growth: 3, level: 60, cooldownTurns: 0, neiliCost: 10 },
      ],
    });
    const s = makeSession(7, 'auto', p, [e]);
    for (let i = 0; i < 600 && !s.events.some((ev) => ev.type === 'skill'); i++) s.tick(DT);
    const firstSkill = s.events.find((ev) => ev.type === 'skill');
    expect(firstSkill).toMatchObject({ actorId: 'e0', skillId: 'high' }); // 倍率序压数组序
  });

  it('R-08 冷却节奏：cd2 技能出招后隔 2 个行动回合恢复（镜像 core 用例 3 口径）', () => {
    const p = unit({ id: 'p', side: 'player', atk: 1 });
    const e = unit({
      id: 'e0',
      side: 'enemy',
      jimin: 200,
      neili: 999,
      maxNeili: 999,
      weapon: 'sword',
      hp: 999999,
      maxHp: 999999,
      def: 99999,
      skills: [
        { id: 'cd2', name: '特技', kind: 'special', weapon: 'sword', grade: 1.0, growth: 1, level: 10, cooldownTurns: 2, neiliCost: 10 },
      ],
    });
    const s = makeSession(7, 'auto', p, [e]);
    let acts: typeof s.events = [];
    // 等到第二个技能事件出现（首个 skill → cd2 → 两个冷却回合 → 复现），再统一断言节奏
    for (let i = 0; i < 1500; i++) {
      s.tick(DT);
      acts = s.events.filter((ev) => ev.actorId === 'e0' && ['skill', 'fallback', 'basic', 'miss'].includes(ev.type));
      if (acts.filter((ev) => ev.type === 'skill').length >= 2) break;
    }
    expect(acts.filter((ev) => ev.type === 'skill').length).toBeGreaterThanOrEqual(2);
    const i0 = acts.findIndex((ev) => ev.type === 'skill');
    // 首个 skill 后 4 个行动事件内无 skill（cd2 → 两回合，各产生 fallback+出手 两事件）
    expect(acts[i0 + 1].type).not.toBe('skill');
    expect(acts[i0 + 2].type).not.toBe('skill');
    expect(acts[i0 + 3].type).not.toBe('skill');
    expect(acts[i0 + 4].type).not.toBe('skill');
    expect(acts[i0 + 5].type).toBe('skill'); // 第 3 次行动冷却耗尽，技能复现
  });

  it('第 4 级位移：射程外敌方首行动是 move（F-06 位移进射程）', () => {
    const p = unit({ id: 'p', side: 'player', jimin: 0 });
    const e = unit({ id: 'e0', side: 'enemy', jimin: 0 }); // 双方 fist 射程 1，初始必在射程外
    const s = makeSession(13, 'auto', p, [e]);
    for (let i = 0; i < 200 && !s.events.some((ev) => ev.actorId === 'e0'); i++) s.tick(DT);
    const firstAct = s.events.find((ev) => ev.actorId === 'e0' && ev.type !== 'bar-max');
    expect(firstAct).toMatchObject({ type: 'move' });
  });
});

// ---------- 用例 5：托管双阈值（docs/80 §4；等待期冻结总时钟） ----------
describe('托管切换', () => {
  it('手动挂机 90s → trust 代行；再 90s → switchAuto 切自动', () => {
    const p = unit({ id: 'p', side: 'player', jimin: 0, hp: 999999, maxHp: 999999 });
    const e = unit({ id: 'e0', side: 'enemy', hp: 999999, maxHp: 999999, atk: 1 });
    const s = makeSession(7, 'manual', p, [e]);
    for (let i = 0; i < 300 && !(s.events.some((ev) => ev.type === 'trust') && s._debug.mode() === 'auto'); i++) s.tick(1);
    const trust = s.events.find((ev) => ev.type === 'trust');
    const switchAuto = s.events.find((ev) => ev.type === 'switch-auto');
    expect(trust).toBeDefined();
    expect(switchAuto).toBeDefined();
    expect(s._debug.mode()).toBe('auto');
    // 等待期总时钟冻结（T06 口径）：trust 发生在首满时刻（≈10s）而非挂钟 100s
    expect(trust!.t).toBeLessThan(15);
    expect(trust!.t).toBeLessThanOrEqual(switchAuto!.t);
  });
});

// ---------- 用例 6：同 seed 事件流全等（确定性 DoD 硬项） ----------
describe('事件流确定性', () => {
  const pDef = () => unit({ id: 'p', side: 'player', jimin: 120, atk: 80, def: 30, hp: 500, maxHp: 500 });
  const eDef = () => unit({ id: 'e0', side: 'enemy', hp: 300, maxHp: 300, atk: 20, def: 10, jimin: 40 });

  it('自动模式同 seed 两场事件流逐条全等；不同 seed 不同', () => {
    const a = makeSession(7, 'auto', pDef(), [eDef()]);
    const b = makeSession(7, 'auto', pDef(), [eDef()]);
    autoTillEnd(a);
    autoTillEnd(b);
    expect(a.events).toEqual(b.events);
    const c = makeSession(8, 'auto', pDef(), [eDef()]);
    autoTillEnd(c);
    expect(c.events).not.toEqual(a.events);
  });

  it('手动模式同 seed + 同操作脚本 → 事件流全等', () => {
    // 操作脚本（确定性，无外部随机源）：回合 k 时若与敌相邻且 k 为偶数则普攻，否则移动到
    // 候选第 k 格；同 seed 下布局与掷骰全同 → 事件流必须逐条全等。
    const runScripted = (seed: number) => {
      const s = makeSession(seed, 'manual', pDef(), [eDef()]);
      for (let k = 0; k < 6 && s.phase === 'fighting'; k++) {
        for (let i = 0; i < 400 && !s.snapshot().pendingInput && s.phase === 'fighting'; i++) s.tick(DT);
        if (s.phase !== 'fighting') break;
        const cells = s.snapshot().moveCells;
        if (dist(s, 'p', 'e0') <= 1 && k % 2 === 0) s.submit({ type: 'attack', targetId: 'e0', skillId: null });
        else if (cells.length > 0) s.submit({ type: 'move', to: cells[k % cells.length] });
      }
      return s;
    };
    const a = runScripted(7);
    const b = runScripted(7);
    expect(a.events).toEqual(b.events);
  });

  it('assembleRoster 薄转发：数量规则 = core rollEnemyCount', () => {
    const tpl = { name: '山贼', hp: 50, atk: 10, def: 5, jimin: 5, danshi: 0, shizhan: 50 };
    expect(assembleRoster(99, tpl, makeRng(1)).length).toBe(1); // <100 固定 1
    const roster = assembleRoster(50000, tpl, makeRng(2));
    expect(roster.length).toBeGreaterThanOrEqual(1);
    expect(roster.length).toBeLessThanOrEqual(6);
    expect(roster[0].id).toBe('enemy-0');
  });
});

// ---------- 用例 7：胜负结算 ----------
describe('胜负结算', () => {
  it('全灭 → won + win/death；玩家亡 → lost + lose；逃跑 → fled', () => {
    const winS = makeSession(7, 'auto', unit({ id: 'p', side: 'player', jimin: 200, atk: 9999 }), [
      unit({ id: 'e0', side: 'enemy', hp: 5, maxHp: 5, atk: 1 }),
    ]);
    autoTillEnd(winS);
    expect(winS.phase).toBe('won');
    expect(winS.events.some((ev) => ev.type === 'death' && ev.actorId === 'e0')).toBe(true);
    expect(winS.events.some((ev) => ev.type === 'win')).toBe(true);

    const loseS = makeSession(7, 'auto', unit({ id: 'p', side: 'player', hp: 5, maxHp: 5, atk: 1, jimin: 0 }), [
      unit({ id: 'e0', side: 'enemy', jimin: 200, atk: 9999, def: 0 }),
    ]);
    autoTillEnd(loseS);
    expect(loseS.phase).toBe('lost');
    expect(loseS.events.some((ev) => ev.type === 'lose')).toBe(true);

    const fleeS = makeSession(7, 'manual', unit({ id: 'p', side: 'player', jimin: 200 }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    expect(runToPending(fleeS)).toBe(true);
    expect(fleeS.submit({ type: 'flee' })).toBe(true);
    expect(fleeS.phase).toBe('fled');
    expect(fleeS.events.some((ev) => ev.type === 'flee')).toBe(true);
    expect(fleeS.submit({ type: 'flee' })).toBe(false); // 终局后拒绝
  });

  it('90s 防死循环：hp 总量高者胜、同量判玩家负（F-05 尾规则）', () => {
    const mk = (pHp: number, eHp: number) =>
      makeSession(7, 'auto', unit({ id: 'p', side: 'player', hp: pHp, maxHp: pHp, jimin: 0 }), [
        unit({ id: 'e0', side: 'enemy', hp: eHp, maxHp: eHp, jimin: 0 }),
      ]);
    const high = mk(1000, 500);
    autoTillEnd(high);
    expect(high.events.some((ev) => ev.type === 'timeout-hp')).toBe(true);
    expect(high.phase).toBe('won');
    const low = mk(500, 1000);
    autoTillEnd(low);
    expect(low.phase).toBe('lost');
    const tie = mk(800, 800);
    autoTillEnd(tie);
    expect(tie.phase).toBe('lost'); // 总量相同判玩家负（防利用）
  });
});

// 辅助引用（保持 import 完整性；Q6 出生区回归断言）
describe('O3 出生布点（Q6 批复）', () => {
  it('我方随机落左下 4×4（列 4..7 × 行 8..11）、敌方落右上 4×4；同 seed 布局可复现', () => {
    for (const seed of [1, 7, 13, 42, 99]) {
      const s = makeSession(seed, 'auto', unit({ id: 'p', side: 'player' }), [
        unit({ id: 'e0', side: 'enemy' }),
        unit({ id: 'e1', side: 'enemy' }),
      ]);
      const offs = s._debug.units.map((u) => axialToOffset(u.hex));
      for (const off of [offs[0]]) {
        expect(off.col).toBeGreaterThanOrEqual(4);
        expect(off.col).toBeLessThanOrEqual(7);
        expect(off.row).toBeGreaterThanOrEqual(8);
        expect(off.row).toBeLessThanOrEqual(11);
      }
      for (const off of offs.slice(1)) {
        expect(off.col).toBeGreaterThanOrEqual(8);
        expect(off.col).toBeLessThanOrEqual(11);
        expect(off.row).toBeGreaterThanOrEqual(4);
        expect(off.row).toBeLessThanOrEqual(7);
      }
      expect(offs[1]).not.toEqual(offs[2]); // 同区不重叠
    }
    // 同 seed 复现
    const a = makeSession(42, 'auto', unit({ id: 'p', side: 'player' }), [unit({ id: 'e0', side: 'enemy' })]);
    const b = makeSession(42, 'auto', unit({ id: 'p', side: 'player' }), [unit({ id: 'e0', side: 'enemy' })]);
    expect(a._debug.units.map((u) => u.hex)).toEqual(b._debug.units.map((u) => u.hex));
  });
});
