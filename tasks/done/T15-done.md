# T15 交付回执 · 战斗 hex 核心适配层 + 对局编排（backend · T-B1）

> 交付：2026-09-02 · 执行：backend 代理 · 状态：**待 C 环技术验收**
> 依据：任务卡 `tasks/inbox/T15.md`（需求表 6 项）+ 主架构方案 §3/§4.2 + PM 答疑批复（Q1~Q7 全批 + O1 定版）

## 1. DoD 逐项

| # | DoD 项 | 结果 |
|---|---|---|
| 1 | 三零（typecheck/lint/build） | ✅ typecheck 0 / build 0 / **本卡文件 lint 0**（全局 lint 仅剩 2 error，均来自 T16 并行施工文件 `ui/battle-hex-render.ts` untracked 半成品——非本卡引入，按「不动无关代码」未越界修复，定位见 §6） |
| 2 | 既有用例不回归 | ✅ `battle 14/14` + 全量 `85/85`（scene 16 / battle-ui 21 / npc 8 / 新增 26） |
| 3 | 新增用例 ≥12 | ✅ **26 例**：hex 9 + session 14 + 时间线 3（清单见 §4） |
| 4 | node 全流程对局时间线 ×3 | ✅ 自动 / 手动脚本 / 托管（`tests/battle-hex-timeline.test.ts`，vitest node 环境，T06 runAuto 先例模式） |
| 5 | 文件清单 + 架构决策说明 + 任务箱三同步 | ✅ 本回执 §5/§3 + threads/LOG/box.db 已同步 |

## 2. Q2 放行 diff（battle-core · 仅 export 级，commit 请注明「主架构方案 §3.1 抽取导出先例」）

```diff
--- a/systems/battle-core.ts
-const TOTAL_TIME_LIMIT_S = 90; // F-05 防死循环：战斗总时长 90s
+export const TOTAL_TIME_LIMIT_S = 90;   // +3 行注释（T15/Q2 批复出处）
-/** 普攻射程：取该武器下等级最高武功的档位（无匹配武功按档 1） */
-function basicRange(c: CombatantInput): number {
+/** 同上 +2 行注释 */
+export function basicRange(c: CombatantInput): number {
```
函数体/数值零改动；改动后首跑 `battle.test.ts` 14/14 全绿留证。

## 3. 架构决策说明（陌生架构师审读入口）

1. **session 不走 `runBattleHeadless`**：那是方格挂机引擎（归 `systems/battle.ts`）。battle-session 是 hex 战棋独立循环，仅消费 core 导出面（fillRate/skillRange/basicRange/resolveAction/stepManualTimeout/makeRng/rollEnemyCount/makeEnemy/常量）——结算唯一真值不迁移。
2. **Q1 适配（批复执行）**：`doAttack()` 调 `resolveAction` 前临时对齐双方 `pos`、finally 恢复。原因：core 普攻分支用 offset 曼哈顿复核射程，odd-r 下 hex 相邻格曼哈顿可达 2（拳射程 1 → 误判 blocked，全游戏最高频路径）；pos 不参与 F-01/F-04 计算、不被 core 修改，故对齐零行为风险。行为锚点用例：session 测试「Q1 锚点」it。
3. **R-08 冷却递减时序**：session 自带 `tickCooldowns`，严格镜像 core act() 顺序「选招读 → 递减 → resolveAction 写新值」；若先递减，当回合新设冷却被吞 1，cd=N 可用节奏整体偏移一回合（用例覆盖）。
4. **等待期冻结总时钟（T06 已验口径继承）**：手动等待玩家输入期间 `t` 不推进——90s 防死循环不烧玩家思考时间；托管 idleSec 由 core `stepManualTimeout` 独立累计，trust/switchAuto 真实可达（timeline③ 断言 trust.t < 15s）。
5. **90s 尾判**：session 用 core 导出的 `TOTAL_TIME_LIMIT_S`，hp 总量高者胜/同量判玩家负（镜像 core，rules 注释指向 F-05）。
6. **O3 出生（Q6 批复）**：单 rng 流 seed 派生，消费顺序固定 = 我方洗牌取 1 → 敌区洗牌取前 n（≤6 < 16 格不重叠可证）→ 战斗掷骰；同 seed 布局/事件流全等（用例覆盖）。
7. **锥形轴（Q4 批复）**：runner 内部 `hexFacing`（六向单位向量，移动/攻击方向更新、出生朝最近敌）；快照仅暴露 left/right 立绘向。出招校验 `inCone` 与高亮 `rangeCells('cone')` 同几何（hex 用例逐格一致性断言）。
8. **几何常量本地导出（Q7 批复）**：`MAP_SIZE/FIELD_MIN/FIELD_MAX/SPAWN_SIZE/ANIM_MS` 在 battle-session.ts 导出；`config/battle-hex.ts` 归 FE 卡（T16 已建，未触碰）。`BAR.max/SPEED_FACTOR` 复用 `config/battle.ts`（T06 同源，不重复定义数值）。
9. **归属勘误**：M0-M1 产物曾被主会话 `ed7facf`（docs 提交）顺带入库，内容无损；本次交付未擅自 commit（多窗口并行，建议主会话统一入库后注明任务号）。

