# T45 主角武器 frame05 `idle_rightup` · 完整身体前置修正版 v4 交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=pending_Leo`
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`

## 本次修正

Leo 要求解决 frame05 `idle_rightup` 画面右侧拳的手/剑残留：改为**完整角色身体层渲染在剑层前方**，不再依赖单独拳部遮挡合成；剑角度保持 `-40°` 不变，并在 v3 基础上再向上移动 `2px`。以 Leo 已选 v9 独立透明剑层为源，确定性整数平移 `(+76,-6)`，相对 v1 总上移 `5px`。

- 身体源：`assets/characters/hero/battle45/battle_idle_rightup.png`
- 武器源：`.../revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png`
- 归一化武器：`normalized/hero_sword_held_idle_rightup_character_right_hand_v4.png`
- 画面右侧拳心：`(178.1053,204.5)`
- 目标柄中心：`(177.5737,199.5878)`；与拳心的纵向差约 `-5px`
- `layerOrder=body_front`；`maskPolicy=none`（诊断 mask 保留但不参与最终合成）
- 零生成、零运行时写入

## 机械核验

`qa/pilot_idle_rightup_right_hand_v4.json`：身体画布/alpha/边界、武器画布/alpha、单主体连通、角度、`handleOffsetUp5`、body-front 模式、runtime 未改、生成额度为 0 均通过。`allMachineChecksPass=false` 仅因 240×320 预览在画面右边裁切剑尖；运行时继续消费独立透明剑源，不消费裁切预览。

## 目测证据

- 全图三联预览：`contact/hero_idle_rightup_sword_right_hand_v4_2x.png`
- 拳/剑接缝放大：`contact/idle_rightup_right_fist_center_zoom_v4.png`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/build_frame05_idle_rightup_sword_v4.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/raw/hero_sword_source_v9.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/normalized/hero_sword_held_idle_rightup_character_right_hand_v4.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/occlusion_masks/hero_idle_rightup_screen_right_fist_v4.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/composites_native/hero_idle_rightup_sword_right_hand_triptych_v4.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/composites_2x/hero_idle_rightup_sword_right_hand_triptych_v4_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/contact/hero_idle_rightup_sword_right_hand_v4.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/contact/hero_idle_rightup_sword_right_hand_v4_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/contact/idle_rightup_right_fist_center_zoom_v4.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/calibration/frame05_idle_rightup_right_hand_v4.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/qa/pilot_idle_rightup_right_hand_v4.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/job.json`
