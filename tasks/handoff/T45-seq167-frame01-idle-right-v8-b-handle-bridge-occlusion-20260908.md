# T45 seq167 frame01 `idle_right` · v8 B 窄柄桥遮挡候选交接

- **返工原因**：Leo 复核指出 v7 的 B 仍有一小段刀柄露在拳头与刀身之间；A 视觉可接受。v7 已标记 `rejected_by_user`，保留作对照证据。
- **当前版本**：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/`。
- **本次修改边界**：A 紧拳多边形、甲乙身体 PNG、甲乙占位朴刀 PNG、握持点、角度与尺寸全部冻结；仅 B 在 v7 紧拳区上增加窄柄桥 polygon `(111,152)…(110,155)`，遮住复核指出的露柄段，不改刀身文件。
- **程序化门检**：A/B 剪影×遮罩覆盖率 100%；D 标记剪影内武器/刀柄残留 0；B 窄柄桥内刀柄残留 0；窄柄桥未移除非刀柄（刀身）像素；D 标记区与原身体 RGBA 差 0；native/2x 与零生成门通过。
- **状态**：`artifactStage=candidate`、`visualReview=pending_Leo`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。运行时状态为 **candidate-only**，正式 runtime 路径未写入。

## 活动路径（v8 manifest 25 项）

- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/build_v8_b_handle_occlusion_fix.py` · SHA256 `6c140963afb29308539efc3d80ad25556d463662ff338e20669e99499c5feaa1`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/calibration/frame01_idle_right.json` · SHA256 `57d8a8a6cdf84b454d95a233f5ead39b9109d86b28598f076aa98aef470e394b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/composites_2x/a_idle_right_triptych_2x.png` · SHA256 `5780124733070ee2bc783bd440f03d597038d7b990623f23639943bfae41d80b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/composites_2x/b_idle_right_triptych_2x.png` · SHA256 `08f79bc48ab622ab41448f687a7511dab59fc4b54f24904bff9013cf798f649d`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/composites_native/a_idle_right_triptych.png` · SHA256 `16860dde242c8010b496a9806e1a2db384c892404f00d6ff50a676a22c34fb59`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/composites_native/b_idle_right_triptych.png` · SHA256 `92034d82d9d097c05f02ba7b2d67a901c24860bbd57ff11d889a4bb2cba2cd89`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/contact/frame01_idle_right_pair_2x.png` · SHA256 `b61453f6c8b5a57d1ad4390ffa8dca7ce618741ffb3e1c82f790b3aa244d113b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/contact/frame01_idle_right_pair_2x_labeled.png` · SHA256 `b61453f6c8b5a57d1ad4390ffa8dca7ce618741ffb3e1c82f790b3aa244d113b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/contact/frame01_idle_right_pair_native.png` · SHA256 `3918a619a94b2af497212281770cbaa96f8a6ce99221a58b50ba3ffa8dc4d234`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/contact/frame01_idle_right_pair_native_labeled.png` · SHA256 `3918a619a94b2af497212281770cbaa96f8a6ce99221a58b50ba3ffa8dc4d234`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/hand_silhouettes/a_idle_right_fist_silhouette.png` · SHA256 `71cd7cc81b67015456575afcb66c65471c3129bfb27a9e3effa58ad5d8bfb191`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/hand_silhouettes/b_idle_right_fist_silhouette.png` · SHA256 `e81f658b3286a3e0c46289be50143820a75c1abb698356f1d72c4dc7d998a94a`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/job.json` · SHA256 `737a9d55e2290b3d67f416925b3ada9614ef213a66e3bd780eadd758b118d489`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/occlusion_masks/a_idle_right_fist_roi.png` · SHA256 `71cd7cc81b67015456575afcb66c65471c3129bfb27a9e3effa58ad5d8bfb191`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/occlusion_masks/b_idle_right_fist_roi.png` · SHA256 `e81f658b3286a3e0c46289be50143820a75c1abb698356f1d72c4dc7d998a94a`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/qa/occlusion_coverage.json` · SHA256 `01afcf895cc04869dd61126bf612a4bb7f97bcbc4610583ba205ae15629094ea`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/qa/pm_data_check.json` · SHA256 `434b713f75465ba9b4a91804693940711262eb4ebc4950acb6ba23092a6afc46`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/qa/silhouette_mask_coverage.png` · SHA256 `2062a70f0f2adcd4e89aa21c1834e84595ec31b8018c7f5b969c417c799e17b8`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/qa/zero_generation.json` · SHA256 `5e0a8d9a200b4afd74fdd8d87c0b2607d8317eca248bffc543fa9dc1f9a5be9d`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/raw/a_idle_right_body.png` · SHA256 `f65fae17b33b05b8c47dd9157e0251169da352b66c1441c0c0354cc860955afb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/raw/b_idle_right_body.png` · SHA256 `7c9eb5773454e0a2cfceeac7eab7337179b5f2179881cb099471b63586b1fd90`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/refs.json` · SHA256 `4693d650447d254e6d5e28ccd7b5d522dd79648548791eff1bbacf0ec3eaaee3`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/request.md` · SHA256 `936c6fd3c9b18d2eda2fe6ab0a9f2151d8319b646020495f2ddbc938f17cd8e6`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/weapon_layers/a_idle_right_placeholder_blade.png` · SHA256 `b3d17ad4387e6a8711903faaf44e836723b7bddda165d78bf35c151ab6b9b8e5`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v8/weapon_layers/b_idle_right_placeholder_blade.png` · SHA256 `b6d9e6d1ffcb4eba22e0e3f0d1a4614ec214f26b9c5fbd5fdd8a3ecc234793e7`

## 辅助脚本
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/build_v8_b_handle_occlusion_fix.py`（与 revision 包内脚本字节相同）

## 研发消费边界
研发仅消费 v8 标定 JSON 的握持点、角度、layerOrder、A 紧拳遮挡 polygon 与 B 窄柄桥遮挡 polygon，以及占位刀层作为 D 校准输入。三联图和 coverage sheet 只作诊断证据；Leo 目验与 PM 第二道规格门通过前不得接线。

**交付 commit**：`80cbe4c8355c6a531ac9fe9376553defcc7c3362`（已推送）；本包不含正式 runtime 文件。
