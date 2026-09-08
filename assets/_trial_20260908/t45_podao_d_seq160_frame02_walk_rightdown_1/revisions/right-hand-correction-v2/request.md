# T45 seq160 · frame02 walk_rightdown_1 corrected-hand D calibration candidate

frame01 v11 已获 Leo 目验通过并由研发线 PM2 规格门 PASS+放行 frame02。按逐帧闭环，现只处理甲/乙 `walk_rightdown_1` 两张身体帧：身体字节冻结，朴刀为 Pillow 零生成占位件，握点改接角色自身右手的画面左侧拳 `(70,208)` / `(84,202)`，统一右上轴 `angleDeg=-55°`、`layerOrder=front`。刀类长度按角色帧规范 v1.7：柄 34px、刃 95px、总轴向长度 129px。

D 遮挡采用每张身体帧紧拳轮廓内的二值 body-alpha mask，仅覆盖完整拳头，不带袖口/躯干；程序化核验拳头区残留刀像素为 0。候选状态 `candidate-only`，等待 Leo 视觉目验及 PM 第二道规格门；正式 runtime 不改。
