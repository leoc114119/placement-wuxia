# T45 hero weapon first-frame pilot

- Scope: 主角 `battle_idle_right.png` 首帧；只验证独立手持剑层 + 逐帧锚点/原拳局部遮挡数据。
- Body remains the frozen empty-hand runtime frame; no body edits and no runtime integration.
- Weapon source: one native ImageGen sword generation plus one targeted transparency edit. The first checkerboard RGB output is retained as rejected evidence; the second output has real RGBA alpha.
- Target geometry: sword length 110–140 px; grip 25–35 px; blade 85–105 px; grip at the hero screen-right fist; axis points down-right; right-facing frame uses `layerOrder=front`.
- Stop point: candidate only, wait for Leo visual review and PM specification gate.
