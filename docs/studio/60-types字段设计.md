# 放置武侠 · Types 字段设计稿（数据结构/存档冻结版）

> 状态：**草稿（开工前 6 项补全 #1，待 Leo 审）**
> 日期：2026-08-19
> 定位：完整数据结构/存档字段设计稿。开工前把字段定死，可直接转成 `src/types.ts`（Sprint 0 T05 类型骨架）与云函数 `cloudfunctions/common/contract.js` 契约副本。
> 依据：`20-主架构文档.md` §5（云函数契约冻结、Player 结构）、`21-ADR-基础层.md`（ADR-002/003/004/005 全文）、`11-武功数据表-v0.1.md`、`12-放置成长与装备系统-v0.1.md`、`13-战斗数值设计-v0.1.md`、`03-战斗系统设计-v0.1.md`、`14-江湖好友与社交-v0.1.md`
> 约定：本文所有类型以 TypeScript 呈现，**纯类型、零运行时**（ADR-004）；枚举一律用 **string literal union**（不用 TS `enum`，`enum` 是运行时对象，违背零运行时）。

---

## 0. 与 ADR / 主架构的对齐声明（验收对照）

| 约束 | 本设计如何满足 |
|---|---|
| **ADR-004** 纯类型零运行时 | 全篇只定义 interface / type / union；无函数体、无运行时值；枚举全部用 string literal union |
| **ADR-005** 单文档存档 + 服务端时间锚 + version 迁移 | 全部状态收敛到单个 `Player` 文档（collection `players`，文档 id = OPENID）；`lastSettleAt` 只由服务端写；`version` 从 1 起步 + `migrate(fromVersion, doc)` 迁移链（见 §7） |
| **ADR-002** 客户端不算数值 | 派生字段（`derived.maxHp / maxNeili`）只存**结果**，不存公式；公式唯一真值在云函数 `settle/core.js`；客户端 `config/numbers.ts` 只放只读展示参数 |
| **ADR-003** 契约冻结 + 错误码表 | §8 定义 `SettleRequest/SettleResponse/LoadResponse/SaveResponse` + 错误码表（对齐主架构 §5.4）；变更走 ADR 流程 |
| **主架构 §5.3b** Player 存档骨架 | §1 字段表为 §5.3b 的完整展开：`stats` → 拆为 `baseStats`（六维）+ `derived`（气血/内力派生）；`resources` 保留并补足（学点/银两/实战/当前内力） |
| **D-05** 装备进 MVP（8 部位/5 档/5 品质/纯掉落） | §4 装备结构 8 部位 × 5 档 × 5 品质，纯掉落；分解→银两闭环字段在 `resources.silver` |

---

## 1. Player 存档结构（`players` 集合单文档，文档 id = OPENID）

### 1.1 顶层字段表（v1 完整字段，本文件即 version=1 的字段冻结）

| 字段 | 类型 | 必填 | 说明 | 来源 |
|---|---|---|---|---|
| `id` | string | ✅ | = OPENID（云端写，客户端不传） | 主架构 §5.3b |
| `version` | number | ✅ | 存档版本（当前 1），迁移用 | ADR-005 |
| `level` | number | ✅ | 主角等级（展示） | 主架构 §5.3b |
| `avatarId` | string | ✅ | 形象 ID（**MVP 固定 "hero_1"，外观不随装备变**；换装/部件式立绘 v1.0 预留，Leo 2026-08-19 拍板"简装：外观固定"） | 新 |
| `baseStats` | BaseStats | ✅ | 六维属性（臂力/根骨/机敏/定力/悟性/胆识） | 13 §2、10 §2.1 |
| `derived` | DerivedStats | ✅ | 派生属性（气血上限/内力上限），**由内功等级派生，云端结算** | 13 §5.1 |
| `resources` | Resources | ✅ | 学点/银两/实战/当前内力 | 主架构 §5.3b |
| `learnedSkills` | LearnedSkill[] | ✅ | 已学武学（含等级/熟练度/装配标记） | 主架构 §5.3b、11 |
| `inventory` | Equipment[] | ✅ | 装备背包（**未穿戴**的装备实例） | 12 §2、D-05 |
| `equipped` | EquippedSlots | ✅ | 8 部位穿戴（武器/衣服/披风/鞋子/头部/项链/护手/戒指） | 12 §2.3、D-05 |
| `currentMap` | string | ✅ | 当前地图/关卡 id（推图/扫荡目标） | 主架构 §5.3b |
| `unlockedMaps` | string[] | ✅ | 已解锁关卡 id 列表（解锁链进度） | 主架构 §5.3b |
| `lastSettleAt` | number | ✅ | 服务端最后结算时间（唯一权威时间锚，防回拨） | ADR-005 |
| `status` | PlayerStatus | ✅ | 正常 / 失血过多（推图失败惩罚） | 主架构 §5.3b、12 §1.1 |
| `friendSnapshot` | FriendSnapshot[] | ✅ | 借的好友角色快照（3v3 = 1 主玩家 + 2 好友；没好友为空数组） | 14 §1、S4-0 |
| `assistDaily` | AssistDaily | ✅ | 好友助战每日限次计数（每天 3 次） | 14 §3 |
| `meditationSkillId` | string \| null | ✅ | 离线闭关自修所选武学 id（12 §1 双轨产出；无选择 UI 时默认 null，云端默认基础内功） | 12 §1.2 |

