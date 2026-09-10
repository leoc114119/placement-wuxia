# T45 主角武器锚/遮罩逐帧重标 + 左系镜像重派生 · 任务单

> 2026-09-10 · 美术 PM2（rd）→ art · 对应 projbus：rd→art seq=283
> 前置：主体帧重生成批次（右向 seq278/279、右上右下 seq287）已过 Leo 目验与 PM2 规格门；右上/右下 20 帧复检 PASS（commit 642bee08）
> 成本：**零新生成**（0 积分）——全部复用既有独立剑模与裸剑层合成

## 1. 为什么要重标（背景，先读）

1. 主体帧已重生成，且帧表口径从老 `walk2/atk2/jump2` 改为 **`walk3/atk4/jump3`**。
2. 既有 48 行标定记录里，凡 `bodyFrame` 指向**已重生成**身体的行，其 `runtimeBodySha256` 已与新帧不符 → **该行作废**（不是"微调"，是要按新身体重新实测）。
3. `idle` 三向与 `cast` 9 帧身体**未重生成**（Leo 09-10 裁：静止帧保留旧版、cast 沿用原版）→ 这 24 行（双系）**原样沿用，不要重做**。

## 2. 范围（逐帧点名，表外不碰）

### Phase A · 右向新帧归一到统一规格

右向新帧目前**仍是未归一的裁切图**（362×362 / 129×257），必须先归一到与右上/右下批次**完全相同的规格**，否则锚点坐标没有统一的 240×320 坐标系可依。

帧集（10 帧）：`walk_right_1/2/3`、`jump_right_1/2/3`、`atk_right_1/2/3/4`
源：`assets/_trial_20260910/t45_hero_right_walk_jump_selected_seq278/raw/`（walk/jump）+ `assets/_trial_20260910/t45_hero_atk_selected_seq279/raw/`（atk）

对齐基准（右上/右下批次已过门的口径，逐条照做）：240×320 RGBA、脚底基线 y=300、全像素 `alpha>32` 加权质心 x=120、四边零 alpha、`alpha>32` + 4 邻接主体单连通、清杂**零副作用**。

### Phase B · 右系锚 + 遮挡遮罩逐帧重标（21 帧）

| 向 | 帧 |
|---|---|
| right | `walk_right_1/2/3`、`atk_right_1/2/3/4` |
| rightup | `walk_rightup_1/2/3`、`atk_rightup_1/2/3/4` |
| rightdown | `walk_rightdown_1/2/3`、`atk_rightdown_1/2/3/4` |

其中 **12 帧是"旧行作废重做"**（walk_right_1/2、atk_right_1/2、walk_rightup_1/2、atk_rightup_1/2、walk_rightdown_1/2、atk_rightdown_2），**9 帧是全新标定**（三个向的 walk_3 + atk_3 + atk_4）。作废行只作**方法参照**，参数一律按新身体像素重新实测，禁止照搬旧值。

### Phase C · 左系镜像重派生（21 帧）

`left/leftup/leftdown` 对应同名单帧。左系一律**确定性镜像派生**，禁止单独生成。

### 明确不做

`idle` 三向（保留旧版）、`cast` 9 帧（沿用原版）、`die_common`（白骨不配锚）、`jump` 全部（**轻功帧豁免，武器隐藏，不配锚**）。

## 3. 必须复用的既有经验（本单核心要求，逐条硬性）

**3.1 统一 14 字段模板（seq=231 锁定，逐字照用，不得增删字段）**
`frameId / bodyFrame / candidateBodySha256 / runtimeBodySha256 / bodyCorrection / gripPointPx / fistCenterPx / angleDeg / angleDefinition / layerOrder / maskPolicy / occlusionMaskPath+occlusionMaskSha256 / visibleStubs / status`
模板源：`assets/_trial_20260909/t45_hero_weapon_left_derivation_seq232/manifest-26rows-seq232.json`（`fields` 字段即白名单）。左系行的 `angleDefinition` 沿用既有写法（`horizontal mirror of right screen angle; 0°=screen-right, +Y down`）。

**3.2 layerOrder 按向切层规则**（既有结论，不得推翻）：`right/left/rightdown/leftdown` = 前景（`weapon_front` 系列）；`rightup/leftup` = 后景（`body_front` / `weapon_back_*` 系列）。

**3.3 遮罩必须**完整挡住刀柄**——这是上一轮打回的死因（手部遮罩没挡住刀柄=穿帮）。交割时必须给"遮罩生效后"的放大对照图，证明柄在拳区不露出；`maskPolicy` 取值从既有白名单选（`precise_original_body_alpha_fist` / `complete_fist_cutout_top_with_grip_window` / `original_body_alpha_tight_fist_roi` / `none` …）。

