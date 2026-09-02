// T15 · node 全流程对局时间线（DoD：自动一场 + 手动脚本一场 + 托管一场）
// 每场断言「时间线关键帧」：事件类型的先后次序与终局，验证 session 全链路
// （出生 → 行动条轮转 → 预算/AI/托管 → 出招结算 → 胜负）在一次完整对局中的行为闭环。
// 运行：npm run test:battle（vitest，node 环境，无渲染依赖）
import { describe, expect, it } from 'vitest';
import { createHexBattle, type HexBattleSession } from '../systems/battle-session';
import { cubeDistance } from '../systems/hex';
import type { BattleUiEvent, CombatantInput } from '../types';

const DT = 0.1;

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

/** 事件流 → 时间线关键帧字符串（t | type | actor[→target]），供次序断言与人工审读 */
function timeline(events: BattleUiEvent[]): string[] {
  return events.map((e) => `${e.t.toFixed(1)} ${e.type} ${e.actorId ?? '-'}${e.targetId ? '→' + e.targetId : ''}`);
}

function autoTillEnd(s: HexBattleSession, maxSec = 95): void {
  for (let i = 0; i < maxSec / DT && s.phase === 'fighting'; i++) s.tick(DT);
}

// ---------- 一场：自动对局（玩家近战强攻 vs 单敌） ----------
describe('时间线①：自动对局', () => {
  it('出生随机 → 位移接近 → 互换出手 → 终局 win/lose，事件次序完整', () => {
    const s = createHexBattle({
      player: unit({ id: 'p', side: 'player', jimin: 120, atk: 300, def: 30, hp: 300, maxHp: 300 }),
      enemies: [unit({ id: 'e0', side: 'enemy', hp: 200, maxHp: 200, atk: 40, def: 10, jimin: 60 })],
      mode: 'auto',
      seed: 7,
    });
    autoTillEnd(s);

    const tl = timeline(s.events);
    // 关键帧 1：开局首事件是首名行动者的 bar-max（行动条驱动，无部署阶段）
    expect(tl[0]).toContain('bar-max');
    // 关键帧 2：存在位移（出生随机距离 > 普攻射程 1，AI 第 4 级先位移）
    expect(s.events.some((e) => e.type === 'move')).toBe(true);
    // 关键帧 3：存在出手结算事件（basic/miss 至少其一）
    expect(s.events.some((e) => ['basic', 'miss'].includes(e.type))).toBe(true);
    // 关键帧 4：终局有胜负宣告，且终局后无新事件
    const last = s.events[s.events.length - 1];
    expect(['win', 'lose']).toContain(last.type);
    expect(s.phase === 'won' || s.phase === 'lost').toBe(true);
    // 防死循环口径：自动局逻辑时长不超过 90s 总限
    expect(s._debug.clock()).toBeLessThanOrEqual(90.01);
    // 快照终态：phase 一致、actors 完整（渲染可安全消费）
    const snap = s.snapshot();
    expect(snap.phase).toBe(s.phase);
    expect(snap.actors.length).toBe(2);
  });
});

// ---------- 二场：手动脚本对局（点选移动/点选普攻交替） ----------
describe('时间线②：手动脚本对局', () => {
  /** 确定性操作脚本：每回合若已与敌相邻则普攻，否则向敌移动一格（候选中取离敌最近者） */
  function scriptedRun(seed: number): { s: HexBattleSession; moves: number; attacks: number } {
    const s = createHexBattle({
      player: unit({ id: 'p', side: 'player', jimin: 200, atk: 200, def: 30, hp: 300, maxHp: 300 }),
      enemies: [unit({ id: 'e0', side: 'enemy', hp: 150, maxHp: 150, atk: 30, def: 10, jimin: 60 })],
      mode: 'manual',
      seed,
    });
    let moves = 0;
    let attacks = 0;
    for (let round = 0; round < 30 && s.phase === 'fighting'; round++) {
      for (let i = 0; i < 400 && !s.snapshot().pendingInput && s.phase === 'fighting'; i++) s.tick(DT);
      if (s.phase !== 'fighting') break;
      const pu = s._debug.units.find((u) => u.id === 'p')!;
      const eu = s._debug.units.find((u) => u.id === 'e0')!;
      if (cubeDistance(pu.hex, eu.hex) <= 1) {
        if (s.submit({ type: 'attack', targetId: 'e0', skillId: null })) attacks++;
      } else {
        const cells = s.snapshot().moveCells;
        if (cells.length > 0) {
          const to = cells
            .slice()
            .sort(
              (a, b) =>
                cubeDistance(a, eu.hex) - cubeDistance(b, eu.hex) ||
                cubeDistance(a, pu.hex) - cubeDistance(b, pu.hex),
            )[0];
          if (s.submit({ type: 'move', to })) moves++;
        }
      }
    }
    return { s, moves, attacks };
  }

  it('脚本化 submit（move→attack 交替）事件流确定，操作真值走 core 结算', () => {
    const { s, moves, attacks } = scriptedRun(13);
    // 脚本闭环：至少一次移动与一次普攻被受理
    expect(moves).toBeGreaterThan(0);
    expect(attacks).toBeGreaterThan(0);
    // 受理数与事件数一致（每次成功操作恰产生对应事件流）
    expect(s.events.filter((e) => e.type === 'move' && e.actorId === 'p').length).toBe(moves);
    expect(s.events.some((e) => ['basic', 'miss'].includes(e.type) && e.actorId === 'p')).toBe(true);
    // 对局终态合法（手动节奏 30 回合内不强制打完）
    expect(['fighting', 'won', 'lost', 'fled']).toContain(s.phase);
    // 确定性：同 seed + 同脚本 → 事件流全等（DoD 硬项的对局级复验）
    const replay = scriptedRun(13);
    expect(replay.s.events).toEqual(s.events);
  });
});

// ---------- 三场：托管对局（挂机 → trust 代行 → switchAuto → 自动打完） ----------
describe('时间线③：托管对局', () => {
  it('90s 挂机 → trust AI 代行 → 再 90s → switchAuto → 自动终局，链路次序完整', () => {
    const s = createHexBattle({
      player: unit({ id: 'p', side: 'player', hp: 500, maxHp: 500, atk: 120, def: 20 }),
      enemies: [unit({ id: 'e0', side: 'enemy', hp: 200, maxHp: 200, atk: 25, def: 8 })],
      mode: 'manual',
      seed: 7,
    });
    // 挂机到切自动（trust 90s + 玩家条再满 ~10s + 再 90s ≈ 200s 挂钟），再自动打到终局
    for (let i = 0; i < 600 && s.phase === 'fighting' && s._debug.mode() === 'manual'; i++) s.tick(1);
    expect(s._debug.mode()).toBe('auto');
    autoTillEnd(s);

    const types = s.events.map((e) => e.type);
    const iTrust = types.indexOf('trust');
    const iSwitch = types.indexOf('switch-auto');
    expect(iTrust).toBeGreaterThanOrEqual(0);
    expect(iSwitch).toBeGreaterThan(iTrust); // 托管先代行、后切自动（docs/80 §4 双阈值次序）
    // trust 代行：trust 后紧随本回合 AI 行动事件（玩家 id 出招/位移）
    expect(s.events.slice(iTrust + 1).some((e) => e.actorId === 'p' && ['move', 'basic', 'miss'].includes(e.type))).toBe(true);
    // 终局：切自动后战斗正常收束
    const last = s.events[s.events.length - 1];
    expect(['win', 'lose', 'timeout-hp']).toContain(last.type);
    expect(s.phase === 'won' || s.phase === 'lost').toBe(true);
  });
});
