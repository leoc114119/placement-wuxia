# tasks/ · 内部工作流任务箱（CodeBuddy ⇄ ZCode/Codex 沟通协议 v2）

> 建立日期：2026-08-21 · **v2 扩展：2026-08-31（新增 Codex 非研发管线）** · 维护者：CodeBuddy（PM）
> 目的：CodeBuddy（发单/验收）与 ZCode/Codex（领单/执行）之间的**任务传递与沟通渠道**，Leo 全程可见。
> v2 要点：任务箱从"研发专属"升级为**多执行者通用看板**——同一套目录/状态机/铁律，用 owner 字段区分执行者，非研发管线（文档/调研/素材）复用现有通道，不另建平行系统。

---

## 目录结构

```
tasks/
├── README.md       # 本协议
├── LOG.md          # ★ 全局沟通日志（所有事件一行一条，倒序）
├── index.json      # 任务状态清单（dashboard 数据源，随事件更新）
├── inbox/          # CodeBuddy → ZCode：新任务卡（Txx.md）
├── working/        # ZCode 已领单的任务卡（领取时从 inbox 移入）
├── questions/      # ZCode → CodeBuddy：疑问（Qxx-Tyy.md）
├── answers/        # CodeBuddy → ZCode：答复（Axx-Tyy.md，与疑问同编号）
├── threads/        # ★ 每任务一条沟通线程（Txx.md，追加式）
├── done/           # ZCode → CodeBuddy：完成回执（Txx-done.md，DoD 勾选+决策说明）
└── archive/        # 已验收归档
```

## 状态机

```
[inbox 待领] → [答疑中] → [working 进行中] → [done 待验收] → [archive 已归档]
                    │ ↑
                    └─┘ questions/answers 循环（答疑期内多轮问答）
```

