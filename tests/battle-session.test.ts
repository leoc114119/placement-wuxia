// T18 · battle-session 重构验收测试（唯一真源 = 战斗交互行为规格.md v1.0 §五 测试推导矩阵）
// 规则：每条规格 ≥1 用例；用例名携带条目编号；实现变更不得改写断言方向（规格改走规格变更）。
// 运行：npm run test:battle（vitest，node 环境）
import { describe, expect, it } from 'vitest';
import {
  createHexBattle,
  assembleRoster,
  NEILI_COST_PER_CAST,
  FIELD_COL_MIN,
  FIELD_COL_MAX,
  FIELD_ROW_MIN,
  FIELD_ROW_MAX,
  type HexBattleSession,
} from '../systems/battle-session';
import { makeRng } from '../systems/battle-core';
import { axialToOffset, cubeDistance, hexNeighbors, jumpReachable, movePower, offsetToAxial, reachable } from '../systems/hex';
import type { CombatantInput, SkillDef } from '../types';

const DT = 0.1;

/** hex 战斗单位工厂（出生位由 D1 锚点随机覆盖；未显式配置内力的我方单位由 session 应用 MVP 口径 100） */
function unit(over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side'>): CombatantInput {
  return {
    name: over.id,
    hp: 999999,
    maxHp: 999999,
    neili: 0,
    maxNeili: 0,
    atk: 1,
    def: 99999,
    neigongLevel: 0,
    jimin: 0,
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

/** SEL-1：tick 至输入态（条满 + 手动） */
function runToPending(s: HexBattleSession, maxSec = 40): boolean {
  for (let i = 0; i < maxSec / DT && !s.snapshot().pendingInput; i++) s.tick(DT);
  return s.snapshot().pendingInput;
}

/** 自动模式：tick 至终局（BAR-5 90s 防死循环保底） */
function autoTillEnd(s: HexBattleSession, maxSec = 95): void {
  for (let i = 0; i < maxSec / DT && s.phase === 'fighting'; i++) s.tick(DT);
}

const dist = (s: HexBattleSession, aId: string, bId: string) => {
  const u = s._debug.units;
  return cubeDistance(u.find((x) => x.id === aId)!.hex, u.find((x) => x.id === bId)!.hex);
};

const inFieldOf = (_s: HexBattleSession) => (p: { q: number; r: number }) => {
  const off = axialToOffset(p);
  return off.col >= FIELD_COL_MIN && off.col <= FIELD_COL_MAX && off.row >= FIELD_ROW_MIN && off.row <= FIELD_ROW_MAX;
};

const eu = (s: HexBattleSession) => s._debug.units.find((u) => u.id === 'e0')!;
const pu = (s: HexBattleSession) => s._debug.units.find((u) => u.id === 'p')!;
const snapHas = (cells: Array<{ q: number; r: number }>, p: { q: number; r: number }) =>
  cells.some((c) => c.q === p.q && c.r === p.r);

/** 推进到输入态 + 贴脸（敌 AI 主动贴身/玩家主动靠近，不干等触发托管） */
function waitAdjacent(s: HexBattleSession, maxRounds = 40): void {
  for (let guard = 0; guard < maxRounds; guard++) {
    for (let i = 0; i < 600 && !s.snapshot().pendingInput && s.phase === 'fighting'; i++) s.tick(DT);
    if (s.phase !== 'fighting') throw new Error('战斗提前结束');
    if (dist(s, 'p', 'e0') <= 1) return;
    const cells = s.snapshot().moveCells;
    const target = eu(s);
    const to = cells.slice().sort((a, b) => cubeDistance(a, target.hex) - cubeDistance(b, target.hex))[0];
    if (to) s.submit({ type: 'move', to });
  }
  throw new Error('40 回合内未形成贴脸局面');
}

/** 常用技能定义（Q2 内力口径：释放消耗 = NEILI_COST_PER_CAST，SkillDef.neiliCost 为历史字段不参与判定） */
function teSkill(over: Partial<SkillDef> = {}): SkillDef {
  return {
    id: 'te', name: '特技', kind: 'special', weapon: 'sword',
    grade: 1.7, growth: 3, level: 10, cooldownTurns: 2, neiliCost: 10,
    ...over,
  };
}
function qingSkill(over: Partial<SkillDef> = {}): SkillDef {
  return {
    id: 'qing', name: '草上飞', kind: 'qingGong', weapon: null,
    grade: 1.3, growth: 1, level: 10, cooldownTurns: 0, neiliCost: 0,
    ...over,
  };
}

// ══════════ 移动可达（规格 §三 MV） ══════════

describe('[MV-0/MV-1] 普通可达：BFS 不可穿、限可动区、不含占格', () => {
  it('moveCells ≡ 普通可达集：单位格不含、可动区外不含（几何背书 tests/hex.test 用例④）', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, skills: [qingSkill()] }), [
      unit({ id: 'e0', side: 'enemy', name: 'shanzei' }),
    ]);
    expect(runToPending(s)).toBe(true);
    const cells = s.snapshot().moveCells;
    const power = movePower(pu(s).skills);
    const occ = s._debug.units.filter((u) => !u.dead).map((u) => u.hex);
    const normal = reachable(pu(s).hex, power, occ, inFieldOf(s));
    expect(cells.length).toBe(normal.length); // 集合全等（对并集回归的充要守卫）
    for (const c of cells) {
      expect(occ.some((o) => o.q === c.q && o.r === c.r)).toBe(false); // 占格不可落脚
      expect(inFieldOf(s)(c)).toBe(true); // 限可动区
    }
  });

  it('[MV-1] 移动提交：合法格位移 + move 事件（toX/toY=offset）', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200 }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    expect(runToPending(s)).toBe(true);
    const to = s.snapshot().moveCells[0];
    const off = axialToOffset(to);
    expect(s.submit({ type: 'move', to })).toBe(true);
    expect(pu(s).hex).toEqual(to);
    expect(s.events[s.events.length - 1]).toMatchObject({ type: 'move', actorId: 'p', toX: off.col, toY: off.row });
  });

  it('[MV-1/MV-2] 移动拒绝：出区/占格 → rejected:invalid；轻功态点金格外 → rejected:invalid 且不取消激活', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, skills: [qingSkill()] }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    expect(runToPending(s)).toBe(true);
    // 出可动区
    const n1 = s.events.length;
    expect(s.submit({ type: 'move', to: offsetToAxial(0, 0) })).toBe(false);
    expect(s.events.slice(n1)).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'invalid' }));
    // 轻功态：金格集合外（敌占格 / 非金空格）→ rejected(invalid) 且不取消激活（MV-2/SEL-5 反向）
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    const n2 = s.events.length;
    expect(s.submit({ type: 'move', to: eu(s).hex })).toBe(false); // 敌占格
    expect(s.events.slice(n2)).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'invalid' }));
    expect(s.snapshot().selectedSkill).toBe('qing'); // 不取消激活（MV-2）
    const normal = reachable(pu(s).hex, movePower(pu(s).skills), s._debug.units.filter((u) => !u.dead).map((u) => u.hex), inFieldOf(s));
    const green = normal.find((g) => !snapHas(s.snapshot().moveCells, g) && cubeDistance(pu(s).hex, g) > 2);
    if (green) {
      const n3 = s.events.length;
      expect(s.submit({ type: 'move', to: green })).toBe(false); // 非金空格
      expect(s.events.slice(n3)).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'invalid' }));
      expect(s.snapshot().selectedSkill).toBe('qing'); // 仍不取消
    }
  });
});

