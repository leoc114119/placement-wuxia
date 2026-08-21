# 放置武侠 · 冲刺计划 v0.1（Epic/Story 拆分 + Sprint 0）

> 状态：**草稿（待 Leo 审）**
> 日期：2026-08-19
> 定位：Phase 5 制作开工的冲刺基准。MVP 7 步拆成 Epic/Story（全景路线图），Sprint 0 任务细化到可执行。
> 依据：`02-MVP开发规格-v1.md` §4 开发顺序、`08-开发计划-v0.1.md` 阶段一、`07-审查清单与记录-v0.1.md` 三环验收。
> 关联：`20-主架构文档.md`（模块边界/契约）、`21-ADR-基础层.md`（架构决策）、`23-测试策略.md`（质量门禁）。

---

## 0. 总览

### 0.1 MVP 路线图（Epic 全景）

| Epic | 对应 MVP 步骤 | 核心目标 | 建议冲刺 | 完成标志（验收三关通过） |
|---|---|---|---|---|
| **E0 工程地基** | 第 1 步 | 最小工程在微信开发者工具显示画面，三环流程跑通 | **Sprint 0（本周）** | 空 Canvas 画面 + 开发/测试/验收闭环 ≥1 次 |
| **E1 后端结算与存档** | 第 2 步 | settle/save/load 云函数 + 文字输出验证 | Sprint 1（下周） | 云端结算正确、存档可读回 |
| **E2 挂机循环** | 第 3 步 | 学点跳动，极简 UI | Sprint 1 | 挂机 5 分钟数值可见增长 |
| **E3 学武功** | 第 4 步 | 属性/学点条件校验 | Sprint 2 | 学到新武功 → 战力提升 |
| **E4 战斗 3v3 战棋最小版（仅 BOSS 关）** | 第 5 步 | 常规机制先行（卖点后接，见 00-阶段诊断 G2）；Leo D-01 拍板：3v3=1 主玩家+2 好友助战；**Leo 2026-08-19：仅 BOSS 关切战棋，普通关自动打怪动效** | Sprint 2 | BOSS 战棋（3v3 站桩）+ 普通关扫荡动效 + battleLog 演出 |
| **E5 刷怪点** | 第 6 步 | 解锁链 + 掉落 | Sprint 3 | 能打到更高级怪 |
| **E6 闭环验收** | 第 7 步 | 挂机→结算→存档→学武功→变强 | Sprint 3 | 02 规格 Demo 验收标准全勾 |

> 铁律（02 §4）：上一步未验收，不进下一步。Sprint 0 只做 E0。

### 0.2 Sprint 0 目标

> **最小工程在微信开发者工具显示画面，跑通「开发 → 验证 → 验收 → 复盘」闭环。**

- 时间窗：本周（08-19 ~ 08-23，对齐 08 计划阶段一）
- 负责人：ZCode（开发） / CodeBuddy（测试） / Leo（验收）
- Sprint 0 完成定义（DoD）：
  - [ ] 微信开发者工具能打开项目并显示画面
  - [ ] 开发/测试/验收 三环完整跑通 ≥ 1 次，审查记录第一条已落 `07-审查清单与记录-v0.1.md`
  - [ ] 工程层六项检查全绿（编译/类型/静态/单测/模拟运行/设计一致性）
  - [ ] AGENTS.md、07 清单、本冲刺计划经实际使用，问题已修正

---

## 1. Epic/Story 拆分（MVP 7 步全景）

### 1.0 E0 工程地基（Sprint 0 范围）

| Story | 描述 | 涉及文件 | 依赖 |
|---|---|---|---|
| **S0-1 环境就绪** | 微信开发者工具可打开小游戏项目；云开发环境开通（本项目 Sprint 0 只用本地画面，云环境可后置到 Sprint 1 前） | 项目根、`project.config.json` | 无 |
| **S0-2 工程骨架** | TypeScript 工程初始化：tsconfig strict、目录结构（src/ 下 scenes/systems/ui/net/config、cloudfunctions/）、npm scripts（typecheck/lint/test） | `tsconfig.json`、`package.json`、`eslint.config.mjs`、目录骨架 | S0-1 |
| **S0-3 最小 Canvas 画面** | `game.ts` 入口 + 主循环 + 空场景绘制水墨背景与一行标题字；微信开发者工具能显示 | `game.ts`、`src/scenes/main.ts` | S0-2 |
| **S0-4 场景管理最小实现** | SceneManager（switch）+ Boot→Main 场景切换；统一 Scene 接口 onEnter/onExit/update/draw | `src/scenes/scene-manager.ts`、`src/scenes/boot.ts` | S0-3 |
| **S0-5 类型/数值骨架** | `types.ts` 最小 Player 契约 + `config/numbers.ts` 只读展示配置（含 GameNumbers 接口咬合） | `src/types.ts`、`src/config/numbers.ts` | S0-2 |
| **S0-6 工程层检查全绿** | typecheck/lint/test 三条命令在 node 环境全绿；最小单测跑通 | `tests/`、`package.json` scripts | S0-3、S0-5 |
| **S0-7 微信预览 + Leo 三关验收** | Leo 在微信开发者工具 + 真机预览看到画面；三关（效果/可维护/稳定）通过 | — | S0-3~S0-6 |
| **S0-8 流程复盘 + 审查记录** | 三环流程复盘；审查记录第一条落盘；流程问题修正回写 | `07-审查清单与记录-v0.1.md`、`AGENTS.md` | S0-7 |

