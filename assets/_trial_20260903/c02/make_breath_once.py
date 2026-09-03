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
