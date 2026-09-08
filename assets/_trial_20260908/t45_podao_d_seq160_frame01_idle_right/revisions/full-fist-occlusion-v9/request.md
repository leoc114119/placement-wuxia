# T45 seq167 · frame01 idle_right B precise orange-fist occlusion v9

Leo 复核指出 v8 的 B 桥接遮挡完全不对：不能把棕色躯干/袖口当成拳头区域。v9 冻结 A、两张身体帧和两张占位朴刀，只从 B 原始身体帧中按真实橙色皮肤像素筛选，并取握刀拳头种子 `(110,175)` 的 4-连通分量；不使用多边形，不加 handle bridge，不改身体与武器。

本包为 candidate-only，Pillow 确定性加工、生成积分 0、正式 runtime 不改；等待 Leo 目验与 PM 第二道规格门。
