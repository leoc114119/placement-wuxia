# ARCH · 主角武器层接线方案

| 时间 | 方向 | 事件 | 结论 |
|---|---|---|---|
| 2026-09-09 | rd → 主架构 | projbus seq=242 | 第一批 26 行主角武器层素材 DoR 到达，请输出发卡级接线方案。 |
| 2026-09-09 | 主架构 → rd | 方案完成 | 定版为：正式 runtime 导入 + `spriteKey/bodySrc` 索引的已定位武器覆盖层；不运行时二次旋转，mask 离屏 `destination-out` 预合成。首批四个消费帧缺口显式空手诊断，第二批补齐后才开全状态放行。详见设计方案。 |
| 2026-09-09 | rd → 主架构 | seq=258 修订请求（正式口径） | 有效输入为独立左右剑模、48 行标定 manifest 与遮罩；模型已完成 Leo 选型及 PM 机械门检 PASS。 |
| 2026-09-09 | 主架构 → rd | v2.1 修订方案 | 模型握点 `[23,57]` 运行时旋转并对齐身体拳心；动态扩展离屏 layer 允许越出 240×320；保留 `weapon_front/body_front`；预摆层不作为新 runtime 输入。 |
| 2026-09-09 | 主架构 → rd | ✅ seq=267 T29 技术验收 PASS | `3aa004dd` 已 fetch 核实；三零、battle 415/14 skipped、behavior 14/14、preflight 正常+3 负例、shot_weapon_layer 18 张、shot_sixdir 120 张全过；可进 PRE-FLIGHT B、main 与 Leo 长剑 L 环。 |
