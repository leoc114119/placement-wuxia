# T45 主角武器合成 · frame02 walk_right_1 水平角度修正版 v2 交接

## 当前状态

- artifactStage=candidate
- visualReview=pending_Leo
- specGate=pending_pm_scan（PM 第二道门按 Leo 授权延后至全部动作帧确定后统一处理）
- integrationGate=not_handed_off
- runtimeRelease=false
- 只处理主角右系 walk_right_1 frame02；v1 保留作角度对照；不启动下一帧。

## 本次唯一改动

Leo 已确认 v1 的剑柄位置与拳心对位准确，但要求本帧剑身放平。v2 以 v1 整层为源，只将剑轴从 -40° 旋到画面水平 0°，旋转枢轴固定为 v1 已通过的柄中心 (83.5737,206.5878)；不平移柄中心、不改身体、不改剑身形状语义。

- 身体冻结：assets/characters/hero/battle45/walk_right_1.png
- 武器源冻结：assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/normalized/hero_sword_held_rightup_walk_right_1_v1.png
- 角色自身右手投影为画面左侧拳；皮肤核心质心 (83.9535,206.6744)，拳心 (84,207)。
- 源握点 (95,197) 仅因角度旋转后的几何关系变为约 (98.4897,206.5878)；柄中心固定不动，距拳心 0.593px。
- 使用 Pillow 最近邻确定性枢轴旋转（screen angle -40°→0°，无平移）；零生图、credits=0、runtime 未改。
- 拳部遮挡继续只取原身体 alpha 的紧拳 ROI；D 对照不作为 runtime 素材。

## 机械门

qa/pilot_walk_right_1_v2.json 的 checks.allMachineChecksPass=true：

- 240×320 RGBA、真实 alpha、边界透明、脚底 y=300、武器单连通。
- 轴向长度 116px，落在剑类 110~140px 带内；目标角度 0° 水平。
- 枢轴像素命中；柄中心固定距离核验通过；紧拳遮挡后武器残留 0。
- native / 2x 对照尺寸通过；零生成；运行时未写入。

## 目测入口

- 三联 2×：assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/contact/hero_walk_right_1_sword_pilot_v2_2x.png
- 拳心像素放大：assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/contact/walk_right_1_fist_center_zoom_v2.png

## 研发消费边界

- candidate-only，仅交校准、武器层、遮挡引用与证据；不进入 assets/characters/hero/battle45/ runtime。
- Leo 目验通过前不启动 walk_right_2；若有缺陷只改本帧角度/局部参数，保留 v1/v2 对照。
- PM 第二道规格门暂不阻塞动作帧继续确定，待全部动作帧定稿后统一送检。

## 活动路径 SHA-256

- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/build_frame02_v2.py · SHA256 0bce7478accd85eddc75d76e45d99e73aad478465b55d1318f745ddd142042f6
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/calibration/frame02_walk_right_1_v2.json · SHA256 11de2d7989db3b1efeb05a073a0a117db8c5d0d23ac99bcc5dee74d9454d0637
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/composites_2x/hero_walk_right_1_sword_triptych_v2_2x.png · SHA256 7b9f9c2fc76e3c0db6b1e4e8f1a2ddaa7443a253e323e5ac3a6f20e9b4001ce3
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/composites_native/hero_walk_right_1_sword_triptych_v2.png · SHA256 b10e73cc9e4c09dd57e44397ace64de3bb854f99877dccd85f919e3dd864382c
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/contact/hero_walk_right_1_sword_pilot_v2.png · SHA256 f8d00f5562b2e3142c39f928173e86da1e7d000aeb02175942adb8f4987d7c2a
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/contact/hero_walk_right_1_sword_pilot_v2_2x.png · SHA256 3a8fdfc87c483dd471c499769dd7bfd369bdf9527d9ae2eafa3649fb9aee136f
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/contact/walk_right_1_fist_center_zoom_v2.png · SHA256 833fcac40a06ede8df61f101d03d1b1b2e21f7fb7b160fc9f50df1a831fbea59
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/job.json · SHA256 fce1a5a74d4bc70c4d3eae650610a3225e356f7f3889f7632af90bb6033ecb14
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/manifest.json · SHA256 c9c74edba6e384d92ead8c686d3c037accade90d5fdc8862b4fb17f16c2be52f
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/normalized/hero_sword_held_horizontal_walk_right_1_v2.png · SHA256 e4daf035adf788de89c44fadde74ba4cf337b3b7373d8bb001f465b0470bb1d4
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/occlusion_masks/hero_walk_right_1_character_right_fist.png · SHA256 f13d411c43ee95a7b0666ec6e93bf16853c225815a00b6360f27a9949270c1a1
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/qa/pilot_walk_right_1_v2.json · SHA256 54d1b843a8315c2a134d08b8409a0668e5a58a439497041903c2855d7371f964
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/raw/hero_sword_held_transparent_source_attempt1.png · SHA256 853bee2393fa263bbb46710d6bc10b4fa0a6065b68d7797f049b68585243bf7e
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/refs.json · SHA256 2570543237d21cdf7da6b1c6c9bc893110fe8260767e8828d2f7e4c59a510378
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/request.md · SHA256 25367425c0893f4ac5aff66706f62930f044509bdedc2d4158fb7014a0372dc7

## 运输证据

- artifact + docs commit：361e672438749d975625eb7976043008f195ca54
- check_delivery.py：18/18 PASS（候选包、交接、线程与 LOG）
- projbus delivery：seq=206，messageId=e74bcf2a11f340dca64c49b881b13e49
- supersedes：frame02-walk-right-1-v1
- runtimeRelease=false；Leo 目验待办；PM 第二道规格门按授权延后至全部动作帧确定后统一处理。