> 补充说明（工程决策）：
> - `inventory` 与 `equipped` **不重复存同件装备**：穿戴 = 从 inventory 移入 equipped 槽位；卸下 = 移回 inventory。分解只对 inventory 中的未穿戴装备生效（防误分解）。背包 UI 展示时由客户端合并两处（只读拼装，不算数值）。
> - 当前气血不单独存字段：以 `status` 表达「失血过多」惩罚态；战斗中气血不可补、阵亡即败（13 §5c），无需在存档里维护逐场血量。若后期需要「气血恢复中」的倒计时，走 version 迁移加字段。

### 1.2 BaseStats（六维）

> 顺序按主架构 §5.3b：臂力/根骨/机敏/定力/悟性/胆识（与 13 §2 六维映射一致，字段集合不变，仅书写顺序归一）。

```ts
interface BaseStats {
  strength: number     // 臂力 → 攻击（来源：基础武学 +10 上限 / 装备）13 §2
  constitution: number // 根骨 → 防御/气血
  agility: number      // 机敏 → 闪避/速度
  willpower: number    // 定力 → 抗性（负面抵抗）
  intelligence: number // 悟性 → 学武效率
  courage: number      // 胆识 → 暴击率（实战每 100 万 +1，不吃基础武学）13 §2 / 10 §2.2
}
```

### 1.3 DerivedStats（派生属性）

> **只存结果，不存公式**（ADR-002）。公式唯一真值在云函数 `settle/core.js`，对齐 13 §5.1：
> `气血 = 基础内功等级 × 50 + 装配内功等级 × X(待定)`
> `内力 = 基础内功等级 × 5  + 装配内功等级 × Y(待定)`
> X/Y 为云端常数（数值初稿 #5 定稿），不落客户端。

```ts
interface DerivedStats {
  maxHp: number      // 气血上限（由基础内功等级 + 装配内功等级派生）
  maxNeili: number   // 内力上限（同上）
}
```

### 1.4 Resources

```ts
interface Resources {
  studyPoint: number  // 学点：学武消耗（+ 离线闭关产出）11 / 12 §1
  silver: number      // 银两：学武消耗 + 买药（大还丹/金疮药）；来源 = 装备分解 + 推图少量掉落 12 §1.4
  exp: number         // 实战：胆识成长（每 100 万 +1）+ 关卡解锁门槛（12 §2.2 五档）13 §2
  neili: number       // 当前内力：推图续航资源（跨场消耗、大还丹补满，上限 = derived.maxNeili）12 §1.3
  hp: number          // 当前气血：**新增（Leo 2026-08-19 定）**——挂机每场损耗模拟 + 自动补药需维护；上限 = derived.maxHp
  tili: number        // 当前体力：**新增（Leo 2026-08-19 定）**——挂机/推图场次资源，每场固定 -1；上限 100 初稿 🔧
}
```

> **口径更新（2026-08-19）**：原设计「当前气血不存字段、以 status 表达失血」（§1.1 下注）已不适用——挂机系统需按场模拟气血损耗并自动补药（模块 04 §3.3/§3.4），`hp` 入档；`tili` 为独立场次资源（12 §1.3 已更新，不再"内力替代体力"）。

### 1.5 PlayerStatus / AssistDaily

```ts
type PlayerStatus = 'normal' | 'bleeding'   // 正常 / 失血过多（推图失败惩罚，禁推图/战力受限，12 §1.1）

interface AssistDaily {
  date: string                     // 服务端日期（YYYY-MM-DD，服务端写）
  byFriend: Record<string, number> // 各好友当日被借次数（friendId → used，**上限 10 场/好友/日**，14 v0.2 Leo 拍板）
}
```

