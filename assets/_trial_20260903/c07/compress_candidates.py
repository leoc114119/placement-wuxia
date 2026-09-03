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
