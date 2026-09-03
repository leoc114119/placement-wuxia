# 特/绝范围 AOE 修正方案（v0.1 · T22 预备）

> 分类：03-战斗系统 · 状态：🟢 v0.1（2026-09-03 · PM 审阅通过 + Leo 放行：§六-1 采案 A（AI 代行同构 AOE），余五点 PM 依建议裁毕，T22 拆单生效）· 优先级：P0
> 定位：T22 修正卡技术方案——特/绝施放从「单格单目标」（T20 v2.0 实现）修正为「**范围 AOE**」（规格 v2.2，Leo L 环五点画圈）；交互骨架（选中/点射程施放/取消/自己格/热区）**全部复用不动**
> 依据：《战斗交互行为规格》**v2.2**（commit 6c57e63：ATK-2 范围 AOE / ATK-6 空放平移 / ATK-7 演出位简化 / §4.1 状态机 / §五矩阵）；T20 已交付件 = `战斗格子施放与热区修复方案-v0.1`（BE/FE 两卡，tasks/archive/T20-BE.md · T20-FE.md）
> 基线（2026-09-02 21:26 复跑，HEAD=6c57e63）：主套件 **191 绿 14 跳**（T21 后新基线）· 行为面 **14 绿 0 红** · shot 16 / e2e 9 例 MATCH（T21 回执）· DBG=0 · 三零
> 结论先行：**无语义级冲突，方案可落笔**；唯一开放点 = AI 出技（托管代行/敌方 AI）是否同构 AOE（§六-1，两案并列待裁，不阻塞主体）

---

## §一 范围红线（逐项取证确认）

| 项 | 预期 | 取证 | 结论 |
|---|---|---|---|
| battle-core.ts | 零改动 | `resolveAction` 副作用契约已够用：① skill≠null 时 `actor.neuli -= skill.neuliCost`（core:245，**扣多少由调用方传视图值**——session 可给首目标传 1、后续传 0，资源恰扣一次无需改 core）；② 冷却写 `if (cooldownTurns>0) cooldowns.set(id, cooldownTurns)`（core:246，**写初值幂等**，重复调用无行为差异）；③ skill 路径**无曼哈顿 blocked 分支**（core:247 复核仅 skill=null 普攻路径），AOE 逐目标调用不会误触 blocked | ✅ 零改动成立 |
| types.ts | 零改动 | cast 契约 T20-BE 已冻结（`{type:'cast'; to; skillId}`）；每受击目标一条 skill|miss 事件（带 targetId/damage）与空放 skill 事件（无 targetId 无 damage）均为**既有事件形状**，规格 ATK-6 架构注记明文「契约零新增」 | ✅ 零改动成立 |
| hex.ts | 零改动 | 受击目标集合直接消费 `selection.legalCells`（激活时快照，rangeCells 既有产物），不新增几何计算 | ✅ 零改动成立 |
| battle-session.ts cast 分支 | **本卡主体** | 现状 :757 `alive().find(x => hexEq(x.hex, req.to))` = 点击格单目标；:759-769 有敌 doAttack / 无敌空放镜像。改造点仅此一处 + `doAttack` 加 `payCost` 参数（内部函数，非契约） | ✅ 主体确认 |
| ui/battle-input.ts | 零改动 | T20-FE 方案 B 已按格派发：点射程内∪自己格 → `cast`、射程外 → `cancelSkill`——与 v2.2 分流**完全一致**（AOE 是 session 内部结算语义，input 不感知点击格上是谁） | ✅ 零改动成立 |
| ui/battle-hex-render.ts | 零改动 | ① 冒字：`enqueueHit` 入队（render:420）→ `pendingHits` 冲刷 → `dmgStagger: Map<targetId,…>`（render:116/544-547）**按目标独立错位**——多目标=多个 targetId 各自原位冒字，天然支持并发；② slash fx：挂**攻击者** charge 上升沿（render:496 `riseToAttack`），一次施放一次 charge=一次 slash，**不随目标数变化**；③ 'hit' fx：休眠钩子（render:500 注释：session 从不写 animState='hit'），无影响；④ shakes：Map<targetId> 各自衰减 | ✅ 零改动成立（多目标表现评估：一次挥砍+多处冒字+多目标震动=完整可观测反馈，无表现缺口；若 Leo 要「每目标一道 slash」属表现增强，单列 FE 卡，本卡不做） |
| proto/battle_demo/main.ts | 零改动 | 事件消费白名单逐条入队（main.ts:275-279：basic/skill 且 targetId 且 damage>0 → 冒数字+震动；miss 且 targetId → 闪避冒字）——**逐条独立处理，与事件条数无关**；空放 skill（无 targetId）天然不入队 | ✅ 零改动成立 |
| mock_session.ts | 零改动 | cast 契约不变，default 兜底不破（T20-BE 已核） | ✅ 零改动成立 |
| config/ | 零改动 | 无新数值（AOE=全额伤害无衰减，无新展示参数） | ✅ 零改动成立 |
| attack 分支（skillId≠null） | 保持单目标不动 | 玩家路径 input 已统一派 cast（T20-FE 方案 B），attack.skillId≠null 成为**不可达兼容入口**；历史验收代码不重写（§六-2 背书） | ✅ 不动 |

