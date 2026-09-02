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

---

## 7. 返工工单交付（2026-09-02 下午 · 主架构技术验收 F1/F2/F3）

> 验收结论：有条件通过（F1 阻塞 + F2/F3 P1）· 本工单一次修复交付 · 出处：`docs/reviews/T15-T16-主架构技术验收报告.md`

### DoD 复核（返工后终态）

| 项 | 结果 |
|---|---|
| 三零 | ✅ typecheck 0 / lint **全仓 0**（T16 侧 unused vars 亦已清）/ build 0 |
| 全量 | ✅ **110/110**（原 85 + T16 render 23 + 本工单新增 2） |
| F1 用例 | ✅ 新增 2 it：轻功链路（selectSkill→跳跃快照→点格位移成功+isJump 真值）/ heroSkills+configId |

### F1 轻功交互链（阻塞项 · 已修）

- `snapshot()` selectedSkill 分支加轻功判断：`kind==='qingGong'` → `moveCells=jumpReachable(...)`、`moveKind='jump'`、`attackCells` 置空（types.ts BattleSnapshot 注释同步契约语义）
- 契约新增：`BattleSnapshot.moveKind: 'walk'|'jump'`（渲染金格换色）、`SnapshotActor.isJump: boolean`（移动 lerp 窗口内真值，渲染禁启发式猜——验收建议采纳）
- `submit(move)` 校验与快照显示一致：轻功激活态只受理跳跃格（防「显示金格可点绿格」错位）；未激活态仍=普通∪跳跃
- input 侧 `qing && inMove` 路径自然复活（读到的 moveCells 非空）；点格可达已由用例断言

### F2 heroSkills 契约化（P1 · 已修）

- `SkillButtonInfo`（id/label/disabled）升级进 types.ts 契约节；session `snapshot()` 产出 `heroSkills`（置灰=内力不足||冷却中||武器不匹配，会话真值 ~12 行）
- ui 侧 `BattleSnapshotExt` 过渡段由 T16 降级删除（其 render 消费同形结构零改；本次未触碰 ui/ 文件）

### F3 spriteKey 敌型区分（P1 · 已修）

- `SnapshotActor.configId?: string`：敌方=模板 name（依托 CombatantInput.name），玩家 undefined 走 hero 帧表
- 约定：敌方 `spriteKey === configId`；config 侧 `BATTLE_HEX_RES.spriteKinds` 对齐归 T16（未触碰）

### 契约变更连带适配（机械补字段，不动 T16 逻辑）

- `proto/battle_demo/mock_session.ts`：3×`isJump:false` + `moveKind:'walk'`（mock 无轻功激活态）
- `tests/battle-hex-render.test.ts`：3×`isJump:false` + `moveKind:'walk'`+`heroSkills:[]`（mock 快照工厂）

### 返工后文件增改清单

- `types.ts`：BattleSnapshot.moveKind/heroSkills、SnapshotActor.isJump/configId、SkillButtonInfo 契约节
- `systems/battle-session.ts`：snapshot() 轻功分支+heroSkills 产出+isJump/configId 真值；submit(move) 轻功态校验
- `tests/battle-session.test.ts`：+2 it（16 例）
- `proto/battle_demo/mock_session.ts`、`tests/battle-hex-render.test.ts`：契约字段机械适配（T16 物，仅补字段）

---

## 8. L 环反馈修复（2026-09-02 下午 · 四条全归 session 侧）

> 出处：L 环真机反馈 + `docs/reviews` 分轨派单（BE 三条 + 追加出生位置第④条）· 一次批次交付

### ① 普通移动穿模（C 案 A3 违反）· 已修
- **根因**：`moveCandidates()`/AI 第 4 级位移无条件并入 `jumpReachable` ——跳跃是二阶轻功主动能力，未激活态并入后普通移动可点跳跃格穿越单位占格（`reachable()` 本身的阻挡链无恙，hex.test 用例④「路径穿过单位占格→该格不可达」在库且绿）。
- **修复**：未激活态候选 = 纯普通可达；AI 位移同构去跳跃（AI 主动用跳留待 AI 技能决策卡）；`isJump` 仅轻功激活态为 true。

