# T45 seq167 frame01 `idle_right` · v10 B 与 A 刀位统一 + 精确拳遮挡候选交接

- **返工原因**：Leo 明确要求 B 的刀位与 A 相同；v9 的 B 刀层相对 A 为 `(-9,-10)`，对应握点 B `(116,165)`。本版只调整 B 武器层位置，不重画身体。
- **当前版本**：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/`。
- **本次边界**：继承 v9 的 B 精确 4 连通橙色拳头像素遮罩（ROI `(98,159)-(123,188)`、seed `(110,175)`、310 px、bbox `[98,166,121,186]`）；B 占位朴刀层直接复制 A 的冻结 PNG 字节，B 握点改为 `(125,175)`，角度 `-55°`、刀长 95px、柄长 34px、`front` 层序保持。
- **对齐事实**：B v10 刀层 bbox `[112,83,191,194]`，与 A 完全一致；相对 v9 B 为确定性平移 `(+9,+10)`，无重采样，`targetEqualsABytes=true`、`translatedPixelExact=true`。
- **遮挡解释**：刀位统一后，B 精确拳 ROI 与刀层局部重叠为 0；因此 B 的 D 面板不会产生局部像素减少，这不是漏检。遮罩契约仍保留给研发 in-engine 合成，报告只写“刀位对齐通过、局部无重叠”。
- **程序化门检**：候选包 26 项活动路径；身体两张 SHA 冻结、A/B 武器层 SHA 相同、握点相同、B 精确拳 310px、无 torso/sleeve bridge、平移像素核验 PASS、RGBA/尺寸/2x/零生成门 PASS。
- **状态**：`artifactStage=candidate`、`visualReview=pending_Leo`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。正式 runtime 未写入，下一帧不启动。
- **交付基线**：素材包与本 handoff 随 commit `cd10cddeefbe8cad2b76c56c1b15b4412dbb8624` 推送；后续 delivery 留痕写入 `22b97c08`；projbus delivery `seq=172`，message `8d36c334682948a2919a781b73e0b737`。

## 关键证据

- 对照：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/contact/frame01_idle_right_pair_native_labeled.png`
- 遮罩覆盖：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/qa/silhouette_mask_coverage.png`
- 刀位对齐核验：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/qa/knife_alignment_check.json`
- 完整事实：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/manifest.json`、`calibration/frame01_idle_right.json`、`qa/occlusion_coverage.json`、`qa/pm_data_check.json`

## 活动路径（manifest 26 项，SHA256）

- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/build_v10_b_knife_align_a.py` · SHA256 `627b5bfe2263efb7c66ca909d0cccd63b0c0d845a909bdcf2d4783fdc4c62a25`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/calibration/frame01_idle_right.json` · SHA256 `bb8b92f7d61590e5bd4408761c4ff0b5fdc66862b67c69e91f4e56e877ec3f55`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/composites_2x/a_idle_right_triptych_2x.png` · SHA256 `5780124733070ee2bc783bd440f03d597038d7b990623f23639943bfae41d80b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/composites_2x/b_idle_right_triptych_2x.png` · SHA256 `0d621597392b4d7ef1a56df5f5a7f142015007ce7e2f4af28cbd473e96caa988`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/composites_native/a_idle_right_triptych.png` · SHA256 `16860dde242c8010b496a9806e1a2db384c892404f00d6ff50a676a22c34fb59`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/composites_native/b_idle_right_triptych.png` · SHA256 `9308d81497c864cd7710e85f22b76ccd4452dcb4440b28ba418c62999c900ed0`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/contact/frame01_idle_right_pair_2x.png` · SHA256 `2f9d88300b6332bd49bc1dca3fd41271e18e2e90501ae81abcb4a8f18b6f0f19`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/contact/frame01_idle_right_pair_2x_labeled.png` · SHA256 `2f9d88300b6332bd49bc1dca3fd41271e18e2e90501ae81abcb4a8f18b6f0f19`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/contact/frame01_idle_right_pair_native.png` · SHA256 `1302e560c864ea08ecae83ab9bb6b973667afc13d5838c2c47e40c4766f5fa6d`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/contact/frame01_idle_right_pair_native_labeled.png` · SHA256 `1302e560c864ea08ecae83ab9bb6b973667afc13d5838c2c47e40c4766f5fa6d`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/hand_silhouettes/a_idle_right_fist_silhouette.png` · SHA256 `71cd7cc81b67015456575afcb66c65471c3129bfb27a9e3effa58ad5d8bfb191`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/hand_silhouettes/b_idle_right_fist_silhouette.png` · SHA256 `020227595550f789c85f5965aff28e1e133358e4f4cb6109be9682491d064a27`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/job.json` · SHA256 `ecc3af27eefbd7815fccdabb09d0874b5a266700ab9c06edf67bd5c6997a2033`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/occlusion_masks/a_idle_right_fist_roi.png` · SHA256 `71cd7cc81b67015456575afcb66c65471c3129bfb27a9e3effa58ad5d8bfb191`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/occlusion_masks/b_idle_right_fist_roi.png` · SHA256 `020227595550f789c85f5965aff28e1e133358e4f4cb6109be9682491d064a27`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/qa/knife_alignment_check.json` · SHA256 `c750b4ca5c66ae575f11efb34d420eebc07219752e727e80cdd5410a84afb697`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/qa/occlusion_coverage.json` · SHA256 `ed464589a9aefe853652fb58427148c3bb83ac329a5c87726f6e8718d94038de`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/qa/pm_data_check.json` · SHA256 `57432deca0901fa1c385d94883f5096aba34fecb96b6369c86cd71bf60daad95`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/qa/silhouette_mask_coverage.png` · SHA256 `45e10537530f38948e6e20e8b8a728dd737e66d74f63fabd453a8be101ebbf43`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/qa/zero_generation.json` · SHA256 `f3041a89dcf1f52cbc021102373cd4fb4e23ad4075a97ae4f1c2f01ac604ee23`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/raw/a_idle_right_body.png` · SHA256 `f65fae17b33b05b8c47dd9157e0251169da352b66c1441c0c0354cc860955afb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/raw/b_idle_right_body.png` · SHA256 `7c9eb5773454e0a2cfceeac7eab7337179b5f2179881cb099471b63586b1fd90`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/refs.json` · SHA256 `3871a4a7690d3e07f8fb4101cffee7e0e118d7db2c70f1ca8d6801a18c4d515d`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/request.md` · SHA256 `0e60a865898f69ca02addb369e00f55ce31c949f7999c341f915d9d4a5f53de0`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/weapon_layers/a_idle_right_placeholder_blade.png` · SHA256 `b3d17ad4387e6a8711903faaf44e836723b7bddda165d78bf35c151ab6b9b8e5`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v10/weapon_layers/b_idle_right_placeholder_blade.png` · SHA256 `b3d17ad4387e6a8711903faaf44e836723b7bddda165d78bf35c151ab6b9b8e5`

## 研发消费边界

研发消费 v10 标定 JSON 中 A/B 相同的握持点、角度、刀长、`layerOrder`、武器层字节关系与 B 精确拳遮罩契约；contact/coverage/knife_alignment 仅作诊断证据。Leo 目验与 PM 第二道规格门通过前不得接线。

本交接文件记录的是候选 v10；v9 保留为上一版候选对照，不修改、不删除。
