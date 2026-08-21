# 放置武侠 · 模块 03：NPC 系统

> 状态：**规格草稿（待 Leo 审）**
> 日期：2026-08-19
> 定位：**场景系统的二级系统**——NPC 配置驱动：散布 / 随机走动 / 主动或被动攻击 / 点它开战 / 外观一致性。
> 前置：模块 02（场景系统）已验收；完整依赖关系见 `modules/00-系统总览.md` §2
> 依赖：**02 场景**（容器/坐标系）、**05 人物属性**（受击/战斗伤害结算）、`config/场景与NPC配置.md`（NPC 配置表）、`config/公式与数值总览.md`（F-01 伤害公式）
> 实现方式：直接代码绘制（Canvas），AI 生图只供 NPC 立绘素材

---

## 0. 模块目标

**跑通 NPC 系统**：场景中按配置散布 2~3 个战斗 NPC，随机走动、主动攻击（或被动）、点它开战、被击败消失。**每种 NPC 的外观/装备/武功必须与配置严格对应**。

**验收标准：** 打开江湖 Tab 能看到——场景里 3 个 NPC 在随机走动；角色走近主动型 NPC 触发追逐；点击 NPC 弹出「进入战斗」→ 切模块 01 战斗界面（对手=该 NPC 配置）；击败后 NPC 消失。**每种 NPC 立绘肉眼可区分，战斗界面中 NPC 的装备图标/武功与其配置一致。**

---

## 1. 数据结构

### 1.1 实例态（运行中的 NPC）
```
interface SceneNPC {
  id: string
  npcId: string        // 引用 NpcConfig
  type: 'mob' | 'boss'
  x: number            // 逻辑坐标 0~1
  y: number
  hp: number
  maxHp: number
  state: 'wander' | 'chase' | 'dead'
  wanderTarget: { x, y }   // 随机走动目标
  wanderTimer: number      // 下一次随机走动计时
}
```

### 1.2 静态配置（每种 NPC 一份，NpcConfig）
```
interface NpcConfig {
  id: string                  // 'npc-shanzei'
  type: 'mob' | 'boss'
  name: string                // 山贼喽啰
  appearance: NpcAppearance   // ★ 外观（UI 立绘，必须对得上配置）
  hp: number                  // 气血（63 §2.2：档位1 山贼 300）
  attack: number              // 攻击（63 §2.2：30）
  defense: number             // 防御（63 §2.2：15）
  speed: number               // 行动速度（63 §2.2：100）
  skills: string[]            // ★ 装配武功列表（战斗出招用）
  equipment: NpcEquipment[]   // ★ 装配装备列表（外观/战斗属性）
  aggro: 'active' | 'passive' // 主动攻击（靠近即打）or 被动（点它才打）
  aggroRange: number          // 主动攻击检测半径（逻辑坐标 0~1）
  reward: DropReward          // 击杀掉落/产出
}

// ★ 外观：UI 呈现的一切来源
interface NpcAppearance {
  sprite: string              // 立绘素材路径（每种 NPC 独立立绘）
  scale: number               // 渲染缩放（Boss 更大，如 1.3）
  nameColor: string           // 名字标签色（普通怪淡金/Boss 朱砂）
  aura: 'none' | 'boss'       // 气场特效（Boss 带光晕/暗影）
}

// ★ 装配装备：与装备系统对齐（itemId 引用装备配置）
interface NpcEquipment {
  itemId: string              // 装备 ID
  slot: string                // 部位（武器/护甲…）
  icon: string                // 装备图标（外观显示）
}

interface DropReward {
  xuedian: number      // 击杀学点
  shizhan: number      // 击杀实战
  yinliang: number     // 击杀银两
  dropTable: { itemId: string; weight: number }[]  // 装备掉落表（63 §4.1 品质概率）
}
```

> **⚠ 一致性铁律（Leo 2026-08-19 定）**：NPC 的 **UI 外观 / 装配装备 / 装配武功必须与配置严格对应**——立绘、装备图标、武功招式都从 NpcConfig 读取，**禁止"名字不同但长得一样"**。

---

## 2. 行为规则

- **随机走动**：每 3~5 秒（wanderTimer）随机选一个附近点 → 走过去 → 停留再走（循环）
- **主动攻击**（aggro='active'）：若角色进入 aggroRange → `state='chase'` 靠近角色；贴近后触发战斗（战斗交模块 01）
- **被动攻击**（aggro='passive'）：不主动追，只在角色点它时开战
- **被击败**：hp ≤ 0 → `state='dead'` → 从场景消失（不刷新、不残留）
- **点它开战**（手动模式）：点击 NPC → 弹出「进入战斗」确认 → 切模块 01 战斗界面（对手=该 NPC 配置）

---

## 3. 渲染（必须按配置）

- **外观**：立绘 = `appearance.sprite`（每种 NPC 独立立绘），Boss 按 `scale` 放大 + `aura='boss'` 光晕
- **名字标签**：`appearance.nameColor`（普通怪淡金/Boss 朱砂）+ 头顶小血条（红色渐变，宽度 40px）
- **装配外观**：战斗界面中 NPC 使用的装备图标 = `equipment[].icon`
- **武功表现**：战斗中出招名/招式特效 = `skills[]`（配置驱动，非写死）
- Boss 与普通怪视觉区分（独立立绘 + 大小 + 气场）

---

## 4. NPC 布点（场景配置消费）

- NPC 由场景配置 `SceneConfig.npcs` 决定（模块 02 定义）
```
interface NpcSpawn {
  npcId: string          // 引用 NpcConfig
  x: number              // 出生位置 0~1
  y: number
  count: number          // 同类型怪数量（如野狼×2）
}
```
- 本模块实现"读配置 → 生成 SceneNPC 实例 → 放入场景"

---

## 5. 代码结构

```
project/
├── systems/
│   └── npc.ts          # NPC 系统：读配置生成实例/随机走动/追击/开战触发/死亡消失
├── render.ts           # +NPC 外观渲染（立绘/血条/名字/气场）
├── config/
│   └── npcs.ts         # NPC 配置表（NpcConfig 全量数据）
└── net/cloud.ts        # 云函数封装（本模块可先 mock）
```

---

## 6. 测试要求

- 能跑：微信开发者工具 / 浏览器
- 观察：① 3 个 NPC 按配置散布；② 随机走动；③ 走近主动型触发追逐；④ 点被动型只在他被点时开战；⑤ 点 NPC 弹出「进入战斗」并切到战斗界面；⑥ 击败后消失
- **一致性检查（Leo 铁律）**：⑦ 每种 NPC 立绘肉眼可区分；⑧ 战斗界面中 NPC 装备图标/武功招式与其 NpcConfig 一致（如山贼用"破旧砍刀"+"基础刀法"）；⑨ Boss 独立立绘+放大+气场
- 边界：NPC 全部击败后场景只剩角色；NPC 不能移出场景边界

---

## 7. 变更记录

| 日期 | 版本 | 变更 | 签字 |
|---|---|---|---|
| 2026-08-19 | v1 | 创建：NPC 系统（从原"江湖主场景"拆出）——数据结构/行为/渲染/一致性铁律/代码结构 | 待审 |
| 2026-08-19 | v1.1 | 依赖补全：02 场景（容器）+ 05 人物属性（伤害结算）+ config 配置表/公式总览 | 待审 |
