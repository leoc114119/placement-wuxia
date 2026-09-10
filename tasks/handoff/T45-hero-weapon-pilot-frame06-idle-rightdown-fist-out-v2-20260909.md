# T45 主角武器 frame06 `idle_rightdown` · 右手拳外转 body-front v2 交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=pending_Leo`
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`
- supersedes：`frame06-idle-rightdown-sword-right-hand-v1-body-front`

## 本次修正

Leo 指出右下帧的角色自身右手需要稍向外转，否则剑会读成刺向人物脸部；同时要求拳头修正必须落到人物本身的战斗帧，并继续锁定角色右手，不能换到左手。

- 身体运行时源冻结：`assets/characters/hero/battle45/battle_idle_rightdown.png`
- 身体候选帧：`body/battle_idle_rightdown_fist_out_v2.png`
- 身体处理：仅对画面右侧/角色右手完整拳部做确定性 `-15°` 外转，其他身体像素冻结
- 武器源：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/normalized/hero_sword_held_rightdown.png`
- 角色右手/画面右侧拳心：`(160.5,204.125)`
- 目标握点：`(160,204)`；平移 `(-15,+9)`
- 剑轴角度：`+46.377°` 保持
- `layerOrder=body_front`；`maskPolicy=none`
- 零生成、零运行时写入；正式 runtime 帧待视觉门和规格门后再替换

## 机械核验

`qa/pilot_idle_rightdown_right_hand_v2.json`：`allMachineChecksPass=true`。240×320 RGBA、身体候选 alpha/边界、剑单主体连通、投影剑长、角度、握点、body-front 合成、runtime 未改、生成额度为 0 均通过。

## 目测证据

- 全图三联预览：`contact/hero_idle_rightdown_sword_right_hand_v2_2x.png`
- 右手/剑接缝放大：`contact/idle_rightdown_right_fist_center_zoom_v2.png`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/body/battle_idle_rightdown_fist_out_v2.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/build_frame06_idle_rightdown_sword_v2.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/raw/hero_sword_source_rightdown_v1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/normalized/hero_sword_held_idle_rightdown_character_right_hand_v2.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/occlusion_masks/hero_idle_rightdown_screen_right_fist_v2.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/composites_native/hero_idle_rightdown_sword_right_hand_triptych_v2.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/composites_2x/hero_idle_rightdown_sword_right_hand_triptych_v2_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/contact/hero_idle_rightdown_sword_right_hand_v2_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/contact/idle_rightdown_right_fist_center_zoom_v2.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/calibration/frame06_idle_rightdown_right_hand_v2.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/qa/pilot_idle_rightdown_right_hand_v2.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-right-hand-v2-fist-out-body-front/job.json`
