# T45 主角武器 frame06 `idle_rightdown` · 完整身体前置候选交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=pending_Leo`
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`

## 本次产出

承接 frame05 body-front 规则，处理下一张 `battle_idle_rightdown`：复用既有右下方向透明剑源，不旋转，按角色自身右手在当前右下姿态的画面右侧拳对齐。完整角色身体层置于剑层前方，最终不依赖局部拳部遮罩。

- 身体源：`assets/characters/hero/battle45/battle_idle_rightdown.png`
- 武器源：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/normalized/hero_sword_held_rightdown.png`
- 画面右侧拳心：`(160.5,204.125)`
- 源握点：`(175,195)`；目标握点：`(160,204)`
- 确定性整数平移：`(-15,+9)`
- 源剑轴角度保持 `+46.377°`（0°=画面右，+Y 向下）
- `layerOrder=body_front`；`maskPolicy=none`
- 零生成、零运行时写入

## 机械核验

`qa/pilot_idle_rightdown_right_hand_v1.json` 的 `allMachineChecksPass=true`：240×320 RGBA、边界透明、单主体连通、投影剑长 110~140px、源角度、握点、body-front 合成、runtime 未改、生成额度为 0 均通过。

## 目测证据

- 全图三联预览：`contact/hero_idle_rightdown_sword_right_hand_v1_2x.png`
- 拳/剑接缝放大：`contact/idle_rightdown_right_fist_center_zoom_v1.png`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/build_frame06_idle_rightdown_sword_v1.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/raw/hero_sword_source_rightdown_v1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/normalized/hero_sword_held_idle_rightdown_character_right_hand_v1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/occlusion_masks/hero_idle_rightdown_screen_right_fist_v1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/composites_native/hero_idle_rightdown_sword_right_hand_triptych_v1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/composites_2x/hero_idle_rightdown_sword_right_hand_triptych_v1_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/contact/hero_idle_rightdown_sword_right_hand_v1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/contact/hero_idle_rightdown_sword_right_hand_v1_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/contact/idle_rightdown_right_fist_center_zoom_v1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/calibration/frame06_idle_rightdown_right_hand_v1.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/qa/pilot_idle_rightdown_right_hand_v1.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v1-body-front/job.json`
