// 所有数据结构定义（模块间通过类型咬合，AGENTS.md 施工守则 5）
// T02 骨架阶段：仅放占位类型，玩法数据结构随 T03~T07 任务卡逐步补全

/** 规范色值（04-UI风格规范，UI 层只读引用） */
export interface Palette {
  ink: string; // 墨 #2B2B2B
  paper: string; // 宣纸 #F8F4EA
  cinnabar: string; // 朱砂 #E2574C
  bamboo: string; // 竹青 #7FB069
  gold: string; // 淡金 #D4AF37
}

/** 主循环帧上下文（渲染层只读） */
export interface FrameContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dt: number; // 距上一帧毫秒
}

// ============ T05 战斗核心（headless）类型 ============
// 公式依据：config/公式与数值总览.md（F-01/02/03/04/05、R-05/07/08/09）+ docs/80 拍板

/** 武器形态（R-05：范围档位由武器形态决定） */
export type WeaponType = 'sword' | 'fist' | 'staff' | 'club' | 'whip' | 'blade' | 'hidden';

/** 武功类型（R-08 冷却初值按类型：外功 0 / 特技 2 / 绝学 5 / 暗器 1） */
export type SkillKind = 'waiGong' | 'special' | 'ultimate' | 'hiddenWeapon' | 'qingGong' | 'sect';

/** 武功品阶（F-03：一阶 1.0 / 二阶 1.3 / 三阶 1.7；野猫剑法 0.5 为特殊过渡系数） */
export type GradeFactor = 1.0 | 1.3 | 1.7 | 0.5;

/** 武功定义（R-05 武器匹配 / R-08 冷却 / R-09 内力消耗） */
export interface SkillDef {
  id: string;
  name: string;
  kind: SkillKind;
  weapon: WeaponType | null; // null = 空手可用（拳法）；不匹配装备武器则无法出招（R-05）
  grade: GradeFactor; // 品阶系数（伤害倍率，F-01）
  growth: number; // 成长系数（F-02：攻击力 = … + 武功等级×成长）
  level: number; // 当前等级（决定范围档位：Lv 20/40/60 三档，R-05）
  cooldownTurns: number; // 冷却回合数（R-08）
  neiliCost: number; // 内力消耗（R-09）
}

/** 棋盘坐标（MVP 固定站位 P2-5：我方 y=10 / 敌方 y=1，棋盘 8×12） */
export interface GridPos {
  x: number;
  y: number;
}

/** 战斗单位输入（属性由调用方按 F-02/F-07 预算后传入，headless 不重复算属性成长） */
export interface CombatantInput {
  id: string;
  name: string;
  side: 'player' | 'enemy';
  hp: number;
  maxHp: number;
  neili: number;
  maxNeili: number;
  atk: number; // F-02 攻击力（调用方算好）
  def: number; // F-02 防御力
  neigongLevel: number; // F-05 行动条用
  jimin: number; // 机敏（F-05 速度 / F-04 闪避）
  danshi: number; // 胆识（F-04 暴击率）
  shizhan: number; // 实战（F-04 命中率）
  pos: GridPos;
  weapon: WeaponType | null; // 装备武器（R-05 匹配判定）
  skills: SkillDef[]; // 出招优先级按数组顺序
}

/** 单条战斗日志（需求表 #7：回合/行动者/动作/伤害/结果） */
export interface BattleLog {
  round: number; // 第几次行动（全场行动序号）
  t: number; // 发生时刻（秒，战斗内时间）
  actorId: string;
  actorSide: 'player' | 'enemy';
  action:
    | 'skill' // 武功出招
    | 'basic' // 普攻
    | 'fallback' // 内力不足/武器不匹配 → 普攻兜底（R-09/R-05）
    | 'miss' // 未命中/被闪避（0 伤害）
    | 'blocked' // 目标超出射程，本次行动无法出手
    | 'timeout-trust' // 手动 90s 无操作 → 本回合 AI 代行（docs/80 §4）
    | 'timeout-auto'; // 再 90s 无操作 → 切回自动模式
  skillId?: string;
  targetId?: string;
  damage: number; // 本次结算伤害（miss=0）
  crit: boolean;
  note?: string; // 结果备注（如破防保底/托管提示）
}

/** 战斗模式 */
export type BattleMode = 'auto' | 'manual';

/** 战斗结果 */
export interface BattleResult {
  winner: 'player' | 'enemy' | null; // null 不应出现（防死循环规则保证有胜负）
  reason: 'annihilate' | 'timeout-hp'; // 全灭 / 90s 总时长 hp 总量判定（F-05）
  logs: BattleLog[];
  duration: number; // 战斗时长（秒）
  finalHp: { player: number; enemy: number }; // 存活 hp 总量
}

/** runBattleHeadless 输入 */
export interface BattleConfig {
  player: CombatantInput; // MVP 我方仅 1 人（R-03 助战后置）
  enemies: CombatantInput[]; // 敌方阵容（数量由调用方按 R-07 档位生成，见 rollEnemyCount）
  mode: BattleMode; // 手动模式下玩家不操作时走 90s 托管状态机
  seed?: number; // RNG 种子（缺省用默认种子，保证确定性可测）
}