**波及测试面（唯一涟漪）**：session AOE 化会把三类既有绿用例打红——主套件 [ATK-6] 空放两例 / [ATK-6/Q2] 自己格 / [ATK-7] 演出位（布点敌均在射程内，v2.2 下点空格=AOE 不再空放）+ 行为面 N2-①/N2-②(a) + e2e BE2/BE3a/HF2。**必须随卡配套改写**（§二.2 逐条 diff），否则四门不过——这是 T22 卡含测试改写的依据，非「断言方向改写」（规格 v2.2 已改，用例随规格走，方向仍由 §五矩阵锁定）。

---

## §二 设计

### 2.1 AOE 循环精确伪代码（cast 分支改造段）

改动一：`doAttack` 增加第 5 参（session 内部函数签名，非契约）：

```ts
function doAttack(actor, target, skill, quiet = false, payCost = true): void {
  // 唯一改动行：payCost=false 时 neuliCost 视图=0（resolveAction 扣 0），资源由首目标路径承担
  const skillView = skill ? { ...skill, neuliCost: payCost ? NEILI_COST_PER_CAST : 0 } : null;
  ...（其余原样）
}
```

改动二：cast 分支（battle-session.ts:728-772；门/四查/射程查 :730-755 **原样不动**，仅替换 :756-769 结算段）：

```ts
if (req.type === 'cast') {
  ...选中态门 / 四查重查 / 射程查（:730-755 原样）...

  // ★【ATK-2 v2.2】受击目标集合 = 射程形态格（selection.legalCells，显示=校验=结算三同源）
  //   内的全体存活敌；all 数组序一次快照（SP-2：rng 消费顺序 = 目标序 × 每目标独立掷骰 1~3 次）
  const targets = all.filter(
    (x) => x.side !== player.side && !x.dead &&
      selection.legalCells.some((p) => hexEq(p, x.hex)),
  );

  tickCooldowns(player);            // 读后递减，调用位不变（四查后、结算前）

  if (targets.length > 0) {
    resolveAoe(player, s, targets); // ★ 逐目标独立掷骰全额伤害，资源只在首目标扣一次
    faceToward(player, req.to);     // ★ 朝向定版=点击格（出手确认方向，覆盖循环内逐目标 faceToward）
  } else {
    ...ATK-6 空放分支（:762-769）原样保留：session 镜像资源三件 + setAnim('charge')
      + faceToward(req.to) + emit skill 空事件（无 targetId 无 damage）...
  }
  commitTurn(player);
  return true;
}
```

新增 session 内部辅助（cast 与 aiAct 共用，单一产生点；aiAct 是否并入见 §六-1）：

