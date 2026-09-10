# T45 seq=352 · 链式肢体交替验证 v2 结果

日期：2026-09-10
状态：机械验证通过；candidate-only，待 Leo 审美目验与 PM2 规格门确认；正式资产与 runtime 未改。

## 执行事实

- 两条链各 3 步，共 6 次 Codex 原生 image edit，provider=`codex-native`，cost=0。
- 每步使用参照 1=上一链产物、参照 2=PM2 提供的姿势示意图；四张示意图随包归档，未使用代理自绘图或 contact sheet 作输入。
- 链 A：`idle_right → walk_right_1_chain → walk_right_2_chain → walk_right_3_chain`。
- 链 B：`idle_right → atk_right_1_chain → atk_right_2_chain → atk_right_3_chain`。
- 两条链 6/6 步输入 SHA 均与上一输出逐级对齐；透明、背景和比例不参与本单判定。
- 交叉链核查发现 `walk_right_1_chain.png` 与 `atk_right_3_chain.png` 字节相同；两者都是右侧动作相位，v2 规格只要求各自链内逐级输入 SHA，不把跨链同姿态列为失败项，已保留该事实供 PM2 目验。

## 链 A：腿交替

以 1086×1448 raw 映射到 240×320；橙色鞋底连通分量定位双脚，按 PM2 示意图判定动作腿。

| 帧 | 动作腿 | 动作脚中心 x | 收回脚中心 x | 与上一动作相位移动 |
|---|---|---:|---:|---:|
| `walk_right_1_chain` | 画面右腿 | 179.37 | 61.94 | — |
| `walk_right_2_chain` | 画面左腿 | 59.25 | 180.87 | 121.02 px |
| `walk_right_3_chain` | 画面右腿 | 172.79 | 62.71 | 114.75 px |

- A1 前脚极差：`120.12px ≥ 15px`，PASS。
- A2 相位反转：`2 次 ≥ 1`，PASS；相位为右→左→右。
- A3 两脚间距：`117.42 / 121.62 / 110.07px`，均在 20~160px，PASS。
- 强制幅度：两次后续换腿移动 `121.02 / 114.75px`，均超过 40px@240。
- 画面描述：第 1 帧画面右腿前伸、左腿收后；第 2 帧切换为画面左腿前伸、右腿收后；第 3 帧切回画面右腿前伸、左腿收后。

## 链 B：拳交替

以肤色连通分量定位双拳，排除脸部区域；按 PM2 示意图判定动作拳。

| 帧 | 动作拳 | 动作拳中心 (x,y) | 与上一动作相位移动 | 拳数 |
|---|---|---:|---:|---:|
| `atk_right_1_chain` | 画面右拳 | (215.28, 166.23) | — | 2 |
| `atk_right_2_chain` | 画面左拳 | (37.05, 165.29) | 178.23 px | 2 |
| `atk_right_3_chain` | 画面右拳 | (181.53, 193.62) | 147.23 px | 2 |

- B1 前拳位置极差：x=`178.23px ≥ 15px`，PASS。
- B2 换手：`2 次 ≥ 1`，PASS；相位为右→左→右。
- B3 拳数：`2/2/2`，PASS。
- 强制幅度：两次后续换手移动 `178.23 / 147.23px`，均超过 40px@240。
- 画面描述：第 1 帧画面右拳前伸、左拳收腰；第 2 帧画面左拳前伸、右拳收腰；第 3 帧切回画面右拳前伸、左拳收腰。

## 交付物与门状态

产物包：`assets/_trial_20260910/t45_chain_limb_alternation_v2/`

- `raw/`：6 张原生候选帧。
- `prompts/`：6 次 prompt 原文，记录上一产物与 PM2 示意图的双参照职责及强制幅度。
- `pose_diagrams/`：PM2 提供的 4 张姿势示意图。
- `qa/leg_alternation.json`、`qa/fist_alternation.json`：SHA、归一测量、阈值判定，均 `overallPass=true`。
- `contact/legs_3up_chain_v2.png`、`contact/fists_4up_chain_v2.png`：链式接触表。
- `contact/legs_3up_parallel_v2.png`、`contact/fists_4up_parallel_v2.png`：并行基线接触表。
- `credits.json`：`provider=codex-native`、`generationCount=6`、`cost=0`。

正式资产/runtime 状态：未写入；本包仍为 candidate-only。需要 Leo 进行第一道审美目验，随后由 PM2 进行规格门检；两道门通过前不接线。

## 批次收尾健康门

复跑 `python3 scripts/codex_thread_health.py --thread 01a08a45-f703-7190-a484-442a2d0af631`：rollout 133.2 MB、25 轮、inProgress 计数 1、压缩 3 次；未达到 SKILL §12 轮换阈值。
