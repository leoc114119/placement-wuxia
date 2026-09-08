# T25 交付回执 · trial_fx_01 光影组合试点

> 交付链：frontend-battle 施工（commit `96dcaca`，分支 `task/fx-trial-01` 已 push）→ PM 纯净态复验 PASS → 视觉复验 PASS → 待主架构技术验收 → 待 Leo L 环

## 施工回执（frontend-battle，摘要）

- **无疑义开工**；架构自决 6 点：配方常量落 config/battle-hex.ts（TRIAL_FX_01）/接线走 view.fxWorld 字段不改 drawFrame 签名（保既有用例零改写）/T 读 session 快照队列不重算公式（R10）/预载器注入式 loadImage/fxPlayer 稳定实例+setPack/时窗左闭右开+末段夹取
- 文件：types.ts +30、config/battle-hex.ts +配方、ui/fx-player.ts 新建、battle-hex-render +13、battle_demo/main.ts 接线、preview FILES +fx-player、tests/fx-player.test.ts 19 用例、assets/ui/fx/trial_fx_01/ 40 张 PNG+SHA256SUMS.txt、素材库文档随卡入库、bundle 重建+verTag bump
- 四门（代理自检）：tsc 零错/341+19 全绿/behavior 14/14/三零；e2e 11/11 MATCH；shot 16 PASS

## PM 纯净态复验（2026-09-08 实测）

| 门 | 结果 |
|---|---|
| commit 状态 | 96dcaca 在 task/fx-trial-01 顶，工作区干净 ✓ |
| 素材 | shasum -c 40/40 OK；L1=12/L2=22/L3=6 ✓ |
| typecheck | tsc --noEmit exit=0 ✓ |
| 全量单测 | 341 passed / 0 failed（14 skipped=behavior 门控）✓ |
| behavior | 14/14 绿 ✓ |

## PM 视觉复验（browser 真机 5 连拍）

- L1 聚气（~0.65s 脚下光团）→ L2 主体爆（~1.3s 金色刺爆→~1.95s 金焰峰值）→ 收尾（~2.6s）
- 锚=主角格心全程稳定；与出招 04→05 并行；"闪避+伤害5"弹出=两段式结算与演出解耦实证
- 备注观感项：L3 月牙（78%~100% 时窗）连拍中不够显眼（疑似被爆焰余亮覆盖）——留 Leo L 环定夺
- 复验入口：`http://127.0.0.1:8224/index.html`（8224 服务→rd worktree proto/battle_demo，选主角→点特→点红格内敌格）

## 待办

1. 主架构技术验收（projbus 已发请求）
2. Leo L 环（含 L3 月牙观感裁决）
3. 通过后：任务分支并回 main 走 PRE-FLIGHT B + main 守卫
4. 挂账：preview loader 并发竞态（既有，非本卡）、旧 FX 相关候选目录归并