```ts
/** 【ATK-2 v2.2】范围 AOE 逐目标结算：首目标承担资源（R-09/R-08 经 resolveAction 真值路径，
 * neuliCost 视图=1）；后续目标 payCost=false（视图=0，扣 0）；每目标独立掷骰（1~3 次 rng）+
 * 各发 skill|miss 事件 + 各自死亡判定。targets 顺序由调用方定死（SP-2 确定性）。 */
function resolveAoe(actor: Runner, skill: SkillDef, targets: Runner[]): void {
  for (let i = 0; i < targets.length; i++) doAttack(actor, targets[i], skill, false, i === 0);
}
```

**关键正确性论证（逐条）**：

| 关注点 | 论证 |
|---|---|
| 资源恰扣一次（五点+ATK-2） | 内力：首目标 skillView.neuliCost=1（core:245 扣 1）、后续=0（扣 0）→ 总扣恰 `NEILI_COST_PER_CAST`；冷却：core:246 写**初值**，N 次重复写同值幂等；BAR-3/选中清由 commitTurn 一次。首目标 miss 也扣（core 先扣后掷骰）——与空放「全扣」语义一致 |
| rng 确定性（SP-2） | 目标集合按 `all` 数组序（敌声明序）一次快照；每目标 resolveDamage 独立消费 1~3 次（命中 F-04 → 闪避 → 暴击，core:200-205）；同 seed + 同操作序列 → 事件流全等。**禁止**任何 sort/tie-break 引入不稳定序 |
| 点击格无关（五点②） | 结算输入 = targets（由 selection.legalCells 派生）+ rng 状态；点击格仅参与 inRange 合法性判定与 faceToward（演出，无伤害影响）→ 点不同射程格产出全等事件流（V2 双场用例直接锁） |
| legalCells 用激活快照而非 cast 时重算 | 输入态玩家不行动（一动即 commitTurn 清选中）→ player.hex/hexFacing 激活后不变 → 快照 ≡ 当前射程形态；用快照=显示（attackCells）/校验（inRange）/结算（targets）**三同源**，重算则制造第二计算点（病灶③复发） |
| 循环内 doAttack 副作用幂等 | setAnim('charge') 同值覆写=单次效果（animLeftMs 重置同值 300ms，同步循环等价单次）——**加注释锁**，防未来改逐目标动画序列时踩坑；faceToward 循环内逐目标执行后以 `faceToward(req.to)` 收尾定版（点击格=出手确认方向，与空放分支一致）；checkEnd 幂等（phase 门），win 事件自然落在最后目标 death 之后 |
| 事件形状 | 命中目标：skill 事件带 targetId/damage；miss 目标：miss 事件带 targetId（既有双形状，doAttack logs 映射既有）——规格 ATK-6 注记「每受击目标各发 skill 事件」按「各发一条结算事件（skill 或 miss）」理解，**非新形状**；事件类型零新增 ✅ |
| AI 面（五点⑤「敌方同规则」） | MVP 敌方 `makeEnemy skills=[]` = 真空集；唯一受影响面 = **托管/自动模式下玩家 AI 代行出技**（aiAct planSkill→doAttack 单目标）。两案：A（推荐）aiAct 出技同构 AOE（planSkill 收集射程内全体 → resolveAoe，+10 行）；B 本卡只改 cast、AI 保持单目标登记偏差。详见 §六-1 |

### 2.2 与 v2.1 断言的 diff 面（用例改写/保留全景）

**主套件 tests/battle-session.test.ts（cast 段 8 组）**：

