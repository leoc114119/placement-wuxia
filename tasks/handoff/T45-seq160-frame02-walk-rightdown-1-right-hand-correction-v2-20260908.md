# T45 seq160 frame02 `walk_rightdown_1` · right-hand-correction-v2 候选交接

- **返工原因**：Leo 指出 v1 武器接在画面右侧拳，非角色自身右手；v1 作废。本版只修武器层、握点与紧拳遮挡，甲乙身体字节冻结。
- **手位裁决**：依据 `tasks/answers/A1-T45-rightdown-hand.md`，右下背向视角中画面左侧肩/拳=角色自身右手；画面右侧拳收腰。
- **当前版本**：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/`。
- **本次范围**：仅甲/乙 `walk_rightdown_1`；未改正式 `assets/characters/enemy/*/battle45/` runtime。
- **武器标定**：甲握点 `(70,208)`、乙 `(84,202)`，均角色自身右手的画面左侧拳；`angleDeg=-55°`，`layerOrder=front`；柄 `[-20,14]`=34px，刃 `[15,110]`=95px，总轴向129px，`profile=long_broad_single_edge_dao_placeholder_v5`。
- **遮挡标定**：两帧紧拳轮廓二值 body-alpha mask，袖口/躯干不进 mask；D 拳区残留刀像素 `0/2`，D 拳区与原身体差 `0/2`；甲 mask 527px、乙 383px。
- **生产方式**：Pillow 确定性绘制与合成，生成积分 0；占位刀仅用于锚点/叠层验证，不是最终朴刀美术。
- **状态**：`artifactStage=candidate`、`visualReview=pending_Leo`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。
- **自检**：manifest 26 项活动路径；native/2x 尺寸、RGBA/脚底 y=300、SHA 冻结、长度带、遮挡残留、零生成均 PASS。

## 关键证据

- 对照：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/contact/frame02_walk_rightdown_1_pair_2x_labeled.png`
- 标定：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/calibration/frame02_walk_rightdown_1.json`
- 遮挡覆盖：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/qa/occlusion_coverage.json`、`qa/silhouette_mask_coverage.png`
- 刀位核验：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/qa/knife_position_check.json`
- PM 核：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/qa/pm_data_check.json`

## 活动路径（manifest 26 项，SHA256）

- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/build_frame02.py` · SHA256 `e5291b2ca211e7e0df4fab6a75af7d14bfb735e29dcb79150487706d256906c4`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/calibration/frame02_walk_rightdown_1.json` · SHA256 `2d71b2362c45d09d718fdd5ea22c24acccab906074fc7d9b688637d54a586dad`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/composites_2x/a_walk_rightdown_1_triptych_2x.png` · SHA256 `a743621b0c9e9744e4a0f2f63fb64561d1dde7b51dd2e50f8e50d44548454a07`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/composites_2x/b_walk_rightdown_1_triptych_2x.png` · SHA256 `a2a7a03b24fff1c2f7ccb3b1c4e87f570a57a569bc702e803bca32c29abc3a78`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/composites_native/a_walk_rightdown_1_triptych.png` · SHA256 `1baa9b643efcb55bea5108df6e4386ac650e79a7083bf4be09fb903f100f4c3d`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/composites_native/b_walk_rightdown_1_triptych.png` · SHA256 `73058440d6b5562712203c98f7a76f7460bb364402a819d826fa9ce6cf93bfd8`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/contact/frame02_walk_rightdown_1_pair_2x.png` · SHA256 `a69fa45647ce0604038b9f75c11c8294acbf5a3b914e66119bad4d3aa31f2c69`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/contact/frame02_walk_rightdown_1_pair_2x_labeled.png` · SHA256 `a69fa45647ce0604038b9f75c11c8294acbf5a3b914e66119bad4d3aa31f2c69`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/contact/frame02_walk_rightdown_1_pair_native.png` · SHA256 `e10c102c8fab10c5c379720792b59f8e5b659da3748fb3bd3eaa234152d8cbfb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/contact/frame02_walk_rightdown_1_pair_native_labeled.png` · SHA256 `e10c102c8fab10c5c379720792b59f8e5b659da3748fb3bd3eaa234152d8cbfb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/hand_silhouettes/a_walk_rightdown_1_fist_silhouette.png` · SHA256 `1b8dda954047a2088393903e3adecfe06fe9bd9c2f4ec68dd338acf619018117`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/hand_silhouettes/b_walk_rightdown_1_fist_silhouette.png` · SHA256 `5384dd665c3cf6f22ca4206ccf2913720f58530865e1d82e54c9b9b66f946223`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/job.json` · SHA256 `6c2edafde227a62eb3cfb0546ad033846d842253900e8ff39773f4f42b2897a9`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/occlusion_masks/a_walk_rightdown_1_fist_roi.png` · SHA256 `1b8dda954047a2088393903e3adecfe06fe9bd9c2f4ec68dd338acf619018117`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/occlusion_masks/b_walk_rightdown_1_fist_roi.png` · SHA256 `5384dd665c3cf6f22ca4206ccf2913720f58530865e1d82e54c9b9b66f946223`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/qa/knife_position_check.json` · SHA256 `b781e4f483685de3db67b543f39b451c2b8f94c9ea7d74933f729952799f4bb3`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/qa/occlusion_coverage.json` · SHA256 `59eb84daf562db296c96ebed3b282ac67a84f0e8c5933e2259d1a17f7890ad8c`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/qa/pm_data_check.json` · SHA256 `c576eabd94a7ad7bfedcd03ed46f95716edb5de1243c23cb182b4eb2d79c961d`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/qa/silhouette_mask_coverage.png` · SHA256 `e7f9fac067aa28f5a55391a20ff36ac5d8d041721fe228512c622462f498f87e`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/qa/zero_generation.json` · SHA256 `e31ce37e9ca36209ee42e9dc6146cd9b0bc67a1286ab316f956a79b58a3e9f26`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/raw/a_walk_rightdown_1_body.png` · SHA256 `fd0e961cf6e415b9997eb8acb9843a466bd5149d7dfaf2d80127e13c5202e7cb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/raw/b_walk_rightdown_1_body.png` · SHA256 `73fc8728cc3e18e73cc1a1fca8024049a80ab1ce4fbf66b31ddd916bffa5e4b6`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/refs.json` · SHA256 `743e5db8d7867bf50bb4814d2ee80fc0321c750e7003da3feac9aef96d3a5e64`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/request.md` · SHA256 `2d8e2390474f9068d30144d1a7542c63465c00c4134464ac97381028595685c2`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/weapon_layers/a_walk_rightdown_1_placeholder_blade.png` · SHA256 `50cbb73fa9f9145be63e25e5711e4c75a1e9f274a16328de49132868c79f457c`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/right-hand-correction-v2/weapon_layers/b_walk_rightdown_1_placeholder_blade.png` · SHA256 `8b35837c5de79cbe41ee7f82784c2dc89d72e195ea15a6a696b06044a427bdaa`

## 研发消费边界

研发接线消费 manifest/calibration 中每帧 `gripPoint`、`angleDeg`、`layerOrder` 与 `occlusionRef`；D 三联图和覆盖图仅作诊断证据。v2 待 Leo 视觉目验与 PM 第二道规格门，保持 candidate-only，不写正式 runtime。

## 提交与运输

- artifact commit：`c2d99b6f8ed0d093428f056177c883b367bbbe13`（分支 `codex/t45-shanzei-2b-pilot`，已推送）。
- `check_delivery.py`：26/26 activity paths PASS，核验同一 artifact commit；该检查只证明路径与字节，不替代 Leo 视觉门或 PM 规格门。
- projbus delivery：seq=180，messageId=`fbddaa2c91714715ae373942ec1d9f96`；后续 docs commit 会补发更正交接。
- superseding delivery：seq=181，messageId=`f70e74f3108949049d231de39ca5f405`；payload 同时回显 artifact commit `c2d99b6f8ed0d093428f056177c883b367bbbe13`、docs commit `de1f3bfb2a1de384d6dd759e362eee01a24304b7`、check_delivery 26/26 PASS；seq=180 已被本次更正取代。
