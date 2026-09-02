// T15 对局编排层单测（DoD：session 6 例——行动条满触发/预算二选一/AI 优先级序/托管切换/
// 事件流全等/胜负结算；另含 Q1 批复要求的「hex 相邻格普攻不被 core 误判 blocked」锚点用例）
// 运行：npm run test:battle（vitest）
import { describe, expect, it } from 'vitest';
import { createHexBattle, assembleRoster } from '../systems/battle-session';
import { makeRng } from '../systems/battle-core';
import { axialToOffset, cubeDistance, hexNeighbors, movePower, offsetToAxial, reachable } from '../systems/hex';
import type { CombatantInput, SkillDef } from '../types';

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

/** 场界谓词（与 session 内 inField 同式：可移动区 8×8 居中），供用例侧对照计算 */
const inFieldOf = (_s: ReturnType<typeof createHexBattle>) => (p: { q: number; r: number }) => {
  const off = axialToOffset(p);
  return off.col >= 4 && off.col <= 11 && off.row >= 4 && off.row <= 11;
};

/** 取敌单位（单敌局） */
const eu = (s: ReturnType<typeof createHexBattle>) => s._debug.units.find((u) => u.id === 'e0')!;

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
    // 激活不耗 O1 预算：cancel 后移动候选恢复
    expect(s.submit({ type: 'cancelSkill' })).toBe(true);
    expect(s.snapshot().selectedSkill).toBeNull();
    const cells = s.snapshot().moveCells;
    expect(cells.length).toBeGreaterThan(0);
    expect(s.submit({ type: 'move', to: cells[0] })).toBe(true);
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

