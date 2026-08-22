# T06 交付回执 · 战斗界面（8×12 战棋呈现 + 棋子表现 + 武功光影）

> 交付：2026-08-22 17:40 · ZCode · 状态：待 C 环验收
> 施工依据优先级：A1-T06 v2 裁决 > 75 v2.1 原文 > 工单索引（工单定序）

## DoD 勾选（Z 环代码层）

- [x] typecheck / lint / build 三零；`test:battle` **51/51**（既有 38 不回归 + T06 新增 13）
- [x] 新增用例覆盖工单 9 组：①投影往返（全棋盘 96 格）②行动条 fillRate 公式+满触发 ③自动优先级（MVP 无内力全普攻口径断言）④移动终点=格中心 ⑤轻功跳跃（置灰/范围×2/扣内力10/位移/二选一消耗）⑥范围格生成+越界 clamp+占用排除 ⑦同 seed 双模式事件流全等（自动+手动脚本各两场）⑧胜负/90s 超时/托管双阈值/逃跑 ⑨阵亡变灰（death 事件恰一次）+ 帧循环防回归
- [x] node 模拟：双模式对局时间线（见 §node 模拟摘要）
- [x] 双写登记（threads/T06.md + LOG.md）+ git 提交 + 本回执

**GUI 类（留 L 环点验，不做截图自证）**：布局与 75 §0 一致 · billboard/朝向/比例观感 · 光影四段观感 · 按钮触控 · 镜头跟随 · 头顶三行/光圈 · 结算遮罩

## 架构决策与引擎对接说明（C 环重点）

1. **battle-core 抽取导出（A1 Q1 方案 A，行为零变更）**：`act()` 内「命中(F-04)+伤害(F-01)+结算应用」段零变更搬运为导出函数 **`resolveAction(actor, target, skill|null, rng): ActionOutcome`**——一次调用返回该次出手**全部日志条目（按引擎原顺序：fallback→basic/miss / blocked 单条 / skill|miss）**+ 结算数值；副作用契约：skill≠null 扣内力写冷却、命中写 target.hp；skill=null 射程不足返回 blocked（不消耗不结算）。`act()` 结算段替换为纯调用 + round/t 补齐。**等价性证据：T05 既有 14 用例全绿；diff 中除该函数与调用处外无任何改动**（另有两处纯类型层放宽：resolveDamage 参数 Runner→CombatantInput，结构兼容）。演出层出招（自动/手动/试探普攻）全部同源走 resolveAction，数值唯一真值不分叉。
2. **数值归属（A1 裁决执行）**：移动/走位在演出层算（F-06 公式 `moveRange`，纯表现位移）；射程判定+命中+伤害在引擎侧（技能射程筛用已导出的 `skillRange`，普攻射程通过 resolveAction 的 blocked 语义探测——试探调用 quiet=true 静默不污染事件流）；行动条用引擎 `fillRate`；托管用引擎 `stepManualTimeout`；敌方数量用 `rollEnemyCount`（玩家 shizhan=0 → 1 只）。
3. **行动经济（A1 Q8 老网金二选一）**：行动条满 → 移动或出招二选一，执行后 bar-=100；保留特例：移动到位敌人相邻 → 自动普攻（`basicIfAdjacent`，不另耗行动）；轻功跳跃属移动段（扣内力 10，抛物线演出）。
4. **托管时钟协调（本单发现并处理）**：90s 托管阈值与 90s 防死循环总时长同钟——headless 挂机时总时长先把对局判负，trust 事件在整场层面不可达（引擎 T05 只单测过状态机；其回执已注「实战中托管事件在 T06 接入玩家指令时钟后才有完整意义」）。演出层口径：**pendingManual 等待期冻结总时长时钟**（防死循环不烧玩家思考时间；托管 idleSec 由引擎状态机独立累计）——trust/switchAuto 在真实对局可达。用例 8 断言双阈值事件出现。
5. **战斗朝向随机（§1b.1）**：session 持 `facingFlip`（rng 派生），仅渲染层投影 y 翻转（`projectGrid`/`screenToBattleGrid` 双还原），逻辑固定我 y=10 敌 y=1。
6. **fx 跨层单向**：状态机 `pendingFx` 队列（结算时入队，含目标格/范围半径/品阶）→ 渲染层 `drainFx()` 搬运至 fxBook 播放（四段时序：范围高亮→蓄力 0.1s→主效环 0.3~0.5s→闪白消散）；状态机不 import 渲染模块。
7. **调试双入口（A1 Q12）**：preview `?battle=1&seed=N`（页面设 `globalThis.__BATTLE_DEBUG__` 后加载 game.js）+ console `wx.__enterBattle(seed)`；结束遮罩点击任意处返回江湖（session 主角位置口径保持——scene 系统单例未销毁）。
8. **UI 全代码绘制**（ref_battle_ui_v4 仅风格）：顶栏三件套（头像+朱砂血条+**黛蓝 #4A7A9B 内力条**一整块面板，锚顶避胶囊）；左下 [属][装][退] / 右下 [⚙][⏩] 竖排圆钮 + 特/轻/绝悬浮钮**同规格统一常量**（ROUND_BTN）；[属]/[装] 占位面板开合（battleLayout.panel，内容不验，A1 Q4）；结算遮罩=胜负+战报统计+奖励/疗伤**占位文案**（A1 Q5，待 T07）。
9. **格子=唯一几何真源**：代码绘制 96 个菱形描边叠 scene_battle（无格线版，以棋盘世界中心 cover 随相机平移）；镜头以主角为中心、视窗 clamp 不脱出包围盒、无缩放（§1b.2；固定镜头切换按 A1 Q10 砍）。