describe('[MV-2] 轻功跳跃态：金格=纯距离半径、可穿越', () => {
  it('[MV-2] 轻功激活：金格可穿越（隔单位对侧格 ∈ 集合）、单位格 ∉、逐格 cube ≤ ⌊power/2⌋', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, skills: [qingSkill({ grade: 1.3, level: 10 })] }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    expect(runToPending(s)).toBe(true);
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    const snap = s.snapshot();
    expect(snap.moveKind).toBe('jump');
    expect(snap.attackCells).toEqual([]); // MV-2：攻击范围高亮必须为空（金绿互斥）
    const jumpRange = Math.floor(movePower(pu(s).skills) / 2);
    const occ = s._debug.units.filter((u) => !u.dead).map((u) => u.hex);
    for (const c of snap.moveCells) {
      expect(cubeDistance(pu(s).hex, c)).toBeLessThanOrEqual(jumpRange); // 纯距离
      expect(occ.some((o) => o.q === c.q && o.r === c.r)).toBe(false); // 落点排除单位格
      expect(inFieldOf(s)(c)).toBe(true);
    }
  });

  it('[F1 姊妹端到端] 跳跃跨越单位：敌占邻格挡路，其后格 ∈ moveCells 且点格位移成功（isJump 真值）', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, skills: [qingSkill()] }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    waitAdjacent(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    const snap = s.snapshot();
    expect(snap.moveKind).toBe('jump');
    const Y = hexNeighbors(eu(s).hex).find(
      (h) => cubeDistance(pu(s).hex, h) === 2 && snap.moveCells.some((m) => m.q === h.q && m.r === h.r),
    );
    expect(Y).toBeDefined(); // 穿越挡路单位直达（纯距离筛选，无连通污染）
    expect(s.submit({ type: 'move', to: Y! })).toBe(true);
    expect(pu(s).hex).toEqual(Y!);
    const actor = s.snapshot().actors.find((a) => a.id === 'p')!;
    expect(actor.isJump).toBe(true); // 跳跃非绕行
    s.tick(0.35);
    expect(s.snapshot().actors.find((a) => a.id === 'p')!.isJump).toBe(false); // lerp 窗口后复位
  });

  it('[L 环终验③] 跳一次（去 sticky 清选中）→ moveCells ≡ walk BFS 恒等（无跳跃快取残留）+ 敌占格恒排除', () => {
    // 工单场景：轻功跳一次（selection 清除）→ 回落普通移动。锁死两点：
    // a) 跳后 moveCells 与「同参 reachable」集合恒等——旧跳跃快取若残留（可穿集合混入）必挂；
    // b) 跳后可穿集合（jumpReachable ∖ walkCells）中的格提交必被拒——受理走实时 legalMoveCells，
    //    不消费旧快取。几何背书：tests/hex.test「F1 姊妹锁死」。
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, skills: [qingSkill({ grade: 1.3, level: 10 })] }), [
      unit({ id: 'e0', side: 'enemy', hp: 999999 }),
    ]);
    waitAdjacent(s); // 敌贴身：occupied 密度最高，最大化切割/穿越判定的检验强度
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    expect(s.snapshot().moveKind).toBe('jump');
    const jumpTo = s.snapshot().moveCells[0];
    expect(s.submit({ type: 'move', to: jumpTo })).toBe(true); // 跳一次
    expect(s.snapshot().selectedSkill).toBeNull(); // 去 sticky：选中清除
    // 回落后输入态恢复：moveCells ≡ 同参普通可达（恒等式）
    for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
    expect(s.snapshot().pendingInput).toBe(true);
    const walk = reachable(pu(s).hex, movePower(pu(s).skills), s._debug.units.filter((u) => !u.dead).map((u) => u.hex), inFieldOf(s));
    const cells = s.snapshot().moveCells;
    expect(cells.length).toBe(walk.length);
    for (const c of cells) expect(walk.some((w) => w.q === c.q && w.r === c.r)).toBe(true);
    // 穿越格拒绝：jump-only 格（跳跃可达但普通不可达）提交必拒（快取残留会使其被受理）
    const jumpSet = jumpReachable(pu(s).hex, movePower(pu(s).skills), s._debug.units.filter((u) => !u.dead).map((u) => u.hex), inFieldOf(s));
    const jumpOnly = jumpSet.filter((j) => !walk.some((w) => w.q === j.q && w.r === j.r));
    for (const j of jumpOnly) {
      const n = s.events.length;
      expect(s.submit({ type: 'move', to: j })).toBe(false);
      expect(s.events.slice(n).some((ev) => ev.type === 'move')).toBe(false); // 无位移
    }
    // 敌占格恒排除
    expect(cells.some((c) => c.q === eu(s).hex.q && c.r === eu(s).hex.r)).toBe(false);
  });

  it('[MV-2] 轻功提交：位移+内力消耗（Q2 扣 1）+bar 清零+选中清除', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, skills: [qingSkill()] }), [
      unit({ id: 'e0', side: 'enemy', hp: 999999 }),
    ]);
    expect(runToPending(s)).toBe(true);
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    const neiliBefore = pu(s).neili;
    const to = s.snapshot().moveCells[0];
    expect(s.submit({ type: 'move', to })).toBe(true);
    expect(pu(s).hex).toEqual(to);
    expect(pu(s).neili).toBe(neiliBefore - NEILI_COST_PER_CAST); // Q2：跳跃释放扣 1
    expect(pu(s).bar).toBe(0); // BAR-3
    expect(s.snapshot().selectedSkill).toBeNull(); // SEL-3
  });

  it('[SEL-3/SEL-4 回归规格本义] 轻功无 sticky：跳→选中清除回落普通移动→重新激活→再跳（连跳=重新点钮）', () => {
    // 规格本义（SEL-3「提交行动瞬间→选中清除」/SEL-4「条<100 退出输入态」/BASE-6 无连放）
    // ——T18 重写版即按此实现，无 bar≥100 保持分支；连跳=重新点轻功钮。
    // 封顶口径下跳后 bar 必 0；「无条件清」由 commitTurn 无条件 clearSelection
    // 保证（结构断言病灶①已锁 bar=0 显式清零）。
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, skills: [qingSkill()] }), [
      unit({ id: 'e0', side: 'enemy', hp: 999999 }),
    ]);
    for (let hop = 1; hop <= 2; hop++) {
      for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
      expect(s.snapshot().pendingInput).toBe(true);
      // 绿格回归断言（首轮=初始态；次轮=跳后条重置重积满，输入态恢复且为普通移动高亮）
      if (hop === 2) {
        expect(s.snapshot().moveKind).toBe('walk');
        expect(s.snapshot().moveCells.length).toBeGreaterThan(0);
      }
      // 重新激活（连跳=重新点轻功钮，金格重新点亮）
      expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
      expect(s.snapshot().moveKind).toBe('jump');
      expect(s.snapshot().moveCells.length).toBeGreaterThan(0);
      const to = s.snapshot().moveCells[0];
      expect(s.submit({ type: 'move', to })).toBe(true);
      // 提交后无条件回落普通移动：选中清除（任何 bar 状态）、金格消失
      // （非输入态下高亮不显示——绿格回归断言于下一轮输入态恢复时）
      expect(s.snapshot().selectedSkill).toBeNull();
      expect(s.snapshot().moveKind).toBe('walk');
      expect(s.snapshot().moveCells).toEqual([]);
      expect(pu(s).bar).toBeLessThan(100); // 条重置（封顶口径）
    }
  });

  it('[MV-2/MV-3] 一阶轻功基线：power ≤ 1 → 零金格（函数级防御；F-06 基础 2 下 ⌊power/2⌋=0 不可达，条目以函数级对号）', () => {
    expect(jumpReachable({ q: 0, r: 0 }, 1, []).length).toBe(0);
    expect(jumpReachable({ q: 0, r: 0 }, 0, []).length).toBe(0);
    expect(movePower([])).toBe(2); // MVP 全员基础 2
  });

  it('[MV-3] 未激活：moveKind=walk 且 moveCells=普通可达（无穿越格）', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, skills: [qingSkill({ grade: 1.3, level: 10 })] }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    expect(runToPending(s)).toBe(true);
    const snap = s.snapshot();
    expect(snap.moveKind).toBe('walk');
    expect(snap.selectedSkill).toBeNull();
    const normal = reachable(pu(s).hex, movePower(pu(s).skills), s._debug.units.filter((u) => !u.dead).map((u) => u.hex), inFieldOf(s));
    expect(snap.moveCells.length).toBe(normal.length); // 无跳跃格混入
  });
});

