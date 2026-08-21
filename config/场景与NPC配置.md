# 放置武侠 · 场景系统配置数据（单一数据源）

> 状态：**配置数据（数值初稿 🔧 待 64 定稿回填）**
> 日期：2026-08-19
> 定位：**场景系统的配置数据集中地**——SceneConfig / NpcConfig / HangupConfig 全部数据表。模块 02（场景系统）/ 03（NPC 系统）/ 04（挂机系统）/ 08（Boss 挑战）都从这里读配置。
> 代码落位：`config/scenes.ts`（场景）+ `config/npcs.ts`（NPC）
> 原则：**新增场景/NPC = 加配置，不改代码**。所有数值为初稿参考，64 定稿后回填。

---

## 1. 数据结构（接口定义）

### 1.1 SceneConfig（每个场景一份）
```
interface SceneConfig {
  id: string                    // 'scene-qingniu'
  name: string                  // 场景名（左上角显示）
  bg: string                    // 背景图素材路径
  unlockPractice: number        // 进入场景的实战要求（0=新手自由进入）
  npcs: NpcSpawn[]              // NPC 布点（模块 03 消费）
  boss: BossConfig | null       // 本场景 Boss（模块 08 消费）
  hangup: HangupConfig          // 挂机产出（模块 04 消费）
}

interface NpcSpawn {
  npcId: string                 // 引用 NpcConfig
  x: number                     // 出生位置 0~1
  y: number
  count: number                 // 同类型怪数量
}

interface BossConfig {
  npcId: string                 // 引用 NpcConfig（Boss 型）
  challengePractice: number     // 挑战 Boss 的实战要求
  defeatReward: DropReward      // 击败 Boss 掉落（保底蓝+）
}

interface HangupConfig {
  xuedianPerSec: number   // 学点产出 /秒
  shizhanPerFight: number // 实战 /场
  yinliangPerFight: number// 银两 /场
  fightDuration: number   // 每场打怪动画时长（秒，2~3s）
  dropChance: number      // 装备掉落概率 /场
  tiliCost: number        // 每场体力消耗（默认 1，Leo 定；挂机/手动/Boss 统一扣 1，逃跑不扣）
  spawnCountRange: [number, number]  // ⚠ 已废弃（2026-08-20）：场景全清刷新数量改按玩家实战档位（R-06/<100:1、100~1W:1-3、≥1W:1-6），刷新间隔 30s
}
```

### 1.2 NpcConfig（每种 NPC 一份）
```
interface NpcConfig {
  id: string                  // 'npc-shanzei'
  type: 'mob' | 'boss'
  name: string
  appearance: NpcAppearance   // ★ 外观（模块 03 一致性铁律）
  hp: number                  // 气血
  attack: number              // 攻击
  defense: number             // 防御
  speed: number               // 行动速度
  skills: string[]            // ★ 装配武功
  equipment: NpcEquipment[]   // ★ 装配装备
  aggro: 'active' | 'passive' // 主动/被动
  aggroRange: number          // 主动攻击半径
  reward: DropReward          // 击杀掉落
}

interface NpcAppearance {
  sprite: string              // 独立立绘
  scale: number               // 渲染缩放（Boss 1.3）
  nameColor: string           // 名字色（统一朱砂，Boss 朱砂加深加粗，75 §1c 敌我区分）
  aura: 'none' | 'boss'       // 气场
}

interface NpcEquipment {
  itemId: string
  slot: string                // 武器/护甲…
  icon: string                // 装备图标
}

interface DropReward {
  xuedian: number
  shizhan: number
  yinliang: number
  dropTable: { itemId: string; weight: number }[]
}
```

---

## 2. 场景配置表（5 场景，对齐 63 关卡数据表 §1 五档地图）

| 场景 ID | 名称 | 实战要求 | 背景图 | NPC 布点 | Boss |
|---|---|---|---|---|---|
| scene-qingniu | 青牛山下 · 野径 | 0（新手） | scene_jianghu | 山贼×2、野狼×1（主动） | 独眼狼王（≥**1000** 挑战，Leo 定） |
| scene-luoyan | 落雁坡 | ≥1W | scene_luoyan | 悍匪×3（主动） | 铁面虎（≥1W） |
| scene-heifeng | 黑风林 | ≥10W | scene_heifeng | 邪派喽啰×2、毒蛇×1（被动） | 黑风老熊（≥10W） |
| scene-duanhun | 断魂谷 | ≥50W | scene_duanhun | 邪派剑士×2、毒士×1（主动） | 毒蝎使（≥50W） |
| scene-lingjueding | 灵绝顶外围 | ≥100W | scene_lingjueding | 圣火徒×3（主动） | 圣火护法（≥100W） |

