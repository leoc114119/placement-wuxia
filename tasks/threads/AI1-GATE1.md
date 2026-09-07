# AI-1 / GATE-1 规格 v2.4 修正卡（backend 直通线单卡 · 施工与回执）

> 派发：2026-09-05 Leo（backend 直通窗口，backend 单卡两条）。真源＝`docs/design/03-战斗系统/战斗交互行为规格.md` v2.4 新增两行 AI-1 / GATE-1（Leo 裁决体检 Q01/Q03 落文）；取证＝`docs/reviews/全仓代码体检-主架构-Codex-v1.md` Q01/Q03 两节。
> 授权清单：`systems/battle-session.ts`、`tests/battle-session.test.ts`、`types.ts`（reason 联合加 `'mode'` 一行，**Leo 09-05 直通窗口裁决放行，红线豁免随卡留痕**）。红线：battle-core / hex / battle-input / config / ui / proto 源码零碰。
> 并行卡处置：开工时 `systems/battle-session.ts` 曾有防御加固卡（A01-A03）未提交改动——本卡只做本卡语义改动叠加、diff 最小；施工中途防御卡（a3e6329）与渲染输入加固卡（6633cd0）已先后入库，session 工作区转干净，本卡 diff 纯净无夹带。

## 一、修正对表（两条 → 落点）

| 条目 | 体检取证 | 本卡落点 | 状态 |
|---|---|---|---|
| AI-1 AI 射形同规则 | `battle-session.ts:519` targetInRange 对 ray 只判 cube 距离（无形状分支），`:540` planSkill（AI 出技过滤）消费——「AI 打得到玩家打不到」格子分野 | planSkill 逐技过滤改为与玩家 activate（:324）**完全同源**：`rangeCells(actor.hex, shape, n, actor.hexFacing, inField)` 产格集合 + `foesOf.filter(cells.some(hexEq))` 成员判定。circle/cone 与旧判定数学等价，ray 收紧即全部行为变更；SP-2 双场同函数同参 → 射程集合必然全等 | ✅ |
| GATE-1 selectSkill 入口门 | `submit` 的 selectSkill 分支（:715）在 pendingInputNow 共享门（:723）之前直通 activate——条未满/auto 可静默激活 | selectSkill 分支入口加门：`!pendingInputNow()` → `rejected(reason= mode==='manual' ? 'bar' : 'mode')` + return false，禁静默激活。reason 分派口径：**mode=资格层优先**（非手动即无输入态资格，无论条态）；「我方存活」在 manual 下不可达为假（dead 即 checkEnd 置 lost、被上方 phase 门拦截），不单列 reason。attack.skillId 兼容入口保留不动（Leo 裁定）；UI 正常路径零变化（UI 层本有门，此门=API 级兜底） | ✅ |

未动位核对：`targetInRange` 本体零改动（普攻四处消费点 :504 basicIfAdjacent / :551 basicOk / :778 ATK-1 / :801 兼容入口行为零变更）；AI 普攻目标选择 pickTarget 不在本卡射程（任务红线）；`mock_session` 零改动——其 selectSkill 已有 `!pendingInput` 门（mock_session.ts:344）且无事件系统，无静默激活面（同步面评估=无需同步）。

## 二、types.ts 红线豁免（Leo 已批）

`types.ts:242` `reason?: 'bar' | 'range' | 'invalid'` 不含 `'mode'`，而 GATE-1 规格要求发 `rejected(reason='mode')`——任务卡内部冲突（规格口径 vs types 零碰红线），直通窗口请示 Leo，**裁决=types 联合加 `'mode'`**（纯扩展一行+注释，对既有消费方零影响：proto main.ts:288 查表 `REJECT_HINTS[e.reason ?? 'invalid'] ?? '无法执行'` 有默认兜底，未知 reason 安全落默认文案）。types.js 转译层零输出变化（纯类型层），bundle.js diff 仅 battle-session 模块 1 行可证。

## 三、用例清单（铁律 4 先行 · 6 条新增，先红后修）