// ══════════ 技能交互状态机（规格 §四 4.2 SEL） ══════════

describe('[SEL-1] 输入态进入：弹出 + bar-max 一次', () => {
  it('条满 → pendingInput=true + bar-max 恰 1 条；等待期不重复发', () => {
    const s = makeSession(7, 'manual', unit({ id: 'p', side: 'player', jimin: 200 }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    expect(runToPending(s)).toBe(true);
    expect(s.events.filter((ev) => ev.type === 'bar-max' && ev.actorId === 'p').length).toBe(1);
    for (let i = 0; i < 30; i++) s.tick(DT); // 等待期（含冻结时钟）不重复
    expect(s.events.filter((ev) => ev.type === 'bar-max' && ev.actorId === 'p').length).toBe(1);
  });
});

describe('[SEL-2] 互斥与 toggle', () => {
  it('选特→选绝（特自动取消）→再点绝（取消）；激活不消耗行动预算', () => {
    const p = unit({
      id: 'p', side: 'player', jimin: 200, weapon: 'sword', neili: 50, maxNeili: 50,
      skills: [teSkill({ id: 'te' }), teSkill({ id: 'jue', name: '绝学', kind: 'ultimate', cooldownTurns: 0 })],
    });
    const s = makeSession(13, 'manual', p, [unit({ id: 'e0', side: 'enemy' })]);
    expect(runToPending(s)).toBe(true);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.snapshot().selectedSkill).toBe('te');
    expect(pu(s).bar).toBe(100); // 激活不耗预算
    expect(s.submit({ type: 'selectSkill', skillId: 'jue' })).toBe(true);
    expect(s.snapshot().selectedSkill).toBe('jue'); // 互斥：新选中自动取消旧
    expect(s.submit({ type: 'selectSkill', skillId: 'jue' })).toBe(true); // toggle
    expect(s.snapshot().selectedSkill).toBeNull();
  });
});

describe('[SEL-3] 行动消耗：清零+选中清+冷却', () => {
  it('提交后 bar=0、selectedSkill=null、cd2 技能进入冷却（读后递减节奏见「R-08 冷却节奏」用例）', () => {
    const p = unit({
      id: 'p', side: 'player', jimin: 200, weapon: 'sword', neili: 50, maxNeili: 50,
      skills: [teSkill()],
    });
    const s = makeSession(13, 'manual', p, [unit({ id: 'e0', side: 'enemy' })]);
    waitAdjacent(s);
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(true);
    expect(pu(s).bar).toBe(0); // BAR-3 显式清零
    expect(s.snapshot().selectedSkill).toBeNull(); // SEL-3
    expect(pu(s).cooldowns.get('te')).toBe(2); // R-08 写满值（后续每行动读后递减）
  });
});

describe('[SEL-4] 自动清除与重弹', () => {
  it('提交后 pendingInput=false；重积满 → 重新 bar-max + 输入态恢复', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200 }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    expect(runToPending(s)).toBe(true);
    const to = s.snapshot().moveCells[0];
    expect(s.submit({ type: 'move', to })).toBe(true);
    expect(s.snapshot().pendingInput).toBe(false); // SEL-4 提交即退出输入态
    const bars1 = s.events.filter((ev) => ev.type === 'bar-max' && ev.actorId === 'p').length;
    for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
    expect(s.snapshot().pendingInput).toBe(true); // 重积满重新进入
    const bars2 = s.events.filter((ev) => ev.type === 'bar-max' && ev.actorId === 'p').length;
    expect(bars2).toBe(bars1 + 1); // SEL-1 重新弹出（一次）
  });
});

