# T45 seq160 frame02 `walk_rightdown_1` · arm-perpendicular-v4 候选交接

- **本次修正**：Leo 要求刀轴与手臂成 90°。v3 的单一水平刀轴不再采用；v4 按每张身体帧可见的 elbow→grip 前臂中心线逐帧取正交刀轴。
- **手位**：右下背向视角中画面左侧拳=角色自身右手；甲/乙刀柄均放在该拳中心并由拳头前景遮挡。
- **角度自检**：甲 elbow→grip `(80,178)→(70,208)`，前臂轴 `108.435°`，刀轴 `18°`，夹角 `90.435°`（误差 `0.435°`）；乙 `(66,181)→(84,202)`，前臂轴 `49.399°`，刀轴 `-41°`，夹角 `90.399°`（误差 `0.399°`）。两帧均在 ±5° 门内。
- **刀柄自检**：甲/乙拳头 mask 内武器像素 `232/168`，D 遮挡后均为 `0`；握点与拳头区域重叠、无浮柄；`qa/knife_position_check.json` 已记录。
- **当前版本**：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/`。
- **冻结范围**：仅武器层、角度元数据与既有拳头遮挡诊断；甲乙身体 SHA 不变，正式 runtime 未改。
- **武器**：朴刀 Pillow 占位件，甲 `angleDeg=18°`、乙 `angleDeg=-41°`；柄34px、刃95px、总轴向129px。
- **状态**：`artifactStage=candidate`、`visualReview=pending_Leo`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`；v3 superseded。
- **自检门**：manifest 26 项；body SHA、RGBA/240×320、脚底 y=300、长度带、夹角、刀柄/拳头重叠、D 残留、native/2x、零生成均 PASS。

## 关键证据

- 对照：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/contact/frame02_walk_rightdown_1_pair_2x_labeled.png`
- 标定：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/calibration/frame02_walk_rightdown_1.json`
- 刀/臂角度与拳头重叠核验：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/qa/knife_position_check.json`
- 遮挡覆盖：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/qa/occlusion_coverage.json`、`qa/silhouette_mask_coverage.png`
- PM 核：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/qa/pm_data_check.json`

## 活动路径（manifest 26 项，SHA256）

- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/build_frame02.py` · SHA256 `5f7cccc001f9cce1e08aa813ffa42d4c202ebb1afccd3c27b9fb741d0f42815e`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/calibration/frame02_walk_rightdown_1.json` · SHA256 `ced800c9823fec463b21ed733206ce2d2b00ad28f8b31d73819bc07d48180feb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/composites_2x/a_walk_rightdown_1_triptych_2x.png` · SHA256 `12393e6a02e52b19ff7f654e3df65f63ff86cae9e5b467c0a2b103a923516510`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/composites_2x/b_walk_rightdown_1_triptych_2x.png` · SHA256 `52bb2584b0b93fb2787073385c91bfae57bca23d25fb067b4e14fe20eb05ec86`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/composites_native/a_walk_rightdown_1_triptych.png` · SHA256 `faa517f7d78d2af1858623b151078f8bf3e32b7858c74029c15292f8adbad806`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/composites_native/b_walk_rightdown_1_triptych.png` · SHA256 `e0da3660d6c301ab8958d36fd8e86470a029ad90b4e6cc87d7ed51fbc225b469`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/contact/frame02_walk_rightdown_1_pair_2x.png` · SHA256 `6dc818b3a6800c3ffbdcc098a7b5d70e5e27f1a5e02b0fec2668ec5e7f81c750`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/contact/frame02_walk_rightdown_1_pair_2x_labeled.png` · SHA256 `6dc818b3a6800c3ffbdcc098a7b5d70e5e27f1a5e02b0fec2668ec5e7f81c750`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/contact/frame02_walk_rightdown_1_pair_native.png` · SHA256 `2617b1f9f0e68d73b9c36ab61cf2979ea6c39c471f41be9a0969e487babca6a0`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/contact/frame02_walk_rightdown_1_pair_native_labeled.png` · SHA256 `2617b1f9f0e68d73b9c36ab61cf2979ea6c39c471f41be9a0969e487babca6a0`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/hand_silhouettes/a_walk_rightdown_1_fist_silhouette.png` · SHA256 `1b8dda954047a2088393903e3adecfe06fe9bd9c2f4ec68dd338acf619018117`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/hand_silhouettes/b_walk_rightdown_1_fist_silhouette.png` · SHA256 `5384dd665c3cf6f22ca4206ccf2913720f58530865e1d82e54c9b9b66f946223`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/job.json` · SHA256 `393baf7613a60378092b6dccce7e5b77815f40c84417196059067b1792d4f125`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/occlusion_masks/a_walk_rightdown_1_fist_roi.png` · SHA256 `1b8dda954047a2088393903e3adecfe06fe9bd9c2f4ec68dd338acf619018117`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/occlusion_masks/b_walk_rightdown_1_fist_roi.png` · SHA256 `5384dd665c3cf6f22ca4206ccf2913720f58530865e1d82e54c9b9b66f946223`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/qa/knife_position_check.json` · SHA256 `a87dbe31406e11429d06be8ed9d6c8b1d0502cec55b8d426f783f02a1b5a571e`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/qa/occlusion_coverage.json` · SHA256 `c4f7136fd29edbfb885effa38c1e8c713387d5f4da6f0209eca0298d5b09d868`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/qa/pm_data_check.json` · SHA256 `9e01afe6b44d8f72fd7ebe05db9bd8e3934ceba568ffb9166a1cbb8a19f41207`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/qa/silhouette_mask_coverage.png` · SHA256 `d16d7a31f21f0e39d7f8607327c25ffca57add5415c5332f339c623dbd68ddab`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/qa/zero_generation.json` · SHA256 `0f5dfaa15055363e13f00a7d4dfea5ce6159f0aad7fe4d61991a5fe5098a516f`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/raw/a_walk_rightdown_1_body.png` · SHA256 `fd0e961cf6e415b9997eb8acb9843a466bd5149d7dfaf2d80127e13c5202e7cb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/raw/b_walk_rightdown_1_body.png` · SHA256 `73fc8728cc3e18e73cc1a1fca8024049a80ab1ce4fbf66b31ddd916bffa5e4b6`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/refs.json` · SHA256 `2b97497027b4c97c7c963c0e2d51f304a98d10099beec86ac895594398f2b009`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/request.md` · SHA256 `b78af077e782fa48d6a10d749025b206d99b32318d9328401327944be56e5283`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/weapon_layers/a_walk_rightdown_1_placeholder_blade.png` · SHA256 `646f5739fc68209b8dd9946b9fada89805c5d0511a072eada1c6ccb442feabbb`
- `assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/weapon_layers/b_walk_rightdown_1_placeholder_blade.png` · SHA256 `cdb9705ee5723e2b64a1d3c7843f1827e17bcd22712c815da425c05883c5fb09`

## 研发消费边界

研发接线消费 manifest/calibration 中每帧 `gripPoint`、`angleDeg`、`layerOrder`、`armBladeRelation` 与 `occlusionRef`；D 三联图和覆盖图仅作诊断证据。v4 待 Leo 视觉目验与 PM 第二道规格门，保持 candidate-only，不写正式 runtime。
