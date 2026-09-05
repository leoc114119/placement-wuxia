# 全仓代码体检与优化建议 v1

> TASK-ARCH-01 · 2026-09-05 · Codex 主架构（研发线）
>
> 检查基线：`ad0366f8ded685e62e66db4fcd61459f69f7755f` 工作区。共享区存在他人文档、图片及未跟踪文件；本报告代码证据来自当次实际读取，未修改源码、配置、测试或素材。
>
> 结论：**CONCERNS**。当前自动化基线通过；发现契约隔离、防御边界、宿主适配与测试工程债。此结论是分析建议，不是发布放行或需求验收。涉及已验收行为的疑点仅列入末节，等待 Leo/PM 裁定。

## 一、范围与验证证据

覆盖任务卡六域：battle-core/session/hex；hex-render/input/assets；config 下五份 TS 配置及历史资产清单入口；battle_demo 的 main/build/shot/behavior_e2e；package/tsconfig/tests 全目录与 game/旧 battle-render；types 快照、动作和事件契约。重点逐分支取证战斗链、输入分流、快照出口和移动演出链；不是对所有历史脚本或云函数的逐行审计。

| 检查 | 本次结果 |
|---|---|
| `npm run typecheck` | PASS，`tsc --noEmit` |
| `npm run lint` | PASS |
| `npm run test:battle` | 10 文件通过、1 文件跳过；211 通过、14 跳过；总耗时 486 ms，测试耗时汇总 414 ms |
| `npm run test:behavior` | 1 文件、14 项通过；总耗时 191 ms |
| 定向只读复现 | 内存中通过现有 TypeScript 编译器加载源码：快照攻击格别名泄漏、NaN 污染、超容量阵容异常、射线几何反例均复现；无新增测试文件 |
| 性能小样 | seed 42、默认玩家/单敌、手动满条，10,000 次 snapshot 约 25 ms；仅本机单次微基准，不代表真机帧耗时 |
| 未执行 | build、截图/e2e 重摄和微信真机检查。build 会写 dist 或 bundle/index，重摄会覆盖已有 shots，不符合本卡只读范围；类型检查不等于构建或真机通过 |

测试目录 11 文件：battle、battle-session、hex、battle-ui、battle-hex-render、battle-hex-timeline、battle-hit-feedback、battle-structure、battle-behavior、scene、npc。默认主套件主动跳过行为套件（`tests/battle-behavior.test.ts:45`），须单独执行；本次已补跑。Vitest 另提示配置的 ESM/CJS 加载兼容警告，目前未导致失败。

正面核对：hex 渲染器与输入层未直接 import battle-core；数值伤害消费直接读取事件 damage（`proto/battle_demo/main.ts:295`）；FACE-1 的目标选择在 resolveAoe 收敛，rng 位于逐目标结算前（`systems/battle-session.ts:442`）；空放分支保持现状。config/numbers.ts 未发现新增战斗结算公式。旧战斗线仍由 game.ts 实际接入，不能视作无用代码删除。

## 二、优化建议清单

分级严格沿用任务卡：P0=正确性风险/隐患（不代表全是当前可达故障），P1=架构债，P2=性能，P3=小改进。工时含实现与相关验证，不含等待审批/素材生产/真机排期。

### A01 · P0 · 快照攻击格、轻功格暴露内部可变引用

- **定位与证据**：`systems/battle-session.ts:267` 返回 selection.legalCells；`:843` 将同一数组作为 attackCells；`types.ts:321`、`:323` 声明为可变 HexPos[]。复现：满条激活 te 后 attackCells 长度 12，执行 `snapshot.attackCells.length=0`，下一次 snapshot 长度即为 0。cast 在 `:800`、`:809` 又读取该内部数组，因此展示端可以反向影响合法性和结算目标。
- **方案/文件**：在快照出口复制数组及每个坐标对象；随后由授权契约卡评估深只读类型。涉及 `systems/battle-session.ts`、`types.ts`、`tests/battle-session.test.ts`；单纯浅复制不能隔离元素修改。
- **风险/测试**：正常只读消费者的已验收行为不变；增加“修改返回快照不改变后续合法格”的隔离断言，复跑 session/behavior/hex-render。若发现外部已有依赖写快照的行为，需 Leo 对齐口径再迁移。
- **工时**：3–5 小时。

