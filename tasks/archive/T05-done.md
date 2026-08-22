# T05 交付回执 · 战斗核心（headless 纯逻辑）

> 交付：2026-08-21 21:05 · ZCode · 状态：待 C 环验收

## DoD 勾选

- [x] `npm run test:battle` 全绿：**14/14 用例**（需求表 #1~#6 逐条对应 + 类型/工厂，超出 ≥7 要求）
- [x] `npm run typecheck` 0 error（tsconfig include 已扩至 tests/，单测同样受检）
- [x] `npm run lint` 0 error ｜ `npm run build` 通过
- [x] 回执含模块划分 + 单测框架理由 + BattleLog 示例（见下）
- [x] 未触碰禁止区：未改公式数值 / 未做 UI / 未改 docs 与历史验收代码（T02 骨架零改动，仅 tsconfig include 加一行 tests）

## 文件清单

| 文件 | 变更 |
|---|---|
| `types.ts` | 追加战斗类型（WeaponType/SkillDef/CombatantInput/BattleLog/BattleResult/BattleConfig），T02 原类型未动 |
| `systems/battle-core.ts` | **新增**：runBattleHeadless 主入口 + rollEnemyCount(R-07) + fillRate(F-05) + stepManualTimeout(90s 状态机) + makeInitialPlayer(R-11) + makeEnemy |
| `tests/battle.test.ts` | **新增**：14 用例 |
| `package.json` | 加 devDep vitest + script `test:battle` |
| `tsconfig.json` | include 加 `tests/**/*.ts`（单测纳入类型检查） |

## 架构决策与理由

1. **单文件纯函数 `systems/battle-core.ts`**：与云端 settle 同构的本地纯函数（R-06 P1-3 拍板），不 import Canvas/wx.*，node 直接跑；接口即任务卡定死的 `runBattleHeadless(config): BattleResult`。
2. **单测框架选 vitest**：任务卡授权 vitest/jest 二选一；vitest 原生支持 TS 零配置、与现有 tsc/eslint 工具链无冲突、比 jest 轻量（无 jsdom/ts-jest 配置）。
3. **RNG 可注入（mulberry32 + seed）**：战斗含命中/暴击/敌方数量三类随机，注入种子使结果完全可复现，概率分布用例才能稳定断言（±5% 容差、2 万样本）。
4. **离散步进仿真（dt=0.05s，总时长上限 90s）**：F-05 行动条按秒填充，步进模型天然支持「满 100 即行动」与 90s 防死循环截断；事件级精确积分无必要（行动条无打断机制）。
5. **手动 90s 托管做成独立状态机 `stepManualTimeout`**：满足「超时状态转移」可单测；已接入主循环（manual 模式无人操作时触发），注：受 90s 总时长上限约束，实战中托管事件在 T06 接入玩家指令时钟后才有完整意义，状态机本身已独立验证。
6. **范围模型 = 武器形态 × 等级档位 → 曼哈顿半径**（R-05 + P2-11 距离度量）：剑/拳/棍/棒 [1,2,3]、鞭/刀 [3,4,5]、暗器 [4,6,9]，档位阈值 Lv 20/40/60。MVP 静止站位（F-06 移动后置），射程外行动记 `blocked`，死磕到 90s 走 hp 总量判定——正好是防死循环规则的真实场景。
7. **普攻射程**：取该武器下等级最高武功的档位（无匹配武功按档 1）。普攻自动寻敌=最近曼哈顿距离。
8. **伤害判定顺序**（F-04）：命中 → 闪避 → 暴击 → 破防保底（攻−防<0 取 1 再乘品阶/暴击，floor）。
9. **兜底日志双记录**：`fallback`（提示性，伤害 0）+ 紧跟 `basic`/`miss`（实际结算），UI 可按需取用其一。
10. **峨眉 +10% 未实现**：门派字段未进 MVP 输入结构，fillRate 处留注释钩子，属 F-05 公式的门派分支，待门派系统（模块 07）任务实现——未加未列功能。

## BattleLog 类型示例（实际运行输出）

```ts
{
  round: 3, t: 15.05, actorId: 'player', actorSide: 'player',
  action: 'skill', skillId: 'yemao-jianfa', targetId: 'enemy-0',
  damage: 52, crit: false
}
```

## 用例 ↔ 需求表对照

| 需求 # | 用例 |
|---|---|
| 1 行动条 | fillRate 公式断言 + 快慢单位出手顺序 |
| 2 R-07 档位 | 边界 99/100/10000 + 2 万样本概率分布（50/35/15、10/25/30/20/10/5） |
| 3 R-08/R-09 | 冷却 2 的技能 3 次行动后恢复；内力耗尽降级普攻 |
| 4 R-05 射程 | 暗器 Lv60 射程 9 可及 / 距离 13 阻挡；Lv10 低档射程 4 打不到距离 9 |
| 5 超时 | 状态机 90s trust → 180s switchAuto；自动模式无超时事件 |
| 6 玩家初始 | makeInitialPlayer：100 血/0 内力/119 攻/70 防/野猫剑法，全程仅普攻 |
| 7 类型 | BattleLog 字段完整性断言（typecheck 亦覆盖） |
| 8 胜负 | 全灭 annihilate / 90s timeout-hp / hp 平判玩家负 / 玩家阵亡判负 |
