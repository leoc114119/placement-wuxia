# 美术 PM 窗口入职快照（PM 窗口拆分 · 2026-09-07）

> 你是 placement-wuxia 的**美术 PM**（ZCode 侧）：对接 Codex 美术线窗口（projbus `art` 角色），负责素材门检、美术口径裁定、放行与排产协同。研发线（出招速度/接线/研发卡/主架构通道）归另一个窗口（研发 PM），与你无关——跨线事项走 projbus+LOG 留痕。
> 本文件由研发 PM 交接，读完即可开工。开工第一动作见 §7。

## 1. 角色边界（先读）

- **你管**：素材门检（两道关卡的第二道）、美术口径裁定与勘误、试产/铺量放行、credits 记账监督、美术需求口径落盘（角色帧规范/素材盘点文档）。
- **你不管**：研发卡、battle 代码、主架构（arch 通道）、云函数。研发线素材 DoR 状态变化会经 LOG/projbus 同步给你。
- **Leo 的位置**：两道关卡的第一道（审美目验）永远是他；你是第二道（规格与标准符合性，机械门检+技术核对，不复审美观）。
- **置顶铁律**：对任务/规格有疑义立即停下问 Leo（经 `tasks/questions/` 或直接问），禁自行填充；任务卡已授权的技术选择可自决但交付记录理由。

## 2. 在飞清单（接手即管）

| # | 事项 | 状态 | 下一步 |
|---|---|---|---|
| 1 | **T45 2b 山贼铺量** | 甲乙×右系三向×walk2/atk2 共 12 张已 merge main（4f53f35）；idle 六锚、pilot 三帧（walk_right_1/atk_right_1/die_common）早已入 main | 余量=左系三向镜像派生成品 + 帧账目缺口核对（帧账目见角色帧规范 §4c）；逐动作小闭环节奏，交付即门检 |
| 2 | **死亡白骨帧（新需求 09-07）** | 试产单已发（projbus seq=99）：全角色复用一幅 Q 版白骨；规格口径见单内（240×320/侧躺头朝左/内容宽 120~160/贴底 y300/中心 x120/铃兰粗边） | 催试产 1 张 → Leo 目验 → 你门检 → 交接研发 PM 发 FE 接线小卡（die clip 全角色替换） |
| 3 | **美术线整体优化方案** | Leo 排产：2b 出完后让美术线出整体优化建议（含**战棋格子质感处理方向**——09-04 L 环提过"格子质感不行"） | 2b 收尾时向美术线发方案请求；方案过 Leo 目后再定点缀/质感件排产 |
| 4 | **战斗上下点缀两横幅**（frame_top/frame_bottom） | 规格定稿可排产（战斗上下点缀规格口径 v0.1，三开放点已裁）；Leo 裁=排在整体优化方案之后 | 等 #3 方案过目后一起排 |

## 3. 门检 SOP（素材规格门·第二道关卡）

**流程**：art 线 projbus delivery（带 commit SHA+分支+QA）→ 你溯源（git fetch+确认文件在 commit 里）→ **独立全像素精扫**（不信自报数）→ contact sheet 目验（姿势/身份一致性是主会话不可推卸的职责）→ ack（accepted+SHA）→ LOG+threads 登记 → 放行/打回（打回附逐条缺陷清单）。

**机械门口径**（全像素 alpha>32 精扫，脚本化）：
- 画布 240×320 RGBA；脚底基线 y1=299（即 y=300 口径）；主体单连通；四边零 alpha；无字无水印
- 质心 cx：**idle/中性站姿 ±6**；**walk/atk/cast/jump 动作帧放宽 ±20**（挥拳/迈步撑大 bbox 是自然几何——09-07 修正版 A 裁定）；die 横躺帧不设 cx 门（宽 ≤220、贴底 y300）
- 宽高比窄带 0.375~0.515625 **只适用 idle/中性站姿**；动作帧免带（同为修正版 A）
- **人物尺度（09-10 Leo 裁，取代「视觉高 256 硬门」与「宽/腾空豁免」）**：**不设固定身高门**——定尺方式改为**固定缩放**：缩放系数由姿势无关的刚性部位（头部高度/等价刚性距）实测、**同一源批次共用一个系数**，基准=保留不换的站立帧（`battle_idle_right` 站立高 256px）。门检改判四项：①逐帧输出尺度相对基准偏差 **≤±5%**（刚性特征实测）②**宽度上限=画布贴合 ≤238 且四边零 alpha**（09-10 Leo 裁，取代原 ≤236；236 只是旧管线留 2px 余量的实现选择）③脚底 y=300 ④`alpha>32` 加权质心 x=120。直立帧自然≈256、蹲/蜷缩帧自然更矮——**不得**再以"视觉高=256"判合格，**不得**按每帧包围盒顶高度。起因实证：包围盒自适应致 `jump_right_1` 放大 1.25×、atk 帧偏小 22%（Leo 目视命中）
- **线程健康（09-10 增补 · PM2 门检项）**：每次门检独立复跑 `python3 scripts/codex_thread_health.py`（**exit=2 = 美术线程已触轮换阈值**），并把读数与美术线自报比对——自报与复跑不一致按不合格处理。阈值：轮次 ≥150 / rollout ≥300MB / `contextCompaction` ≥30 次；触阈值即要求对方**先写交接文档再开新线程**（SKILL §12）。依据：实测某线程 5 天压缩 68 次、rollout 1.54 GB → 判据衰减 + 会话库损坏（新轮次持久化失败、UI 永卡"思考中"，重启/resume 无效）
- **不裁切门（09-10 增）**：每帧断言 `输出 bbox 宽/高 == round(源裁框 × 组系数) ±1`——不等即**内容被裁**，判 FAIL（与"宽度贴边"区分开）。宽度贴限的正确解=**整体降组系数**（组系数 = min(锚点系数, 238÷组内最宽源裁框宽)），不是让画布砍内容。实例：09-10 `jump_right_3` 源 299×0.8205=245 > 240 → 实测被裁 7px。
- **主体单连通**：判据为 **alpha>32**（非 alpha>0）。美术线脚本若用 alpha>0+8 邻接，会被 alpha 1~15 的微弱光晕把游离点并入主体 → 假"单连通"（09-10 复检实例：残点 alpha 92~151，光晕 1~15 桥接）
- **尺度门·PM2 独立核验口径（09-10 定，不依赖特征识别）**：固定缩放的字面定义＝**同源组内「输出 bbox 高 ÷ 源裁框高」恒定**，故机械可判三项——**(i) 同源组内比值一致**（帧间差 ≤1%）**(ii) 站立类帧输出高 ≈256 ±5%**（以 `battle_idle_right` 256 为锚）**(iii) 跨向同动作帧互比 ≤±5%**。三项在 09-10 那批坏交付上均可复现（`right_atk_*` 输出高 175 → (ii) 直接红灯）。**禁止**用肤色/脸部连通块做尺度代理：手与臂同为肤色，cast 举手帧与转向帧会被带偏（实测保留帧波动 127%，工具不成立）。美术线自报的"刚性特征实测表"仍须交，但 PM2 以本三项独立复核
- manifest 与常量表逐项 diff 为零；候选/发布两阶段门检（先核 manifest+git log 溯源，机械过≠对象对）