### A02 · P0（潜在） · faceTargetOf 缺非空前置保护

- **定位与证据**：`systems/battle-session.ts:422` 返回类型为 Runner，空 targets 会在 `:430` 消费一次 rng 并返回 undefined，随后 `:445` 取 `.hex` 崩溃。当前 `:817` 明确过滤空数组，AI `:511` 也只返回非空计划，因此正常两条调用链目前不可达。
- **方案/文件**：在 resolveAoe 入口显式断言非空或以非空元组表达调用契约；禁止把空 AOE 静默当 ATK-6。涉及 `systems/battle-session.ts`、`tests/battle-session.test.ts`，与已知 FACE-1 备忘合并派卡。
- **风险/测试**：不动正常行为、不动空放臂；保留 tie 恰一次、非 tie 零次消费及 SP-2 全等，补空输入保护证明。非法内部调用的报错策略由 PM 在卡内定死。
- **工时**：1–2 小时。

### A03 · P0（非法输入） · session 入口缺运行时有效性检查

- **定位与证据**：`systems/battle-session.ts:584` 将 dt 直接乘速率写入时钟/bar。实际调用 `tick(NaN)` 后 clock、actionBar 均 NaN。`:233` 按敌人数截取出生格，`:234` 未检查格数；100 敌输入实测在 mk 读取 spawn.q 时异常。当前 core 数量生成器最多 6 敌（`systems/battle-core.ts:52`），不应把超容量反例描述为现有 demo 故障。
- **方案/文件**：宿主/session 边界验证有限非负 dt、阵容容量、id 唯一性及必要数值；保持合法值的运算次序，拒绝策略写进工单。涉及 `systems/battle-session.ts`、宿主适配入口、`tests/battle-session.test.ts`。
- **风险/测试**：合法战斗不变；非法输入如何拒绝属接口口径，需 PM 确认，涉及既有调用依赖时需 Leo 对齐口径。测试非有限 dt、重复 id、超容量及合法 1–6 敌基线；不改 core 数值公式。
- **工时**：4–6 小时。

### A04 · P1 · 移动演出路径与场界有多份解释

- **定位与证据**：session `:458` 调 `systems/hex.ts:130` 的 BFS 路径；渲染 `ui/battle-hex-render.ts:549` 调本文件 `:360` 的直线/clamp/BFS 演出算法。场界分别在 session `:69`、`config/battle-hex.ts:36`；方向表另有 hex `:25`、session `:321`、render `:311`。这不是直接数值越权，但存在维护漂移面。
- **方案/文件**：先补跨层场界/六方向一致性断言，标明逻辑路径和演出路径的不同职责；未来单独评估导出逻辑路径契约，不能直接用一套算法替换另一套。涉及 `tests/battle-structure.test.ts`、`tests/hex.test.ts`；若再收敛实现则涉及 session/hex/config/hex-render/types。
- **风险/测试**：一致性检查不改行为。路径统一会动已验收移动表现，**需 Leo 对齐口径**，不得并入简单去重卡；关联 T19/N1、hex timeline、behavior 与 e2e 位移采样。
- **工时**：检查先行 3–4 小时；行为收敛另评，预计 12–20 小时，不能直接发施工单。

### A05 · P1 · 预览宿主尚未形成微信六边形接入层

