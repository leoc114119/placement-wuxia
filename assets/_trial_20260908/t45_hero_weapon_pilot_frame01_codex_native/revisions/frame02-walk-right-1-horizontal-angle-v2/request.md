# T45 hero weapon frame02 walk_right_1 · horizontal-angle correction v2

Leo confirmed the handle and fist-center placement, then requested the sword angle be laid flat for this frame.

- Body frozen: `assets/characters/hero/battle45/walk_right_1.png`.
- Source sword frozen: v1 normalized layer `assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-v1/normalized/hero_sword_held_rightup_walk_right_1_v1.png`.
- Keep handle center/pivot at (83.5737,206.5878), already aligned to walk_right_1 fist center (84,207).
- Rotate only the complete sword around that fixed pivot: source screen angle -40° → target horizontal 0°; no translation.
- Target grip is the geometric rotated position (98.4897,206.5878); this changes because the blade is laid flat while the handle center remains fixed.
- Use nearest-neighbor deterministic rotation; no new generation, credits=0, no body edits, runtime untouched.
- candidate-only; Leo visual review pending. PM second gate remains deferred until all action frames are determined.
