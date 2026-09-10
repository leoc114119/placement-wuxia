# T45 seq=336 · 链式编辑验证结果

## 执行范围

按 Leo 批准的 6 分上限验证单，只尝试链式 `idle_right → walk_right_1 → walk_right_2 → walk_right_3` 的第 1 步；idle 使用现有 V2 产物，不重生成。

## 链式真实性

- 两次 edit 均先 `view_image` 显示 `/assets/_trial_20260910/t45_chain_edit_test/chain/idle_right.png`，再用对话内唯一图片执行 `num_last_images_to_include=1`。
- 两次均未使用锚帧路径替代，也未添加第二张参考；调用参数和 prompt 原文已写入 `qa/chain_probe.json` 与 `prompts/`。
- 由于第 1 步连续两次文件门失败，不执行 `walk_right_2/3`。

## 文件门结果

- attempt 1：输出 `raw/walk_right_1_chain.png`，alpha extrema=`[255,255]`，checkerboard 已烘进不透明画布，FAIL。
- attempt 2：输出 `raw/walk_right_1_chain_attempt2.png`，alpha extrema=`[255,255]`，仍为不透明 checkerboard，FAIL。
- 生成次数 2，假定成本 4 分，低于 6 分上限；剩余 2 分不再使用。

## 结论

本验证单因链式 edit 的透明文件门连续失败而关闭；刚体探针未运行，不能宣称“链式消除头身比漂移”成立。该路线不进入正式资产、不修改 V2 右向候选、不改 runtime。

对照图 `assets/_trial_20260910/t45_chain_edit_test/contact/chain_vs_parallel.png` 已人工查看：并行三帧可正常对照；两张链式失败原件明显带 checkerboard，故不参与尺寸/头身比判断。