| describe | 现状布点/断言 | v2.2 走向 | 处置 |
|---|---|---|---|
| [ATK-2 对格] cast 有敌格（:570） | p(7,8) e0(9,8) 单敌；事件尾 skill\|miss + 资源四项 | 射程内全体={e0}，AOE **退化为单目标**，断言全保持 | **断言零改**；用例名/注释补「AOE 退化单目标」语义标注 |
| [ATK-6] 空放两例（:588-622） | castPair：air 场点 (6,8) 空格，但 e0(9,8) ∈ 射程 | v2.2 下点空格 → 射程内有敌 → **AOE 结算非空放**，「敌 hp 不变/空事件形状」必破 | **改写布点**：e0 挪出射程（如 (11,8) 距 4，与射程外用例同格），断言本体全保持（skill 无 targetId/资源四项/charge/faceToward 正西） |
| [ATK-6] 射程外 rejected(range)（:624） | 拒绝路径 | 不达结算 | **零改** |
| [ATK-6/Q2] 自己格=空放（:643） | e0 ∈ 射程，点自己格 | v2.2 点自己格=施放 → AOE 打 e0，「敌 hp 不变」破 | **改写布点**：敌出射程（保持空放语义断言 + 朝向保持断言） |
| [ATK-7] 演出位（:662） | e0 逻辑位 (9,8) ∈ 射程，点 ghost(8,8)；断言「敌 hp 不变（命中以逻辑位判定的核心证据）」 | v2.2 **该条款废止**（ATK-7 简化：命中只看射程成员）→ 点演出位=施放全范围 → e0 被打 | **断言翻转**：施放受理 + e0 hp ≤ hp0 + skill\|miss 事件带 targetId=e0（AOE 生效=新语义直接证据）；用例名改「演出位∈射程=施放全范围生效」 |
| [ATK-2 拒绝] 四查三例（:683） | 拒绝路径（目标格 (8,8) 仅作载体） | 不达结算 | **零改** |
| [ATK-6 门] 三情形（:727） | 拒绝路径 | 不达结算 | **零改** |

**主套件新增（v2.2 矩阵行 ATK-2/五点② 对号）**：

| 新例 | 断言 |
|---|---|
| [ATK-2 AOE] 多敌分野 | 2 敌 ∈ 射程 + 1 敌 ∉ 射程 → cast 任意射程格：恰 2 条 skill\|miss（各带 targetId、按 all 序）+ 各自 hp ≤ hp0 + 射程外敌 hp 不变 + 资源四项=单次终态（neili−1/cd 写初值/bar 0/选中 null） |
| [五点②] 点击格无关双场全等 | 同 seed 同布点双场：A 点射程内空格 / B 点敌格 → 事件流 slice **全等**（rng 消费同序同量，伤害序列逐条相同）——「点击格不影响结算结果」直接锁 |
| [AI 同构]（仅 §六-1 案 A 并入时） | 自动模式多敌局（2 敌 ∈ AI 技射程）→ AI 出技：射程内全体受击 + 资源一次；既有 1v1 AI 两用例（:994/:1016）退化单目标**零改保持绿** |

**行为面 tests/battle-behavior.test.ts（N2 组，input 派发断言为主）**：

| 用例 | v2.2 走向 | 处置 |
|---|---|---|
| N2-① 空红格=cast 空放受理（:325） | e1(9,8) ∈ 射程 + 点空格 → AOE 打 e1，「e1/e2 hp 不变」破 | **改写布点**：e1/e2 挪出射程；input 恰派 1 条 cast + 空放终态断言全保持（input 层零改动的行为证据） |
| N2-② 变体(a) 演出位∈射程（:370-404） | e1 逻辑位 ∈ 射程 + 点演出位 → 施放全范围 → e1 被打，「hp 不变」破 | **断言翻转**：受理 + e1 hp ≤ hpA（ATK-7 v2.2 简化语义）；变体(b) 射程外=取消**零改**（取消路径 v2.2 未动） |
| 其余 12 例（SEL/ATK-3/ATK-4/SP-1/红名单余项） | 普攻/ATK-3/轻功/取消路径零变化 | **零改** |

**e2e proto/battle_demo/behavior_e2e.mjs（9 例）**：