describe('[SEL-5] 取消路径三条', () => {
  it('①同钮 toggle 取消 ②攻击态点无效格取消 ③轻功态点非金格不取消（反向断言）', () => {
    const p = unit({
      id: 'p', side: 'player', jimin: 200, weapon: 'sword', neili: 50, maxNeili: 50,
      skills: [teSkill({ cooldownTurns: 0 }), qingSkill()],
    });
    const s = makeSession(13, 'manual', p, [unit({ id: 'e0', side: 'enemy' })]);
    expect(runToPending(s)).toBe(true);
    // ②攻击态点无效格（出区）→ 取消选中
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.submit({ type: 'move', to: offsetToAxial(0, 0) })).toBe(false);
    expect(s.snapshot().selectedSkill).toBeNull(); // SEL-5② 取消
    // ①同钮 toggle
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.snapshot().selectedSkill).toBeNull();
    // ③轻功态点非金格（敌占格）→ 不取消（ATK-4/MV-2 反向断言）
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(false); // 点敌=无操作
    expect(s.snapshot().selectedSkill).toBe('qing'); // 不取消
  });
});

describe('[SEL-6] 置灰判定（heroSkills 数据源）', () => {
  it('内力不足 te 置灰 / 轻功内力不足置灰；毒钮无数据源（D6 归 FE 常量置灰）', () => {
    const p = unit({
      id: 'p', side: 'player', jimin: 200, weapon: 'sword', neili: 0, maxNeili: 50,
      skills: [teSkill(), qingSkill()],
    });
    const s = makeSession(13, 'manual', p, [unit({ id: 'e0', side: 'enemy' })]);
    expect(runToPending(s)).toBe(true);
    const btn = (id: string) => s.snapshot().heroSkills.find((b) => b.id === id)!;
    expect(btn('te').disabled).toBe(true); // 内力 0 < 1（Q2 口径）
    expect(btn('qing').disabled).toBe(true); // 内力 0 < 1（SEL-6）
    expect(s.snapshot().heroSkills.some((b) => b.id === 'du')).toBe(false); // 毒无数据源，D6 归 FE
  });
});

describe('[SEL-7] 切自动/逃跑清输入态', () => {
  it('setMode(auto) → pendingInput=false + AI 代行；flee → phase=fled', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200 }), [
      unit({ id: 'e0', side: 'enemy', hp: 999999 }),
    ]);
    expect(runToPending(s)).toBe(true);
    expect(s.submit({ type: 'setMode', mode: 'auto' })).toBe(true);
    for (let i = 0; i < 600 && s.snapshot().pendingInput; i++) s.tick(DT);
    expect(s.snapshot().pendingInput).toBe(false);
    for (let i = 0; i < 300 && !s.events.some((ev) => ev.actorId === 'p' && ev.type !== 'bar-max'); i++) s.tick(DT);
    expect(s.events.some((ev) => ev.actorId === 'p' && ev.type !== 'bar-max')).toBe(true); // AI 代行

    const f = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200 }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    expect(runToPending(f)).toBe(true);
    expect(f.submit({ type: 'flee' })).toBe(true);
    expect(f.phase).toBe('fled'); // SEL-7/R-10
  });
});

