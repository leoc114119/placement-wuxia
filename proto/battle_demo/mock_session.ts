// mock 会话（T16 演示专用）：模拟 T15 battle-session 的「快照产出 + ActionRequest 消费」。
// ⚠ 本文件全部数值（伤害/内力/冷却/填充速率）均为演出占位——结算唯一真值在 battle-core / 云函数；
//   T15 完成后本文件整体替换为真 session（快照结构已按 types.ts 冻结契约逐字段对表）。
// 裁决落实：O1 行动预算=二选一（移动或出招后即结束回合）；O3 无部署 UI（随机出生由本 mock 给定）。
import type { ActionRequest, BattleSnapshot, BattleSnapshotPhase, HexPos, SnapshotActor } from '../../types';
import { CHOREO, PIECE } from '../../config/battle-hex';
import type { SkillButtonInfo } from '../../ui/battle-hex-render';

/** mock 快照：契约字段 + 渲染扩展段（heroSkills 置灰数据源 / speedFactor 演出倍率） */
export interface MockBattleSnapshot extends BattleSnapshot {
  heroSkills: SkillButtonInfo[];
  speedFactor: number;
}

type AnimName = SnapshotActor['animState'];

interface MockActor extends SnapshotActor {
  fillPerSec: number; // 行动条填充速率（演出占位）
  cooldowns: Record<string, number>; // 技能冷却（回合数）
  timeline: { state: AnimName; t: number; next: AnimName | null; sec: number } | null;
  moving: boolean; // renderPos 追 pos 中
}

/** 演示技能表（占位数值；真值=SkillDef×battle-core） */
const SKILL_DEFS: ReadonlyArray<{ id: string; label: string; cost: number; cd: number; mul: number; range: number }> = [
  { id: 'te', label: '特', cost: 20, cd: 2, mul: 1.6, range: 3 },
  { id: 'jue', label: '绝', cost: 35, cd: 5, mul: 2.4, range: 2 },
  { id: 'qing', label: '轻', cost: 15, cd: 3, mul: 0, range: 0 },
  { id: 'du', label: '毒', cost: 10, cd: 1, mul: 1.2, range: 4 },
];

// ===== 局部 hex 数学（与 systems/hex 同式；mock 演出用，不 import battle 侧文件） =====
const HEX_DIRS: ReadonlyArray<HexPos> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];
function cubeDistance(a: HexPos, b: HexPos): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
const sameCell = (a: HexPos, b: HexPos): boolean => a.q === b.q && a.r === b.r;
/** offset(8×8 可移动区) → axial（odd-r：q = col - ⌊row/2⌋） */
function offAxial(col: number, row: number): HexPos {
  return { q: col - Math.floor(row / 2), r: row };
}

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export interface MockSession {
  snapshot(): MockBattleSnapshot;
  tick(dtSec: number): void;
  dispatch(req: ActionRequest): boolean;
  mode(): 'auto' | 'manual';
  reset(): void;
}