---

## 3. NPC 配置表（13 种：8 普通怪 + 5 Boss）

> 数值初稿 🔧 待 64 回填；**血/攻/防/速 对齐 63 §2.2 数值模板**；外观/装备/武功已按 Leo 一致性铁律配齐。
> ⚠ npc-boss-1 独眼狼王 = **Leo 指定首个 Boss（挑战实战 ≥1000）**，数值按挑战强度高于 63 档位 1 头目模板（800/50/25/100），详见 §3.1。

| NPC ID | 类型 | 名称 | 外观立绘 | 装配装备 | 装配武功 | 血/攻/防/速 | 主动/被动 | 击杀学点/实战/银两 |
|---|---|---|---|---|---|---|---|---|
| npc-shanzei | mob | 山贼喽啰 | spr_shanzei | 破旧砍刀 | 基础刀法 | 300/30/15/100 | 主动 | 15 / 120 / 2 |
| npc-lang | mob | 野狼 | spr_lang | 利爪 | 撕咬 | 250/25/10/120 | 主动 | 15 / 120 / 2 |
| npc-hanfei | mob | 悍匪 | spr_hanfei | 精铁大刀 | 精铁刀法 | 900/90/45/110 | 主动 | 25 / 300 / 5 |
| npc-duxie | mob | 毒蛇 | spr_duxie | 毒牙 | 毒牙（中毒） | 900/70/30/130 | 被动 | 20 / 250 / 4 |
| npc-xiepai | mob | 邪派喽啰 | spr_xiepai | 黑风弯刀 | 黑风刀法 | 2700/270/135/120 | 主动 | 50 / 960 / 16 |
| npc-jianshi | mob | 邪派剑士 | spr_jianshi | 邪风长剑 | 邪风剑法 | 8100/810/405/130 | 主动 | 135 / 3000 / 50 |
| npc-dushi | mob | 毒士 | spr_dushi | 蚀骨毒针 | 蚀骨毒针 | 8100/700/380/125 | 被动 | 120 / 2800 / 45 |
| npc-shenghuo | mob | 圣火徒 | spr_shenghuo | 圣火法杖 | 圣火诀 | 24300/2430/1215/140 | 主动 | 310 / 7200 / 120 |
| npc-boss-1 | boss | 独眼狼王 | spr_boss_lang | 狼王利爪 + 兽皮甲 | 狼王扑杀 | **1500/110/45/110** | 主动 | 首通 300/2000/50 |
| npc-boss-2 | boss | 铁面虎 | spr_boss_hu | 玄铁爪 | 猛虎下山 | 2400/150/75/110 | 主动 | 首通 750/5000/125 |
| npc-boss-3 | boss | 黑风老熊 | spr_boss_xiong | 石甲 | 熊掌裂地 | 7200/450/225/120 | 主动 | 首通 2400/16000/400 |
| npc-boss-4 | boss | 毒蝎使 | spr_boss_xie | 毒蝎尾针 | 万毒蚀心 | 21600/1350/675/130 | 主动 | 首通 7500/50000/1250 |
| npc-boss-5 | boss | 圣火护法 | spr_boss_huofa | 圣火令 | 圣火焚天 | 64800/4050/2025/140 | 主动 | 首通 18000/120000/3000 |

### 3.1 第一个 Boss：独眼狼王（Leo 指定优先配置，挑战实战 ≥1000）