---

## 2. Skill 结构（对齐 11 武功数据表）

> 分两层：**静态定义**（数据表内容，存 `data/`，客户端与云端各一份副本）与**存档态**（玩家已学状态，存 `Player.learnedSkills`）。存档只存 `skillId` 引用，名称/品阶/成长系数等静态字段从数据表解析——存档最小化、静态表可热更。

### 2.1 静态定义 SkillDef（= 11 数据表一行的类型）

| 字段 | 类型 | 说明 | 11 表字段 |
|---|---|---|---|
| `id` | string | 唯一标识（wx-000…） | ID |
| `school` | SchoolType | 所属门派（基础武学=通用） | 门派 |
| `category` | SkillCategory | 外功/内功/轻功/门派技能/基础武学/江湖武学 | 类别 |
| `tier` | SkillTier | 一阶/二阶/三阶/专属/基础/江湖 | 品阶 |
| `maxLevel` | number | 等级上限（**按品阶全局映射，云端配置区**，Leo 2026-08-19 拍板：一阶 100 / 二阶 80 / 三阶 70；基础 20；专属/江湖后期定） | — |
| `name` | string | 武学名 | 名称 |
| `weapon` | WeaponType \| null | 关联武器范围类型（内功/轻功无武器 → null） | 武器 |
| `range` | RangeShape \| null | 范围形态（内功/轻功无范围 → null） | 范围 |
| `prerequisites` | string[] | 学习前置武功 id 列表（**等级要求按学习条件表：二阶=前置一阶≥60 级；三阶=前置二阶≥40 级 + 二阶内功≥50 级，64 §9.2 Leo 拍板**） | 前置 |
| `cost` | SkillCost | 学习消耗：学点 + 银两（双资源，12 §1.4） | 学点（银两为 12 补充） |
| `baseAtk` | number | 基础攻击加成 | 基础攻防 |
| `baseDef` | number | 基础防御加成 | 基础攻防 |
| `hpBonus` | number | **仅内功类**：装配后气血加成 | 气血加成 |
| `neiliBonus` | number | **仅内功类**：装配后内力加成 | 内力加成 |
| `growth` | number | 每级提升系数（成长系数） | 成长系数 |
| `effects` | string[] | 特殊效果描述（门派技能/内功被动等） | 特效 |

```ts
type SchoolType =
  | 'basic'      // 通用（基础武学）
  | 'qingfeng'   // 清风派（11 已录入）
  | 'taiji'      // 太极门
  | 'emei'       // 峨眉
  | 'tianshan'   // 天山派
  | 'kuangdao'   // 狂刀谷
  | 'gaibang'    // 丐帮
  | 'jianghu'    // 江湖武学（后期）

type SkillCategory =
  | 'external'   // 外功
  | 'internal'   // 内功
  | 'lightness'  // 轻功
  | 'school'     // 门派技能
  | 'basic'      // 基础武学
  | 'jianghu'    // 江湖武学（后期）

type SkillTier =
  | 'tier1' | 'tier2' | 'tier3'   // 一阶/二阶/三阶（13 §3 武功系数 1.0/1.3/1.7）
  | 'exclusive'                   // 专属（门派技能）
  | 'basic'                       // 基础
  | 'jianghu'                     // 江湖（后期）

type WeaponType =
  | 'sword' | 'blade' | 'palm' | 'fist'
  | 'staff' | 'spear' | 'whip' | 'hidden'
  // 剑/刀/掌/拳/棍/枪/鞭/暗器（03 §3.3 武器→范围形态表，8 类）

type RangeShape =
  | 'smallCross'  // 小十字·可移动（剑/刀/掌/拳）
  | 'cross'       // 十字·固定（棍/枪）
  | 'line'        // 直线·固定（鞭，长距离贯穿）
  | 'single'      // 单格·可移动（暗器，定点单体）
  | 'fan'         // 扇形（预留）
  | 'aoe'         // 群体/全屏（门派技能/后期绝学）

interface SkillCost {
  studyPoint: number  // 学点（11：⬜ 数值阶段）
  silver: number      // 银两（12 §1.4 学武 = 学点+银两双资源）
}
```

> **门派武学 vs 基础武学 区分**（10 §1 武学分层）：
> - 基础武学：`school='basic'`，category 含 `basic`，提升六维（每 10 级 +1 对应属性，11 wx-000~006）；
> - 门派武学：`school` 为具体门派，category 为 external/internal/lightness/school；
> - 学习条件区分：基础/门派武学 = 学点 + 前置武功等级（10 §3.2，无属性要求）；江湖武学 = 属性门槛（后置）。

