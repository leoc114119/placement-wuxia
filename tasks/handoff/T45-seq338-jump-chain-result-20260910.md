# T45 seq=338 · 轻功链式比例验证结果

## 执行

按新口径执行 3 次原生 edit：`idle_right → jump_right_1（起跳蹲）→ jump_right_2（腾空）→ jump_right_3（落地）`。每步先显示上一步产物，再以对话中唯一上一产物继续 edit；背景/透明只记录，不作为停止门。

## 链真实性

三步输入均为上一步产物，且每步 `num_last_images_to_include=1`：

- step 1 input `chain/idle_right.png`，SHA `5f417df27ecfdd4ae5c73280068296d61a703fb13f24ad9bdc60b472f5a29e7f`；
- step 2 input `chain/jump_right_1.png`，SHA `3306e5270a9c08dfeaad76e3b829cebed479bb87b740ad34922531934992c9b4`；
- step 3 input `chain/jump_right_2.png`，SHA `a20e3e020125a06b5cf7741d2f64d6d0ed94df7ad68a52478e5606bedbff969e`。

## 探针结果

使用颜色/暗度掩膜取人物 bbox；发冠取上部白色刚体件，脸取肤色最大块；不同画布尺寸按 `240 / source_width` 缩放到同口径。

| 帧 | 人物 bbox 高 | 发冠宽（缩放后） | 脸宽（缩放后） |
|---|---:|---:|---:|
| idle | 256 | 14.00 | 35.00 |
| jump_1 | 1025 | 15.47 | 36.24 |
| jump_2 | 989 | 15.47 | 39.12 |
| jump_3 | 833 | 15.91 | 36.46 |

- 发冠极差：`12.57%`，超过 `5%`；
- 脸宽极差：`11.21%`，超过 `5%`；
- 结论：**FAIL，链式编辑未证明能消除复杂轻功动作的比例漂移**。

## 画面描述

链式三帧均保持右向和同一角色身份：`jump_1` 为低身起跳蹲姿，`jump_2` 为双脚离地的收腿腾空，`jump_3` 为低身落地恢复并向右；未见文字、sheet 或多主体。并行版三帧已纳入 `contact/chain_jump_vs_parallel.png` 对照；黑底/透明状态只作记录，不参与本次结论。

## 状态

原生生成 3 张，`cost=0`（订阅内）；未使用 fallback。验证包为隔离试产，未改正式资产、未改 runtime、未铺量；本验证单按 >5% 结果关闭链式路线。
