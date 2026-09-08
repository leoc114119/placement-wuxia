# T45 hero weapon frame01 · right-hand + angle correction v2

Leo 指出上一版首帧的两个问题：剑接在画面右侧拳（角色左手），且剑轴角度过平。

本版只做确定性修正：
- 身体冻结：`assets/characters/hero/battle45/battle_idle_right.png` 字节不变。
- 手位改为角色自身右手；在该右向姿态中对应画面左侧拳，握点 `(100,208)`。
- 复用 v1 已生成的透明剑层，不重新生图；将轴角从 `46.3774°` 旋至规范的 `60°`，剑尖朝右下。
- `layerOrder=front`；拳部遮挡只取原身体 alpha 的紧右拳 ROI，不绘制替代手。
- 仍为 `candidate-only`，正式 runtime 未写入，等待 Leo 视觉门与 PM 规格门。
