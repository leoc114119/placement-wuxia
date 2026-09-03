# 类 7 · 场景底图 —— 压缩入库实证（0 生图，P-4 实证）

> 依据：规范 §2.7（≤300KB 预算口径未定，本类产出两种候选样张供 Leo 比选，**不替 Leo 定口径**）。

## 前置检查

```bash
ls -la assets/ui/pixel/battle/raw/battle_env_pure.png   # 母版 1088×1920 在库，记录原始体积
```

## 步骤表

| # | 动作 | 内容 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 落脚本 | 下方脚本原文存 `c07/compress_candidates.py`（逐字照抄） | 文件存在 | — |
| 2 | 执行 | `python3 assets/_trial_<日期>/c07/compress_candidates.py` | 输出两行体积记录 | — |
| 3 | 记录 | 报告登记：原始体积 / 候选A（降采样 png）体积与尺寸 / 候选B（webp q80）体积与尺寸 | — | — |

```python
#!/usr/bin/env python3
"""≤300KB 压缩双候选（P-4 实证）：A=png 降采样宽720；B=webp q80 原尺寸。原文件不动。"""
from PIL import Image
import os

SRC = "assets/ui/pixel/battle/raw/battle_env_pure.png"
D = "assets/_trial_20260903/c07"
img = Image.open(SRC).convert("RGB")
w, h = img.size

a = img.resize((720, round(h * 720 / w)), Image.LANCZOS)
a.save(f"{D}/env_pure_down720.png", optimize=True)

img.save(f"{D}/env_pure_q80.webp", "WEBP", quality=80)

for f in ("env_pure_down720.png", "env_pure_q80.webp"):
    p = f"{D}/{f}"
    print(f, os.path.getsize(p), Image.open(p).size)
```

## 异常分支（本类特有）

- PIL 无 WEBP 支持（保存抛异常）→ 只出候选 A 并记录 webp 失败原因，上报 E-ENV-03 变体。
- 两候选均 >300KB → **如实记录**（这本身就是 P-4 需要的实证：口径可能要调），禁继续压到失真，停点交 Leo。

## 停点产出

- `c07/env_pure_down720.png` + `c07/env_pure_q80.webp` + 体积/尺寸记录。
- 验收：两个候选都交 Leo 目验画质（哪个能接受=P-4 裁决素材）。
