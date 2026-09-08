# Q1-TASK-AS-v03：施工基座与任务卡前提不符（origin/main 不含 AS v0.2 代码）

> 提问人：backend-battle（ZCode）· 2026-09-07 · 状态：✅ 已裁定（候选 A）
> 任务卡：TASK-AS-v03（两段式伤害时序改写 v0.3 增量卡）
> 停工依据：AGENTS 置顶铁律（收到指令有疑义马上询问，禁自行假设）——任务卡明示开工命令与仓库事实冲突。

## 一、疑义（一句话）

任务卡开工命令为 `git checkout -b task/attack-speed-v03 origin/main`，括注「**main 已含 BE/FE 验收代码+方案 v0.3**」；但经 fetch 后核实，**origin/main（tip `0bba6db`）只含方案 v0.3 文档与 ARCH 验收记录行，不含 AS v0.2 BE/FE 代码**——v0.3 增量改写的全部「既有结构」（scheduleSkillCast / pendingCasts 双节点 / resolveSkillSegment / battle-cast 26 用例 / shot_as_cast.mjs）不在 main 上。

## 二、只读核查证据（2026-09-07 fetch 后）

| 核查项 | origin/main（0bba6db） | origin/task/attack-speed-fe（676c8c6） |
|---|---|---|
| `systems/battle-session.ts` 含 pendingCast/scheduleSkillCast | **0 处** | 18 处（v0.2 完整实现） |
| `types.ts` 含 castSpeed/PendingCast | 0 处 | 2 处（castSpeed/internalCastSpeed 已入库） |
| `tests/battle-cast.test.ts` | **不存在** | 637 行 26 用例 |
| `proto/battle_demo/shot_as_cast.mjs` | 不存在 | 在（证据链脚本） |
| `fcd7067`（BE v0.2）/`fe37cf4`（FE v0.2）是否 main 祖先 | **均否** | 是 |
| 方案 v0.3（4015739） | 在 | 否（fe 基点=方案 v0.2 提交 2ab93f9） |

- main 上 `48d0edd`（AS 后端验收）/`f3f7794`（FE seq94 验收）两提交 **只改了方案文档+LOG+ARCH-AS.md**（`git show --stat` 证实），验收是主架构在**独立副本**复核 `task/attack-speed-fe` 分支完成的（ARCH-AS.md 表行原文「独立副本锁定 676c8c6 复核」），代码分支**从未并入 main**。
- 分叉关系：`merge-base(origin/main, origin/task/attack-speed-fe)=2ab93f9`；main 独有 18 提交（T45 2b 美术、方案 v0.3、ARCH 验收行、PM 文档），fe 独有 6 提交（BE v0.2 ×3、FE v0.2 ×2、需求 v1.3 文档）。fe **已包含** main 侧全部战斗硬化提交（db40682 AI-1/GATE-1、a3e6329 防御加固、a2249fd FACE-1、63dac3e T45 phase1）。
- 试合并（`git merge-tree`，只读）：fe+main 冲突面仅 `tasks/LOG.md` 与 `tasks/threads/ARCH-AS.md` 两个记账文件（追加式表格），代码/美术/文档全部干净。

## 三、为什么不能自行任选（两种以上理解）

1. **按卡面字面**（基座=origin/main）：main 无 v0.2 代码 →「段1 从 t1 排程改为 t0 内联」「删除 t1/t2 双节点」无从谈起，等于从零全量施工（方案 §6 全量 8~10h），违背卡意「增量 3~4h」与方案 §状态「BE seq=92、FE seq=94 的既有实现作为增量基础」。
2. **按卡意推定**（基座=含 v0.2 代码的分支）：需偏离卡面开工命令——基座选择影响 commit 谱系、门禁基线（303+14 在 fe tip 上）、交付复核对象，属不可静默自决项。

## 四、候选处置（供 PM 裁）

| 选项 | 内容 | 代价/风险 |
|---|---|---|
| **A（建议）** | 我在 `task/attack-speed-v03` 上自行完成 `origin/task/attack-speed-fe`（676c8c6）+ `origin/main` 的合并（冲突仅 LOG/ARCH-AS 两记账文件，按双方表行全保留合并），再施工 v0.3 | 合并提交入本卡分支；fe→main 的正式并线仍留给 PM |
| B | PM 先把 task/attack-speed-fe 并入 main 并推远端，我按卡面原命令重新 checkout 施工 | 多一轮等待；谱系最干净 |
| C | 基座=origin/task/attack-speed-fe 单独（不合 main） | 缺方案 v0.3 文档与 T45 2b 美术入库；shot 基线与 main 演进脱钩 |

## 五、停工范围

仅停「建基座+落码」。已完成（权限内）：需求复述+用例清单（见交付报告）、v0.2 实现只读预习（session/core/types/config/render/main/tests/shot 全链路）。v1.4 真源已从主仓库窗口工作区只读核读，未写主仓库任何文件。

## 六、答复登记

> **2026-09-07 PM 裁定：候选 A**——backend-battle 在 `task/attack-speed-v03` 分支内自行合并 `origin/task/attack-speed-fe`（676c8c6）+ `origin/main`，合并基座后施工。执行要点：①LOG.md/ARCH-AS.md 记账冲突=双侧保留（追加式账本，09-07 已有两次同型解法先例）；②实际冲突面与试合并结论不符（出现代码冲突）时立即停工上报；③全部技术口径已批（无 forceHit 走完整 F-04、core 零改动、段1 t0 内联/段2 t1 单 pending、280ms 帧钟、空放 t0 一条+静默 t1、死亡只消散段2、终局段1 致胜段2 丢弃）；④Q1 提问卡随交付 commit 归档。
>
> 落地：合并提交 0966ce7（冲突面与试合并一致：仅两记账文件，双侧保留；代码/美术零冲突）。