// ══════════ 攻击行为（规格 §四 4.3 ATK） ══════════

describe('[ATK-1] 普攻：射程内结算 / 射程外拒绝', () => {
  it('贴脸点敌 → basic 事件+伤害+条清零；射程外 → rejected:invalid 且 bar 不动（=100）', () => {
    const p = unit({ id: 'p', side: 'player', jimin: 200, atk: 200, def: 30, hp: 500, maxHp: 500 });
    const e = unit({ id: 'e0', side: 'enemy', hp: 500, maxHp: 500, atk: 30, def: 10, jimin: 60 });
    const s = makeSession(13, 'manual', p, [e]);
    waitAdjacent(s);
    expect(pu(s).bar).toBe(100); // clamp 口径：条满恒 100
    const eHpBefore = eu(s).hp;
    const nBefore = s.events.length; // 取 submit 后增量（waitAdjacent 的特例普攻不混入）
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(true);
    const fresh = s.events
      .slice(nBefore)
      .filter((ev) => ev.actorId === 'p' && (ev.type === 'basic' || ev.type === 'miss'));
    expect(fresh.length).toBe(1);
    if (fresh[0].type === 'basic') {
      expect(fresh[0].damage).toBeGreaterThan(0);
      expect(eu(s).hp).toBeLessThan(eHpBefore);
    }
    expect(pu(s).bar).toBe(0); // BAR-3

    // 射程外：拉开距离后点敌 → rejected:invalid 且 bar 不动（ATK-1/矩阵断言）
    for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
    const cells = s.snapshot().moveCells;
    const far = cells.slice().sort((a, b) => cubeDistance(b, eu(s).hex) - cubeDistance(a, eu(s).hex))[0];
    if (far && cubeDistance(pu(s).hex, eu(s).hex) - cubeDistance(far, eu(s).hex) >= 1) {
      expect(s.submit({ type: 'move', to: far })).toBe(true);
      for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
      const barBefore = pu(s).bar;
      const n = s.events.length;
      expect(s.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(false);
      expect(s.events.slice(n)).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'invalid' }));
      expect(pu(s).bar).toBe(barBefore); // bar 不动
    }
  });
});

describe('[ATK-2] 技能施放：四查拒绝 + 合法结算（Q1 定版：无降级）', () => {
  function castSession(playerOver: Partial<CombatantInput>) {
    const p = unit({
      id: 'p', side: 'player', jimin: 200, weapon: 'sword', neili: 50, maxNeili: 50,
      skills: [teSkill()], ...playerOver,
    });
    return makeSession(13, 'manual', p, [unit({ id: 'e0', side: 'enemy', hp: 999999 })]);
  }

  it('武器不匹配 → rejected:invalid（不消耗）', () => {
    const s = castSession({ weapon: 'fist' }); // te 是剑技
    waitAdjacent(s);
    const n = s.events.length;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(false);
    expect(s.events.slice(n)).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'invalid' }));
    expect(pu(s).bar).toBe(100); // 不消耗
  });

  it('冷却中 → rejected:invalid（不消耗）；合法 → skill 事件+内力 -1（Q2）', () => {
    const s = castSession({});
    waitAdjacent(s);
    const neiliBefore = pu(s).neili;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(true);
    expect(s.events.some((ev) => ev.type === 'skill' && ev.skillId === 'te')).toBe(true);
    expect(pu(s).neili).toBe(neiliBefore - NEILI_COST_PER_CAST);
    // 冷却窗口（cd=2）：再点 → rejected:invalid（Q1 定版：取消降级普攻，无消耗）
    for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
    const n = s.events.length;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(false);
    expect(s.events.slice(n)).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'invalid' }));
    expect(s.events.slice(n).some((ev) => ev.type === 'fallback' || ev.type === 'basic')).toBe(false); // 无降级
    expect(pu(s).bar).toBe(100); // bar 不动（拒绝无消耗）
  });

  it('内力不足 → rejected:invalid（SEL-6/ATK-2）', () => {
    const s = castSession({ neili: 0, maxNeili: 50 });
    waitAdjacent(s);
    const n = s.events.length;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(false);
    expect(s.events.slice(n)).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'invalid' }));
    expect(pu(s).bar).toBe(100);
  });

  it('射程外 → rejected:range（走位是玩家决策）', () => {
    const s = castSession({});
    expect(runToPending(s)).toBe(true); // seed 13 开局远距
    const n = s.events.length;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(false);
    expect(s.events.slice(n)).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'range' }));
    expect(pu(s).bar).toBe(100);
  });
});

