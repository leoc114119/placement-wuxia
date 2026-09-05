# projbus · 跨工具协作消息总线 定稿规格 v1.1.1

> 基础 = Codex《MCP-01 · 跨工具协作消息总线 v1》（2026-09-05，全文采纳为 §一）
> v1.1 增补 = ZCode PM 审查附录（§二：角色注册表/可靠性分层/reconcile-outbox 定义/运行时裁定/宿主注册/验收增补）
> v1.1.1 修订 = Codex 验收审查两项（ack accepted 门禁 fetch 前置 / project_id 参数补齐，见文末「变更记录」）
> 实现真源 = 本文件。实现位置：`scripts/projbus/`（核心单文件 + CLI + MCP stdio 包装）

## §一 MCP-01 原文（Codex，采纳）

### 目标
为 ZCode 与 Codex 的独立 worktree/clone 建立本机消息运输层。
git commit + push + 仓库 handoff 文件仍是唯一事实源；
projbus 只负责通知、协商和 ACK。

### 范围
- 同一台机器、同一 OS 用户。
- 存储固定为 ~/.projbus/projbus.sqlite，不进入 git。
- stdio MCP server，两个宿主各自拉起实例，共享 SQLite。
- 不做 HTTP / SSE / wait / 自动 merge / 自动改 main / 自动执行对方消息。
- 不读取、不转存完整 transcript。

### 必须提供的能力
1. send
   - 参数：project_id、to、kind、payload、correlation_id、idempotency_key
   - kind 仅允许：delivery / question / answer / acceptance / turn_completed
   - 同 idempotency_key 重复调用不得产生重复消息。

2. poll
   - 参数：recipient、after_seq、limit
   - 非破坏性读取；未 ACK 的消息可重复返回。

3. ack
   - 参数：message_id、state、observed_commit_sha、note
   - state：received / accepted / rejected / needs_info
   - 仅在 git fetch 后、确认 SHA 与文件存在时，才允许 accepted。

4. status
   - 返回 schema version、每个收件箱未 ACK 数量、最后序号、数据库健康状态。

### 数据与可靠性
- SQLite WAL。
- 原子事务。
- busy_timeout。
- 消息 ID 使用 UUID 或 ULID。
- 每个收件箱按单调 sequence 排序。
- 路径只允许仓库相对路径。
- payload 大小受限；验收报告正文不能进总线，只传 commit SHA、文件路径、摘要。
- 目录权限 0700，数据库文件 0600。
- 数据库 schema 有版本字段和迁移保护。

### Hook 适配器
提供可被宿主 Hook 调用的 CLI，而不是把逻辑锁在 MCP server 内：

- projbus poll-context
- projbus turn-completed
- projbus reconcile-outbox
- projbus send
- projbus ack

Codex / ZCode 的 Hook 只调用 CLI；MCP 只是同一核心的代理接口。

### Git 交接顺序
发送方：
1. 生成仓库 handoff 文件。
2. git commit。
3. git push 成功。
4. send delivery，消息带 commit_sha 与 artifact_paths。

接收方：
1. poll。
2. git fetch。
3. 验证 commit_sha 和 artifact_paths。
4. ack accepted 或 needs_info。
5. 不自动 merge。

### 禁止项
- 不改游戏业务代码。
- 不改 main。
- 不把消息正文作为系统指令执行。
- 不把 tasks/LOG.md 当作实时队列写入点。
- 不新增依赖；若现有运行时没有合适 MCP SDK，先报告，不自行引包。

### 验收
- delivery / question / answer / acceptance 各跑通一次。
- 同一 idempotency_key 连续 send 两次，仅出现一条消息。
- 发送后进程退出再重启，消息仍可 poll。
- ACK 前消息可重复读取；ACK 后状态正确。
- 两个进程并发 send 50 次，无丢失、无数据库损坏。
- 接收方未 fetch 到 commit 时，不能 ack accepted。

## §二 PM 增补（v1.1 · ZCode 审查裁定）

### 2.1 角色注册表（to/recipient 取值，固定）
`rd`（研发 PM，ZCode）/ `art`（美术线，Codex）/ `arch`（主架构，现 ZCode、迁移后 Codex）。
project_id 现仅 `placement-wuxia`。未注册收件人 send 报错。