**E0 验收标准（Sprint 0 DoD，见 §0.2）**

### 1.1 E1 后端结算与存档

| Story | 描述 | 涉及文件 | 依赖 |
|---|---|---|---|
| **S1-1 契约类型冻结落地** | `types.ts` 契约类型（SettleRequest/Response、Player、错误码）+ 云函数 `common/contract.js` 副本 | `src/types.ts`、`cloudfunctions/common/contract.js` | E0 |
| **S1-2 settle 核心（core.js 纯函数）** | 结算核心抽成纯函数：idle 挂机结算（学点/熟练度）、learn 学武校验（资源/前置/已学）、battle 占位；requestId 幂等；服务端时间锚 | `cloudfunctions/settle/core.js`、`cloudfunctions/settle/index.js` | S1-1 |
| **S1-3 save/load** | 读档返回 Player；save 显式落库确认；无档引导建号 | `cloudfunctions/save/`、`cloudfunctions/load/` | S1-2 |
| **S1-4 云端文字验证** | 云函数在开发者工具云端测试/日志输出结算结果与存档可读回（02 第 2 步验收） | 云开发控制台 | S1-2、S1-3 |
| **S1-5 契约测试** | 客户端类型 ↔ 云函数返回结构一致性断言（见 23 测试策略 §4） | `tests/contract/` | S1-2 |

**E1 验收标准**
- [ ] settle idle 结算输出符合 `13-战斗数值设计` 框架（学点产出正确）
- [ ] 存档写入 players 集合，load 可读回，字段与 `types.ts` 一致
- [ ] requestId 幂等：同一请求重放不重复结算
- [ ] 契约测试全绿

### 1.2 E2 挂机循环

| Story | 描述 | 涉及文件 | 依赖 |
|---|---|---|---|
| **S2-1 net/cloud.ts** | 云函数调用唯一出口：封装 callFunction、错误归一、requestId 生成 | `src/net/cloud.ts` | E1 |
| **S2-2 systems/growth** | 挂机流程编排：启动 load → 周期/回前台 settle(idle) → 更新展示态 | `src/systems/growth.ts` | S2-1 |
| **S2-3 挂机极简 UI** | Main 场景画学点数字跳动（读展示态，零计算）；预估收益文案标"约" | `src/ui/render.ts`、`src/scenes/main.ts` | S2-2 |

**E2 验收标准**
- [ ] 挂机 5 分钟 → 学点可见增长（settle 返回驱动）
- [ ] 退出重进 → 离线收益补结算正确（服务端时间锚）
- [ ] UI 只读展示，无计算逻辑（CodeBuddy 静态检查确认）

### 1.3 E3 学武功

| Story | 描述 | 涉及文件 | 依赖 |
|---|---|---|---|
| **S3-1 武学列表展示** | 门派武学/基础武学列表按 `11-武功数据表` 渲染（只读） | `src/ui/`、`src/config/` | E2 |
| **S3-2 learn 流程** | 点学武 → settle(learn) → 校验失败提示 / 成功更新展示态 | `src/systems/growth.ts`、`src/net/cloud.ts` | S2-1 |
| **S3-3 学武条件校验** | 云端校验学点/银两/前置武功等级/已学；错误码 1002/1003 映射提示 | `cloudfunctions/settle/core.js` | S1-2 |

**E3 验收标准**
- [ ] 学点/银两不足 → 1002 提示，不扣资源
- [ ] 前置未满足 → 1003 提示
- [ ] 学到新武功 → 面板更新、战力展示提升（03/10 设计一致）

### 1.4 E4 战斗 6v6 战棋最小版

