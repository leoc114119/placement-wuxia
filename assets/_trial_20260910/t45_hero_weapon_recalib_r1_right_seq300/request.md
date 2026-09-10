# T45 seq=300 · R1 右向 10 帧重做

依据：`tasks/handoff/T45-hero-weapon-recalib-20260910.md` §7、rd→art seq=294/295/296/297/298。

范围固定为右向 10 帧：`walk_right_1..3`、`atk_right_1..4`、`jump_right_1..3`。只使用 seq278/279 已确认 raw 文件直取，不从动作表重切，不启动右上/右下，不进入 Phase B，不写 runtime。

本批加工：

- seq278 的 walk+jump 共用一个固定缩放系数；seq279 的 atk 共用一个固定缩放系数。
- 背景隔离只做边缘连通的中性底；游离块只按 `alpha>32` + 4 邻接连通域逐元素删除。
- 归一目标：240×320 RGBA、脚底 y=300、alpha>32 加权质心 x=120±1、四边零 alpha、主体单连通、宽度≤238。
- 任何触边帧不通过；不通过时保留候选并停在本段，不通过删除主体像素来制造绿灯。

状态：candidate-only；生成积分：0；runtime：未触碰。
