# T45 seq=325 · 旋转不变头轴 walk+atk 首段候选

## 口径修正

seq=323 已判定垂直投影 span 作废。本批改用 crown→jaw 两点的欧氏距离，作为旋转不变轴距；先交头部基本竖直的 walk+atk 7 帧，jump 暂不重渲。

## 结果

- 保留帧 12 张欧氏轴距波动 `2.79%`（≤5%），无随旋转的系统性偏移。
- seq278 walk 系数 `0.7765713943`；seq279 atk 系数 `1.1886622340`。
- walk3 + atk4：7/7 尺寸、无裁切、四边透明、脚底、alpha>32 单连通、动作帧质心、刚性轴距 ±5%、清杂安全、SHA 互异全过。
- 0 生成；runtime 未改；Phase B 仍冻结，candidate-only。

产物：`assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq325_rotinv_walk_atk/`

- QA：`qa/r1_seq325_rotinv.json`
- 证据：`calibration/rotinv_measurement.json`、`calibration/source_rotinv_axis_annotations.png`
- 对照：`contact/right_seq325_rotinv_walk_atk.png`

等待 PM2/Leo 先验收这 7 帧；通过后再按同一旋转不变测法处理 jump 3 帧。
