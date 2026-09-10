# T45 · V2 四样本门检结果（post seq=330）

## 范围

按 seq=330 的修正口径，只检四帧样本：`idle_right`、`walk_right_1`、`atk_right_1`、`jump_right_1`。归一使用 alpha>32 人物 bbox，四帧共用一个系数；未生成剩余 6 帧，未改 runtime。

## 机械结果

- 系数：`0.22241529105125976`，来源为 `idle_right` 原始 alpha>32 bbox 高 `1151`，目标站立高 `256`。
- `idle_right`：源 bbox 高 `1151`，输出高 `256`，PASS。
- `walk_right_1`：源 bbox 高 `1105`，输出高 `246`，按 walk 自然高度记录，PASS。
- `jump_right_1`：源 bbox 高 `951`，输出高 `212`，按 jump 自然高度记录，PASS。
- `atk_right_1` 两次原生候选均未达站立帧门：
  - attempt 1 源 bbox 高 `1113` → 输出高 `248`，FAIL；SHA `ac9b9236675394b85053e4df8fed7ea5089908e242bd9a51b53073e3e1984`。
  - attempt 2 源 bbox 高 `1108` → 输出高 `246`，FAIL；SHA `05a22bd95eb93f43687f202fd6d776733785b7542fe33c68caaa02c67174e65f`。
- 四帧当前包：`qa/four_frame_sample.json` 的 `allHardGatesPass=false`，失败帧仅 `atk_right_1`。

## 目视结果

对照图 `assets/_trial_20260910/t45_v2_right_batch_seq328/contact/four_frame_sample_vs_baseline.png` 已将基准与四样本置于同画布同基线。批内四帧的头身比例与画风一致；walk/atk/jump 的动作差异可辨，atk 两候选都没有明显额外肢体或背景。当前硬门失败来自 atk 的整体 bbox 高，不以目视“看起来接近”替代数值门。

## 停点与待裁

`atk_right_1` 已达到普通原生两次尝试上限；不再第三次盲生，不用逐帧缩放或拉伸伪造同一系数，不生成剩余 6 帧，不进入 runtime。请 PM2/Leo 裁定以下路线之一：

1. 调整/重定义 V2 样张门的站立帧高口径，并明确是否仍要求同一系数；或
2. 批次作废并重新拍四样本；或
3. 授权其他明确的单帧处理路线（需写死允许的变更与验收标准）。

候选包仍为 `candidate-only`，正式 runtime 路径未改。