| # | 用例 | 断言要点 | 修正前 | 修正后 |
|---|---|---|---|---|
| AI1-1 | 报告反例复现 | auto 局 p(3,8) staff 技 ray2 / e0(4,9)（axial Δ=(1,1)：cube 距 2、不共线六向，用例内置布点自检）→ AI 首动臂=普攻（basicRange(staff)=2 够到 cube2，普攻不在本卡射程行为保留）、**全窗零 te 出技** | 红（松判纳 e0 → 首动=skill('te')） | 绿 |
| AI1-2 | 对照·真射线同距格 | e0(5,8)（Δ=(2,0) 东向 i=2 ∈ ray 集）→ AI 照常出 te 技（skill/miss 首事件 skillId='te'、targetId='e0'） | 绿（两判在此等价） | 绿 |
| AI1-3 | SP-2 双场射程集合全等 | 同 seed 同布点三敌（e0 ∈ray / e1 反例 ∉ray / e2(4,6) 东北射线格 ∈ray，可动区 col≥4）：手动臂 attackCells∩敌格={e0,e2}（e1 不在高亮）→ cast 射程内空格；托管臂 AI 出技受击 targetId 序**逐位全等**、均不含 e1 | 红（托管松判受击含 e1，与手动臂分歧） | 绿 |
| GATE1-1 | 条未满 selectSkill | manual 局 bar=0 → submit 返回 false + rejected(reason='bar') + selectedSkill=null/attackCells 空 | 红（返回 true 静默激活，Q03 复现） | 绿 |
| GATE1-2 | auto 模式 selectSkill | bar 拉满仍拒 → false + rejected(reason='mode')（资格层优先口径锁） | 红（返回 true 静默激活） | 绿 |
| GATE1-3 | 条满+manual 正向对照 | selectSkill true、attackCells 非空、零新增 rejected（UI 正常路径零变化） | 绿 | 绿 |

既有回归：test:battle 232 基线（211+14 防御卡+7 渲染卡）全量零改写零回归；[AI 同构]/[FACE-1 ⑤]（circle 等价背书）/SEL 组/armedBoard 全绿。

施工插曲（留痕）：AI1 首版布点两次踩坑——①(3,6)/(2,6) 均在可动区外（FIELD_COL_MIN=4 被 inField 滤除）→ 改 (4,6)；②basicRange(staff)=2（tier 随 level20 技升档）首动臂是普攻非位移 → 断言改为「首结算事件非出技」臂级判据。两处均为测试假设修正，实现零返工。

## 四、门禁自跑（对表）

| 门禁 | 结果 |
|---|---|
| typecheck | 零输出 exit 0 |
| lint | 零输出 exit 0 |
| test:battle | **238 passed**（基线 232 + 新增 6，`Tests 238 passed | 14 skipped`） |
| test:behavior | **14/14** |
| e2e（behavior_e2e.mjs） | **11 MATCH、不符合预期 0**、exit 0 |
| shot（shot.mjs） | **16 PASS / 0 FAIL**（png 重摄落 proto/battle_demo/shots/，不随本卡提交——并行工作区面留 PM 收口） |
| DBG | bundle DBG 残留 0（e2e 内置 dbgAny 同过） |
| bundle rebuild | 9 模块重建 + verTag **v1788600574081**（index.html 同步） |

开工基线备注：开工时全量 test:battle 一度 8 failed——经干净 worktree 实证为并行渲染输入加固卡（6633cd0）施工中间态所致（其收尾后基线 232 全绿），与本卡零关联。

## 五、文件清单与提交

- `types.ts`（+2/−1：reason 联合加 'mode'，Leo 批）
- `systems/battle-session.ts`（+16/−1：planSkill 射形同源 5 行 + selectSkill 入口门 8 行+注释）
- `tests/battle-session.test.ts`（+129 纯新增：6 用例+2 局部辅助 aiRayBoard/gateBoard/targetIds + import HEX_DIRS）
- `proto/battle_demo/bundle.js` / `index.html`（rebuild 产物+verTag）
- `tasks/threads/AI1-GATE1.md`（本文件）+ `tasks/LOG.md` 一行

路径级 git commit（不 push，停等 PM 复验）；未碰他人未提交文件（pngs/docs 留工作区）。

## 六、主架构技术验收

| 时间 | 结论 | 核验记录 |
|---|---|---|
| 2026-09-05 17:52 | ✅ PASS | 独立核对 `db40682`：AI-1 已以 `rangeCells(...)+hexEq` 与玩家激活面同源，ray 反例与真射线正例均有回归锁；GATE-1 在 `selectSkill` 入口拒绝非输入态，manual 优先报 `bar`、非 manual 报 `mode`，兼容 attack.skillId 未动。授权的 `types.ts` 单行联合扩展与 v2.4 规格一致，前端默认拒绝文案存在兜底。当前合并态 typecheck/lint 通过，battle **238 passed / 14 skipped**、behavior **14/14**。`types.ts` 曾绕过 tasks/questions 的过程偏差已在 LOG 登记；PM 按 v2.4 追认后不构成代码验收阻塞，但后续共享契约变更必须走任务箱链路。 |
