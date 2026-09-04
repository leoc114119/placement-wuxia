#!/usr/bin/env python3
"""T45 批 1 contact sheet：12 帧（11 姿势+battle_idle_down）并列缩略，供 Leo 目验。"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
LIB = os.path.join(ROOT, "assets/characters/hero/battle45")
OUT = os.path.join(ROOT, "assets/_trial_20260904/t45_batch1/contact_sheet_batch1.png")

NAMES = ["battle_idle_down", "walk_down_1", "walk_down_2", "jump_down_1", "jump_down_2",
         "atk_down_1", "atk_down_2", "atk_down_3", "cast_down_1", "cast_down_2",
         "cast_down_3", "die_down"]

TW, TH, COLS = 120, 160, 6
PAD, LABEL = 8, 16
rows = (len(NAMES) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * (TW + PAD) + PAD, rows * (TH + LABEL + PAD) + PAD), (235, 232, 225))
draw = ImageDraw.Draw(sheet)
for i, n in enumerate(NAMES):
    p = os.path.join(LIB, f"{n}.png")
    if not os.path.exists(p):
        print(f"[缺] {p}")
        continue
    im = Image.open(p).convert("RGBA")
    th = im.resize((TW, TH), Image.NEAREST)
    bg = Image.new("RGBA", (TW, TH), "WHITE")
    bg.alpha_composite(th)
    cx = PAD + (i % COLS) * (TW + PAD)
    cy = PAD + (i // COLS) * (TH + LABEL + PAD)
    sheet.paste(bg.convert("RGB"), (cx, cy))
    draw.text((cx + 2, cy + TH + 2), n, fill=(30, 30, 30))
sheet.save(OUT)
print(f"OK {OUT} {sheet.size}")
