# T45 seq167 frame01 `idle_right` · v6 全手/前臂遮挡返工候选交接

- **返工原因**：v5 经 Leo seq=167 打回。缺陷是 A/B 手部区域仍有柄/武器穿帮，原拳心核心遮罩没有覆盖完整手/前臂剪影；v5 已在包内标记 `rejected_by_user`，不再作为活动候选。
- **范围**：仅山贼甲/乙 `battle_idle_right`；继续停在 frame01，不启动 `walk_rightdown_1`。
- **活动版本**：`revisions/full-hand-occlusion-v6/`；v5 身体帧和占位朴刀逐文件字节冻结，v6 只重标遮挡 mask、D 合成和门检证据。
- **遮挡实现**：显式手/前臂多边形裁剪原身体 alpha，生成二值 255 `hand_silhouette`；D 合成从武器 alpha 中减去完整剪影，覆盖柄穿手/前臂全段。多边形和 mask 均为校准数据，不改变身体帧。
- **程序化硬门（甲乙各 1 张）**：剪影像素覆盖率 `1.0`；剪影内 D 武器残留 `0`；剪影内 D 刀柄残留 `0`；D 剪影区与原身体 RGBA 差异 `0`。详见 `qa/occlusion_coverage.json` 与 `qa/silhouette_mask_coverage.png`。
- **身体冻结证据**：甲 runtime body SHA=`f65fae17b33b05b8c47dd9157e0251169da352b66c1441c0c0354cc860955afb`；乙 runtime body SHA=`7c9eb5773454e0a2cfceeac7eab7337179b5f2179881cb099471b63586b1fd90`；v6 raw body 副本逐字节一致。占位刀层沿用 v5 SHA，未重绘。
- **产法/成本**：Pillow 确定性 mask/composite；`credits=0`；无 ImageGen、无外部生图。
- **状态**：`artifactStage=candidate`、`visualReview=pending_Leo`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。本包仅供 Leo 重新目验和 PM 第二道规格门。
- **新增证据**：`hand_silhouettes/*`（身体 alpha 剪影）、`qa/occlusion_coverage.json`（剪影×遮罩对照数值）、`qa/silhouette_mask_coverage.png`（可视化对照）、`build_v6_occlusion_repair.py`（零生成可复跑配方）。

## 活动交付路径

以 v6 `manifest.json` 的 `artifactPaths` 为准，共 25 个文件，包含标定、native/2x D 三联图、A/B pair、剪影/遮罩、覆盖率 QA、零生成 QA、身体副本、引用与脚本。正式 runtime 目录未改。

## 研发消费边界

研发只消费 v6 的 `calibration/frame01_idle_right.json` 中握持点/角度/层级与新的完整手/前臂遮挡引用，以及 `weapon_layers/*placeholder_blade.png` 作 D 校准输入。三联图和 coverage sheet 是诊断证据，不是运行时素材或审美定稿；通过 Leo 视觉门与 PM 规格门前不得接线、不得写 runtime。

**交付 commit**：随本交接 delivery 消息回显；runtime 落库状态为 `candidate-only`（正式路径无新增/无改写）。