### 2.2 存档态 LearnedSkill（存于 Player.learnedSkills）

```ts
interface LearnedSkill {
  skillId: string       // → SkillDef.id
  level: number         // 当前等级（学点学习上限内 + 自修突破）
  proficiency: number   // 熟练度（离线闭关自修产出；绝学/特技纯自修，10 §7.1）
  equipped: boolean     // 装配标记：内功类只能装配一门（当前运功，13 §5.1 装配内功加成 X/Y）
}
```

> 说明：`equipped` 仅对内功有意义（内功=当前运功决定 X/Y 加成与行动速度）；外功/轻功的装配态由 `Player.equipped.weapon` 决定的武器类型隐式表达，MVP 不在 learnedSkills 上做多装备位。

---

## 3. 关卡 / 敌人结构（对齐 12 五档装备与实战分层）

> 关卡是**静态定义**（存 `data/`），Player 只存 `currentMap` + `unlockedMaps` 进度。地图分档对齐 12 §2.2 装备五档（按实战分层）：

| 档位 | tier | 实战门槛 | 代号 | 12 §2.2 |
|---|---|---|---|---|
| 1 | `1` | 无要求 | 布衣 | ✅ |
| 2 | `2` | 1W | 精铁 | ✅ |
| 3 | `3` | 10W | 百炼 | ✅ |
| 4 | `4` | 50W | 玄铁 | ✅ |
| 5 | `5` | 100W | 天蚕 | ✅ |

### 3.1 StageDef（关卡静态定义）

```ts
interface StageDef {
  id: string              // 关卡 id（Player.currentMap / battle payload 引用）
  name: string            // 关卡名（水墨名）
  tier: MapTier           // 地图分档 1~5（对齐装备档位/实战分层，12 §2.2）
  unlock: StageUnlock     // 解锁条件（解锁链）
  enemies: EnemyUnit[]    // 敌方配置（数量 3~6，即 3v3~3v6，03 §0 / 14 §1）
  drops: DropConfig[]     // 掉落配置（学点/实战/银两/装备）
}

type MapTier = 1 | 2 | 3 | 4 | 5   // 布衣/精铁/百炼/玄铁/天蚕

interface StageUnlock {
  exp: number             // 实战门槛（对齐 tier 档位：1/1W/10W/50W/100W）
  prevStageId?: string    // 前置关卡 id（推图胜利解锁下一关，E5 S5-2）
}
```

### 3.2 EnemyUnit（敌方单位）

```ts
interface EnemyUnit {
  unitId: string          // 敌方单位唯一 id（e1…e6，battleLog 引用）
  name: string            // 敌人名
  level: number           // 敌人等级
  baseStats: BaseStats    // 六维（13 攻防公式输入）
  hp: number              // 气血
  neili: number           // 内力（出招消耗）
  atk: number             // 攻击（= 基础攻击 + 臂力×系数 + 武器攻击 + 武功等级×成长，13 §1）
  def: number             // 防御（= 基础防御 + 根骨×系数 + 防具防御，13 §1）
  weapon: WeaponType      // 武器 → 决定攻击范围形态（03 §3.3）
  skills: string[]        // 可释放武学 id[]（SkillDef.id）
  ai: 'melee' | 'ranged'  // 索敌/移动策略（第一版站桩，03 §6 第 1 步；移动版后接）
}
```

### 3.3 DropConfig（掉落配置，E5 S5-3）

```ts
interface DropConfig {
  type: 'studyPoint' | 'exp' | 'silver' | 'equipment'
  weight: number          // 掉落权重（云端随机，种子可复现）
  // 按 type 细分（可 union 展开）：
  amount?: number         // studyPoint / exp / silver 的数值
  tier?: MapTier          // equipment：掉落装备档位（对齐当前关卡 tier）
  qualityWeights?: Record<EquipQuality, number>  // equipment：5 品质权重（12 §2.2 品质概率待定）
}
```

> 掉落规则对齐：装备仅在线推图掉落（12 §1.2 离线闭关不产装备）；掉落进 `SettleResponse.data.delta.loot`（见 §8）。

---

## 4. 装备结构（8 部位 / 5 档 / 5 品质 / 纯掉落，D-05）

### 4.1 枚举

