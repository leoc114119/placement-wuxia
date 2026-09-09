# T45 主角武器 frame07 `walk_rightup_1` · v3 左上 2px 候选归档

## 状态

- `artifactStage=candidate`
- `visualReview=selected_by_Leo`（Leo 2026-09-09 目测通过）
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`

Leo 已确认本帧的竖直剑轴与左上微调；本交接只归档候选和证据，不声明已过 PM 规格门或已写入 runtime。

## 选定结果

- 角色身体：`assets/characters/hero/battle45/walk_rightup_1.png`，SHA-256 `a8a0f1fe6a0d46f6c2b41b766985a9c634e02a126d79e2c67186c430a16fa7c1`
- 角色自身右手：画面右侧拳，控制拳心 `(181,189)`。
- 最终剑轴：屏幕 `-90°`，竖直向上。
- v3 相对 v2 的整层精确平移：`(-2,-2)`；柄心 `(180.5737,188.5878)` → `(178.5737,186.5878)`。
- 图层：`body_front`；身体未修改，完整身体置于剑层前方。
- 生成积分：`0`；正式 runtime 未修改。

## 证据

- 最终剑层：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame07-walk-rightup-1-sword-character-right-hand-v3-leftup2/normalized/hero_sword_vertical_walk_rightup_1_v3_leftup2.png`
- 2× 对照：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame07-walk-rightup-1-sword-character-right-hand-v3-leftup2/contact/hero_walk_rightup_1_sword_vertical_v3_leftup2_2x.png`
- 放大握点：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame07-walk-rightup-1-sword-character-right-hand-v3-leftup2/contact/walk_rightup_1_vertical_grip_zoom_v3_leftup2.png`
- 标定：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame07-walk-rightup-1-sword-character-right-hand-v3-leftup2/calibration/frame07_walk_rightup_1_vertical_grip_v3_leftup2.json`
- QA：`assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame07-walk-rightup-1-sword-character-right-hand-v3-leftup2/qa/pilot_walk_rightup_1_vertical_grip_v3_leftup2.json`

`allMachineChecksPass=true`，覆盖画布、真实 alpha、身体边界透明、剑层真实 alpha、垂直轴保持、精确 `(-2,-2)` 位移、完整身体前置、零生成和 runtime 未触碰。