| 例 | v2.2 走向 | 处置 |
|---|---|---|
| BE1 特技全链（点敌格） | cast → AOE（e1 摆入射程；e2 出生位远距大概率在外）；断言面宽（some(skill\|miss)/neili−1/selected null）多目标仍全成立 | **零改自然 MATCH**（标题语义可顺带更新为「施放生效」） |
| BE2 空放（点空红格） | BE1 后 e1 仍在射程 → 点空格=AOE，「敌 hp 不变/evN+1」破 | **改写**：施放前把全体敌挪出射程（placeFoe e1 远格 + e2 白盒核位），断言本体保持（资源全扣+hp 不变+恰 1 条空放 skill） |
| BE3a 演出位∈射程 | e1 逻辑位东 1 格 ∈ 射程 + 点演出位 → 施放全范围 → e1 被打，「foeHpUnchanged/evN+1」破 | **断言翻转**：施放受理 + e1 受击（AOE 生效）——ATK-7 v2.2 端到端证据；用例名改「演出位∈射程=施放全范围生效」 |
| BE3b 演出位∉射程=取消 | 取消路径（input 层） | **零改** |
| BE4 移动穿人 / HF1 普攻冒字 / HF3 ATK-3 冒字 / HF4 reset 清理 | ATK-3/普攻单体不变；reset 不涉 | **零改** |
| HF2 特技冒字+空放 | 前半：断言取**第一条** skill\|miss 且 targetId='e1'——多目标下首事件可能是其他目标的 miss（重试兜住但脆弱）；后半空放段「找空红格点击」——射程内有敌（e1 前半摆入+e2 随机）→ AOE → 「恰 1 条空放 skill/敌 hp 不变」破 | **改写两段**：前半改为「找 targetId='e1' 的 skill 事件 + e1 冒字/震动断言」（多目标兼容）；后半空放段前把全体敌挪出射程，零冒字零挂起断言保持 |

---

## §三 验收口径

### V 断言（T22 卡需求表锚点）

| # | 断言 | 规格依据 |
|---|---|---|
| V1 | **AOE 多目标分野**：射程内 N 敌 → 恰 N 条 skill\|miss（各带 targetId、按声明序）+ 各自全额伤害独立掷骰（hp ≤ hp0，双场可复现）+ 射程外敌 hp 不变 + 资源四项**单次**终态（neili−1/cd 初值/bar 0/选中 null） | ATK-2 v2.2 / 五点① |
| V2 | **点击格无关**：同 seed 同布点，点射程内空格 vs 点敌格 → 事件流全等 | 五点② |
| V3 | **空放平移**：射程形态内无任何存活敌 → 照常提交合法施放：资源全扣 + 无伤害 + 空放 skill 事件形状（无 targetId 无 damage）保持 | ATK-6 v2.2 / 五点③ |
| V4 | **演出位简化**：点移动中敌演出位（∈射程）→ 施放全范围生效（敌 hp 变化）；∉射程 → 取消——BE 侧天然无逻辑位/演出位分支（结算只看射程成员） | ATK-7 v2.2 / 五点④ |
| V5 | **单体不变**：普攻（ATK-1）/ATK-3 附带普攻/attack 兼容入口均保持单体——既有绿锁全绿 | 五点⑤ |
| V6 | **AI 同构**（仅案 A 并入）：自动/托管 AI 出技 = 射程内全体受击 + 资源一次；1v1 局退化单目标（既有 AI 两用例零改保持绿） | 五点⑤「敌方同规则」 |
| V7 | **确定性**：SP-2 双场用例（含 cast 操作序列的多敌局追加）事件流全等；异 seed 不同 | SP-2 |

### 四门终态

1. **主套件**：全绿（191 基线 + 新增 [ATK-2 AOE]/[五点② 双场]/（案 A）[AI 同构] − 0 删除；改写 3 组布点/断言不增减用例数），新基线数登记回执。
2. **行为面**：0 红（N2-①② 随卡改写后保持绿；其余 12 例零改）。
3. **shot 16/16 + e2e 9 例 MATCH**：BE2/BE3a/HF2 为 v2.2 改写例（断言方向变更已在 §二.2 列明，引用规格条目编号注明依据）；BE1/BE3b/BE4/HF1/HF3/HF4 零改自然 MATCH。
4. **DBG=0 + 三零**（typecheck/lint/build）+ bundle rebuild + verTag bump + preview 目验多目标冒字。
5. 交付报告含《战斗交互行为规格》v2.2 §五矩阵 ATK-2/ATK-6/ATK-7 三行逐条对表。

---

## §四 易错点（从用例长出）

