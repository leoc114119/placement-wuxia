// T15 对局编排层（T-B1 需求表 #3~#6）：行动条 tick / 轮转 / 行动预算 / AI 托管 / 快照与事件流
//
// 架构定位（主架构方案 §1.2 数据流单向）：
//   battle-core（结算真值）← 本层只读调用；本层 → 快照/事件 → 渲染层（渲染禁 import core）。
//   本层是 hex 战棋的独立循环，不走 runBattleHeadless（那是方格挂机引擎，归 systems/battle.ts）。
//
// 职责与裁决落实：
//   - 行动条 tick：fillRate（core 导入）× dt 推进，满 BAR.max 进入行动回合；轮转排序
//     = bar 高 → fillRate 快 → 玩家先（镜像 core 主循环口径）。
//   - 行动预算 = 二选一（O1 定版 2026-09-02）：单回合移动或出招其一；
//     「移动到位相邻自动普攻」特例保留（T06 §4.2 语义：不另耗行动，blocked 静默）。
//   - 移动结算：hex.ts BFS 可达（F-06 移动力，阻挡=不可穿单位；跳跃=⌊范围/2⌋可穿越）。
//     位置更新是演出层职责（T06 先例），不进 core。
//   - 出招结算：session 用 hex cube 距离预筛目标/校验射程（R-05 数字半径与度量无关），
//     数值真值唯一走 core resolveAction（Q1 批复的 pos 对齐适配见 doAttack 注释）。
//   - AI 五级优先表（C 案 B2）+ 敌方同构；托管双阈值复用 core stepManualTimeout。
//   - 出生布点 = 初始范围随机（O3 定版）：我方=可动区投影深处偏左（视觉左下）、
//     敌方=投影浅处偏右（视觉右上），min(我方投影 y) > max(敌方 y) 整带分离（L 环④修正：
//     offset 矩形子区在平顶投影下斜切到视觉中部，改按投影分带选格）；seed 可控可复现，
//     rng 由 seed 派生、出生先消费（确定性口径见 createHexBattle 注释）。
//
// 确定性契约（DoD 硬项）：同 seed + 同操作序列（含 tick 步长序列）→ 事件流全等。
// 事件 t 为逻辑时钟（秒，含倍速）；动画/lerp 只影响快照表现字段、不产生事件。

import type {
  ActionRequest,
  BattleMode,
  BattleSnapshot,
  BattleSnapshotPhase,
  BattleUiEvent,
  CombatantInput,
  HexPos,
  SkillButtonInfo,
  SkillDef,
  SnapshotActor,
} from '../types';
import {
  TOTAL_TIME_LIMIT_S,
  basicRange,
  fillRate,
  makeEnemy,
  makeRng,
  resolveAction,
  rollEnemyCount,
  skillRange,
  stepManualTimeout,
  type ActionActor,
  type ManualTimeoutState,
  type Rng,
} from './battle-core';
import { BAR, SPEED_FACTOR } from '../config/battle';
import {
  axialToOffset,
  cubeDistance,
  hexEq,
  inCone,
  jumpReachable,
  movePower,
  offsetToAxial,
  rangeCells,
  rangeShapeOf,
  reachable,
} from './hex';

// ---------- 布局常量（几何参数，Q7 批复：session 本地导出，config/battle-hex.ts 归 FE 卡） ----------

/** 棋盘 16×16（96 号 MVP 档），可移动区 8×8 居中（列/行 4..11） */
export const MAP_SIZE = 16;
export const FIELD_MIN = 4;
export const FIELD_MAX = 11;

/** 表现时长 ms（展示参数，ADR-004 口径：不含结算公式；驱动快照动画态） */
export const ANIM_MS = { walk: 300, charge: 100, strike: 300, basic: 300, hit: 300 } as const;

// ---------- 运行时单位 ----------

/** session 内部单位：core 结算面（CombatantInput + cooldowns，即 ActionActor）+ hex 状态。
 * pos（core 兼容字段）恒存 offset(列,行) 并与 hex 同步；仅 doAttack 调用期间临时覆写
 * （Q1 批复适配，见 doAttack 注释）。 */
