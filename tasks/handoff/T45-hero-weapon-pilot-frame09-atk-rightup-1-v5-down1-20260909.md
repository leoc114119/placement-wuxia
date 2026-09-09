# T45 主角武器 frame09 `atk_rightup_1` · v5 下移 1px 候选归档

- `artifactStage=candidate`
- `visualReview=selected_by_Leo`（Leo 2026-09-09 目测通过）
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`

## 几何与来源

- 冻结身体：`assets/characters/hero/battle45/atk_rightup_1.png`，SHA-256 `dbe19b78988688563633d3530c41b874be3ca48746cb1a14a4bce06793c3a431`。
- 角色自身右手为画面右下前伸拳，拳心控制点 `(164,181)`。
- v5 以 v4 候选为源，只向下精确平移 `(0,+1)`；柄心 `(157.5737,182.5878)`→`(157.5737,183.5878)`。
- 剑轴保持屏幕 `-90°` 垂直向上；图层为 `body_front`。
- 零生成、零身体修改、零 runtime 写入。

## 证据

- 剑层：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame09-atk-rightup-1-sword-character-right-hand-v5-down1/normalized/hero_sword_vertical_atk_rightup_1_v5_down1.png`
- 2× 对照：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame09-atk-rightup-1-sword-character-right-hand-v5-down1/contact/hero_atk_rightup_1_sword_vertical_v5_down1_2x.png`
- 握点放大：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame09-atk-rightup-1-sword-character-right-hand-v5-down1/contact/atk_rightup_1_correct_hand_zoom_v5_down1.png`
- 标定、QA、manifest、job、refs 均在同一 revision 目录。

`allMachineChecksPass=true`；候选已过 Leo 视觉门，等待 PM 第二道规格门。