- **定位与证据**：`proto/battle_demo/main.ts:23`、`:53`、`:186` 依赖 DOM canvas、Image.decode、PointerEvent，`:161`、`:278` 从 `_debug.mode()` 读正式 UI 状态；`game.ts:10`、`:83` 实际连接旧 battle-ui/battle-render。不能将 preview 通过称作六边形微信链已经通过。
- **方案/文件**：独立宿主适配卡封装画布创建、资源就绪、时间源、坐标与触摸生命周期；公开只读 mode 出口，调试接口隔离。涉及 `game.ts`、`env.d.ts`、`ui/assets.ts`、session、types、preview main 与新宿主适配模块，具体拆分由后续方案冻结。
- **风险/测试**：替换旧入口涉及已验收路径，**需 Leo 对齐口径**；保留旧线，按卡切换。关联 battle-ui、scene、npc、hex-render、behavior；另需微信真实触摸、横竖屏/像素比、挂起恢复验收。本文不声称任何具体微信版本必不支持某 API。
- **工时**：适配方案 4–6 小时；施工及真机验证 16–24 小时起，待 PM 冻结范围。

### A06 · P0（兼容降级路径） · roundRect 无能力检测

- **定位与证据**：缺 ctrl 图时 `ui/battle-hex-render.ts:1221` 无条件调 ctx.roundRect；旧渲染 `ui/battle-render.ts:151` 已有手工圆角路径并注明兼容旧基础库。若传入 ctx 不具备该方法，缺图降级分支反而抛异常；这是一条条件风险，不是已做真机复现。
- **方案/文件**：按能力检测走等价圆角路径，优先复用现有几何方法；涉及 hex-render、旧 battle-render 或共享绘图辅助，以及 `tests/battle-hex-render.test.ts`。
- **风险/测试**：目标是保持当前圆角几何和热区；用缺 roundRect 的 ctx stub 加缺图测试，跑 ctrl 降级与截图对比。若几何或观感需改变，需 Leo 对齐口径。
- **工时**：2–3 小时。

### A07 · P1 · 指针生命周期缺取消和身份归属

- **定位与证据**：preview `main.ts:186`–`:205` 仅绑定 down/move/up，未绑定 pointercancel、未按 pointerId 跟踪；`ui/battle-input.ts:116` 即使没有有效 down 也会处理 up。窗口外释放或多指交叉事件可能留下 dragging 状态或产生非配对点击；微信适配也须明确 touch identifier/cancel。
- **方案/文件**：增加取消/重置接口、同一指针配对及释放策略；preview 接入取消与 capture 生命周期。涉及 `ui/battle-input.ts`、`proto/battle_demo/main.ts`、后续微信适配模块、input 所在 hex-render 测试。
- **风险/测试**：保留当前单指正常点击/拖动阈值；新增 cancel→move、无 down 的 up、多指交叉验证。异常事件的取消语义先由 PM 定义，改变用户交互时需 Leo 对齐口径。
- **工时**：4–6 小时。

### A08 · P1 · 资源加载缺缓存/超时与一致的配置出口

- **定位与证据**：`ui/assets.ts:9` 仅靠 onload/onerror 结束 Promise，无超时；`:47`、`:70` 并发预载全部帧，`:79` 写死旧背景路径；preview `main.ts:53` 自建另一套加载器，`:306` 等全部资源完成才开播。不能仅凭这些包内路径断言项目已具备 CDN 下载/缓存能力。旧背景与旧战斗仍在使用。
- **方案/文件**：统一资源键解析、去重缓存、失败/超时结果和并发上限；旧背景地址移配置但保持原值。涉及 assets、config/battle、preview main、新资源适配模块及加载器测试。字体同样需就绪与回退验证：FONT_STACK 只声明字体族，并不证明设备已安装/加载宋体。
- **风险/测试**：路径常量外置行为不变；超时/重试/字体替代会影响就绪和视觉，**需 Leo 对齐口径**。验证丢回调、加载失败、同键重复加载与缺图兜底；不擅自移除旧图或改变包体策略。
- **工时**：8–12 小时（不含 CDN 服务和字体选型）。

### A09 · P2 · 静态瓦片噪点每帧重算，可先测后缓存

