// T18 战斗 session 结构重构 + 交互语义定版（规格 v1.0 落地，全新重写）
// 行为真源：《战斗交互行为规格》v1.0（§三 移动三态 / §四 状态机 / §五 矩阵 / D1~D4 定版）
// 规则真源：战斗规则C案（F-06/F-05/R-05/R-08/R-09）；数值真值：battle-core（零改动）+ 本文件 MVP 常量
//
// ═══ 交互语义规格表（唯一真源，PM 指令随源码携带） ═══
// | 移动类型               | 可达判定                                    | 路径穿越             | 落点约束 |
// | 普通移动（无选中）     | BFS 连通，移动力=F-06                        | ✗ 不可穿任何单位     | 仅空格 |
// | 轻功跳跃（激活态）     | cube 距离 ≤ ⌊F-06/2⌋，无连通性要求           | ✓ 可穿越任何单位     | 仅空格 |
// | 轻功未激活/未解锁      | 同普通移动（无跳跃格）                       | ✗                   | 仅空格 |
// 可动区口径：12 高 × 8 宽（row 2..13 × col 4..11，L 环追加；规格 BASE-1 勘误待登记）
// ═══════════════════════════════════════════════════════════
//
// 五大病灶收敛对照（规格 §八 → 本文件落点，回执引用）：
//   病灶① bar 四职责拆分 → 填充=tick clamp；消耗=commitTurn 显式 bar=0（BAR-3/D3）；
//         回合判定=tick 轮转 bar≥BAR.max（BAR-2）；选中生命周期=selection 状态机（activate/clear，不读 bar）。
//   病灶② isJump 单点 → doMove(intent) 唯一推导（AI/玩家只传 'walk'|'jump' 意图）。
//   病灶③ moveCells 同源 → legalMoveCells() 唯一产生点，snapshot 显示与 submit 校验共用。
//   病灶④ selectedSkill 收敛 → selection 对象（activate/clear 两写点，kind+legalCells 派生快取）。
//   病灶⑤ pos 派生视图 → Runner 无几何 pos 字段（恒原点单例），hex 唯一真值；无 swap、无手工双写
//         （Q1 批复适配：屏蔽 core 曼哈顿复核；posNeutral 常量，无 swap、无手工双写）。
//
// 确定性契约：单 rng 流（我方出生→敌方出生→战斗掷骰），同 seed + 同操作序列 → 事件流全等
// （含 rejected 拒绝序列，SP-3）。

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
  movePathCells,
  movePower,
  offsetToAxial,
  rangeCells,
  rangeShapeOf,
  reachable,
} from './hex';

// ---------- 布局与经济常量（Q7 批复：session 本地导出，config/battle-hex.ts 归 FE 卡） ----------

/** 棋盘 16×16（96 号）。可移动区 = **12 高 × 8 宽**（row 2..13 十二行 × col 4..11 八列【16 宽内居中】，
 * L 环追加口径：配合压扁瓦片形成纵向对峙纵深；规格 BASE-1 待勘误 12×12 → 12h×8w） */
export const MAP_SIZE = 16;
export const FIELD_COL_MIN = 4;
export const FIELD_COL_MAX = 11;
export const FIELD_ROW_MIN = 2;
export const FIELD_ROW_MAX = 13;

/** 【Q2 批复 · MVP 内力口径】特/绝/轻每季释放消耗内力 1、我方初始内力 100。
 * 正式内力经济后置：替换点=本常量 + makeInitialPlayer 装配（实装配置时回填公式总览）。 */
export const NEILI_COST_PER_CAST = 1;
export const NEILI_INITIAL = 100;

/** 表现时长 ms（展示参数，ADR-004 口径；驱动快照动画态） */
export const ANIM_MS = { walk: 300, charge: 100, strike: 300, basic: 300, hit: 300 } as const;

/** 【病灶⑤】core 兼容 pos 视图单例：恒原点、无几何语义（hex 才是真值、无手工双写）。
 * 所有 Runner 共享此引用；resolveAction 的曼哈顿复核在 hex 度量下恒通过（Q1 批复适配终态）。 */
const POS_NEUTRAL: { x: number; y: number } = { x: 0, y: 0 };

// ---------- 便捷组装（core rollEnemyCount + makeEnemy 薄转发，零数值逻辑） ----------

export function assembleRoster(
  shizhan: number,
  template: Parameters<typeof makeEnemy>[1],
  rng: Rng,
): CombatantInput[] {
  return Array.from({ length: rollEnemyCount(shizhan, rng) }, (_, i) => makeEnemy(i, template));
}

// ---------- 运行时单位（病灶⑤：无 pos 字段，hex 唯一真值） ----------

/** session 内部单位。不实现 core 的 pos 字段——core 兼容见 doAttack 的 POS_NEUTRAL 单例（病灶⑤）。 */
interface Runner {
  id: string;
  side: 'player' | 'enemy';
  name: string;
  hp: number;
  maxHp: number;
  neili: number;
  maxNeili: number;
  atk: number;
  def: number;
  neigongLevel: number;
  jimin: number;
  danshi: number;
  shizhan: number;
  weapon: CombatantInput['weapon'];
  skills: SkillDef[];
  cooldowns: Map<string, number>;
  /** 【病灶⑤收敛】core 兼容视图：恒为 POS_NEUTRAL 单例（无几何语义、hex 才是真值、无手工双写）。
   * resolveAction 的曼哈顿复核因此在 hex 度量下恒通过（Q1 批复适配的最终形态）。 */
  readonly pos: { x: number; y: number };
  bar: number; // 【病灶①】只承担填充（clamp）与轮转判定（BAR-2）；消耗=commitTurn 清零；不参与选中门控
  hex: HexPos; // 逻辑格真值（axial）
  hexFacing: HexPos; // 六向朝向（Q4 批复：锥形轴；移动/攻击更新，出生朝最近敌）
  faceLeft: boolean;
  renderQ: number;
  renderR: number;
  moveFromQ: number;
  moveFromR: number;
  moveT: number;
  /** 【T19/N1 防御 · 方案 §3.3】本次移动的回退轨（walk=movePathCells 合法路径 / jump=[旧格,to]）。
   * 空/单点时 tick 回退现直线公式；moveT=1 后不再被消费。 */
  movePath: HexPos[];
  isJump: boolean; // 【病灶②】唯一写入点=doMove（意图派生）
  dead: boolean;
  animState: SnapshotActor['animState'];
  animLeftMs: number;
  /** 【T19/N1 主修 · 方案 §3.2】ATK-3 同栈延后的攻击演出写入：doAttack 在 quiet && walk 时不
   * setAnim 改记此处，tick 倒计时归零分支消费（优先级 charge→strike→pendingAnim→idle）。 */
  pendingAnim: SnapshotActor['animState'] | null;
  barWasMax: boolean; // bar-max 一次性事件守卫（SEL-1：等待期不重复发）
}

