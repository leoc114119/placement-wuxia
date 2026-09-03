# 类 2 · 呼吸帧 —— 程序化产 1 帧（零 AI 零成本）

> 依据：规范 §2.2（上半身 y<52% 整体上移 3px）。脚本全文给死，逐字使用。

## 前置检查

```bash
ls assets/characters/hero/walk_q/frames/idle_down.png   # 底帧，240×320（E-ENV-04）
```

## 步骤表

| # | 动作 | 内容 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 落脚本 | 将下方脚本原文存 `assets/_trial_<日期>/c02/make_breath_once.py`（逐字照抄，禁改参数） | 文件存在 | — |
| 2 | 执行 | `python3 assets/_trial_<日期>/c02/make_breath_once.py` | 输出 `OK <尺寸>` | — |
| 3 | 校验 | PIL 复核产物尺寸 = 底帧尺寸；两帧存在像素差异（diff≠0 的像素数 >0，程序化统计并记录） | 通过 | 失败 → E-GATE-01 |

```python
#!/usr/bin/env python3
"""呼吸帧生成（规范 §2.2）：上半身 y<52% 整体上移 3px。零 AI。"""
import sys
from PIL import Image

SRC = "assets/characters/hero/walk_q/frames/idle_down.png"
OUT = "assets/_trial_20260903/c02/idle_down_breath_trial.png"
SHIFT = 3          # 上移 px，禁改（1px 渲染缩放后不可见，实锤口径）
SPLIT = 0.52       # 腰线比例，禁改

img = Image.open(SRC).convert("RGBA")
w, h = img.size
cut = round(h * SPLIT)
out = img.copy()
upper = img.crop((0, 0, w, cut))
out.paste(upper, (0, -SHIFT))
out.save(OUT)
print(f"OK {out.size}")
```

## 异常分支（本类特有）

- 底帧尺寸≠240×320 → 上报实测尺寸（E-ENV-04 变体，禁继续）。
- diff 像素数 = 0（两帧全同，说明 paste 未生效）→ 检查脚本是否逐字照抄 → 仍为 0 → E-GATE-01 上报。

## 停点产出

- `c02/idle_down_breath_trial.png` + 脚本 + diff 统计值。
- 验收标准：程序化三项全过即为**机械合格**；抖不抖、自不自然归渲染表现，试产阶段不判。
