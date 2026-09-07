# T45 seq113 · 敌型左系 idle/_1 确定性镜像

- 范围：甲乙各 9 张：`battle_idle_left/leftup/leftdown`、`walk_left/leftup/leftdown_1`、`atk_left/leftup/leftdown_1`。
- 源：`assets/characters/enemy/{shanzei_a,shanzei_b}/battle45/` 当前右系 runtime 帧。
- 处理：Pillow 水平镜像；release preflight 做浅色边缘晕染清除与 alpha>32 质心 x=120 归一；无 ImageGen、无语义重绘；`die_common` 不镜像。
- PM 精扫完成前，runtime manifest 的新增帧标记为 `specGate=pending_pm_scan`。
