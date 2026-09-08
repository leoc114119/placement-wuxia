# T45 hero weapon frame01 · fist-center upward correction v4

Leo 要求剑的位置向上移，确保剑柄对齐准备位拳头中心。

本 v4 只做确定性平移：
- 身体冻结：`assets/characters/hero/battle45/battle_idle_right.png` 字节不变；冻结拳头像素质心约 `(101.37,204.77)`。
- 继承 v3 角色右手/画面左侧拳握点，保留 `x=100`，将握点 `y=208→205`，整层上移 `3px`。
- 复用 v3 透明剑层，不重新生图、不旋转；剑轴继续 `-40°` 向右上。
- 用户参考图仅用于方向/握点语义核对：`refs/user_fist_center_sword_reference.png`；不描摹其像素。
- `layerOrder=front`；拳部遮挡只取原身体 alpha 的紧右拳 ROI，不绘制替代手。
- 仍为 `candidate-only`，正式 runtime 未写入，等待 Leo 视觉门与 PM 规格门。