```ts
type EquipSlot =
  | 'weapon' | 'armor' | 'cloak' | 'boots'
  | 'head' | 'necklace' | 'gloves' | 'ring'
  // 武器/衣服/披风/鞋子/头部/项链/护手/戒指（12 §2.3 部位属性倾向）

type EquipTier = 1 | 2 | 3 | 4 | 5     // 布衣/精铁/百炼/玄铁/天蚕（12 §2.2）

type EquipQuality = 'white' | 'green' | 'blue' | 'purple' | 'orange'
// 白/绿/蓝/紫/橙（12 §2.2；品质倍率待定：白 1x → 橙 ?x）
```

### 4.2 部位属性倾向（12 §2.3）

| 部位 | 主属性 |
|---|---|
| `weapon` 武器 | 攻击（并决定武功范围类型） |
| `armor` 衣服 / `cloak` 披风 / `boots` 鞋子 | 防御 |
| `head` 头部 / `necklace` 项链 / `gloves` 护手 / `ring` 戒指 | 气血 |

### 4.3 Equipment（装备实例）

```ts
interface Equipment {
  uid: string             // 实例唯一 id（掉落时生成，保证可区分同 defId 多件）
  defId: string           // 装备静态定义 id（data/ 表）
  slot: EquipSlot         // 部位
  tier: EquipTier         // 档位（实战门槛，对齐 12 §2.2）
  quality: EquipQuality   // 品质
  baseAtk: number         // 攻击（武器主属性）
  baseDef: number         // 防御（防具主属性）
  baseHp: number          // 气血（饰品主属性）
  source: LootSource      // 掉落来源（关卡 id / 初始）
}

type LootSource =
  | { kind: 'stage'; stageId: string }   // 推图掉落（12 §2.1 纯掉落）
  | { kind: 'initial' }                  // 建号初始装备

interface EquippedSlots {
  weapon:    Equipment | null
  armor:     Equipment | null
  cloak:     Equipment | null
  boots:     Equipment | null
  head:      Equipment | null
  necklace:  Equipment | null
  gloves:    Equipment | null
  ring:      Equipment | null
}
```

> 对齐 12 §2.4：装备命名 = 等级代号（布衣/精铁/百炼/玄铁/天蚕）+ 武侠名池（避开金庸专属名），属静态 `defId` 的展示字段，不进存档。

---

## 5. battleLog 契约（A 全离线回放，客户端零判定）

> ADR-002 / 03 §0：云端一次跑完战斗返回 battleLog，客户端 Battle 场景只按 log 播放动画，**不做任何判定**。
> 规模：MVP 3v3（1 主玩家 + 2 好友助战），敌方 3~6（3v3~3v6）；参战单位总数 4~9。
> 紧凑性约束（主架构 §8 R5）：tick 数限流 ≤ 300；结构紧凑、字段必填不冗余。

```ts
interface BattleLog {
  stageId: string        // 关卡 id
  version: number        // battleLog 结构版本（当前 1）
  seed: number           // 随机种子（云端可复现，测试比对用）
  tickCount: number      // 总 tick 数（≤ 300，主架构 R5）
  units: BattleUnit[]    // 参战单位快照（玩家/好友/敌方，开局态）
  actions: BattleAction[]// 每 tick 动作序列（按 tick 升序）
  result: BattleResult   // 胜负 + 掉落
}

interface BattleUnit {
  unitId: string         // 实例 id：玩家 p1 / 好友 f1 f2 / 敌方 e1…e6
  side: 'player' | 'enemy'
  name: string
  pos: { x: number; y: number }   // 棋盘坐标（03 §1 动态棋盘，MVP 站桩）
  hp: number
  maxHp: number
  neili: number
  atk: number
  def: number
  weapon: WeaponType     // 决定范围形态（03 §3.3）
  skills: string[]       // 可释放武学 id[]
}

// 动作：每 tick 至多 N 条（同 tick 多单位行动按序排列）
interface BattleAction {
  tick: number            // 时间刻度（相对 tickCount）
  actor: string           // 动作发起单位 id
  type: BattleActionType
  target?: string         // 单体目标单位 id（move/death 无）
  targets?: string[]      // 多目标（范围武功命中列表）
  damage?: number         // 伤害值（攻击/技能）
  healing?: number        // 治疗值（预留）
  from?: { x: number; y: number }  // 位移起点
  to?: { x: number; y: number }    // 位移终点
  skillId?: string        // 释放武学 id（type=skill 时）
  effect?: string         // 特效/状态（中毒/反击/暴击标记等，13 §5b）
}

type BattleActionType =
  | 'move'      // 位移（轻功定距离，03 §0.1）
  | 'attack'    // 普攻（单体，13 §1 攻防公式）
  | 'skill'     // 武功（带范围，武器定范围，03 §3）
  | 'heal'      // 治疗（预留）
  | 'death'     // 阵亡
  | 'effect'    // 状态/特效（中毒持续掉血等，天山派 11 wx-061）

interface BattleResult {
  victory: boolean        // 胜负（玩家方胜）
  drops: LootResult[]     // 胜利掉落（败方为空）
}

interface LootResult {
  type: 'studyPoint' | 'exp' | 'silver' | 'equipment'
  amount?: number         // 资源类数值
  equipment?: Equipment   // equipment 类的装备实例（进 delta.loot → Player.inventory）
}
```

