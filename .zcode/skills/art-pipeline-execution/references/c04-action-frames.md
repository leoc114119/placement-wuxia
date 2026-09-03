# 类 4 · 动作帧 —— 锚定表法（v2 修订：--aspect + 缩放容差校验 + 切格左格）

> 依据：规范 §2.4（v1.3 K3-1 修复定案）。锚定表法与校验同 c03 v2（先读 c03）。

## 前置检查

```bash
ls assets/_trial_20260903/c03/battle_idle_fist_raw.png 2>/dev/null   # 类3产物（切格左格来源）
ls assets/characters/hero/walk_q/frames/idle_down.png                # 回退左格（带剑风险须登记）
```

## 步骤表

| # | 动作 | 命令/规则 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 选定左格 | 优先=类 3 产物右格程序化切帧（`cut_right.py`：返回图右半区缩放至 240×320 = 无武器空拳战斗 idle 单帧）；类 3 阻塞 → 回退 idle_down 并登记"带剑遗传风险" | 左格单帧 240×320 | PIL 尺寸 |
| 2 | 构造 2 格表 | `make_sheet.py`（同 c03，SRC/OUT 指向本类，唯一允许改动） | sheet.png 640×320 | 尺寸 |
| 3 | 生成试产 prompt | 以类 3 prompt 为底，唯一替换：「战斗待机帧」→「出招攻击帧：右拳向前快速挥出，身体微前倾」 | prompt 落盘 | diff 仅一处 |
| 4 | img2img（**必传 --aspect**） | `python3 scripts/mxai_img2img.py <sheet> <out> --prompt-file <配方> --aspect 2:1`（2 分） | 2:1 缩放图 | 非 2:1 → E-GEN-06 停上报 |
| 5 | 左格保真校验 v2 | `check_left_v2.py`（同 c03，参数指向本类） | PASS | FAIL → 重跑 1 次 → 上报 |
| 6 | 内容缺陷筛查 | 凭空武器/光效（空拳口径违反）→ 机械失败重跑 1 次 → 再犯上报 | — | E-GEN-04 |
| 7 | credits 记账 | 同 c03 | — | — |

```python
# cut_right.py —— 类3产物右格切帧（出招表左格；规范 §2.4）
import sys
from PIL import Image
RET = sys.argv[1] if len(sys.argv) > 1 else "assets/_trial_20260903/c03/battle_idle_fist_raw.png"
OUT = sys.argv[2] if len(sys.argv) > 2 else "assets/_trial_20260903/c04/left_cell_idle.png"
ret = Image.open(RET).convert("RGBA")
right = ret.crop((ret.width // 2, 0, ret.width, ret.height)).resize((240, 320), Image.LANCZOS)
right.save(OUT); print("OK", right.size)
```

## 异常分支（本类特有）

- 出招帧与左格服装/发色/体型漂移 → 审美性不判不重跑，数据进样张交 Leo。
- 非拳类攻击（凭空刀剑光效）→ 机械失败（空拳口径违反）重跑 1 次 → 再犯上报。

## 停点产出

- raw 双格表 + 切格左帧 + prompt + v2 校验数值 + credits。
- 验收：机械门全过即停点；动作观感 = Leo 目验。
