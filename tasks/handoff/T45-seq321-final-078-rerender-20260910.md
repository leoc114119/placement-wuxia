# T45 seq=321 · 0.780 右向 10 帧最终候选

## 执行口径

- walk/jump 统一冻结系数 `0.780`；atk 维持 `1.1944444444`。
- `jump_right_3` 按 seq=319 包围盒居中 `x=3`；其余 9 帧默认质心居中。
- 0 生成、runtime 未改、Phase B 未启动。

## 五项终门自证

- 冻结值一致：10/10。
- 无裁切断言：10/10，输出 alpha>32 bbox 与预期尺寸 ±1 内。
- 几何：240×320 RGBA、四边 alpha=0、脚底 y=300、动作帧质心 ±20。
- 单连通：10/10。
- 帧间 SHA 互异：10/10；其余 9 帧与 seq=317 SHA 未变。

`jump_right_3` 实测：输出宽 233、高236、四边 alpha=0、质心 `114.767`，包围盒居中回落合规。

候选包：`assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq321_final/`
QA：`qa/r1_right_seq321_final.json`
对照：`contact/right_r1_seq321_final.png`