- **定位与证据**：`ui/battle-hex-render.ts:706` 每块瓦片重建固定种子的噪点序列并逐点填色，`:854` 每帧遍历可见候选格；`:851` 重建高亮 Set。session `:842` 在满条等待时重新 BFS。现已做可视区裁剪（`:860`），MVP 小阵容不应凭循环数量断言性能不合格。
- **方案/文件**：先记录 updateView/drawFrame/snapshot 的目标设备 p50/p95；仅当数据支持时缓存每格噪点描述或小块图像，动态高亮仍独立绘制。涉及 hex-render、config/battle-hex、性能测量脚本；若做快照缓存需按占位/技能/选中变更正确失效。
- **风险/测试**：缓存必须保持格 seed、像素、绘制顺序；变视觉需 Leo 对齐口径。关联 hex-render、timeline、截图；新增显存/解码内存预算，不能用全屏大缓存无上限换 CPU。本机快照小样不足以支持先做 BFS 优化。
- **工时**：测量 3–4 小时；获益确认后的缓存 4–8 小时。

### A10 · P1 · 工程检查入口不覆盖完整预览链

- **定位与证据**：`package.json:10` 的 build 仅 tsc，preview 打包另在 `proto/battle_demo/build.mjs:40` 使用 transpileModule；默认 lint 不含 proto/tests。`shot.mjs:15`、`behavior_e2e.mjs:35` 写死 macOS Chrome 路径，输出均固定到 shots（分别 `:11`、`:31`）。build `:96`、`:110` 覆写 bundle/index，Date.now 版本导致无代码变更也产生 diff。
- **方案/文件**：提供一条组合校验入口显式跑主套件+行为套件；预览构建先做类型检查，测试浏览器路径/输出目录参数化；构建输出支持临时目录，版本标记采用输入摘要或受控构建 id。涉及 package、build/shot/behavior_e2e、eslint 配置；先保留现有默认命令兼容。
- **风险/测试**：不改游戏行为；不得借脚本调整改写红名单断言。验证默认与临时输出两条路径、缺浏览器报错、e2e 失败非零退出，检查产物与源版本一致。当前套件不足 1 秒，不建议为了提速削减测试。
- **工时**：5–8 小时。

### A11 · P3 · 注释与真实实现漂移（含 FACE-1 备忘）

- **定位与证据**：`tests/battle-session.test.ts:965` 上方敌 offset(6,7)，玩家由 `:893` 定位(7,8)，上向 Δcol=-1，并非 `:966` 所称“两向 Δcol=0”；下向(7,9)才是 0。断言正确，无需改期望值。session `:365` 注释还描述 Proxy，但 `:375` 直接传 actor，实际是 POS_NEUTRAL 常量字段。`systems/hex.ts:2`、`config/battle-hex.ts:7` 残留 flat-top，后者紧接 `:8` 已写上下尖。
- **方案/文件**：只改过述/失效注释并标明现行依据；涉及上述 tests、session、hex、config 文件。与下一张授权触碰卡合并；历史冻结代码文件仍须纳入明确授权，不以注释为由绕红线。
- **风险/测试**：无行为变化，测试断言零改；核对 diff 全为注释，保留 FACE-1/SP-2 全套。无需改需求文档。
- **工时**：1–2 小时。

## 三、待 Leo 对齐（不并入优化施工建议）

以下均发现了具体代码差异，但因牵涉已验收语义，本卡不自行判新口径或改代码。

