# T45 hero weapon frame01 · pixel-locked fist-center grip correction v8

Leo 要求认真按像素对齐，把剑放到拳心里。

本 v8 只做确定性平移：
- 身体冻结：`assets/characters/hero/battle45/battle_idle_right.png` 字节不变；紧拳皮肤核心全像素质心为 `(101.6136,205.9091)`，拳心取整为 `(102,206)`。
- 继承 v4 握点 `(100,205)` 与 `-40°` 向右上轴线，整层平移 `(+2,+1)px`，目标握点为 `(102,206)`；剑柄/护手接触点与拳心重合。
- 复用 v4 透明剑层，不重新生图、不旋转；角色身体与剑角度保持不变。
- 用户参考图仅用于方向/握点语义核对：`refs/user_fist_center_sword_reference.png`；不描摹其像素。
- `layerOrder=front`；拳部遮挡只取原身体 alpha 的紧右拳 ROI，不绘制替代手。
- 仍为 `candidate-only`，正式 runtime 未写入，等待 Leo 视觉门与 PM 规格门。
