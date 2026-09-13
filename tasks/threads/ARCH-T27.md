# ARCH-T27 · 山贼六向身体帧接线技术验收

| 日期 | 方向 | 结论 |
|---|---|---|
| 2026-09-08 | 主架构 → 研发线 | ✅ seq=209/210/211 技术验收 accepted；分别核实 `4bc19b8135b6b92c439f9a43150875a23ccb7c26`、`717b28d44b103b3bf53f97aa50f0ee077797b628`、`8b6d050a22049d43acd563d6fd2b301c6a731bef`，三次 fetch 门禁均通过。 |

## 验收摘要

- `typecheck` / `build` / `lint` 通过；`test:battle` 389 passed、14 skipped；`test:behavior` 14/14。
- 六向预检 62/62 通过；多分辨率六向截图 120 张、enemy anchor 通过；`git diff --check` 通过。
- T27 profile 工厂、hero 复用边界、预检失败降级、legacy 键隔离、cut 隔离与 dead 优先级均按包核对通过。
- R1 修复施法期不再静帧；R2 将 enemy charge/strike 与 hero cast 统一为 `280ms`，已并入同一复核。

## 边界声明

本回执是代码/技术验收，不替代素材第二道 PM 规格门或 Leo L 环。敌方素材 manifest 当前仍标记 `specGate=pending_pm_scan`、`integrationGate=not_handed_off`；不得据此宣称素材正式入库或运行时最终放行。