interface Runner extends ActionActor {
  bar: number;
  hex: HexPos; // 逻辑格真值（axial）
  hexFacing: HexPos; // 六向朝向单位向量（Q4 批复：锥形轴；移动/攻击方向更新，出生朝最近敌）
  faceLeft: boolean; // 立绘左右朝向（水平分量定，dx≈0 防抖保持，T06 已验口径）
  renderQ: number; // 渲染格 lerp（快照只读输出）
  renderR: number;
  moveFromQ: number;
  moveFromR: number;
  moveT: number; // 0~1，<1 = 移动 lerp 中
  isJump: boolean; // 跳跃移动标记（渲染抛物线 vs 贴地；MVP 快照不外发，字段预留给 FE 卡）
  dead: boolean;
  animState: SnapshotActor['animState'];
  animLeftMs: number; // >0 = 当前动画态剩余；charge 到期自动转 strike
  barWasMax: boolean; // 本条满回合是否已发 bar-max（等待输入期间不重复发）
}

export interface HexBattleOptions {
  player: CombatantInput; // MVP 我方 1 人（R-03 助战后置）
  enemies: CombatantInput[]; // 调用方按 R-07 组装（assembleRoster 便捷封装见下）
  mode: BattleMode;
  seed?: number;
}

// ---------- 便捷组装（§3.1「开局组装阵容」消费面：rollEnemyCount + makeEnemy 薄转发） ----------

/** 按实战档位组装敌方阵容（数量规则 = core rollEnemyCount 唯一真值，本函数零数值逻辑） */
export function assembleRoster(
  shizhan: number,
  template: Parameters<typeof makeEnemy>[1],
  rng: Rng,
): CombatantInput[] {
  return Array.from({ length: rollEnemyCount(shizhan, rng) }, (_, i) => makeEnemy(i, template));
}

// ---------- 工厂 ----------

