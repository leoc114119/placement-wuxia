# ARCH-AS · 出招速度与两段式伤害

> 研发线主架构方案线程；需求来源：projbus `seq=78`（`1e54b0b3bfd545a58eacb0886acf5604`），修订请求：`seq=84`（`b460a26e920e416fa2f428ddaeb0b696`）。
> 方案正文：`docs/design/03-战斗系统/出招速度与两段式伤害技术方案-v0.1.md`（正文版本 v0.2）。

| 时间 | 发言人 | 事件 | 内容 |
|---|---|---|---|
| 09-07 09:20 | rd → 主架构 | 📤 方案请求 | 依据需求 v1.2 `9081e29` 与 schema v0.2 `a9e1502`，制定出招速度、施放帧循环、两段伤害的技术方案，供 PM 审阅后拆 BE/FE 卡。 |
| 09-07 | 主架构（Codex） → rd | 📐 方案交付 | 方案定版主张：session 单一 scheduler；`castDurationMs=3000/min(6,skill.castSpeed+internalCastSpeed)`；t1/t2 两段各 50% 独立 F-04；AOE 提交时快照目标；事件契约零新增；普攻即时单段、表现 1s。正文列出 BE/FE 拆卡、13 项验收矩阵、AS-1 旧文字红线及 3 个待 PM/Leo 拍板项。 |
| 09-07 | 主架构（Codex） → rd | 🧭 方案补充 | 补定 scheduler 每段后立即检查终局并停止后续队列；finishWindow/basic 时长归共享展示配置，`battle-hex` 仅作别名，避免 BE 依赖 UI config。补充提交 `ce113a2` 之后的快速修订提交。 |
| 09-07 | rd → 主架构 | 📥 v0.2 修订请求（seq=84） | Leo 三裁已落需求 v1.3：t1 以施法者提交时所在格（R1）锚动态重搜、目标集两段共用；施法者死亡 pending 消散；终局停止结算但 FE 播完表现，`finishWindowMs=300`。要求重写 t1 确定性序、AS-6/SP-2、死亡 scheduler 边界与 BE 工时。 |
| 09-07 | 主架构（Codex） → rd | 📐 v0.2 方案交付 | 正文改为 v0.2：t0 只存 `anchorCell/rangeShape`，其中锚=施法者提交时所在格（R1）；t1 按 `all` 保序重搜一次；`(dueAt,castSeq,segment,targetOrdinal)` 全序；死亡判定内联取消 pending；终局 settlement/presentation 分离；AS-6/SP-2 清单重写；BE 由原 6h 修正为 8～9h。 |
| 09-07 | rd → 主架构 | 📥 勘误请求（seq=91） | PM 终裁 R1：`提交格` 存在二读，统一勘误为“施法者提交时所在格”；点击格只作受理/演出朝向，三入口共用自身格锚。 |
| 09-07 | rd → 主架构 | 📥 BE 技术验收请求（seq=92） | 请求复核 `task/attack-speed-be`：`fcd7067` + `670bce9` + `d571eb7`；PM 预裁包含 R1、清单外采样改写追认、`FINISH_WINDOW_MS` 落 `config/battle.ts`，并要求重点核对 B4 施法门时钟死锁修复。 |
| 09-07 | 主架构（Codex） → rd | ✅ TASK-AS-BE 技术验收 PASS | 独立副本复验远端 tip `d571eb7`（含 `fcd7067`）：typecheck 通过、lint 通过、build 通过；`test:battle` 294 passed + 14 skipped（308），`test:behavior` 14/14；`shot.mjs` 16/16 PASS；`behavior_e2e.mjs` 11/11 MATCH、0 不符、exit 0；bundle `DBG[` 残留 0。代码复核确认 R1 自身格锚、t1 动态重搜/目标集缓存、B4 施法门与时钟推进、死亡消散、终局 presentation 分离均符合 v1.3/方案 v0.2；已同步修正文案并推送主架构修订。 |
