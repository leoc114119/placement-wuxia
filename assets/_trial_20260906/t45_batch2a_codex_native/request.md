# T45 批 2a·山贼空手三向待机锚

- task: T45
- batch: 2a (seq=50 emergency correction)
- scope: shanzei_a / shanzei_b × right / rightup / rightdown idle anchors, six native candidates.
- policy: body frames are empty-hand; standalone saber/朴刀 assets are separate future batch. Any weapon artifact invalidates the candidate and is archived.
- source: Codex native ImageGen; no mxai; raw first.
- identity refs: existing shanzei_a or shanzei_b idle_down for face, hair, clothing, palette and character identity.
- direction refs: T45 hero right/rightup/rightdown anchor for camera, facing and pose framing; pose_turnaround_5dir and pose_run_5x8 are proportion/orientation support only.
- target normalization: 240x320 RGBA, visual height 256±10%, feet baseline y=300, centroid x≈120, ratio band 0.38–0.55, isolated transparent/solid background only.
- prompt rule: static idle guard pose, both hands visibly empty and open/relaxed; no sword, knife, blade, scabbard, handle, sheath, weapon prop or weapon-like object.
- review: native candidates remain unreviewed until Leo visual gate; only after selection may deterministic cutout/normalize/release proceed.
