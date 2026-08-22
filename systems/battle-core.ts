// T05 战斗核心 headless 纯逻辑（不依赖 Canvas / wx.*，node 直接跑）
// 公式唯一依据：config/公式与数值总览.md + docs/80（冲突时以 docs/80 为准）
// 架构决策见 tasks/done/T05-done.md：与云端 settle 同构的纯函数（R-06 P1-3），
// RNG 可注入、逻辑离散步进（dt=0.05s），保证同种子结果完全可复现。
import type {
  BattleConfig,
  BattleLog,
  BattleResult,
  CombatantInput,
  SkillDef,
  WeaponType,
} from '../types';

// ---------- 常量（均为公式编号拍板值，禁止改动） ----------
const BAR_MAX = 100; // F-05 行动条满值（docs/80 §4：1000 作废）
const TOTAL_TIME_LIMIT_S = 90; // F-05 防死循环：战斗总时长 90s
export const MANUAL_TIMEOUT_S = 90; // docs/80 §4：手动 90s 托管 → 再 90s 切自动
const DT = 0.05; // 仿真步长（秒）
const BASE_HIT = 0.85; // F-04
const CRIT_MULT = 1.5; // F-04
const DODGE_CAP = 0.25; // F-04

// R-05 攻击范围档位：武器形态 × 武功等级档（Lv 20/40/60）→ 曼哈顿半径（P2-11）
const RANGE_BY_WEAPON: Record<WeaponType, [number, number, number]> = {
  sword: [1, 2, 3], // 剑：移动小十字 3×3/5×5/7×7
  fist: [1, 2, 3], // 拳：同剑
  staff: [1, 2, 3], // 棍：中心大十字 每向 3/5/7
  club: [1, 2, 3], // 棒：同棍
  whip: [3, 4, 5], // 鞭：正前方扇形 纵深 3/4/5
  blade: [3, 4, 5], // 刀：同鞭
  hidden: [4, 6, 9], // 暗器：射程 4/6/9（Leo 2026-08-20 定）
};

// ---------- RNG（mulberry32，可注入种子，单测确定性） ----------
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- R-07 敌方数量（按玩家实战档位，docs/80 §2） ----------
export function rollEnemyCount(shizhan: number, rng: Rng): number {
  if (shizhan < 100) return 1;
  const roll = rng();
  if (shizhan < 10000) {
    // 随机 1-3：50/35/15
    if (roll < 0.5) return 1;
    if (roll < 0.85) return 2;
    return 3;
  }
  // 随机 1-6：10/25/30/20/10/5
  if (roll < 0.1) return 1;
  if (roll < 0.35) return 2;
  if (roll < 0.65) return 3;
  if (roll < 0.85) return 4;
  if (roll < 0.95) return 5;
  return 6;
}

// ---------- F-05 行动条 ----------
export function fillRate(c: CombatantInput): number {
  // 填充速度(/秒) = (100 + 内功等级×3 + 机敏×1) / 10；峨眉 +10% 后置（门派字段未进 MVP 输入）
  return (100 + c.neigongLevel * 3 + c.jimin) / 10;
}

// ---------- R-05 范围 ----------
export function rangeTier(level: number): 0 | 1 | 2 {
  if (level < 20) return 0;
  if (level < 40) return 1;
  return 2;
}

export function skillRange(skill: SkillDef): number {
  return RANGE_BY_WEAPON[skill.weapon ?? 'fist'][rangeTier(skill.level)];
}

