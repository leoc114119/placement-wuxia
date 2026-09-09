# T45 主角武器 frame06 `idle_rightdown` · 完整拳头顶层遮罩 v7 交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=pending_Leo`
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`
- supersedes：frame06 v6 grip-point-lock、v5、v4、v3、v2、v1

## 本次修正

Leo 指出 v6 仍有穿帮：之前只把拳头皮肤像素恢复到顶层，拳头外轮廓/边缘没有作为完整前景层处理。本版按原身体 alpha 在紧拳轮廓内完整抠出整只拳头，并置于剑层顶端。

- 身体运行时源冻结：`assets/characters/hero/battle45/battle_idle_rightdown.png`
- 候选身体：`body/battle_idle_rightdown_fist_out_v7.png`
- 完整拳头遮罩：`occlusion_masks/hero_idle_rightdown_screen_left_fist_v7.png`
- 遮罩策略：紧拳轮廓内的全部原身体 alpha 像素（含拳头皮肤、暗色外轮廓与边缘），不绘制新像素
- 图层顺序：身体底图 → 武器 → 完整拳头 cutout 顶层
- 标注握点仍为镜像源 `(74,185)`，平移 `(+43,-13)` 对齐拳心控制像素 `(102,195)`
- 剑轴仍为 `-75°`，从垂直向上朝人物脸部转 `15°`
- 零生成、零运行时写入；正式 runtime 帧待视觉门和规格门后再替换

## 机械核验

`qa/pilot_idle_rightdown_character_right_hand_v7.json`：`allMachineChecksPass=true`。完整拳头遮罩内武器像素 `186→0`；240×320 RGBA、剑单主体连通、`-75°`、握点对齐、weapon-front+完整拳头顶层、runtime 未改、生成额度为 0 均通过。

## 目测证据

- 全图三联预览：`contact/hero_idle_rightdown_sword_character_right_hand_v7_2x.png`
- 拳头/剑柄放大：`contact/idle_rightdown_character_right_fist_center_zoom_v7.png`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/body/battle_idle_rightdown_fist_out_v7.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/build_frame06_idle_rightdown_sword_v7.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/normalized/hero_sword_held_idle_rightdown_character_right_hand_v7.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/occlusion_masks/hero_idle_rightdown_screen_left_fist_v7.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/composites_2x/hero_idle_rightdown_sword_character_right_hand_triptych_v7_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/contact/hero_idle_rightdown_sword_character_right_hand_v7_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/contact/idle_rightdown_character_right_fist_center_zoom_v7.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/calibration/frame06_idle_rightdown_character_right_hand_v7.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/qa/pilot_idle_rightdown_character_right_hand_v7.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v7-complete-fist-top/job.json`

## 交接口径

这是候选交付，待 Leo 视觉目验与 PM 第二道规格门；`runtimeRelease=false`，不得直接接入正式 runtime。
