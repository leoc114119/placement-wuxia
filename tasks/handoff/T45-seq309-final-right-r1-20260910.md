# T45 seq=309 · R1 右向 10 帧最终候选

## 依据

rd→art seq=309：`jump_right_3` 改用包围盒居中；其余 9 帧保持原候选字节不变。动作帧质心门按 PM2 §3 的 ±20 口径执行。

## 最终处理

- `jump_right_3`：放置模式 `bbox_center_fallback`，`x=1`；完整宽 `238px`，四边 alpha=0，质心 `x=115.166`，不裁切。
- 其余 9 帧：保持 `centroid_center`，逐文件 SHA 与 seq=304 相同。
- 10 帧无裁切断言：输出 alpha>32 bbox 与预期源裁框×组系数尺寸逐帧一致（±1 内）。
- 生成消耗 0；runtime 未改；Phase B 未启动。

## 产物与验证

- 候选包：`assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq309/`
- QA：`qa/r1_right_seq309_final.json`
- 对照：[contact/right_r1_seq309_final.png]
- `allHardGatesPass=true`；10 帧 SHA 互异；其余 9 帧 SHA 未变。

等待 PM2 终门；终门通过后才放行 Phase B 锚点/遮罩逐帧标定。
