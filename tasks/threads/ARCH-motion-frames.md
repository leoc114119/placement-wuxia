# ARCH · Hero jump/run 多帧接入方案

| 时间 | 方向 | 事件 | 结论 |
|---|---|---|---|
| 2026-09-11 | rd → 主架构 | projbus seq=367 | 请求 jump 1→5 的 leftdown 单向接入方案；seq=365 同时要求 run 替换战斗 walk。 |
| 2026-09-11 | 主架构 → rd | 方案完成 | Jump 采纳 A：ma.duration 动态均分、一次播放尾帧保持、JUMP 时长不变；混合帧数采用 per-facing clip count。Run 采用 W1：30 张 run 覆盖 walk、clipCounts.walk=5、walkFrameMs 保持 140ms。详见设计方案。 |