// ---------- 返工工单（验收 F1/F2/F3）：轻功交互链 + heroSkills + configId ----------
describe('轻功交互链（F1 阻塞项修复验证）', () => {
  const qing: SkillDef = {
    id: 'qing',
    name: '草上飞',
    kind: 'qingGong',
    weapon: null,
    grade: 1.0,
    growth: 1,
    level: 10,
    cooldownTurns: 0,
    neiliCost: 0,
  };

  function qingSession() {
    const p = unit({
      id: 'p',
      side: 'player',
      jimin: 200,
      neili: 50,
      maxNeili: 50,
      weapon: 'fist',
      skills: [
        qing,
        { ...qing, id: 'expensive', name: '昂贵技', kind: 'waiGong', weapon: 'fist', neiliCost: 999 }, // 内力不足 → 置灰样本
      ],
    });
    const e = unit({ id: 'e0', side: 'enemy', name: 'shanzei' });
    const s = makeSession(13, 'manual', p, [e]);
    return { s, p };
  }

  it('selectSkill(轻功) → 快照 moveCells=跳跃可达格（moveKind=jump/attackCells 空）→ 点格位移成功', () => {
    const { s } = qingSession();
    expect(runToPending(s)).toBe(true);

    // 未激活：moveCells = 普通∪跳跃并集，moveKind=walk
    const idle = s.snapshot();
    expect(idle.moveKind).toBe('walk');
    expect(idle.moveCells.length).toBeGreaterThan(0);

    // 激活轻功：移动型技能分支（F1 修复点）——跳跃可达格 + 金色形态 + 攻击范围置空
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    const snap = s.snapshot();
    expect(snap.selectedSkill).toBe('qing');
    expect(snap.moveKind).toBe('jump');
    expect(snap.attackCells).toEqual([]); // 轻功不再误出「武器射程红圈」（F1 证据链第 2 条）
    expect(snap.moveCells.length).toBeGreaterThan(0);
    // 跳跃格语义：cube 距离 ≤ ⌊power/2⌋=2（grade1.0+1、⌊10/5⌋+2 → power5），不含自己/敌占格
    const pu = s._debug.units.find((u) => u.id === 'p')!;
    const eu = s._debug.units.find((u) => u.id === 'e0')!;
    for (const c of snap.moveCells) {
      expect(cubeDistance(pu.hex, c)).toBeLessThanOrEqual(2);
      expect(c.q === pu.hex.q && c.r === pu.hex.r).toBe(false);
      expect(c.q === eu.hex.q && c.r === eu.hex.r).toBe(false);
    }

    // 校验与显示一致：激活态下点「非跳跃格」（未激活时合法的远格）被拒
    const far = idle.moveCells.find((c) => cubeDistance(pu.hex, c) > 2);
    if (far) expect(s.submit({ type: 'move', to: far })).toBe(false);

    // 模拟点格（input 侧 qing && inMove 路径）：位移成功 + move 事件 + isJump 真值
    const to = snap.moveCells[0];
    const before = { q: pu.hex.q, r: pu.hex.r };
    expect(s.submit({ type: 'move', to })).toBe(true);
    const after = s._debug.units.find((u) => u.id === 'p')!.hex;
    expect(after.q === before.q && after.r === before.r).toBe(false); // 位置变更
    expect(s.events[s.events.length - 1]).toMatchObject({ type: 'move', actorId: 'p' });
    const jumping = s.snapshot().actors.find((a) => a.id === 'p')!;
    expect(jumping.isJump).toBe(true); // 快照真值（F1）：渲染禁启发式猜
    s.tick(0.35); // > ANIM_MS.walk(300ms)：lerp 结束后 isJump 复位
    expect(s.snapshot().actors.find((a) => a.id === 'p')!.isJump).toBe(false);
    // 行动消耗：轻功 sticky 态保持激活（L 环②：连跳不丢）、预算归零
    expect(s.snapshot().selectedSkill).toBe('qing');
    expect(s.submit({ type: 'move', to })).toBe(false);
  });

  it('heroSkills 会话真值（F2）：内力不足置灰；敌 actor configId/spriteKey（F3）', () => {
    const { s } = qingSession();
    expect(runToPending(s)).toBe(true);
    const snap = s.snapshot();
    const qingBtn = snap.heroSkills.find((b) => b.id === 'qing')!;
    const expBtn = snap.heroSkills.find((b) => b.id === 'expensive')!;
    expect(qingBtn).toEqual({ id: 'qing', label: '草上飞', disabled: false }); // 内力够/无冷却/无武器约束
    expect(expBtn.disabled).toBe(true); // 内力 50 < 999 → 置灰（会话真值，Ext 过渡段可降级）
    // F3：敌型身份带出 —— configId=模板名，spriteKey 约定 = configId；玩家走 hero 帧表
    const enemy = snap.actors.find((a) => a.id === 'e0')!;
    expect(enemy.configId).toBe('shanzei');
    expect(enemy.spriteKey).toBe('shanzei');
    const hero = snap.actors.find((a) => a.id === 'p')!;
    expect(hero.configId).toBeUndefined();
    expect(hero.spriteKey).toBe('hero');
  });
});

