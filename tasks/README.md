# tasks/ · 内部工作流任务箱（CodeBuddy ⇄ ZCode 沟通协议 v1）

> 建立日期：2026-08-21 · 维护者：CodeBuddy（PM）
> 目的：CodeBuddy（发单/验收）与 ZCode（领单/实现）之间的**任务传递与沟通渠道**，Leo 全程可见。

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

> **先答后工（Leo 2026-08-22 定）**：ZCode 领单后**不直接开发**——先通读任务卡引用的规格文档与素材清单，产出**问题清单**（含理解复述：用自己的话概述要做的事 + 有疑义的点），经我方一轮确认后进入开发。
>
> - 答疑期：任务卡**仍留 inbox/**（不移 working），index.json `col: "questions"`；
> - ZCode 把问题写入 `questions/Q1-Txx.md`（格式：# 序号 | 问题 | 引用依据 | 建议），threads/LOG 双写；
> - CodeBuddy 出 `answers/A1-Txx.md` 汇总答复；需求级歧义项交 Leo 拍板；
> - 全部确认 → CodeBuddy 在 threads 宣布「✅ 确认开工」→ 任务卡移 `working/`、`col: "working"`。
> - 无疑问也要走此步：问题清单可写「无疑问 + 理解复述」，确认后同样移 working。

## 铁律（双方必须遵守）

1. **双写**：任何任务相关沟通，写 `threads/Txx.md` 的**同时**必须登记 `LOG.md` 一行。
2. **状态同步**：任务卡头部有 `状态:` 字段；状态变化（领取/答疑/开工/完成/验收/打回）时移动文件到对应目录并更新头部 + index.json。
3. **先答后工**：领单后先进答疑阶段（问题清单+理解复述），未经「✅ 确认开工」不得开始编码；开发期遇需求含糊仍随时停下提问，禁止自行假设。
4. **DoD 交付**：ZCode 完成任务 → 任务卡移 `done/` + 写 `done/Txx-done.md` 回执（勾选 DoD + 架构决策说明 + 文件清单）→ 等 CodeBuddy 工程验收（C 环）→ Leo 终验（L 环）。
5. **不动箱外**：任务卡与线程之外的沟通不生效；口头/会话里的承诺要落到文件才算数。
6. **Leo 可见**：所有文件 Leo 随时可读可插话；dashboard.html（根目录）是只读看板入口。

## 事件类型（LOG.md 与 threads 使用）

| 标记 | 含义 | 发起方 |
|------|------|--------|
| 📤 发单 | 新任务卡进 inbox | CodeBuddy |
| 🤝 领单 | 移入 working，开工 | ZCode |
| ❓ 提问 | questions/Qn | ZCode |
| 💬 答复 | answers/An | CodeBuddy |
| ✅ 确认开工 | 答疑一轮确认完毕，卡移 working 准许编码 | CodeBuddy |
| 📦 交付 | done 回执，DoD 勾选 | ZCode |
| 🔬 C 环验收 | CodeBuddy 工程测试（编译/类型/静态/单测/模拟） | CodeBuddy |
| ✅ L 环验收 | Leo 点验签字 → archive | Leo |
| ↩️ 打回 | 验收不通过，回 working + 说明 | CodeBuddy/Leo |
| 📝 备注 | 素材更新/范围变更等补充信息 | 双方 |

## 发言格式（精确范例，照抄即可）

**① 线程发言**：往 `threads/Txx.md` 的表格**末尾追加一行**（单行，不换行；内容长就精炼）：

```markdown
| 08-22 09:15 | ZCode | ❓ 提问 | 帧表路径 assets/ui/frames/hero/ 下的 contact.png 是否也在引用范围？ |
```

四列依次：`时间(MM-DD HH:MM)` `发言人(CodeBuddy/ZCode/Leo)` `事件标记` `内容`。看板会把 CodeBuddy 渲染在左、ZCode 在右、Leo 居中。

**② LOG 登记**：往 `LOG.md` 表格**最上方**（倒序）插一行：

```markdown
| 2026-08-22 09:15 | ZCode → CodeBuddy | ❓ 提问 Q1-T02 | questions/Q1-T02.md · 帧表引用范围 |
```

**③ index.json 更新**（仅状态变化时）：改对应任务的 `status` 与 `col` 字段：

```json
{"id": "T06", "status": "clarifying", "col": "questions", ...}
```

col 五值（= 物理目录名，2026-08-22 定版口径）：`inbox / working / questions / done / archive`（backlog=未发单）。dashboard 按同口径渲染。

**注意**：线程行必须是单行文本；需要长篇说明时写入对应目录的文件（如 questions/Qn-T02.md），线程和 LOG 里只放一行摘要+文件指针。

## 看板(Leo 的 oversight 入口)

- 先起任务箱服务:`python3 scripts/task_api.py`(默认 :8787,兼静态服务)
- 浏览器开 `http://127.0.0.1:8787/dashboard.html`(多项目加 `?project=项目ID`)
- 五列:待办 / 进行中 / 待答疑 / 待验收 / 已完成;点任务卡 → 展开该任务完整沟通线程
- **协作模式(2026-08-21 定版)**:CodeBuddy 与 ZCode 以任务箱为沟通渠道;**Leo 居中转发**——在 ZCode 客户端发单/传话,在看板看全局

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


- 任务卡格式 = `docs/81-研发协作机制`（需求表/边界/DoD/用例九表）
- 状态总账 = `docs/任务管理总表.xlsx`（CodeBuddy 维护，与 index.json 同步）
- 验收链条 = `07-审查清单与记录`（Z 环 → C 环 → L 环）