| Story | 描述 | 涉及文件 | 依赖 |
|---|---|---|---|
| **S4-0 好友助战来源** | 微信好友关系链取 2 名好友角色 → 云端返回角色快照（`friendSnapshot` 契约字段）；每日助战限次 3 次（14 设计）；机制细节 Sprint 1 收尾前拍板 | `src/net/cloud.ts`、`cloudfunctions/common/contract.js`、`src/config/numbers.ts` | E1（S1-1） |
| **S4-1 战斗契约** | battleLog 结构冻结（每 tick 动作序列：单位/行为/目标/伤害/位移） | `src/types.ts`、`cloudfunctions/common/contract.js` | E1 |
| **S4-2 云端战斗结算（站桩版）** | 3v3 站桩自动战斗（1 主玩家 + 2 好友助战）：行动条、普攻/武功、伤害公式（13 设计）；返回 battleLog | `cloudfunctions/settle/core.js` | S4-1 |
| **S4-3 Battle 场景（log 播放器）** | 棋盘渲染 3v3 单位 + 按 log 播放动画（1x/2x/4x/快进到结果）；**零判定** | `src/scenes/battle.ts`、`src/ui/fx.ts` | S4-2 |
| **S4-4 战斗入口** | Main 场景"闯荡"→ Map → 普通关"挑战"（扫荡动效）/ BOSS 关"挑战"（进 Battle）→ 结算返回 → 展示结果与掉落 | `src/systems/battle.ts`、`src/scenes/main.ts`、`src/scenes/map.ts` | S4-3 |
| **S4-5 普通关扫荡动效** | 普通关自动打怪动效：主角自动攻击小怪 + 伤害飘字 + 进度条，客户端只播表现（Leo 2026-08-19：普通关不进战棋）；结算仍走 settle | `src/ui/fx.ts`、`src/scenes/main.ts` | S4-2 |

**E4 验收标准**
- [ ] 3v3 站桩版战斗可完整播完（1 主玩家 + 2 好友助战），伤害/胜负与云端结算一致（CodeBuddy 模拟运行比对）
- [ ] 可借用 2 名好友角色组成 3 人阵，每日限次生效
- [ ] 倍速与快进正常
- [ ] 战斗结果（胜负/掉落）由 settle 返回，客户端无判定逻辑
- [ ] 战斗范围/武器形态按 03 设计（最小版先普攻+单体武功，范围形态后接）

> 标注（G2 卖点后定）：本 Epic 用常规机制，独有战斗机制不在 MVP 阻塞内；若后续卖点改变战斗核心，仅改 S4-2/S4-3 范围内逻辑，不波及 E0-E3。

### 1.5 E5 刷怪点

| Story | 描述 | 涉及文件 | 依赖 |
|---|---|---|---|
| **S5-1 地图/关卡展示** | 地图列表 + 解锁状态（读展示态） | `src/scenes/main.ts`、`src/ui/` | E4 |
| **S5-2 解锁链** | 推图胜利 → 解锁下一关卡（云端判定，mapUnlock 预留） | `cloudfunctions/settle/core.js` | E4 |
| **S5-3 掉落** | 战斗胜利掉落（装备/学点/实战），入 delta.loot | `cloudfunctions/settle/core.js`、`src/ui/` | S5-2 |

**E5 验收标准**
- [ ] 打赢 → 解锁更高级怪，能打到更高级怪
- [ ] 掉落正确入包/展示
- [ ] 打输 → 失血过多状态生效（12 设计）

### 1.6 E6 闭环验收

| Story | 描述 | 涉及文件 | 依赖 |
|---|---|---|---|
| **S6-1 闭环串测** | 挂机→结算→存档→学武功→变强 全链路手动/脚本串测 | 全量 | E0~E5 |
| **S6-2 Demo 验收** | 对照 02 §5 Demo 验收标准逐条勾选；问题进 backlog | 全量 | S6-1 |

**E6 验收标准（= 02 §5）**
- [ ] 挂机 5 分钟 → 数值可见增长
- [ ] 学到新武功 → 战力提升
- [ ] 能打到更高级怪
- [ ] 云函数结算正确、存档可读回
- [ ] 美术风格试验：10 张素材风格统一（联动 art-director 交付）

---

## 2. Sprint 0 任务清单（可执行版）

> 负责人缩写：**Z**=ZCode 开发、**C**=CodeBuddy 测试、**L**=Leo 验收（拍板）。
> 每项任务完成即触发「Z 产出 → C 测试 → L 验收」三环；任一环失败 → 打回 Z 修改（07 清单规则）。

