# T18 交付回执 · 战斗 session 结构重构 + 交互语义定版（backend）

> 交付：2026-09-02 · 执行：backend 代理 · 状态：**待 C 环 → 主架构复核 → L 环**
> 唯一真源：《战斗交互行为规格》v1.0（15dde99，Leo 批复）· 实施=S1-S7（五问批复 Q1~Q5 全部落入）

## 1. DoD 逐项

| # | DoD 硬项 | 结果 |
|---|---|---|
| 1 | 三零 + 全量不回归 | ✅ typecheck 0 / lint 0 / build 0（全仓）；全量 **139/139**（基线 124 → 139：session 重构矩阵 36 + structure 5，基线用例按规格收编/改写，见 §3） |
| 2 | §五 矩阵 26 组逐条对号 | ✅ 对号表见 §2（用例名带条目编号，断言方向未改写） |
| 3 | 结构收敛断言 ×5（病灶①~⑤） | ✅ `tests/battle-structure.test.ts`（源码形状测试，见 §3 对照表） |
| 4 | 事件流确定性（含 rejected） | ✅ SP-2/SP-3 用例：自动/手动双场+非法操作脚本全等 |
| 5 | 回执含对号表+病灶对照表 | ✅ §2/§3 |

禁区审计：battle-core 零改动（git diff 空）；hex.ts 零改动；渲染层唯一改动=`ui/battle-input.ts` D4 三行（主架构授权例外，ATK-4）；scene/npc/growth 零接触；types.ts 外部契约零变更。

## 2. §五 测试矩阵对号表（26 组 → 用例）

| 规格条目 | 对号用例（tests/battle-session.test.ts 除非注明） | 断言要点 |
|---|---|---|
| MV-0/MV-1 | [MV-0/MV-1] 普通可达：BFS 不可穿 | moveCells≡普通可达集；占格/出区不含（几何背书 hex.test 用例④） |
| MV-1 | [MV-1] 移动提交 | submit=true；hex=目标；move 事件 toX/toY=offset |
| MV-1 | [MV-1/MV-2] 移动拒绝（前半） | 出区/占格 → rejected:invalid |
| MV-2 | [MV-2] 轻功激活 | moveKind=jump、attackCells 空、穿越/落点排除/逐格 cube≤⌊power/2⌋ |
| MV-2 | [F1 姊妹端到端] 跨越单位直达 | 隔单位对侧格∈集合→位移成功+isJump 真值 |
| MV-2 | [MV-2] 轻功提交 | 内力-1（Q2）、bar=0、selectedSkill=null |
| MV-2/MV-3 | [MV-2/MV-3] 一阶轻功基线 | power≤1→零金格（函数级防御；F-06 基础 2 下不可达，已注明） |
| MV-3 | [MV-3] 未激活无金格 | moveKind=walk、moveCells=普通可达 |
| SEL-1 | [SEL-1] 输入态进入 | bar-max 恰 1、等待期不重复 |
| SEL-2 | [SEL-2] 互斥与 toggle | 选特→选绝自动取消→再点取消；激活不耗预算 |
| SEL-3 | [SEL-3] 行动消耗 | bar=0、选中清、cd2 写满值（递减节奏见 R-08 用例） |
| SEL-4 | [SEL-4] 自动清除与重弹 | 提交后 pending=false；重积满重新 bar-max |
| SEL-5 | [SEL-5] 取消路径三条 | 同钮 toggle/攻击态点无效格取消/轻功态非金格**不**取消（反向） |
| SEL-6 | [SEL-6] 置灰判定 | 内力<1 置灰（te/qing）；毒无数据源归 FE（D6，Q5） |
| SEL-7 | [SEL-7] 切自动/逃跑 | setMode(auto)→AI 代行；flee→fled |
| ATK-1 | [ATK-1] 普攻 | 射程内 basic+伤害；射程外 rejected:invalid 且 bar 不动 |
| ATK-2 | [ATK-2] 四查+结算 | 武器/冷却/内力→invalid、射程→range；合法 skill 事件+内力-1；**无降级**（Q1） |
| ATK-3 | [ATK-3] 移动附带普攻 | basic 紧随 move、不另耗回合 |
| ATK-4 | [ATK-4] 轻功态点敌无操作 | false、无事件、选中保持 |
| ATK-5 | [ATK-5] 点空格无操作 | false、无事件、选中不变 |
| BAR-1 | [BAR-1] clamp 封顶 | bar≤100.0001；出手间隔≈100/fillRate |
| BAR-2 | [BAR-2] 轮转排序 | bar 高→fillRate 快→玩家先 |
| BAR-4 | [BAR-4] 托管+冻结时钟 | trust(t<15s)→switch-auto |
| BAR-5 | [BAR-5] 90s 判定 | 高胜/低负/同量玩家负（一致性断言） |
| SP-1 | [SP-1] 出生锚点 ≤3 | 4 seed×dist(锚)≤3+互斥+满编 6+同 seed 布局复现（D1） |
| SP-2/SP-3 | [SP-2] 同 seed 全等 | 自动/手动双场全等（手动脚本含非法操作→拒绝序列全等） |

