# T45 hero weapon frame01 · fist-center lock correction v7

Leo 指出剑柄必须落在拳心；保持角色、既有 `-40°` 剑轴和 v6 位置。

本 v7 只做确定性平移：
- 身体冻结：`assets/characters/hero/battle45/battle_idle_right.png` 字节不变；紧拳遮罩高度为 `26px`（y=193..218）。
- 继承 v6 握点 `(110,185)` 与 `-40°` 向右上轴线，整层向画面右侧平移 `11px`；剑柄接触像素由 `(91,206)` 精确落到拳心 `(102,206)`。
- 复用 v6 透明剑层，不重新生图、不旋转；角色身体与剑角度保持不变。
- 用户参考图仅用于方向/握点语义核对：`refs/user_fist_center_sword_reference.png`；不描摹其像素。
- `layerOrder=front`；拳部遮挡只取原身体 alpha 的紧右拳 ROI，不绘制替代手。
- 仍为 `candidate-only`，正式 runtime 未写入，等待 Leo 视觉门与 PM 规格门。