1. **doAttack:358 的 neuliCost 强制覆写陷阱**：现有实现无条件覆写为 `NEILI_COST_PER_CAST`——AOE 循环直接复用会 N 目标扣 N 点内力；必须经 `payCost` 参数（§二.1 改动一），首目标 true、后续 false。
2. **目标集合排序必须定死**：`all.filter(...)` 数组序（敌声明序）；任何 `sort()`（距离/tie-break）都会引入不稳定序破坏 SP-2——V2 双场全等用例就是防这个的。
3. **禁止 cast 时重算 rangeCells**：必须消费 `selection.legalCells` 快照（显示=校验=结算三同源）；重算=第二计算点，病灶③复发，且锥形/ray 的 facing 参数两处漂移风险。
4. **旧空放用例布点是假红源**：v2.1 用例「敌在射程内 + 点射程内空格 = 空放」在 v2.2 下变 AOE——改用例必须改**布点**（敌出射程）而不是删断言；[ATK-7] 与 N2-②(a) 则相反，是**断言翻转**（hp 不变 → hp 受击），两者不要混。
5. **朝向收尾**：循环内 doAttack 逐目标 faceToward 后必须 `faceToward(player, req.to)` 定版（点击格=出手确认方向）；漏掉则朝向=最后结算目标，与「点击格仅为出手确认」矛盾，且空放/命中两分支朝向语义分叉。
6. **setAnim 循环幂等要注释锁**：同值覆写在同步循环内等价单次——写明论证，防未来「逐目标动画序列」改造踩坑。
7. **win 事件落位**：AOE 全灭在最后一目标 death 后 emit win（checkEnd 幂等靠 phase 门）——事件顺序锁进 V1 断言（skill\|miss×N → death×k → win），防循环中途 checkEnd 提前翻 phase 截断后续目标。
8. **e2e 空放段必须「全体敌出射程」**：BE2/HF2 旧逻辑只「找一个无敌空格」——v2.2 空放条件是**射程形态内无任何存活敌**，只挪 e1 不核 e2 会被随机出生位打脸（e2 恰入射程 → AOE → 假红）。
9. **HF2 前半取事件策略**：多目标下首条事件可能是其他目标的 miss——断言改「find targetId='e1' 的 skill 事件」，不要依赖事件首位。
10. **AI 用例 1v1 退化≠AI 面无锁**：既有 AI 两用例是 1v1（AOE 退化单目标），V6 需专门多敌局用例，否则案 A 并入后 AI AOE 路径零覆盖。
11. **bundle rebuild 别忘**：e2e 驱动的是编译产物 bundle.js 内的真 session——session 改后不 rebuild，e2e 跑旧逻辑（假绿/假红都可能出现）；verTag 同步 bump。
12. **V2 双场的 rng 对齐前提**：两场须同 seed + 同白盒布点（place）+ 同 tick 推进至输入态，保证 cast 前 rng 消费完全一致；布点用 place 基建而非依赖出生随机（虽同 seed 出生相同，显式 place 防未来出生逻辑变更引入漂移）。

---

## §五 拆单建议（按栈）

**预期：BE 单卡主体（T22），一次含测试涟漪收口；FE 零改动（渲染层/input/main 均零改动，§一已逐项取证）。**

| 卡 | 内容 | 授权文件 | 工作量 |
|---|---|---|---|
| T22（BE 单卡） | ① session：doAttack payCost 参数 + resolveAoe 辅助 + cast 分支 AOE 化（+案 A 则 aiAct planSkill 收集全体）；② 主套件：改写 3 组 + 新增 2~3 组；③ 行为面：N2-① 布点改 + N2-②(a) 断言翻转；④ e2e：BE2/BE3a/HF2 三例改写 + bundle rebuild + verTag；⑤ 四门终验 + 规格矩阵三行对表 | systems/battle-session.ts、tests/battle-session.test.ts、tests/battle-behavior.test.ts、proto/battle_demo/behavior_e2e.mjs、proto/battle_demo/bundle.js + verTag | ~0.5 天 |
| （无 FE 卡） | 渲染层多目标冒字/震动/错位天然支持（dmgStagger 按 targetId 独立）；slash 挂攻击者演出沿不随目标数变化——**零改动零缺口**。若 Leo 要求「每目标一道 slash/命中特效」属表现增强，另立 FE 迷你卡（估算 ~0.5 天：fx 生成序+多 slash 布点+shot 目验），与本修正解耦 | — | 0（本卡） |

