# NPC 配置系统（数据驱动 · 含内容编辑器体系第一件）

> 分类：02-主线玩法 · 状态：🟢 **Schema v1.0 定稿**（2026-09-02 Leo 四点确认：四类可扩展/固定问候语/家场景战斗 NPC 首个落地/敌对与战斗敌人合一）· 优先级：P0
> 定位：内容编辑器体系（PROJECT-MEMORY §6）第一件——**NPC = 一个数据包**，新增 NPC = 放配置+素材进目录，零代码改动
> 关联：`角色帧规范.md`（战斗帧素材）、`战斗规则C案.md`+`战斗界面接入技术方案.md`（T15/T16 消费方）、`经济与掉落`（掉落表）

---

## 1. 设计原则（Leo 确认口径）

1. **数据驱动**：NPC 的素材/对话/战斗/掉落/位置全部在配置文件中，运行时零硬编码
2. **四类可扩展**：`type = functional（功能）/ quest（任务）/ enemy（敌对）/ ambient（氛围）`；未知类型加载器降级为 ambient 并报警，后续可扩（同伴等）
3. **合一原则**：敌对 NPC 的 `battle` 段 = 战斗敌人配置本体（武功/装备/数值），T15 战斗会话的数据源未来由此提供；MVP 先以示例 NPC 走通
4. **静态驻留**：NPC 战斗外不动（单帧静止，Leo 定），**无巡逻/追击 AI**；敌对 NPC 触发战斗方式 = **玩家点击**（MVP；追击等行为后置）
5. **对话薄启动**：固定问候语单条（战斗 NPC 的"问候"=触发战斗时的喊话），任务机制落地后再拓展 topics/分支
6. **外置铁律**：素材引用一律配置表相对路径（资源管理器统一加载），禁代码硬编码

## 2. 目录约定

```
assets/npcs/<npc_id>/
├── npc.json            # 全量配置（单一真源）
└── (素材可内嵌本目录或引用全局素材库统一路径)
```

## 3. Schema 字段定义（v1.0）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✓ | 全局唯一（=目录名） |
| `name` | string | ✓ | 显示名 |
| `type` | enum | ✓ | functional / quest / enemy / ambient（可扩展；未知值降级 ambient+报警） |
| `visual.portrait` | string/null | – | 对话立绘路径（敌对 MVP 可 null） |
| `visual.idle_frame` | string | ✓ | 战斗外静止帧（单帧；规格见角色帧规范） |
| `visual.battle_frames` | string/null | – | 敌对：战斗帧组目录（角色帧规范命名，含 battle_idle/atk/hit/die） |
| `visual.scale` | number | ✓ | 渲染缩放（默认 1.0） |
| `spawn[]` | array | ✓ | 出现位置：`{ scene, x, y, facing }`（x/y=场景百分比坐标，facing=down/up/left/right） |
| `dialogue.greeting` | string | ✓ | 固定问候语（敌对=触发战斗喊话）；`topics` 预留 [] |
| `battle.enabled` | bool | – | 敌对=true |
| `battle.trigger` | enum | – | `click`（MVP 唯一值；预留 touch/proximity） |
| `battle.unit` | object | – | **战斗单位配置本体**：level/stats/skills[]/equipment[]（=T15 会话数据源，合一原则） |
| `drops.enabled` | bool | – | |
| `drops.table[]` | array | – | `{ item, chance }` 掉落表（MVP 内嵌；后期引用全局掉落库） |
| `functions` | object | – | 功能 NPC 专属（shop/forge 等，引用子配置） |

## 4. 首个示例：家场景战斗 NPC（MVP 验收件）

```jsonc
// assets/npcs/bandit_home_test/npc.json
{
  "id": "bandit_home_test",
  "name": "山贼细作",
  "type": "enemy",
  "visual": {
    "portrait": null,
    "idle_frame": "characters/enemy/shanzei_a/battle_idle_down.png",
    "battle_frames": "characters/enemy/shanzei_a/",
    "scale": 1.0
  },
  "spawn": [{ "scene": "home", "x": 0.62, "y": 0.40, "facing": "down" }],
  "dialogue": { "greeting": "大胆！竟敢摸到此处，接招！", "topics": [] },
  "battle": {
    "enabled": true,
    "trigger": "click",
    "unit": {
      "level": 3,
      "stats": { "maxHp": 120, "atk": 18, "def": 8, "spd": 9 },
      "skills": ["skill_basic_slash"],
      "equipment": ["eq_shanzei_dao"]
    }
  },
  "drops": {
    "enabled": true,
    "table": [
      { "item": "mat_ore", "chance": 0.5 },
      { "item": "eq_shanzei_dao", "chance": 0.1 }
    ]
  },
  "functions": {}
}
```

## 5. 运行时约定（研发窗口 · T17）

| 项 | 约定 |
|---|---|
| 加载器 | 启动时扫描 `assets/npcs/*/npc.json`，schema 校验（缺字段/未知 type 报警降级） |
| 渲染 | 按 spawn 挂到场景：功能/任务/氛围=静止帧+点击弹问候；敌对=静止帧+点击弹喊话→进入战斗（调 T15 会话，battle.unit 传参） |
| 触发 | click 命中 NPC 判定盒 → 敌对：喊话气泡 0.8s → battle transition |
| 接口 | npc.json 不直接进 battle-core——由 T15 会话层转成 unit 配置（NPC 配置=数据源，battle-core 无感知） |

## 6. 拓展路线（非 MVP）

对话分支与任务条件（dialogue.topics 激活）→ 追击/巡逻行为（ambient 行为扩展）→ 入队同伴（第五类）→ 可视化编辑器 UI（内容编辑器体系后台）

## 7. MVP 验收标准

家场景出现「山贼细作」（按 spawn 坐标静止）→ 点击 → 喊话 → 进入战斗 → 胜利结算掉落（矿 50%/刀 10%）→ 全程零硬编码（改 json 的 name/坐标/掉落，游戏内即变）。

## 更新记录

| 日期 | 变更 | 签字 |
|---|---|---|
| 2026-09-02 | 创建：Schema v1.0（四类/合一/静态驻留/点击触发）+ 首个战斗 NPC 示例 | ZCode（Leo 四点确认） |