```
BossConfig {
  npcId: 'npc-boss-1'
  challengePractice: 1000            // ✅ Leo 指定（原 63 档位1头目无挑战要求，本值已生效）
  defeatReward: {
    xuedian: 300, shizhan: 2000, yinliang: 50     // 首通奖励
    dropTable: [
      { itemId: 'eq-qingniu-langyabang', weight: 30 },  // 青牛·狼牙棒（布衣·蓝·武器 攻+30）
      { itemId: 'eq-qingniu-langpi',     weight: 40 },  // 狼皮甲（布衣·绿·护甲 防+12）
      { itemId: 'item-xuanti',           weight: 30 },  // 玄铁石（材料，MVP 若有材料系统）
    ]
  }
}

NpcConfig {
  id: 'npc-boss-1'
  type: 'boss'
  name: '独眼狼王'
  appearance: { sprite: 'spr_boss_lang', scale: 1.3, nameColor: '#E2574C', aura: 'boss' }  // ★ 外观
  hp: 1500, attack: 110, defense: 45, speed: 110      // 🔧 数值初稿待调
  skills: ['狼王扑杀']                                    // ★ 装配武功（单目标重击）
  equipment: [
    { itemId: 'eq-boss-langzhua', slot: 'weapon', icon: 'ic_boss_langzhua' },  // ★ 狼王利爪（爪，范围=小十字）
    { itemId: 'eq-boss-shoupi',   slot: 'cloth',  icon: 'ic_boss_shoupi'   },  // ★ 兽皮甲（外观/防御）
  ]
  aggro: 'active', aggroRange: 0.15
  reward: { xuedian: 300, shizhan: 2000, yinliang: 50, dropTable: [同上] }
}
```

**数值设计说明（🔧 初稿，Leo 可调）**：
- 挑战实战 1000 时玩家参考强度：攻 ≈134（30+臂力27×2+武器20+一阶武学10级×3）、防 ≈70、气血 ≈800
- 狼王 1500 血 / 防 45 → 玩家 3v3 一轮 ≈267 伤害 → 约 6 轮 ≈ 35s 打完（有挑战感不拖沓）
- 狼王 110 攻 / 玩家防 70 → 单下 ≈40 伤害 → 3 人分摊 + 补药可撑（不被秒，有压力）
- 击败掉落保底蓝+（对齐 63 §2.2「BOSS 保底蓝+」）；首通 300/2000/50 沿用原示例

### 3.2 掉落物品模板（首批，模块 06 装备模板 config/items.ts 数据源）

| itemId | 名称 | 档位 | 品质 | 部位 | 属性（F-14 基准 × 品质倍率） |
|---|---|---|---|---|---|
| eq-qingniu-langyabang | 青牛·狼牙棒 | 布衣 | 蓝 | 武器（棒/近战） | 攻 +30（基准 20 × 蓝 1.5） |
| eq-qingniu-langpi | 狼皮甲 | 布衣 | 绿 | 护甲 | 防 +12（基准 10 × 绿 1.2） |
| eq-buyi-podao | 破旧砍刀 | 布衣 | 白 | 武器（刀） | 攻 +20 |
| eq-buyi-cubu | 粗布短褐 | 布衣 | 白 | 护甲 | 防 +10 |
| eq-buyi-buxie | 千层布鞋 | 布衣 | 白 | 鞋子 | 防 +10 |
| eq-buyi-lunjin | 束发纶巾 | 布衣 | 白 | 头部 | 气血 +30 |
| item-xuanti | 玄铁石 | — | — | 材料 | —（MVP 无合成系统时不出，留待 v1.0） |

> 掉落表 = DropReward.dropTable（权重随机，§3.1 独眼狼王示例）。

### 3.3 普通怪掉落表 + 挂机产出（青牛山下，🔧 初稿待 64/63 统一更新）

**普通怪击杀掉落（dropTable，品质概率对齐 63 §4.1 普通关：白60/绿25/蓝10/紫4/橙1，1~2 件）**

| NPC | dropTable（itemId: weight） |
|---|---|
| npc-shanzei 山贼喽啰 | 破旧砍刀 40 / 粗布短褐 35 / 千层布鞋 20 / 束发纶巾 5（白为主，蓝+靠概率） |
| npc-lang 野狼 | 粗布短褐 45 / 千层布鞋 30 / 狼皮甲（绿）20 / 青牛·狼牙棒（蓝）5 |

**挂机产出 HangupConfig（青牛山下，对齐 64 F-11 学点 450/场 + 63 §4.2 实战 1200/银两 20）**

```
HangupConfig {
  xuedianPerSec: 180       // 450 学点/场 ÷ 2.5s ≈ 180/s（挂机收益条显示）
  shizhanPerFight: 1200    // 63 §4.2 档位1 扫荡实战
  yinliangPerFight: 20     // 63 §4.2 档位1 扫荡银两
  fightDuration: 2.5       // 打怪动画秒/场（2~3s）
  dropChance: 0.4          // 装备掉落概率 /场（40%）
  tiliCost: 1              // 每场体力消耗（Leo 定，固定 1 点/场）
  spawnCountRange: [1, 6]  // NPC 清空后刷新 1-6 只随机（Leo 定，越多收益/损耗越大）
}
```

