# T45 主角武器 frame06 `idle_rightdown` · 标注握点锁拳心 v6 交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=pending_Leo`
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`
- supersedes：frame06 v5 grip-center-face15、v4 vertical-grip、v3 weapon-front、v2 fist-out body-front、v1 body-front

## 本次修正

Leo 标注确认握点位于剑柄中段，不是剑柄与剑刃交接点。本版改用标注的下段握持点锁到拳心，保持身体、角色右手、遮罩和朝脸 15° 角度。

- 身体运行时源冻结：`assets/characters/hero/battle45/battle_idle_rightdown.png`
- 候选身体：`body/battle_idle_rightdown_fist_out_v6.png`
- 角色右手/画面左侧拳心质心：`(102.15625,195.359375)`；控制像素 `(102,195)`
- 标注握点：镜像后源坐标 `(74,185)`（源剑柄中段；不是刃柄交接点）
- 旋转枢轴：镜像源 `(64,195)`，仅用于保持剑身旋转几何
- 平移：`(+43,-13)`，使标注握点落在目标 `(102,195)`；拳心质心误差 `<0.4px`
- 剑轴：`-75°`，从垂直向上朝人物脸部/画面右上转 `15°`
- `layerOrder=weapon_front`
- `maskPolicy=precise_fist_overlay`
- 零生成、零运行时写入；正式 runtime 帧待视觉门和规格门后再替换

## 机械核验

`qa/pilot_idle_rightdown_character_right_hand_v6.json`：`allMachineChecksPass=true`。240×320 RGBA、剑单主体连通、轴向长度、`-75°`、标注握点/拳心对齐、weapon-front+精确拳遮罩、runtime 未改、生成额度为 0 均通过；拳区武器 `91→0`。

## 目测证据

- 全图三联预览：`contact/hero_idle_rightdown_sword_character_right_hand_v6_2x.png`
- 拳心/握点放大：`contact/idle_rightdown_character_right_fist_center_zoom_v6.png`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/body/battle_idle_rightdown_fist_out_v6.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/build_frame06_idle_rightdown_sword_v6.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/normalized/hero_sword_held_idle_rightdown_character_right_hand_v6.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/occlusion_masks/hero_idle_rightdown_screen_left_fist_v6.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/composites_2x/hero_idle_rightdown_sword_character_right_hand_triptych_v6_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/contact/hero_idle_rightdown_sword_character_right_hand_v6_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/contact/idle_rightdown_character_right_fist_center_zoom_v6.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/calibration/frame06_idle_rightdown_character_right_hand_v6.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/qa/pilot_idle_rightdown_character_right_hand_v6.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v6-grip-point-lock/job.json`

## 交接口径

这是候选交付，待 Leo 视觉目验与 PM 第二道规格门；`runtimeRelease=false`，不得直接接入正式 runtime。