**单卡理由**：变更源单一（session 一处），但行为面 0 红 / e2e MATCH / bundle 真源一致三个硬门都无法与 session 改动分离（拆两卡则中间态卡必然带红/MISMATCH 违反 DoD）；T20 的 BE/FE 两卡拆分动因是 input/热区/渲染确需改 FE 文件，本次无此动因。若 PM 坚持分栈：BE 卡（session+两测试套件）中间门交付时须登记「e2e 3 例预期 MISMATCH 在列」，FE 迷你卡（e2e+bundle+目验）收口四门——不推荐。

---

## §六 评审确认点（需 Leo/PM 背书）

| # | 事项 | 建议 | 影响 |
|---|---|---|---|
| 1 | **AI 出技 AOE 化范围**（五点⑤「敌方同规则」落地）：MVP 敌方无技=真空集，唯一实面=托管/自动下**玩家 AI 代行出技**。案 A（推荐）：aiAct 出技同构 AOE（planSkill 收集射程内全体 → resolveAoe，+10 行，1v1 既有用例零破坏）；案 B：本卡只改 cast、AI 保持单目标登记偏差（手动 AOE vs 托管单目标=同技能两种威力，数值不公平但改动面最小） | 案 A | 决定 T22 是否含 aiAct 改动与 V6 用例 |
| 2 | **attack 分支 skillId≠null 保持单目标**：input 统一 cast 后该路径玩家不可达，作为兼容入口保留原样（历史验收代码不重写）；如 PM 认为应显式废弃请另立卡 | 保留不动 | 无行为影响（不可达） |
| 3 | **朝向定版=点击格**（出手确认方向）：AOE 下点击格与受击目标解耦，循环后以 faceToward(req.to) 收尾（与空放分支一致）——规格「点击格仅为出手确认」的演出推论 | 确认 | 影响一个演出细节断言 |
| 4 | **BE3a/N2-②(a) 断言翻转表述**：从「空放受理」翻转为「施放全范围生效」（ATK-7 v2.2 简化），e2e 用例名与登记簿措辞同步——属规格变更配套改写，非断言方向擅改 | 确认 | 登记簿/回执措辞 |
| 5 | **「每受击目标各发 skill 事件」的 miss 注记**：miss 目标实际发 miss 事件（既有形状，规格 ATK-6 注记按「各发一条结算事件」理解）——请 PM 在规格下一版补一字注记或确认本方案口径 | 采本方案口径 | 规格表述瑕疵，非行为分叉 |
| 6 | **拆单口径**：BE 单卡全含（§五推荐）vs BE+FE 迷你两卡 | 单卡 | T22 发单结构 |

---

## 与其他文档的关系

- 《战斗交互行为规格》v2.2 = 行为真源（本方案 ATK-2/6/7 与 §五矩阵三行的实现推导）；本方案落地后 T22 卡需求表以 §二.1 伪代码 + §三 V 断言为锚。
- 《战斗格子施放与热区修复方案-v0.1》（T20）= cast 骨架与热区的既有交付基线，本方案不重开其已批口径（空放全扣/格为对象→v2.2 修订为范围对象/热区零涉）。
- 《受击反馈技术方案-v0.1》（T21）= 冒字/震动链路既有交付，本方案零触碰。

## 更新记录

| 日期 | 变更 | 签字 |
|---|---|---|
| 2026-09-03 晚 | **Leo 放行**：§六-1 采**案 A**（托管/自动 AI 代行出技同构 AOE，V6 用例并入）；②attack 兼容入口保留 ③朝向定版=点击格 ④断言翻转属规格配套 ⑤miss 注记已补规格 v2.2 ⑥BE 单卡全含。T22 卡即发 | Leo（PM 代录） |
| 2026-09-02 | v0.1 初版：单段式产出（事实复核+方案），§一红线逐项取证、§二伪代码+diff 面、§三 V 断言+四门、§四 12 易错点、§五拆单、§六 6 评审确认点；停等 PM 审阅 | ZCode 主架构 |
