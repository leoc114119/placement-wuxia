# T45 hero weapon frame01 · right-hand + red-arrow angle correction v3

Leo 复核 v2 后明确红箭头表示剑尖方向；v2 的 60° 向右下方向应改为向右上。

本 v3 只做确定性修正：
- 身体冻结：`assets/characters/hero/battle45/battle_idle_right.png` 字节不变。
- 手位改为角色自身右手；在该右向姿态中对应画面左侧拳，握点 `(100,208)`。
- 复用既有透明剑层，不重新生图；将轴角从源层 `46.3774°` 旋至用户红箭头对应的 `-40°`，剑尖朝右上。
- 用户参考图仅用于方向/握点语义核对：`refs/user_fist_center_sword_reference.png`；不描摹其像素。
- `layerOrder=front`；拳部遮挡只取原身体 alpha 的紧右拳 ROI，不绘制替代手。
- 仍为 `candidate-only`，正式 runtime 未写入，等待 Leo 视觉门与 PM 规格门。
