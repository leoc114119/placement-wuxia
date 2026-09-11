# T45 seq=362 · 主角正面站立 v2（A-pose + 头部简化）结果

日期：2026-09-11

状态：机械门失败，按派单停报；候选保留为 `candidate-only`，未上传 Tripo，未写入 runtime/正式资产。

## 执行事实

- 使用 Codex 原生 `image_gen` 生成 1 张，cost=0；未追加第二张、未裁切、未改源。
- 参考图仅用于角色身份与画风锚定；本次输出为完全正面、眼平、A-pose、双手外张、双腿直立的单角色候选。
- 单图目验：正面站姿成立；头部马尾/发冠/刘海较简化；画面左侧为角色自身右手、画面右侧为角色自身左手，双手分别位于躯干两侧外下方；双脚朝观者；未见文字、水印、武器、地面或阴影。
- 目验不能替代手臂分离机械门：下臂区域仍有多行与袍身融合，故以机械门结果为最终结论。

## 七项机械门结果

| 判据 | 实测 | 结论 |
|---|---|---|
| 1. 尺寸 | `1086×1448`，长边 `1448≥1024` | PASS |
| 2. 比例 | `0.75`，即 3:4，误差 0 | PASS |
| 3. 纯白背景 | 全画布边缘最小通道值 `253≥250` | PASS |
| 4. 单一主体 | 背景洪水填充阈值 `min(RGB)≥240`；剩余前景连通域 `7`（最大域 `387043px`，另有 6 个 `1px` 域），要求 `1` | **FAIL** |
| 5. 手臂—躯干分离 | 手臂带为主体 bbox 的 35%~75%，共 `490` 行；满足 ≥3 段的 `201` 行，`201/490=41.02%`，要求 ≥90% | **FAIL** |
| 6. 入画完整/留白 | 主体 bbox `[216,112,870,1337]`；左 `19.89%`、右 `19.89%`、上 `7.73%`、下 `7.67%`，均 ≥5%；手脚未切断 | PASS |
| 7. 无文字 | 单图目视未见文字/水印 | PASS |

QA：`assets/_trial_20260911/tripo_front_input_v2/qa/front_standing_v2.json`，`overallPass=false`。

## 产物与来源

- 输出：`assets/_trial_20260911/tripo_front_input_v2/hero_front_standing_v2.png`
- 输出 SHA-256：`84af5f8aebfcb0b18ec0f946614272b4b477376ccfa63d4905e28cf26c39bb90`
- 参考：`assets/_trial_20260911/tripo_front_input_v2/ref_style_900x1200.png`
- 参考 SHA-256：`27ba5f8ea14770b82a8cfd1ebfe21d7bcf1a69b94c047006af180c550cdcd0ca`
- 实际 prompt：`assets/_trial_20260911/tripo_front_input_v2/prompt_used.txt`
- 成本记录：`assets/_trial_20260911/tripo_front_input_v2/credits.json`（provider=`codex-native`，generationCount=1，cost=0）

## 停点与后续边界

该候选不能作为本单门检通过的 Tripo 输入：主体洪水填充计数与手臂—躯干连续分离均失败。按派单“不过门即登记失败并停报”，不追加第二张、不裁切、不抠图、不写入 runtime；是否另开修正版由 Leo/PM2 裁定。

## 批次健康门

收尾复跑 `python3 scripts/codex_thread_health.py --thread 01a08a45-f703-7190-a484-442a2d0af631`：rollout `172.4 MB`、`30` 轮、inProgress 计数 `1`、压缩 `4` 次；未达到 SKILL §12 轮换阈值（150 轮 / 300MB / 30 次）。