describe('[ATK-3] 移动附带普攻特例', () => {
  it('移动落点相邻敌 → basic 事件紧随 move 事件（不另耗回合）', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, atk: 200, def: 30, hp: 500, maxHp: 500 }), [
      unit({ id: 'e0', side: 'enemy', hp: 999999, maxHp: 999999, atk: 1 }),
    ]);
    waitAdjacent(s);
    // 拉开两格再贴回：制造「移动到位相邻」场景
    const target = eu(s);
    const away = s.snapshot().moveCells.find((c) => cubeDistance(c, target.hex) === 2);
    if (away) {
      expect(s.submit({ type: 'move', to: away })).toBe(true);
      for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
      const back = s.snapshot().moveCells
        .slice()
        .sort((a, b) => cubeDistance(a, target.hex) - cubeDistance(b, target.hex))[0];
      const nMoves = s.events.filter((ev) => ev.type === 'move' && ev.actorId === 'p').length;
      expect(s.submit({ type: 'move', to: back })).toBe(true);
      const off = axialToOffset(back);
      const idx = s.events.findIndex(
        (ev) => ev.type === 'move' && ev.actorId === 'p' && ev.toX === off.col && ev.toY === off.row,
      );
      expect(idx).toBeGreaterThanOrEqual(0);
      const follow = s.events.slice(idx + 1).find((ev) => ev.actorId === 'p' && ['basic', 'miss'].includes(ev.type));
      expect(follow).toBeDefined(); // 特例普攻紧随移动（不另耗回合）
      expect(s.events.filter((ev) => ev.type === 'move' && ev.actorId === 'p').length).toBe(nMoves + 1);
    }
  });
});

describe('[ATK-4] 轻功态点敌=无操作（Q4）', () => {
  it('激活轻功 → submit(attack)=false、无事件、selectedSkill 保持', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, skills: [qingSkill()] }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    waitAdjacent(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    const n = s.events.length;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(false);
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'qing' })).toBe(false);
    expect(s.events.slice(n).length).toBe(0); // 无事件（无操作，非非法）
    expect(s.snapshot().selectedSkill).toBe('qing'); // 不取消
  });
});

describe('[ATK-5] 点空格=无操作', () => {
  it('无选中点普通空格（可达集外）：false、无事件、选中不变', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200 }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    expect(runToPending(s)).toBe(true);
    const cells = s.snapshot().moveCells;
    const outside: Array<{ q: number; r: number }> = [];
    for (let row = FIELD_ROW_MIN; row <= FIELD_ROW_MAX; row++) {
      for (let col = FIELD_COL_MIN; col <= FIELD_COL_MAX; col++) {
        const c = offsetToAxial(col, row);
        const occupied = s._debug.units.some((u) => u.hex.q === c.q && u.hex.r === c.r);
        if (!occupied && !snapHas(cells, c)) outside.push(c);
      }
    }
    expect(outside.length).toBeGreaterThan(0); // 12×12 vs 移动力 2：场内必有可达集外空格
    const n = s.events.length;
    expect(s.submit({ type: 'move', to: outside[0] })).toBe(false); // 无操作
    expect(s.events.slice(n).length).toBe(0); // 无事件（ATK-5）
    expect(s.snapshot().selectedSkill).toBeNull(); // 选中不变
  });
});

// ══════════ 行动条与回合（规格 §四 4.4 BAR） ══════════

describe('[BAR-1] clamp 封顶', () => {
  it('超速角色任意时刻 bar ≤100；出手间隔 ≈ 100/fillRate（速度优势=出手频繁）', () => {
    const fast = unit({ id: 'p', side: 'player', jimin: 200, atk: 50 }); // 30/s
    const slow = unit({ id: 'e0', side: 'enemy', jimin: 0, def: 99999 }); // 10/s
    const s = makeSession(7, 'auto', fast, [slow]);
    for (let i = 0; i < 800; i++) {
      s.tick(DT);
      for (const u of s._debug.units) expect(u.bar).toBeLessThanOrEqual(100.0001);
      if (s.phase !== 'fighting') break;
    }
    const acts = s.events.filter((ev) => ev.actorId === 'p' && ['skill', 'basic', 'miss', 'fallback', 'move'].includes(ev.type));
    if (acts.length >= 2) {
      const gap = acts[1].t - acts[0].t;
      expect(gap).toBeGreaterThanOrEqual(3.2);
      expect(gap).toBeLessThanOrEqual(3.6);
    }
    const eActs = s.events.filter((ev) => ev.actorId === 'e0' && ['skill', 'basic', 'miss', 'fallback', 'move'].includes(ev.type));
    if (eActs.length >= 2) expect(eActs[1].t - eActs[0].t).toBeGreaterThan(9);
  });
});

describe('[BAR-2] 轮转排序', () => {
  it('速度快者先满条先行动（bar-max → 出手事件），慢者后置', () => {
    const fast = unit({ id: 'p', side: 'player', jimin: 100 }); // 20/s
    const slow = unit({ id: 'e0', side: 'enemy', jimin: 0 }); // 10/s
    const s = makeSession(7, 'auto', fast, [slow]);
    for (let i = 0; i < 120 && s.events.length < 3; i++) s.tick(DT);
    expect(s.events[0]).toMatchObject({ type: 'bar-max', actorId: 'p' });
    expect(s.events[1]).toMatchObject({ type: 'move', actorId: 'p' }); // 射程外先位移（AI 第 4 级）
    expect(s.events.some((ev) => ev.type === 'bar-max' && ev.actorId === 'e0')).toBe(true);
  });
});

describe('[BAR-4] 托管双阈值 + 冻结时钟', () => {
  it('手动挂机 90s → trust（t<15s）→ switch-auto；等待期总时钟不推进', () => {
    const p = unit({ id: 'p', side: 'player', jimin: 0, hp: 999999, maxHp: 999999 });
    const e = unit({ id: 'e0', side: 'enemy', hp: 999999, maxHp: 999999, atk: 1 });
    const s = makeSession(7, 'manual', p, [e]);
    for (let i = 0; i < 300 && !(s.events.some((ev) => ev.type === 'trust') && s._debug.mode() === 'auto'); i++) s.tick(1);
    const trust = s.events.find((ev) => ev.type === 'trust')!;
    const switchAuto = s.events.find((ev) => ev.type === 'switch-auto')!;
    expect(trust).toBeDefined();
    expect(switchAuto).toBeDefined();
    expect(s._debug.mode()).toBe('auto');
    expect(trust!.t).toBeLessThan(15); // 等待期总时钟冻结（BAR-4）
    expect(trust!.t).toBeLessThanOrEqual(switchAuto!.t);
  });
});

