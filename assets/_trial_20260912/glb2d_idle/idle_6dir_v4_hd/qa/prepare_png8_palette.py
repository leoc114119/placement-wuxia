#!/usr/bin/env python3
"""Reduce refined RGB colors with one shared palette before PNG-8 encoding.

The generated cells contain many anti-aliased RGB colors.  A shared palette
keeps the idle set temporally consistent and leaves the repository's
png8_encode.py on its genuinely lossless path.  Alpha is never quantized or
changed here; it is restored from the already-split source frames.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "qa"
FACINGS = ("left", "leftdown", "leftup", "right", "rightdown", "rightup")
FRAME_SIZE = (240, 320)
PALETTE_COLORS = 248


def paths():
    return [ROOT / f"idle_{facing}_{i}.png" for facing in FACINGS for i in range(1, 6)]


def main():
    files = paths()
    originals = [(path, Image.open(path).convert("RGBA")) for path in files]
    if len(originals) != 30 or any(im.size != FRAME_SIZE for _, im in originals):
        raise SystemExit("expected 30 refined RGBA frames at 240x320")

    # One strip yields one stable palette for all 30 idle frames.
    strip = Image.new("RGB", (FRAME_SIZE[0] * len(originals), FRAME_SIZE[1]), (14, 14, 17))
    for index, (_, im) in enumerate(originals):
        rgb = Image.new("RGB", FRAME_SIZE, (14, 14, 17))
        rgb.paste(im.convert("RGB"), mask=im.getchannel("A"))
        strip.paste(rgb, (index * FRAME_SIZE[0], 0))
    quantized_strip = strip.quantize(colors=PALETTE_COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    palette = quantized_strip.getpalette()[: PALETTE_COLORS * 3]
    palette_image = Image.new("P", (1, 1))
    palette_image.putpalette(palette + [0] * (768 - len(palette)))

    for path, original in originals:
        rgb = Image.new("RGB", FRAME_SIZE, (14, 14, 17))
        rgb.paste(original.convert("RGB"), mask=original.getchannel("A"))
        reduced = rgb.quantize(palette=palette_image, dither=Image.Dither.NONE).convert("RGBA")
        reduced.putalpha(original.getchannel("A"))
        reduced.save(path)

    report = {
        "method": "Pillow shared MEDIANCUT palette, no dithering",
        "paletteColors": PALETTE_COLORS,
        "frames": 30,
        "alphaSource": "split frame alpha from assets/_trial_20260912/glb2d_idle/idle_6dir_v4/",
        "alphaChanged": False,
        "purpose": "ensure png8_encode.py uses lossless path while keeping one palette across idle frames",
    }
    (QA / "palette_reduce.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