export function createHexBattle(opts: HexBattleOptions) {
  // 确定性口径：单 rng 流由 seed 派生；消费顺序固定 = 我方出生 → 敌方出生（洗牌）→ 战斗掷骰。
  // 同 seed + 同操作序列 → 事件流全等（DoD 硬项，tests/battle-session.test.ts 断言）。
  const rng: Rng = makeRng(opts.seed ?? 20260902);
  const events: BattleUiEvent[] = [];
  let t = 0; // 逻辑时钟（秒，含倍速）
  let mode: BattleMode = opts.mode;
  let speedFast = false; // toggleSpeed 切换（SPEED_FACTOR.normal/fast）
  let phase: BattleSnapshotPhase = 'fighting';
  let selectedSkill: string | null = null; // 主角已激活待施放技能（selectSkill 态，不耗预算）
  let lastActedId: string | null = null;
  const manual: ManualTimeoutState = { stage: 0, idleSec: 0 };

  // ---- 布局与出生（O3：无部署 UI，初始范围随机） ----

  /** 区内全部格（offset 口径生成、入图换算 axial） */
  const zoneCells = (cols: [number, number], rows: [number, number]): HexPos[] => {
    const cells: HexPos[] = [];
    for (let row = rows[0]; row <= rows[1]; row++) {
      for (let col = cols[0]; col <= cols[1]; col++) cells.push(offsetToAxial(col, row));
    }
    return cells;
  };

  /** 投影纵坐标（方案 §2.2：py = HEX_S·√3·(r + q/2)，y 越大屏幕越靠下）。
   * L 环④修正：offset 矩形区在平顶投影下是斜切平行四边形——原「行号下半」子区投影
   * 落在视觉左侧中部（我方 y 带 [8,12] 与敌方 [7,11] 交叠）。出生带改为按投影分带，
   * 保证 min(我方 y) > max(敌方 y)：我方整带严格在屏幕下方、敌方在上方。 */
  const projY = (p: HexPos): number => p.r + p.q / 2;

  /** 视觉左下角出生带：可动区内 y ≥ 10（投影深处）且 q ≤ 2（偏左）→ 8 格（≥ 玩家数 1）。 */
  const playerBand = (): HexPos[] =>
    zoneCells([FIELD_MIN, FIELD_MAX], [FIELD_MIN, FIELD_MAX]).filter((p) => projY(p) >= 10 && p.q <= 2);

  /** 视觉右上角出生带：y ≤ 8.5（投影浅处）且 q ≥ 5（偏右）→ 7 格（≥ 敌方上限 6，R-07）。 */
  const enemyBand = (): HexPos[] =>
    zoneCells([FIELD_MIN, FIELD_MAX], [FIELD_MIN, FIELD_MAX]).filter((p) => projY(p) <= 8.5 && p.q >= 5);

  /** Fisher-Yates 洗牌（rng 注入）取前 n 格——同区一次洗牌按序分配，天然不重叠 */
  const shuffleTake = (cells: HexPos[], n: number): HexPos[] => {
    const a = cells.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  };

  const mk = (c: CombatantInput, spawn: HexPos): Runner => {
    const off = axialToOffset(spawn);
    return {
      ...c,
      pos: { x: off.col, y: off.row }, // 覆盖调用方布点（O3）
      bar: 0,
      cooldowns: new Map(c.skills.map((s) => [s.id, 0])),
      hex: spawn,
      hexFacing: { q: 1, r: 0 }, // 先朝东；spawnAll 后统一转向最近敌
      faceLeft: c.side === 'enemy', // 我方默认朝右、敌方默认朝左（对峙构图）
      renderQ: spawn.q,
      renderR: spawn.r,
      moveFromQ: spawn.q,
      moveFromR: spawn.r,
      moveT: 1,
      isJump: false,
      dead: false,
      animState: 'idle',
      animLeftMs: 0,
      barWasMax: false,
    };
  };

  const playerSpawn = shuffleTake(playerBand(), 1)[0];
  const player = mk(opts.player, playerSpawn);
  const enemySpawns = shuffleTake(enemyBand(), opts.enemies.length);
  const enemies = opts.enemies.map((e, i) => mk(e, enemySpawns[i]));
  const all: Runner[] = [player, ...enemies];

  // ---- 基础查询 ----
  const alive = () => all.filter((c) => !c.dead);
  const foesOf = (c: Runner) => alive().filter((x) => x.side !== c.side);
  const byId = (id: string) => all.find((c) => c.id === id);
  const occupied = () => alive().map((c) => c.hex);
  const hpSum = (side: 'player' | 'enemy') =>
    all.filter((c) => c.side === side).reduce((s, c) => s + Math.max(0, c.hp), 0);
  /** 场界（Q6 批复）：可移动区 8×8 居中，移动/射程格均不出场 */
  const inField = (p: HexPos): boolean => {
    const off = axialToOffset(p);
    return off.col >= FIELD_MIN && off.col <= FIELD_MAX && off.row >= FIELD_MIN && off.row <= FIELD_MAX;
  };

  const emit = (e: Omit<BattleUiEvent, 't'>) => events.push({ t: +t.toFixed(2), ...e });

  /** 朝向更新：六向 facing = from→to 的 cube 最近方向（Q4 批复，锥形轴）；
   * 立绘左右向按 offset 水平分量（dx≈0 保持防抖）。 */
  function faceToward(c: Runner, to: HexPos): void {
    const v = { q: to.q - c.hex.q, r: to.r - c.hex.r };
    if (v.q === 0 && v.r === 0) return;
    const dirs: HexPos[] = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ];
    let best = dirs[0];
    let bestDot = -Infinity;
    for (const d of dirs) {
      const dot = v.q * d.q + v.r * d.r; // 六方向两两夹角 ≥60°，二维点积足以分辨
      if (dot > bestDot) {
        bestDot = dot;
        best = d;
      }
    }
    c.hexFacing = best;
    const dx = axialToOffset(to).col - axialToOffset(c.hex).col;
    if (dx > 0) c.faceLeft = false;
    else if (dx < 0) c.faceLeft = true;
  }

  function setAnim(c: Runner, state: SnapshotActor['animState']): void {
    c.animState = state;
    c.animLeftMs = ANIM_MS[state as keyof typeof ANIM_MS] ?? 0;
  }

  /** R-08 冷却递减：每行动回合恰一次，且必须发生在本回合全部「读冷却」判定之后
   * （镜像 core act() 顺序：选招读 → 递减 → resolveAction 写新值；若先递减，
   * 本回合新设的冷却会被立即吞 1，cd=N 的可用节奏整体偏移一回合）。 */
  function tickCooldowns(actor: Runner): void {
    for (const s of actor.skills) {
      const cd = actor.cooldowns.get(s.id) ?? 0;
      if (cd > 0) actor.cooldowns.set(s.id, cd - 1);
    }
  }

  // ---- 出招（唯一数值真值 = core resolveAction） ----

  /** 单次出手结算。
   * 【Q1 批复适配 · hex 度量换轨】射程已由 session 按 cube 距离预筛（submit/aiAct 校验）；
   * core 普攻分支的 offset 曼哈顿复核在 odd-r 下会把 hex 相邻格误判 blocked
   * （例：(0,0)↔(1,-1) hex 相邻但 offset 曼哈顿=2 > 拳射程 1）。pos 不参与任何
   * 命中/伤害计算（F-01/F-04 均不读 pos）且不被 resolveAction 修改，故调用前临时把
   * 双方 pos 对齐令曼哈顿复核恒通过，调用后立即恢复。引擎零改动，度量换轨闭环在适配层。
   * 行为锚点用例：battle-session.test.ts「hex 相邻格普攻不被 core 误判 blocked」。 */
  function doAttack(actor: Runner, target: Runner, skill: SkillDef | null, quiet = false): void {
    const savedA = actor.pos;
    const savedT = target.pos;
    actor.pos = { x: 0, y: 0 };
    target.pos = { x: 0, y: 0 };
    let outcome;
    try {
      outcome = resolveAction(actor, target, skill, rng);
    } finally {
      actor.pos = savedA;
      target.pos = savedT;
    }

    if (outcome.kind !== 'blocked') {
      setAnim(actor, skill ? 'charge' : 'basic');
      faceToward(actor, target.hex);
    }
    // 日志 → 事件（映射同旧 T06 attackWith；quiet=移动附带普攻，blocked 不入事件流）
    for (const l of outcome.logs) {
      if (quiet && l.action === 'blocked') continue;
      emit({
        type:
          l.action === 'skill'
            ? 'skill'
            : l.action === 'basic'
              ? 'basic'
              : l.action === 'miss'
                ? 'miss'
                : l.action === 'fallback'
                  ? 'fallback'
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
      target.animState = 'dead';
      target.animLeftMs = 0;
      emit({ type: 'death', actorId: target.id });
    }
    checkEnd();
  }

  // ---- 移动（演出层职责：位置更新不进 core，T06 先例） ----

  /** 移动结算：更新 hex/pos（offset 同步）、六向朝向、立绘左右向、lerp 表现；emit move。
   * 事件 toX/toY 复用 T06 字段 = offset(列,行)；hex 世界坐标由渲染层按 96 号公式换算。 */
  function doMove(actor: Runner, to: HexPos, isJump: boolean): void {
    faceToward(actor, to);
    actor.hex = to;
    const off = axialToOffset(to);
    actor.pos = { x: off.col, y: off.row };
    actor.moveFromQ = actor.renderQ;
    actor.moveFromR = actor.renderR;
    actor.moveT = 0;
    actor.isJump = isJump;
    setAnim(actor, 'walk');
    emit({ type: 'move', actorId: actor.id, toX: off.col, toY: off.row });
  }

  /** 移动后自动普攻特例（O1 定版保留项 / T06 §4.2 语义）：到位后最近敌在普攻射程内
   * → 自动普攻，不另耗行动；射程外静默（quiet，blocked 不入事件流）。
   * 「相邻」按普攻射程口径（basicRange）而非严格六邻接——与旧 T06 语义一致。 */
  function basicIfAdjacent(actor: Runner): void {
    const nearest = pickTarget(actor);
    if (!nearest) return;
    if (cubeDistance(actor.hex, nearest.hex) <= basicRange(actor)) {
      doAttack(actor, nearest, null, true);
    }
  }

  // ---- AI（C 案 B2 五级优先表；玩家自动/托管与敌方同构） ----

  /** 集火（第 1 级）：最近敌人，同距离选血少的（A4 同源，度量 = cube 距离） */
  function pickTarget(actor: Runner): Runner | null {
    const foes = foesOf(actor);
    if (foes.length === 0) return null;
    return foes
      .slice()
      .sort((a, b) => cubeDistance(actor.hex, a.hex) - cubeDistance(actor.hex, b.hex) || a.hp - b.hp)[0];
  }

  /** 锥形武器的普攻/技能目标校验（圆形/直线仅 cube 距离；锥形另须在六向 facing 120° 扇区） */
  function targetInRange(actor: Runner, target: Runner, n: number, shape: 'circle' | 'ray' | 'cone'): boolean {
    if (cubeDistance(actor.hex, target.hex) > n) return false;
    if (shape === 'cone') return inCone(actor.hex, actor.hexFacing, target.hex, n);
    return true;
  }

  /** 选招（第 2 级）：R-05 武器匹配 + R-08 冷却 0 + R-09 内力足够 + 射程内有敌；
   * 按伤害倍率（grade）降序、同倍率按数组序（B2「按伤害倍率从高到低放」；
   * 数组序 = core act() 优先级语义）。 */
  function planSkill(actor: Runner): { skill: SkillDef; target: Runner } | null {
    const usable = actor.skills
      .filter(
        (s) =>
          (s.weapon === null || s.weapon === actor.weapon) &&
          (actor.cooldowns.get(s.id) ?? 0) <= 0 &&
          actor.neili >= s.neiliCost,
      )
      .sort((a, b) => b.grade - a.grade);
    for (const s of usable) {
      const n = skillRange(s);
      const shape = rangeShapeOf(s.weapon ?? actor.weapon ?? 'fist');
      const target = foesOf(actor)
        .filter((f) => targetInRange(actor, f, n, shape))
        .sort((a, b) => cubeDistance(actor.hex, a.hex) - cubeDistance(actor.hex, b.hex) || a.hp - b.hp)[0];
      if (target) return { skill: s, target };
    }
    return null;
  }

  /** 普通移动候选（供位移评优与 isJump 判定共用） */
  function normalReach(actor: Runner): HexPos[] {
    return reachable(actor.hex, movePower(actor.skills), occupied(), inField);
  }

  /** AI 行动（第 1~5 级）：集火→技能→普攻→位移进射程→莽。
   * 位移候选 = 普通可达 ∪ 跳跃可达，双键评优（离目标近优先，其次离原地近）；
   * 移动后落在普攻射程内触发自动普攻特例；无路可走即原地结束（第 5 级「莽」）。 */
  function aiAct(actor: Runner, forcedTrust: boolean): void {
    if (forcedTrust) emit({ type: 'trust', actorId: actor.id });
    const target = pickTarget(actor);
    if (!target) return;

    const plan = planSkill(actor); // 读冷却（第 2 级判定）
    const basicN = basicRange(actor);
    const basicOk = targetInRange(actor, target, basicN, rangeShapeOf(actor.weapon ?? 'fist'));
    tickCooldowns(actor); // R-08：行动回合计 1（读后递减，见 tickCooldowns 注释）

    if (plan) {
      doAttack(actor, plan.target, plan.skill);
      return;
    }
    if (basicOk) {
      doAttack(actor, target, null); // 第 3 级：普攻
      return;
    }
    // 第 4 级：位移进射程（F-06 普通移动，阻挡不可穿；L 环①：AI 同构不并入跳跃格——
    // 跳跃是二阶轻功主动能力，AI 是否主动用跳留待 AI 技能决策卡，默认普通移动）
    const cells = normalReach(actor);
    const unique = cells.filter((p, i) => cells.findIndex((x) => hexEq(x, p)) === i);
    const best = unique
      .slice()
      .sort(
        (a, b) =>
          cubeDistance(a, target.hex) - cubeDistance(b, target.hex) ||
          cubeDistance(a, actor.hex) - cubeDistance(b, actor.hex),
      )[0];
    if (best) {
      const isJump = !normalReach(actor).some((p) => hexEq(p, best));
      doMove(actor, best, isJump);
      basicIfAdjacent(actor); // 移动附带普攻（不另耗行动）
    }
    // 第 5 级：无格可动 → 莽（原地结束回合，MVP 无自保撤退）
  }

  // ---- 轮转与回合消耗 ----

  function consumeTurn(c: Runner): void {
    c.bar -= BAR.max;
    c.barWasMax = false;
    if (c.side === 'player') {
      manual.idleSec = 0; // 玩家行动重置托管计时（镜像 core）
      // 激活态清理（L 环②修复）：攻击型技能施放后回普通态；轻功是「移动姿态」——
      // sticky 保留（Leo 连跳预期：激活一次后连续跳跃，无需每跳重新激活），
      // 取消路径 = 再次 selectSkill 同 id（toggle）/ cancelSkill / 战斗结束。
      const sel = selectedSkill ? player.skills.find((x) => x.id === selectedSkill) : undefined;
      if (sel?.kind !== 'qingGong') selectedSkill = null;
    }
    lastActedId = c.id;
  }

  function checkEnd(): void {
    if (phase !== 'fighting') return;
    if (foesOf(player).length === 0) {
      phase = 'won';
      emit({ type: 'win' });
    } else if (player.dead) {
      phase = 'lost';
      emit({ type: 'lose' });
    }
  }

  /** 90s 总时长判定（F-05 尾规则；常量 = core TOTAL_TIME_LIMIT_S 唯一真值，Q2 放行导出）：
   * 存活 hp 总量高者胜，总量相同判玩家负（防利用，镜像 core runBattleHeadless 尾判）。 */
  function settleTimeout(): void {
    if (phase !== 'fighting') return;
    emit({ type: 'timeout-hp' });
    phase = hpSum('player') > hpSum('enemy') ? 'won' : 'lost';
    emit({ type: phase === 'won' ? 'win' : 'lose' });
  }

  const pendingInputNow = () =>
    phase === 'fighting' && mode === 'manual' && !player.dead && player.bar >= BAR.max;

  /** 每帧推进（realDtSec = 真实秒；逻辑秒 = realDt × 倍速）。
   * 【等待期冻结总时钟 · T06 已验口径】手动等待玩家输入期间 t 不推进——90s 防死循环
   * 兜底不烧玩家思考时间；托管 idleSec 由 core stepManualTimeout 独立累计真实等待时长，
   * trust/switchAuto 在真实对局可达。等待期敌方行动条/动画照常推进（其余棋子不停手）。 */
  function tick(realDtSec: number): void {
    if (phase !== 'fighting') return;
    const speed = speedFast ? SPEED_FACTOR.fast : SPEED_FACTOR.normal;
    const dt = realDtSec * speed;
    if (!pendingInputNow()) t += dt;

    // 行动条推进（F-05）+ 移动 lerp / 动画态推进（表现随倍速）
    for (const c of all) {
      if (!c.dead) c.bar += fillRate(c) * dt;
      if (c.moveT < 1) {
        c.moveT = Math.min(1, c.moveT + (dt * 1000) / ANIM_MS.walk);
        c.renderQ = c.moveFromQ + (c.hex.q - c.moveFromQ) * c.moveT;
        c.renderR = c.moveFromR + (c.hex.r - c.moveFromR) * c.moveT;
      }
      if (c.animLeftMs > 0) {
        c.animLeftMs -= dt * 1000;
        if (c.animLeftMs <= 0 && !c.dead) {
          if (c.animState === 'charge') {
            c.animState = 'strike'; // 出招两帧序列：04 蓄力 → 05 挥出（T06 已验铁律）
            c.animLeftMs = ANIM_MS.strike;
          } else {
            c.animState = 'idle';
            c.animLeftMs = 0;
          }
        }
      }
    }

    // 满条者轮转：bar 高 → fillRate 快 → 玩家先（镜像 core 主循环排序）
    const ready = all
      .filter((c) => !c.dead && c.bar >= BAR.max)
      .sort((a, b) => b.bar - a.bar || fillRate(b) - fillRate(a) || (a.side === 'player' ? -1 : 1));
    for (const c of ready) {
      if (phase !== 'fighting') break;
      if (!c.barWasMax) {
        c.barWasMax = true; // 首次进入满条回合才发 bar-max（手动等待期间不重复发）
        emit({ type: 'bar-max', actorId: c.id });
      }
      if (c.side === 'player' && mode === 'manual') {
        // 手动等待：90s 无操作 → 托管代行本回合；再 90s → 切自动（core 状态机唯一真值）
        const { state, event } = stepManualTimeout(manual, dt);
        Object.assign(manual, state);
        if (event === 'trust') {
          aiAct(c, true);
          consumeTurn(c);
        } else if (event === 'switchAuto') {
          mode = 'auto';
          emit({ type: 'switch-auto', actorId: c.id });
        }
        continue; // 未到托管时间：条保持满值等操作（pendingInput）
      }
      aiAct(c, false);
      if (phase !== 'fighting') break;
      consumeTurn(c);
    }

    if (t >= TOTAL_TIME_LIMIT_S) settleTimeout();
  }

  // ---- 玩家输入（§3.3 ActionRequest；校验合法才执行，非法静默拒绝返回 false） ----

  /** 二选一预算下的合法移动格（L 环①修复）：仅普通可达——C 案 A3「普通移动不可穿过任何
   * 单位」；跳跃格是二阶轻功的主动能力，只在轻功激活态（moveKind='jump'）出现，
   * 未激活态并入跳跃格会导致普通移动穿越单位占格（穿模根因）。 */
  function moveCandidates(): HexPos[] {
    return normalReach(player);
  }

  function submit(req: ActionRequest): boolean {
    if (req.type === 'toggleSpeed') {
      speedFast = !speedFast;
      return true;
    }
    if (req.type === 'setMode') {
      mode = req.mode;
      return true;
    }
    if (req.type === 'flee') {
      if (phase !== 'fighting') return false;
      phase = 'fled';
      emit({ type: 'flee' }); // R-10：逃跑零结算（收益回写归玩法层，不在本层职责）
      return true;
    }
    if (phase !== 'fighting') return false;
    if (req.type === 'selectSkill') {
      if (player.dead || !player.skills.some((x) => x.id === req.skillId)) return false;
      // 同 id 再点 = toggle 取消（轻功 sticky 态的取消路径，L 环②）；异 id = 切换激活
      if (selectedSkill === req.skillId) {
        selectedSkill = null;
        return true;
      }
      selectedSkill = req.skillId; // 激活待施放：进入范围显示态，不消耗 O1 预算
      return true;
    }
    if (req.type === 'cancelSkill') {
      selectedSkill = null;
      return true;
    }
    // move / attack：仅玩家轮到自己（条满 + 手动模式）时受理 —— 二选一预算（O1 定版）
    if (!pendingInputNow()) return false;
    if (req.type === 'move') {
      // 校验范围与快照显示一致（F1）：轻功激活态只受理跳跃格（金格），未激活态=普通∪跳跃
      const selected = selectedSkill ? player.skills.find((x) => x.id === selectedSkill) : undefined;
      const jumpOnly = selected?.kind === 'qingGong';
      const power = movePower(player.skills);
      const cands = jumpOnly
        ? jumpReachable(player.hex, power, occupied(), inField)
        : moveCandidates();
      if (!cands.some((p) => hexEq(p, req.to))) return false;
      // isJump 真值：轻功激活态的点格必为跳跃格；普通态候选已不含跳跃格（L 环①）
      const isJump = jumpOnly;
      doMove(player, req.to, isJump);
      basicIfAdjacent(player); // O1 特例：到位相邻自动普攻，不另耗行动
      tickCooldowns(player); // 行动计 1 回合（R-08）
      consumeTurn(player);
      return true;
    }
    if (req.type === 'attack') {
      const target = byId(req.targetId);
      if (!target || target.dead || target.side === player.side) return false;
      if (req.skillId === null) {
        // 普攻：hex cube 距离 ≤ basicRange（core 导出真值，Q2 放行）；锥形武器另受扇区约束
        const n = basicRange(player);
        if (!targetInRange(player, target, n, rangeShapeOf(player.weapon ?? 'fist'))) return false;
        tickCooldowns(player);
        doAttack(player, target, null);
        consumeTurn(player);
        return true;
      }
      // 技能施放（L 环③修复）：冷却中/内力不足/武器不匹配 → 降级普攻兜底（镜像 core
      // act() 的 R-08/R-09 fallback 语义）——手动「点了就出手」，行动条必重置，
      // 修复冷却窗口期点「特」被静默拒绝导致条满卡住（Leo 真机「偶发不重置」根因）。
      // 射程外仍拒绝（普攻同样够不着，走位是玩家决策）；未知技能 id 纯非法，拒绝。
      const s = player.skills.find((x) => x.id === req.skillId);
      if (!s) return false;
      const usable =
        (s.weapon === null || s.weapon === player.weapon) &&
        (player.cooldowns.get(s.id) ?? 0) <= 0 &&
        player.neili >= s.neiliCost;
      const n = usable ? skillRange(s) : basicRange(player);
      const shape = usable ? rangeShapeOf(s.weapon ?? player.weapon ?? 'fist') : rangeShapeOf(player.weapon ?? 'fist');
      if (!targetInRange(player, target, n, shape)) return false;
      tickCooldowns(player); // 行动计 1 回合（R-08）：降级普攻同样递减冷却
      doAttack(player, target, usable ? s : null); // 降级时 resolveAction 自动产出 fallback 日志
      consumeTurn(player);
      return true;
    }
    return false;
  }

  // ---- 快照（session → render，每帧重建；渲染只读，AGENTS.md「UI 只展示」） ----

  function snapshot(): BattleSnapshot {
    const pending = pendingInputNow();
    const turnId = pending ? player.id : lastActedId;
    let moveCells: HexPos[] = [];
    let moveKind: 'walk' | 'jump' = 'walk';
    let attackCells: HexPos[] = [];
    if (pending) {
      const selected = selectedSkill ? player.skills.find((x) => x.id === selectedSkill) : undefined;
      if (selected && selected.kind === 'qingGong') {
        // 【验收 F1 · 移动型技能分支】轻功既是技能（selectSkill 激活）又是移动（吃可达格）：
        // 快照给「跳跃可达格」（F-06 跳跃=⌊范围/2⌋ 可穿越，金格高亮 moveKind='jump'），
        // attackCells 置空——否则 input 侧 qing && inMove 读到空 moveCells，点格无响应。
        moveKind = 'jump';
        moveCells = jumpReachable(player.hex, movePower(player.skills), occupied(), inField);
      } else if (selected) {
        // 攻击型技能：O2 三形态攻击范围（锥形按六向 facing 轴，Q4 批复）
        const shape = rangeShapeOf(selected.weapon ?? player.weapon ?? 'fist');
        attackCells = rangeCells(player.hex, shape, skillRange(selected), player.hexFacing, inField);
      } else {
        moveCells = moveCandidates();
      }
    }
    const actors: SnapshotActor[] = all.map((c) => ({
      id: c.id,
      side: c.side,
      name: c.name,
      pos: { ...c.hex },
      renderPos: { q: c.renderQ, r: c.renderR },
      hp: Math.max(0, c.hp),
      maxHp: c.maxHp,
      neili: Math.max(0, c.neili),
      maxNeili: c.maxNeili,
      actionBar: Math.min(BAR.max, c.bar),
      facing: c.faceLeft ? 'left' : 'right',
      animState: c.animState,
      statusIcons: [], // MVP 无状态图标数据源；字段按 §3.2 冻结先占位
      isBoss: false, // MVP 1v多无 Boss 字段来源；Boss 战随玩法层卡扩展 HexBattleOptions
      spriteKey: c.side === 'player' ? 'hero' : c.name, // 敌方约定 spriteKey=configId（F3）；资源走资源管理器+配置表
      isJump: c.isJump && c.moveT < 1, // 跳跃真值（F1）：仅移动 lerp 窗口内为 true，渲染禁启发式猜
      configId: c.side === 'player' ? undefined : c.name, // 敌型身份=模板名（F3；玩家走 hero 帧表）
    }));
    // 【验收 F2】弧形技能钮置灰数据源 = 会话真值：内力不足 || 冷却中 || 武器不匹配。
    // ui 侧 BattleSnapshotExt.heroSkills 过渡段由此降级删除（render 消费同形结构零改）。
    const heroSkills: SkillButtonInfo[] = player.dead
      ? []
      : player.skills.map((s) => ({
          id: s.id,
          label: s.name,
          disabled:
            player.neili < s.neiliCost ||
            (player.cooldowns.get(s.id) ?? 0) > 0 ||
            (s.weapon !== null && s.weapon !== player.weapon),
        }));
    return {
      phase,
      turnActorId: turnId,
      pendingInput: pending,
      moveCells,
      moveKind,
      attackCells,
      selectedSkill,
      heroSkills,
      actors,
      cameraTargetId: turnId ?? player.id,
    };
  }

  // 出生朝向：全员转向最近敌（锥形轴开局即有意义；无敌方可转时不转）
  for (const c of alive()) {
    const foe = pickTarget(c);
    if (foe) faceToward(c, foe.hex);
  }

  return {
    tick,
    submit,
    snapshot,
    get events(): BattleUiEvent[] {
      return events;
    },
    get phase(): BattleSnapshotPhase {
      return phase;
    },
    /** 测试/调试视图（非渲染契约）：内部状态只读暴露 */
    _debug: {
      units: all,
      mode: () => mode,
      clock: () => t,
      player: () => player,
    },
  };
}

export type HexBattleSession = ReturnType<typeof createHexBattle>;
