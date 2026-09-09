# T45 主角武器 frame06 `idle_rightdown` · 拳心对齐并朝脸 15° v5 交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=pending_Leo`
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`
- supersedes：frame06 v4 vertical-grip、v3 weapon-front、v2 fist-out body-front、v1 body-front

## 本次修正

Leo 最新要求为：剑柄中心与拳头中心对齐，剑再向人物脸部转约 15°。本版冻结 v4 身体、右手和精确拳遮罩，仅调整武器层。

- 角色右手/画面左侧拳心质心：`(102.15625,195.359375)`
- 拳心控制像素：`(102,195)`
- 剑柄中心控制像素：`(102,195)`，由源柄中心 `(64,195)` 通过整数平移 `(+38,0)` 锁定；质心误差 `<0.4px`
- 剑轴：`-75°`，相对垂直向上向人物脸部（画面右上）转 `15°`
- `layerOrder=weapon_front`
- `maskPolicy=precise_fist_overlay`：先合成剑层，再只恢复精确角色右拳轮廓
- 零生成、零运行时写入；正式 runtime 帧待视觉门和规格门后再替换

## 机械核验

`qa/pilot_idle_rightdown_character_right_hand_v5.json`：`allMachineChecksPass=true`。240×320 RGBA、剑单主体连通、投影剑长、`-75°` 角度、柄心/拳心对齐、weapon-front+精确拳遮罩、runtime 未改、生成额度为 0 均通过；拳区武器 `91→0`。

## 目测证据

- 全图三联预览：`contact/hero_idle_rightdown_sword_character_right_hand_v5_2x.png`
- 拳心/剑柄放大：`contact/idle_rightdown_character_right_fist_center_zoom_v5.png`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/body/battle_idle_rightdown_fist_out_v5.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/build_frame06_idle_rightdown_sword_v5.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/normalized/hero_sword_held_idle_rightdown_character_right_hand_v5.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/occlusion_masks/hero_idle_rightdown_screen_left_fist_v5.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/composites_2x/hero_idle_rightdown_sword_character_right_hand_triptych_v5_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/contact/hero_idle_rightdown_sword_character_right_hand_v5_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/contact/idle_rightdown_character_right_fist_center_zoom_v5.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/calibration/frame06_idle_rightdown_character_right_hand_v5.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/qa/pilot_idle_rightdown_character_right_hand_v5.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v5-grip-center-face15/job.json`

## 交接口径

这是候选交付，待 Leo 视觉目验与 PM 第二道规格门；`runtimeRelease=false`，不得直接接入正式 runtime。
