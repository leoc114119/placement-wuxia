# T45 seq264 frame15 gripPoint 修复回执

- 缺陷定位：整合脚本按 `frame15` 匹配，未命中实际行名 `frame15-cast-right-2`，导致右/左行 `gripPointPx=null`。
- 来源核值：`frame15-cast-right-2-sword-character-right-hand-v4-flip-direction/calibration/frame15_cast_right_2_angle_minus45_v4.json`，右 `gripPointPx=(210,198)`。
- 镜像规则：`x_left=239-x_right`，左 `gripPointPx=(29,198)`。
- 修复清单：`manifest_22_rows_v2_locked_template.json`、`manifest_48_rows_seq257_v3.json`、frame15 revision manifest/calibration/QA 已同步。
- 独立复核：两份 manifest 的右行均 `[210,198]`，左行均 `[29,198]`。
- 状态：candidate-only，runtime 未改。