---

## 6. FriendSnapshot（好友助战快照，S4-0）

> 14 §1/§3：3v3 = 1 主玩家 + 2 好友助战；好友助战每天限 3 次。借好友角色时由云端生成角色**快照**（防止借实时战力被改/被伪造），存于 `Player.friendSnapshot`。
> 快照机制细节（获取好友 OPENID 的方式、快照时效）按 22 §3 标记为 **Sprint 1 收尾前拍板**（S4-0），本设计只冻结字段形状。

```ts
interface FriendSnapshot {
  friendOpenId: string   // 好友 OPENID（云端写）
  nickName: string       // 展示名
  snapshotAt: number     // 快照生成时间（服务端）
  level: number          // 好友等级
  baseStats: BaseStats   // 六维（战斗输入）
  maxHp: number          // 气血上限
  maxNeili: number       // 内力上限
  atk: number            // 攻击（结算快照，非实时）
  def: number            // 防御
  weapon: WeaponType     // 武器（范围形态）
  skills: LearnedSkill[] // 已学武学精简快照（只含战斗相关）
}
```

---

## 7. 存档 version 迁移设计（ADR-005）

### 7.1 规则（ADR-005 影响/代价，冻结）

1. `version` 从 **1** 起步；本设计稿 §1 = **v1 完整字段表**（字段冻结）。
2. 每次结构变更（加/改/删字段、改语义）→ 新 `version = 旧 + 1`，新增一个迁移函数 `migrateN→N+1`。
3. **禁止直接改结构不迁移**（ADR-005 原话）：旧档必须可升不可废。
4. 迁移只在**云端**执行（load 时跑，settle 写档前校验 version 为最新）；客户端**不跑迁移**，只读云端返回的当前版 Player。
5. 迁移函数必须是**纯函数、可单测**（23 测试策略 §3.1 列为测试资产）。
6. 迁移串行执行：`migrate(1→2)` → `migrate(2→3)` → … 直到最新版。

### 7.2 函数签名与迁移链（云函数侧，`cloudfunctions/common/migrate.js`）

```ts
// 迁移注册表：key = 从该版本升级（值 = 升级到 key+1 的函数）
type MigrateFn = (doc: unknown) => unknown
// 注：输入/输出为旧/新版 Player 的松类型，迁移内做字段变换，末尾统一校验为最新版结构

declare function migrate(fromVersion: number, doc: unknown): Player
// 行为：let v = fromVersion; let cur = doc;
//       while (MIGRATIONS[v]) { cur = MIGRATIONS[v](cur); v += 1; }
//       校验 v === LATEST_VERSION，返回 cur 作为 Player

declare const MIGRATIONS: Record<number, MigrateFn>
// 示例：MIGRATIONS[1] = migrateV1toV2（未来 v2 增加字段时注册）
```

### 7.3 v1 字段表（= §1 Player 全部字段）与未来变更示例

| version | 内容 | 迁移 |
|---|---|---|
| **1（当前）** | 本设计稿 §1 全字段 | — |
| 2（示例，未发生） | 例：新增 `bleedingUntil`（失血恢复倒计时） | `migrateV1toV2`：旧档补 `bleedingUntil: null`，`version: 2` |

> 迁移测试要点（23 §3.1）：v1→v2 旧档可无损升级；迁移后字段与 `types.ts` 契约一致；迁移纯函数无副作用。

---

## 8. 契约类型清单（对齐主架构 §5）

### 8.1 统一信封

```ts
interface CloudResponse<T> {
  code: number          // 0 成功，非 0 失败（错误码表 §8.4）
  msg: string
  data: T
}
```

### 8.2 SettleRequest / SettleResponse（主架构 §5.2 冻结）

