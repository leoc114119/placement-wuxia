# T45 seq167 frame01 `idle_right` · v7 紧拳遮挡候选交接

- **返工范围裁定**：Leo 纠正 v6 遮罩过大；只需完整拳头盖住刀柄，不覆盖大块手臂。v6 已标记 `rejected_by_user`，保留作范围过大的对照证据。
- **当前版本**：`assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right/revisions/full-fist-occlusion-v7/`。
- **冻结项**：甲乙 `battle_idle_right` 身体帧与 v5 占位朴刀逐文件字节冻结；v7 只改 A/B 完整拳头的紧轮廓遮罩与 D 诊断合成；Pillow 零生成、credits=0、正式 runtime 未改。
- **遮罩轮廓**：甲紧拳 polygon 覆盖约 `(106–131,170–192)`；乙紧拳 polygon 覆盖约 `(100–127,158–186)`。实际 mask 为 polygon 与原身体 alpha 的交集，袖口/上臂不在遮罩范围内。
- **程序化硬门（甲乙 2/2）**：剪影×遮罩覆盖率 `100%`；D 剪影内武器残留 `0`；D 剪影内刀柄残留 `0`；D 剪影区与原身体 RGBA 差 `0`。数值见 `qa/occlusion_coverage.json`，对照图见 `qa/silhouette_mask_coverage.png`。
- **状态**：`artifactStage=candidate`、`visualReview=pending_Leo`、`specGate=pending_pm_scan`、`integrationGate=not_handed_off`、`runtimeRelease=false`。等待 Leo 单帧重新目验与 PM 第二道规格门；通过前不启动下一帧、不写 runtime。

## 活动路径

以 v7 `manifest.json` 的 `artifactPaths` 为准，共 25 个文件：标定、native/2x 三联图、A/B pair、紧拳剪影与遮罩、剪影×遮罩覆盖率 JSON/PNG、零生成 QA、身体副本、引用和可复跑 Pillow 脚本。runtime 落库状态为 `candidate-only`。

## 研发消费边界

研发仅消费 v7 标定 JSON 的握持点、角度、layerOrder 和紧拳遮挡引用，以及占位刀层作 D 校准输入。三联图与 coverage sheet 仅为诊断证据，不是运行时素材或审美定稿；Leo 与 PM 两道门通过前不得接线。

**交付 commit**：随本交接 delivery 消息回显；本包不包含正式 runtime 文件。
