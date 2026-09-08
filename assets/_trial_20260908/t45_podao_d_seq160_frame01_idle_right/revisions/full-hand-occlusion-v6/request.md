# T45 seq167 · frame01 idle_right full-hand occlusion repair v6

复用 v5 身体帧与占位朴刀，字节级冻结；仅重标甲/乙角色右手（画面左侧）完整手/前臂剪影遮挡。D 合成采用二值 body-alpha silhouette mask，程序化要求剪影覆盖率 100%、剪影内残留武器/刀柄像素为 0、D 剪影区与原身体像素差为 0。

本包为 candidate-only，Pillow 零生成，正式 runtime 不改；等待 Leo 重新目验与 PM 第二道规格门。