// ---------- L 环反馈修复（①穿模 / ②三跳失效 / ③点特不重置） ----------
describe('L 环①：普通移动不可穿越单位（C 案 A3）', () => {
  const qing2: SkillDef = {
    id: 'qing2', name: '二阶轻功', kind: 'qingGong', weapon: null,
    grade: 1.3, growth: 1, level: 10, cooldownTurns: 0, neiliCost: 0,
  };

  it('未激活轻功时 moveCells ≡ 普通可达集（跳跃格不并入）；占格不可落脚', () => {
    // 玩家带二阶轻功（power=2+2+2=6，跳跃半径 3）：修复前未激活态把跳跃格并进 moveCandidates，
    // 普通移动可点跳跃格穿越单位占格（穿模根因）；修复后 moveCells 恒等于普通可达集。
    // 「路径穿过单位占格 → 该格不可达」的 BFS 几何行为由 tests/hex.test.ts 用例④
    // （单格阻挡失达/整墙切割）背书，此处锁死 session 候选不再并入跳跃集。
    const p = unit({
      id: 'p', side: 'player', jimin: 200, skills: [qing2],
    });
    const e = unit({ id: 'e0', side: 'enemy', name: 'shanzei' });
    const s = makeSession(13, 'manual', p, [e]);
    expect(runToPending(s)).toBe(true);
    const pu = s._debug.units.find((u) => u.id === 'p')!;
    const power = movePower(pu.skills);
    const occupiedCells = s._debug.units.filter((u) => !u.dead).map((u) => u.hex);
    const normal = reachable(pu.hex, power, occupiedCells, inFieldOf(s));
    const snap = s.snapshot();
    // 集合全等（对「并集移除」是充要守卫）：moveCells ≯ normalReach
    expect(snap.moveCells.length).toBe(normal.length);
    for (const c of snap.moveCells) {
      expect(normal.some((n) => n.q === c.q && n.r === c.r)).toBe(true);
      expect(occupiedCells.some((o) => o.q === c.q && o.r === c.r)).toBe(false); // 占格不可落脚
    }
    // 敌贴身后同理（敌 AI 第 4 级位移同样不并入跳跃格，AI 与玩家同构守普通规则）
    for (let i = 0; i < 600; i++) {
      s.tick(DT);
      if (s.snapshot().pendingInput && cubeDistance(pu.hex, eu(s).hex) <= 1) break;
    }
    const snap2 = s.snapshot();
    const normal2 = reachable(s._debug.units.find((u) => u.id === 'p')!.hex, power, s._debug.units.filter((u) => !u.dead).map((u) => u.hex), inFieldOf(s));
    expect(snap2.moveCells.length).toBe(normal2.length);
    expect(snap2.moveCells.every((c) => !normal2.some((n) => n.q === c.q && n.r === c.r) === false)).toBe(true);
  });

  it('AI 位移不穿模：敌方首个移动事件的目标格在场内且不与其他单位重叠', () => {
    const p = unit({ id: 'p', side: 'player', jimin: 0 });
    const e = unit({ id: 'e0', side: 'enemy', jimin: 0, skills: [qing2] }); // 敌带轻功（power 6）：AI 也不许跳
    const s = makeSession(13, 'auto', p, [e]);
    for (let i = 0; i < 300 && !s.events.some((ev) => ev.type === 'move' && ev.actorId === 'e0'); i++) s.tick(DT);
    const moveEv = s.events.find((ev) => ev.type === 'move' && ev.actorId === 'e0')!;
    const to = moveEv.toX !== undefined && moveEv.toY !== undefined ? offsetToAxial(moveEv.toX, moveEv.toY) : null;
    expect(to).not.toBeNull();
    expect(inFieldOf(s)(to!)).toBe(true);
    // 落点排除其他存活单位（移动者自身除外——它此刻已站在该格）
    for (const u of s._debug.units) {
      if (u.id === 'e0') continue;
      expect(u.hex.q === to!.q && u.hex.r === to!.r).toBe(false);
    }
  });
});

describe('L 环②：轻功 sticky 态（连续跳跃不再丢失激活）', () => {
  const qing: SkillDef = {
    id: 'qing', name: '草上飞', kind: 'qingGong', weapon: null,
    grade: 1.3, growth: 1, level: 10, cooldownTurns: 0, neiliCost: 0,
  };

  function qingOnly() {
    const p = unit({ id: 'p', side: 'player', jimin: 200, skills: [qing] });
    const e = unit({ id: 'e0', side: 'enemy', hp: 999999, maxHp: 999999, atk: 1 });
    return makeSession(13, 'manual', p, [e]);
  }

  it('激活一次后连续三跳全链：每跳走跳跃格、激活态保持、isJump 真值；同 id 再点 toggle 取消', () => {
    const s = qingOnly();
    expect(runToPending(s)).toBe(true);
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);

    const path: Array<{ q: number; r: number }> = [];
    for (let hop = 1; hop <= 3; hop++) {
      // 等到玩家下一次条满（sticky 态下无需再点轻功钮）
      for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
      const snap = s.snapshot();
      expect(snap.pendingInput).toBe(true);
      expect(snap.selectedSkill).toBe('qing'); // 第 N 跳前激活仍在（修复点：不再被行动清掉）
      expect(snap.moveKind).toBe('jump');
      expect(snap.moveCells.length).toBeGreaterThan(0);
      const pu = s._debug.units.find((u) => u.id === 'p')!;
      path.push({ ...pu.hex });
      const to = snap.moveCells[0];
      expect(s.submit({ type: 'move', to })).toBe(true); // 三跳全受理
      const actor = s.snapshot().actors.find((a) => a.id === 'p')!;
      expect(actor.isJump).toBe(true); // 每跳都是跳跃真值（非普通移动退化）
      expect(s.events[s.events.length - 1]).toMatchObject({ type: 'move', actorId: 'p' });
    }
    // 三跳位置逐次变更（全链位移成立）
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      expect(a.q !== b.q || a.r !== b.r).toBe(true);
    }
    // toggle 取消：同 id 再点 → 回普通态
    for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    expect(s.snapshot().selectedSkill).toBeNull();
    expect(s.snapshot().moveKind).toBe('walk');
  });
});

