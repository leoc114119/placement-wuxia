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

// ══════════ 格子施放 cast（规格 §四 4.3 ATK-2/6/7 v2.0 · 方案《战斗格子施放与热区修复方案-v0.1》§3.2 · T20-BE） ══════════
// 布局通式：p(7,8)、e0(9,8)（正东 2 格 = te tier1 射程边界内）、射程内空格 (6,8)/(8,8)、射程外 (11,8)（距离 4）。
// te=sword→circle 全向（hex.ts:174），legalCells 含敌占格、不含自己格（rangeCells 跳过原点）。

/** 白盒布点（自 tests/battle-behavior.test.ts 移植；T19 字段全套重置防用例间泄漏） */
function place(s: HexBattleSession, id: string, col: number, row: number): void {
  const u = s._debug.units.find((x) => x.id === id)!;
  const hex = offsetToAxial(col, row);
  u.hex = { ...hex };
  u.renderQ = hex.q;
  u.renderR = hex.r;
  u.moveFromQ = hex.q;
  u.moveFromR = hex.r;
  u.moveT = 1;
  u.isJump = false;
  u.animState = 'idle';
  u.animLeftMs = 0;
  u.pendingAnim = null;
  u.movePath = [];
  u.bar = 0;
  u.barWasMax = false;
  u.dead = false;
  if (u.hp <= 0) u.hp = 50;
}

/** 布点后拉满行动条并 tick 一帧（进入输入态；敌 bar=0 不同帧轮转） */
function ready(s: HexBattleSession): void {
  const hero = s._debug.units.find((x) => x.id === 'p')!;
  hero.bar = 100;
  s.tick(0.001);
}

/** cast 用例标准局：p 带 te（level20→tier1 射程2 circle）+ 敌 e0，白盒布点后进输入态（未激活）。
 * 【T22 · 易错点1】布点 diff 落工厂签名：e0Col=9（默认，敌 ∈ 射程正东 2 格）/ e0Col=11
 * （敌出射程 cube 4，与射程外用例同格）——布点变更收敛在签名上，零改 describe 不感知。 */
function castBoard(e0Col = 9): HexBattleSession {
  const p = unit({
    id: 'p', side: 'player', jimin: 200, weapon: 'sword', neili: 50, maxNeili: 50,
    skills: [teSkill({ level: 20 })],
  });
  const s = makeSession(13, 'manual', p, [unit({ id: 'e0', side: 'enemy' })]);
  place(s, 'p', 7, 8);
  place(s, 'e0', e0Col, 8);
  ready(s);
  return s;
}

/** 布点+激活 te（四查/门用例前置态） */
function armedBoard(): HexBattleSession {
  const s = castBoard();
  expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
  return s;
}

/** 资源终态四项读法（空放/对敌全等锚的统一口径） */
const castFinalFour = (s: HexBattleSession) => ({
  neili: pu(s).neili,
  cd: pu(s).cooldowns.get('te'),
  bar: pu(s).bar,
  selected: s.snapshot().selectedSkill,
});

describe('[ATK-2 对格] cast 有敌格：doAttack 既有路径（skill/miss 事件+资源终态）· AOE 退化单目标', () => {
  it('选特→cast 敌格：事件 skill|miss+敌 hp 不升+四项终态（neili−1/cd 写初值/bar0/选中清）——v2.2 下射程内仅 e0，AOE 退化单目标，断言自 v2.0 起零改', () => {
    const s = armedBoard();
    const snap = s.snapshot();
    const e0cell = snap.actors.find((a) => a.id === 'e0')!.pos;
    expect(snap.attackCells.some((c) => c.q === e0cell.q && c.r === e0cell.r)).toBe(true); // 敌格 ∈ 高亮（显示=校验同源）
    const hp0 = eu(s).hp;
    expect(s.submit({ type: 'cast', to: e0cell, skillId: 'te' })).toBe(true);
    // 命中/闪避走 core 骰子（F-04），行为锁只锁链路（沿 behavior ATK-2 绿锁口径）
    expect(s.events.slice(-3).map((e) => e.type)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(skill|miss)$/)]),
    );
    expect(eu(s).hp).toBeLessThanOrEqual(hp0);
    // 资源终态四项（R-09/R-08 副作用经 doAttack→resolveAction，与空放镜像对照）
    expect(castFinalFour(s)).toEqual({ neili: 50 - NEILI_COST_PER_CAST, cd: 2, bar: 0, selected: null });
  });
});

