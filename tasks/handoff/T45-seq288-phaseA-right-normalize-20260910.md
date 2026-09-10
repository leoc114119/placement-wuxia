# T45 seq=288 · Phase A 右向新帧归一交付

Phase A has normalized the new right-facing body frames from seq278/279: `walk_right_1..3`, `jump_right_1..3`, `atk_right_1..4` (10 frames). Processing is deterministic only; generation credits=0 and runtime is untouched.

## Gates

All 10 frames pass: `240×320 RGBA`, visual height 256 for walk/atk and within jump width-action band, feet baseline `y=300`, full-resolution alpha>32 weighted centroid `x=120±1`, four-border alpha=0, alpha>32 4-connected single component. Secondary components were removed by exact pixel sets only; no bbox-expanded cleanup.

## Paths

- `assets/_trial_20260910/t45_hero_weapon_recalib_seq288/normalized/right/`
- `assets/_trial_20260910/t45_hero_weapon_recalib_seq288/qa/phase_a_right_normalize.json`
- `assets/_trial_20260910/t45_hero_weapon_recalib_seq288/manifest.json`

PM2 please independently review this Phase A round. Phase B will start one frame at a time only after this round is accepted. Idle/cast/jump weapon-anchor exclusions remain unchanged.
