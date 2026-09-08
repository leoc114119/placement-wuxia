# T45 seq160 · frame01 idle_right D 校准闭环

只处理 `甲/乙 battle_idle_right` 这一帧位（共 2 张）：标定 → D 合成 → PM 数据核 → Leo 目验。

- 身体层只读引用正式 runtime PNG，复制到 `raw/` 作 SHA 证据；不修改 runtime。
- 武器层为 Pillow 长宽单刃朴刀占位几何，轴线从角色右手拳点向右上，`angleDeg=-55°`；仅验证握持点、层序与原拳 ROI 遮挡。
- 右向属于 `front` 层序；三联图为 FULL FRONT / D OCCLUSION / BACK LAYER。
- 本包不生成下一帧，不铺量，不调用 ImageGen/mxai（credits=0）。
- 当前停点：PM 第二道数据核与 Leo 第一视觉门；双过后才进入 `walk_rightdown_1`。