describe('[ATK-6] 空放：射程内空格=合法施放资源全扣（T20-BE · v2.2 布点修正=真空放）', () => {
  /** 同 seed 双场对照对（Q-T22-A 裁决案）：hit=cast 敌格（e0(9,8) ∈ 射程，AOE 单敌真值路径）/
   * air=cast 正西空格（e0(11,8) 出射程，v2.2 真空放=射程内无存活敌）——资源终态四项全等锚
   * 升级为「AOE 对敌 vs 空放镜像」终态全等（AOE 多目标仍恰扣一次的终态锁）。
   * 【易错点2】点击格恒 (6,8)（p 正西 1 格）：faceToward 正西/faceLeft 演出断言与之耦合，改布点禁动点击格。 */
  function castPair() {
    const hit = castBoard();
    const air = castBoard(11); // v2.2：air 臂 e0 出射程（cube 4 > te 射程 2）
    expect(hit.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(air.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    // 前置自检（防未来射程参数漂移静默复活 AOE）：hit 场 e0 ∈ attackCells / air 场 e0 ∉
    const hitE0 = hit.snapshot().actors.find((a) => a.id === 'e0')!.pos;
    expect(hit.snapshot().attackCells.some((c) => c.q === hitE0.q && c.r === hitE0.r)).toBe(true);
    const airE0 = air.snapshot().actors.find((a) => a.id === 'e0')!.pos;
    expect(air.snapshot().attackCells.some((c) => c.q === airE0.q && c.r === airE0.r)).toBe(false);
    const hp0 = eu(air).hp;
    const hitCell = hit.snapshot().actors.find((a) => a.id === 'e0')!.pos;
    expect(hit.submit({ type: 'cast', to: hitCell, skillId: 'te' })).toBe(true);
    expect(air.submit({ type: 'cast', to: offsetToAxial(6, 8), skillId: 'te' })).toBe(true);
    return { hit, air, hp0 };
  }

  it('cast 射程内空格：事件尾 skill 无 targetId 无 damage+敌 hp 不变+charge 演出+faceToward 目标格', () => {
    const { air, hp0 } = castPair();
    const tail = air.events[air.events.length - 1];
    expect(tail.type).toBe('skill'); // 空放事件=skill（事件类型零新增）
    expect(tail.actorId).toBe('p');
    expect(tail.skillId).toBe('te');
    expect('targetId' in tail).toBe(false); // 键不存在断言（in 严于 ===undefined，防空放/对敌混淆假绿）
    expect('damage' in tail).toBe(false);
    expect(eu(air).hp).toBe(hp0); // 无伤害结算（resolveAction 不调的行为证据）
    expect(pu(air).animState).toBe('charge'); // Q3：施放演出照播（charge→strike 既有链）
    expect(pu(air).hexFacing).toEqual({ q: -1, r: 0 }); // faceToward 正西目标格（六向量化）
    expect(pu(air).faceLeft).toBe(true); // 水平分量翻左（dx<0）
    expect(castFinalFour(air)).toEqual({ neili: 50 - NEILI_COST_PER_CAST, cd: 2, bar: 0, selected: null });
  });

  it('AOE 对敌与空放资源终态四项全等（neili/冷却/bar/选中）——镜像不漂移（v2.2：AOE 多目标仍恰扣一次的终态锁）', () => {
    const { hit, air } = castPair();
    expect(castFinalFour(air)).toEqual(castFinalFour(hit));
    expect(castFinalFour(air)).toEqual({ neili: 50 - NEILI_COST_PER_CAST, cd: 2, bar: 0, selected: null });
  });
});

describe('[ATK-6] cast 射程外=rejected(range)：选中保持零消耗（session 层不清选中）', () => {
  it('射程外可动区格 → rejected(range) 恰 1 条；selectedSkill 保持+bar/neili/冷却不动', () => {
    const s = armedBoard();
    const far = offsetToAxial(11, 8); // 正东 4 格 > te 射程 2，∈ 可动区非占格
    expect(s.snapshot().attackCells.some((c) => c.q === far.q && c.r === far.r)).toBe(false); // 前置：确在射程外
    const n0 = s.events.length;
    const neili0 = pu(s).neili;
    expect(s.submit({ type: 'cast', to: far, skillId: 'te' })).toBe(false);
    const added = s.events.slice(n0);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: 'rejected', reason: 'range' });
    expect('targetId' in added[0]).toBe(false); // 格制拒绝无单位目标（与 attack 分支形状有意区分）
    expect(s.snapshot().selectedSkill).toBe('te'); // 取消归 input 层 SEL-5②，session 只拒绝
    expect(pu(s).bar).toBe(100); // 拒绝零消耗
    expect(pu(s).neili).toBe(neili0);
    expect(pu(s).cooldowns.get('te')).toBe(0);
  });
});

describe('[ATK-6/Q2] cast 自己格=空放语义（特判并联不入高亮 · v2.2 布点修正=真空放）', () => {
  it('自己格 ∉ attackCells 但 cast 受理：事件尾 skill 无 targetId/无 damage+四项终态=空放+朝向保持', () => {
    const s = castBoard(11); // v2.2 布点修正：e0(11,8) 出射程（cube 4），自己格 cast=真空放（射程内无存活敌）
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    const heroCell = s.snapshot().actors.find((a) => a.id === 'p')!.pos;
    // Q2 反面证据：自己格不入高亮（并联不并入，rangeCells 跳过原点）
    expect(s.snapshot().attackCells.some((c) => c.q === heroCell.q && c.r === heroCell.r)).toBe(false);
    const facing0 = { ...pu(s).hexFacing };
    const e0hp0 = eu(s).hp;
    expect(s.submit({ type: 'cast', to: heroCell, skillId: 'te' })).toBe(true); // 特判受理
    const tail = s.events[s.events.length - 1];
    expect(tail.type).toBe('skill');
    expect('targetId' in tail).toBe(false);
    expect('damage' in tail).toBe(false);
    expect(eu(s).hp).toBe(e0hp0); // 敌 hp 不变
    expect(castFinalFour(s)).toEqual({ neili: 50 - NEILI_COST_PER_CAST, cd: 2, bar: 0, selected: null });
    expect(pu(s).hexFacing).toEqual(facing0); // faceToward 同格 v{0,0} 早退（朝向保持）
  });
});

describe('[ATK-7] 演出位∈射程=施放全范围生效（v2.2 简化：命中只看射程成员）', () => {
  it('敌演出位格 ∈ 射程 → cast 受理且 AOE 按射程成员命中 e0：skill|miss 带 targetId+e0 hp≤hp0+逻辑位不动+四项终态', () => {
    const s = armedBoard();
    // 模拟移动演出中：e0 可见位偏移到射程内空格 (8,8)，逻辑 hex 保持 (9,8)
    const e0u = s._debug.units.find((x) => x.id === 'e0')!;
    const ghostCell = offsetToAxial(8, 8);
    e0u.renderQ = ghostCell.q;
    e0u.renderR = ghostCell.r;
    const hp0 = e0u.hp;
    expect(s.submit({ type: 'cast', to: ghostCell, skillId: 'te' })).toBe(true);
    // v2.2 断言翻转（ATK-7 简化/五点④）：点击演出位格=施放全范围——e0 逻辑位 (9,8) ∈ 射程被命中，
    // 「命中按逻辑位」条款废止（v2.0 断言「敌 hp 不变/空事件」随之翻转）
    const tail = s.events[s.events.length - 1];
    expect(tail.type === 'skill' || tail.type === 'miss').toBe(true); // 结算事件（命中或被闪避，既有双形状）
    expect((tail as { targetId?: string }).targetId).toBe('e0'); // 受击目标=射程成员（点击格 (8,8) 上无逻辑敌的直接证据）
    expect(e0u.dead).toBe(false);
    expect(e0u.hp).toBeLessThanOrEqual(hp0); // 施放全范围生效（miss 偶发容错：≤ 而非 <）
    expect(e0u.hex).toEqual(offsetToAxial(9, 8)); // 逻辑位不动（命中不依赖点击格与逻辑位——保留证据）
    expect(castFinalFour(s)).toEqual({ neili: 50 - NEILI_COST_PER_CAST, cd: 2, bar: 0, selected: null }); // resolveAction 真值路径
  });
});

