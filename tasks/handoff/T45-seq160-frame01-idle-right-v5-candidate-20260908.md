# T45 seq160 frame01 `idle_right` · v5 逐帧标定候选交接

- **范围**：山贼甲/乙 `battle_idle_right`，当前逐帧序列第 1 帧；仅本帧，不启动 `walk_rightdown_1`。
- **活动版本**：`handle-shorter-fist-core-v5`；v2/v3/v4 保留在同一 trial 包作 superseded 证据，活动数据为 v5。
- **产法**：Pillow 确定性占位朴刀与原身体帧拳心 ROI；`credits=0`、无 ImageGen、正式 runtime 未改。
- **标定主体**：甲握点 `(125,175)`、乙握点 `(116,165)`；刀轴 `angleDeg=-55°`（拳点向画面右上）；`layerOrder=front`；拳心/指节核心 `occlusionRef` mask 与逐帧 PNG SHA 已写入 `calibration/frame01_idle_right.json` 和 manifest。
- **机械门**：甲乙 `2/2 allHardGatesPass`；240×320 RGBA、视觉高 256、脚底 exclusive y=300、边界透明、握点/角度/层级/遮挡引用、native+2x 均已核对。
- **Leo 目验结论（2026-09-08）**：刀长与刀位基本可用，v5 作为接线输入保留；手部盖柄最终效果归研发 in-engine 合成与验证，美术停止继续修改遮挡图。
- **状态**：`artifactStage=candidate`、`visualReview=selected_by_Leo`（仅刀长/刀位范围）、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。
- **研发消费**：使用 v5 `calibration/frame01_idle_right.json` 的逐帧字段与两张 `weapon_layers/*placeholder_blade.png`；D 三联图仅校准诊断，不作为运行时素材或审美定稿依据。

## 交付文件

活动 v5 目录下的 `manifest.json` `job.json` `calibration/frame01_idle_right.json`、两张占位武器层、两张 `occlusion_masks/*`、两张 native/2x 三联对照、两张 contact、两份 QA、两份 raw 身体副本、`refs.json`、`request.md`，以及本交接文件。

**交付基线 commit**：`83b6180716875aa118d3a98f847a90266674aef7`；总线 delivery `seq=163` 已携带该 commit SHA 与上述活动路径的逐文件清单。候选不进入正式 runtime。
