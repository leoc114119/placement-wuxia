# T45 主角武器首帧 · 明确右上位置修正版 v6 交接

## 当前状态

- `artifactStage=candidate`
- `visualReview=unreviewed`
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`
- 本版尚未发送研发线 delivery，等待 Leo 视觉确认。

## 本次修正

Leo 指出上一版虽然轴角为右上，但画面位置仍读成偏左上，要求明确向画面右上方。v6 以 v5 透明剑层为唯一图层源，保持角色身体、剑形和 `-40°` 剑轴不变，只将整层向画面右侧平移 `10px`；v5 已有的上移 `20px` 保留，因此相对 v4 的净位置向量为 `(+10,-20)`（右上）。

- 身体源：`assets/characters/hero/battle45/battle_idle_right.png`
- 身体 SHA：`713095264eead7e19fc6a0bded89af98b3b29fba68d5ad945a29820f0f5ec498`
- 武器源：v5 `normalized/hero_sword_held_rightup_v5.png`
- 目标武器层：`normalized/hero_sword_held_rightup_v6.png`
- 目标握点记录：`(110,185)`；剑轴 `-40°`（握点指向剑尖，右上）
- 处理：Pillow 整数平移 `(10,0)`，零生成、零旋转、零运行时写入。

## 机械核验

`qa/pilot_v6.json`：`allMachineChecksPass=true`。

- 240×320 RGBA、真实 alpha、单主体连通
- 轴向长度 `115.4977px`，处于 110~140px 带内
- 拳区武器像素 `116→0`
- native/2x 对照尺寸通过
- `generationCredits=0`、`runtimeUntouched=true`

## 活动路径

- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/build_pilot_v6.py`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/request.md`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/refs.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/raw/hero_sword_held_transparent_source_attempt1.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/normalized/hero_sword_held_rightup_v6.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/calibration/frame01_idle_right_v6.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/occlusion_masks/hero_idle_right_character_right_fist.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/composites_native/hero_idle_right_sword_triptych_v6.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/composites_2x/hero_idle_right_sword_triptych_v6_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/contact/hero_idle_right_sword_pilot_v6.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/contact/hero_idle_right_sword_pilot_v6_2x.png`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/qa/pilot_v6.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/manifest.json`
- `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/right-up-placement-v6/job.json`
