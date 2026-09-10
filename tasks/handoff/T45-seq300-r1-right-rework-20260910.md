# T45 seq=300 · R1 右向 10 帧重做候选交接

## 范围与基线

- 依据：`tasks/handoff/T45-hero-weapon-recalib-20260910.md` §7；rd→art seq=294/295/296/297/298。
- 只处理右向 `walk3 + atk4 + jump3`，直接使用 seq278/279 已确认 raw；无 sheet 重切、无生图、无 runtime 改动。
- seq278 的 walk+jump 共用固定系数 `0.8205128205`；seq279 的 atk 共用固定系数 `1.1962616822`。
- 预检刚性测法使用保留帧组（idle 三向 + cast 右系九帧，共 12 帧）：暗色头部轮廓探针读数均为 87px，波动 0%，作为有效性前置证据；正式系数由逐组手工头部两点标注表与 standing source span 固定，不按输出 bbox 逐帧适配。

## 产物

- 候选包：`assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq300/`
- QA：`qa/r1_right_seq300.json`
- 取格/来源/职责：`refs.json`、每帧 `sourceMapping`；10 帧 SHA 全部互异。
- 刚性标注表：`calibration/rigid_feature_annotations.json`
- contact：`contact/right_r1_seq300_with_benchmark.png`（含 `battle_idle_right` 基准，已完成一次人眼目视）。
- 生成额度：0；`runtimeTouched=false`；状态 `candidate-only`。

## 门检结果

### 9/10 通过

walk 3 帧、atk 4 帧、jump 1/2：240×320 RGBA、脚底 y=300、alpha>32 质心 x=120±1、四边零 alpha、alpha>32+4 邻接单连通、宽≤238；站立/动作帧相对基准刚性特征偏差在 ±5% 内。

确定性清杂逐元素删除次级连通域；10 帧主体域删除像素均为 0、主体 RGB 改动均为 0。`atk_right_2` 的 140 个次级像素为右侧相邻表残留，未触碰主体域。

### 1/10 停报

`jump_right_3` 在固定 seq278 系数下输出视觉宽 238，但右边界 alpha 总量 4673，违反“四边零 alpha”。它不是游离块：清杂主体域删除 0；不能通过裁切、逐帧缩小或清边修复。左移 1px 虽可消除触边，但会使质心约为 x=118.166，违反 x=120±1。

## 人眼目视记录

已打开含基准的 contact：基准 idle 与 walk/atk 的直立人物总体大小一致；jump_right_1/2 因蹲缩/腾空姿势自然更矮，但头部与躯干尺度连续；atk 四帧没有上一轮的大小跳；jump_right_3 的宽姿势连续，但视觉上已经贴近右画布边界，机械触边结果与目视一致。因此本批不报绿、不启动后续 20 帧。

## 停点

问题登记：`tasks/questions/Q4-T45-r1-right-jump3-border.md`。PM2/Leo 裁定前：右上/右下 R1、Phase B 锚/遮罩、Phase C 左系镜像、runtime 均冻结。
