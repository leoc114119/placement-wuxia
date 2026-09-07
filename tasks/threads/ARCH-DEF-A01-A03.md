# ARCH-DEF-A01-A03 · session 防御性加固（TASK-ARCH-01 派生 · backend）· 沟通线程

> 依据：`docs/reviews/全仓代码体检-主架构-Codex-v1.md` A01/A02/A03 三条；PM 裁定（卡内生效）：非法输入 **fail-fast 抛 Error**，不静默吞不兜底。
> 红线：types.ts / battle-core / hex / battle-input / config / ui / proto 源 零碰；已验收行为零变更（既有 211+14 用例不改写，纯新增）。

| 时间 | 发言人 | 事件 | 内容 |
|---|---|---|---|
| 09-05 | Leo→backend | 📤 直通派单 | session 防御性加固卡（TASK-ARCH-01 派生）：A01 快照引用隔离 / A02 faceTargetOf 空守卫（FACE-1 备忘合并）/ A03 入口运行时校验；铁律 4 先列用例清单；门禁八项自跑；路径级 commit 不 push 停等 PM |
| 09-05 | backend | 💬 DoR 用例清单 | 纯新增 14 例定稿：A01×6（attackCells 元素/结构篡改隔离、篡改不影响 cast 结算双向臂、qing 金格隔离、绿格隔离、actors/heroSkills 现状锁）+ A02×3（空集抛错/非空零扰动/空放臂不误伤）+ A03×5（非法 dt 四态抛+状态无损/tick(0) 合法/重复 id 两态/容量精确边界+满编互异/合法 6 敌基线）；架构自决备案：faceTargetOf 为闭包内函数不可直呼 → `_debug` 增单参测试钩子（零生产行为面） |
| 09-05 | backend | 📦 交付 | 改动面 6 文件：`systems/battle-session.ts`（+48 行：copyCells helper+快照出口两处复制/A02 守卫+两处互指注释/_debug 钩子/A03 tick 校验+阵容校验）/`tests/battle-session.test.ts`（+200 行纯追加三 describe）/`proto/battle_demo/bundle.js`（仅 session 模块行变化，门禁要求 rebuild）/`proto/battle_demo/index.html`（仅 verTag）/threads+LOG。**A01/A02/A03 三条对表见下**。门禁八项全绿（原文见 LOG）；新基线 **225 绿（211+14）**；commit 未 push 停等 PM 复验 |
| 09-05 17:52 | Codex（arch） | ✅ 技术验收 PASS | 独立核对 `a3e6329`：授权业务文件仅 `battle-session.ts`/对应测试，红线运行时源（types、battle-core、hex、battle-input、config、ui、proto 源）零碰；A01 的数组+元素两层复制保持内部 `selection.legalCells` 真值，A02 空集 fail-fast 与 ATK-6 空放分支不冲突，A03 校验发生在 rng 消费前且 dt 门在 phase 门前。当前合并态复跑：typecheck/lint 通过，battle **238 passed / 14 skipped**，behavior **14/14**。截图/e2e/build 采用 PM 纯净态复验留档；为避免覆盖工作区他人素材，未重写其产物。 |

## 三条对表（报告条目 → 落点 → 证据）

| 条目 | 报告定位（仓库现状核实） | 落点 | 用例证据 |
|---|---|---|---|
| A01 快照引用隔离 | `battle-session.ts:267` legalMoveCells 直返 selection.legalCells；`:843` attackCells 同源直泄；cast `:800/:809` 读内部数组 → 展示端可反向影响 | 快照出口防御性复制（`copyCells`=数组浅拷贝+逐元素 `{...p}`，禁深递归）；内部 selection.legalCells 仍唯一真值（病灶③显示=校验=结算三同源不破坏，submit/cast 照读内部） | A01-1 元素篡改后续快照全等；A01-2 push/length=0 隔离；A01-3 双向臂（清空快照后真射程格 cast 仍受理+假格 cast rejected(range)）；A01-4 qing 金格三手法+伪金格 move rejected(invalid)；A01-5 绿格 ≡ reachable 恒等；A01-6 actors/heroSkills 现状锁 |
| A02 faceTargetOf 空守卫 | `:422` 返回 Runner；空 targets 消费 1 次 rng 后 `:445` 取 `.hex` 崩溃；`:817` cast 臂与 AI `:511` 现滤空（正常不可达） | 入口断言空数组抛 Error（消息=`faceTargetOf: empty targets`）；`:817` 守卫处加互指注释（ATK-6 空放走 else 臂不经本函数）；`_debug` 增测试钩子供直呼断言 | A02-1 空集直呼抛错（消息逐字断言）；A02-2 单目标返回本体引用恒等（ties==1 早退原样，FACE-1 六用例零回归佐证）；A02-3 空放臂 true+skill 无 targetId 不误触发守卫 |
| A03 入口运行时校验 | `:584` tick dt 直乘速率（NaN 污染 clock/bar）；`:233` 敌数截取出生格无容量检查（100 敌实测 mk 读 spawn.q 异常） | tick 入口非有限/负 dt 抛（先于 phase 门）；createHexBattle 阵容 id 重复抛+敌数超出生带容量抛（校验置于任何 rng 消费前，坏输入零副作用）；合法 1~6 敌基线运算次序零变更 | A03-1 NaN/Infinity/-1/-0.001 各抛+抛后 clock 不动+合法 tick 正常；A03-2 tick(0) 合法零前进；A03-3 重名两态抛；A03-4 100 敌抛+精确边界（测试独立推导容量：cap 满编受理且出生格互异/cap+1 抛）；A03-5 合法 6 敌 auto 终局零异常 |

## 门禁八项（自跑原文摘录）

1. typecheck：零输出
2. lint：零输出
3. `npm run test:battle`：**225 passed | 14 skipped**（= 既有 211 + 新增 14，新基线登记）
4. `npm run test:behavior`：**14 passed (14)**
5. `node proto/battle_demo/shot.mjs`：PASS **16** / FAIL 0
6. `node proto/battle_demo/behavior_e2e.mjs`：**11 MATCH** / 0 不符（预期红 0/预期绿 11）exit=0
7. DBG 残留：**0 条**（e2e BE4 明细 `DBG残留0条`+汇总无残留样本行）
8. `node proto/battle_demo/build.mjs`：bundle 9 模块重建 + verTag **v1788598513257**

## 备注（复验提示）

- 共享工作区：`ui/battle-hex-render.ts` / `ui/battle-input.ts` / `proto/battle_demo/main.ts` 的未提交改动系**其他窗口 WIP**，不在本卡提交面（路径级 add 排除）；bundle.js 经核 diff 仅 session 模块一行变化（main/ui 模块行与 HEAD 字节一致，未夹带）。
- shots/*.png 为门禁再生产物（FACE-1 先例不入库），未提交。
- mock_session 自带 tick 实现不经 createHexBattle，调用面零变化（预期成立）。
- 新用例为真回归锁：旧代码下 A01-1（同数组引用篡改可见）/A02-1（返回 undefined 不抛）/A03-1（NaN 静默写入）均必挂。
