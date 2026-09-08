# T45 seq160 · frame02 walk_rightdown_1 corrected-hand D calibration candidate

frame01 v11 已获 Leo 目验通过并由研发线 PM2 规格门 PASS+放行 frame02。按逐帧闭环，现只处理甲/乙 `walk_rightdown_1` 两张身体帧：身体字节冻结，朴刀为 Pillow 零生成占位件，握点改接角色自身右手的画面左侧拳 `(70,208)` / `(84,202)`，刀轴按前臂逐帧正交：甲 `angleDeg=18°`、乙 `angleDeg=-41°`、`layerOrder=front`。刀类长度按角色帧规范 v1.7：柄 34px、刃 95px、总轴向长度 129px。

D 遮挡采用每张身体帧紧拳轮廓内的二值 body-alpha mask，仅覆盖完整拳头，不带袖口/躯干；程序化核验拳头区残留刀像素为 0。候选状态 `candidate-only`，等待 Leo 视觉目验及 PM 第二道规格门；正式 runtime 不改。

Leo 追加约束：刀轴与持刀前臂应成 90°。本 v4 依据各自可见的 elbow→grip 前臂中心线逐帧取正交刀轴（甲 18°、乙 -41°），并在 `qa/knife_position_check.json` 同时核验夹角与刀柄/拳头重叠后遮挡。
