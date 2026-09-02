# 武功数据 Schema

> 分类：04-武学设定 · 状态：🔶骨架 v0.1（2026-09-02，T10 排雷 P0-2 填充）· 优先级：P0 · 审核方：研发窗口（落 types.ts）
> 来源：11-武功数据表（旧表待对照迁移）· `types.ts SkillDef`（战斗侧现状，14 用例背书）· 回合分配 §六（学点经济）
> 原则：**战斗侧字段以 SkillDef 现状为准零改动消费**；本 schema 只补**表现层/养成层/战棋装配**字段，全部为新增可选字段（向后兼容）

---

## 1. 字段定义（四层）

### 1.1 战斗层（已有 · SkillDef 现状，勿动）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 全局唯一（如 `yemao-jianfa`） |
| `name` | string | 显示名 |
| `kind` | enum | waiGong 外功 / neiGong 内功 / qingGong 轻功 / …（SkillKind） |
| `weapon` | WeaponType/null | 匹配武器；null=空手可用；不匹配无法出招（R-05） |
| `grade` | number | 品阶伤害系数（F-01） |
| `growth` | number | 成长系数（F-02） |
| `level` | number | 当前等级（Lv 20/40/60 射程档位，R-05） |
| `cooldownTurns` | number | 冷却回合（R-08） |
| `neiliCost` | number | 内力消耗（R-09：一阶 20/二阶 50/三阶 100/绝学 150） |

### 1.2 战棋装配层（新增 · 原占位"需增战棋字段(移动力等)"落地）

| 字段 | 类型 | 说明 |
|---|---|---|
| `movBonus` | number/null | **轻功类装配移动力加成**（F-06：一阶+1/二阶+2，与⌊等级/5⌋叠加）；非轻功为 null |
| `jumpUnlock` | bool | 二阶轻功解锁跳跃（范围/2 可穿越，C 案 A3） |

### 1.3 表现层（新增 · T16 渲染消费）

| 字段 | 类型 | 说明 |
|---|---|---|
| `icon` | string | 技能图标资源键（特绝轻毒四钮/技能面板；淡金族） |
| `desc` | string | 武功描述文案 |
| `castAnim` | string | 施法动画模板引用（L6 fx 四段时序模板 key；默认按 weapon 推导） |
| `rangeShape` | enum | circle / line 六向射线 / cone120（O2 裁决；可由 weapon 推导，显式字段留覆盖口） |
| `sfx` | string/null | 音效引用（BGM 拍板后启用） |

### 1.4 养成层（新增 · 学武/际遇系统消费）

| 字段 | 类型 | 说明 |
|---|---|---|
| `tier` | enum | 一阶/二阶/三阶/绝学（neiliCost 基准与稀有度；与 grade 系数分离） |
| `learn` | object | `{ mode: 'xuedian' \| 'selfcult', xuedianCost, silverCost }`——学点速成（普通/门派武学）vs 纯自修（特技/绝学禁速成，回合分配 §六） |
| `source` | enum | shimen 师门 / jiyu 际遇 / zixiu 自修 / chest 开箱 |
| `weaponReq` | WeaponType/null | 学习所需武器类型 |

## 2. 示例（野猫剑法补全后）

```jsonc
{
  "id": "yemao-jianfa", "name": "野猫剑法", "kind": "waiGong",
  "weapon": "sword", "grade": 0.5, "growth": 1.5, "level": 10,
  "cooldownTurns": 0, "neiliCost": 10,
  // —— 新增层 ——
  "movBonus": null, "jumpUnlock": false,
  "tier": "tier1",
  "icon": "skills/yemao_jianfa.png",
  "desc": "门派入门剑法，一阶外功。",
  "castAnim": "fx_slash_basic", "rangeShape": "circle",
  "learn": { "mode": "xuedian", "xuedianCost": 100, "silverCost": 500 },
  "source": "shimen", "weaponReq": "sword"
}
```

轻功示例差异：`kind: "qingGong", movBonus: 1, jumpUnlock: false`（一阶）→ 升二阶 `movBonus: 2, jumpUnlock: true`。

## 3. 与既有体系的接口

| 接口 | 说明 |
|---|---|
| 特绝轻毒四钮 | 主角装配的 tier=特技/绝学/轻功/毒功 各取一 → 战斗待机头顶弹出（v8 §1） |
| 学点经济 | `learn` 段接回合分配 §六（剿匪/木人巷产学点；特绝纯自修） |
| 绝学条件 | 福缘参与绝学获取条件（09-02 Leo 收窄口径）；C(6,2) 配对按战斗六维（福缘不入） |
| T16 渲染 | `icon`/`castAnim`/`rangeShape` 三字段即渲染所需全集 |
| 11-武功数据表 | 旧表条目按本 schema 迁移（对照项：movBonus/jumpUnlock 为迁移新增字段） |

## 更新记录

| 日期 | 变更 | 签字 |
|---|---|---|
| 2026-08-31 | 建骨架（管线重构：分类文档夹制） | 游承峰 |
| 2026-09-02 | **v0.1 填充（T10 排雷 P0-2）**：四层字段（战斗=SkillDef 现状/战棋装配 movBonus+jumpUnlock/表现/养成）+ 野猫剑法示例；待研发窗口审落 types.ts | ZCode |