补充资产（矩阵外防回归）：AI 优先级序（B2）、R-08 冷却节奏（SEL-3/CD-1）、歼灭/玩家亡终局、heroSkills/F3 敌型身份、assembleRoster、Q2 内力口径。

## 3. 五大病灶收敛对照表（§八 → 代码位置，结构断言 tests/battle-structure.test.ts 锁死）

| 病灶 | 收敛落点（battle-session.ts） | 结构断言 |
|---|---|---|
| ① bar 四职责 | 填充=tick clamp；消耗=commitTurn `c.bar=0`（BAR-3/D3 显式）；回合判定=tick 轮转；选中=selection 状态机（不读 bar） | commitTurn 含 `bar = 0` 无 `bar -=`；clearSelection 不引用 bar |
| ② isJump 三公式 | doMove(intent) 唯一赋值点；AI/玩家只传 'walk'/'jump' 意图 | 全文件 `isJump =` 恰 1 处且在 doMove |
| ③ moveCells 双计算 | `legalMoveCells()` 唯一产生点；snapshot 与 submit 共用（qing 态经 selection.legalCells 同链） | snapshot/submit/legalMoveCells 三体引用断言 |
| ④ selectedSkill 五写点 | selection 对象（activate/clearSelection 两函数内 ≤4 赋值行=attack/qing/toggle/clear）；`selectedSkill =` 裸写点归零 | 赋值行归属函数体断言+裸串归零 |
| ⑤ pos/hex 双写 | Runner 无几何 pos 字段；`pos: POS_NEUTRAL` 单例（恒原点、core 兼容视图，Q1 适配终态）；swap-hack 归零 | `pos: POS_NEUTRAL` 恰 1、无坐标字面量、无 savedA/coreView 残留 |

## 4. 行为变更与定版落地

- **D1 出生锚点制**：锚 offset(2,13)/(13,2)，cube≤3 可动区洗牌（替换投影分带）；SP-1 用例重写引用条目。
- **D3 bar 显式清零**：commitTurn `bar=0`（防御性显式化，行为与 R3 等价）。
- **D4 input 三行**（授权例外）：battle-input.ts 点敌分支轻功态 `return`（无操作不派发）；session 侧 ATK-4 守卫双保险。
- **Q1 取消降级**：ATK-2 四查拒绝（invalid/range）+SEL-6 置灰反馈；L③ 降级普攻行为移除，用例改写引用 SEL-6/ATK-2。
- **Q2 内力常量**：`NEILI_COST_PER_CAST=1`/`NEILI_INITIAL=100`（session 导出，替换点已留；正式经济后置回填公式总览）；未显式配置内力的我方单位自动应用 100；跳跃/技能释放各扣 1。
- **ATK-5/MV-2 拒绝语义裁定**（回执备案）：无选中态可达集外**场内空格**=无操作无事件（ATK-5/矩阵断言）、出区/占格=rejected(invalid)（MV-1）；轻功态一切非金格=rejected(invalid) 且不取消（MV-2 字面优先，ATK-5 不覆盖轻功态）。