export interface HexBattleOptions {
  player: CombatantInput;
  enemies: CombatantInput[];
  mode: BattleMode;
  seed?: number;
}

// ---------- 工厂 ----------

/** 【体检 A01 · 快照出口防御性复制】数组浅拷贝 + 逐元素 {...p}——HexPos={q,r} 字面量两层即断
 * 引用（报告 A01：单纯浅复制不能隔离元素修改），禁深递归（快照每帧重建，渲染热路径零浪费）。
 * 只在快照出口调用；selection.legalCells 内部仍是唯一真值（病灶③「显示=校验=结算」三同源不
 * 破坏：submit 校验与 cast 结算照读内部数组，仅快照出口断引用，展示端无法反向影响合法性）。 */
function copyCells(cells: HexPos[]): HexPos[] {
  return cells.map((p) => ({ ...p }));
}

export function createHexBattle(opts: HexBattleOptions) {
  // SP-2 确定性：单 rng 流、消费顺序固定（我方出生→敌方出生→战斗掷骰）
  const rng: Rng = makeRng(opts.seed ?? 20260902);
  const events: BattleUiEvent[] = [];
  let t = 0;
  let mode: BattleMode = opts.mode;
  let speedFast = false;
  let phase: BattleSnapshotPhase = 'fighting';
  let lastActedId: string | null = null;
  const manual: ManualTimeoutState = { stage: 0, idleSec: 0 };

  // ---- 病灶④：选中态对象（写点仅 activate/clearSelection；legalCells 派生快取） ----

  type Selection = { skillId: string; kind: 'attack' | 'qing'; legalCells: HexPos[] } | null;
  let selection: Selection = null;

  // ---- 布局与出生（D1 · SP-1 锚点制） ----

  const zoneCells = (cols: [number, number], rows: [number, number]): HexPos[] => {
    const cells: HexPos[] = [];
    for (let row = rows[0]; row <= rows[1]; row++) {
      for (let col = cols[0]; col <= cols[1]; col++) cells.push(offsetToAxial(col, row));
    }
    return cells;
  };

  /** 【D1 · SP-1 · L 环 12h×8w 重算】出生锚：我方=可动区左下极格 offset(4,13)、
   * 敌方=右上极格 offset(11,2)；出生格=锚 hex 距离 ≤3 的可动区格 rng 洗牌
   * （锚距 cube=12 > 3+3，两带天然不相交）。 */
  const ANCHOR_PLAYER = offsetToAxial(4, 13);
  const ANCHOR_ENEMY = offsetToAxial(11, 2);
  const spawnBand = (anchor: HexPos): HexPos[] =>
    zoneCells([FIELD_COL_MIN, FIELD_COL_MAX], [FIELD_ROW_MIN, FIELD_ROW_MAX]).filter((p) => cubeDistance(anchor, p) <= 3);

  // ---- 体检 A03 入口运行时校验（PM 裁定：非法输入 fail-fast 抛 Error，不静默吞不兜底） ----
  // 置于任何 rng 消费/出生结算之前：坏输入零副作用（确定性契约不受校验影响）。
  // 合法 1~6 敌基线（core rollEnemyCount 上限）远小于出生带容量，运算次序零变更。
  {
    const seenIds = new Set<string>();
    for (const c of [opts.player, ...opts.enemies]) {
      if (seenIds.has(c.id)) throw new Error(`createHexBattle: duplicate combatant id "${c.id}"`);
      seenIds.add(c.id);
    }
    const enemyCapacity = spawnBand(ANCHOR_ENEMY).length;
    if (opts.enemies.length > enemyCapacity) {
      throw new Error(
        `createHexBattle: enemy count ${opts.enemies.length} exceeds spawn capacity ${enemyCapacity}`,
      );
    }
  }

  const shuffleTake = (cells: HexPos[], n: number): HexPos[] => {
    const a = cells.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  };

  const mk = (c: CombatantInput, spawn: HexPos): Runner => ({
    id: c.id,
    side: c.side,
    name: c.name,
    hp: c.hp,
    maxHp: c.maxHp,
    // 【Q2 · MVP 内力口径】我方未显式配置内力（maxNeili=0）时应用初始 100；调用方显式配置则尊重
    neili: c.side === 'player' && c.maxNeili === 0 ? NEILI_INITIAL : c.neili,
    maxNeili: c.side === 'player' && c.maxNeili === 0 ? NEILI_INITIAL : c.maxNeili,
    atk: c.atk,
    def: c.def,
    neigongLevel: c.neigongLevel,
    jimin: c.jimin,
    danshi: c.danshi,
    shizhan: c.shizhan,
    weapon: c.weapon,
    skills: c.skills,
    cooldowns: new Map(c.skills.map((s) => [s.id, 0])),
    pos: POS_NEUTRAL,
    bar: 0,
    hex: spawn,
    hexFacing: { q: 1, r: 0 },
    faceLeft: c.side === 'enemy',
    renderQ: spawn.q,
    renderR: spawn.r,
    moveFromQ: spawn.q,
    moveFromR: spawn.r,
    moveT: 1,
    movePath: [],
    isJump: false,
    dead: false,
    animState: 'idle',
    animLeftMs: 0,
    pendingAnim: null,
    barWasMax: false,
  });

  const playerSpawn = shuffleTake(spawnBand(ANCHOR_PLAYER), 1)[0];
  const player = mk(opts.player, playerSpawn);
  const enemySpawns = shuffleTake(spawnBand(ANCHOR_ENEMY), opts.enemies.length);
  const enemies = opts.enemies.map((e, i) => mk(e, enemySpawns[i]));
  const all: Runner[] = [player, ...enemies];

  // ---- 基础查询 ----
  const alive = () => all.filter((c) => !c.dead);
  const foesOf = (c: Runner) => alive().filter((x) => x.side !== c.side);
  const byId = (id: string) => all.find((c) => c.id === id);
  const occupied = () => alive().map((c) => c.hex);
  const hpSum = (side: 'player' | 'enemy') =>
    all.filter((c) => c.side === side).reduce((s, c) => s + Math.max(0, c.hp), 0);
  const inField = (p: HexPos): boolean => {
    const off = axialToOffset(p);
    return off.col >= FIELD_COL_MIN && off.col <= FIELD_COL_MAX && off.row >= FIELD_ROW_MIN && off.row <= FIELD_ROW_MAX;
  };

  const emit = (e: Omit<BattleUiEvent, 't'>) => events.push({ t: +t.toFixed(2), ...e });

  // ---- 病灶③：合法移动格唯一产生点（显示与校验同源） ----

  /** 普通可达（MV-1）：BFS 步数 ≤ F-06 移动力，不可进入/借道单位格，限可动区。 */
  function walkCells(actor: Runner): HexPos[] {
    return reachable(actor.hex, movePower(actor.skills), occupied(), inField);
  }

  /** 跳跃格（MV-2）：cube 距离 ≤ ⌊F-06/2⌋ 的可动区空格，可穿越任何单位（无连通性要求）。 */
  function jumpCells(actor: Runner): HexPos[] {
    return jumpReachable(actor.hex, movePower(actor.skills), occupied(), inField);
  }

  /** 【唯一产生点】合法移动格：snapshot（显示）与 submit（校验）共用。
   * 无选中=普通绿格（MV-1）；轻功选中=金格（MV-2）；攻击技选中=空（高亮走 attackCells）。 */
  function legalMoveCells(): HexPos[] {
    if (!selection) return walkCells(player);
    if (selection.kind === 'qing') return selection.legalCells;
    return [];
  }

  // ---- 选中态动作（病灶④：写点仅此两处） ----

  /** 激活（SEL-2 互斥 toggle / SEL-6 置灰拒激活）。激活不消耗行动预算。 */
  function activate(skillId: string): boolean {
    const s = player.skills.find((x) => x.id === skillId);
    if (!s || player.dead) return false;
    if (selection?.skillId === skillId) {
      selection = null; // SEL-5①：再点同钮=取消
      return true;
    }
    if (s.kind === 'qingGong') {
      // SEL-6/MV-2：一阶轻功（⌊power/2⌋=0）或内力不足 → 置灰拒激活
      if (Math.floor(movePower(player.skills) / 2) < 1 || player.neili < NEILI_COST_PER_CAST) return false;
      selection = { skillId, kind: 'qing', legalCells: jumpCells(player) };
      return true;
    }
    // 攻击技（特/绝）：SEL-6 置灰 = 冷却中/内力不足/武器不匹配 → 拒激活
    if (
      player.neili < NEILI_COST_PER_CAST ||
      (player.cooldowns.get(skillId) ?? 0) > 0 ||
      (s.weapon !== null && s.weapon !== player.weapon)
    ) {
      return false;
    }
    const shape = rangeShapeOf(s.weapon ?? player.weapon ?? 'fist');
    selection = {
      skillId,
      kind: 'attack',
      legalCells: rangeCells(player.hex, shape, skillRange(s), player.hexFacing, inField),
    };
    return true;
  }

  /** 清除（SEL-3 消耗 / SEL-4 回落 / SEL-7 切自动·逃跑·终局 / SEL-5①②取消）。 */
  function clearSelection(): void {
    selection = null;
  }

  /** 朝向更新：六向 facing = from→to 的 cube 最近方向（Q4 批复，锥形轴）。
   * 【FACE-1 §二.4-A】吸附度量 = axial 平面 2D 点积 → **cube 3D 点积**（同 hex.ts dirIndexOf
   * 度量、整数精确；session 自持 ~6 行不引其导出——hex 零改动红线）。axial 基非正交，2D 点积
   * 不度量对齐度：(0,±1) 两族竖向邻格被误吸到斜向（§一.6-A 实证），cube 度量修复；
   * 方向边界平局（如 (2,-1) 族两向等分点）以 dirs 序首胜（与 dirIndexOf 同判，§二.4 定版）。
   * 【FACE-1 §二.4-B】立绘左右向 = 像素水平分量符号 sign(2Δq+Δr)：场内 r≥0 时像素 x/W =
   * q + r/2 恒等，故 Δx 符号 = sign(2Δq+Δr)（奇偶行 (0,±1) 方向 Δcol=0 的「保持旧值」
   * 缺陷由此消除）；=0（等分水平向量）保持旧值，防抖口径同 T06（faceToward 每行动一次，
   * 非逐帧调用，无抖动面）。 */
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
    const vx = v.q;
    const vz = v.r;
    const vy = -vx - vz; // axial→cube：x=q, z=r, y=-x-z
    let best = dirs[0];
    let bestDot = -Infinity;
    for (const d of dirs) {
      const dx = d.q;
      const dz = d.r;
      const dy = -dx - dz;
      const dot = vx * dx + vy * dy + vz * dz; // cube 3D 点积（整数精确，零浮点）
      if (dot > bestDot) {
        bestDot = dot;
        best = d;
      }
    }
    c.hexFacing = best;
    const sx = 2 * v.q + v.r; // 像素水平分量符号（∝ Δq + Δr/2）
    if (sx > 0) c.faceLeft = false;
    else if (sx < 0) c.faceLeft = true;
  }

  function setAnim(c: Runner, state: SnapshotActor['animState']): void {
    c.animState = state;
    c.animLeftMs = ANIM_MS[state as keyof typeof ANIM_MS] ?? 0;
  }

  /** R-08 冷却递减：每行动回合恰一次，且须在全部「读冷却」判定之后（镜像 core act() 读→减→写序）。 */
  function tickCooldowns(actor: Runner): void {
    for (const s of actor.skills) {
      const cd = actor.cooldowns.get(s.id) ?? 0;
      if (cd > 0) actor.cooldowns.set(s.id, cd - 1);
    }
  }

  // ---- 出招（唯一数值真值 = core resolveAction；病灶⑤：pos=POS_NEUTRAL 单例派生） ----

  /** core 兼容视图（病灶⑤收敛点）：resolveAction 读 pos 做（已废弃度量的）曼哈顿复核——
   * hex 度量换轨后射程已由 session 按 cube 距离预筛（Q1 批复适配），此处以 posNeutral 屏蔽之；
   * Proxy 仅拦截 get(pos)，其余读写全部转发真身（neili/cooldowns/hp 副作用契约原样生效）。
   * 无 swap、无手工双写、core 零改动。 */
  /** 单次出手结算。skill 非 null 时按 Q2 口径以「视图技能」传入（neiliCost 视图=1，SkillDef 真值不动）。
   * 【ATK-2 v2.2 · T22】payCost（session 内部参数，非契约）：AOE 逐目标结算中首目标 true（视图=1，
   * 走 resolveAction 真值扣费）、后续 false（视图=0，core:245 扣 0）——资源每次施放恰扣一次；
   * 冷却 core:246 写初值幂等，重复调用无行为差异（方案 §二.1 改动一）。 */
  function doAttack(actor: Runner, target: Runner, skill: SkillDef | null, quiet = false, payCost = true): void {
    const skillView = skill ? { ...skill, neiliCost: payCost ? NEILI_COST_PER_CAST : 0 } : null;
    const outcome = resolveAction(actor, target, skillView, rng);
    if (outcome.kind !== 'blocked') {
      // 【T19/N1 主修 · 方案 §3.2】ATK-3 路径（quiet 且仍在移动演出中）不覆写 walk——攻击演出
      // 写入延后到移动演出结束（tick 倒计时归零分支消费 pendingAnim）。
      // 结算与事件 emit 不受影响（仍同步，绿锁「move 事件后跟 basic 事件」保住）；faceToward 不变。
      if (quiet && actor.animState === 'walk') {
        actor.pendingAnim = skill ? 'charge' : 'basic';
      } else {
        setAnim(actor, skill ? 'charge' : 'basic');
      }
      faceToward(actor, target.hex);
    }
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

  /** 【FACE-1 §二.1 · faceTarget 唯一产生点】受击敌中 cube 距离最小者（平局判距=逻辑格 hex，
   * §六-2 PM 裁定，与 ATK-7 命中口径同源）。单次遍历求 min + 保序收集平局（保持 all 数组序，
   * 禁 sort——SP-2 目标序锁）；勿复用 pickTarget（hp 次键且 sort 破序，§四-5）。
   * rng 纪律（规格③ + §六-4 恒掷 1 次）：ties==1 零消费；ties≥2 恰掷 1 次。消费点由调用方
   * 固定在逐目标循环之前（=本次施放首次掷骰之前，§二.2 SP-2 时序论证：消费计数为状态
   * 确定函数，同 seed 双场逐位全同）。 */
  function faceTargetOf(actor: Runner, targets: Runner[]): Runner {
    // 【体检 A02 · FACE-1 备忘合并】入口非空断言（PM 裁定：空放路径不得静默吞——空输入旧路径
    // 会消费 1 次 rng 并在 resolveAoe 尾部取 .hex 崩溃）。正常两调用链均不可达空：cast 臂被
    // submit 的 targets.length>0 守卫滤空（ATK-6 空放走 else 臂镜像结算，不经本函数）；AI 臂
    // planSkill 只返回非空计划。两守卫与本断言互为注释锚点，禁把空 AOE 静默当空放。
    if (targets.length === 0) throw new Error('faceTargetOf: empty targets');
    let dmin = Infinity;
    for (const t of targets) {
      const d = cubeDistance(actor.hex, t.hex);
      if (d < dmin) dmin = d;
    }
    const ties = targets.filter((t) => cubeDistance(actor.hex, t.hex) === dmin);
    if (ties.length === 1) return ties[0]; // rng 零消费
    return ties[Math.floor(rng() * ties.length)]; // 平局恰掷 1 次（规格③随机取一）
  }

  /** 【ATK-2 v2.2 · T22】范围 AOE 逐目标结算（cast 与 aiAct 案 A 的单一产生点）：
   * 首目标承担资源（R-09/R-08 经 resolveAction 真值路径，neiliCost 视图=1）；后续目标
   * payCost=false（视图=0，core:245 扣 0）——资源每次施放恰扣一次。每目标独立掷骰
   * （命中 F-04 → 闪避 → 暴击，1~3 次 rng）+ 各发 skill|miss 事件（既有形状）+ 各自死亡判定。
   * targets 顺序由调用方定死（all 数组序一次快照，禁 sort——SP-2 确定性）。
   * 循环内 doAttack 副作用幂等注记（锁）：setAnim('charge') 同值覆写=单次效果（animLeftMs
   * 重置同值，同步循环等价单次）；faceToward 循环内逐目标为不可观测中间态（submit/aiAct
   * 同步块无快照采样，§一.1 注）——【FACE-1 §二.1】入口先定 faceTarget（rng 在循环前），
   * 循环后 faceToward(actor, faceTarget.hex) 单点定版（朝最近受击敌；v2.2 点击格定版废止）。 */
  function resolveAoe(actor: Runner, skill: SkillDef, targets: Runner[]): void {
    const faceTarget = faceTargetOf(actor, targets); // ★ FACE-1：faceTarget 产生单点，rng 先于逐目标掷骰
    for (let i = 0; i < targets.length; i++) doAttack(actor, targets[i], skill, false, i === 0);
    faceToward(actor, faceTarget.hex); // ★ FACE-1：朝最近敌定版（AI 与玩家同规则，案 A 五点⑤）
  }

  // ---- 移动（病灶②：isJump 唯一产生点） ----

  /** 移动结算：intent 由调用方按选中态给出（'walk'=贴地 / 'jump'=轻功抛物线）；
   * AI 恒 'walk'（AI 主动用跳留待 AI 技能决策卡）。事件 toX/toY=offset(列,行)。 */
  function doMove(actor: Runner, to: HexPos, intent: 'walk' | 'jump'): void {
    const isJump = intent === 'jump'; // 【病灶②收敛】isJump 唯一产生点
    faceToward(actor, to);
    // 【T19/N1 防御 · 方案 §3.3】改 hex 前计算回退轨：walk 沿合法路径（BFS，不可穿占格，
    // 失败防御回退直线）；jump 凌空可穿（MV-2 语义）恒 [旧格,to] 直线，不套绕行。
    const fromCell = { ...actor.hex };
    actor.movePath = isJump ? [fromCell, to] : movePathCells(fromCell, to, occupied(), inField);
    actor.hex = to;
    const off = axialToOffset(to);
    actor.moveFromQ = actor.renderQ;
    actor.moveFromR = actor.renderR;
    actor.moveT = 0;
    actor.isJump = isJump;
    actor.pendingAnim = null; // 新移动演出开始，旧延后攻击演出作废（防跨回合误播）
    setAnim(actor, 'walk');
    emit({ type: 'move', actorId: actor.id, toX: off.col, toY: off.row });
  }

  /** ATK-3 移动附带普攻特例：到位后最近敌在普攻射程内 → 自动普攻（不另耗行动、blocked 静默）。 */
  function basicIfAdjacent(actor: Runner): void {
    const nearest = pickTarget(actor);
    if (!nearest) return;
    if (cubeDistance(actor.hex, nearest.hex) <= basicRange(actor)) {
      doAttack(actor, nearest, null, true);
    }
  }

  // ---- AI（C 案 B2 五级优先表；与玩家同构，位移恒 'walk' 意图） ----

  function pickTarget(actor: Runner): Runner | null {
    const foes = foesOf(actor);
    if (foes.length === 0) return null;
    return foes
      .slice()
      .sort((a, b) => cubeDistance(actor.hex, a.hex) - cubeDistance(actor.hex, b.hex) || a.hp - b.hp)[0];
  }

  function targetInRange(actor: Runner, target: Runner, n: number, shape: 'circle' | 'ray' | 'cone'): boolean {
    if (cubeDistance(actor.hex, target.hex) > n) return false;
    if (shape === 'cone') return inCone(actor.hex, actor.hexFacing, target.hex, n);
    return true;
  }

  /** 【T22 案 A · 五点⑤「敌方同规则」】AI 代行出技计划：按品阶降序取首个有射程内目标的技能，
   * 收集射程内**全体**存活敌（foesOf 保持 all 数组序，禁 sort——resolveAoe 目标序=SP-2 确定性）；
   * 1v1 局 targets 退化单目标（既有 AI 用例零改保持绿）。 */
  function planSkill(actor: Runner): { skill: SkillDef; targets: Runner[] } | null {
    const usable = actor.skills
      .filter(
        (s) =>
          (s.weapon === null || s.weapon === actor.weapon) &&
          (actor.cooldowns.get(s.id) ?? 0) <= 0 &&
          actor.neili >= NEILI_COST_PER_CAST,
      )
      .sort((a, b) => b.grade - a.grade);
    for (const s of usable) {
      const n = skillRange(s);
      const shape = rangeShapeOf(s.weapon ?? actor.weapon ?? 'fist');
      // 【AI-1 v2.4】射程判定与玩家 activate（:324 rangeCells 唯一产生点）完全同源：格集合成员判定
      // （ray=六向直线/cone=扇区），禁 targetInRange 的仅距离松判——消除「AI 打得到玩家打不到」的
      // 格子分野（报告 Q01 反例：Δ(1,1) cube 距2 不在六向 ray 集，松判曾纳之）。SP-2：同 seed 双场
      // 同函数同参 → 射程集合必然全等。circle/cone 与旧判定数学等价，ray 收紧即本卡全部行为变更；
      // targetInRange 本体不动（普攻 :504/:551/:778/:801 四处消费点已验收行为零变更）。
      const cells = rangeCells(actor.hex, shape, n, actor.hexFacing, inField);
      const targets = foesOf(actor).filter((f) => cells.some((p) => hexEq(p, f.hex)));
      if (targets.length > 0) return { skill: s, targets };
    }
    return null;
  }

  function aiAct(actor: Runner, forcedTrust: boolean): void {
    if (forcedTrust) emit({ type: 'trust', actorId: actor.id });
    const target = pickTarget(actor);
    if (!target) return;
    const plan = planSkill(actor);
    const basicOk = targetInRange(actor, target, basicRange(actor), rangeShapeOf(actor.weapon ?? 'fist'));
    tickCooldowns(actor);
    if (plan) {
      resolveAoe(actor, plan.skill, plan.targets); // 【案 A】AI 代行出技同构 AOE（1v1 退化单目标）
      return;
    }
    if (basicOk) {
      doAttack(actor, target, null);
      return;
    }
    // 第 4 级：位移进射程（普通移动，'walk' 意图——AI 主动用跳留待 AI 技能决策卡）
    const best = walkCells(actor)
      .slice()
      .sort(
        (a, b) =>
          cubeDistance(a, target.hex) - cubeDistance(b, target.hex) ||
          cubeDistance(a, actor.hex) - cubeDistance(b, actor.hex),
      )[0];
    if (best) {
      doMove(actor, best, 'walk');
      basicIfAdjacent(actor);
    }
    // 第 5 级：无格可动 → 莽（原地结束回合）
  }

  // ---- 回合提交（病灶①：bar 消耗=显式清零；选中清除挂 selection.clear） ----

  function commitTurn(c: Runner): void {
    c.bar = 0; // 【BAR-3 / D3】显式清零重置（不依赖 clamp+减法隐式配合）
    c.barWasMax = false;
    if (c.side === 'player') {
      manual.idleSec = 0;
      clearSelection(); // 【SEL-3 / BASE-6】行动提交 → 选中清除（无连放）
    }
    lastActedId = c.id;
  }

  function checkEnd(): void {
    if (phase !== 'fighting') return;
    if (foesOf(player).length === 0) {
      phase = 'won';
      clearSelection(); // SEL-7 终局清输入态
      emit({ type: 'win' });
    } else if (player.dead) {
      phase = 'lost';
      clearSelection();
      emit({ type: 'lose' });
    }
  }

  /** BAR-5：90s 总时长未分胜负 → 存活 hp 总量高者胜，同量判玩家负（常量=core 唯一真值）。 */
  function settleTimeout(): void {
    if (phase !== 'fighting') return;
    emit({ type: 'timeout-hp' });
    phase = hpSum('player') > hpSum('enemy') ? 'won' : 'lost';
    clearSelection(); // SEL-7
    emit({ type: phase === 'won' ? 'win' : 'lose' });
  }

  /** SEL-1 输入态：条满（clamp 后恒 ≤100，满即 100）+ 手动 + 我方存活。 */
  const pendingInputNow = () =>
    phase === 'fighting' && mode === 'manual' && !player.dead && player.bar >= BAR.max;

  function tick(realDtSec: number): void {
    // 【体检 A03 入口校验 · PM 裁定 fail-fast】非有限或负 dt 直接抛（宿主边界坏输入禁静默禁兜底：
    // NaN 曾直乘速率把 clock/actionBar 写成 NaN 且不可恢复）。校验先于 phase 门——终局后坏输入
    // 同样暴露；合法 0 dt 不受影响（零前进仍走后续逻辑，既有行为零变更）。
    if (!Number.isFinite(realDtSec) || realDtSec < 0) {
      throw new Error(`tick: dt must be a finite non-negative number, got ${realDtSec}`);
    }
    if (phase !== 'fighting') return;
    const speed = speedFast ? SPEED_FACTOR.fast : SPEED_FACTOR.normal;
    const dt = realDtSec * speed;
    if (!pendingInputNow()) t += dt; // BAR-4：等待期冻结总时钟（不烧思考时间）

    for (const c of all) {
      if (!c.dead) c.bar = Math.min(BAR.max, c.bar + fillRate(c) * dt); // BAR-1 clamp 封顶
      if (c.moveT < 1) {
        c.moveT = Math.min(1, c.moveT + (dt * 1000) / ANIM_MS.walk);
        // 【T19/N1 防御 · 方案 §3.3】沿 movePath 分段等时插值（回退轨不穿占格）：
        // moveT=1 时 f=segs → i 收敛到末段、lp=1 → renderPos 精确等于 path 末位=hex
        //（整数坐标 IEEE 精确，FE settled 释放条件保持成立）；movePath 空/单点回退现直线公式。
        const path = c.movePath;
        if (path.length >= 2) {
          const segs = path.length - 1;
          const f = Math.min(segs, c.moveT * segs);
          const i = Math.min(segs - 1, Math.floor(f));
          const lp = f - i;
          c.renderQ = path[i].q + (path[i + 1].q - path[i].q) * lp;
          c.renderR = path[i].r + (path[i + 1].r - path[i].r) * lp;
        } else {
          c.renderQ = c.moveFromQ + (c.hex.q - c.moveFromQ) * c.moveT;
          c.renderR = c.moveFromR + (c.hex.r - c.moveFromR) * c.moveT;
        }
      }
      if (c.animLeftMs > 0) {
        c.animLeftMs -= dt * 1000;
        if (c.animLeftMs <= 0 && !c.dead) {
          if (c.animState === 'charge') {
            c.animState = 'strike';
            c.animLeftMs = ANIM_MS.strike;
          } else if (c.pendingAnim) {
            // 【T19/N1 主修 · 方案 §3.2】移动演出结束 → 补播延后的攻击演出（优先级 charge→strike→pendingAnim→idle）
            setAnim(c, c.pendingAnim);
            c.pendingAnim = null;
          } else {
            c.animState = 'idle';
            c.animLeftMs = 0;
          }
        }
      }
    }

    // BAR-2 轮转：bar 高 → fillRate 快 → 玩家先
    const ready = all
      .filter((c) => !c.dead && c.bar >= BAR.max)
      .sort((a, b) => b.bar - a.bar || fillRate(b) - fillRate(a) || (a.side === 'player' ? -1 : 1));
    for (const c of ready) {
      if (phase !== 'fighting') break;
      if (!c.barWasMax) {
        c.barWasMax = true; // SEL-1：一次性 bar-max（等待期不重复发）
        emit({ type: 'bar-max', actorId: c.id });
      }
      if (c.side === 'player' && mode === 'manual') {
        const { state, event } = stepManualTimeout(manual, dt);
        Object.assign(manual, state);
        if (event === 'trust') {
          aiAct(c, true);
          commitTurn(c);
        } else if (event === 'switchAuto') {
          mode = 'auto';
          clearSelection(); // SEL-7 切自动清输入态（AI 代行当前回合）
          emit({ type: 'switch-auto', actorId: c.id });
        }
        continue; // 未到托管：条保持满值等操作（输入态）
      }
      aiAct(c, false);
      if (phase !== 'fighting') break;
      commitTurn(c);
    }

    if (t >= TOTAL_TIME_LIMIT_S) settleTimeout();
  }

  // ---- 玩家输入（§3.3 ActionRequest；拒绝可观测 SP-3） ----

  function submit(req: ActionRequest): boolean {
    if (req.type === 'toggleSpeed') {
      speedFast = !speedFast;
      return true;
    }
    if (req.type === 'setMode') {
      mode = req.mode;
      if (req.mode === 'auto') clearSelection(); // SEL-7
      return true;
    }
    if (req.type === 'flee') {
      if (phase !== 'fighting') return false;
      phase = 'fled';
      clearSelection(); // SEL-7
      emit({ type: 'flee' });
      return true;
    }
    if (phase !== 'fighting') return false;
    if (req.type === 'selectSkill') {
      // 【GATE-1 v2.4】入口门与 SEL-1 同门（manual + 条满 + 我方存活；phase 已由上方门保证）——
      // 不满足发 rejected 并拒绝激活，禁静默激活（报告 Q03：原实现在 pendingInputNow 共享门之前
      // 直通 activate，条未满/auto 均可静默激活）。API 级兜底：UI 层既有门不受影响，正常路径零变化。
      // reason 分派：mode=资格层优先（非手动即无输入态资格，无论条态）→ 'mode'；否则条未满 → 'bar'。
      // 「我方存活」在 manual 下不可达为假（dead 即 checkEnd 置 lost、被上方 phase 门拦截），不单列。
      if (!pendingInputNow()) {
        emit({ type: 'rejected', actorId: player.id, reason: mode === 'manual' ? 'bar' : 'mode' });
        return false;
      }
      return activate(req.skillId); // SEL-2 互斥 toggle / SEL-6 置灰拒激活（不消耗预算）
    }
    if (req.type === 'cancelSkill') {
      clearSelection(); // SEL-5
      return true;
    }
    // move / attack：仅输入态受理（O1 二选一）
    if (!pendingInputNow()) {
      emit({ type: 'rejected', actorId: player.id, reason: 'bar' });
      return false;
    }
    if (req.type === 'move') {
      // 【SEL-5②】攻击技态点非射程格 = 取消选中回无选中（无事件）
      if (selection?.kind === 'attack') {
        clearSelection();
        return false;
      }
      // 【MV-2 · 优先判定】轻功态：仅受理金格（selection.legalCells，与快照同源）；
      // 集合外任何格（敌格/非金空格）→ rejected(invalid) 且不取消激活（ATK-4 不涉 move）
      if (selection?.kind === 'qing') {
        if (!selection.legalCells.some((p) => hexEq(p, req.to))) {
          emit({ type: 'rejected', actorId: player.id, reason: 'invalid' });
          return false;
        }
        if (player.neili < NEILI_COST_PER_CAST) {
          emit({ type: 'rejected', actorId: player.id, reason: 'invalid' });
          return false;
        }
        player.neili -= NEILI_COST_PER_CAST; // 【Q2】跳跃释放扣内力 1
        doMove(player, req.to, 'jump');
        basicIfAdjacent(player);
        tickCooldowns(player);
        commitTurn(player);
        return true;
      }
      // 【MV-1 无选中】绿格=移动；可达集外分两类：可动区内空格=无操作（ATK-5，无事件）、
      // 出区/占格=rejected(invalid)
      if (!walkCells(player).some((p) => hexEq(p, req.to))) {
        const off = axialToOffset(req.to);
        const isFieldEmpty =
          off.col >= FIELD_COL_MIN && off.col <= FIELD_COL_MAX && off.row >= FIELD_ROW_MIN && off.row <= FIELD_ROW_MAX &&
          !occupied().some((o) => hexEq(o, req.to));
        if (isFieldEmpty) return false; // ATK-5：无操作（不移动不取消，无事件）
        emit({ type: 'rejected', actorId: player.id, reason: 'invalid' });
        return false;
      }
      doMove(player, req.to, 'walk');
      basicIfAdjacent(player);
      tickCooldowns(player);
      commitTurn(player);
      return true;
    }
    if (req.type === 'attack') {
      // 【ATK-4 · Q4 session 守卫】轻功态点敌=无操作：false、无事件、选中保持
      if (selection?.kind === 'qing') return false;
      const target = byId(req.targetId);
      if (!target || target.dead || target.side === player.side) {
        emit({ type: 'rejected', actorId: player.id, reason: 'invalid' });
        return false;
      }
      if (req.skillId === null) {
        // 【ATK-1 普攻】合法性：cube ≤ basicRange 且（锥形）在 facing 扇区；非法 → rejected(invalid)
        if (!targetInRange(player, target, basicRange(player), rangeShapeOf(player.weapon ?? 'fist'))) {
          emit({ type: 'rejected', actorId: player.id, targetId: target.id, reason: 'invalid' });
          return false;
        }
        tickCooldowns(player);
        doAttack(player, target, null);
        commitTurn(player);
        return true;
      }
      // 【ATK-2 技能施放（Q1 定版：无降级）】四查全过才结算，否则 rejected（R-08/R-09 → SEL-6 置灰同源）
      const s = player.skills.find((x) => x.id === req.skillId);
      if (!s) {
        emit({ type: 'rejected', actorId: player.id, reason: 'invalid' });
        return false;
      }
      if (
        (s.weapon !== null && s.weapon !== player.weapon) || // R-05 武器匹配
        (player.cooldowns.get(s.id) ?? 0) > 0 || // R-08 冷却
        player.neili < NEILI_COST_PER_CAST // R-09 内力（Q2 常量口径）
      ) {
        emit({ type: 'rejected', actorId: player.id, targetId: target.id, reason: 'invalid' });
        return false;
      }
      if (!targetInRange(player, target, skillRange(s), rangeShapeOf(s.weapon ?? player.weapon ?? 'fist'))) {
        emit({ type: 'rejected', actorId: player.id, targetId: target.id, reason: 'range' });
        return false;
      }
      tickCooldowns(player);
      doAttack(player, target, s); // resolveAction 按 R-09 视图扣内力（neiliCost 视图=1）、R-08 写冷却
      commitTurn(player);
      return true;
    }
    // 【P-2=c 格子施放 · 方案 §3.2 单点插入（T20-BE）】cast 对格施放（ATK-2/6/7 v2.0）：
    // 与 move/attack 同受上方 pendingInputNow 共享门（分支内不重复查门）。attack 分支保留不动
    // （单位目标兼容入口）；input 层派发归 T20-FE。
    if (req.type === 'cast') {
      // 选中态门：无选中 / qing 态 / 陈旧 skillId → rejected(invalid)（cast 不得激活技能，激活只走 selectSkill）
      if (!selection || selection.kind !== 'attack' || selection.skillId !== req.skillId) {
        emit({ type: 'rejected', actorId: player.id, reason: 'invalid' });
        return false;
      }
      const s = player.skills.find((x) => x.id === req.skillId);
      if (!s) {
        emit({ type: 'rejected', actorId: player.id, reason: 'invalid' });
        return false;
      }
      // 四查之提交时重查（防激活后漂移）：R-05 武器匹配 / R-08 冷却 / R-09 内力（Q2 常量口径，禁 SkillDef.neiliCost）
      if (
        (s.weapon !== null && s.weapon !== player.weapon) ||
        (player.cooldowns.get(s.id) ?? 0) > 0 ||
        player.neili < NEILI_COST_PER_CAST
      ) {
        emit({ type: 'rejected', actorId: player.id, reason: 'invalid' });
        return false;
      }
      // 四查之射程：源=selection.legalCells（与快照 attackCells 同一产生点，显示=校验）+
      // Q2 自己格特判【并联不并入】（高亮不含自己格，rangeCells 冻结不动）；射程外=rejected(range)，
      // 不清选中（取消是 input 层 SEL-5② 职责，直接 cast=非法，SP-3）
      const inRange = hexEq(req.to, player.hex) || selection.legalCells.some((p) => hexEq(p, req.to));
      if (!inRange) {
        emit({ type: 'rejected', actorId: player.id, reason: 'range' });
        return false;
      }
      // ★【ATK-2 v2.2 · T22】受击目标集合 = 射程形态格（selection.legalCells，显示=校验=结算三同源，
      //   激活快照禁 cast 时重算——病灶③不复发）内的全体存活敌；all 数组序一次快照（SP-2：
      //   rng 消费顺序 = 目标序 × 每目标独立掷骰 1~3 次，禁 sort/tie-break）。
      //   演出位与点击格解耦（ATK-7 v2.2 简化）：命中只看射程成员，不依赖点击格与逻辑位。
      const legalCells = selection.legalCells; // 激活快照局部引用（选中态门已保证非 null；回调内窄化失效）
      const targets = all.filter(
        (x) => x.side !== player.side && !x.dead &&
          legalCells.some((p) => hexEq(p, x.hex)),
      );

      tickCooldowns(player); // 读后递减，与 attack 分支同位（四查后、结算前）

      if (targets.length > 0) {
        // 空集禁入 resolveAoe（faceTargetOf 入口断言 fail-fast）——空放=下方 else 臂（ATK-6 合法施放），两处互指
        resolveAoe(player, s, targets); // ★ 逐目标独立掷骰全额伤害，资源只在首目标扣一次；
        // ★ FACE-1：朝向由 resolveAoe 内 faceTarget 定版（朝最近受击敌）——v2.2 T22 落库的
        // faceToward(player, req.to)「点击格定版」随规格 v2.3 FACE-1 废止，此处不再覆盖
      } else {
        // ATK-6 空放=合法施放（v2.2 平移：射程形态内无任何存活敌）：resolveAction 不调
        // （battle-core 零改动红线），session 逐字段镜像资源三件
        // （与 AOE 施放资源终态四项全等：neili/冷却/bar/选中——用例 [ATK-6] 逐项锁）
        player.neili -= NEILI_COST_PER_CAST; // R-09 镜像（skillView 同值，禁用 SkillDef.neiliCost）
        if (s.cooldownTurns > 0) player.cooldowns.set(s.id, s.cooldownTurns); // R-08 镜像 core:246 条件式（写初值）
        setAnim(player, 'charge'); // Q3：施放演出照播（charge→strike 既有 anim 链，无受击 FX）
        faceToward(player, req.to); // 朝目标格出招（自己格=v{0,0} 早退，朝向保持）
        emit({ type: 'skill', actorId: player.id, skillId: s.id }); // 空放事件=skill 无 targetId 无 damage
      }
      commitTurn(player); // BAR-3 清零 + SEL-3 选中清除
      return true;
    }
    return false;
  }

  // ---- 快照（session → render，每帧重建；渲染只读） ----

  function snapshot(): BattleSnapshot {
    const pending = pendingInputNow();
    const turnId = pending ? player.id : lastActedId;
    // 【体检 A01】moveCells/attackCells 出口防御性复制（:267/:843 原直泄 selection.legalCells
    // 内部引用——展示端篡改快照曾可反向影响 submit 校验与 cast 结算目标）。
    // 其余数组字段既有事实=每帧新建对象（actors/heroSkills 均 map 产生、pos={...hex}、
    // statusIcons=[] 字面量），本就无引用外泄，用例 A01-6 锁现状防回归。
    const moveCells = pending ? copyCells(legalMoveCells()) : [];
    const attackCells =
      pending && selection?.kind === 'attack' ? copyCells(selection.legalCells) : [];
    const heroSkills: SkillButtonInfo[] = player.dead
      ? []
      : player.skills.map((s) => {
          const isQing = s.kind === 'qingGong';
          const disabled = isQing
            ? Math.floor(movePower(player.skills) / 2) < 1 || player.neili < NEILI_COST_PER_CAST // SEL-6/MV-2
            : player.neili < NEILI_COST_PER_CAST || (player.cooldowns.get(s.id) ?? 0) > 0 || (s.weapon !== null && s.weapon !== player.weapon);
          return { id: s.id, label: s.name, disabled };
        });
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
      statusIcons: [],
      isBoss: false,
      spriteKey: c.side === 'player' ? 'hero' : c.name, // F3：敌方 spriteKey=configId
      isJump: c.isJump && c.moveT < 1, // 病灶②：doMove 单点真值，仅 lerp 窗口内
      configId: c.side === 'player' ? undefined : c.name,
    }));
    return {
      phase,
      turnActorId: turnId,
      pendingInput: pending,
      moveCells,
      moveKind: selection?.kind === 'qing' ? 'jump' : 'walk',
      attackCells,
      selectedSkill: selection?.skillId ?? null,
      heroSkills,
      actors,
      cameraTargetId: turnId ?? player.id,
    };
  }

  // 出生朝向：全员转向最近敌（锥形轴开局即有意义）
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
    _debug: {
      units: all,
      mode: () => mode,
      clock: () => t,
      player: () => player,
      selection: () => selection,
      // 【体检 A02 测试钩子】faceTargetOf 是闭包内函数、生产调用面不可达空（两守卫滤空）——
      // 暴露 player 侧单参视图供守卫直呼断言（空数组抛错/非空返回本体），零生产行为面变化。
      faceTargetOf: (targets: Runner[]) => faceTargetOf(player, targets),
    },
  };
}

export type HexBattleSession = ReturnType<typeof createHexBattle>;
