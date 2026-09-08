# T45 seq160 frame02 `walk_rightdown_1` · full-fist-occlusion-v1 候选交接

- **放行来源**：研发线 PM2 seq=174 已确认 frame01 v11 规格门 PASS 并放行 frame02；本包继续按“标定→合成→PM 数据核+Leo 目验→双过再进下一帧”。
- **当前版本**：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/`。
- **本次范围**：仅甲/乙 `walk_rightdown_1` 两张身体帧；身体字节从正式 `battle45/` 复制并冻结；无正式 runtime 写入。
- **武器标定**：甲握点 `(172,172)`、乙握点 `(178,172)`；统一 `angleDeg=-55°`（握点→刀尖，0°屏幕右、+Y向下、顺时针为正）；正面 `layerOrder=front`；柄轴段 `[-20,14]`=34px、刃轴段 `[15,110]`=95px、总长 129px，profile=`long_broad_single_edge_dao_placeholder_v5`。
- **遮挡标定**：每帧紧拳轮廓内二值 body-alpha，完整拳头覆盖、袖口/躯干不进 mask；D 面板拳区残留刀像素 0/2，D 拳区与原身体差 0/2。
- **生产方式**：Pillow 确定性绘制与合成，生成积分 0；占位刀仅用于锚点/叠层验证，不是最终朴刀美术。
- **状态**：`artifactStage=candidate`、`visualReview=pending_Leo`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。
- **交付提交**：`63833c2f0df215c22e0fb53179ad43a5f7f6932f`（已推送 `origin/codex/t45-shanzei-2b-pilot`）。
- **运输核验**：skill `check_delivery.py` 对 26 项活动路径逐文件 SHA 核验 PASS；该工具仅证明 commit/path/bytes，不替代 Leo 审美门或 PM 第二道规格门。

## 关键证据

- 对照：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/contact/frame02_walk_rightdown_1_pair_2x_labeled.png`
- 标定：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/calibration/frame02_walk_rightdown_1.json`
- 遮挡覆盖：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/qa/occlusion_coverage.json`、`qa/silhouette_mask_coverage.png`
- 刀位核验：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/qa/knife_position_check.json`
- PM 核：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/qa/pm_data_check.json`

## 活动路径（manifest 26 项，SHA256）

- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/build_frame02.py` · SHA256 `ada2bd93cad7f2a6bef3c5bc75c94756491059f9e1e7c367a250e43ba4121db5`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/calibration/frame02_walk_rightdown_1.json` · SHA256 `4b7d2fa650a545089a7c76e54cb9ebc5c5eced5a1c136113615bcaa8706ff993`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/composites_2x/a_walk_rightdown_1_triptych_2x.png` · SHA256 `f1f777625f9f2ffe13c1ec34fa4ce400a8866680c2b441560a8e4a2a9e5c29db`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/composites_2x/b_walk_rightdown_1_triptych_2x.png` · SHA256 `a12b595046ddaf529f4c83f436210ac585c10d7cf23550ccba4364dc5ff0b07b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/composites_native/a_walk_rightdown_1_triptych.png` · SHA256 `6045b9a2bf8f7c0aaac03fa1a2fd8a2592d105035582b17c8c2a509f3312d402`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/composites_native/b_walk_rightdown_1_triptych.png` · SHA256 `4b1211164b2aea9b045a5a7849a180f8a9c684fb6537bf6c75cc483d6b2d6e0d`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/contact/frame02_walk_rightdown_1_pair_2x.png` · SHA256 `7a1264b221079071ec7f81a19878388dc4bbbe6a5302ccc5577a49a33b0b8231`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/contact/frame02_walk_rightdown_1_pair_2x_labeled.png` · SHA256 `7a1264b221079071ec7f81a19878388dc4bbbe6a5302ccc5577a49a33b0b8231`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/contact/frame02_walk_rightdown_1_pair_native.png` · SHA256 `4cacd55604c6c1c9feb5a68c1bc4f44c67adbb71ee1351a6cdfb54946ca98bcc`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/contact/frame02_walk_rightdown_1_pair_native_labeled.png` · SHA256 `4cacd55604c6c1c9feb5a68c1bc4f44c67adbb71ee1351a6cdfb54946ca98bcc`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/hand_silhouettes/a_walk_rightdown_1_fist_silhouette.png` · SHA256 `d199966c6ea8a1c34ba5b3ec9c7996508736c3c9d497180ecafbd3b1c63bfef5`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/hand_silhouettes/b_walk_rightdown_1_fist_silhouette.png` · SHA256 `67e56a3177685f60b449e9a52224b6ab11805114e301d852e404a0e136f3080e`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/job.json` · SHA256 `2ce5343f2842c78480c210b0b48ee0607bc626386e4869e0c72d911a7fa493b2`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/occlusion_masks/a_walk_rightdown_1_fist_roi.png` · SHA256 `d199966c6ea8a1c34ba5b3ec9c7996508736c3c9d497180ecafbd3b1c63bfef5`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/occlusion_masks/b_walk_rightdown_1_fist_roi.png` · SHA256 `67e56a3177685f60b449e9a52224b6ab11805114e301d852e404a0e136f3080e`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/qa/knife_position_check.json` · SHA256 `cd48622b1a73f0d8c0df40b4e9f3470bda1c91694b24b3be35b34caf5b531964`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/qa/occlusion_coverage.json` · SHA256 `20da210b4c53cfb604ce01407b3d9f3c900a37c97eacaf8d0e7ed6703f437fc5`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/qa/pm_data_check.json` · SHA256 `0b6c587a8815a41a87c1603140808c37a6375b51274eb02457239496a5e782ba`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/qa/silhouette_mask_coverage.png` · SHA256 `cc56df4a5441a0de40d7bbda0ca1410e23f6d16bbc69a868c648f5663d9b0d9a`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/qa/zero_generation.json` · SHA256 `e2369b4cc34b71c6b6269ee964b841c191afc46279ce50282b0d169a47d73a39`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/raw/a_walk_rightdown_1_body.png` · SHA256 `fd0e961cf6e415b9997eb8acb9843a466bd5149d7dfaf2d80127e13c5202e7cb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/raw/b_walk_rightdown_1_body.png` · SHA256 `73fc8728cc3e18e73cc1a1fca8024049a80ab1ce4fbf66b31ddd916bffa5e4b6`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/refs.json` · SHA256 `f3c1a705ca134153de76db6d661df2a42d4180b9e1bfa1e472c2f6dc7534c2ca`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/request.md` · SHA256 `9e82256fb2a7143497266a95a97f3ac91d840b1cee78df57a4dd72ed3c29680b`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/weapon_layers/a_walk_rightdown_1_placeholder_blade.png` · SHA256 `81c98f265752bd95a0264f178ae12b3fb3ea403978e547b2f828742229959bbb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/full-fist-occlusion-v1/weapon_layers/b_walk_rightdown_1_placeholder_blade.png` · SHA256 `bac1d85cda0a1deea5a01db09ec5bbeb3cc54409386a3739f565a859c85fa90b`

## 研发消费边界

研发接线消费 manifest/calibration 中每帧 `gripPoint`、`angleDeg`、`layerOrder` 与 `occlusionRef`；D 三联图和覆盖图仅作诊断证据。Leo 目验与 PM 第二道规格门都通过前，保持 candidate-only，不写正式 runtime。