describe('[BAR-5] 90s 判定', () => {
  it('高胜 / 低负 / 同量玩家负（一致性断言）三断言', () => {
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
    expect(tie.events.some((ev) => ev.type === 'timeout-hp')).toBe(true);
    const pHp = tie._debug.units.filter((u) => u.side === 'player').reduce((s2, u) => s2 + Math.max(0, u.hp), 0);
    const eHp = tie._debug.units.filter((u) => u.side === 'enemy').reduce((s2, u) => s2 + Math.max(0, u.hp), 0);
    expect(tie.phase).toBe(pHp > eHp ? 'won' : 'lost'); // 同量归 lost（BAR-5）
    if (pHp === eHp) expect(tie.phase).toBe('lost');
  });
});

// ══════════ 出生与确定性（规格 §四 4.5 SP） ══════════

describe('[SP-1] 出生：锚点 ≤3 随机（D1）', () => {
  it('4 seed × 全体单位：出生格 ∈ 可动区（12h×8w）且 dist(锚)≤3、我方/敌区互斥；满编容量验证', () => {
    const anchorP = offsetToAxial(4, 13); // 可动区左下极格（L 环 12h×8w）
    const anchorE = offsetToAxial(11, 2); // 可动区右上极格
    for (const seed of [1, 7, 13, 42]) {
      const count = seed === 42 ? 6 : 2;
      const enemies = Array.from({ length: count }, (_, i) => unit({ id: `e${i}`, side: 'enemy' as const }));
      const s = makeSession(seed, 'auto', unit({ id: 'p', side: 'player' }), enemies);
      for (const u of s._debug.units) {
        const off = axialToOffset(u.hex);
        expect(off.col).toBeGreaterThanOrEqual(FIELD_COL_MIN); // 8 列（col 4..11）
        expect(off.col).toBeLessThanOrEqual(FIELD_COL_MAX);
        expect(off.row).toBeGreaterThanOrEqual(FIELD_ROW_MIN); // 12 行（row 2..13）
        expect(off.row).toBeLessThanOrEqual(FIELD_ROW_MAX);
        const anchor = u.side === 'player' ? anchorP : anchorE;
        expect(cubeDistance(anchor, u.hex)).toBeLessThanOrEqual(3);
      }
      for (const u of s._debug.units) {
        // 两带互斥（SP-1：锚距 >6 > 3+3）
        if (u.side === 'player') expect(cubeDistance(anchorE, u.hex)).toBeGreaterThan(3);
        else expect(cubeDistance(anchorP, u.hex)).toBeGreaterThan(3);
      }
      const keys = new Set(s._debug.units.map((u) => `${u.hex.q},${u.hex.r}`));
      expect(keys.size).toBe(s._debug.units.length); // 不重叠
    }
    // 同 seed 布局可复现（SP-2 布局面）
    const a = makeSession(42, 'auto', unit({ id: 'p', side: 'player' }), [unit({ id: 'e0', side: 'enemy' })]);
    const b = makeSession(42, 'auto', unit({ id: 'p', side: 'player' }), [unit({ id: 'e0', side: 'enemy' })]);
    expect(a._debug.units.map((u) => u.hex)).toEqual(b._debug.units.map((u) => u.hex));
  });
});

describe('[SP-2] 同 seed 全等', () => {
  const pDef = () => unit({ id: 'p', side: 'player', jimin: 120, atk: 80, def: 30, hp: 500, maxHp: 500 });
  const eDef = () => unit({ id: 'e0', side: 'enemy', hp: 300, maxHp: 300, atk: 20, def: 10, jimin: 40 });

  it('自动双场事件流 JSON 全等；异 seed 不同', () => {
    const a = makeSession(7, 'auto', pDef(), [eDef()]);
    const b = makeSession(7, 'auto', pDef(), [eDef()]);
    autoTillEnd(a);
    autoTillEnd(b);
    expect(a.events).toEqual(b.events);
    const c = makeSession(8, 'auto', pDef(), [eDef()]);
    autoTillEnd(c);
    expect(c.events).not.toEqual(a.events);
  });

  it('手动脚本双场事件流全等（含非法操作 → SP-3 拒绝序列纳入确定性）', () => {
    const runScripted = (seed: number) => {
      const s = makeSession(seed, 'manual', pDef(), [eDef()]);
      for (let k = 0; k < 8 && s.phase === 'fighting'; k++) {
        for (let i = 0; i < 400 && !s.snapshot().pendingInput && s.phase === 'fighting'; i++) s.tick(DT);
        if (s.phase !== 'fighting') break;
        if (k % 2 === 0) s.submit({ type: 'move', to: offsetToAxial(0, 0) }); // 非法（拒绝序列）
        if (dist(s, 'p', 'e0') <= 1 && k % 2 === 1) s.submit({ type: 'attack', targetId: 'e0', skillId: null });
        else {
          const cells = s.snapshot().moveCells;
          if (cells.length > 0) s.submit({ type: 'move', to: cells[k % cells.length] });
        }
      }
      return s;
    };
    const a = runScripted(7);
    const b = runScripted(7);
    expect(a.events).toEqual(b.events);
    expect(a.events.some((ev) => ev.type === 'rejected')).toBe(true); // 脚本确实含拒绝
  });
});

// ══════════ 既有行为资产收编（矩阵外补充，防回归） ══════════

describe('[BAR-5/SEL-7 补充] 歼灭/玩家亡终局', () => {
  it('全灭 → won+win/death；玩家亡 → lost+lose', () => {
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
  });
});

