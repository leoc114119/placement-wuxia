# T45 主角武器首帧 · 剑柄落拳心像素锁修正版 v8 交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=superseded`
- `specGate=not_applicable`
- `integrationGate=superseded`
- `runtimeRelease=false`
- v7 保留作对照证据并标记为 superseded；本 v8 已被 v9 supersede。

## 本次修正

Leo 要求“认真用像素对一下，把剑放到拳心里”。复核 v7 后发现其把剑层右移到的是剑尾/柄端，物理握持仍不对；v8 回到 v4 的刀身几何与握持语义，以冻结身体的皮肤核心全像素质心定位拳心，只做确定性整数平移。

- 身体冻结：`assets/characters/hero/battle45/battle_idle_right.png`
- 身体 SHA：`713095264eead7e19fc6a0bded89af98b3b29fba68d5ad945a29820f0f5ec498`
- 武器源：v4 `normalized/hero_sword_held_rightup_v4.png`，SHA `83206e70bc3b474b5b49a40ff7e2cf5648e5a7ddbdbad99aafd9921b2685e368`
- 目标武器层：`normalized/hero_sword_held_rightup_v8.png`，SHA `b413978ccaff1e22cd0bd02188203d3cb6b27be5d215e2a37702c899c8f2b72c`
- 皮肤核心质心：`(101.6136,205.9091)`，取整拳心：`(102,206)`
- v4 握点/柄接触：`(100,205)` → v8：`(102,206)`；目标柄接触与拳心距离 `0px`
- 处理：整层平移 `(+2,+1)px`；不旋转、不重绘、不重新生图；`generationCredits=0`
- 剑轴：`-40°` 向右上，轴向长度 `115.4977px`（110~140px 带内）；`layerOrder=front`
- 拳部遮挡：仅使用原身体 alpha 的紧角色右拳 ROI，不绘制替代手；拳区武器像素 `215→0`

## 机械核验

`qa/pilot_v8.json`：`allMachineChecksPass=true`。

- 240×320 RGBA、真实 alpha、单主体连通、边界透明、脚底 y=300
- 皮肤核心四舍五入命中 `(102,206)`
- 源/目标柄接触像素通过，目标点与拳心距离 `0px`
- native/2x 对照尺寸通过
- `runtimeUntouched=true`、`runtimeRelease=false`

## 目测证据

- 全图三联对照：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/contact/hero_idle_right_sword_pilot_v8_2x.png`
- 拳心像素放大（12× 最近邻网格，红十字为 `(102,206)`）：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/contact/fist_center_zoom_v8.png`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/build_pilot_v8.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/request.md`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/refs.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/raw/hero_sword_held_transparent_source_attempt1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/normalized/hero_sword_held_rightup_v8.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/calibration/frame01_idle_right_v8.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/occlusion_masks/hero_idle_right_character_right_fist.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/composites_native/hero_idle_right_sword_triptych_v8.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/composites_2x/hero_idle_right_sword_triptych_v8_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/contact/hero_idle_right_sword_pilot_v8.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/contact/hero_idle_right_sword_pilot_v8_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/contact/fist_center_zoom_v8.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/qa/pilot_v8.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-grip-v8/job.json`

本包为历史候选，已被 v9 supersede；正式 runtime 未改。