```ts
type SettleAction = 'idle' | 'learn' | 'battle' | 'mapUnlock' | 'heal'
// v0.1 实现 idle / learn / battle；mapUnlock / heal 预留（主架构 §5.2）

interface SettleRequest {
  requestId: string           // 幂等键（uuid，客户端生成；ADR-003）
  clientTs: number            // 客户端时间戳（仅日志/抖动统计，不参与结算）
  playerId?: string           // 预留；安全以 OPENID 为准
  action: SettleAction
  payload: SettlePayload      // 按 action 区分（见下）
}

type SettlePayload =
  | { offline: boolean }                      // idle：离线补结算 / 在线周期
  | { skillId: string }                       // learn：学武（云端校验学点/银两/前置/已学）
  | { stageId: string }                       // battle：战斗（云端查敌方表、跑完整场）
  | { stageId: string }                       // mapUnlock（预留）
  | { itemId: string }                        // heal（预留：大还丹/金疮药）

interface SettleResponseData {
  delta: Delta                  // 本次增量（UI 动画用）
  player: Player                // 结算后完整新状态（展示快照，B1）
  serverTs: number              // 服务端结算时间（后续 idle 基准，B3）
  battleLog?: BattleLog         // 仅 action=battle 返回
}

interface Delta {
  studyPoint: number
  exp: number
  silver: number
  loot: LootResult[]            // 掉落（装备/资源）
  skillUps: { skillId: string; fromLevel: number; toLevel: number }[]
  neiliDelta?: number           // 当前内力变化（推图消耗/大还丹补充）
  hpDelta?: number              // 气血变化（治疗，预留）
}
```

### 8.3 load / save（主架构 §5.3 冻结）

```ts
// load
interface LoadRequest { requestId: string; clientTs: number }   // playerId 用 OPENID
type LoadResponse = CloudResponse<{
  player: Player | null   // 无档时 null，客户端引导建号
  serverTs: number
}>

// save（显式落库兜底/心跳，不接收客户端快照）
interface SaveRequest { requestId: string; clientTs: number }
type SaveResponse = CloudResponse<{
  saved: boolean
  serverTs: number
}>
```

### 8.4 错误码表（主架构 §5.4 冻结，逐条对齐）

| code | 含义 | 客户端行为 |
|---|---|---|
| 0 | 成功 | — |
| 1001 | 参数校验失败 | 提示后重试 |
| 1002 | 资源不足（学点/银两） | 提示，刷新展示 |
| 1003 | 前置条件不满足（武学前置/等级） | 提示 |
| 1004 | 重复请求（幂等命中，返回已结算结果） | 静默使用返回 |
| 1005 | 存档不存在 | 引导建号 |
| 2001 | 云数据库错误 | 提示稍后重试 |
| 2002 | 内部错误 | 提示稍后重试 |

---

## 9. 与 11 / 12 / 13 数据表字段对齐检查表（验收用）

### 9.1 对齐 11 武功数据表

| 11 表字段 | 本设计落点 |
|---|---|
| ID / 门派 / 类别 / 品阶 / 名称 / 武器 / 范围 / 前置 / 学点 / 基础攻防 / 气血加成 / 内力加成 / 成长系数 / 特效 | `SkillDef`（§2.1）：id/school/category/tier/name/weapon/range/prerequisites/cost/baseAtk/baseDef/hpBonus/neiliBonus/growth/effects ✅ |
| （存档态：等级/熟练度） | `LearnedSkill`（§2.2）：skillId/level/proficiency/equipped ✅ |
| 门派武学 vs 基础武学 | `school` + `category` 联合区分（§2.1 说明）✅ |

### 9.2 对齐 12 放置成长与装备系统

| 12 设计点 | 本设计落点 |
|---|---|
| 8 部位 / 5 档 / 5 品质 / 纯掉落 | `EquipSlot` / `EquipTier` / `EquipQuality` / `LootSource`（§4）✅ |
| 部位属性倾向（武器=攻、防具=防、饰品=血） | `Equipment.baseAtk/baseDef/baseHp`（§4.3）✅ |
| 五档实战分层（布衣/精铁/百炼/玄铁/天蚕） | `MapTier` / `StageDef.tier` / `StageUnlock.exp`（§3）✅ |
| 学点/实战/银两/装备掉落 | `resources` + `DropConfig` + `LootResult`（§1.4 / §3.3 / §5）✅ |
| 离线闭关（学点+熟练度，无实战/装备） | `meditationSkillId` + `LearnedSkill.proficiency`（§1.1 / §2.2）✅ |
| 失血过多惩罚 / 内力推图续航 | `PlayerStatus` + `resources.neili`（§1.4 / §1.5）✅ |
| 银两闭环（分解→银两→学武/买药） | `resources.silver` + `inventory`（分解只对未穿戴，§1.1 说明）✅ |