describe('[ATK-2 拒绝] cast 四查提交时重查（武器/冷却/内力 · 选中保持）', () => {
  // 激活时 activate 已前置同条件三查（SEL-6），MVP 无激活后自然漂移源——
  // _debug 白盒构造漂移测「提交时重查」防御分支（PM 裁决放行；activate 既有语义一行不动）
  it('武器漂移（R-05）：激活后 weapon 改拳 → cast 拒绝 invalid', () => {
    const s = armedBoard();
    s._debug.player().weapon = 'fist'; // te=剑技
    const n0 = s.events.length;
    const neili0 = pu(s).neili;
    expect(s.submit({ type: 'cast', to: offsetToAxial(8, 8), skillId: 'te' })).toBe(false);
    const added = s.events.slice(n0);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: 'rejected', reason: 'invalid' });
    expect(s.snapshot().selectedSkill).toBe('te'); // 选中保持（拒绝不清选中）
    expect(pu(s).bar).toBe(100);
    expect(pu(s).neili).toBe(neili0);
    expect(pu(s).cooldowns.get('te')).toBe(0); // 不写冷却
  });

  it('冷却漂移（R-08）：激活后写入冷却 → cast 拒绝 invalid', () => {
    const s = armedBoard();
    s._debug.player().cooldowns.set('te', 1);
    const n0 = s.events.length;
    expect(s.submit({ type: 'cast', to: offsetToAxial(8, 8), skillId: 'te' })).toBe(false);
    const added = s.events.slice(n0);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: 'rejected', reason: 'invalid' });
    expect(s.snapshot().selectedSkill).toBe('te');
    expect(pu(s).bar).toBe(100);
    expect(pu(s).cooldowns.get('te')).toBe(1); // 漂移值不被 cast 触碰
  });

  it('内力漂移（R-09）：激活后内力清零 → cast 拒绝 invalid', () => {
    const s = armedBoard();
    s._debug.player().neili = 0;
    const n0 = s.events.length;
    expect(s.submit({ type: 'cast', to: offsetToAxial(8, 8), skillId: 'te' })).toBe(false);
    const added = s.events.slice(n0);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: 'rejected', reason: 'invalid' });
    expect(s.snapshot().selectedSkill).toBe('te');
    expect(pu(s).bar).toBe(100);
  });
});

