# T45 seq=360 · 主角正面站立 Tripo 输入结果

日期：2026-09-11

状态：机械门失败，按派单停报；候选保留，未上传 Tripo，未写入 runtime/正式资产。

## 执行事实

- 使用 Codex 原生 `image_gen` 生成 1 张正面站立候选，cost=0；未追加第二张、未裁切、未换源。
- 参考图只负责主角形象与画风；输出目标为完全正面、双臂离身、双腿直立、纯白背景的 Tripo `image_to_model` 输入。
- 单图已目验：脸和躯干正面、双眼平视、头部无倾斜；双臂垂在身体两侧且可见间隙；双脚踩实、鞋尖朝向观者；无文字、武器、阴影或第二角色。

## 机械门结果

| 判据 | 实测 | 结论 |
|---|---|---|
| 尺寸 | `1086×1448`，长边 1448≥1024 | PASS |
| 比例 | `0.75`，即 3:4 | PASS |
| 纯白背景 | 四角分别 `(253,255,255)`、`(254,255,255)`、`(254,253,253)`、`(253,253,253)`；全边缘最小通道值 253≥250 | PASS |
| 单一主体 | 非白阈值 200、8 邻接连通域数 `2`；主域 bbox `[245,130,785,1348]`，第二域 bbox `[503,199,566,251]`（发冠小块） | **FAIL** |
| 四边留白 | 左 22.56%、右 27.72%、上 8.98%、下 6.91% | **FAIL**（底边<8%） |
| 无文字 | 单图目视未见文字/水印 | PASS |

QA：`assets/_trial_20260911/tripo_front_input/qa/front_standing.json`，`overallPass=false`。

## 产物与来源

- 输出：`assets/_trial_20260911/tripo_front_input/hero_front_standing_final.png`
- 输出 SHA-256：`1d3e166f45787d5948fa89ab44e475ef7273d457d89be85cce2311073fdfafa5`
- 参考：`assets/_trial_20260911/tripo_front_input/ref_style_idle_stand_900x1200.png`
- 参考 SHA-256：`27ba5f8ea14770b82a8cfd1ebfe21d7bcf1a69b94c047006af180c550cdcd0ca`
- 实际 prompt：`assets/_trial_20260911/tripo_front_input/prompt_used.txt`
- 成本记录：`assets/_trial_20260911/tripo_front_input/credits.json`（provider=`codex-native`，generationCount=1，cost=0）。

## 停点

该候选不能按 seq=360 门检作为 Tripo 输入：发冠脱离主体连通域，且脚底留白不足。按派单“不过门即登记失败并停报”，未做裁切、抠图或第二次生成；是否另开新单修正由 Leo/PM2 裁定。

## 批次健康门

开工/收尾复跑 `python3 scripts/codex_thread_health.py --thread 01a08a45-f703-7190-a484-442a2d0af631`：rollout 164.9 MB、29 轮、inProgress 计数 1、压缩 3 次；未达到 SKILL §12 轮换阈值。
