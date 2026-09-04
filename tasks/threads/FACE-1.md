# FACE-1 朝向规则修正（frontend 直通线单卡 · 施工与回执）

> 领单：2026-09-04 前端直通线派发（Leo）。方案真源（唯一依据，PM 背书）＝`docs/design/03-战斗系统/朝向规则修正方案-v0.1.md`（§六-2/3/4 裁定落文，§六-1 空放悬置待 Leo）；规格参照＝《战斗交互行为规格》v2.3 §4.3 FACE-1（flat-top 已勘误 pointy-top+奇偶行错位，ART-ARCH.md Q1，六向结论不变）。
> 授权清单（§五）：`systems/battle-session.ts`、`tests/battle-session.test.ts`。红线：types.ts / battle-core / hex / battle-input / config / ui / proto 源码零碰；mock_session 零同步。

## 一、复述对表（FACE-1 四分句 → 落点）

| 分句 | 规格③义 | 本卡落点 | 状态 |
|---|---|---|---|
| ① 单一受击敌 → 朝该敌六向，转向完成后再播帧 | faceToward(target) | doAttack F1（:372 原样，③a attack 臂断言背书）+ cast 有敌臂删 :785 点击格覆盖；演出序=快照原子性+ATK-3 pendingAnim 既有结构（§二.5 渲染零改动即达成，未动） | ✅ |
| ② AOE 多敌 → 朝最近敌 | faceTargetOf | resolveAoe 入口 faceTargetOf（单遍历 min+保序 ties，判距=逻辑格 hex §六-2）+ 循环后 faceToward(actor, faceTarget.hex) 定版；aiAct 臂零改动同规则（⑤锁） | ✅ |
| ③ 多敌同距 → 随机取一（seed 单流，纳入 SP-2） | 平局恒掷 1 次（§六-4） | faceTargetOf：ties==1 零消费 / ties≥2 恰掷 1 次，消费点固定在逐目标循环前（§二.2 时序论证）；②-b 异 seed 分歧臂锁 | ✅ |
| ④ 空放 → 保持点击格朝向（待 Leo 复核） | 悬置 | :793 一行未动；既有 :612-625 / :654-671 两用例零改（测试 diff 纯新增可证） | ⏸ 原样 |

随卡修正（§二.4，FACE-1 必要组成）：faceToward 吸附度量 axial 2D 点积 → **cube 3D 点积**（session 自持，不引 hex.ts 导出）；faceLeft 判据 offset 列差 → **sign(2Δq+Δr)**。

## 二、施工清单（两文件，实际 diff）

**systems/battle-session.ts**（+53/−12 行内）：
1. `faceToward`（:309 起）：cube 3D 点积（vx·dx+vy·dy+vz·dz，y=−x−z）+ faceLeft=sx=2Δq+Δr 符号（sx=0 保持旧值，等分水平向量防抖同 T06 口径）；dirs 表原序（HEX_DIRS 同值同序）。
2. `faceTargetOf`（新增，faceTarget 唯一产生点）：单遍历求 min cube 距 + filter 保序 ties；勿复用 pickTarget（§四-5）。
3. `resolveAoe`：入口 `faceTargetOf` → 循环照旧（doAttack F1 逐目标 faceToward 为不可观测中间态）→ 循环后 `faceToward(actor, faceTarget.hex)` 定版。
4. cast 有敌臂：删 `faceToward(player, req.to)`（:785，v2.3 废止）；空放臂 :793 未动。
5. 未动位核对：F1（doAttack :372）/ F2（doMove :420）/ F6（出生 :852-856）零改动——§一.1 六调用位对号。

**tests/battle-session.test.ts**（+134 行纯新增，既有用例零改）：

| # | 用例 | 断言要点 |
|---|---|---|
| ① | AOE 多敌朝最近敌 | e0(8,8) 东 cube1 / e1(5,8) 西 cube2（两敌吸附向不同使「最近」可观测）：cast 空格与 cast 远敌格均朝 e0={1,0}（旧「点击格定版」后者必 {−1,0} 红=废止直接锁）；附 2 条结算 targetId=['e0','e1'] 保序 |
| ②-a | aoeBoard 原局同 seed 双场 | 增量事件 JSON 全等 + hexFacing 全等（tie 同掷同数，SP-2） |
| ②-b | 对照布点双 seed 分臂 | e0(9,8)东/e1(5,8)西 同距平局：seed 5 → tie→e0={1,0}；seed 7 → tie→e1={−1,0}（实证值）；同 seed 复场恒同向（确定性背书） |
| ③a | 单敌朝该敌（cast/attack） | e0 左下邻格：cast 臂与 attack 臂均 {−1,1}（attack 臂=F1 未删的反向背书，§四-3） |
| ③b | 竖向邻格吸附回归锚（必做） | 上邻格 attack 后 hexFacing=(0,−1)（修复前误吸 {1,−1}）；下邻格=(0,1)（修复前 {−1,1}）；faceLeft 双向预置翻转锁 sign(2Δq+Δr)（修复前 Δcol=0 保持旧值必红） |
| ⑤ | 托管 AI 出技 AOE 朝最近敌（可选落地） | 自动局 faceTarget=最近敌 e0（左下）→ 终态 {−1,1}（修复前 AI 臂无收尾=末目标 e1 朝向 {1,0} 必红） |

