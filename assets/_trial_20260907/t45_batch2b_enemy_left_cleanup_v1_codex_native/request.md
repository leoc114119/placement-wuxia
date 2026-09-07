# T45 批 2b 山贼左系 `_2` 镜像清理候选 v1

- 范围：甲 `walk/atk × left/leftup/leftdown × _2` 共 6 张；乙仅 `walk_leftdown_2`、`atk_leftup_2` 2 张。
- 来源：`t45_batch2b_enemy_left_mirror_codex_native/normalized/` 已通过镜像机械门的候选帧。
- 处理：确定性去除低透明度浅色边缘晕染；在 4 个已定位的手臂/腰带留白 ROI 内清除不透明近白残块。无重绘、无裁切、无缩放、无运行时改动。
- 门检：8 张均保持 240×320 RGBA、视觉高 256、脚底 y=300、alpha>32 质心在 x=120±20、四边透明、单连通、无新增 alpha；原镜像包保留不变。
- 状态：新候选 revision，等待 Leo 目验与 PM 规格门；不进入 runtime。
