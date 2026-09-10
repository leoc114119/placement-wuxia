# T45 seq=349 · 链式肢体交替验证

- 性质：一次性验证，不产正式资产、不动 runtime、不铺量。
- 链 A：`idle_right → walk_right_1_chain → walk_right_2_chain → walk_right_3_chain`。
- 链 B：`idle_right → atk_right_1_chain → atk_right_2_chain → atk_right_3_chain`。
- 每步 edit 的输入必须是上一步产物；透明/背景/比例不判。
- 判定目标：腿 A1/A2/A3 与拳 B1/B2/B3，具体阈值见 `tasks/handoff/T45-chain-limb-alternation-verification-20260910.md`。
