# T45 hero weapon frame01 · handle-center half-length correction v9

Leo 要求保持当前剑角度，把剑向右上拉半个剑柄的位置，让拳头中心正对剑柄中心。

本 v9 只做确定性平移：
- 身体冻结：`assets/characters/hero/battle45/battle_idle_right.png` 字节不变；紧拳皮肤核心全像素质心为 `(101.6136,205.9091)`，拳心取整为 `(102,206)`。
- 继承 v8 握点 `(102,206)` 与 `-40°` 向右上轴线；实测柄轴向跨度 `29.832px`，取半柄 `14.916px`，沿轴取最近整数平移 `(+11,-10)px`。
- 平移后柄中心目标约 `(101.57,205.59)`，与拳心距离 `0.59px`；刀柄中心像素落在拳心。
- 复用 v8 透明剑层，不重新生图、不旋转；角色身体、剑身与角度保持不变。
- 用户参考图仅用于方向/握点语义核对：`refs/user_fist_center_sword_reference.png`；不描摹其像素。
- `layerOrder=front`；拳部遮挡只取原身体 alpha 的紧右拳 ROI，不绘制替代手。
- 仍为 `candidate-only`，正式 runtime 未写入，等待 Leo 视觉门与 PM 规格门。