> **先答后工（Leo 2026-08-22 定）**：ZCode/Codex 领单后**不直接开工**——先通读任务卡引用的规格文档与素材清单，产出**问题清单**（含理解复述：用自己的话概述要做的事 + 有疑义的点），经我方一轮确认后进入执行。
>
> - 答疑期：任务卡**仍留 inbox/**（不移 working），index.json `col: "questions"`；
> - 执行者把问题写入 `questions/Q1-Txx.md`（格式：# 序号 | 问题 | 引用依据 | 建议），threads/LOG 双写；
> - CodeBuddy 出 `answers/A1-Txx.md` 汇总答复；需求级歧义项交 Leo 拍板；
> - 全部确认 → CodeBuddy 在 threads 宣布「✅ 确认开工」→ 任务卡移 `working/`、`col: "working"`。
> - 无疑问也要走此步：问题清单可写「无疑问 + 理解复述」，确认后同样移 working。

## 执行者与任务类型（2026-08-31 v2 新增）

任务卡头部的 `执行者:` 字段决定谁领单。**同一张看板，同一套状态机**，不设平行目录。

| 执行者（owner） | 客户端 | 任务类型 | 典型产出 | 验收环 |
|------|------|------|------|------|
| **ZCode** | ZCode 客户端 | 研发卡（编码施工） | 代码/工程配置 | C 环（工程测试）→ L 环 |
| **ZCode** | ZCode 客户端 | 文档管线卡（评估/整理） | 报告/清单/需求文档 | C 环（口径核对）→ L 环 |
| **Codex** | Codex 客户端 | 非研发卡：调研/写作/分析/素材管线脚本 | 调研报告/文档/脚本 | C 环（事实与口径核对）→ L 环 |
| **Codex** | Codex 客户端 | 文档二审卡 | 批注/修订建议（不改原文） | CodeBuddy 汇总采纳 |
| design-strategist / 其他专家 | 会话内专家 | 设计/文策卡 | 设计产出 | Leo 拍板 |

**发单规则**：
1. 任务卡头部必须写明 `执行者：xxx`；owner 不明 = 不可发单。
2. 研发编码卡**只有 ZCode 领**；非研发卡禁止写游戏代码（边界条款照旧）。
3. Codex 卡同样遵守**先答后工**与**一任务一提交**；commit 前缀任务号（如 `T11：`）。
4. LOG/threads 的"发言人/方向"列照实写执行者名（ZCode/Codex），看板自然分流。

**执行者领取方式**：Leo 把任务卡内容复制到对应客户端（ZCode 或 Codex）下发；执行者按卡内"疑问通道"回帖，CodeBuddy 统一收口。

## 铁律（双方必须遵守）

1. **双写**：任何任务相关沟通，写 `threads/Txx.md` 的**同时**必须登记 `LOG.md` 一行。
2. **状态同步**：任务卡头部有 `状态:` 字段；状态变化（领取/答疑/开工/完成/验收/打回）时移动文件到对应目录并更新头部 + box.db（走通道）。
3. **先答后工**：领单后先进答疑阶段（问题清单+理解复述），未经「✅ 确认开工」不得开始编码/产出；执行期遇需求含糊仍随时停下提问，禁止自行假设。
4. **DoD 交付**：执行者完成任务 → 任务卡移 `done/` + 写 `done/Txx-done.md` 回执（勾选 DoD + 决策说明 + 文件清单）→ 等 CodeBuddy 验收（C 环）→ Leo 终验（L 环）。
5. **不动箱外**：任务卡与线程之外的沟通不生效；口头/会话里的承诺要落到文件才算数。
6. **Leo 可见**：所有文件 Leo 随时可读可插话；dashboard.html（根目录）是只读看板入口。
7. **一任务一提交（Leo 2026-08-22 定）**：任何任务完成即 `git commit` + `git push origin main`——ZCode 交付（📦 回执）、Codex 非研发交付、CodeBuddy 素材/文档/基建任务收口均适用；commit message 前缀任务号（如 `T06：`/`Q4-T06：`），**禁止跨任务攒批、禁止完成后滞留未提交**。git 远程与冷备见 `docs/` 基建记录。

## 事件类型（LOG.md 与 threads 使用）

| 标记 | 含义 | 发起方 |
|------|------|--------|
| 📤 发单 | 新任务卡进 inbox | CodeBuddy |
| 🤝 领单 | 移入 working，开工 | ZCode / Codex |
| ❓ 提问 | questions/Qn | ZCode / Codex |
| 💬 答复 | answers/An | CodeBuddy |
| ✅ 确认开工 | 答疑一轮确认完毕，卡移 working 准许开工 | CodeBuddy |
| 📦 交付 | done 回执，DoD 勾选 | ZCode / Codex |
| 🔬 C 环验收 | CodeBuddy 验收（研发=工程测试；非研发=口径/事实核对） | CodeBuddy |
| ✅ L 环验收 | Leo 点验签字 → archive | Leo |
| ↩️ 打回 | 验收不通过，回 working + 说明 | CodeBuddy/Leo |
| 📝 备注 | 素材更新/范围变更等补充信息 | 双方 |

## 发言格式（精确范例，照抄即可）

**① 线程发言**：往 `threads/Txx.md` 的表格**末尾追加一行**（单行，不换行；内容长就精炼）：

```markdown
| 08-22 09:15 | ZCode | ❓ 提问 | 帧表路径 assets/ui/frames/hero/ 下的 contact.png 是否也在引用范围？ |
```

四列依次：`时间(MM-DD HH:MM)` `发言人(CodeBuddy/ZCode/Codex/Leo)` `事件标记` `内容`。看板把 CodeBuddy 渲染在左、执行者（ZCode/Codex）在右、Leo 居中。

**② LOG 登记**：往 `LOG.md` 表格**最上方**（倒序）插一行：

```markdown
| 2026-08-22 09:15 | ZCode → CodeBuddy | ❓ 提问 Q1-T02 | questions/Q1-T02.md · 帧表引用范围 |
```

**③ box.db 更新**（仅状态变化时，走通道）：改对应任务的 `status` / `col` / `owner` 字段：

```json
{"id": "T06", "status": "clarifying", "col": "questions", ...}
```

col 五值（= 物理目录名，2026-08-22 定版口径）：`inbox / working / questions / done / archive`（backlog=未发单）。dashboard 按同口径渲染。

**注意**：线程行必须是单行文本；需要长篇说明时写入对应目录的文件（如 questions/Qn-T02.md），线程和 LOG 里只放一行摘要+文件指针。

## 看板(Leo 的 oversight 入口)

- 先起任务箱服务:`python3 scripts/task_api.py`(默认 :8787,兼静态服务)
- 浏览器开 `http://127.0.0.1:8787/dashboard.html`(多项目加 `?project=项目ID`)
- 五列:待办 / 进行中 / 待答疑 / 待验收 / 已完成;点任务卡 → 展开该任务完整沟通线程
- **协作模式(2026-08-21 定版 / 08-31 扩展)**:CodeBuddy 与 ZCode/Codex 以任务箱为沟通渠道;**Leo 居中转发**——在对应客户端(ZCode/Codex)发单/传话,在看板看全局;看板按 owner 区分执行者

## 数据源与变更通道（2026-08-22 15:29 SQLite 化 · Leo 拍板）

- **结构化状态真源 = `tasks/box.db`**（SQLite WAL，多项目单库：projects/tasks/events 三表）
- **变更一律走通道，禁止手改 box.db / 禁止再更新 index.json**：
  - CLI：`python3 scripts/task.py move|event|card|list|board`（直连库）
  - API：`python3 scripts/task_api.py` 起 :8787 → `GET /api/{pid}/board`、`PATCH /api/{pid}/tasks/{id}`、`POST /api/{pid}/events`
  - 两条通道共用 `scripts/task_box.py` 校验（col 白名单 + 写后自动分布断言），非法值直接 400/报错
- `index.json` 已冻结为只读快照存档（头部有 _frozen 标记），不再更新
- **看板**：先起服务 `python3 scripts/task_api.py`，浏览器开 `http://127.0.0.1:8787/dashboard.html`（多项目加 `?project=项目ID`）；线程详情同源加载
- 多项目：`POST /api/projects {id,name}` 或在库中 INSERT projects 一行即可，各项目任务卡互不干扰

## 与既有机制的关系


- 任务卡格式 = `docs/81-研发协作机制`（需求表/边界/DoD/用例九表）；**owner 字段为 v2 扩展**（81 模板头部"执行者"行落库到 box.db owner）
- 状态总账 = `docs/任务管理总表.xlsx`（CodeBuddy 维护，与 box.db 同步）；82 md 总表新增"非研发管线"行区（2026-08-31 起）
- 验收链条 = `07-审查清单与记录`（Z 环 → C 环 → L 环）；非研发卡 C 环口径改为事实/一致性核对，L 环不变

## 版本记录

- v1（2026-08-21）：ZCode 单执行者协议定稿
- v1.1（2026-08-22）：先答后工 + 一任务一提交铁律 + SQLite 化
- **v2（2026-08-31）：多执行者扩展**——新增 Codex 非研发管线（调研/写作/分析/素材管线/文档二审），owner 字段区分执行者，状态机/铁律/通道复用，不设平行目录