export function createMockSession(seed = 42): MockSession {
  const rng = lcg(seed);
  let actors: MockActor[] = [];
  let phase: BattleSnapshotPhase = 'fighting';
  let turnActorId: string | null = null;
  let pendingInput = false;
  let selectedSkill: string | null = null;
  let mode: 'auto' | 'manual' = 'manual';
  let speedFactor = 1;
  let moveCells: HexPos[] = [];
  let attackCells: HexPos[] = [];
  let aiDelay = -1; // ≥0 = 当前行动者（AI）演出延迟倒计时

  function spawn(): void {
    const randCell = (c0: number, c1: number, r0: number, r1: number): HexPos =>
      offAxial(c0 + Math.floor(rng() * (c1 - c0 + 1)), r0 + Math.floor(rng() * (r1 - r0 + 1)));
    // O3：我方左下区 / 敌方右上区随机出生（seed 可复现），无部署 UI；出生间距保证首回合内有攻击目标
    const heroPos = randCell(5, 7, 8, 10);
    const e1 = randCell(7, 9, 5, 7);
    let e2 = randCell(7, 9, 5, 7);
    if (sameCell(e1, e2)) e2 = offAxial(9, 6);
    actors = [
      {
        id: 'hero', side: 'player', name: '小虾米', pos: heroPos, renderPos: { ...heroPos },
        hp: 100, maxHp: 100, neili: 80, maxNeili: 100, actionBar: 30, facing: 'right',
        facingHex: 'right', // 六向帧接线 §2.1 契约字段同步（mock 演出占位：与 facing 同向，hero=directional 消费）
        animState: 'idle', statusIcons: ['poison', 'bleed', 'internal'], isBoss: false, spriteKey: 'hero', isJump: false,
        fillPerSec: 12, cooldowns: {}, timeline: null, moving: false,
      },
      {
        id: 'e1', side: 'enemy', name: '山贼甲', pos: e1, renderPos: { ...e1 },
        hp: 60, maxHp: 60, neili: 40, maxNeili: 40, actionBar: 10, facing: 'left',
        facingHex: 'left', // legacy profile 不消费（翻转走 facing）；字段随契约冻结补齐
        animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'npc-shanzei', isJump: false,
        fillPerSec: 9, cooldowns: {}, timeline: null, moving: false,
      },
      {
        id: 'e2', side: 'enemy', name: '山贼乙', pos: e2, renderPos: { ...e2 },
        hp: 90, maxHp: 90, neili: 40, maxNeili: 40, actionBar: 5, facing: 'left',
        facingHex: 'left',
        animState: 'idle', statusIcons: [], isBoss: true, spriteKey: 'npc-shanzei', isJump: false,
        fillPerSec: 8, cooldowns: {}, timeline: null, moving: false,
      },
    ];
    phase = 'fighting';
    turnActorId = null;
    pendingInput = false;
    selectedSkill = null;
    moveCells = [];
    attackCells = [];
    aiDelay = -1;
  }
  spawn();

  const alive = (side?: 'player' | 'enemy'): MockActor[] =>
    actors.filter((a) => a.animState !== 'dead' && (!side || a.side === side));
  const byId = (id: string | null): MockActor | undefined => actors.find((a) => a.id === id);
  const occupied = (): Set<string> => new Set(alive().map((a) => `${a.pos.q},${a.pos.r}`));

  /** BFS 可达（演出占位：移动力 2、阻挡=不可穿单位；与 T15 hex.reachable 同式） */
  function reachable(from: HexPos, power: number): HexPos[] {
    const occ = occupied();
    const seen = new Set<string>([`${from.q},${from.r}`]);
    let frontier: Array<HexPos> = [from];
    const out: HexPos[] = [];
    for (let step = 0; step < power; step++) {
      const next: HexPos[] = [];
      for (const c of frontier) {
        for (const d of HEX_DIRS) {
          const nq = c.q + d.q;
          const nr = c.r + d.r;
          const key = `${nq},${nr}`;
          if (seen.has(key) || occ.has(key)) continue;
          const off = { q: nq, r: nr };
          const ncol = nq + Math.floor(nr / 2);
          if (ncol < 4 || ncol > 11 || nr < 2 || nr > 13) continue; // T15 R3 FIELD：col 4..11 / row 2..13
          seen.add(key);
          out.push({ q: nq, r: nr });
          next.push({ q: nq, r: nr });
        }
      }
      frontier = next;
    }
    return out;
  }

  function setAnim(a: MockActor, state: AnimName, next: AnimName | null = 'idle', sec = 0): void {
    a.timeline = sec > 0 || next !== 'idle' ? { state, t: 0, next, sec } : null;
    a.animState = state;
  }

  function heroSkills(): SkillButtonInfo[] {
    const hero = actors[0];
    return SKILL_DEFS.map((d) => ({
      id: d.id,
      label: d.label,
      disabled: hero.neili < d.cost || (hero.cooldowns[d.id] ?? 0) > 0,
    }));
  }

  function snapshot(): MockBattleSnapshot {
    return {
      phase,
      turnActorId,
      pendingInput,
      moveCells,
      moveKind: 'walk',
      attackCells,
      selectedSkill,
      actors,
      cameraTargetId: 'hero',
      heroSkills: heroSkills(),
      speedFactor,
    };
  }

  function endTurn(): void {
    const a = byId(turnActorId);
    if (a) {
      a.actionBar = 0;
      for (const d of SKILL_DEFS) {
        if ((a.cooldowns[d.id] ?? 0) > 0) a.cooldowns[d.id] -= 1;
      }
    }
    turnActorId = null;
    pendingInput = false;
    selectedSkill = null;
    moveCells = [];
    attackCells = [];
    aiDelay = -1;
  }

  function beginTurn(a: MockActor): void {
    turnActorId = a.id;
    if (a.side === 'player' && mode === 'manual') {
      pendingInput = true;
      moveCells = reachable(a.pos, 2);
    } else {
      aiDelay = 0.45; // AI 演出延迟
    }
  }

  function damage(target: MockActor, amount: number): void {
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp <= 0) {
      target.animState = 'dead';
      target.timeline = null;
      target.moving = false;
    } else {
      setAnim(target, 'hit', 'idle', CHOREO.hitSec);
    }
  }

  function checkPhase(): void {
    if (!alive('enemy').length) phase = 'won';
    else if (!alive('player').length) phase = 'lost';
  }

  function performAttack(actor: MockActor, target: MockActor, skillId: string | null): boolean {
    const dist = cubeDistance(actor.pos, target.pos);
    let mul = 1;
    if (skillId) {
      const def = SKILL_DEFS.find((d) => d.id === skillId);
      if (!def || skillId === 'qing') return false;
      if (dist > def.range || actor.neili < def.cost || (actor.cooldowns[skillId] ?? 0) > 0) return false;
      actor.neili -= def.cost;
      actor.cooldowns[skillId] = def.cd;
      mul = def.mul;
      setAnim(actor, 'charge', 'strike', CHOREO.chargeSec);
    } else {
      if (dist > 1) return false;
      setAnim(actor, 'basic', 'idle', CHOREO.basicSec);
    }
    const amount = Math.round((6 + rng() * 10) * mul);
    // 演出时序：skill=charge→strike→idle；basic 直接播 basic 段；打击点在时序中段结算（简化：立即结算）
    damage(target, amount);
    checkPhase();
    if (phase === 'fighting') endTurn();
    return true;
  }

  function aiAct(actor: MockActor): void {
    const foes = alive(actor.side === 'enemy' ? 'player' : 'enemy');
    if (!foes.length) return;
    const target = foes.reduce((m, f) => (cubeDistance(actor.pos, f.pos) < cubeDistance(actor.pos, m.pos) ? f : m));
    // 优先出招（毒/特中冷却可用且在程）；否则普攻；否则位移逼近
    for (const d of SKILL_DEFS) {
      if (d.mul > 0 && (actor.cooldowns[d.id] ?? 0) === 0 && actor.neili >= d.cost && cubeDistance(actor.pos, target.pos) <= d.range) {
        if (performAttack(actor, target, d.id)) return;
      }
    }
    if (cubeDistance(actor.pos, target.pos) <= 1) {
      performAttack(actor, target, null);
      return;
    }
    const step = reachable(actor.pos, 1).sort(
      (a, b) => cubeDistance(a, target.pos) - cubeDistance(b, target.pos),
    )[0];
    if (step && doMove(actor, step)) return;
    endTurn(); // 无路可走：放弃回合
  }

  function doMove(actor: MockActor, to: HexPos): boolean {
    actor.pos = { ...to };
    actor.moving = true;
    if (actor.id === turnActorId) endTurn(); // O1 二选一：移动后即让回合（位移表现自行收尾）
    return true;
  }

  function tick(dtRaw: number): void {
    if (phase !== 'fighting') return;
    const dt = dtRaw * speedFactor;
    for (const a of actors) {
      // 演出时序推进
      if (a.timeline) {
        a.timeline.t += dt;
        if (a.timeline.t >= a.timeline.sec) {
          const next = a.timeline.next ?? 'idle';
          if (next === 'idle') {
            a.timeline = null;
            a.animState = a.moving ? 'walk' : 'idle';
          } else {
            const sec = next === 'strike' ? CHOREO.strikeSec : CHOREO.hitSec;
            setAnim(a, next, 'idle', sec);
          }
        }
      }
      // 位移表现：renderPos lerp 追 pos（session 口径，方案 §2.3 L3）
      if (a.moving) {
        const dx = a.pos.q - a.renderPos.q;
        const dy = a.pos.r - a.renderPos.r;
        const dist = Math.hypot(dx, dy);
        if (!a.timeline && a.animState !== 'walk') a.animState = 'walk';
        const stepLen = (dt / PIECE.moveLerpSec) * Math.max(dist, 1);
        if (dist <= stepLen || dist < 0.02) {
          a.renderPos = { ...a.pos };
          a.moving = false;
          if (!a.timeline) a.animState = 'idle';
        } else {
          a.renderPos = { q: a.renderPos.q + (dx / dist) * stepLen, r: a.renderPos.r + (dy / dist) * stepLen };
        }
      }
      // 行动条
      if (a.animState !== 'dead' && !turnActorId) {
        a.actionBar += a.fillPerSec * dt;
        if (a.actionBar >= 100) {
          a.actionBar = 100;
          beginTurn(a);
        }
      }
    }
    // AI 延迟演出
    if (turnActorId && aiDelay >= 0) {
      aiDelay -= dt;
      if (aiDelay < 0) {
        const actor = byId(turnActorId);
        if (actor && actor.animState !== 'dead') aiAct(actor);
        else endTurn();
      }
    }
  }

  function dispatch(req: ActionRequest): boolean {
    if (phase !== 'fighting') return false;
    switch (req.type) {
      case 'move': {
        if (!pendingInput || turnActorId !== 'hero') return false;
        if (!moveCells.some((c) => sameCell(c, req.to))) return false;
        const hero = actors[0];
        return doMove(hero, req.to);
      }
      case 'attack': {
        if (!pendingInput || turnActorId !== 'hero') return false;
        const hero = actors[0];
        const target = byId(req.targetId);
        if (!target || target.animState === 'dead' || target.side !== 'enemy') return false;
        return performAttack(hero, target, req.skillId);
      }
      case 'selectSkill': {
        if (!pendingInput || turnActorId !== 'hero') return false;
        const def = SKILL_DEFS.find((d) => d.id === req.skillId);
        const hero = actors[0];
        if (!def || hero.neili < def.cost || (hero.cooldowns[def.id] ?? 0) > 0) return false;
        selectedSkill = def.id;
        attackCells =
          def.mul > 0
            ? alive('enemy')
                .filter((e) => cubeDistance(hero.pos, e.pos) <= def.range)
                .map((e) => ({ ...e.pos }))
            : [];
        return true;
      }
      case 'cancelSkill':
        selectedSkill = null;
        attackCells = [];
        return true;
      case 'setMode':
        mode = req.mode;
        if (mode === 'auto' && pendingInput) {
          // 切托管：当前主角回合交由 AI 代行
          pendingInput = false;
          aiDelay = 0.3;
        }
        return true;
      case 'toggleSpeed':
        speedFactor = speedFactor === 1 ? 2 : 1;
        return true;
      case 'flee':
        phase = 'fled';
        return true;
      default:
        return false;
    }
  }

  function reset(): void {
    spawn();
  }

  return { snapshot, tick, dispatch, mode: () => mode, reset };
}