## 5. 文件清单（本侧改动）

- `systems/battle-session.ts`：全新重写（结构收敛+D1/D3+Q1/Q2）
- `ui/battle-input.ts`：D4 三行（主架构授权例外）
- `tests/battle-session.test.ts`：按 §五矩阵重写（36 例）
- `tests/battle-structure.test.ts`：新建（结构收敛断言 5 例）
- `tests/hex.test.ts`：追加「F1 姊妹锁死」跨越直达用例（10 例）
- types.ts / battle-core.ts / hex.ts / 渲染层（除 D4 三行）：**零改动**

## 6. 移交与备注

- FE 同步项延续 T15-R3 两项：config movable=12 已对齐（T16 侧已改）；`rejected` 事件消费（轻提示）待 FE 接。
- 全量 139 = battle14 + hex10 + session36 + structure5 + timeline3 + render25 + scene16 + npc8 + battle-ui21 + root1（battle-structure 计 5 含于前）——实际 9 文件合计 139。
- commit 建议注明：`T18 · session 结构重构+交互语义定版（规格 v1.0）· 139/139+三零`。

---

## 7. L 环追加小工单：可动区 12 高 × 8 宽 · 已修

- **口径**（Leo 实拍定）：可动区 row 2..13（12 行）不变，col 收窄 4..11（8 列，16 宽内居中）——配合压扁瓦片形成纵向对峙纵深。
- **实现**：FIELD 常量拆分为 `FIELD_COL_MIN=4 / FIELD_COL_MAX=11 / FIELD_ROW_MIN=2 / FIELD_ROW_MAX=13`；inField/出生枚举/ATK-5 扫描同步。
- **D1 锚点重算**：我方锚=可动区左下极格 offset(4,13)、敌方锚=右上极格 offset(11,2)（锚距 cube=12 > 3+3，两带分离保持）；spawnBand 半径过滤自动缩放。
- **用例**：SP-1 重写为 12h×8w 断言（col 4..11 + row 2..13 + dist(锚)≤3 + 互斥 + 满编 + 同 seed 复现）；inFieldOf helper 同步；ATK-1 改增量断言（waitAdjacent 特例普攻不混入统计）。
- **规格勘误提醒**：规格 BASE-1「可移动区 12×12」→ 应勘误为「12 高 × 8 宽」，请 PM 转主架构登记。
- **FE 同步项**：`config/battle-hex.ts` `movable: 8` 为正方形边长假设——需改为宽 8/高 12 两值（isMovableCell 点击过滤口径），请 PM 转 FE。
- **DoD**：三零全仓 0 + 全量 139/139 不回归。

## 8. L 环追加：轻功去 sticky（澄清：回归规格本义，非勘误）· 已落地

- **澄清收编**（PM 更正）：去 sticky 不是规格勘误——规格 v1.0 SEL-3/SEL-4 本义即「提交行动瞬间→选中清除」「条<100 退出输入态」，BASE-6 无连放。T15-R3 时代的「bar≥100 保持」实现已在 T18 全新重写中按规格移除，**本轮代码零改动**。
- **用例措辞更正**：上轮按「BASE-6 勘误收编」名义所写的去 sticky 循环用例，更正为「[SEL-3/SEL-4 回归规格本义]」（断言不变：跳→选中清除回落普通移动→重新激活→再跳；无事件/选中状态断言照旧）。
- **回归佐证**：commitTurn 无条件 clearSelection（无 bar≥100 保持分支）+ 结构断言病灶①（bar=0 显式清零、clearSelection 不读 bar）持续锁死。
- **DoD**：三零全仓 0 + 全量 **142/142**（FE 并行新增跳跃插值用例后全绿）。
- 规格 BASE-1 形状勘误（12h×8w）为独立事项，已在线程登记待主架构确认收编。