## 4. 新增用例清单（26 ≥ 12）

**tests/hex.test.ts（9）**：①换算往返（16×16 恒等+odd-r 定式）②六邻接 ③cube 距离（手算/对称）④BFS 可达（空场 18/单格阻挡 16/整墙切割 11）+F-06 移动力四态 ⑤跳跃（⌊power/2⌋/围死穿越/落点排除/power≤1）⑥三形态（circle 6/18、ray 12+空隙、cone 9+扇区边界+inCone 逐格一致）

**tests/battle-session.test.ts（14）**：⑦行动条满触发与轮转 ⑧O1 预算二选一（移动后 attack/move 双拒、次回合恢复）⑨**Q1 锚点**（hex 相邻+曼哈顿 2 普攻不被误判 blocked）⑩selectSkill 激活态（不耗预算/attackCells/取消）⑪AI 倍率序（grade 1.7 压数组序）⑫R-08 cd2 节奏（skill→2 冷却回合→复现）⑬AI 位移首行动 ⑭托管双阈值（trust→switch-auto+冻结时钟）⑮⑯事件流全等（自动双场+异 seed 不同 / 手动脚本双场）⑰assembleRoster 薄转发 ⑱歼灭/玩家亡/逃跑三终局 ⑲90s hp 判（高胜/低负/同量玩家负）⑳O3 出生区四 seed 回归+同 seed 布局复现

**tests/battle-hex-timeline.test.ts（3）**：㉑自动一场（bar-max 首帧→位移→出手→终局，≤90s）㉒手动脚本一场（move/attack 受理数=事件数+同脚本全等）㉓托管一场（trust→switch-auto→终局链路次序）

## 5. 交付文件清单（均为绝对路径）

| 文件 | 性质 |
|---|---|
| `/Users/leochen/WorkBuddy/Claw/placement-wuxia/systems/hex.ts` | 新建 · 六边形数学纯函数（换算/邻接/cube 距离/F-06/BFS/跳跃/三形态/武器→形态映射；支持场界谓词） |
| `/Users/leochen/WorkBuddy/Claw/placement-wuxia/systems/battle-session.ts` | 新建 · 对局编排（tick/轮转/O1 预算/移动/出招/AI 五级/托管/快照/事件流/O3 出生） |
| `/Users/leochen/WorkBuddy/Claw/placement-wuxia/types.ts` | 追加 T15 契约节（HexPos/SnapshotActor/BattleSnapshotPhase/BattleSnapshot/ActionRequest；phase 去 deploy=Q3 批复） |
| `/Users/leochen/WorkBuddy/Claw/placement-wuxia/systems/battle-core.ts` | 仅 2 处 export + 注释（§2 diff） |
| `/Users/leochen/WorkBuddy/Claw/placement-wuxia/tests/hex.test.ts` | 新建 · 9 例 |
| `/Users/leochen/WorkBuddy/Claw/placement-wuxia/tests/battle-session.test.ts` | 新建 · 14 例 |
| `/Users/leochen/WorkBuddy/Claw/placement-wuxia/tests/battle-hex-timeline.test.ts` | 新建 · 3 例 |

禁区审计：未改 `systems/battle-ui.ts`、`systems/battle.ts`、`config/*`、ui/ 全部；渲染层零依赖本卡（渲染 import core 的红线检查归 T16 DoD）。

## 6. 移交事项

- 全局 lint 剩余 2 error 在 `ui/battle-hex-render.ts`（T16 未用导入 CTRL_BUTTONS/PLAQUE_BUTTONS）——T16 收尾自清即可，本卡不越界。
- `ed7facf` 已包含 M0-M1 时点快照；主会话入库本卡终稿时建议 commit message 注明「T15 · hex 适配层+对局编排 · §3.1 抽取导出先例」。
- FE 对切（方案 M2 里程碑）：FE 拿 `snapshot()/submit()/events` 三口即可 mock→真切换；`_debug` 仅供测试，非渲染契约。