## node 模拟摘要（双模式 · seed=20260822）

```
=== 自动模式 ===  won，55.1s，31 事件
  t=7.9  player blocked（射程外，静默）→ move(4,8)（AI 走位接敌）
  t=8.7  enemy-0 blocked → move(3,1)
  …双方逐格接近（各 ~8s/次行动，F-05 条速）
  t=26.1 enemy-0 basic → player 伤1（进入互殴）
  t=31.5 player fallback+basic → enemy-0 伤109（atk119-def30 破防保底口径）
  …互殴至 t=55.1 enemy-0 hp=0 → death → win
  终态 hp：player 96 / enemy-0 0
=== 手动模式（脚本=点绿格边缘）===  lost（timeout-hp 90s），65 事件
  bar-max → tapCell 移动（二选一）→ 敌方逼近 → 90s 未接敌 → hp 100 vs 300 判负
  （脚本策略故意低劣以验证 timeout 路径；bar-max/move/blocked 行为正确）
=== 确定性 ===  同 seed 自动两场 / 手动脚本两场：事件流 JSON 全等 ✓；不同 seed 布局/事件不同 ✓
```

## 改动文件

| 文件 | 变更 |
|---|---|
| `systems/battle-core.ts` | **方案 A 抽取导出** `resolveAction` + `ActionActor/ActionOutcome` 类型；act() 结算段改调用；resolveDamage 参数类型放宽（Runner→CombatantInput）。**零数值/规则改动（diff 可审）** |
| `config/battle.ts` | **新增**：棋盘几何（TS=44/THW/THH）、镜头、比例分档（1.2/0.8/×1.3）、移动/F-06、fx 四段时序、BATTLE_FRAME 帧映射、BAR 色值（含 MP_BAR #4A7A9B）、顶栏/圆钮/特轻绝布局、加速倍率、调试入口标记 |
| `config/npcs.ts` | NpcConfig 战斗区接线：battleNums（hp/atk/def 取配置文档 §3 初稿；jimin/danshi 演出占位）+ bodyKind |
| `systems/battle-ui.ts` | **新增**：演出状态机（gridToWorld/worldToGrid/manhattanDist/moveRange/reachableCells/skillRangeCells/facingByDx/battleWalkFrame 纯函数 + createBattleSession：行动条/二选一/托管/胜负/90s/逃跑/手动输入 API/facingFlip/pendingFx） |
| `ui/battle-render.ts` | **新增**：renderBattle（背景/格子/绿金格/棋子 billboard/头顶三行/光圈/fx/顶栏/圆钮/特轻绝/遮罩）+ computeCamera/screenToBattleGrid/cornerButtonLayout 导出 |
| `game.ts` | 江湖⇄战斗双模式切换；调试双入口；战斗触摸分派（按钮>格子，flip+相机反变换）；fx 搬运 |
| `systems/scene.ts` | **纯增量**：bindTapInput 返回解绑函数 + TouchHooks.offTouchEnd 可选（进战斗屏蔽江湖触摸；绑定逻辑零变更） |
| `env.d.ts` | wx.offTouchEnd 可选声明 |
| `ui/assets.ts` | 追加 loadBattleAssets（战场背景+hero/NPC/Boss 帧表 00~06） |
| `tests/battle-ui.test.ts` | **新增**：13 用例（9 组+帧循环） |
| `preview/game-preview.html` | FILES 补 5 个新模块；?battle=1&seed= 参数；说明行 |

## 决策记录（🟡 自由区，回执留痕）

- 自动走位：无武功可用且普攻 blocked 时，向最近敌移动（移动力全走，选「距敌最近、平手取离己近」格）——规格未定步数，取快速接敌口径。
- 轻功跳跃范围 = 移动力 × 2（`MOVE.qinggongRangeFactor`，config 可调）——75 只说「更大范围」。
- 战斗内 walk 帧频 140ms（江湖 160ms，战斗节奏略快）。
- 敌方 jimin=15/danshi=5/shizhan=0 为演出组装占位（配置文档 §3 的 speed 字段无引擎对应，待 64 定稿回填）。
- fx 视觉：统一「范围菱形高亮+扩散环+闪白」模板（品阶换时长/色深）——§8c 允许自由视觉参数，武器形态差异化模板（剑气/刀罡等七形态）留 L 环观感反馈后细化。

## 已知边界（不属本单）

- 场景点怪接线（后续单）；暗器手动出招（A1 Q6 整体后置）；门派技能触发（fx 接口预留，数据不可达）；战斗回放 UI（A1 Q11 不做）；奖励/疗伤数值（T07）。
- 敌方 AI 无武功 → 普攻+走位；Boss 狼王帧表已预载但青牛山池无 Boss（T07 数据接入）。
