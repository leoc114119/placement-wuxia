# T45 hero weapon frame02 · walk_right_1 v1

本帧按 seq=186 主角武器合成逐帧顺序，在已通过 Leo 目验的 frame01 v9 后继续制作 `walk_right_1`。

- 身体冻结：`assets/characters/hero/battle45/walk_right_1.png`，仅读取既有空手帧。
- 武器源冻结：frame01 v9 透明剑层 `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png`；保留 `-40°` 右上轴线、剑身像素和 `front` 层级。
- `walk_right_1` 角色自身右手投影为画面左侧拳；橙色皮肤核心全像素质心=(83.9535,206.6744)，拳心取整=(84,207)。
- v9 剑层柄中心从 (101.5737,205.5878) 平移 `(-18,+1)` 后为 (83.5737,206.5878)，距目标拳心 0.593px；握点从 (113,196)→(95,197)。
- 只做确定性整数平移，不重绘、不旋转、不重新生图、不修改身体；generation credits=0。
- 拳部遮挡只取该帧原身体 alpha 的紧角色右拳 ROI，不绘制替代手。
- candidate-only，正式 runtime 未写入，等待 Leo 视觉门；PM 第二道规格门按当前安排在动作帧全部确定后统一进行。