## 三、架构决策说明

1. **② divergence 臂布点修正**：方案 §三.3-② 写「aoeBoard 原局」，但原局 e0(9,8)/e1(8,9) 两敌 cube 吸附**同为 E**（实证：seed 13/7 hexFacing 恒 {1,0}），tie 取值无法经 hexFacing 观测，「异 seed hexFacing 可不同」在原局几何不可满足。按方案 §四-1 自身锁法「平局/非平局**对照布点**」改用 e1=西 (5,8) 对照局承载分歧臂；②-a（原局）仍按原文落（SP-2 全等）。seed 对施工实证选定（方案明示授权）：临时扫描 seed 1..400 全枚举，E 族 189 / W 族 211、无第三态，取 **s1=5 / s2=7**（两局 hexFacing 实证值见上表 ②-b）。
2. **faceTargetOf session 自持**：同 §二.4-A 同理由（hex 零改动红线），不引 hex.ts 导出、不复用 pickTarget。
3. **悬置面零触碰**：④空放（:793 + 两处既有断言）原样；⑤可选落地因锁 aiAct 臂同规则（§二.1「零改动即获得」的行为背书）。
4. **渲染层面向排查**：ui/battle-hex-render.ts 仅 :969 读快照 `actor.facing` 翻转 billboard（契约消费），无面向相关硬编码——无扩权上报事项。

## 四、门禁自跑（贴原文对表）

| 门禁 | 要求 | 实测 | 判定 |
|---|---|---|---|
| typecheck / lint / build | 三零 | tsc --noEmit 零输出 / eslint 零输出 / tsc 零输出 | ✅ |
| test:battle | 基线 205+新增登记新数 | **211 passed**（205+6）/ 14 skipped（既有） | ✅ |
| test:behavior | 14/14 | 14 passed | ✅ |
| shot | 16 | 16 PASS（资源日志 hero:8/8 npc-shanzei:8/8 全 ok） | ✅ |
| e2e | 11 MATCH | 11 MATCH / 不符 0 / 预期红 0（EXIT=0） | ✅ |
| DBG | 0 | BE4 行 DBG残留 0 条；dbgAny 无残留 | ✅ |
| bundle rebuild + verTag bump | 是 | build.mjs 9 模块重建；verTag → v1788523938694 | ✅ |

## 五、§四 易错点 7 条自查

1. rng 纪律「平局才掷、恰掷 1 次」：ties==1 提前 return；ties≥2 恰 1 次；消费点在循环前=首次掷骰前；②-b 分歧臂间接锁 ✅
2. 回归锚：③b hexFacing (0,±1) + faceLeft 双向预置锁，修复前实现必红 ✅
3. 决策单点勿复裂：faceTarget 只在 resolveAoe 产生；doAttack F1 未删（③a attack 臂锁）；cast 分支无重复调用 ✅
4. :612-625/:654-671 零改（④联动唯一合法依据=Leo 复核，未到）✅
5. targets 禁 sort/勿复用 pickTarget：faceTargetOf 单遍历 min+filter 保序 ✅
6. 锥形涟漪：未补锥形用例（无 session 级既有用例；不按旧实现自反推断言）✅
7. 跨版本事件流不逐字节相等=预期（平局场掷骰位移 1 位），回归基准=本档走向表+SP-2 同版本双场 ✅

## 六、红线核查

- types.ts / battle-core / hex / battle-input / config / ui / proto 源码：**零 diff**（git status 佐证；proto 下仅 bundle.js+index.html=门禁要求的 rebuild 产物与 verTag）。
- mock_session.ts：零同步（静态手摆 facing 字面量，未触碰）。
- shot 重摄 PNG（22 张字节级噪声，FACE-1 无视觉变更）：已 `git checkout --` 还原，不入本提交。
- 提交：路径级 `git commit <路径>`，不 push，停等 PM 复验。
| 09-04 | ZCode(主架构) | ✅ 技术验收放行 | 方案符合性逐条过/两口径修正独立推演正确/红线零碰/既有断言纯新增零改写/§四 7 条全过/偏差裁定正当/seed 对复跑属实；2 条备忘不阻断：③b 注释过述（断言本身正确）+ faceTargetOf 无空数组守卫（当前不可达）——随下次触碰该文件顺带处理 |
| 09-04 | ZCode(PM) | ✅ 四门复验通过 | 独立复跑：211 绿 14 跳（新基线 205+6）/行为面 14/14/shot 16 PASS/e2e 11 MATCH/DBG=0/verTag v1788523938694/三零；红线文件空 diff、测试 134/0 纯新增独立确认；已 push；待 Leo L 环（含空放朝向 §六-1 复核项） |
