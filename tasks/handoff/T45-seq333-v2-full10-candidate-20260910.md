# T45 seq=333 · V2 完整右向 10 帧候选交接

## 裁定依据

PM2 seq=333 / `tasks/handoff/T45-seq332-v2-four-frame-gate-RULING-20260910.md`：idle 保留 256±1；walk / atk / jump 按自然高度登记；全 10 帧共用系数 `0.22241529105125976`。

## 机械结果

- `idle_right`：146×256，脚底 y=300，质心 x=120.356。
- `walk_right_1/2/3`：149×246、147×255、144×248。
- `atk_right_1/2/3`：181×246、185×238、150×234。
- `jump_right_1/2/3`：153×212、180×225、148×229。
- 10/10：240×320 RGBA、四边零 alpha、alpha>32 四邻接单连通、无裁切断言、宽≤238、质心动作门 ±20；idle 质心门 ±1。
- SHA 互异；`qa/full_10_frame.json` `allHardGatesPass=true`；runtime 未修改。

## 原生输出异常留痕

- `walk_right_3`、`atk_right_2`、`atk_right_3` 初次原生输出把棋盘格画进了不透明画布；各保留原件并以第二次原生候选替换，第二次真实 alpha 门通过。
- `jump_right_3_native_wrong_copied_atk.png` 是一次错误复制的隔离留痕，不作为 jump 源；正确 `jump_right_3_native.png` 已重新生成并选用。
- 本批未使用外部引擎或回退通道。

## 目视结果

已人工查看 `contact/full_10frame_vs_baseline.png`：基准与 idle 同尺度；walk 三帧、atk 三帧、jump 三帧各自相位可辨，批内没有显著跳尺度、额外肢体或背景残留。动作帧按自然姿势高度呈现，不做逐帧顶高。

## 状态与请求

候选包 `candidate-only`，未写 runtime。请 PM2 执行整组规格终门并回执；终门前不接线、不生成其他方向。
