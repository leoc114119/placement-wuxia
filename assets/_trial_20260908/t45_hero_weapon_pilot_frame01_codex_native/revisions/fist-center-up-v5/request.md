# T45 hero weapon frame01 · three-quarter-fist upward correction v5

Leo 要求在角度不变、角色不变的前提下，剑再向上提 3/4 拳头高度。

本 v5 只做确定性平移：
- 身体冻结：`assets/characters/hero/battle45/battle_idle_right.png` 字节不变；紧拳遮罩高度为 `26px`（y=193..218）。
- 继承 v4 握点 `(100,205)` 与 `-40°` 向右上轴线；按 `round(0.75×26)=20px` 整层上移，目标握点 `(100,185)`。
- 复用 v4 透明剑层，不重新生图、不旋转；角色身体、手位 x 与剑角度全部保持不变。
- 用户参考图仅用于方向/握点语义核对：`refs/user_fist_center_sword_reference.png`；不描摹其像素。
- `layerOrder=front`；拳部遮挡只取原身体 alpha 的紧右拳 ROI，不绘制替代手。
- 仍为 `candidate-only`，正式 runtime 未写入，等待 Leo 视觉门与 PM 规格门。
