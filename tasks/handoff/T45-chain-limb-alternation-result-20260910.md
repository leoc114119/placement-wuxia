# T45 seq=349 链式肢体交替验证结果

日期：2026-09-10
状态：验证完成，结论失败；正式资产与 runtime 未改。

## 执行事实

- 两条链各 3 步，共 6 次 Codex 原生 edit，cost=0。
- 链 A：`idle_right → walk_right_1_chain → walk_right_2_chain → walk_right_3_chain`。
- 链 B：`idle_right → atk_right_1_chain → atk_right_2_chain → atk_right_3_chain`。
- 每一步输入 SHA 均与上一步输出 SHA 对齐；两条链机械完整性 PASS。
- 透明、背景、比例不参与判定；所有原生 raw 保留，未进入正式资产。

## 链 A：腿交替

归一比较坐标按 1086×1448 raw 映射到 240×320（x×240/1086，y×320/1448）；以橙色鞋底分量定位两脚，画面右侧脚视为面向前脚。

| 帧 | 前脚中心 x | 后脚中心 x | 前后间距 | 前/后关系 |
|---|---:|---:|---:|---|
| walk_right_1_chain | 174.37 | 73.13 | 101.24 | 前脚在画面右侧 |
| walk_right_2_chain | 177.95 | 72.25 | 105.70 | 前脚在画面右侧 |
| walk_right_3_chain | 185.24 | 73.27 | 111.97 | 前脚在画面右侧 |

- A1 前脚极差：`10.87px < 15px`，FAIL（基线 8px）。
- A2 前后脚关系反转：`0` 次，FAIL（基线 0 次）。
- A3 步幅：`101.24/105.70/111.97px`，PASS。
- 画面描述：三帧中画面右侧脚始终是前脚，画面左侧脚始终是后脚；链式没有形成相位换脚。

## 链 B：拳交替

以肤色块定位拳，画面最外侧拳作为前拳，自动量测辅以目视确认。

| 帧 | 前拳中心 x | 前拳中心 y | 前拳身份 | 拳数 |
|---|---:|---:|---|---:|
| atk_right_1_chain | 215.63 | 165.03 | 画面右拳 | 2 |
| atk_right_2_chain | 215.57 | 164.91 | 画面右拳 | 2 |
| atk_right_3_chain | 216.44 | 167.96 | 画面右拳 | 2 |

- B1 前拳位置极差：x=`0.86px`、y=`3.06px`，均 `<15px`，FAIL（基线 y 极差 8px）。
- B2 换手：`0` 次，FAIL（关键判据）。
- B3 恰好两只拳：`2/2/2`，PASS。
- 画面描述：三帧均为画面右拳伸在前，画面左拳收在腰侧；没有发生换手。

## 结论

两条链均未解决目标问题：链 A 未实现腿相位反转，链 B 未实现拳换手。该验证单关闭，不扩展链式动作生产；结果 QA：

- `assets/_trial_20260910/t45_chain_limb_alternation/qa/leg_alternation.json`
- `assets/_trial_20260910/t45_chain_limb_alternation/qa/fist_alternation.json`

对照图：

- `assets/_trial_20260910/t45_chain_limb_alternation/contact/legs_3up_chain.png`
- `assets/_trial_20260910/t45_chain_limb_alternation/contact/legs_3up_parallel.png`
- `assets/_trial_20260910/t45_chain_limb_alternation/contact/fists_4up_chain.png`
- `assets/_trial_20260910/t45_chain_limb_alternation/contact/fists_4up_parallel.png`

## 批次收尾健康门

收尾复跑 `python3 scripts/codex_thread_health.py --thread 01a08a45-f703-7190-a484-442a2d0af631`：rollout 103.8 MB、24 轮、inProgress 计数 1、contextCompaction 2 次；未达到 SKILL §12 轮换阈值。
