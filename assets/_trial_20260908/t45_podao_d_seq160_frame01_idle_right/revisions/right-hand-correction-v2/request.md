# T45 seq160 · frame01 idle_right D 校准手位修正版 v2

上一版把刀接在画面右侧拳，手位错误。根据既有 Q1-T45 映射，本组右向/我方反面姿势中，人物自身右手投影为画面左侧拳；本版只更换握持点与对应 ROI。

- 甲 grip=`(119,181)`，乙 grip=`(110,171)`。
- 两帧仍使用右上 `angleDeg=-55°`、`front` 层序和 Pillow 长宽单刃占位刀。
- 三联图仅作叠层诊断：FULL FRONT / D OCCLUSION / BACK LAYER。
- credits=0，未调用 ImageGen/mxai，未修改 runtime；停 Leo 目验与 PM 数据门。
