# T45 seq=354 · 拳方向锁死 v3 结果

日期：2026-09-11

状态：机械验证通过；candidate-only，待 Leo 审美目验与 PM2 规格门确认；正式资产与 runtime 未改。

## 执行事实

- 按 v3 派单复用 v2 已确认的 `atk_right_1` 作为链首与第三参照，只生成两张新图：`atk_right_2`、`atk_right_3`。
- 两次均为 Codex 原生 image edit，provider=`codex-native`，cost=0；未使用第三次尝试。
- 每步参照职责：Image 1=上一链产物，Image 2=PM2 提供的 `fist_A_right_out`，Image 3=`atk_right_1` 绝对终点锚。
- 链为 `idle_right → atk_right_1 → atk_right_2 → atk_right_3`；`atk_right_2` 输入为锚帧，`atk_right_3` 输入为 `atk_right_2`。

## C1~C5 机械结果

测量画布为原始 1086×1448；躯干中线固定为锚帧拳心 x 减去派单冻结值 +398，得到 `x=576.1538`。肤色连通分量定位双拳，取画面右侧拳为本单动作拳。

| 判据 | 实测 | 结论 |
|---|---|---|
| C1 方向 | 距中线 `+398.00 / +419.11 / +419.89px`；极差 `21.89px ≤ 60px` | PASS |
| C2 高度 | 拳心 y `752.20 / 728.81 / 728.46`；极差 `23.73px ≤ 60px`；均 `≤820` | PASS |
| C3 伸展 | 三帧距中线均 `≥350px` | PASS |
| C4 拳数 | `2 / 2 / 2` | PASS |
| C5 链真实性 | `atk_2` 输入 SHA=`atk_1` 输出 SHA；`atk_3` 输入 SHA=`atk_2` 输出 SHA | PASS |

QA 汇总：`overallPass=true`。

## 画面逐帧描述

- `atk_right_1`：画面右拳向画面右水平打出，拳心处于肩高，手臂伸直；画面左拳收在腰侧。
- `atk_right_2`：仍由同一画面右拳向右水平打出，拳心保持肩高带，手臂伸直；左拳保持收腰，没有换手或朝内。
- `atk_right_3`：再次由同一画面右拳向右水平打出，位置与高度继续落在 `atk_1` 锚定范围内；没有出现 v2 的腰腹下沉或内收，左拳仍收腰。

接触表 `contact/fist_v3_3up.png` 已人工查看，包含 `idle` 基准、`atk_1` 锚、`atk_2`、`atk_3` 四格；三张动作帧的右拳方向、肩高和伸展程度一致。

## 产物与 SHA

产物包：`assets/_trial_20260911/t45_chain_fist_v3/`

- 锚帧 `anchor/atk_right_1.png`：`a5dd353d5e0f277f664329b24e1a98437bf6547d592a21aeb4534d40f5be25e0`。
- 新帧 `raw/atk_right_2.png`：`5d6842e5b95c9838802db7187ddf3a588f190bc9ed67bdb9c6f19fc364886e50`。
- 新帧 `raw/atk_right_3.png`：`8fc7ee560a62a1dc4d6b29007f93b3063385392e3ea6baeb0c460f83046790b1`。
- PM2 姿势图 `pose_diagrams/fist_A_right_out.png`：`1815620ae898a73b94941fecd5e9b77f3fe39e1f184c22ad7598b7ef5994d41f`。
- QA：`qa/fist_direction.json`；接触表：`contact/fist_v3_3up.png`。
- `credits.json`：`generationCount=2`、`cost=0`、`runtimeTouched=false`。

formal/runtime 状态：未写入；本包仍为 candidate-only。若 v3 后续仍被判定为方向/高度不合格，按派单停在本单，不追加模型或批量生成。

## 批次收尾健康门

收尾复跑 `python3 scripts/codex_thread_health.py --thread 01a08a45-f703-7190-a484-442a2d0af631`：rollout 148.1 MB、26 轮、inProgress 计数 1、压缩 3 次；未达到 SKILL §12 轮换阈值。