**3.4 枚举收敛（新要求）**：仓内 `layerOrder` 已漂到 15 个取值、`maskPolicy` 漂到 20 个。本轮**只用白名单取值**；确需新值，先在该帧 QA 里写明"为什么既有值都不适用"，并把新值登记进 manifest 顶部枚举表——禁止静默自造。

**3.5 镜像公式（两次踩坑的结论）**：`x_left = 239 − x_right + dx`。**dx 必须逐帧读来源账本**，禁止裸算 `239−x`；角度取反号；**禁止二次翻转**（角度与图片翻转不能叠加两次）。左系必须记录 `derivedFrom` 与平移 `dx/dy`，并给镜像一致性差分（原始水平翻转逐像素一致性 + 最终输出相对翻转图的平移量）。

**3.6 武器件长度带与握持几何**：剑长 110~140（柄 25~35 + 刃 85~105，握径 4~6）；**柄握持段 ≥ 拳宽 + 两侧各露 3~5px**（D 遮挡几何硬约束）。超带或露段不足=不合格。

**3.7 复用既有独立剑模与遮罩源，零新生成**：源在 `assets/_trial_20260909/t45_hero_weapon_left_derivation_seq232/`（`sword_layers/`、`occlusion_masks/`、`derive_left_seq232.py`）与 `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/`。**必须复用 `derive_left_seq232.py` 这条既有派生链**（可扩展，不得另起一套）。

**3.8 长剑完整显示**：出招帧的剑必须完整入画——独立剑模运行时合成、允许越出身体精灵矩形，**禁止以身体画布矩形裁剪**（BUG-20250909-07 的历史死因）。合成对照图必须能看到完整剑身。

**3.9 质心口径**：凡报"质心/中心"，一律全分辨率逐像素 **`alpha>32` 加权质心**；禁 bbox 几何中心、禁抽样、禁跳步扫描（bbox 中心对不对称人形可差 7px）。

**3.10 像素级实测，禁目测**：`gripPointPx` / `fistCenterPx` / `angleDeg` 一律 PIL 逐像素实测得出；报告须附测量方法（ROI、判据、实测值），目测值必须标注"目测"。

## 4. 自证与门检（每帧交付必附）

1. **两类证据**（规范 §1.3 红线 14）：①目标达成（本帧要达成的可量化结果）②**改动安全**——归一/清杂/镜像等确定性加工，必须对基线做掩膜差分并证明**主体域删除像素数=0**。只报①视为未过门。
2. **合成对照三联**：裸剑叠前 / 遮罩生效后 / 遮罩放大细节（证明无柄穿帮）；出招帧另附完整剑身视图。
3. **机械门**：240×320 RGBA、脚底 y=300、质心 x=120（动作帧门内）、四边零 alpha、`alpha>32` 单连通。
4. **manifest 扩行**：本轮新增/更新 42 行（右系 21 + 左系 21），加上沿用的 24 行（idle 3 + cast 9，双系）→ 目标 **66 行**；每行 `candidateBodySha256` 必须等于新身体帧的实测 SHA，`runtimeBodySha256` 记当前 runtime 文件 SHA（两者不同即说明接线未换图，属正常，不要改 runtime）。
5. **顺带补一个字段**：`frame15`（cast_right_2）的 `gripPointPx` 单字段仍空（既有挂账）——按同法自查自补，PM 不给值。

## 5. 停点与节奏

- **逐帧小闭环**：`像素测量 → 合成对照 → 交 PM2 规格门 + Leo 目验 → 通过后才做下一帧`。不许跨帧先做完再一起交。
- 候选期间只动本任务路径，**runtime 目录零写入**；状态维持 `candidate-only`。
- Phase A 归一完成后先交一轮（PM2 门检通过）再进 Phase B。
- 疑义一律登记 `tasks/questions/` 或 ART-ARCH 停等 PM2，**禁止自行补全规格**。

## 6. 交付物与路径

- 候选包（建议）：`assets/_trial_20260910/t45_hero_weapon_recalib_seq<NNN>/`，含 `normalized/`、`sword_layers/`、`occlusion_masks/`、`composites/`、`qa/`、`manifest.json`（66 行目标）。
- 正文交 `tasks/handoff/`，摘要写 `tasks/threads/T45.md`，事件索引写 `tasks/LOG.md`；形成交付物后走 projbus 发带 `commit_sha` + `artifact_paths` 的 delivery。
- `credits.json` 记 0 生成；若发生任何回退调用，按既有回退条款记账并说明触发条件。
