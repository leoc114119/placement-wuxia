# T20-BE · 战斗格子施放后端（cast 契约 + session 空放结算）

> **状态：📤 已发单待领** · 优先级：P0 · 发单：2026-09-03 ZCode PM（研发管线窗口）
> **执行者：backend 子智能体（授权文件清单见 §4，严格限内）**
> 依据：《战斗格子施放与热区修复方案-v0.1》（`docs/design/03-战斗系统/`，**本卡需求表 = §3.1/§3.2/§五/§六-BE 中间门逐条**，Leo 六条放行 09-03）；行为真源=《战斗交互行为规格》v2.1（ATK-2/ATK-6/ATK-7/SEL-5②）
> 关联：T20-FE（后行卡，本卡合流后才开工；四门终验在彼卡）

## 1. 批次口径（唯一口径）

| 项 | 定版 |
|---|---|
| 本卡（二批 BE） | types.ts cast 契约变体 + session cast 分支（含 ATK-6 空放资源镜像）+ 主套件新例；**中间门验收**（§6） |
| 不在本卡 | input 派发/D-13/红名单重写/e2e（全归 T20-FE）；battle-core 零改动（空放不调 resolveAction，session 镜像）；普攻态/轻功态/ATK-1 零变化 |
| 已批口径（不再开放） | 空放=合法施放资源全扣（内力+冷却+bar）；格为结算对象（格上逻辑敌=伤害/无敌=空放）；空放照播 charge 演出+faceToward 目标格；自己格=可施放格（特判并联，不入 legalCells/高亮）；cast 射程外=rejected(range) |

## 2. 需求表（唯一真相；与方案条文冲突时以方案原文为准并立即上报 PM）

| # | 需求 | 方案依据 | 验收口径 |
|---|---|---|---|
| 1 | **契约**：types.ts `ActionRequest` 新增 `{type:'cast'; to: HexPos; skillId: string}`（**唯一变更**）；attack 变体原样不动；事件/快照类型零新增（空放事件复用 `skill`：无 targetId 无 damage） | §3.1 | typecheck 0；mock_session 不碰而 default 兜底不破 |
| 2 | **session cast 分支单点插入**（submit，既有分支零改写）：选中态门（无选中/qing/陈旧 skillId→rejected(invalid)）→ 四查（R-05 武器匹配/冷却 0/内力足/射程源=`selection.legalCells` 与快照同源+**自己格特判并联**）→ `tickCooldowns` 调用位与 attack 分支同位（四查后、结算前）→ 格上有存活敌=`doAttack` 既有路径（resolveAction+skill/miss 事件）→ 空放=**资源镜像三件**（neili −NEILI_COST_PER_CAST、冷却按 core:246 条件式 `cooldownTurns>0` 写初值、commitTurn 清 bar+清选中）+`setAnim('charge')`+`faceToward(req.to)`+emit `skill` 事件（无 targetId 无 damage）→ `commitTurn` | §3.2 | 新例 b/c/d/e 逐项绿（§3 行 3）；空放与对敌施放资源终态**四项全等**（neili/冷却/bar/选中） |
| 3 | **主套件新例最小集 a-g**：a) `[ATK-2 对格]` cast 有敌格=skill/miss 事件+伤害+资源终态 b) `[ATK-6]` 空放四项终态+无伤害+事件尾 skill 无 targetId c) `[ATK-6]` cast 射程外→rejected(range) d) `[ATK-6/Q2]` cast 自己格=空放语义 e) `[ATK-7]` cast 无逻辑敌格=空放（敌 hp 不变）f) `[ATK-2]` 四查拒绝变体（武器/冷却/内力，选中保持）g) attack 分支回归哨（既有 ATK-2 绿锁原样绿，**一行不改**） | §八 BE 表 | 全绿；命名带条目编号沿 battle-session.test.ts 惯例 |
| 4 | **施工顺序**：契约 diff → 用例清单（DoR，见 §3）→ cast 分支 → 新例 → 中间门自检 | §八 | 按 §3-DoR 顺序，PM 确认后才写实现 |

## 3. 领单第一交付（DoR=契约冻结节点，先交后码）

未获 PM「✅确认开工」前禁止写实现：
1. 四门基线+三零复跑原文（主套件 157 绿 14 跳/行为 2 红 12 绿/shot 16 PASS/e2e 4 MATCH/DBG=0/tsc+lint 0）——不符即停。
2. 口径逐条复述（§1+需求表 4 行），疑义清单（无则写「无」）。
3. **cast 变体 diff**（types.ts 一处，代码稿贴出）。
4. 完整用例清单（a-g 展开到断言级）。
5. 由用例自行总结的易错点（与方案 §七 BE 侧 1-10 条互补，禁照抄）。

## 4. 授权文件清单（仅限）

- `types.ts`（仅 ActionRequest 新增 cast 变体）
- `systems/battle-session.ts`（仅 cast 分支单点插入）
- `tests/battle-session.test.ts`（新增用例）
- 🚫 **禁碰**：`battle-core.ts` 零改动；attack 分支一行不动；`mock_session.ts`/`main.ts`/`ui/`/`config/` 零触碰；事件与快照类型零新增；数值零新增（禁用 SkillDef.neiliCost 走 NEILI_COST_PER_CAST 视图值）

## 5. 易错点对照

方案 §七 BE 侧 1-10 条为架构层清单，领单后由自己用例另行总结互补；两份施工中逐条自查。

## 6. DoD（BE 中间门）

1. 主套件全绿（157+新增，登记新基线数）；行为面 **2 红保持**（input 未动，N2-①②在列）；shot 16/16；behavior_e2e 4 MATCH 保持（BE2/BE3 预期红实红）；DBG=0 保持。
2. typecheck/lint 0 error（三零）。
3. 文件清单+架构决策说明+红线自查（§4 禁碰项零触碰）。
4. commit 显式文件清单，**不 push**，停等 PM 中间门复验。
5. 回执写 `tasks/回执总表.md`；threads/LOG 由 PM 登记。

## 更新记录

| 日期 | 变更 | 签字 |
|---|---|---|
| 2026-09-03 | 创建：方案 §八拆单 BE 卡（契约冻结 DoR），Leo 六条放行后发单 | ZCode PM |