### ② 轻功第三跳退化普通移动 · 已修
- **根因**：`consumeTurn` 每次玩家行动无条件清 `selectedSkill`——连跳流第三跳时激活已丢，叠加①后未激活路径无跳跃格 → 表现退化。
- **修复**：轻功 =「移动姿态」sticky 态：行动后保留激活（攻击型技能照旧行动后清）；取消路径 = selectSkill 同 id toggle / cancelSkill / 战斗结束。用例：连续三跳全链（三跳全走跳跃格、激活持续、isJump 真值、toggle 取消）。

### ③ 行动条满点「特」偶发不重置 · 已修
- **根因**：特技冷却窗口（cd2）/内力不足期 `submit(attack)` 静默拒绝 → 行动条保持满（"偶发"=cd 窗口必现），非消费链遗漏。
- **修复**：不可用技能（冷却/内力/武器不匹配）降级普攻兜底（镜像 core `act()` 的 R-08/R-09 fallback 语义），行动必消费；射程外仍拒绝（走位是玩家决策）；未知技能 id 纯非法拒绝。用例：真施放→cd 窗口降级（fallback+basic+条重置差值断言）→内力 0 降级 ×2；射程外拒绝不消耗。

### ④ 出生位置"左侧中间"（追加单）· 已修
- **根因**：原子区在 offset 行号口径是下半（row 8..11），但平顶投影纵向 = `y=r+q/2`，offset 矩形投影为斜切平行四边形——我方带 y∈[8,12] 与敌方 [7,11] 交叠，玩家群视觉"偏左、垂直居中"。可动区锚定（4..11 居中）无误，错在子区未按投影分带。
- **修复**：出生带改投影分带选格——我方 = 可动区 `y≥10 且 q≤2`（视觉左下 8 格）、敌方 = `y≤8.5 且 q≥5`（右上 7 格 ≥ 敌上限 6）；**min(我方 y) > max(敌方 y)** 我方整带严格在屏下方。`SPAWN_SIZE` 死常量移除。用例：5 seed × 满编 6 敌投影分离断言 + 横向偏向（我方 q≤2/敌 q≥5）+ 不出可动区不重叠 + 同 seed 复现。

### DoD 终态
- 三零：typecheck 0 / lint 0 / build 0（全仓）
- 全量：**117/117**（110 + L 环新增用例净增；含 timeline② 敌血参数适配 L④新布局）
- 附记：本轮期间工作区曾短暂混入 FE 并行半成品导致 render 镜头用例红，FE 入库/回滚后自愈（25/25），非本侧缺陷；多窗口在途文件卷入提交前例再现（本侧改动被 534262d 顺带入库），入库归属以本回执文件清单为准。

---

## 9. 四钮统一 sticky（L 环追加交互口径）· 已修

- **口径**（Leo 明确）：特/绝/轻/毒点选可用即选中、行动后保留、可连续施放（每次点目标消耗一格条），**行动条重置（扣减后 <100）才清除选中**；同 id 再点=取消、异 id=切换；内力/冷却置灰不变。
- **实现**：`consumeTurn` 激活清理统一为「`c.bar < BAR.max` → 清 `selectedSkill`」——bar 无上限 clamp（镜像 core，等待期积多倍条），扣后仍 ≥100 = 未重置 → 选中保持可连放；轻功/攻击型完全同规则（原 L②「按技能类型区分」收敛为按条状态区分，更简且覆盖连跳场景：积条 ≥200 连跳不丢激活）。
- **用例**（+2，净增 119）：特技（cd0）选中→攒条 ≥200→连放两发选中保持（每发后条差值断言）→次发后条 <100 → 选中清除+attackCells 收回+两发 skill 事件齐全；轻功同规则回归（条重置选中清除）由三跳用例尾部+F1 链路尾部断言覆盖（三跳用例改为跳前攒条 ≥200，语义自洽）。

### DoD 终态
- 三零：typecheck 0 / lint 0 / build 0（全仓）
- 全量：**119/119**
- 本侧未入库改动：`systems/battle-session.ts`（sticky 统一）、`tests/battle-session.test.ts`（+2 例+三跳/F1 断言适配）；工作区其余改动（ui/、proto/、config/battle-hex.ts、assets/icons）属 FE/美术并行，勿混入本侧提交。
