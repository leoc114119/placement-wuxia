# T45 seq=342 · 旧批重归一右向 10 帧试点

- 性质：纯确定性加工，不重新生成；runtime 禁止改动。
- 范围：`walk_right_1..3`、`atk_right_1..4`、`jump_right_1..3`。
- 来源：seq=278/279 直接 raw；见 `raw_sources/` 与 QA 逐帧 SHA。
- 锚：`assets/_trial_20260905/t45_batch0_codex_native/raw/idle_right_attempt1.png`。
- 公式：每个源表组只用一个系数：`(anchor crown width / group source-table mean crown width) * (256 / anchor source bbox height)`；组内不逐帧改系数。
- 刚体判据：`G>85 且 R<G−30 且 B>60 且 B<G+40`，最上方 4 邻接连通块宽度。
- 规格：240×320 RGBA、脚底 y=300、alpha>32 加权质心 x=120、四边透明、等比不裁切。
- 输出刚体硬门：按输出实际绿色刚体像素量，组内极差 ≤1px；v2 互校为 ±15% 参考门。
- 状态：candidate-only；PM2/Leo 门前停点，未铺后续。
