# Q4-T45 · R1 右向 `jump_right_3` 触边停点

## 现状

seq=300 已按 seq=294/295/296/297/298 重做右向 10 帧。9 帧机械门通过；`jump_right_3` 采用 seq278 walk+jump 固定系数 `256/312 = 0.8205128205` 后：

- 输出 `240×320 RGBA`，alpha>32 视觉高 `249`、宽 `238`，质心 `x=119.166`；
- alpha>32 主体单连通；清杂前后主体域删除 `0`、主体 RGB 改动 `0`；
- 但右边界有 `4673` 个 alpha 总量，主体真实触及画布右边界，`four-border-zero-alpha` FAIL；
- 10 帧 SHA 全部互异，其他 9 帧 R1 门全过。

证据：

- 候选包：`assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq300/`
- QA：`assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq300/qa/r1_right_seq300.json`
- 对照：`assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq300/contact/right_r1_seq300_with_benchmark.png`

## 停点原因

R1 同时要求：固定源批次缩放、宽度≤238、四边零 alpha、alpha>32 加权质心 x=120±1，并禁止逐帧缩小/裁切/删除主体像素。当前固定系数下，`jump_right_3` 的宽度已为 238，但主体触右边界；左移 1px 可消除触边，却会使质心约降至 `118.166`，越过 x=120±1。不能自行用裁切或清边换绿灯。

请 PM2/Leo 裁定该帧处置；在裁定前不启动右上/右下 R1、不启动 Phase B、不写 runtime。