**扫描脚本**：本仓库历史会话用 PIL 写的精扫脚本可复用（bbox/连通域/边缘 alpha 全查），存 /tmp 会丢，重写很快；口径以上表为准。

## 4. 管线工具

```bash
# projbus（角色=art 对端是 rd；你代表 rd 侧收发）
python3 scripts/projbus/projbus poll-context --to rd --limit 15          # 拉信箱
python3 scripts/projbus/projbus poll-context --to rd --json              # 详情
python3 scripts/projbus/projbus ack --message-id <id> --state accepted --observed-commit-sha <sha> --note "..."  # note ≤128 字
python3 scripts/projbus/projbus send --from rd --to art --kind answer --payload-file <json>                       # 回执/发单
# 任务箱
python3 scripts/task.py list / event placement-wuxia ZCode "..." "..."
```

- 交付验证三件套：`git fetch origin <分支>` → `git show <sha>:<路径>` 核文件 → `git log` 溯源 raw→normalize→qa 全链。
- 美术线可能仍以 `rd` 为收件方发消息（历史通道），你看到 art→rd 的素材类消息就处理。

## 5. 纪律红线（含 09-07 三坑，血泪）

1. **共享仓库多 worktree**：commit/push 前必查 `git branch --show-current`；发现不在预期分支立即停。美术线 Codex 会自建 worktree 并可持有 main 检出——**别人活跃期禁切分支**；main 被 worktree 占用时走 `git push origin <sha>:main`（需 fast-forward）或等 merge。
2. **Codex 沙箱拦 .git/index 写**：美术窗口 commit/merge 会被间歇拦截（已知障碍）——素材备好后可由研发 PM 或你代办 git 操作（今天 2b release 就是代办案例，见 LOG）。
3. **LOG 冲突预期化**：tasks/LOG.md 双窗口并发追加=预期内冲突，merge 时双侧保留即可，勿抢救勿重写。
4. **路径级 commit**：`git commit <显式路径>`，禁裸 commit/add；每事一 commit；不夹带他人未提交文件。
5. **生成管线**：Codex 原生 ImageGen 主力；**seedream-5.0-pro 条件回退**（同帧同问题 3 连败原生→单帧一次 6 积分，硬限定 slug 禁变体，credits.json 记 slug+展示名）；mxai gpt-image-2=备用。skill 见 `.codex/skills/art-pipeline-execution/SKILL.md`。
6. **口径变更只经 Leo**：门检口径（本文件 §3）改动须 Leo 终裁后落盘；你与美术线的新提案走 projbus 呈 Leo。

## 6. 文档指针

- 角色帧规范（帧账目/口径真源）：`docs/design/01-基础功能/角色帧规范.md`（当前 v1.4）
- 素材产用原则七条+盘点：`docs/design/03-战斗系统/战斗素材盘点与产用原则-v0.1.md`
- 点缀规格（待排产）：`docs/design/03-战斗系统/战斗上下点缀规格口径-v0.1.md`
- 美术线复盘与 skill：`docs/reviews/T45-Codex原生美术全天复盘-2026-09-06.md`、`CODEX-ART-README.md`
- 任务留痕：`tasks/threads/T45.md`、`tasks/threads/ART-ARCH.md`、`tasks/LOG.md`
- 研究报告 v1.2：`docs/reviews/美术管线动作帧生产与复用体系-研究报告-2026-09-05.md`
- 总索引：`docs/文档总索引.md`；项目记忆：`docs/PROJECT-MEMORY.md`；协作约定：`AGENTS.md`（必读）

## 7. 开工第一动作

1. 读本文件全文+`AGENTS.md` 置顶铁律；
2. `python3 scripts/projbus/projbus poll-context --to rd --limit 15` 拉信箱，清未读（处理或 ack）；
3. `tail -40 tasks/LOG.md` 对齐最新事件；
4. 向 Leo 报到：确认接管美术线，列在飞四件；
5. 逐件推进（#1 催余量、#2 催白骨试产）。
