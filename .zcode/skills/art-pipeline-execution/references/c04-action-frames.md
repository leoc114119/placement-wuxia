# 类 4 · 动作帧 —— 锚定表法试产 1 张（空拳出招）

> 依据：规范 §2.4 + b 案口径。锚定表法与校验脚本同 c03（先读 c03）。

## 前置检查

```bash
ls assets/_trial_<日期>/c03/battle_idle_fist_raw.png   # 左格优先用类3产物
ls assets/characters/hero/walk_q/frames/idle_down.png  # c03 阻塞时的回退左格
```

## 步骤表

| # | 动作 | 命令/规则 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 选定左格 | 类 3 产物存在 → 用之（先 `check_left.py` 同款 diff 过门）；类 3 阻塞 → 回退用 `idle_down.png` 并在报告注明「回退左格」 | 左格文件确定 | 禁用其他任何帧 |
| 2 | 构造 2 格表 | 复用 `c03/make_sheet.py`，仅将 `SRC`/`OUT` 两行指向本类路径（这是**唯一允许的改动**） | `c04/sheet.png` | 尺寸 640×320 |
| 3 | 生成试产 prompt | 以 `c03/prompts/battle_idle_fist.txt` 为底复制到 `c04/prompts/atk_fist.txt`，**只做一处机械替换**：「战斗待机帧」→「出招攻击帧：右拳向前快速挥出，身体微前倾」 | prompt 落盘 | diff 确认仅差此一处 |
| 4 | img2img | `python3 scripts/mxai_img2img.py <左格sheet> assets/_trial_<日期>/c04/atk_fist_raw.png --prompt-file assets/_trial_<日期>/c04/prompts/atk_fist.txt`（2 分） | 返回 PNG | E-GEN 分支 |
| 5 | 左格锁死校验 | `check_left.py` 同款（路径指向本类） | `DIFF=0` | E-ANCHOR-01 分支 |
| 6 | credits 记账 | 同 c01 | — | — |

## 异常分支（本类特有）

- 出招帧与左格**服装/发色/体型漂移** → 审美性，不判不重跑，数据进样张交 Leo。
- 「出招攻击帧」表述生成出**非拳类攻击（凭空出现刀剑光效等）** → 机械性失败（空拳口径被违反），同命令重跑 1 次 → 再犯上报附图。

## 停点产出

- `c04/atk_fist_raw.png` + prompt + 校验记录 + credits。
- 验收：DIFF=0、无凭空武器；动作力度/观感 = Leo 目验。
