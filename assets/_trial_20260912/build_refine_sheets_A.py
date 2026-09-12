#!/usr/bin/env python3
"""建 A 方案精修输入图纸：一条方向一张图，3 列 × 2 行网格，图纸 1024×1024。

为什么是 1024×1024 + 3×2：
  mxai gpt-image-2 的 1K 档长边约 1024，总像素按画幅分配——**1:1 拿到的总像素最多**。
  5 帧放进 3×2（第 6 格留空）时，每格 ≈341×512 = 174.6k px，是源帧 240×320（76.8k px）的 **2.27×**；
  这条链才是"净升采样"，与上一轮整图 30 格（每格只有 195×260 = 源的 59%）方向相反。

用法：python3 build_refine_sheets_A.py
输出：assets/_trial_20260912/精灵图_精修输入A/精灵图A_{facing}.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/_trial_20260912/glb2d_idle/idle_6dir_v4"
OUT = ROOT / "assets/_trial_20260912/精灵图_精修输入A"
FACINGS = ("left", "leftdown", "leftup", "right", "rightdown", "rightup")

SHEET = 1024
COLS, ROWS = 3, 2
CELL_W, CELL_H = 341, 512          # 341*3 = 1023 ≈ 1024
BG = (14, 14, 17)
FRAME_W, FRAME_H = 240, 320
PAD = 9                            # 格内左右留白
SEP = (60, 60, 66)


def cell_origin(col: int, row: int) -> tuple[int, int]:
    return col * CELL_W, row * CELL_H


def build(facing: str) -> Path:
    sheet = Image.new("RGB", (SHEET, SHEET), BG)
    draw = ImageDraw.Draw(sheet)
    for c in range(1, COLS):
        draw.line([(c * CELL_W, 0), (c * CELL_W, SHEET)], fill=SEP, width=2)
    for r in range(1, ROWS):
        draw.line([(0, r * CELL_H), (SHEET, r * CELL_H)], fill=SEP, width=2)

    inner_w = CELL_W - PAD * 2                      # 323
    scale = inner_w / FRAME_W                       # 1.3458
    new_size = (inner_w, round(FRAME_H * scale))    # 323 × 431
    for idx in range(5):
        col, row = idx % COLS, idx // COLS
        ox, oy = cell_origin(col, row)
        frame = Image.open(SRC / f"idle_{facing}_{idx + 1}.png").convert("RGBA")
        up = frame.resize(new_size, Image.Resampling.LANCZOS)
        x = ox + PAD
        y = oy + (CELL_H - new_size[1]) // 2
        sheet.paste(up.convert("RGB"), (x, y), up.getchannel("A"))

    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"精灵图A_{facing}.png"
    sheet.save(dst, optimize=True)
    return dst


if __name__ == "__main__":
    for f in FACINGS:
        p = build(f)
        im = Image.open(p)
        print("%-34s %s  每格 %d×%d = 源像素的 %.2f×" % (
            p.relative_to(ROOT), im.size, CELL_W, CELL_H, (CELL_W * CELL_H) / (FRAME_W * FRAME_H)))
