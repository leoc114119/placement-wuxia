# T45 seq=356 · 拳方向恒定 + 换手交替 v4 结果

日期：2026-09-11

状态：机械验证失败（C3）；按 v4 红线停止，不追加生成、不换模型；candidate-only，正式资产与 runtime 未改。

## 执行事实

- 按 v4 规格生成完整链：`idle_right → atk_right_1 → atk_right_2 → atk_right_3`。
- 共 3 次 Codex 原生 image edit，provider=`codex-native`，cost=0；未超过本批 3 张上限。
- 每步使用 Image 1=上一帧链产物、Image 2=v2 已验证的 `atk_right_1` 前伸拳样板；未使用新姿势示意图。
- prompt 全部使用拳 α/β 与画面位置指称，没有使用解剖左右手命名。

## C1~C5 结果

| 判据 | 实测 | 结论 |
|---|---|---|
| C1 出拳到位 | 三帧均有 1 拳落在前伸区 x≥190、y=150~180；另 1 拳落在腰侧区 x=85~135、y=185~215 | PASS |
| C2 帧间变化 | 上身躯干带相邻像素差 `14.56% / 10.23%`，均 ≥6% | PASS |
| C3 确实换手 | 目视序列为 **α→α→α**，未出现 α→β→α 或 β→α→β | **FAIL** |
| C4 拳数 | `2 / 2 / 2` | PASS |
| C5 链真实性 | `atk_2` 输入 SHA=`atk_1` 输出 SHA；`atk_3` 输入 SHA=`atk_2` 输出 SHA | PASS |

## 画面逐帧描述

- `atk_right_1`：拳 α 在画面右前伸区，肩高、朝画面右；拳 β 收在腰侧。
- `atk_right_2`：仍是拳 α 在画面右前伸区，肩高、朝画面右；拳 β 仍收在腰侧，未完成换手。
- `atk_right_3`：仍是拳 α 在画面右前伸区，肩高、朝画面右；拳 β 仍收在腰侧，未完成换回。

接触表 `assets/_trial_20260911/t45_chain_fist_v4/contact/fist_v4_4up.png` 已人工查看，含 `idle` 基准和三张动作帧。三张动作帧方向恒定且出拳到位，但前伸拳空间身份没有变化。

## 产物与 SHA

产物包：`assets/_trial_20260911/t45_chain_fist_v4/`

- `raw/atk_right_1.png`：`ae753ecece8adaac56783c0ab0cc8876256788e2553d026781b781b3260f0f29`。
- `raw/atk_right_2.png`：`e5628e1d8c63630561fb3b2643cd79e71dff4ca0da9cd2f2c06e130935a7fbf5`。
- `raw/atk_right_3.png`：`3dd5e70b59a0aa3395a01a113dd7f968aefc0df41a116061425ffc41b6eddf48`。
- QA：`qa/fist_alternation.json`；接触表：`contact/fist_v4_4up.png`。
- `credits.json`：`generationCount=3`、`cost=0`、`runtimeTouched=false`。

## 结论与停点

v4 解决了方向恒定和前伸区位置，但没有实现唯一变量“哪只手”：三帧仍为同一拳 α 前伸。按派单红线，本验证在此关闭；不再追加第 4 张、不切换其他模型。后续若继续，应由 PM2/Leo 另行决定单帧独立生成候选或参数化位移路线。

## 批次收尾健康门

收尾复跑 `python3 scripts/codex_thread_health.py --thread 01a08a45-f703-7190-a484-442a2d0af631`：rollout 154.7 MB、27 轮、inProgress 计数 1、压缩 3 次；未达到 SKILL §12 轮换阈值。
