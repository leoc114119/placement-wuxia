# T45 1c 右下向·施法三帧试产

- task: T45
- batch: 1c-pilot
- direction: rightdown
- scope: 施法三帧（举起聚气 / 角色自身左下甩 / 角色自身右下甩）；空手供渲染层后组武器。
- source: Codex 原生 ImageGen；禁止 mxai；原生输出先入 raw/。
- action mothers: `assets/characters/hero/battle45/cast_right_1.png`, `cast_right_2.png`, `cast_right_3.png`
- identity/orientation anchors: `assets/characters/hero/battle45/battle_idle_rightdown.png`, `walk_rightdown_1.png`
- target canvas after deterministic normalization: 240x320 RGBA, visual height 256, baseline y=300, centroid x≈120.
- background handling: frame 1 native alpha; frame 2/3 checkerboard removed by deterministic edge flood with enclosure protection; no subject redraw after background removal.
- stopping rule: Leo visual review before PM spec gate; max two native attempts per frame.
