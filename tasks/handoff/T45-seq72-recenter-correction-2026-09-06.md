# T45 seq=72 甲·右整改单补交

- 原门检消息：projbus `seq=72`，PM 报告 bbox left=59、全像素 `alpha>32` 质心 x=105.8，要求水平平移约 14 px。
- 实际命中文件：`assets/_trial_20260906/t45_batch2a_codex_native/normalized/shanzei_a_right.png`。
- 处理：确定性水平平移 `+14px`，无重绘、无缩放、无透明处理；原文件备份为 `qa/shanzei_a_right_before_seq72.png`。
- 复验：240×320 RGBA；bbox `[73,44,195,300]`；视觉高 256；脚底 y=300；全像素 `alpha>32` 质心 x=119.8211；alpha 极值 `[0,255]`；四边透明；输出 SHA-256 `8dd4107d5028c02f8d476fae9d1125a2f4870e27449823e7d208d07352c31cc6`。
- 路径校正：该旧 job 的 `job.json` 已标记 `supersededBy`；统一正式候选入口仍是 `assets/_trial_20260906/t45_batch2a_anchor_selection_v2_singleframe/manifest.json`，其中逐张闭合握拳候选保持原样。请 PM 以统一 manifest 重跑六张规格门，不要把旧批次作为正式 runtime 来源。
- 当前状态：旧批次修正已完成；正式 runtime 仍未写入。
