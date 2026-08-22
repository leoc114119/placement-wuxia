// T06 战斗界面演出状态机（75 v2.1 + A1-T06 v2 裁决）
// 架构（A1 Q1 方案 A）：移动/走位在演出层算（F-06），射程判定+命中+伤害在引擎侧 resolveAction 算；
// 行动条用引擎 fillRate；行动经济=老网金二选一（移动或出招，A1 Q8）——移动到位敌人相邻自动普攻不另耗行动。
// 确定性：rng 注入（同 seed + 同操作序列 → 事件流全等）。渲染无关，node 可测。
import {
  BAR,
  FX,
  BOARD_COLS,
  BOARD_ROWS,
  BATTLE_FRAME,
  MOVE,
  SPEED_FACTOR,
  TILE_HALF_H,
  TILE_HALF_W,
} from '../config/battle';
import type { NpcConfig } from '../config/npcs';
import {
  fillRate,
  makeEnemy,
  makeInitialPlayer,
  makeRng,
  rollEnemyCount,
  stepManualTimeout,
  skillRange,
  resolveAction,
  type ActionActor,
  type ActionOutcome,
  type Rng,
} from './battle-core';
import type {
  BattleActor,
  BattleMode,
  BattlePhase,
  BattleUiEvent,
  BattleUiResult,
  Facing,
  SkillDef,
} from '../types';
import type { ManualTimeoutState as EngineManualState } from './battle-core';

// ---------- 纯函数（node 可测） ----------

/** 等距投影（75 §1b.1 方向 A）：格 → 世界坐标（相对棋盘原点，px） */
export function gridToWorld(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * TILE_HALF_W, y: (x + y) * TILE_HALF_H };
}

/** 投影反变换（世界 → 格，四舍五入；镜头偏移由调用方先扣除） */
export function worldToGrid(wx: number, wy: number): { x: number; y: number } {
  const a = wx / TILE_HALF_W; // x - y
  const b = wy / TILE_HALF_H; // x + y
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}

/** 棋盘内判定 */
export function inBoard(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_COLS && y >= 0 && y < BOARD_ROWS;
}

/** 曼哈顿距离（与引擎判定同构） */
export function manhattanDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/** F-06 移动力（公式总览：基础 2 + 装配轻功加成（一阶+1/二阶+2）+ ⌊轻功等级/5⌋；MVP 玩家无轻功 → 2） */
export function moveRange(skills: SkillDef[]): number {
  let bonus = 0;
  let qinggongLevel = 0;
  for (const s of skills) {
    if (s.kind === 'qingGong') {
      qinggongLevel = Math.max(qinggongLevel, s.level);
      bonus = Math.max(bonus, s.grade === 1.0 ? 1 : s.grade === 1.3 ? 2 : bonus);
    }
  }
  return MOVE.baseRange + bonus + Math.floor(qinggongLevel / 5);
}

