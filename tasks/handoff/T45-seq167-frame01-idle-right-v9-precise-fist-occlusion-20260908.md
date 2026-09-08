# T45 seq167 frame01 `idle_right` · v9 B 精确橙色拳头像素遮挡候选交接

- **返工原因**：Leo 复核明确指出 v8 的 B 桥接遮挡“完全不对”，不能把棕色躯干/袖口当成拳头区域。v8 保留为 rejected 对照证据。
- **当前版本**：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/`。
- **本次修改边界**：A、甲乙身体 PNG、甲乙占位朴刀 PNG、握持点/角度/刀层全部冻结；仅重建 B 遮挡 mask。B 使用原始身体帧真实橙色皮肤像素规则 `alpha>32 and R>=180 and G>=80 and B<=140 and R>=1.25*G`，在像素 ROI `(98,159)-(123,188)` 内从种子 `(110,175)` 取 4-连通分量；不使用多边形，不使用 handle bridge，不扩张到棕色躯干/袖口。
- **程序化门检**：B 选中橙色拳头像素 310；选中区域内占位刀像素 110→0；B mask bbox `[98,166,121,186]`，A/身体/武器 SHA 全冻结；native/2x、RGBA/尺寸、零生成门通过。
- **状态**：`artifactStage=candidate`、`visualReview=pending_Leo`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。这是 **candidate-only**，正式 runtime 未写入。

## 关键证据

- 对照：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/contact/frame01_idle_right_pair_native_labeled.png`
- 遮挡覆盖：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/qa/silhouette_mask_coverage.png`
- B 精确 mask：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/occlusion_masks/b_idle_right_fist_roi.png`
- 完整事实：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/manifest.json`、`qa/occlusion_coverage.json`、`qa/pm_data_check.json`

## 活动路径（manifest 25 项，SHA256）

- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/build_v9_b_precise_fist_occlusion.py` · SHA256 `7a0ed182d23bc14dfdada285b370273f6b05643ff33351686c93b00814d99c2c`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/calibration/frame01_idle_right.json` · SHA256 `72f00a7656ce923ca61065f1162948cc1242cd3f14bf2d767d264d771e1d5aae`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/composites_2x/a_idle_right_triptych_2x.png` · SHA256 `5780124733070ee2bc783bd440f03d597038d7b990623f23639943bfae41d80b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/composites_2x/b_idle_right_triptych_2x.png` · SHA256 `b5d44e8d276866f6207179c266751a6f09954f44a3775fbe43b6df41b4fb244f`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/composites_native/a_idle_right_triptych.png` · SHA256 `16860dde242c8010b496a9806e1a2db384c892404f00d6ff50a676a22c34fb59`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/composites_native/b_idle_right_triptych.png` · SHA256 `c84b2cf019f3bded8970bad94fcbc80b910cafb3b3017670a8262eefd2e14190`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/contact/frame01_idle_right_pair_2x.png` · SHA256 `1c562cfb66dbcd0e5873007381b0ec3552227c12ca3b300dca4ffaf688d1bba2`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/contact/frame01_idle_right_pair_2x_labeled.png` · SHA256 `1c562cfb66dbcd0e5873007381b0ec3552227c12ca3b300dca4ffaf688d1bba2`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/contact/frame01_idle_right_pair_native.png` · SHA256 `c8ac9c18760489cbc223d521b0b2041d97b1ffd3745da693a1f206e0f932964f`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/contact/frame01_idle_right_pair_native_labeled.png` · SHA256 `c8ac9c18760489cbc223d521b0b2041d97b1ffd3745da693a1f206e0f932964f`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/hand_silhouettes/a_idle_right_fist_silhouette.png` · SHA256 `71cd7cc81b67015456575afcb66c65471c3129bfb27a9e3effa58ad5d8bfb191`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/hand_silhouettes/b_idle_right_fist_silhouette.png` · SHA256 `020227595550f789c85f5965aff28e1e133358e4f4cb6109be9682491d064a27`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/job.json` · SHA256 `feeff96df62fc934b2c8091314b23d308fe3037104bed94956f9ebf7c4e3d287`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/occlusion_masks/a_idle_right_fist_roi.png` · SHA256 `71cd7cc81b67015456575afcb66c65471c3129bfb27a9e3effa58ad5d8bfb191`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/occlusion_masks/b_idle_right_fist_roi.png` · SHA256 `020227595550f789c85f5965aff28e1e133358e4f4cb6109be9682491d064a27`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/qa/occlusion_coverage.json` · SHA256 `7a43137f8ea04e46ad61e09ca569b72a4d1b8b2afd06449b52e6451d24ac175c`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/qa/pm_data_check.json` · SHA256 `967ee7b5290638686eff256b31c8130c37ce1e43dc0ccb453b90d02fece85b15`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/qa/silhouette_mask_coverage.png` · SHA256 `3703a2f127571192b759520c93cdbb16f55b07bcd6dc9a383350c44756ebcbd2`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/qa/zero_generation.json` · SHA256 `ae6060245c4b024f14531c092c9cf0a62f212f954512dea96e612144ff29dae0`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/raw/a_idle_right_body.png` · SHA256 `f65fae17b33b05b8c47dd9157e0251169da352b66c1441c0c0354cc860955afb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/raw/b_idle_right_body.png` · SHA256 `7c9eb5773454e0a2cfceeac7eab7337179b5f2179881cb099471b63586b1fd90`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/refs.json` · SHA256 `dac6622abb8a70adc8f8619c491818be0f87d42dd053ee05ee9fc18e1b4d7bcf`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/request.md` · SHA256 `3fc97937814fde0455eb32273e63b531d23297ecbbeb145b51ebcad2793c31c7`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/weapon_layers/a_idle_right_placeholder_blade.png` · SHA256 `b3d17ad4387e6a8711903faaf44e836723b7bddda165d78bf35c151ab6b9b8e5`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v9/weapon_layers/b_idle_right_placeholder_blade.png` · SHA256 `b6d9e6d1ffcb4eba22e0e3f0d1a4614ec214f26b9c5fbd5fdd8a3ecc234793e7`

## 研发消费边界

研发仅消费 v9 标定 JSON 中冻结的握持点、角度、layerOrder、A 原有遮挡与 B 精确橙色拳头像素 mask；三联图和 coverage sheet 仅作诊断证据。Leo 目验与 PM 第二道规格门通过前不得接线。

## 交付记录

本交接文件随 v9 candidate 包提交；commit `3e1d795c43b3b1e10bc3e7b4b0b5f6e67b7d2b8f` 已推送到 `origin/codex/t45-shanzei-2b-pilot`。