describe('L 环③：不可用技能降级普攻（行动条必重置）', () => {
  function skillSession() {
    const p = unit({
      id: 'p', side: 'player', jimin: 200, weapon: 'sword',
      neili: 10, maxNeili: 10, hp: 999999, maxHp: 999999, def: 99999,
      skills: [
        { id: 'te', name: '特技', kind: 'special', weapon: 'sword', grade: 1.7, growth: 3, level: 10, cooldownTurns: 2, neiliCost: 10 },
      ],
    });
    const e = unit({ id: 'e0', side: 'enemy', hp: 999999, maxHp: 999999, atk: 1, name: 'shanzei' });
    return makeSession(13, 'manual', p, [e]);
  }

  /** 推进到玩家条满且与敌相邻（seed 13）：条满而敌未贴上时主动移动靠近——
   * 不干等（手动挂机 90s 会触发托管链，干扰被测的降级路径） */
  function waitAdjacent(s: ReturnType<typeof createHexBattle>): void {
    for (let guard = 0; guard < 40; guard++) {
      for (let i = 0; i < 600 && !s.snapshot().pendingInput && s.phase === 'fighting'; i++) s.tick(DT);
      if (s.phase !== 'fighting') throw new Error('战斗提前结束');
      if (dist(s, 'p', 'e0') <= 1) return;
      const cells = s.snapshot().moveCells;
      const target = s._debug.units.find((u) => u.id === 'e0')!;
      const to = cells.slice().sort((a, b) => cubeDistance(a, target.hex) - cubeDistance(b, target.hex))[0];
      if (to) s.submit({ type: 'move', to });
    }
    throw new Error('40 回合内未形成贴脸局面');
  }

  it('冷却窗口点「特」→ 降级普攻出手（fallback+basic）且行动条重置；内力耗尽同理', () => {
    const s = skillSession();
    waitAdjacent(s);
    // 回合 1：特技真施放（可用：内力 10 够 / 冷却 0）
    const barBefore = s._debug.units.find((u) => u.id === 'p')!.bar;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(true);
    expect(s.events.some((ev) => ev.type === 'skill' && ev.skillId === 'te')).toBe(true);
    // 行动条重置 = 扣满值一次（bar 无上限 clamp，镜像 core 口径，故用差值断言）
    expect(s._debug.units.find((u) => u.id === 'p')!.bar).toBeCloseTo(barBefore - 100, 6);

    // 回合 2（冷却 1 + 内力 0）：再点「特」→ 不再静默拒卡条，降级普攻兜底
    for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
    const barBefore2 = s._debug.units.find((u) => u.id === 'p')!.bar;
    const nEvents = s.events.length;
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(true);
    const fresh = s.events.slice(nEvents).filter((ev) => ev.actorId === 'p');
    expect(fresh.map((ev) => ev.type)).toContain('fallback'); // core act() 同款兜底提示
    expect(fresh.some((ev) => ['basic', 'miss'].includes(ev.type))).toBe(true); // 普攻真出手
    expect(fresh.every((ev) => ev.type !== 'skill')).toBe(true); // 特技未施放
    expect(s._debug.units.find((u) => u.id === 'p')!.bar).toBeCloseTo(barBefore2 - 100, 6); // 重置（L 环③主诉）

    // 后续回合（冷却归零但内力 0）：仍降级，绝不静默卡条
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(DT);
      expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(true);
    }
    const fallbackCount = s.events.filter((ev) => ev.type === 'fallback' && ev.actorId === 'p').length;
    expect(fallbackCount).toBeGreaterThanOrEqual(3);
  });

  it('射程外点「特」仍拒绝（走位是玩家决策，不降级乱打）', () => {
    const s = skillSession();
    expect(runToPending(s)).toBe(true); // seed 13 开局敌距 3 > 普攻射程 1
    expect(s.submit({ type: 'attack', targetId: 'e0', skillId: 'te' })).toBe(false);
    // 拒绝不消耗行动（条保持满，等待玩家走位或换目标）
    expect(s.snapshot().pendingInput).toBe(true);
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
// O3 出生带（L 环④修正后口径）：hex 平顶投影 y = r + q/2（py ∝ y，y 大=屏幕下方）。
// offset 矩形「左下」子区投影斜切到视觉中部（L 环④根因），故按投影分带选格：
// 我方 = 可动区 y≥10 且 q≤2（视觉左下角），敌方 = y≤8.5 且 q≥5（视觉右上角）。
describe('O3 出生布点（L 环④投影分带口径）', () => {
  const projY = (p: { q: number; r: number }) => p.r + p.q / 2;

  it('我方整带投影严格低于敌方（min 我方 y > max 敌方 y）且偏左/偏右；seed 可控可复现', () => {
    for (const seed of [1, 7, 13, 42, 99]) {
      const enemyCount = seed === 42 ? 6 : 2; // 满编容量一并验证（敌带 7 格 ≥ 上限 6）
      const enemies = Array.from({ length: enemyCount }, (_, i) => unit({ id: `e${i}`, side: 'enemy' as const }));
      const s = makeSession(seed, 'auto', unit({ id: 'p', side: 'player' }), enemies);
      const mine = s._debug.units.filter((u) => u.side === 'player').map((u) => u.hex);
      const foe = s._debug.units.filter((u) => u.side === 'enemy').map((u) => u.hex);
      // 投影分离（L 环④主断言）：我方最浅格仍深于敌方最深格 → 屏幕上我方整带在下方
      const mineY = mine.map(projY);
      const foeY = foe.map(projY);
      expect(Math.min(...mineY)).toBeGreaterThan(Math.max(...foeY));
      expect(Math.min(...mineY)).toBeGreaterThanOrEqual(10); // 我方带口径
      expect(Math.max(...foeY)).toBeLessThanOrEqual(8.5); // 敌方带口径
      // 横向偏向：我方 q≤2（左）、敌方 q≥5（右）
      for (const h of mine) expect(h.q).toBeLessThanOrEqual(2);
      for (const h of foe) expect(h.q).toBeGreaterThanOrEqual(5);
      // 不重叠、不出可动区
      const offs = s._debug.units.map((u) => axialToOffset(u.hex));
      for (const off of offs) {
        expect(off.col).toBeGreaterThanOrEqual(4);
        expect(off.col).toBeLessThanOrEqual(11);
        expect(off.row).toBeGreaterThanOrEqual(4);
        expect(off.row).toBeLessThanOrEqual(11);
      }
      expect(new Set(offs.map((o) => `${o.col},${o.row}`)).size).toBe(offs.length);
    }
    // 同 seed 布局可复现
    const mk = () =>
      makeSession(42, 'auto', unit({ id: 'p', side: 'player' }), [
        unit({ id: 'e0', side: 'enemy' }),
        unit({ id: 'e1', side: 'enemy' }),
      ]);
    const a = mk();
    const b = mk();
    expect(a._debug.units.map((u) => u.hex)).toEqual(b._debug.units.map((u) => u.hex));
  });
});
