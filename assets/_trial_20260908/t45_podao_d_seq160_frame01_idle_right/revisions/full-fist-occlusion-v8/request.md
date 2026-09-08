# T45 seq167 · frame01 idle_right B handle-bridge occlusion repair v8

复用 v7 身体帧与占位朴刀，字节级冻结；A 完整拳头紧轮廓保持不变，仅将 B 在拳头与刀身交界处的窄柄桥遮挡上扩，消除 Leo 复核指出的小段露柄。D 合成采用二值 body-alpha silhouette mask，程序化要求剪影覆盖率 100%、剪影内残留武器/刀柄像素为 0、D 剪影区与原身体像素差为 0。

本包为 candidate-only，Pillow 零生成，正式 runtime 不改；等待 Leo 重新目验与 PM 第二道规格门。