| # | 任务 | 负责人 | 预计产出 | 验收标准 | 依赖 |
|---|---|---|---|---|---|
| **T01** | 环境就绪：微信开发者工具可打开小游戏项目；注册云开发环境（可后置到 Sprint 1 前）；安装 node/npm | L + Z | 开发者工具可新建/打开小游戏工程；CLI `node -v` 正常 | Leo 确认工具打开项目无环境报错 | — |
| **T02** | 工程骨架：TypeScript 初始化 + 目录结构 + npm scripts | Z | `tsconfig.json`（strict）、`package.json`、`eslint.config.mjs`、`src/` 与 `cloudfunctions/` 目录骨架 | C：`npm run typecheck` 对空骨架 0 error；目录与主架构 §6 一致 | T01 |
| **T03** | 最小 Canvas 画面：`game.ts` 入口 + 主循环 + 空场景绘制 | Z | `game.ts`、`src/scenes/main.ts`（画墨色背景 + 标题"放置武侠"） | C：编译/静态通过；L：微信开发者工具预览显示画面 | T02 |
| **T04** | 场景管理最小实现：SceneManager + Boot→Main 切换 | Z | `src/scenes/scene-manager.ts`、`src/scenes/boot.ts`；切换日志可观察 | C：单测断言 switch 生命周期（onExit→onEnter 顺序）；L：预览切场景不闪崩 | T03 |
| **T05** | 类型/数值骨架：`types.ts` Player 契约最小版 + `numbers.ts` 展示配置 + 咬合 | Z | `src/types.ts`（Player/GameNumbers/错误码枚举）、`src/config/numbers.ts` | C：类型检查通过；无硬编码数值（扫描）；契约字段与主架构 §5 一致 | T02 |
| **T06** | 工程层检查全绿：typecheck/lint/test 三条命令跑通 | Z + C | `npm run typecheck` / `lint` / `test` 脚本；`tests/` 最小单测（SceneManager、NUMBERS 完整性） | C：三条命令 0 error 全绿；模拟运行脚本可执行 | T04、T05 |
| **T07** | 微信预览与真机预览 | L | Leo 在开发者工具 + 手机预览看到画面 | L：效果关通过（画面正常、无报错） | T06 |
| **T08** | Leo 三关验收（E0 DoD） | L | 三关签字：效果/可维护/稳定 | L：三关全过；不过则打回 T03~T06 对应项 | T07 |
| **T09** | 流程复盘 + 审查记录第一条 | C | `07-审查清单与记录` 追加记录（第 1 条）；流程问题清单 | C：记录格式符合 07 §3；问题已归类（流程/工具/文档） | T08 |
| **T10** | （可选，流程顺利才做）UI 素材 2-3 张走通 | L + Z | 生成 2-3 张 → `assets/ui/` → Z 按 README 拼装预览 | L：预览正常、风格统一（04 规范）；走通即验证 06 流程 | T08 |

**Sprint 0 时间安排（建议，按半天粒度）**

| 日期 | 上午 | 下午 | 里程碑 |
|---|---|---|---|
| 08-19（今日） | 文档定稿（本冲刺计划 + 架构 ADR 评审） | T01 环境就绪 + T02 骨架 | 可开工 |
| 08-20 | T03 最小画面 | T04 场景管理 | Z 产出完成 |
| 08-21 | T05 类型/数值 + T06 检查全绿 | C 全量工程层测试 | 工程层通过 |
| 08-22 | T07 微信/真机预览 | T08 Leo 三关验收 | 三环跑通 |
| 08-23 | T09 复盘 + T10（可选）素材 | 修正流程文档 | Sprint 0 关闭 |

---

## 3. 依赖与前置（Sprint 0 门槛）

- [ ] 本冲刺计划 + `20-主架构文档` + `21-ADR-基础层` 经 Leo 评审（PASS 或 CONCERNS）
- [ ] 微信开发者工具已安装（T01）
- [ ] design-strategist 的设计评审问题与本冲刺计划闭环（主理人汇编时核对）
- [ ] 好友机制细节（好友快照实现/助战限次）Sprint 1 收尾前拍板（Leo D-01 已定 3v3 规模，S4-0）

## 4. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 微信开发者工具/云开发环境未就绪 | T01 阻塞 | T01 放第一天；云环境可后置不阻塞画面 |
| Canvas 自绘效果与预期不符 | 效果关失败 | 最小画面极简（背景+文字）；效果标准以 Leo 为准 |
| 三环流程第一次跑不顺 | Sprint 0 延期 | 流程问题本周内修完，不带到下周（08 计划原则） |
| 契约/架构评审未过就开工 | 返工 | 开工质量门：PASS 才进 T03 |

## 5. 变更记录

| 日期 | 版本 | 变更 | 签字 |
|---|---|---|---|
| 2026-08-19 | v0.1 | 创建：Epic/Story 拆分 + Sprint 0 冲刺计划 | 待审 |
| 2026-08-19 | v0.2 | E4 按 Leo D-01 拍板改 3v3（1 主玩家+2 好友助战）；新增 S4-0 好友助战来源 Story；前置补充好友机制拍板项 | Leo ✅ |
