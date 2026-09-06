# T45 · 山贼乙右向空手待机锚（双参考身高候选）交规格门

## 门状态

| 门 | 状态 | 依据 |
|---|---|---|
| Leo 目验 | PASS | Leo 在 2026-09-06 对双参考候选确认“没问题，合格了” |
| 文件门 | PASS | 240×320 RGBA；视觉高 256；脚底 y=300；质心 x=120；宽高比 0.516 |
| 身份/空手核对 | PASS（美术线自检） | 保留 b 的脸、红巾、棕衣和握拳；未画朴刀、刀柄、地面或投影 |
| 研发线规格门 | pending | 请求 rd 复核；在 PASS 前不写入 `assets/characters/enemy/shanzei_b/battle45/` |

## 交付物

- 待门检 PNG：`assets/_trial_20260906/t45_batch2a_bright_v8_two_ref_hero_height_codex_native/normalized/shanzei_b_right.png`
- 主角同基线对照：`assets/_trial_20260906/t45_batch2a_bright_v8_two_ref_hero_height_codex_native/contact/hero_b_right_height_compare.png`
- QA：`assets/_trial_20260906/t45_batch2a_bright_v8_two_ref_hero_height_codex_native/qa/shanzei_b_right.json`
- 作业状态：`assets/_trial_20260906/t45_batch2a_bright_v8_two_ref_hero_height_codex_native/job.json`

## 生成与处理边界

ImageGen 使用两张图：Leo 提供的 b 图仅锁定 b 的身份和画风；`hero/battle45/battle_idle_right.png` 仅锁定总高与身体比例。生成后只做连通于画布边缘的中性棋盘底扣除，以及等比归一；未做语义重绘或横向压缩。此锚获 rd PASS 后，计划以 `battle_idle_right.png` 名称进入山贼乙 `battle45/` 正式目录，命名与主角右向待机锚一致。
