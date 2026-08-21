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
[inbox 待领] → [working 进行中] → [done 待验收] → [archive 已归档]
                    │ ↑
                    ↓ │ questions/answers（答疑循环，不改变状态）
```

## 铁律（双方必须遵守）

1. **双写**：任何任务相关沟通，写 `threads/Txx.md` 的**同时**必须登记 `LOG.md` 一行。
2. **状态同步**：任务卡头部有 `状态:` 字段；状态变化（领取/完成/验收/打回）时移动文件到对应目录并更新头部 + index.json。
3. **歧义必问**（81 机制）：ZCode 遇到需求含糊/冲突 → 写 `questions/Qn-Txx.md` 停下等待，禁止自行假设；CodeBuddy 24h 内答复 `answers/An-Txx.md`。
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
{"id": "T02", "status": "working", "col": "doing", ...}
```

col 五值：`todo / doing / ask / review / done`（backlog=未发单）。

**注意**：线程行必须是单行文本；需要长篇说明时写入对应目录的文件（如 questions/Qn-T02.md），线程和 LOG 里只放一行摘要+文件指针。

## 看板(Leo 的 oversight 入口)

- `dashboard.html`(项目根目录)——本地 http.server 起后浏览器打开,读 index.json 渲染
- 五列:待办 / 进行中 / 待答疑 / 待验收 / 已完成
- 点任务卡 → 展开该任务完整沟通线程(threads/Txx.md)
- **协作模式(2026-08-21 定版)**:CodeBuddy 与 ZCode 以任务箱为沟通渠道;**Leo 居中转发**——在 ZCode 客户端发单/传话,在看板看全局;斜杠命令 `/tasks` `/work` `/report`(项目 `.zcode/commands/`)供 ZCode 会话使用

## 与既有机制的关系

- 任务卡格式 = `docs/81-研发协作机制`（需求表/边界/DoD/用例九表）
- 状态总账 = `docs/任务管理总表.xlsx`（CodeBuddy 维护，与 index.json 同步）
- 验收链条 = `07-审查清单与记录`（Z 环 → C 环 → L 环）
