# T45 主角武器首帧 · 剑柄落拳心修正版 v7 交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=superseded`
- `specGate=not_applicable`
- `integrationGate=superseded`
- `runtimeRelease=false`
- v6 位置候选保留作对照；本 v7 已被 v8 supersede。

## 本次修正

Leo 要求“认真用像素对一下，把剑放到拳心里”。v7 以 v6 透明剑层为唯一源，角色身体、剑身形状、`-40°` 右上轴线和既有上移位置全部冻结，只做整数横移 `+11px`。冻结身体的皮肤核心全像素质心为 `(101.6136,205.9091)`，取拳心 `(102,206)`；v6 在 `(91,206)` 的剑柄接触像素平移后精确落在 `(102,206)`，距离为 `0px`。

- 身体源：`assets/characters/hero/battle45/battle_idle_right.png`
- 身体 SHA：`713095264eead7e19fc6a0bded89af98b3b29fba68d5ad945a29820f0f5ec498`
- 武器源：v6 `normalized/hero_sword_held_rightup_v6.png`
- 目标武器层：`normalized/hero_sword_held_rightup_v7.png`
- 剑轴握点记录：`(121,185)`；轴角 `-40°`
- 拳心：`(102,206)`；柄接触点：`(102,206)`
- 处理：Pillow 整数平移 `(11,0)`，零生成、零旋转、零运行时写入。

## 机械核验

`qa/pilot_v7.json`：`allMachineChecksPass=true`。

- 240×320 RGBA、真实 alpha、单主体连通
- 轴向长度 `115.4977px`，处于 110~140px 带内
- 拳区武器像素 `96→0`
- 皮肤核心质心四舍五入与拳心一致
- 源/目标柄接触像素均通过，目标柄点与拳心距离 `0px`
- native/2x 对照尺寸通过
- `generationCredits=0`、`runtimeUntouched=true`

## 目测证据

- 全图对照：`contact/hero_idle_right_sword_pilot_v7_2x.png`
- 拳心像素放大（12× 最近邻网格，红十字为 `(102,206)`）：`contact/fist_center_zoom_v7.png`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/build_pilot_v7.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/request.md`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/refs.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/raw/hero_sword_held_transparent_source_attempt1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/normalized/hero_sword_held_rightup_v7.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/calibration/frame01_idle_right_v7.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/occlusion_masks/hero_idle_right_character_right_fist.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/composites_native/hero_idle_right_sword_triptych_v7.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/composites_2x/hero_idle_right_sword_triptych_v7_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/contact/hero_idle_right_sword_pilot_v7.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/contact/hero_idle_right_sword_pilot_v7_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/contact/fist_center_zoom_v7.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/qa/pilot_v7.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/fist-center-lock-v7/job.json`
