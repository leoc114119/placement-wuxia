# T45 seq167 frame01 `idle_right` · v11 恢复 B v9 刀位并向手内下移候选交接

- **返工原因**：Leo 指定撤回 v10 的 A 对齐结果，恢复 B v9 刀位；在 v9 基础上把 B 刀层再向握拳内下移一点，并缩短露出的后段刀柄。
- **当前版本**：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/`。
- **本次边界**：A、甲乙身体帧、B v9 精确 4 连通橙色拳遮罩（ROI `(98,159)-(123,188)`、seed `(110,175)`、310 px）全部冻结；只改 B v9 武器层。
- **确定性调整**：B v9 刀层逐像素向下平移 `(0,+3)`，握点从 `(116,165)` 到 `(116,168)`；沿 `-55°` 刀轴把后段柄从 `[-20,14]` 缩为 `[-14,14]`（少 6px），刃段 `[15,110]`=95px 不变；不缩放、不重采样、不重绘。
- **像素事实**：源 B v9 武器 bbox `[103,73,182,184]`；v11 bbox `[106,76,182,182]`；`qa/knife_position_check.json` 显示像素映射精确通过；B 精确拳选区内武器 `84→0`。
- **程序化门检**：26 项活动路径；身体 SHA 冻结 2/2、A 武器冻结、B 源自 v9、握点下移 3px、柄后段缩短 6px、刃段保持 95px、精确拳遮罩 310px、无 torso/sleeve bridge、native/2x/零生成门通过。
- **状态**：`artifactStage=candidate`、`visualReview=pending_Leo`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。正式 runtime 未写入，下一帧不启动。
- **交付落库状态**：以下候选包将随本次提交入库；交付后补写 commit、路径 SHA 与 projbus seq。

## 关键证据

- 对照：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/contact/frame01_idle_right_pair_native_labeled.png`
- B 三联：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/composites_2x/b_idle_right_triptych_2x.png`
- 刀位核验：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/qa/knife_position_check.json`
- 遮罩覆盖：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/qa/silhouette_mask_coverage.png`
- 完整事实：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/manifest.json`、`calibration/frame01_idle_right.json`、`qa/occlusion_coverage.json`、`qa/pm_data_check.json`

## 活动路径（manifest 26 项，SHA256）

- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/build_v11_b_v9_knife_lower.py` · SHA256 `5e625862c77693b3d1ea22922578ffb1a6e9d11ecd08128faeffde4c7ea4a957`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/calibration/frame01_idle_right.json` · SHA256 `5e7bc5b49e6d544efe3613b3d2c9bb1519f44a8306ab6f2feecfea5b73666003`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/composites_2x/a_idle_right_triptych_2x.png` · SHA256 `5780124733070ee2bc783bd440f03d597038d7b990623f23639943bfae41d80b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/composites_2x/b_idle_right_triptych_2x.png` · SHA256 `8ad6f36a14f8399d2da77d7ad36d6fc5cb794f4ea49e9485c0e679d469310a3b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/composites_native/a_idle_right_triptych.png` · SHA256 `16860dde242c8010b496a9806e1a2db384c892404f00d6ff50a676a22c34fb59`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/composites_native/b_idle_right_triptych.png` · SHA256 `13d775a2d3b6e1e71acf9a0557ec2a842940ba813d4b71901c9fbacbe4e63e02`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/contact/frame01_idle_right_pair_2x.png` · SHA256 `35ebd7fc99b2a5bf2341646b500731fa16bd4d625a72225c3f2dbf6ccfc811da`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/contact/frame01_idle_right_pair_2x_labeled.png` · SHA256 `35ebd7fc99b2a5bf2341646b500731fa16bd4d625a72225c3f2dbf6ccfc811da`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/contact/frame01_idle_right_pair_native.png` · SHA256 `94d08376aac2818fcbff07750e9579d37e9e30b0ac045e19cc26d9311743e37e`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/contact/frame01_idle_right_pair_native_labeled.png` · SHA256 `94d08376aac2818fcbff07750e9579d37e9e30b0ac045e19cc26d9311743e37e`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/hand_silhouettes/a_idle_right_fist_silhouette.png` · SHA256 `71cd7cc81b67015456575afcb66c65471c3129bfb27a9e3effa58ad5d8bfb191`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/hand_silhouettes/b_idle_right_fist_silhouette.png` · SHA256 `020227595550f789c85f5965aff28e1e133358e4f4cb6109be9682491d064a27`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/job.json` · SHA256 `184bf78233e0855b069645acacecef5d1de3cc8c6652801384b69ad3fc40e699`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/occlusion_masks/a_idle_right_fist_roi.png` · SHA256 `71cd7cc81b67015456575afcb66c65471c3129bfb27a9e3effa58ad5d8bfb191`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/occlusion_masks/b_idle_right_fist_roi.png` · SHA256 `020227595550f789c85f5965aff28e1e133358e4f4cb6109be9682491d064a27`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/qa/knife_position_check.json` · SHA256 `cef8da8a425be6d18f6d009b27d38399738914a5de15dc30b27019c58c41ee1e`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/qa/occlusion_coverage.json` · SHA256 `947fd6005f2c8e2d071f9d7912b6fb2624b0cd38d4788da119278ff1d46c0387`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/qa/pm_data_check.json` · SHA256 `57a2626be152234186320961880bc177974d51363ecaa06d0d3b226a312ac83b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/qa/silhouette_mask_coverage.png` · SHA256 `faa07fa0fda2029cbec03ebd6d959ee1fc93727156659226d51788f9dc85c9c3`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/qa/zero_generation.json` · SHA256 `a476220bf7dd0191b1270f47c7a200fc0609cbf28dfde20dd39534c887023c55`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/raw/a_idle_right_body.png` · SHA256 `f65fae17b33b05b8c47dd9157e0251169da352b66c1441c0c0354cc860955afb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/raw/b_idle_right_body.png` · SHA256 `7c9eb5773454e0a2cfceeac7eab7337179b5f2179881cb099471b63586b1fd90`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/refs.json` · SHA256 `f463cae177d6bd51205d3bb1dddfb84299f00e901bf7c041cd9634b180e4bd87`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/request.md` · SHA256 `7f0cacd012e2afb8e36480a9222189a2ba0933ed67bf42c501b50c51f61d4fd5`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/weapon_layers/a_idle_right_placeholder_blade.png` · SHA256 `b3d17ad4387e6a8711903faaf44e836723b7bddda165d78bf35c151ab6b9b8e5`
- `assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v11/weapon_layers/b_idle_right_placeholder_blade.png` · SHA256 `ff8bbba82ab7c218c2cff91517440652448c5c622c81d2b9844041c86acc840f`

## 研发消费边界

研发消费 v11 标定 JSON 中 A/B 的角色右手语义、角度、`layerOrder`、B 握点 `(116,168)`、B 刀层来源与遮挡契约；B 的 v9→v11 平移/柄长调整事实以 `qa/knife_position_check.json` 为准。contact/coverage 仅作诊断证据。Leo 目验与 PM 第二道规格门通过前不得接线。

本交接文件记录候选 v11；v9、v10 均保留为历史对照，不修改、不删除。