describe('[ATK-6 门] cast 选中态门：无选中/qing 态/陈旧 skillId → rejected(invalid)', () => {
  it('三情形均拒绝且零消耗；qing/陈旧 id 拒绝后选中保持（cast 不得激活技能）', () => {
    // ①无选中（未激活直接 cast）
    const s1 = castBoard();
    const n1 = s1.events.length;
    expect(s1.submit({ type: 'cast', to: offsetToAxial(8, 8), skillId: 'te' })).toBe(false);
    expect(s1.events.slice(n1)).toHaveLength(1);
    expect(s1.events[n1]).toMatchObject({ type: 'rejected', reason: 'invalid' });
    expect(pu(s1).bar).toBe(100);
    // ②qing 态（轻功激活后 cast → 门拒，选中保持 qing）
    const p2 = unit({
      id: 'p', side: 'player', jimin: 200, weapon: 'sword', neili: 50, maxNeili: 50,
      skills: [teSkill({ level: 20, cooldownTurns: 0 }), qingSkill()],
    });
    const s2 = makeSession(13, 'manual', p2, [unit({ id: 'e0', side: 'enemy' })]);
    place(s2, 'p', 7, 8);
    place(s2, 'e0', 9, 8);
    ready(s2);
    expect(s2.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    const n2 = s2.events.length;
    expect(s2.submit({ type: 'cast', to: offsetToAxial(8, 8), skillId: 'qing' })).toBe(false);
    expect(s2.events.slice(n2)).toHaveLength(1);
    expect(s2.events[n2]).toMatchObject({ type: 'rejected', reason: 'invalid' });
    expect(s2.snapshot().selectedSkill).toBe('qing'); // 门不清选中
    // ③陈旧 skillId（激活 te 后 cast 携带其他 id）
    const s3 = armedBoard();
    const n3 = s3.events.length;
    expect(s3.submit({ type: 'cast', to: offsetToAxial(8, 8), skillId: 'jue' })).toBe(false);
    expect(s3.events.slice(n3)).toHaveLength(1);
    expect(s3.events[n3]).toMatchObject({ type: 'rejected', reason: 'invalid' });
    expect(s3.snapshot().selectedSkill).toBe('te'); // 陈旧 id 拒绝不清选中
  });
});

// ══════════ T22 新增（规格 v2.2 五点/AOE · 方案 §三 V1/V2/V6 对号） ══════════

/** 任意单位 hp 读法（多敌分野/AI 同构用例） */
const hpOf = (s: HexBattleSession, id: string) => s._debug.units.find((u) => u.id === id)!.hp;

/** T22 多敌标准局：p(7,8) te level20（sword circle 射程2）+ e0(9,8)∈ / e1(8,9)∈ / e2(11,8)∉（cube 4） */
function aoeBoard(): HexBattleSession {
  const p = unit({
    id: 'p', side: 'player', jimin: 200, weapon: 'sword', neili: 50, maxNeili: 50,
    skills: [teSkill({ level: 20 })],
  });
  const s = makeSession(13, 'manual', p, [
    unit({ id: 'e0', side: 'enemy' }),
    unit({ id: 'e1', side: 'enemy' }),
    unit({ id: 'e2', side: 'enemy' }),
  ]);
  place(s, 'p', 7, 8);
  place(s, 'e0', 9, 8); // axial 距 2 ∈ 射程
  place(s, 'e1', 8, 9); // axial 距 2 ∈ 射程
  place(s, 'e2', 11, 8); // axial 距 4 ∉ 射程（与射程外用例同格）
  ready(s);
  expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
  return s;
}

describe('[ATK-2 AOE] 多敌分野：射程内全体受击+资源恰扣一次（v2.2 五点① / V1）', () => {
  it('2 敌 ∈射程 + 1 敌 ∉射程 → cast 敌格：恰 2 条 skill|miss（targetId 按 all 声明序）+各自 hp≤hp0+射程外 hp 不变+四项终态单次', () => {
    const s = aoeBoard();
    const hp0 = { e0: hpOf(s, 'e0'), e1: hpOf(s, 'e1'), e2: hpOf(s, 'e2') };
    const n0 = s.events.length;
    const e0cell = s.snapshot().actors.find((a) => a.id === 'e0')!.pos;
    expect(s.submit({ type: 'cast', to: e0cell, skillId: 'te' })).toBe(true);
    const added = s.events.slice(n0);
    const settled = added.filter((e) => e.type === 'skill' || e.type === 'miss');
    expect(settled).toHaveLength(2); // 恰 2 条结算事件（射程内全体）
    // targetId 连续序 = all 声明序（「禁 sort」的行为锁——只数条数防不住按距离排序的错误实现）
    expect(settled.map((e) => (e as { targetId?: string }).targetId)).toEqual(['e0', 'e1']);
    expect(hpOf(s, 'e0')).toBeLessThanOrEqual(hp0.e0); // 各自独立掷骰全额伤害（miss 偶发容错 ≤）
    expect(hpOf(s, 'e1')).toBeLessThanOrEqual(hp0.e1);
    expect(hpOf(s, 'e2')).toBe(hp0.e2); // 射程外敌不受击（分野另一半）
    expect(castFinalFour(s)).toEqual({ neili: 50 - NEILI_COST_PER_CAST, cd: 2, bar: 0, selected: null }); // 双目标仍恰扣一次
    expect(added.some((e) => e.type === 'rejected' || e.type === 'move' || e.type === 'basic')).toBe(false); // cast 臂纯净
  });
});

describe('[五点②] 点击格无关：同 seed 同布点双场，点射程内空格 vs 点敌格事件流全等（V2 / SP-2）', () => {
  it('A 场 cast 空格 (6,8) / B 场 cast 敌格 (9,8) → 增量事件 slice JSON 全等（rng 消费同序同量）', () => {
    // 显式 place 布点防出生漂移（方案 §四-12）；两场 cast 前 events 已全等（同 seed 同操作）
    const mk = () => aoeBoard();
    const a = mk();
    const b = mk();
    const nA = a.events.length;
    const nB = b.events.length;
    expect(a.events.slice(0, nA)).toEqual(b.events.slice(0, nB)); // 前置：cast 前事件流已全等
    const e0cell = b.snapshot().actors.find((x) => x.id === 'e0')!.pos;
    expect(a.submit({ type: 'cast', to: offsetToAxial(6, 8), skillId: 'te' })).toBe(true); // 射程内空格
    expect(b.submit({ type: 'cast', to: e0cell, skillId: 'te' })).toBe(true); // 敌格
    expect(a.events.slice(nA)).toEqual(b.events.slice(nB)); // 点击格不影响结算结果（直接锁）
    const settled = a.events.slice(nA).filter((e) => e.type === 'skill' || e.type === 'miss');
    expect(settled).toHaveLength(2); // 恰 2 条结算事件（无 rejected 混入）
  });
});

describe('[AI 同构] 案 A：自动模式 AI 代行出技同构 AOE（V6 / 五点⑤「敌方同规则」）', () => {
  it('2 敌 ∈ AI 技射程 → AI 出技 te：恰 2 条相邻结算事件（targetId=all 序）+资源一次+射程外敌不受击+未走位移臂', () => {
    const p = unit({
      id: 'p', side: 'player', jimin: 200, weapon: 'sword',
      skills: [teSkill({ level: 20 })],
    });
    const s = makeSession(7, 'auto', p, [
      unit({ id: 'e0', side: 'enemy' }),
      unit({ id: 'e1', side: 'enemy' }),
      unit({ id: 'e2', side: 'enemy' }),
    ]);
    place(s, 'p', 7, 8);
    place(s, 'e0', 9, 8);
    place(s, 'e1', 8, 9);
    place(s, 'e2', 11, 8);
    const hp0 = { e0: hpOf(s, 'e0'), e1: hpOf(s, 'e1'), e2: hpOf(s, 'e2') };
    // tick 至首个玩家结算事件即停（BAR-2 tie-break 玩家先；敌方 move/basic 事件 actorId≠p 不干扰）
    let i0 = -1;
    for (let i = 0; i < 1500 && i0 < 0; i++) {
      s.tick(DT);
      i0 = s.events.findIndex((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    }
    expect(i0).toBeGreaterThanOrEqual(0);
    // 前置自检（防轮转竞态静默改语义）：首动瞬间 e2 确在射程外（fillRate 变更会让此断言红 = fail loudly）
    expect(cubeDistance(pu(s).hex, s._debug.units.find((u) => u.id === 'e2')!.hex)).toBeGreaterThan(2);
    const first = s.events[i0];
    expect(first.type === 'skill' || first.type === 'miss').toBe(true);
    expect(first.skillId).toBe('te'); // planSkill 臂先于普攻/位移（miss log 亦带 skillId，core:271）
    expect((first as { targetId?: string }).targetId).toBe('e0'); // all 声明序首目标
    const second = s.events[i0 + 1];
    expect(second.type === 'skill' || second.type === 'miss').toBe(true); // resolveAoe 同步循环相邻锁
    expect((second as { targetId?: string }).targetId).toBe('e1');
    expect(s.events.slice(0, i0).some((e) => e.type === 'move' && e.actorId === 'p')).toBe(false); // 未走位移臂
    expect(pu(s).neili).toBe(100 - NEILI_COST_PER_CAST); // 资源一次（双目标）
    expect(pu(s).cooldowns.get('te')).toBe(2); // R-08 写初值（幂等重复写无差异）
    expect(hpOf(s, 'e0')).toBeLessThanOrEqual(hp0.e0);
    expect(hpOf(s, 'e1')).toBeLessThanOrEqual(hp0.e1);
    expect(hpOf(s, 'e2')).toBe(hp0.e2); // 射程外敌不受击
  });
});

// ══════════ FACE-1 朝向规则（规格 v2.3 §4.3 · 方案《朝向规则修正方案-v0.1》§三.3 用例清单） ══════════
// 朝向由受击敌位置决定：①单敌朝该敌 ②AOE 朝最近敌 ③同距 rng 随机（SP-2 内）④空放保持点击格
// （既有 :612-625/:654-671 两处覆盖，悬置待 Leo 复核禁改）；吸附度量=cube 3D 点积（§二.4-A）、
// faceLeft=sign(2Δq+Δr)（§二.4-B）。

/** FACE-1 白盒局（对齐 castBoard 口径）：p(7,8) te level20（sword circle 射程2，普攻射程1）；
 * 敌位入参 [col,row][]（all 声明序），布点+拉条进输入态（激活/出手由用例定）。 */
function faceBoard(enemySpots: Array<[number, number]>, seed = 13): HexBattleSession {
  const p = unit({
    id: 'p', side: 'player', jimin: 200, weapon: 'sword', neili: 50, maxNeili: 50,
    skills: [teSkill({ level: 20 })],
  });
  const s = makeSession(
    seed, 'manual', p,
    enemySpots.map(([col, row], i) => unit({ id: `e${i}`, side: 'enemy' })),
  );
  place(s, 'p', 7, 8);
  enemySpots.forEach(([col, row], i) => place(s, `e${i}`, col, row));
  ready(s);
  return s;
}
const facingOf = (s: HexBattleSession, id: string) => s._debug.units.find((u) => u.id === id)!.hexFacing;
const faceLeftOf = (s: HexBattleSession, id: string) => s._debug.units.find((u) => u.id === id)!.faceLeft;
const castTe = (s: HexBattleSession, to: { q: number; r: number }) => {
  expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
  expect(s.submit({ type: 'cast', to, skillId: 'te' })).toBe(true);
};

describe('[FACE-1 ①] AOE 朝最近敌（faceTarget 定版 · 点击格废止）', () => {
  it('① e0 近(cube1 东)/e1 远(cube2 西) 均∈射程：cast 射程内空格 → hexFacing=吸附(p→e0)={1,0}；cast 远敌格仍朝 e0（旧「点击格定版」此处必 {-1,0}，直接锁）', () => {
    // 布点取两敌**吸附向不同**（东/西）使「最近」可经 hexFacing 观测（同向则 tie/远近均不可分）
    const spots: Array<[number, number]> = [[8, 8], [5, 8]]; // e0 正东 cube1 / e1 正西 cube2（非平局）
    const a = faceBoard(spots);
    castTe(a, offsetToAxial(6, 8)); // 射程内空格（p 正西 1）
    const settledA = a.events.filter((e) => (e.type === 'skill' || e.type === 'miss') && e.actorId === 'p');
    expect(settledA).toHaveLength(2); // AOE 双目标均结算
    expect(settledA.map((e) => (e as { targetId?: string }).targetId)).toEqual(['e0', 'e1']); // all 序保序
    expect(facingOf(a, 'p')).toEqual({ q: 1, r: 0 }); // 朝最近敌 e0（东），与点击格 (6,8) 无关
    // 负断言（点击格废止的直接锁）：换场 cast 远敌格（西向 e1 格）——仍朝最近敌 e0
    const b = faceBoard(spots);
    const e1cell = b.snapshot().actors.find((x) => x.id === 'e1')!.pos;
    castTe(b, e1cell);
    expect(facingOf(b, 'p')).toEqual({ q: 1, r: 0 }); // 若实现朝点击格/末目标则 ={-1,0} 必红
  });
});

describe('[FACE-1 ②] 同距平局 rng（规格③ · SP-2 确定性范围）', () => {
  it('②-a aoeBoard 原局（e0/e1 同距 2 平局）同 seed 双场：增量事件全等 + hexFacing 全等（tie 同掷同数同值）', () => {
    const a = aoeBoard();
    const b = aoeBoard();
    const nA = a.events.length;
    const nB = b.events.length;
    expect(a.submit({ type: 'cast', to: offsetToAxial(6, 8), skillId: 'te' })).toBe(true); // aoeBoard 已激活 te，勿重复 selectSkill（toggle 会取消选中）
    expect(b.submit({ type: 'cast', to: offsetToAxial(6, 8), skillId: 'te' })).toBe(true);
    expect(a.events.slice(nA)).toEqual(b.events.slice(nB)); // 同 seed 同操作 → 事件流逐位全等（SP-2）
    expect(facingOf(a, 'p')).toEqual(facingOf(b, 'p')); // tie 掷点亦全等
  });

  it('②-b 对照布点双 seed 分臂（rng 消费间接证据，§四-1）：e0(9,8)东/e1(5,8)西 同距平局——seed 5 tie→e0 / seed 7 tie→e1（施工实证扫描选定，非手摆）', () => {
    // 布点说明：aoeBoard 原局两敌同吸附 E（实证：seed13/7 hexFacing 恒 {1,0}），tie 取值无法经
    // hexFacing 观测——按方案 §四-1「平局/非平局对照布点」锁法改用两敌吸附向不同的对照局；
    // seed 对实证扫描（seed 1..400 全枚举）：E 族 189 个 / W 族 211 个、无第三态，取 5/7。
    const mk = (seed: number) => {
      const s = faceBoard([[9, 8], [5, 8]], seed); // e0 东距2（吸附 E）/ e1 西距2（吸附 W）
      castTe(s, offsetToAxial(6, 8));
      return s;
    };
    const s1 = mk(5);
    const s2 = mk(7);
    expect(facingOf(s1, 'p')).toEqual({ q: 1, r: 0 }); // tie→e0（实证值；勿按实现反推改布点）
    expect(facingOf(s2, 'p')).toEqual({ q: -1, r: 0 }); // tie→e1（实证值）——异 seed 取值分歧=rng 恰被消费的间接证据
    expect(facingOf(mk(5), 'p')).toEqual(facingOf(s1, 'p')); // 同 seed 复场恒同向（确定性背书）
    expect(facingOf(mk(7), 'p')).toEqual(facingOf(s2, 'p'));
  });
});

describe('[FACE-1 ③] 单敌朝该敌 + 竖向邻格吸附回归锚（§二.4）', () => {
  it('③a 单敌非正东向（左下邻格）：cast 臂与 attack 臂（F1 共用路径）均朝该敌 {-1,1}', () => {
    // offset(6,9) 相对 p(7,8) = axial (0,-1) 行错位左下邻格 → cube 吸附 {-1,1}（左下）
    const a = faceBoard([[6, 9]]);
    castTe(a, a.snapshot().actors.find((x) => x.id === 'e0')!.pos);
    expect(facingOf(a, 'p')).toEqual({ q: -1, r: 1 });
    const b = faceBoard([[6, 9]]);
    expect(b.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(true); // dist1 ≤ 普攻射程1
    expect(facingOf(b, 'p')).toEqual({ q: -1, r: 1 }); // doAttack F1 faceToward 语义锁（§四-3 勿删的反向背书）
  });

  it('③b 竖向邻格吸附回归锚：attack 后 hexFacing 必须=(0,-1)/(0,1)（修复前 axial 2D 点积误吸斜向）+ faceLeft=sign(2Δq+Δr)（修复前 Δcol=0 保持旧值）', () => {
    // 上邻格 offset(6,7)：row7 奇数行 q=col-3 → 与 p 同 q，axial Δ=(0,-1)。预置 faceLeft 证明写入
    // （旧实现 Δcol=0 两向均「保持旧值」→ 预置值原样必红；修复后按符号翻转必绿）
    const up = faceBoard([[6, 7]]);
    up._debug.units.find((u) => u.id === 'p')!.faceLeft = false;
    expect(up.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(true);
    expect(facingOf(up, 'p')).toEqual({ q: 0, r: -1 }); // 修复前误吸 {1,-1}（右上）——回归锁
    expect(faceLeftOf(up, 'p')).toBe(true); // sign(2·0+(-1))=-1 → 左（修复前保持 false）
    // 下邻格 offset(7,9)：row9 奇数行 q=col-4 → 与 p 同 q，axial Δ=(0,+1)
    const down = faceBoard([[7, 9]]);
    down._debug.units.find((u) => u.id === 'p')!.faceLeft = true;
    expect(down.submit({ type: 'attack', targetId: 'e0', skillId: null })).toBe(true);
    expect(facingOf(down, 'p')).toEqual({ q: 0, r: 1 }); // 修复前误吸 {-1,1}（左下）——回归锁
    expect(faceLeftOf(down, 'p')).toBe(false); // sign(+1) → 右（修复前保持 true）
  });
});

describe('[FACE-1 ⑤] 托管 AI 出技 AOE 朝最近敌（案 A 五点⑤ 敌方同构 · 可选项落地）', () => {
  it('自动局 AI 代行出技：faceTarget=最近敌 e0（左下）→ 终态朝 {-1,1}（修复前 AI 臂无收尾=末目标 e1 朝向 {1,0}）', () => {
    const p = unit({
      id: 'p', side: 'player', jimin: 200, weapon: 'sword',
      skills: [teSkill({ level: 20 })],
    });
    const s = makeSession(7, 'auto', p, [
      unit({ id: 'e0', side: 'enemy' }),
      unit({ id: 'e1', side: 'enemy' }),
      unit({ id: 'e2', side: 'enemy' }),
    ]);
    place(s, 'p', 7, 8);
    place(s, 'e0', 6, 9); // 最近 cube1 左下（吸附 {-1,1}）
    place(s, 'e1', 9, 8); // 远 cube2 正东（吸附 {1,0}）
    place(s, 'e2', 11, 8); // cube4 射程外
    const hp0 = { e0: hpOf(s, 'e0'), e2: hpOf(s, 'e2') };
    let i0 = -1;
    for (let i = 0; i < 1500 && i0 < 0; i++) {
      s.tick(DT);
      i0 = s.events.findIndex((e) => e.actorId === 'p' && (e.type === 'skill' || e.type === 'miss'));
    }
    expect(i0).toBeGreaterThanOrEqual(0);
    const settled = s.events.slice(i0, i0 + 2);
    expect(settled.map((e) => (e as { targetId?: string }).targetId)).toEqual(['e0', 'e1']); // 双目标 all 序
    expect(facingOf(s, 'p')).toEqual({ q: -1, r: 1 }); // 朝最近敌（faceTarget 收敛单点对 AI 臂同规则生效）
    expect(hpOf(s, 'e0')).toBeLessThanOrEqual(hp0.e0);
    expect(hpOf(s, 'e2')).toBe(hp0.e2); // 射程外不受击
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

// ══════════ T19/N1 演出层修复（方案 §3.2/§3.3 · 领单第一交付 B 组，先红后修） ══════════

/** T19 B 组白盒布点（对齐 behavior 套件 place() 口径）：确定性摆放 + 清动画/行动条态 */
function pin(s: HexBattleSession, id: string, col: number, row: number): void {
  const u = s._debug.units.find((x) => x.id === id)!;
  const hex = offsetToAxial(col, row);
  u.hex = { ...hex };
  u.renderQ = hex.q; u.renderR = hex.r; u.moveFromQ = hex.q; u.moveFromR = hex.r;
  u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0;
  u.bar = 0; u.barWasMax = false; u.dead = false;
  if (u.hp <= 0) u.hp = 50;
}

/** B 组共用场景：主角(5,8)、敌正东相邻(6,8)、敌后落点(7,8)、另一敌远离(11,3)；主角条满进输入态。
 * 主角配 20 级一阶轻功（对齐 behavior 套件 DEMO_SKILLS 口径）→ F-06 移动力 7，
 * 敌后绕行（BFS 3 步）方可落点——本组只测演出层，不测移动力预算。 */
function bScene(): { s: HexBattleSession; hero: ReturnType<HexBattleSession['_debug']['player']>; dest: ReturnType<typeof offsetToAxial>; foeCell: ReturnType<typeof offsetToAxial> } {
  const s = makeSession(42, 'manual', unit({ id: 'p', side: 'player', hp: 100, maxHp: 100, atk: 12, def: 3, skills: [{ id: 'qing', name: '轻', kind: 'qingGong', weapon: null, grade: 1.0, growth: 1, level: 20, cooldownTurns: 3, neiliCost: 15 }] }), [
    unit({ id: 'e0', side: 'enemy', hp: 100, maxHp: 100, atk: 12, def: 3 }),
    unit({ id: 'e1', side: 'enemy', hp: 100, maxHp: 100, atk: 12, def: 3 }),
  ]);
  pin(s, 'p', 5, 8);
  pin(s, 'e0', 6, 8);
  pin(s, 'e1', 11, 3);
  const hero = pu(s);
  hero.bar = 100;
  s.tick(0.001);
  return { s, hero, dest: offsetToAxial(7, 8), foeCell: offsetToAxial(6, 8) };
}

describe('[T19/N1] 演出延后（方案 §3.2）与回退轨插值（§3.3）', () => {
  it('B-1 §3.2：ATK-3 路径 submit 后零 tick 快照 animState 保持 walk；事件仍同步紧跟；walk 结束后补播 basic', () => {
    const { s, hero, dest } = bScene();
    expect(s.snapshot().pendingInput).toBe(true);
    const n0 = s.events.length;
    expect(s.submit({ type: 'move', to: dest })).toBe(true);
    // ① 零 tick：walk 演出未被 basicIfAdjacent 覆写（修复前此处 = 'basic'）
    expect(hero.animState).toBe('walk');
    // ② 结算/事件 emit 仍同步：move 事件后紧跟出手事件（绿锁不变式在本例复证）
    const tail = s.events.slice(n0).map((e) => e.type);
    const iMove = tail.indexOf('move');
    expect(iMove).toBeGreaterThanOrEqual(0);
    expect(tail.slice(iMove)).toContain('basic');
    // ③ pendingAnim 消费：walk（ANIM_MS.walk=300ms）结束后补播攻击演出
    for (let i = 0; i < 25; i++) s.tick(0.016); // 0.4s：跨过 walk 窗、停在 basic 窗内（敌 bar 未满不干扰）
    expect(hero.animState).toBe('basic');
  });

  it('B-2 §3.3：同排隔敌移动逐帧采样 renderPos 不进入敌占格；moveT=1 精确等于落点；逻辑 pos 即时到位', () => {
    const { s, hero, dest, foeCell } = bScene();
    expect(s.submit({ type: 'move', to: dest })).toBe(true);
    // ④ moveT=0：renderPos 从 path[0]（旧格）起、不预推进（walkRise from 取整前提）
    const a0 = s.snapshot().actors.find((x) => x.id === 'p')!;
    expect(a0.renderPos.q).toBe(dest.q - 2);
    expect(a0.renderPos.r).toBe(dest.r);
    const samples: Array<{ q: number; r: number; moveT: number }> = [];
    for (let i = 0; i < 40; i++) {
      s.tick(0.016);
      const a = s.snapshot().actors.find((x) => x.id === 'p')!;
      samples.push({ q: a.renderPos.q, r: a.renderPos.r, moveT: hero.moveT });
      if (hero.moveT >= 1) break;
    }
    expect(samples.some((sm) => sm.moveT > 0 && sm.moveT < 1)).toBe(true); // 采样确曾覆盖位移窗
    // ② moveT<1 期间画位不进入敌占格（修复前直线插值连续穿 (6,8)）
    for (const sm of samples) {
      if (sm.moveT < 1) {
        const throughFoe = Math.round(sm.q) === foeCell.q && Math.round(sm.r) === foeCell.r;
        expect(throughFoe).toBe(false);
      }
    }
    // ③ moveT=1：renderPos 逐字段精确等于落点（整数精确性 = FE settled 释放前提）
    const a = s.snapshot().actors.find((x) => x.id === 'p')!;
    expect(hero.moveT).toBe(1);
    expect(a.renderPos.q).toBe(dest.q);
    expect(a.renderPos.r).toBe(dest.r);
    // ⑤ 结算同步不变：逻辑 pos 在 submit 即时到位（插值只是演出）
    expect(a.pos).toEqual(dest);
    expect(s.snapshot().pendingInput).toBe(false); // 行动已消耗（O1 二选一）
  });
});

// ══════════ 体检报告防御性加固（docs/reviews/全仓代码体检-主架构-Codex-v1.md A01/A02/A03 · PM 裁定：非法输入 fail-fast） ══════════
// 纯新增用例，既有 211+14 零改写；行为契约=已验收行为零变更（快照出口断引用/空集 fail-fast/坏入口拒绝）。

describe('[A01] 快照出口防御性复制：篡改返回快照不得影响后续快照与结算（体检 A01）', () => {
  it('A01-1 attackCells 元素篡改（[0].q=999）：后续快照与基线逐格全等（元素对象已断引用）', () => {
    const s = armedBoard();
    const baseline = s.snapshot().attackCells;
    expect(baseline.length).toBeGreaterThan(0); // 前置：te circle 射程2 非空
    const s1 = s.snapshot();
    s1.attackCells[0].q = 999; // 报告 A01 复现手法：经外泄引用改内部对象
    const s2 = s.snapshot();
    expect(s2.attackCells).toEqual(baseline); // 修复前：s2.attackCells[0].q 同步变 999
  });

  it('A01-2 attackCells 结构篡改（push/length=0）：后续快照长度与内容不变（数组已断引用）', () => {
    const s = armedBoard();
    const baseline = s.snapshot().attackCells;
    const s1 = s.snapshot();
    s1.attackCells.push({ q: 999, r: 999 }); // 伪造高亮格
    const s3 = s.snapshot();
    expect(s3.attackCells).toHaveLength(baseline.length);
    expect(s3.attackCells).toEqual(baseline);
    // length=0 手法单独验证（同一数组二次取证）
    const s4 = s.snapshot();
    s4.attackCells.length = 0; // 报告原文复现：满条激活 te 后置空 → 修复前下一次快照长度即 0
    const s5 = s.snapshot();
    expect(s5.attackCells).toEqual(baseline);
  });

  it('A01-3 篡改不反向影响 cast 结算：清空快照高亮后真射程格仍受理；push 假格后 cast 假格 rejected(range)（结算恒读内部唯一真值）', () => {
    // 臂一：展示端清空快照 attackCells，cast 到真实射程内敌格 → 正常受理结算（病灶③显示=校验=结算内部同源不破坏）
    const hit = armedBoard();
    const e0cell = hit.snapshot().actors.find((a) => a.id === 'e0')!.pos;
    const tampered1 = hit.snapshot();
    tampered1.attackCells.length = 0; // 篡改快照
    const hp0 = eu(hit).hp;
    expect(hit.submit({ type: 'cast', to: e0cell, skillId: 'te' })).toBe(true);
    expect(hit.events.slice(-3).map((e) => e.type)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(skill|miss)$/)]),
    );
    expect(eu(hit).hp).toBeLessThanOrEqual(hp0);
    // 臂二：向快照 push 假格 {999,999}，cast 该假格 → rejected(range)（展示端无法把非法格拉进射程）
    const air = armedBoard();
    const tampered2 = air.snapshot();
    tampered2.attackCells.push({ q: 999, r: 999 });
    const n0 = air.events.length;
    expect(air.submit({ type: 'cast', to: { q: 999, r: 999 }, skillId: 'te' })).toBe(false);
    expect(air.events.slice(n0)).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'range' }));
  });

  it('A01-4 moveCells 轻功金格隔离：元素+结构篡改后后续快照与基线全等；伪金格 move → rejected(invalid)（submit 校验读内部集合）', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player', jimin: 200, skills: [qingSkill()] }), [
      unit({ id: 'e0', side: 'enemy' }),
    ]);
    expect(runToPending(s)).toBe(true);
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    expect(s.snapshot().moveKind).toBe('jump');
    const baseline = s.snapshot().moveCells;
    expect(baseline.length).toBeGreaterThan(0); // 前置：jimin 200 金格非空
    const s1 = s.snapshot();
    s1.moveCells[0].q = 999; // 元素篡改
    s1.moveCells.push({ q: 999, r: 999 }); // 伪造金格
    s1.moveCells.length = 0; // 清空
    expect(s.snapshot().moveCells).toEqual(baseline); // 三手法后仍全等
    // 伪金格不可提交：集合判定走内部 selection.legalCells（:267 出口断引用不影响校验同源）
    const n0 = s.events.length;
    expect(s.submit({ type: 'move', to: { q: 999, r: 999 } })).toBe(false);
    expect(s.events.slice(n0)).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'invalid' }));
  });

  it('A01-5 moveCells 无选中绿格隔离：篡改返回数组后下一次快照仍 ≡ 同参 reachable 全集', () => {
    const s = makeSession(13, 'manual', unit({ id: 'p', side: 'player' }), [unit({ id: 'e0', side: 'enemy' })]);
    expect(runToPending(s)).toBe(true);
    const expected = reachable(pu(s).hex, movePower(pu(s).skills), s._debug.units.filter((u) => !u.dead).map((u) => u.hex), inFieldOf(s));
    const s1 = s.snapshot();
    expect(s1.moveCells).toEqual(expected); // 前置：绿格=可达全集（MV-0 恒等式）
    s1.moveCells.length = 0;
    s1.moveCells.push({ q: 999, r: 999 });
    expect(s.snapshot().moveCells).toEqual(expected); // 每次快照独立复制，篡改不外溢
  });

  it('A01-6 其余快照数组字段现状锁：actors[].pos/heroSkills 每帧新建对象，篡改不外溢（防回归）', () => {
    const s = armedBoard(); // p 带 te → heroSkills 长度 1
    const baselineActors = s.snapshot().actors;
    expect(s.snapshot().heroSkills).toHaveLength(1);
    const s1 = s.snapshot();
    s1.actors.find((a) => a.id === 'p')!.pos.q = 999;
    s1.heroSkills[0].id = 'hacked';
    s1.actors[0].statusIcons.push('hacked' as never);
    const s2 = s.snapshot();
    expect(s2.actors).toEqual(baselineActors);
    expect(s2.heroSkills[0].id).toBe('te');
    expect(s2.actors.every((a) => a.statusIcons.length === 0)).toBe(true);
  });
});

