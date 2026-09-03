# T20-FE · 战斗格子施放前端（input 统一 cast + D-13 热区 + 红名单重写转绿）

> **状态：🔒 待前置（T20-BE 合流后才开工领单）** · 优先级：P0 · 发单：2026-09-03 ZCode PM
> **执行者：frontend 子智能体（授权文件清单见 §4）**
> 依据：《战斗格子施放与热区修复方案-v0.1》（本卡需求表=§3.3/§四/§五/§六-FE 终门逐条，Leo 六条放行）；行为真源=《战斗交互行为规格》v2.1（ATK-2/6/7、SEL-5②、HIT-1）
> 关联：**前置=T20-BE 合流（cast 契约+session 分支在库）**；本卡=四门终验卡

## 1. 批次口径

| 项 | 定版 |
|---|---|
| 本卡（二批 FE） | input 统一 cast 派发（方案 B）+ D-13 热区几何标定（HIT-1）+ 红名单四处重写转绿（N2-①②/BE2/BE3）+ :339 配套改写 + bundle rebuild/verTag；**四门终验** |
| 已批口径 | 特/绝选中点任何格（含敌逻辑格）一律派 `cast`（方案 B）；自己格=受理空放（特判，高亮不含）；普攻态三分支（target attack/无选中绿格/T19 演出位拦截）与 qing 态零改动；装饰件（横杆/挂绳/流苏）不设热区 |

## 2. 需求表（唯一真相=方案 §3.3/§四/§五/§八 FE 表）

| # | 需求 | 方案依据 |
|---|---|---|
| 1 | input 两处改写：target 命中分支 skill 态改派 `cast`（qing return/普攻 attack 不变）；尾分支改 castable（射程内∪自己格）→cast / 否则 cancelSkill；分支序不变 | §3.3 |
| 2 | D-13：每可点部件标定矩形+tolRatio 0.15（复量核定）落 config；纯函数 pickCtrlButton/pickPlaqueButton 替换外接矩形判定；装饰件不设热区；HIT-1 fall-through 新例 | §四 |
| 3 | 红名单四处重写转绿（新旧对照表逐条）+ :339 随卡改写（注明 ATK-2 v2.0）+ 登记簿两处回填 + e2e expectRed 翻转（BE3 拆 BE3a/BE3b，用例 4→5） | §五 |
| 4 | bundle rebuild + verTag bump + preview 刷新目验 | §六-④ |

## 3. 领单第一交付（开工前置核验 + 铁律 4）

开工前先核验 T20-BE 已合流（主套件含 cast 新例全绿）；随后交付基线复跑原文+口径复述+疑义清单+用例清单（:339 改写/热区对表/HIT-1 新例/BE3a/b 断言级）+由用例长出的易错点（与方案 §七 FE 侧 11-21 互补），停等 PM「✅确认开工」。

## 4. 授权文件清单（仅限）

`ui/battle-input.ts`、`config/battle-hex.ts`（热区常量）、`tests/battle-hex-render.test.ts`（:339 改写+热区对表+HIT-1 新例）、`tests/battle-behavior.test.ts`（N2-①②重写+登记簿）、`proto/battle_demo/behavior_e2e.mjs`（BE2/BE3 重写+翻转）、`proto/battle_demo/bundle.js`+verTag（重建产物）、`proto/battle_demo/cutout/measure_hotzones.mjs`（标定脚本入库，可选）
🚫 禁碰：battle-core/session/types/mock_session/main.ts 调试段；qing/普攻/T19 拦截分支；渲染层禁 import battle-core

## 5. DoD（四门终验，§六-FE 终门）

①主套件全绿（新基线数登记）②行为面 **0 红**（N2-①②转绿，既有绿锁不变）③shot 16/16 + e2e BE1/BE2/BE3a/BE3b/BE4 全符合预期 exit 0 ④DBG=0+verTag bump 目验；三零；文件清单+决策说明+红线自查；回执总表；commit 显式清单不 push 停等 PM 复验。

## 更新记录

| 日期 | 变更 | 签字 |
|---|---|---|
| 2026-09-03 | 创建：方案 §八拆单 FE 卡，锁定前置=T20-BE 合流 | ZCode PM |