/** 可达格集合：以 from 为中心、曼哈顿 ≤ range、棋盘内、不与任何存活单位重叠（越界自然 clamp） */
export function reachableCells(
  fromX: number,
  fromY: number,
  range: number,
  occupied: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > range || (dx === 0 && dy === 0)) continue;
      const x = fromX + dx;
      const y = fromY + dy;
      if (!inBoard(x, y)) continue;
      if (occupied.some((o) => o.x === x && o.y === y)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** 技能范围格（演出层范围指示）：以 center 为中心、曼哈顿 ≤ skillRange(skill)、棋盘内（越界 clamp）。
 * 引擎结算口径 = 曼哈顿半径（T05 范围模型），演出范围球与之同构，零分叉。 */
export function skillRangeCells(
  centerX: number,
  centerY: number,
  skill: SkillDef,
): Array<{ x: number; y: number }> {
  return reachableCells(centerX, centerY, skillRange(skill), []);
}

/** 朝向（§8b.1）：移动水平分量定左右，dx≈0 保持当前（防抖） */
export function facingByDx(cur: Facing, dx: number): Facing {
  if (dx < -1e-6) return 'left';
  if (dx > 1e-6) return 'right';
  return cur;
}

/** 面向目标（L 环二轮 Leo 定「面向对手」）：按等距投影水平分量 wx=(x-y) 判左右——
 * 自身 wx 大于目标 → 目标在屏左 → 面左；小于 → 面右；相等保持（防抖，§8b.1 口径） */
export function facingTowardsGrid(
  cur: Facing,
  selfX: number,
  selfY: number,
  targetX: number,
  targetY: number,
): Facing {
  const d = (selfX - selfY) - (targetX - targetY);
  if (d > 1e-6) return 'left';
  if (d < -1e-6) return 'right';
  return cur;
}

/** 战斗内 walk 帧号（01~03 循环，硬规则） */
export function battleWalkFrame(elapsedMs: number): number {
  const span = BATTLE_FRAME.walkEnd - BATTLE_FRAME.walkStart + 1;
  return BATTLE_FRAME.walkStart + (Math.floor(elapsedMs / BATTLE_FRAME.walkFrameMs) % span);
}

/** 敌方阵容组装（R-07 档位 + 池内等权抽取；A1 Q15 沿用引擎默认布阵 y=1） */
function buildEnemies(pool: NpcConfig[], playerShizhan: number, rng: Rng): BattleActor[] {
  const count = rollEnemyCount(playerShizhan, rng);
  const out: BattleActor[] = [];
  for (let i = 0; i < count; i++) {
    const pick = pool[Math.floor(rng() * pool.length)];
    const base = makeEnemy(i, {
      name: pick.name,
      hp: pick.battleNums.hp,
      atk: pick.battleNums.atk,
      def: pick.battleNums.def,
      jimin: pick.battleNums.jimin,
      danshi: pick.battleNums.danshi,
      shizhan: pick.battleNums.shizhan,
    });
    out.push(toActor(base, { configId: pick.id, bodyKind: pick.bodyKind, isBoss: pick.type === 'boss' }));
  }
  return out;
}

function toActor(
  base: ReturnType<typeof makeInitialPlayer> | ReturnType<typeof makeEnemy>,
  extra?: { configId?: string; bodyKind?: 'hero' | 'humanoid' | 'wolf'; isBoss?: boolean },
): BattleActor {
  return {
    ...base,
    cooldowns: new Map(base.skills.map((s) => [s.id, 0])),
    bar: 0,
    facing: 'left',
    configId: extra?.configId,
    bodyKind: extra?.bodyKind ?? 'hero',
    isBoss: extra?.isBoss ?? false,
    renderX: base.pos.x,
    renderY: base.pos.y,
    moveT: 1,
    moveFromX: base.pos.x,
    moveFromY: base.pos.y,
    isJump: false,
    animState: 'idle',
    animMs: 0,
    dead: false,
    lungeT: 1,
    lungeDirX: 0,
    lungeDirY: 0,
  };
}

// ---------- 演出会话 ----------

export interface BattleSession {
  actors: BattleActor[];
  player: BattleActor;
  mode: BattleMode;
  speed: 1 | 2;
  phase: BattlePhase;
  timeSec: number; // 逻辑时钟（秒，含加速倍率；90s 防死循环上限口径）
  events: BattleUiEvent[];
  /** 手动模式下行动条满、等待玩家操作的棋子（无则 null） */
  pendingManual: BattleActor | null;
  /** 手动模式当前选择态：null=绿格移动 / 'qinggong'=金色跳跃格 */
  manualChoice: null | 'qinggong';
  update(dtMs: number): void;
  /** 手动输入：点格（绿格/金格按 manualChoice 分派）；返回是否消费 */
  tapCell(x: number, y: number): boolean;
  /** 手动输入：点 [轻]（切换跳跃选择，扣内力在跳时）；返回是否消费 */
  tapQinggong(): boolean;
  /** 手动输入：点 [特]/[绝]（kind 对应武功类别）；返回是否消费 */
  tapSkill(kind: 'te' | 'jue'): boolean;
  setMode(mode: BattleMode): void;
  toggleSpeed(): void;
  flee(): void; // 逃跑（零结算）
  result(): BattleUiResult;
  /** 可移动格（绿）/跳跃格（金）——手动模式渲染与命中共用 */
  manualCells(): Array<{ x: number; y: number }>;
  /** 特/轻/绝可用性（置灰判定；A1 Q9 轻功内力 10 冷却 0） */
  skillBtnStates(): { te: boolean; qing: boolean; jue: boolean; teSkill?: SkillDef; jueSkill?: SkillDef };
  /** 取走待播 fx 队列（渲染层消费后清空） */
  drainFx(): Array<{ kind: 'skill' | 'basic'; targetId: string; skillId?: string; grade: number; radius: number }>;
}

const TOTAL_TIME_LIMIT_S = 90; // F-05 防死循环（与引擎同值；演出层实时钟口径）

export function createBattleSession(pool: NpcConfig[], seed: number, mode: BattleMode = 'auto'): BattleSession {
  const rng = makeRng(seed);
  const player = toActor(makeInitialPlayer());
  const actors: BattleActor[] = [player, ...buildEnemies(pool, player.shizhan, rng)];
  const events: BattleUiEvent[] = [];
  const manual: EngineManualState = { stage: 0, idleSec: 0 };
  /** 全员面向各自最近敌（L 环二轮：出场即面向对手） */
  const faceFoes = (): void => {
    for (const a of actors) {
      if (a.dead) continue;
      const foes = actors.filter((f) => f.side !== a.side && !f.dead);
      if (foes.length === 0) continue;
      foes.sort(
        (b, c) =>
          manhattanDist(a.pos.x, a.pos.y, b.pos.x, b.pos.y) - manhattanDist(a.pos.x, a.pos.y, c.pos.x, c.pos.y),
      );
      a.facing = facingTowardsGrid(a.facing, a.pos.x, a.pos.y, foes[0].pos.x, foes[0].pos.y);
    }
  };
  faceFoes();
  let phase: BattlePhase = 'fighting';
  let timeSec = 0;
  let curMode = mode;
  let speed: 1 | 2 = 1;
  let pendingManual: BattleActor | null = null;
  let manualChoice: null | 'qinggong' = null;
  /** 待播 fx 队列（渲染层 drain；跨层单向传递，状态机不 import 渲染） */
  const pendingFx: Array<{ kind: 'skill' | 'basic'; targetId: string; skillId?: string; grade: number; radius: number }> = [];

  const alive = (side: 'player' | 'enemy') => actors.filter((a) => a.side === side && !a.dead);
  const occupiedPos = () => actors.filter((a) => !a.dead).map((a) => a.pos);
  const hpSum = (side: 'player' | 'enemy') =>
    actors.filter((a) => a.side === side).reduce((s, a) => s + Math.max(0, a.hp), 0);
  const emit = (e: Omit<BattleUiEvent, 't'>) => events.push({ t: +timeSec.toFixed(2), ...e });

  /** 出手：引擎同源结算 + 事件 + 动画置位；quiet=试探性普攻（blocked 不记事件，避免自动走位决策污染事件流） */
  function attackWith(actor: BattleActor, target: BattleActor, skill: SkillDef | null, quiet = false): ActionOutcome {
    const outcome = resolveAction(actor as ActionActor, target, skill, rng);
    // 演出动画（F2c §8b.3/§8c 原文落实）：技能 = 04 蓄力 → 0.1s 后转 05 挥出（两帧序列，不钉一帧）；
    // 普攻 = 06 单帧 + 前冲半格 lerp（朝目标）+ 回位 + 武器光弧（fx 模板）；blocked 无动作
    if (outcome.kind !== 'blocked') {
      actor.animState = skill ? 'charge' : 'basic';
      actor.animMs = 0;
      if (!skill) {
        actor.lungeT = 0;
        const dx = target.renderX - actor.renderX;
        const dy = target.renderY - actor.renderY;
        const len = Math.hypot(dx, dy) || 1;
        actor.lungeDirX = dx / len;
        actor.lungeDirY = dy / len;
      }
      pendingFx.push({
        kind: skill ? 'skill' : 'basic',
        targetId: target.id,
        skillId: skill?.id,
        grade: skill ? skill.grade : 1.0,
        radius: skill ? skillRange(skill) : 1, // fx 范围球（格；技能=射程，普攻=1）
      });
    }
    for (const l of outcome.logs) {
      if (quiet && l.action === 'blocked') continue;
      emit({
        type: l.action === 'skill' ? 'skill'
          : l.action === 'basic' ? 'basic'
          : l.action === 'miss' ? 'miss'
          : l.action === 'fallback' ? 'fallback'
          : 'blocked',
        actorId: l.actorId,
        targetId: l.targetId,
        skillId: l.skillId,
        damage: l.damage,
        crit: l.crit,
      });
    }
    if (target.hp <= 0 && !target.dead) {
      target.dead = true;
      emit({ type: 'death', actorId: target.id });
    }
    return outcome;
  }

  /** 选招（镜像引擎 act() 优先级段：数组序 + 武器匹配 + 冷却 0 + 内力够 + 射程内有敌） */
  function planSkill(actor: BattleActor): { skill: SkillDef; target: BattleActor } | null {
    const foes = alive(actor.side === 'player' ? 'enemy' : 'player');
    for (const s of actor.skills) {
      if (s.weapon !== null && s.weapon !== actor.weapon) continue;
      if ((actor.cooldowns.get(s.id) ?? 0) > 0) continue;
      if (actor.neili < s.neiliCost) continue;
      const inRange = foes.filter((f) => manhattanDist(actor.pos.x, actor.pos.y, f.pos.x, f.pos.y) <= skillRange(s));
      if (inRange.length === 0) continue;
      inRange.sort(
        (a, b) => manhattanDist(actor.pos.x, actor.pos.y, a.pos.x, a.pos.y) - manhattanDist(actor.pos.x, actor.pos.y, b.pos.x, b.pos.y),
      );
      return { skill: s, target: inRange[0] };
    }
    return null;
  }

  /** 移动到指定格（演出层 F-06 位移；不参与数值） */
  function moveTo(actor: BattleActor, x: number, y: number, jump: boolean): void {
    actor.facing = facingByDx(actor.facing, x - actor.pos.x);
    actor.moveFromX = actor.renderX;
    actor.moveFromY = actor.renderY;
    actor.pos = { x, y };
    actor.moveT = 0;
    actor.isJump = jump;
    actor.animState = 'walk';
    actor.animMs = 0;
    emit({ type: 'move', actorId: actor.id, toX: x, toY: y });
  }

  /** 移动后自动普攻特例（§4.2：到位敌人相邻 → 自动普攻，不另耗行动；blocked 无事） */
  function basicIfAdjacent(actor: BattleActor): void {
    const foes = alive(actor.side === 'player' ? 'enemy' : 'player');
    const nearest = foes
      .slice()
      .sort(
        (a, b) => manhattanDist(actor.pos.x, actor.pos.y, a.pos.x, a.pos.y) - manhattanDist(actor.pos.x, actor.pos.y, b.pos.x, b.pos.y),
      )[0];
    if (nearest) attackWith(actor, nearest, null, true); // 相邻即普攻；射程外静默（§4.2 特例语义）
  }

  /** AI 行动（自动模式 + 手动托管代行；老网金二选一：移动或出招） */
  function autoAct(actor: BattleActor, forcedTrust: boolean): void {
    if (forcedTrust) emit({ type: 'trust', actorId: actor.id });
    const plan = planSkill(actor);
    if (plan) {
      attackWith(actor, plan.target, plan.skill);
      return;
    }
    // 无武功可用 → 普攻尝试；blocked（射程外）则本次行动改为移动（F-06 位移，朝最近敌）
    const foes = alive(actor.side === 'player' ? 'enemy' : 'player');
    const nearest = foes
      .slice()
      .sort(
        (a, b) => manhattanDist(actor.pos.x, actor.pos.y, a.pos.x, a.pos.y) - manhattanDist(actor.pos.x, actor.pos.y, b.pos.x, b.pos.y),
      )[0];
    if (!nearest) return;
    const outcome = attackWith(actor, nearest, null, true); // 试探：blocked 静默（决策依据，非战斗事件）
    if (outcome.kind === 'blocked') {
      const range = moveRange(actor.skills);
      const cells = reachableCells(actor.pos.x, actor.pos.y, range, occupiedPos());
      const best = cells
        .slice()
        .sort(
          (a, b) =>
            manhattanDist(a.x, a.y, nearest.pos.x, nearest.pos.y) - manhattanDist(b.x, b.y, nearest.pos.x, nearest.pos.y) ||
            manhattanDist(a.x, a.y, actor.pos.x, actor.pos.y) - manhattanDist(b.x, b.y, actor.pos.x, actor.pos.y),
        )[0];
      if (best) {
        moveTo(actor, best.x, best.y, false);
        basicIfAdjacent(actor); // 移动附带普攻（不另耗行动）
      }
    }
  }

  /** 手动行动完成（二选一执行后行动条归零） */
  function consumeManualAction(): void {
    if (pendingManual) pendingManual.bar -= BAR.max;
    pendingManual = null;
    manualChoice = null;
    manual.idleSec = 0;
  }

  function checkEnd(): boolean {
    if (phase !== 'fighting') return true;
    if (alive('enemy').length === 0) {
      phase = 'won';
      emit({ type: 'win' });
      return true;
    }
    if (player.dead) {
      phase = 'lost';
      emit({ type: 'lose' });
      return true;
    }
    return false;
  }

  return {
    actors,
    player,
    get mode() {
      return curMode;
    },
    set mode(m) {
      curMode = m;
    },
    get speed() {
      return speed;
    },
    get phase() {
      return phase;
    },
    get timeSec() {
      return timeSec;
    },
    events,
    get pendingManual() {
      return pendingManual;
    },
    get manualChoice() {
      return manualChoice;
    },
    update(dtMs) {
      const dt = (dtMs / 1000) * speed;
      // pendingManual 等待期冻结防死循环总时钟（90s 兜底不烧玩家思考时间；
      // 托管 idleSec 由引擎 stepManualTimeout 独立累计——trust/switchAuto 在真实对局可达。
      // 其余棋子照常行动：行动条/演出动画用 dt 继续推进）
      if (!pendingManual) timeSec += dt;

      // 演出动画推进（移动 lerp / 跳跃 / 帧动画 / 出招两帧序列 / 普攻前冲；渲染层读同一状态）
      for (const a of actors) {
        if (a.animState === 'charge' && a.animMs >= FX.chargeSec * 1000) {
          a.animState = 'strike'; // 04 → 05（§8b.3 出招组播报）
          a.animMs = 0;
        } else if (a.animState === 'strike' && a.animMs >= FX.strikeSec * 1000) {
          a.animState = 'idle'; // 挥出收势
          a.animMs = 0;
        } else if (a.animState === 'basic' && a.animMs >= FX.basicTotalSec * 1000) {
          a.animState = 'idle';
          a.animMs = 0;
        }
        if (a.lungeT < 1) {
          a.lungeT = Math.min(1, a.lungeT + dt / FX.basicTotalSec); // 前冲+回位双程
        }
        if (a.moveT >= 1 && !a.dead) {
          // 待机棋子持续面向最近敌（L 环二轮 Leo 定「面向对手」；移动中保持移动方向 §8b.1）
          const foes = actors.filter((f) => f.side !== a.side && !f.dead);
          if (foes.length > 0) {
            foes.sort(
              (b, c) =>
                manhattanDist(a.pos.x, a.pos.y, b.pos.x, b.pos.y) -
                manhattanDist(a.pos.x, a.pos.y, c.pos.x, c.pos.y),
            );
            a.facing = facingTowardsGrid(a.facing, a.pos.x, a.pos.y, foes[0].pos.x, foes[0].pos.y);
          }
        }
        if (a.moveT < 1) {
          a.moveT = Math.min(1, a.moveT + dt / MOVE.lerpSec);
          const k = a.moveT;
          a.renderX = a.moveFromX + (a.pos.x - a.moveFromX) * k;
          a.renderY = a.moveFromY + (a.pos.y - a.moveFromY) * k;
          if (a.moveT >= 1) {
            a.renderX = a.pos.x;
            a.renderY = a.pos.y;
            a.animState = 'idle';
          }
        }
        a.animMs += dtMs * speed;
      }

      if (phase !== 'fighting') return;

      // 行动条（引擎 fillRate 公式）
      for (const c of actors) if (!c.dead) c.bar += fillRate(c) * dt;

      // 行动顺序（引擎同规则：bar 高 → fillRate 快 → 玩家先）
      const ready = actors
        .filter((c) => !c.dead && c.bar >= BAR.max)
        .sort((a, b) => b.bar - a.bar || fillRate(b) - fillRate(a) || (a.side === 'player' ? -1 : 1));

      for (const c of ready) {
        if (phase !== 'fighting' || c.dead) break;
        if (c.side === 'player' && curMode === 'manual') {
          if (!pendingManual) {
            pendingManual = c;
            manual.idleSec = 0;
            manualChoice = null;
            emit({ type: 'bar-max', actorId: c.id });
          }
          // 托管双阈值（引擎状态机同源）
          const { state: ms, event } = stepManualTimeout(manual, dt);
          Object.assign(manual, ms);
          if (event === 'trust') {
            autoAct(c, true);
            c.bar -= BAR.max;
            pendingManual = null;
            manual.idleSec = 0;
          } else if (event === 'switchAuto') {
            curMode = 'auto';
            emit({ type: 'switch-auto' });
          }
          break; // 等待玩家输入（行动条保持满值）
        }
        autoAct(c, false);
        c.bar -= BAR.max;
        checkEnd();
      }
      if (checkEnd()) return;

      // 90s 防死循环：存活 hp 总量高者胜，同判负（F-05）
      if (timeSec >= TOTAL_TIME_LIMIT_S) {
        phase = 'timeout';
        const pHp = hpSum('player');
        const eHp = hpSum('enemy');
        emit({ type: 'timeout-hp' });
        if (pHp <= eHp) emit({ type: 'lose' });
        else emit({ type: 'win' });
        phase = pHp > eHp ? 'won' : 'lost';
      }
    },
    tapCell(x, y) {
      if (!pendingManual) return false;
      const cells = this.manualCells();
      if (!cells.some((c) => c.x === x && c.y === y)) return false;
      const jump = manualChoice === 'qinggong';
      if (jump) {
        pendingManual.neili -= MOVE.qinggongMpCost; // A1 Q9
      }
      const actor = pendingManual;
      moveTo(actor, x, y, jump);
      basicIfAdjacent(actor); // §4.2 特例：到位相邻自动普攻（不另耗行动）
      consumeManualAction();
      checkEnd();
      return true;
    },
    tapQinggong() {
      if (!pendingManual) return false;
      if (pendingManual.neili < MOVE.qinggongMpCost) return false; // 置灰同判定
      manualChoice = manualChoice === 'qinggong' ? null : 'qinggong';
      return true;
    },
    tapSkill(kind) {
      const actor = pendingManual;
      if (!actor) return false;
      const st = this.skillBtnStates();
      const skill = kind === 'te' ? st.teSkill : st.jueSkill;
      if (!skill) return false;
      if (kind === 'te' && !st.te) return false;
      if (kind === 'jue' && !st.jue) return false;
      const foes = alive('enemy');
      const target = foes
        .slice()
        .sort(
          (a, b) =>
            manhattanDist(actor.pos.x, actor.pos.y, a.pos.x, a.pos.y) -
            manhattanDist(actor.pos.x, actor.pos.y, b.pos.x, b.pos.y),
        )[0];
      if (!target) return false;
      attackWith(actor, target, skill);
      consumeManualAction();
      checkEnd();
      return true;
    },
    setMode(m) {
      curMode = m;
      if (m === 'auto' && pendingManual) {
        // 切自动：当前满条立即由 AI 代行
        autoAct(pendingManual, false);
        pendingManual.bar -= BAR.max;
        pendingManual = null;
      }
    },
    toggleSpeed() {
      speed = speed === SPEED_FACTOR.normal ? SPEED_FACTOR.fast : SPEED_FACTOR.normal;
    },
    flee() {
      if (phase === 'fighting') {
        phase = 'fled';
        emit({ type: 'flee' });
      }
    },
    result() {
      return {
        phase: phase === 'fighting' ? 'won' : phase, // fighting 不应出现在结果（防御）
        durationSec: +timeSec.toFixed(2),
        finalHp: { player: hpSum('player'), enemy: hpSum('enemy') },
        events,
      };
    },
    manualCells() {
      if (!pendingManual) return [];
      const range = moveRange(pendingManual.skills) * (manualChoice === 'qinggong' ? MOVE.qinggongRangeFactor : 1);
      return reachableCells(pendingManual.pos.x, pendingManual.pos.y, range, occupiedPos());
    },
    drainFx() {
      const out = pendingFx.slice();
      pendingFx.length = 0;
      return out;
    },
    skillBtnStates() {
      const teSkill = pendingManual?.skills.find((s) => s.kind === 'waiGong') ?? undefined;
      const jueSkill = pendingManual?.skills.find((s) => s.kind === 'ultimate') ?? undefined;
      const can = (s?: SkillDef): boolean =>
        !!s && (pendingManual?.cooldowns.get(s.id) ?? 0) <= 0 && (pendingManual?.neili ?? 0) >= s.neiliCost;
      return {
        te: can(teSkill),
        qing: (pendingManual?.neili ?? 0) >= MOVE.qinggongMpCost,
        jue: can(jueSkill),
        teSkill,
        jueSkill,
      };
    },
  };
}
