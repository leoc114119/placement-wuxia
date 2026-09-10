# T45 seq=328 · V2 三锁 idle_right 样张交接

## 范围

只生成 `idle_right` 单帧样张；未生成 walk/atk/jump 其余 9 帧。

## 机械结果

- raw：Codex native ImageGen，RGBA 1086×1448；生成额度记录在 `credits.json`。
- normalized：240×320 RGBA、脚底 y=300、四边零 alpha、alpha>32 单连通、质心 x=119.742、机械门全过。
- 处理：仅 alpha bbox 等比归一到样张视觉高 256、底线 y=300；这不是正式批次系数。

## 目视停点

对照图 `contact/idle_sample_vs_baseline.png` 已将基准与样张同画布同基线并排。样张人物整体视觉高度明显小于基准，故样张尚未通过 Leo/PM2 门；不启动其余 9 帧生成。

产物：`assets/_trial_20260910/t45_v2_right_batch_seq328/`
QA：`qa/idle_sample.json`
状态：candidate-only；runtime 未改。