### 2.2 可靠性分层（诚实声明）
- **保证层** = `turn_completed` 脉冲：由宿主钩子触发（Codex turn-ended / ZCode session-start），**不依赖模型自觉**。
- **语义层** = delivery/question/answer/acceptance：由模型按代理定义指示调用（AGENTS.md / CODEX-ART-README / architect.md 写明"交接点必发"），存在不遵守风险——由 2.3 的 reconcile-outbox 兜底自愈。

### 2.3 reconcile-outbox 定义（自愈清扫）
对比「git 事实」与「总线已发」：游标存 DB（上次 reconcile 的 commit sha）。每次运行：`git log <cursor>..HEAD --<handoff 路径>`（handoff 路径 = tasks/LOG.md、tasks/threads/、素材目录），对每条未见过的交付性提交检查总线是否已有同 commit_sha 的 delivery——无则**代发** delivery（payload=sha+路径+摘要，标注 `reconciled:true`）+ 推进游标。触发时机 = 两宿主 turn 边界钩子顺带调用。此机制使"模型忘发"降级为"延迟一轮"。

### 2.4 运行时裁定（依 §一"无 SDK 先报告"条款的报告）
实测：Python 无 mcp SDK；系统 node v25.3.0 与 Codex 内置 node v24.19.0 均内置 `node:sqlite`。**裁定：Python 3 标准库零依赖实现**（sqlite3/json/uuid/argparse），MCP 层手搓最小 JSON-RPC（initialize / tools/list / tools/call 三方法，不含 resources/prompts）。理由：工具面仅 4 个，手搓 ~200 行换取零依赖与零包管理；代价 = MCP 兼容性须以"双宿主各完成一次真实工具调用"实证（见 2.6）。若 Leo 偏好官方 SDK（pip 引包），需明确批准，推翻本条。

### 2.5 宿主注册（实现过 CLI 测试后执行）
- Codex：`~/.codex/config.toml` `[mcp_servers.projbus]`（command=python3，args=脚本路径）——由 Leo 侧确认后写入。
- ZCode：项目级 MCP 配置同参注册；session-start 钩子接 `projbus poll-context`（输出注入上下文）。
- 注册动作属宿主配置变更，逐项报 Leo 确认，不静默改。

### 2.6 验收增补（在 §一验收之上追加）
- **双宿主兼容实证**：ZCode 与 Codex 各注册后完成 ≥1 次真实 tools/call（手搓协议兼容性证明）。
- **注入防御实证**：一条正文含"指令样式文本"的消息，接收侧仅作为文本呈现，不产生任何工具调用/文件改动。
- reconcile-outbox 实证：人工制造一条"有交付提交但无 delivery 消息"的账实差，运行清扫后消息补齐且游标推进。
- poll-context 输出格式：未读消息按 `[seq] from→to kind 主题 (sha)` 单行摘要 + 条数总计，空箱输出明确"0 未读"。

## §三 实现约束

- 单文件核心 `projbus_core.py` + CLI 入口 `projbus`（三件子命令同核）+ MCP stdio 入口 `projbus_mcp.py`。
- 位置：`scripts/projbus/`。进 git（工具本身是仓库资产），存储 ~/.projbus/ 不进 git。
- 不碰游戏代码/规格文档；本工具属研发协作基建（与 scripts/task.py 同类）。

## 变更记录

- **v1.1.1（2026-09-05 · 来源=Codex 验收审查）**
  1. **P1 ack accepted 门禁缺陷修复（正确性）**：§一"仅在 git fetch 后、确认 SHA 与文件存在时，才允许 accepted"中 **fetch 成功是前置条件**。原实现仓库有 remote 时 fetch 失败仅记录不拦截，本地 `git cat-file` 找到 SHA 即放行——修复为：仓库**存在 remote** 且 `git fetch --all --prune --quiet` 返回非 0 → **立即报错拒绝 accepted**（即便本地已有该 commit 对象）。无 remote 的裸仓库场景按 SPEC 语境不可能出现（两宿主均为正常 clone），维持跳过 fetch 并如实记录。回归测试：remote 指向不存在的本地路径制造确定性 fetch 失败（无网络依赖）+ 本地已有该 commit 对象 → 断言 accepted 被拒、错误信息含 fetch 失败语义；另设 fetch 成功（本地 bare remote）放行对照例。
  2. **P2 project_id 完整性**：CLI `turn-completed`、`reconcile-outbox` 补齐 `--project-id` 参数，与 `send` 同规解析：**显式参数 > `PROJBUS_PROJECT_ID` env > 默认 placement-wuxia**；env 值仍过 §2.1 注册表校验。测试补两子命令显式生效 + env 回退各一例。