### 9.3 对齐 13 战斗数值设计

| 13 设计点 | 本设计落点 |
|---|---|
| 六维属性映射（臂力/根骨/机敏/定力/悟性/胆识） | `BaseStats`（§1.2）✅ |
| 气血/内力 = 基础内功等级×50/×5 + 装配内功×X/Y（§5.1） | `DerivedStats.maxHp/maxNeili`（只存结果，公式在云端 core.js）✅ |
| 伤害公式（攻−防）×系数×暴击（§1） | `BattleUnit.atk/def` + `SkillDef.tier` 系数（云端计算，客户端只播）✅ |
| 武功系数按品阶（§3） | `SkillTier`（tier1/2/3 → 云端系数 1.0/1.3/1.7）✅ |
| 行动条速度 / 命中闪避 | 云端结算输入（`baseStats`），battleLog 只输出动作 ✅ |

---

## 10. 落地映射：→ `src/types.ts`（T05）与云函数契约副本

| 本设计章节 | 落地文件 | 说明 |
|---|---|---|
| §1 Player | `src/types.ts`（客户端）+ `cloudfunctions/common/contract.js`（副本） | 存档结构 |
| §2 Skill | `src/types.ts` 类型 + `data/skills.ts` 静态表（11 转数据） | 类型 vs 数据分层 |
| §3 关卡 | `src/types.ts` 类型 + `data/stages.ts` 静态表（63 关卡数据表定稿后填数） | 同上 |
| §4 装备 | `src/types.ts` 类型 + `data/equipment.ts` 静态定义 | 装备实例存存档 |
| §5 battleLog | `src/types.ts` + `cloudfunctions/common/contract.js` | 契约类型 |
| §7 migrate | `cloudfunctions/common/migrate.js`（含迁移注册表 + 单测） | 云端专属，客户端无 |
| §8 契约 | `src/types.ts` + `cloudfunctions/common/contract.js` | 契约测试对齐（23 §4） |

**类型落地纪律（对应 T05 验收）：**
- `types.ts` 零运行时：只有 interface / type / string literal union，无 enum、无函数体、无导出值（eslint 强制）。
- 枚举一律 string literal union（§0）；`GameNumbers` 接口在 `types.ts` 定义、`config/numbers.ts` 实现（ADR-004）。
- 客户端与云函数不共享代码文件，靠契约测试对齐两端结构（ADR-003 / 23 §4）。

---

## 11. 风险与知识缺口

| # | 项 | 影响 | 缓解 |
|---|---|---|---|
| G1 | 好友助战快照的**获取机制**（微信好友关系链 OPENID / 云存储读法）未定 | `friendSnapshot` 字段形状已冻结，但填充逻辑依赖 S4-0 拍板 | 字段按本设计落地；机制细节 Sprint 1 收尾前拍板（22 §3）；届时走 ADR 契约变更 |
| G2 | 内功加成 X/Y、装备品质倍率、掉落率等数值未定（⬜） | 类型字段已含，数值留空 | 数值初稿 #5 + 关卡数据 #4 定稿后填 `data/` |
| G3 | `meditationSkillId`（闭关选择）与 `assistDaily`（助战限次，**已改按好友维度 byFriend**）为**按需求文档补充**的字段，不在主架构 §5.3b 原始清单 | 若 Leo 认为 MVP 阶段不必持久化，可砍（走 version 变更时删除） | 已标来源（12 §1 / 14 §3）；待 Leo 审 |
| G4 | 当前气血不落档（以 status 表达失血态） | 若后期要「气血恢复倒计时」需迁移 | 已注明走 version 迁移加字段 |

---

## 12. 变更记录

| 日期 | 版本 | 变更 | 签字 |
|---|---|---|---|
| 2026-08-19 | v0.1 | 创建：types 字段设计稿（Player/Skill/关卡/装备/battleLog/迁移/契约） | 待审 |
| 2026-08-19 | v0.1.1 | 补 `maxLevel` 字段（品阶映射，Leo 拍板：一阶100/二阶80/三阶70） | Leo ✅ |
| 2026-08-19 | v0.1.2 | **Resources 补 hp/tili（Leo 定）**：挂机损耗模拟 + 自动补药需维护当前气血；体力为独立场次资源（每场 -1，上限 100 初稿）；AssistDaily 助战次数 3 → 10 场/好友/日 | Leo ✅ |
