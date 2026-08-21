---
description: 领取任务并开工：扫描 inbox 取任务卡，按任务箱协议施工
---

请按 AGENTS.md 任务箱协议开工：
1. 读 `tasks/LOG.md` 最新事件
2. 扫 `tasks/inbox/`，取优先级最高的任务卡（P0 优先）
3. 领单：任务卡移 `tasks/working/`、头部状态改"进行中"、`threads/Txx.md` 追加领单行、`LOG.md` 插行、`index.json` col 改 doing
4. 严格按任务卡需求表施工，边界三档遵守；**项目规矩：appid 一律 touristappid；小游戏 API 勿假设浏览器全局（wx.*/canvas.*）；已验收代码小步改**
5. 歧义必问：写 `tasks/questions/Qn-Txx.md` 停下等待
6. 完成后：任务卡移 `tasks/done/` + `Txx-done.md` 回执（DoD 勾选+架构决策+文件清单），threads/LOG/index 同步（col 改 review）
开始执行。
