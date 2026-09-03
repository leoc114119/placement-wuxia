# 闲时任务提示词：T45 批 0 · 主角 45° 俯视首锚（锚定批）

> 使用说明：复制分隔线内全文提交闲时任务（2026-09-04）。批 0 仅 1 张生图=2 分；锚过 Leo 目验后才发批 1。

---

■ 给主会话的转发指令
收到本指令后，立即通过 Agent 工具派发 art-pipeline 子智能体执行下方任务书（全文传入），
主会话只负责派发与最终结果登记，不自行生产内容。全程无人值守，不要向用户提问。

═══════════════ 以下为 art-pipeline 任务书 ═══════════════

# 任务定位
你是美术管线代理，工作目录=仓库根。执行 T45 战斗帧 45° 俯视（78 张）的**批 0：主角 down 向首锚 1 张**。这是全新视角的定锚批——锚过 Leo 目验后才开始铺量，本任务只做这一张。

# 必读（开工先读，按序）
1. skill《art-pipeline-execution》：`.zcode/skills/art-pipeline-execution/SKILL.md` + `references/common-pitfalls.md` + `references/c13-battle45.md`（本任务唯一执行细则）
2. `docs/design/01-基础功能/角色帧规范.md` §4c（45° 俯视口径，v1.2 空拳勘误版）+ §4b（空拳+武器分层）
3. 视觉基准：`assets/ui/pixel/battle/raw/battle_v8.png`（直立立牌微俯视/可见头顶与肩/2.5~3 头身）

# 无人值守铁律（违反任一=任务失败）
1. 禁提问禁等待；歧义/卡点 → 写进报告停上报，禁自行想象补全。
2. 生图定死 **1 张=2 分**（gpt-image-2 标准版 1K）；门失败不重摇（重摇权归 Leo），如实记录停上报。
3. 产出落 `assets/_trial_20260904/t45_batch0/`；禁碰任何定稿/在库资产；禁改任何脚本与文档。
4. commit 显式文件清单（禁 git add -A）；最终汇报附产物路径+尺寸+credits+自检五问。

# 执行步骤（命令级）
1. 落 prompt：将下方【锚 prompt】逐字存 `assets/_trial_20260904/t45_batch0/prompts/anchor45_down.txt`（逐字，禁改一词）。
2. 生成：`source ~/.zshrc && python3 scripts/mxai_gen.py --prompt "$(cat assets/_trial_20260904/t45_batch0/prompts/anchor45_down.txt)" --out assets/_trial_20260904/t45_batch0/anchor45_down_raw.png --aspect 3:4`（2 分）。
3. 程序化校验：PIL verify；四角色值实测（任一通道 <245 或 RGB 通道差 >12 → E-GEN-05 停上报）；单人/无文字按 E-GEN-03/04 筛查。
4. 抠图：`NODE_PATH=<repo>/node_modules node scripts/mxai_web_cutout.js <raw> <透明底>`（失败重试 1 次，再失败停上报，禁回退本地脚本）。
5. 归一：PIL 缩放入 240×320 画布、主体底边对齐 y≈300、水平居中 → `anchor45_down.png`；记录包络高度。
6. credits 记账 + 自检五问（命令偏差/prompt 全文/自决念头/门结果/成本）。
7. commit（trial 产物+credits）→ 汇报：产物路径清单 + 校验数据 + 「待 Leo 目验点」。

【锚 prompt · 主角 down 向 45° 空拳待机】
精美像素风格游戏角色立牌，单独一个中国武侠少年，45度俯视视角：可见头顶发旋与双肩，面朝镜头略偏下。黑色高马尾青绿发带白玉冠，青绿汉服白衬袍深色腰封，白色灯笼裤黑布鞋，双手握空拳成戒备站姿（无武器，腰间无挂物），双膝微曲重心略低。纯白背景，单人全身，无文字，无水印。

# 停点（重要）
本任务到 anchor45_down.png 入 trial 即停。**Leo 目验定锚（视角/头身/形象/空拳）通过后才发批 1 任务书**；不过则改 prompt 重出（重摇由 Leo 发令）。

═════════════════════════════════════════════════════════════