> 挂机产出（HangupConfig）青牛山下：**学点 +180/s · 实战 +1200/场 · 银两 +20/场 · 打怪动画 2.5s/场 · 掉落概率 40%**（见 §3.3，对齐 64 F-11/63 §4.2）。

### 3.4 战斗规模与玩家初始（Leo 2026-08-20 拍板，来源 `docs/80`）

**敌方组队（普通战斗）**：按玩家当前实战分档——`<100: 1` / `100~1W: 随机1-3` / `≥1W: 随机1-6`（概率 50/35/15、10/25/30/20/10/5）；类型从本场景 `npcs`（mob）按布点顺序循环填充。

**Boss 战**：Boss 本体固定 1 + 护卫按档位——`<100: 0` / `100~1W: 0~1 随机` / `≥1W: 1~2 随机`（护卫从本场景小怪选）。

**玩家初始（PlayerConfig，代码落位 `config/player.ts`）**：气血 100（基础常量）｜内力 0｜六维模板 B（27/27/27/27/27/15）｜Lv1｜初始武功=**野猫剑法**（剑系·Lv10 锁级·成长系数 1.5·品阶系数 0.5·耗内 10·配合新手引导后置）｜初始装备=木剑+粗布短褐。狼王=进阶目标（初始打不过正常，路径：打怪→入门派→变强再战）。

---

## 4. 与 63-关卡数据表的对齐

| 检查项 | 结论 |
|---|---|
| 5 场景 ↔ 63 五档地图 | ✅ 1:1（青牛山下/落雁坡/黑风林/断魂谷/灵绝顶） |
| 实战要求 ↔ 63 §1 | ✅ 0/1W/10W/50W/100W |
| NPC 数值 ↔ 63 §2.2 | ✅ 攻防/速度一致（🔧 待 64 定稿回填） |
| Boss ↔ 63 每档第 4 关 | ✅ 独眼狼王/铁面虎/黑风老熊/毒蝎使/圣火护法；**⚠ 独眼狼王挑战要求 = 1000（Leo 指定，高于 63 档位1 头目模板强度）** |
| 击杀奖励 ↔ 63 §4.2 | ✅ 扫荡奖励折算 |

---

## 5. 变更记录

| 日期 | 版本 | 变更 | 签字 |
|---|---|---|---|
| 2026-08-19 | v1 | 创建：场景系统配置数据集中地（接口定义 + 5 场景表 + 13 NPC 表 + 对齐检查） | 待审 |
| 2026-08-19 | v1.1 | **首个 Boss 配置（Leo 指定）**：独眼狼王挑战实战 **1000**；数值 1500/110/45/110（高于 63 档位1 头目模板，附设计说明）；§3.1 完整 BossConfig+NpcConfig+掉落表；§3 表补血列统一四维 | Leo ✅ |
| 2026-08-19 | v1.2 | **普通怪掉落 + 挂机产出（🔧 初稿）**：§3.2 物品模板扩展 6 件布衣装；§3.3 山贼/野狼 dropTable（63 §4.1 品质概率）+ 青牛山下 HangupConfig（学点 180/s · 实战 1200/场 · 银两 20/场 · 2.5s/场 · 掉率 40%，对齐 64 F-11/63 §4.2） | 🔧 待统一 |
| 2026-08-19 | v1.3 | **挂机更新（Leo 定）**：HangupConfig 加 `tiliCost: 1`（每场体力）+ `spawnCountRange: [1,6]`（NPC 刷新数量随机，越多收益/损耗越大） | Leo ✅ |
| 2026-08-20 | v1.4 | **Leo 拍板回填（来源 docs/80）**：① nameColor 统一朱砂（敌我区分，Boss 加深加粗）；② `spawnCountRange` 废弃 → 场景刷新改按玩家实战档位（R-06）；③ 新增 §3.4：战斗规模（1v多/敌方档位/Boss 带护卫）+ 玩家初始配置（野猫剑法/木剑/短褐/六维模板 B） | Leo ✅ |
