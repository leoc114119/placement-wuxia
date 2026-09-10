# T45 旧批重归一右向 10 帧试点·R2 结果（seq=346）

日期：2026-09-10
状态：`candidate-only`，按 A9 裁定重跑；组内刚体/几何门通过，`jump_right_1` 的 v2 ±15% 参考门超出 0.094 个百分点，未铺后续，runtime 未改。

## 修正口径

- **walk+jump 组**：源表 `assets/_trial_20260910/t45_hero_right_walk_jump_selected_seq278/raw/source_right_action_sheet_3x4.png`，SHA `414f95c7428d5057322bafff40be1c31b8974bd58c568232bb71db4ce923dfda`；12 格冠宽 `11,12,12,11,11,11,11,11,11,12,11,11`，均值 `11.25`，组系数 `0.702077031660`。
- **atk 组**：源表 `assets/_trial_20260910/t45_hero_atk_selected_seq279/raw/source_atk_right_4frame.png`，SHA `7f0388b86118a92f5701913b6ebee5a8feedd5605702e27e924f9c7f52965deb`；4 格冠宽 `7,7,7,7`，均值 `7`，组系数 `1.128338086596`。
- 锚仍为 `idle_right_attempt1.png`，冠宽 34px、人物 `alpha>32` 高 1102px。
- 组内所有帧共用组系数；输出刚体按实际绿色像素测量，硬门为组内极差 ≤1px；v2 互校参考门为 ±15%。

## 逐帧结果

| 帧 | 组 | 源冠宽 | 源高 | 系数 | 输出 bbox | 输出高 | 输出冠宽 | v2 高 | 差异 | v2 门 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| walk_right_1 | walk+jump | 11 | 312 | 0.702077031660 | 176×219 | 219 | 8 | 246 | -10.976% | PASS |
| walk_right_2 | walk+jump | 12 | 311 | 0.702077031660 | 173×218 | 218 | 8 | 255 | -14.510% | PASS |
| walk_right_3 | walk+jump | 12 | 317 | 0.702077031660 | 167×223 | 223 | 8 | 248 | -10.081% | PASS |
| atk_right_1 | atk | 7 | 214 | 1.128338086596 | 135×241 | 241 | 8 | 246 | -2.033% | PASS |
| atk_right_2 | atk | 7 | 214 | 1.128338086596 | 135×241 | 241 | 8 | 238 | +1.261% | PASS |
| atk_right_3 | atk | 7 | 214 | 1.128338086596 | 146×241 | 241 | 8 | 234 | +2.991% | PASS |
| atk_right_4 | atk | 7 | 215 | 1.128338086596 | 139×243 | 243 | 8 | — | — | N/A |
| jump_right_1 | walk+jump | 12 | 256 | 0.702077031660 | 164×180 | 180 | 8 | 212 | -15.094% | **FAIL** |
| jump_right_2 | walk+jump | 11 | 290 | 0.702077031660 | 162×204 | 204 | 8 | 225 | -9.333% | PASS |
| jump_right_3 | walk+jump | 11 | 303 | 0.702077031660 | 210×213 | 213 | 7 | 229 | -6.987% | PASS |

## 门检结果

- 10/10 帧几何门、无裁切、alpha>32 单连通、脚底 y=300、质心门、四边透明、SHA 互异：PASS。
- 确定性加工安全：10/10 帧 `subjectDomainDeletedPixels=0`、`rgbChangedPixels=0`；PASS。
- 输出刚体实际像素：walk+jump `8,8,8,8,8,7`，极差 1px；atk `8,8,8,8`，极差 0px；PASS。
- v2 参考门：8 个可比帧通过；仅 `jump_right_1` 为 `-15.094%`，严格超过 `-15%` 0.094 个百分点，因此总体 `allHardGatesPass=false`。

## 目验描述

已目验 `contact/right_legacy_renorm_pilot_vs_baseline.png` 与 `contact/right_legacy_renorm_pilot_vs_v2.png`：基准脚线一致；walk 三帧大小明显收敛，jump 为蹲→跃→落的自然高度递进，atk 四帧接近。三列 v2 对照中仍能看出旧批与 v2 的绝对尺度差，`jump_right_1` 是最短的一帧；没有发现组内突跳或裁切断角。

## 停点

按“未过门不铺量”，暂不处理右向其余 20 帧、右上/右下、左系或 runtime。当前唯一待裁定项是：严格 ±15% 门下 `jump_right_1` 的 0.094 个百分点边界，是否按像素取整误差接受，或维持失败停点。

机械 QA：`assets/_trial_20260910/t45_legacy_renorm_right_pilot_seq342/qa/right_legacy_renorm_pilot.json`。
对照图：`assets/_trial_20260910/t45_legacy_renorm_right_pilot_seq342/contact/right_legacy_renorm_pilot_vs_baseline.png`、`right_legacy_renorm_pilot_vs_v2.png`。

## 批次收尾健康门

R2 收尾复跑 `python3 scripts/codex_thread_health.py --thread 01a08a45-f703-7190-a484-442a2d0af631`：rollout 87.7 MB、23 轮、inProgress 计数 1、contextCompaction 2 次；未达到 SKILL §12 轮换阈值。