/** 普攻射程：取该武器下等级最高武功的档位（无匹配武功按档 1） */
function basicRange(c: CombatantInput): number {
  if (!c.weapon) return RANGE_BY_WEAPON.fist[0];
  const tier = c.skills
    .filter((s) => s.weapon === c.weapon)
    .reduce((m, s) => Math.max(m, rangeTier(s.level)), 0);
  return RANGE_BY_WEAPON[c.weapon][tier];
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// ---------- 手动 90s 托管状态机（docs/80 §4，独立可测） ----------
export type ManualTimeoutEvent = null | 'trust' | 'switchAuto';

export interface ManualTimeoutState {
  stage: 0 | 1 | 2; // 0=正常 1=等待首次托管 2=等待切自动
  idleSec: number; // 行动条满后累计无操作秒数
}

export function stepManualTimeout(
  s: ManualTimeoutState,
  dt: number,
): { state: ManualTimeoutState; event: ManualTimeoutEvent } {
  const next = { stage: s.stage, idleSec: s.idleSec + dt };
  if (next.idleSec >= MANUAL_TIMEOUT_S) {
    next.idleSec = 0;
    if (next.stage === 0 || next.stage === 1) {
      next.stage = 2;
      return { state: next, event: 'trust' }; // 本回合 AI 代行 + 提示
    }
    return { state: next, event: 'switchAuto' }; // 切回自动模式 + 提示
  }
  return { state: next, event: null };
}

// ---------- 玩家初始（R-11 / docs/80 §1，PlayerConfig 消费方） ----------
export function makeInitialPlayer(): CombatantInput {
  return {
    id: 'player',
    name: '少侠·无名',
    side: 'player',
    hp: 100,
    maxHp: 100, // 基础气血常量 100（F-07）
    neili: 0,
    maxNeili: 0, // 初始未装配内功 → 内力上限 0 → 仅普攻（R-09 天然引导）
    atk: 119, // 30 + 27×2 + 木剑20 + 野猫10×1.5（F-02）
    def: 70, // 20 + 27×1.5 + 短褐10（F-02）
    neigongLevel: 0,
    jimin: 27,
    danshi: 15,
    shizhan: 0,
    pos: { x: 4, y: 10 }, // P2-5 我方固定站位
    weapon: 'sword',
    skills: [
      {
        id: 'yemao-jianfa',
        name: '野猫剑法',
        kind: 'waiGong',
        weapon: 'sword',
        grade: 0.5, // 门派一阶 1.0 × 50%（docs/80 §1.1）
        growth: 1.5,
        level: 10, // 默认 10 级，锁级不可提升
        cooldownTurns: 0, // 普通外功无冷却
        neiliCost: 10, // 一阶 20 × 50%
      },
    ],
  };
}

/** 生成敌方单位（从场景 mob 模板按布点顺序循环填充，R-07；MVP 敌方仅普攻） */
export function makeEnemy(
  index: number,
  template: Pick<CombatantInput, 'name' | 'hp' | 'atk' | 'def' | 'jimin' | 'danshi' | 'shizhan'>,
): CombatantInput {
  return {
    id: `enemy-${index}`,
    name: template.name,
    side: 'enemy',
    hp: template.hp,
    maxHp: template.hp,
    neili: 0,
    maxNeili: 0,
    atk: template.atk,
    def: template.def,
    neigongLevel: 0,
    jimin: template.jimin,
    danshi: template.danshi,
    shizhan: template.shizhan,
    pos: { x: 1 + (index % 6), y: 1 }, // 敌方 y=1 行（P2-5），x 依次排开
    weapon: 'fist', // MVP 敌方空手普攻，射程 1
    skills: [],
  };
}

// ---------- 内部运行时单位 ----------
interface Runner extends CombatantInput {
  bar: number;
  cooldowns: Map<string, number>; // skillId → 剩余冷却回合
}

// ---------- 出手结算（F-01/F-03/F-04） ----------
// 参数类型放宽到 CombatantInput（resolveAction 导出供演出层同源调用；Runner 结构兼容，零行为变更）
function resolveDamage(
  actor: CombatantInput,
  target: CombatantInput,
  gradeFactor: number,
  rng: Rng,
): { damage: number; crit: boolean; missed: boolean } {
  // 判定顺序（F-04）：命中 → 闪避 → 暴击 → 破防保底
  const hitRate = Math.min(1, BASE_HIT + (actor.shizhan / 1_000_000) * 0.01);
  if (rng() >= hitRate) return { damage: 0, crit: false, missed: true };
  const dodgeRate = Math.min(DODGE_CAP, target.jimin * 0.002);
  if (rng() < dodgeRate) return { damage: 0, crit: false, missed: true };
  const crit = rng() < actor.danshi * 0.003;
  const base = Math.max(actor.atk - target.def, 1); // 破防下限 1（✅）
  const damage = Math.floor(base * gradeFactor * (crit ? CRIT_MULT : 1));
  return { damage, crit, missed: false };
}

// ---------- 单次出手结算（A1-T06 v2 方案 A 抽取导出，行为零变更） ----------
// 原 act() 内「命中(F-04)+伤害(F-01)+结算应用」段的零变更搬运：act() 本体改为调用本函数。
// 演出层（battle-ui）手动/自动出招同源走此处，数值唯一真值不分叉；rng 参数注入保确定性。
// 副作用契约：skill≠null 时扣 actor.neili 并写 actor.cooldowns；命中时写 target.hp。

/** 出手结算入参的 actor 形态（CombatantInput + 冷却表；演出层 Runner 自行组装） */
export type ActionActor = CombatantInput & { cooldowns: Map<string, number> };

/** 单次出手结果（logs 为本次出手的全部日志体，顺序与引擎原行为一致；round/t 由调用方补） */
export interface ActionOutcome {
  kind: 'skill' | 'basic' | 'miss' | 'fallback' | 'blocked';
  damage: number;
  crit: boolean;
  logs: Array<Omit<BattleLog, 'round' | 't'>>;
}

/** 单次出手结算：skill=null 走普攻（射程不足返回 blocked，不消耗不结算） */
export function resolveAction(
  actor: ActionActor,
  target: CombatantInput,
  skill: SkillDef | null,
  rng: Rng,
): ActionOutcome {
  const mkLog = (over: Partial<Omit<BattleLog, 'round' | 't'>>): Omit<BattleLog, 'round' | 't'> => ({
    actorId: actor.id,
    actorSide: actor.side,
    action: 'basic',
    targetId: target.id,
    damage: 0,
    crit: false,
    ...over,
  });

  if (skill) {
    actor.neili -= skill.neiliCost;
    if (skill.cooldownTurns > 0) actor.cooldowns.set(skill.id, skill.cooldownTurns);
  } else if (manhattan(actor.pos, target.pos) > basicRange(actor)) {
    // 射程外：本次行动无法出手（MVP 静止站位语义，F-06 移动后置）
    return {
      kind: 'blocked',
      damage: 0,
      crit: false,
      logs: [mkLog({ action: 'blocked', note: '目标超出射程' })],
    };
  } else if (actor.skills.length > 0) {
    // 有武功但均不可出（内力/冷却/匹配）→ 普攻兜底（提示性日志，随后紧跟实际结算）
    const fallbackLogs: Array<Omit<BattleLog, 'round' | 't'>> = [
      mkLog({ action: 'fallback', note: '武功不可出，普攻兜底' }),
    ];
    const r = resolveDamage(actor, target, 1.0, rng); // 此分支 skill=null，普攻无品阶加成
    target.hp = Math.max(0, target.hp - r.damage);
    if (r.missed) {
      return { kind: 'miss', damage: 0, crit: false, logs: [...fallbackLogs, mkLog({ action: 'miss', note: '未命中/被闪避' })] };
    }
    return { kind: 'basic', damage: r.damage, crit: r.crit, logs: [...fallbackLogs, mkLog({ action: 'basic', damage: r.damage, crit: r.crit })] };
  }

  const r = resolveDamage(actor, target, skill ? skill.grade : 1.0, rng);
  target.hp = Math.max(0, target.hp - r.damage);
  if (r.missed) {
    return { kind: 'miss', damage: 0, crit: false, logs: [mkLog({ action: 'miss', skillId: skill?.id, note: '未命中/被闪避' })] };
  }
  return {
    kind: skill ? 'skill' : 'basic',
    damage: r.damage,
    crit: r.crit,
    logs: [mkLog({ action: skill ? 'skill' : 'basic', skillId: skill?.id, damage: r.damage, crit: r.crit })],
  };
}

// ---------- 主入口：runBattleHeadless ----------
export function runBattleHeadless(config: BattleConfig): BattleResult {
  const rng = makeRng(config.seed ?? 20260821);
  const logs: BattleLog[] = [];
  let round = 0;
  let t = 0;
  let mode = config.mode;
  const manual: ManualTimeoutState = { stage: 0, idleSec: 0 };

  const mk = (c: CombatantInput): Runner => ({
    ...c,
    bar: 0,
    cooldowns: new Map(c.skills.map((s) => [s.id, 0])),
  });
  const player = mk(config.player);
  const enemies = config.enemies.map(mk);
  const all = [player, ...enemies];

  const aliveEnemies = () => enemies.filter((e) => e.hp > 0);
  const hpSum = (side: 'player' | 'enemy') =>
    all.filter((c) => c.side === side).reduce((s, c) => s + Math.max(0, c.hp), 0);

  const log = (l: Omit<BattleLog, 'round' | 't'>) => logs.push({ round, t: +t.toFixed(2), ...l });

  /** 一次行动：选武功（R-05 匹配 + R-08 冷却 + R-09 内力）→ 不行则普攻兜底 → 自动寻敌 */
  function act(actor: Runner, forced: 'trust' | null = null): void {
    round++;
    const foes = all.filter((c) => c.side !== actor.side && c.hp > 0);
    if (foes.length === 0) return;
    const dist = (f: Runner) => manhattan(actor.pos, f.pos);
    const nearest = () => foes.slice().sort((a, b) => dist(a) - dist(b))[0];

    // 选武功：数组顺序 = 优先级；需武器匹配、冷却 0、内力足够、射程内有敌
    let chosen: SkillDef | null = null;
    let target: Runner | null = null;
    for (const s of actor.skills) {
      if (s.weapon !== null && s.weapon !== actor.weapon) continue; // R-05 不匹配 → 无法出招
      if ((actor.cooldowns.get(s.id) ?? 0) > 0) continue; // R-08 冷却中不选
      if (actor.neili < s.neiliCost) continue; // R-09 内力不足不选
      const inRange = foes.filter((f) => dist(f) <= skillRange(s));
      if (inRange.length === 0) continue;
      chosen = s;
      target = inRange.sort((a, b) => dist(a) - dist(b))[0];
      break;
    }

    // 冷却随自身行动递减（R-08：行动一次计 1 回合）
    for (const s of actor.skills) {
      const cd = actor.cooldowns.get(s.id) ?? 0;
      if (cd > 0) actor.cooldowns.set(s.id, cd - 1);
    }

    if (forced === 'trust') {
      log({
        actorId: actor.id,
        actorSide: actor.side,
        action: 'timeout-trust',
        damage: 0,
        crit: false,
        note: '久未操作，本回合已自动托管',
      });
    }

    // 结算段（A1-T06 v2 方案 A：零变更搬运至导出函数 resolveAction，act 只补 round/t）
    const finalTarget = target ?? nearest();
    const outcome = resolveAction(actor, finalTarget, chosen, rng);
    for (const l of outcome.logs) logs.push({ round, t: +t.toFixed(2), ...l });
  }

  // ---------- 主循环（离散步进至 90s 防死循环，F-05） ----------
  while (t < TOTAL_TIME_LIMIT_S) {
    for (const c of all) c.bar += fillRate(c) * DT;
    t += DT;

    // 行动顺序：行动条高者先，同条速度（fillRate）快者先，再同则玩家先
    const ready = all
      .filter((c) => c.hp > 0 && c.bar >= BAR_MAX)
      .sort((a, b) => b.bar - a.bar || fillRate(b) - fillRate(a) || (a.side === 'player' ? -1 : 1));

    for (const c of ready) {
      if (c.hp <= 0 || aliveEnemies().length === 0 || player.hp <= 0) break;
      if (c.side === 'player' && mode === 'manual') {
        // 手动：无人操作 → 累计 90s 托管代行，再 90s 切自动（状态机可独立复用）
        const { state: ms, event } = stepManualTimeout(manual, DT);
        Object.assign(manual, ms);
        if (event === 'trust') {
          act(c, 'trust');
          c.bar -= BAR_MAX;
          manual.idleSec = 0;
        } else if (event === 'switchAuto') {
          mode = 'auto';
          log({
            actorId: c.id,
            actorSide: c.side,
            action: 'timeout-auto',
            damage: 0,
            crit: false,
            note: '久未操作，已切回自动模式',
          });
        }
        continue; // 未到托管时间：行动条保持满值等待操作
      }
      act(c);
      c.bar -= BAR_MAX;
      if (c.side === 'player') manual.idleSec = 0; // 玩家行动重置计时
    }

    if (player.hp <= 0 || aliveEnemies().length === 0) {
      return {
        winner: player.hp <= 0 ? 'enemy' : 'player',
        reason: 'annihilate',
        logs,
        duration: +t.toFixed(2),
        finalHp: { player: hpSum('player'), enemy: hpSum('enemy') },
      };
    }
  }

  // 防死循环：90s 未分胜负 → 存活 hp 总量高者胜，总量相同判玩家负（F-05 ✅）
  const pHp = hpSum('player');
  const eHp = hpSum('enemy');
  return {
    winner: pHp > eHp ? 'player' : 'enemy',
    reason: 'timeout-hp',
    logs,
    duration: TOTAL_TIME_LIMIT_S,
    finalHp: { player: pHp, enemy: eHp },
  };
}