describe('[AI 补充 · B2] 优先级序与冷却节奏（矩阵外，C 案 B2 行为资产）', () => {
  it('第 2 级技能按伤害倍率降序（grade 压数组序）；第 4 级射程外先位移', () => {
    const p = unit({ id: 'p', side: 'player', atk: 1 });
    const e = unit({
      id: 'e0', side: 'enemy', jimin: 200, neili: 999, maxNeili: 999, weapon: 'sword', def: 99999,
      skills: [
        { id: 'low', name: '低阶', kind: 'waiGong', weapon: 'sword', grade: 1.0, growth: 1, level: 60, cooldownTurns: 0, neiliCost: 10 },
        { id: 'high', name: '高阶', kind: 'special', weapon: 'sword', grade: 1.7, growth: 3, level: 60, cooldownTurns: 0, neiliCost: 10 },
      ],
    });
    const s = makeSession(7, 'auto', p, [e]);
    for (let i = 0; i < 600 && !s.events.some((ev) => ev.type === 'skill'); i++) s.tick(DT);
    expect(s.events.find((ev) => ev.type === 'skill')).toMatchObject({ actorId: 'e0', skillId: 'high' });

    const s2 = makeSession(13, 'auto', unit({ id: 'p', side: 'player', jimin: 0 }), [
      unit({ id: 'e0', side: 'enemy', jimin: 0 }),
    ]);
    for (let i = 0; i < 200 && !s2.events.some((ev) => ev.actorId === 'e0'); i++) s2.tick(DT);
    const firstAct = s2.events.find((ev) => ev.actorId === 'e0' && ev.type !== 'bar-max');
    expect(firstAct).toMatchObject({ type: 'move' });
  });

  it('[SEL-3/CD-1] R-08 冷却节奏：cd2 技能隔 2 行动回合复现（读后递减镜像 core 用例 3 口径）', () => {
    const p = unit({ id: 'p', side: 'player', atk: 1 });
    const e = unit({
      id: 'e0', side: 'enemy', jimin: 200, neili: 999, maxNeili: 999, weapon: 'sword',
      hp: 999999, maxHp: 999999, def: 99999,
      skills: [{ id: 'cd2', name: '特技', kind: 'special', weapon: 'sword', grade: 1.0, growth: 1, level: 10, cooldownTurns: 2, neiliCost: 10 }],
    });
    const s = makeSession(7, 'auto', p, [e]);
    let acts: typeof s.events = [];
    for (let i = 0; i < 1500; i++) {
      s.tick(DT);
      acts = s.events.filter((ev) => ev.actorId === 'e0' && ['skill', 'fallback', 'basic', 'miss'].includes(ev.type));
      if (acts.filter((ev) => ev.type === 'skill').length >= 2) break;
    }
    const skillIdxs = acts.map((ev, i) => (ev.type === 'skill' ? i : -1)).filter((i) => i >= 0);
    expect(skillIdxs.length).toBeGreaterThanOrEqual(2);
    const gap = acts.slice(skillIdxs[0] + 1, skillIdxs[1]);
    expect(gap.some((ev) => ev.type === 'skill')).toBe(false);
    expect(gap.length).toBeGreaterThanOrEqual(3);
  });
});

describe('[SEL-6/F2] heroSkills 数据源 + [F3] 敌型身份', () => {
  it('heroSkills 置灰数据源正确；敌方 configId/spriteKey；我方 hero 帧表', () => {
    const p = unit({
      id: 'p', side: 'player', jimin: 200, weapon: 'sword', neili: 50, maxNeili: 50,
      skills: [teSkill({ cooldownTurns: 0 }), qingSkill({ grade: 1.0, level: 10 })],
    });
    const e = unit({ id: 'e0', side: 'enemy', name: 'shanzei' });
    const s = makeSession(13, 'manual', p, [e]);
    expect(runToPending(s)).toBe(true);
    const btn = (id: string) => s.snapshot().heroSkills.find((b) => b.id === id)!;
    expect(btn('te')).toEqual({ id: 'te', label: '特技', disabled: false });
    expect(btn('qing').disabled).toBe(false); // ⌊power/2⌋≥1 且内力足
    const enemy = s.snapshot().actors.find((a) => a.id === 'e0')!;
    expect(enemy.configId).toBe('shanzei');
    expect(enemy.spriteKey).toBe('shanzei'); // F3 约定
    expect(s.snapshot().actors.find((a) => a.id === 'p')!.spriteKey).toBe('hero');
    expect(s.snapshot().actors.find((a) => a.id === 'p')!.configId).toBeUndefined();
  });
});

describe('[SP-2 附] assembleRoster 薄转发 + [Q2] MVP 内力口径', () => {
  it('数量规则 = core rollEnemyCount 唯一真值', () => {
    const tpl = { name: '山贼', hp: 50, atk: 10, def: 5, jimin: 5, danshi: 0, shizhan: 50 };
    expect(assembleRoster(99, tpl, makeRng(1)).length).toBe(1);
    const roster = assembleRoster(50000, tpl, makeRng(2));
    expect(roster.length).toBeGreaterThanOrEqual(1);
    expect(roster.length).toBeLessThanOrEqual(6);
    expect(roster[0].id).toBe('enemy-0');
  });

  it('未显式配置内力的我方单位 → neili=maxNeili=100（替换点 NEILI_INITIAL）', () => {
    const s = makeSession(7, 'auto', unit({ id: 'p', side: 'player' }), [unit({ id: 'e0', side: 'enemy' })]);
    expect(pu(s).neili).toBe(100);
    expect(pu(s).maxNeili).toBe(100);
  });
});
