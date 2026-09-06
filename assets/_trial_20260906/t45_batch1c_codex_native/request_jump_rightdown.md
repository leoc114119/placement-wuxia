# T45 1c 右下向·跳跃双帧试产

- task: T45
- batch: 1c-pilot
- direction: rightdown
- scope: 跳跃两帧（起跳蹲伏 / 空中前冲）；不产第三帧；沿用《角色帧规范》v1.3 与 1c 逐动作小批节奏。
- source: Codex 原生 ImageGen；禁止 mxai；原生输出先入 raw/。
- action mother: `assets/characters/hero/battle45/jump_right_1.png`, `jump_right_2.png`
- identity/orientation anchors: `assets/characters/hero/battle45/battle_idle_rightdown.png`, `walk_rightdown_1.png`
- target canvas after deterministic normalization: 240x320 RGBA, visual height 256, baseline y=300, centroid x≈120.
- weapon: omitted from body frame; weapon is render-layer concern.
- stopping rule: Leo visual review before PM spec gate; max two native attempts per frame.
