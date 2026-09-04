#!/usr/bin/env python3
"""呼吸帧生成（规范 §2.2）：上半身 y<52% 整体上移 3px。零 AI。脚本逻辑同 skill c02，仅改源/输出路径。"""
from PIL import Image, ImageChops

SRC = "assets/characters/hero/battle45/battle_idle_down.png"
OUT = "assets/characters/hero/battle45/battle_idle_down_breath.png"
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

# 校验：与底帧存在像素差异
bbox = ImageChops.difference(out, img).getbbox()
n = 0
for a, b in zip(list(out.getdata()), list(img.getdata())):
    if a != b:
        n += 1
print(f"DIFF bbox={bbox} diff_pixels={n}")
assert out.size == img.size and n > 0, "E-GATE-01: 呼吸帧与底帧无差异"