| 编号/等级 | 代码证据与疑点 | 待裁口径、后续影响与工时 |
|---|---|---|
| Q01 / P0 正确性疑点 | `systems/battle-session.ts:489` 的 targetInRange 对 ray 只判距离，只有 cone 有形状分支；`:510` AI 出技消费它。玩家 cast 使用 `:299` 的 rangeCells，hex `:230` 限六条射线。只读反例：from=(3,8)，to=(4,9)，cube 距离=2，但不在六向 ray 半径2集合中；AI 过滤却会纳入。 | **需 Leo 对齐口径**：棍棒 AI/兼容 attack 是否必须与玩家 ray 格完全一致。若准，后卡修改 session，补 hex/session 的 AI 与玩家双场对照、SP-2；预计4–6小时。不得静默改变已验 AOE。 |
| Q02 / P0 交互疑点 | `ui/battle-input.ts:217` 对轻功态非金空格 dispatch cancelSkill，`:153` 棋盘外也取消；交互规格 MV-2/SEL-5 的轻功非金格不取消与之有差异。相应代码注释明确“保持已验收行为”，构成需要上级裁定的冲突。 | **需 Leo 对齐口径**：哪个取消范围为准。若准改，涉及 input、session 相关断言与 behavior/e2e；预计3–5小时。此处不调整测试去迎合实现。 |
| Q03 / P0 行为疑点 | `systems/battle-session.ts:679` 的 selectSkill 在 pendingInputNow 门 `:687` 前执行；可在未满条/auto 模式激活。types `:332` 还保留 attack.skillId 兼容入口；session `:770` 仍走单体 doAttack，而 cast `:818` 走 AOE。 | **需 Leo 对齐口径**：直接 API 的模式/满条约束及兼容单体入口是否继续保留。当前 UI 不等于全部 API 调用者。冻结接口后才估实施细节，初估4–8小时，关联 battle-ui/session/behavior 和 types 消费方。 |
| Q04 / P1 演出一致性 | `ui/battle-hex-render.ts:566` 中途换目标仅更新 anim.pos，path/pathPx 未重建；`:936` 绘制使用路径插值。`ui/battle-input.ts:200` 识别 FE 移动窗，却仍按 actor.renderPos 算可见格（`:202`），不是 FE 实际画位。 | **需 Leo 对齐口径**：连续动作打断/重定向与“可见位”的验收定义；现存 L 环规则不能凭推理替换。后卡补双时间轴/中途换目标取证，再评修正，预计6–10小时；关联 timeline、T19/N2、hit-feedback 和真实 e2e。 |
| Q05 / P1 接入待办 | FACE-1 数据层通过不等于六向帧上屏：`types.ts:288` 仍是二值 facing；hex-render `:942` 仅 spriteKey+帧号；`tileSpriteImg :813` 恒 null，配置填写 tileset 路径也不会自动接通。 | 随 T45/tileset 专项接线卡处理；两道素材门先过、契约变更先授权。六向新字段保留 legacy 二值的方案仍须卡冻结。初步方案评估3–5小时，施工待素材清单与契约明确后重估。 |

FACE-1 空放朝点击格继续悬置待 Leo 复核，本报告不改既有结论。旧 game/battle-render 与 hex preview 并存是迁移状态：不能把旧线的射程/内力/狼素材配置直接搬进 hex，也不能按新口径顺手删除历史资产。T45 资产与字体审美归 Leo，规格审查归 PM，本报告只指出技术接点。

## 四、建议派单顺序与交付边界

1. PM 先核对 A01 的快照隔离、A02 已知守卫和 A06 缺图兼容分支，组成小范围防御卡；A03 的非法输入策略先冻结。
2. Q01–Q04 单列答疑，等 Leo/PM 裁定，禁止混入“优化”顺手实施。A04 路径收敛同样先做一致性检查，不能直接合并两套已验算法。
3. A05/A08 随微信与 T45 接线规划；A10 工程检查入口可单独派卡；A11 注释随授权卡顺带。
4. A09 先测真机再决定是否缓存；现有自动化耗时和本机快照小样不构成紧急性能重构依据。

本卡仅交付报告、路径级提交与 push、向 rd 发送带 SHA/报告路径的 projbus delivery、LOG 一行。任务箱卡片位置、需求真源、游戏代码和素材均未由本卡改写；后续由 rd 复核并评估拆卡。
