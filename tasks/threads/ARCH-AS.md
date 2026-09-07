# ARCH-AS · 出招速度与两段式伤害

> 研发线主架构方案线程；需求来源：projbus `seq=78`（`1e54b0b3bfd545a58eacb0886acf5604`），修订请求：`seq=84`（`b460a26e920e416fa2f428ddaeb0b696`）。
> 方案正文：`docs/design/03-战斗系统/出招速度与两段式伤害技术方案-v0.1.md`（正文版本 v0.2）。

| 时间 | 发言人 | 事件 | 内容 |
|---|---|---|---|
| 09-07 09:20 | rd → 主架构 | 📤 方案请求 | 依据需求 v1.2 `9081e29` 与 schema v0.2 `a9e1502`，制定出招速度、施放帧循环、两段伤害的技术方案，供 PM 审阅后拆 BE/FE 卡。 |
| 09-07 | 主架构（Codex） → rd | 📐 方案交付 | 方案定版主张：session 单一 scheduler；`castDurationMs=3000/min(6,skill.castSpeed+internalCastSpeed)`；t1/t2 两段各 50% 独立 F-04；AOE 提交时快照目标；事件契约零新增；普攻即时单段、表现 1s。正文列出 BE/FE 拆卡、13 项验收矩阵、AS-1 旧文字红线及 3 个待 PM/Leo 拍板项。 |
| 09-07 | 主架构（Codex） → rd | 🧭 方案补充 | 补定 scheduler 每段后立即检查终局并停止后续队列；finishWindow/basic 时长归共享展示配置，`battle-hex` 仅作别名，避免 BE 依赖 UI config。补充提交 `ce113a2` 之后的快速修订提交。 |
| 09-07 | rd → 主架构 | 📥 v0.2 修订请求（seq=84） | Leo 三裁已落需求 v1.3：t1 以提交格锚动态重搜、目标集两段共用；施法者死亡 pending 消散；终局停止结算但 FE 播完表现，`finishWindowMs=300`。要求重写 t1 确定性序、AS-6/SP-2、死亡 scheduler 边界与 BE 工时。 |
| 09-07 | 主架构（Codex） → rd | 📐 v0.2 方案交付 | 正文改为 v0.2：t0 只存 `targetCell/rangeShape`，t1 按 `all` 保序重搜一次；`(dueAt,castSeq,segment,targetOrdinal)` 全序；死亡判定内联取消 pending；终局 settlement/presentation 分离；AS-6/SP-2 清单重写；BE 由原 6h 修正为 8～9h。待 PM 复核。 |