describe('[A02] faceTargetOf 非空守卫：空集 fail-fast、非空零扰动、空放臂不误伤（体检 A02 + FACE-1 备忘合并）', () => {
  it('A02-1 空数组直接调用 → 抛 Error 消息含 "faceTargetOf: empty targets"（经 _debug 测试钩子直呼）', () => {
    const s = castBoard();
    expect(() => s._debug.faceTargetOf([])).toThrow('faceTargetOf: empty targets');
  });

  it('A02-2 非空调用守卫零扰动：单目标返回该 runner 本体（引用恒等，rng 零消费路径）', () => {
    const s = castBoard();
    const e0 = eu(s);
    expect(s._debug.faceTargetOf([e0])).toBe(e0); // ties==1 早退分支原样
  });

  it('A02-3 ATK-6 空放臂不误触发守卫：敌出射程局 cast 空格仍受理（true+skill 无 targetId）——length>0 守卫与空放臂互指的行为证据', () => {
    const air = castBoard(11); // e0(11,8) 出 te 射程（cube 4 > 2）→ cast=真空放，targets.length===0 不进 resolveAoe
    expect(air.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    const tail0 = air.events.length;
    expect(air.submit({ type: 'cast', to: offsetToAxial(6, 8), skillId: 'te' })).toBe(true); // 不抛
    const tail = air.events[air.events.length - 1];
    expect(tail.type).toBe('skill');
    expect('targetId' in tail).toBe(false); // 空放事件形状不变
    expect(air.events.length).toBe(tail0 + 1);
  });
});

describe('[A03] 入口运行时校验：非法输入 fail-fast 抛 Error（体检 A03 · PM 裁定：不静默吞不兜底）', () => {
  it('A03-1 tick 非法 dt（NaN/Infinity/-1/-0.001）各抛错且抛后 session 状态无损（clock 不动、后续合法 tick 正常）', () => {
    const s = castBoard();
    const c0 = s._debug.clock();
    for (const bad of [Number.NaN, Infinity, -1, -0.001]) {
      expect(() => s.tick(bad)).toThrow(/tick: dt must be a finite non-negative number/);
    }
    expect(s._debug.clock()).toBe(c0); // fail-fast 零半写
    // 后续合法 tick 正常：auto 局时钟照常推进（castBoard 手动局处 pending 态，BAR-4 冻结时钟不可作推进证据）
    const auto = makeSession(13, 'auto', unit({ id: 'p', side: 'player' }), [unit({ id: 'e0', side: 'enemy' })]);
    expect(auto._debug.clock()).toBe(0);
    auto.tick(0.001);
    expect(auto._debug.clock()).toBeCloseTo(0.001, 10);
  });

  it('A03-2 边界合法：tick(0) 不抛且零前进（clock/bar 均不动）——「非负有限」收下界', () => {
    const s = castBoard();
    const c0 = s._debug.clock();
    const bar0 = pu(s).bar;
    expect(() => s.tick(0)).not.toThrow();
    expect(s._debug.clock()).toBe(c0);
    expect(pu(s).bar).toBe(bar0);
  });

  it('A03-3 阵容 id 重复 → 抛：玩家与敌重名、敌间重名各报 "duplicate combatant id"', () => {
    expect(() =>
      makeSession(13, 'manual', unit({ id: 'p', side: 'player' }), [unit({ id: 'p', side: 'enemy' })]),
    ).toThrow('createHexBattle: duplicate combatant id "p"');
    expect(() =>
      makeSession(13, 'manual', unit({ id: 'p', side: 'player' }), [
        unit({ id: 'e0', side: 'enemy' }),
        unit({ id: 'e0', side: 'enemy' }),
      ]),
    ).toThrow('createHexBattle: duplicate combatant id "e0"');
  });

  it('A03-4 敌数超出生格容量 → 抛：100 敌报 "spawn capacity"；精确边界=容量恰收、容量+1 抛、满容量出生格两两互异', () => {
    // 测试侧独立推导容量：敌锚=offset(11,2)（D1 SP-1），容量=可动区内锚距 ≤3 的格数
    const anchor = offsetToAxial(11, 2);
    const cap = (() => {
      let n = 0;
      for (let row = FIELD_ROW_MIN; row <= FIELD_ROW_MAX; row++) {
        for (let col = FIELD_COL_MIN; col <= FIELD_COL_MAX; col++) {
          if (cubeDistance(anchor, offsetToAxial(col, row)) <= 3) n++;
        }
      }
      return n;
    })();
    expect(cap).toBeGreaterThanOrEqual(6); // 前置：合法 1~6 敌基线恒在容量内
    // 超容量（报告复现输入 100 敌）
    const many = Array.from({ length: 100 }, (_, i) => unit({ id: `e${i}`, side: 'enemy' }));
    expect(() => makeSession(13, 'manual', unit({ id: 'p', side: 'player' }), many)).toThrow(
      /createHexBattle: enemy count 100 exceeds spawn capacity/,
    );
    // 精确边界：容量=满编受理（出生格互异）、容量+1=抛
    const full = Array.from({ length: cap }, (_, i) => unit({ id: `e${i}`, side: 'enemy' }));
    const ok = makeSession(13, 'manual', unit({ id: 'p', side: 'player' }), full);
    expect(ok._debug.units).toHaveLength(cap + 1);
    const spawns = ok._debug.units.map((u) => `${u.hex.q},${u.hex.r}`);
    expect(new Set(spawns).size).toBe(spawns.length); // 出生格两两互异（shuffleTake 不重叠的容量前提）
    const over = Array.from({ length: cap + 1 }, (_, i) => unit({ id: `e${i}`, side: 'enemy' }));
    expect(() => makeSession(13, 'manual', unit({ id: 'p', side: 'player' }), over)).toThrow(
      new RegExp(`createHexBattle: enemy count ${cap + 1} exceeds spawn capacity ${cap}`),
    );
  });

  it('A03-5 合法 6 敌基线不受影响：auto 局跑到终局零异常、phase ∈ won/lost（core rollEnemyCount 上限档）', () => {
    const s = makeSession(7, 'auto', unit({ id: 'p', side: 'player' }), [
      unit({ id: 'e0', side: 'enemy' }),
      unit({ id: 'e1', side: 'enemy' }),
      unit({ id: 'e2', side: 'enemy' }),
      unit({ id: 'e3', side: 'enemy' }),
      unit({ id: 'e4', side: 'enemy' }),
      unit({ id: 'e5', side: 'enemy' }),
    ]);
    autoTillEnd(s);
    expect(['won', 'lost']).toContain(s.phase);
  });
});
