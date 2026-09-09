# T45 主角武器 frame06 `idle_rightdown` · 垂直插拳心 weapon-front v4 交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=pending_Leo`
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`
- supersedes：frame06 v3 斜上方向、v2 fist-out body-front、v1 body-front

## 本次修正

Leo 最新纠正为：剑柄必须垂直插入拳心。保留角色自身右手、拳心位置、拳头外转和精确遮罩，只把剑轴改为画面正上方垂直轴。

- 身体运行时源冻结：`assets/characters/hero/battle45/battle_idle_rightdown.png`
- 候选身体：`body/battle_idle_rightdown_fist_out_v4.png`
- 身体处理：仅对画面左侧/角色右手完整拳部做确定性 `+15°` 外转，其他身体像素冻结
- 武器源：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/normalized/hero_sword_held_rightdown.png`
- 角色右手/画面左侧拳心：`(102.15625,195.359375)`
- 柄中心目标：`(102,195)`；平移 `(+38,0)`
- 剑轴：`-90°`（画面正上方；坐标定义 0°=右，+Y 向下）
- `layerOrder=weapon_front`
- `maskPolicy=precise_fist_overlay`：剑层先合成，再只恢复精确角色右拳轮廓
- 零生成、零运行时写入；正式 runtime 帧待视觉门和规格门后再替换

## 机械核验

`qa/pilot_idle_rightdown_character_right_hand_v4.json`：`allMachineChecksPass=true`。240×320 RGBA、身体候选 alpha/边界、剑单主体连通、轴向长度、垂直角度、柄心与拳心误差 <1px、weapon-front+精确拳遮罩、runtime 未改、生成额度为 0 均通过；拳区武器 `91→0`。

## 目测证据

- 全图三联预览：`contact/hero_idle_rightdown_sword_character_right_hand_v4_2x.png`
- 拳心/剑柄放大：`contact/idle_rightdown_character_right_fist_center_zoom_v4.png`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/body/battle_idle_rightdown_fist_out_v4.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/build_frame06_idle_rightdown_sword_v4.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/raw/hero_sword_source_rightdown_v1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/normalized/hero_sword_held_idle_rightdown_character_right_hand_v4.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/occlusion_masks/hero_idle_rightdown_screen_left_fist_v4.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/composites_native/hero_idle_rightdown_sword_character_right_hand_triptych_v4.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/composites_2x/hero_idle_rightdown_sword_character_right_hand_triptych_v4_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/contact/hero_idle_rightdown_sword_character_right_hand_v4_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/contact/idle_rightdown_character_right_fist_center_zoom_v4.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/calibration/frame06_idle_rightdown_character_right_hand_v4.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/qa/pilot_idle_rightdown_character_right_hand_v4.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v4-vertical-grip/job.json`

## 交接口径

这是候选交付，待 Leo 视觉目验与 PM 第二道规格门；`runtimeRelease=false`，不得直接接入正式 runtime。
