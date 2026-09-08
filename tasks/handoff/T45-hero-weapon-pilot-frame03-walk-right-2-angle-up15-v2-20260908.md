# T45 主角武器合成 · frame03 walk_right_2 上抬 15° 修正版 v2 交接

## 当前状态

- artifactStage=candidate
- visualReview=pending_Leo
- specGate=pending_pm_scan（PM 第二道门按 Leo 授权延后至全部动作帧确定后统一处理）
- integrationGate=not_handed_off
- runtimeRelease=false
- v1 因 Leo 角度修正要求 superseded；本 v2 只处理本帧剑角度。

## 本次唯一改动

Leo 已确认 frame03 的剑柄位置良好，要求剑轴从水平上抬 15°，并让剑轴与拳头上沿形成垂直关系。本 v2 冻结身体、拳心、剑柄中心和剑长，只在固定柄中心做确定性枢轴旋转。

- 身体冻结：`assets/characters/hero/battle45/walk_right_2.png`。
- v1 武器源冻结：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-horizontal-v1/normalized/hero_sword_held_horizontal_walk_right_2_v1.png`。
- 角色自身右手投影为画面左侧拳；拳心 `(102,204)`，皮肤核心质心 `(101.5363,203.7542)`。
- 柄中心固定 `(101.5737,203.5878)`，距拳心 `0.593px`；无平移。
- 屏幕角度记为 `-15°`（右上）；Pillow 固定枢轴旋转参数 `+15°`，保持 `layerOrder=front`。
- 旋转后握点约 `(115.9814,199.7273)`，轴向长度约 117.3px，仍在剑类 110~140px 带内。
- 零生图、credits=0、无身体改动、runtime 未写入。

## 机械门

`qa/pilot_walk_right_2_up15_v2.json` 的 `checks.allMachineChecksPass=True`。

- 240×320 RGBA、真实 alpha、边界透明、脚底 y=300、武器单连通。
- 角度门 `weaponAngleUp15Pass=true`；遮挡后武器残留 `0`。
- native / 2x 对照尺寸通过；零生成；runtime 未写入。

## 目测入口

- 三联 2×：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/contact/hero_walk_right_2_sword_pilot_up15_v2_2x.png`
- 拳心像素放大：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/contact/walk_right_2_fist_center_zoom_up15_v2.png`

## 研发消费边界

- candidate-only；不进入 `assets/characters/hero/battle45/` runtime。
- Leo 目验通过前不启动下一帧；若有缺陷只改本帧角度/局部参数，保持柄中心冻结。
- PM 第二道规格门暂不阻塞动作帧继续确定，待全部动作帧定稿后统一送检。

## 活动路径 SHA-256

- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/calibration/frame03_walk_right_2_up15_v2.json · SHA256 8f5f77e8b8c222772bf5e65ccb3328840a6ee611227d3620349c9a70d73cd9cd
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/composites_2x/hero_walk_right_2_sword_triptych_up15_v2_2x.png · SHA256 9e3d112457a3b5885032136139471f45ede44248bcdd4aece95669079685e51a
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/composites_native/hero_walk_right_2_sword_triptych_up15_v2.png · SHA256 07bb2c395ea9d00533e017936ad8f16a35ff437b95e706ca03b02156bcaeaf2d
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/contact/hero_walk_right_2_sword_pilot_up15_v2.png · SHA256 453bc385ca2c5d2c7fbc8ff138fcbf0c5cbefb03592da0b8c4a2ca4d5bb09d17
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/contact/hero_walk_right_2_sword_pilot_up15_v2_2x.png · SHA256 d4f90b3f41e6835bcba3f035db5176179359ae7bf97fa266e6f6f885704c524d
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/contact/walk_right_2_fist_center_zoom_up15_v2.png · SHA256 d3db6b93b8ddfb6d2265c650838d1d7d5568c24795a31c9368546036c62f5cee
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/job.json · SHA256 91d1f5f5ad2358de75bfb6e6cfdf1898c8995aaecb12a1c7b58da5b4f350482a
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/manifest.json · SHA256 b0858655166ac0b2705baad146d52ca258a0d6a07af55ca9274833135b41bb0c
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/normalized/hero_sword_held_up15_walk_right_2_v2.png · SHA256 2761f8ce877e5a960eb18de19126fa74c0657582a801f3c0a64b09753178425e
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/occlusion_masks/hero_walk_right_2_character_right_fist_v2.png · SHA256 20f268a866555c2c45f0c40b77f980dca24b14136ab3ad9fd39785d753404395
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/qa/pilot_walk_right_2_up15_v2.json · SHA256 32b7917d752c706a47c4ecb63196ba02fe3c7c2bc0130fd4c74dd513117a0382
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/raw/hero_sword_held_horizontal_source_v1.png · SHA256 e9332f9671badc6f0bc6436caddc212391162c8078eb25e74582f88c7801f434
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/refs.json · SHA256 5325ef6c569620ac79949de8930101753301fb22f79ada5b4226692b91b3d20d
- assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/request.md · SHA256 1428395da18a7da5afece55fbede4ffe48bd5f75ea4275beb1dfe75f04447331

## 运输证据

- artifact commit：`a384ae65c3e69fd01088abe72c1b36331709b6c3`。
- check_delivery.py：19/19 PASS（v2 候选包、v1 superseded 证据与生成脚本路径逐文件 SHA 核验）。
- docs/handoff commit：本文件随本次证据提交。
- runtimeRelease=false；Leo 目验待办；PM 第二道规格门按授权延后。
