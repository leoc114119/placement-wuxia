#!/usr/bin/env python3
"""Split the one-shot refined idle sheet and build visual review artifacts.

The source sheet is 1224x1948: 4px outer margin, 4px separators, and
240x320 cells.  The generated sheet may be resized by image_gen, so source
sheet coordinates are scaled into the generated sheet before each cell is
resized back to 240x320.  The original frame alpha is then installed
unchanged; no semantic pixel cleanup is performed here.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw


WORKSPACE = Path(__file__).resolve().parents[5]
ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHEET = WORKSPACE / "assets/_trial_20260912/精灵图_精修输入/精灵图_idle.png"
SOURCE_DIR = WORKSPACE / "assets/_trial_20260912/glb2d_idle/idle_6dir_v4"
RAW_SHEET = ROOT / "raw/refined_idle_sheet.png"
FACINGS = ("left", "leftdown", "leftup", "right", "rightdown", "rightup")
CELL_W, CELL_H = 240, 320
SHEET_W, SHEET_H = 1224, 1948
CELL_X0, CELL_Y0 = 4, 4
PITCH_X, PITCH_Y = 244, 324


def frame_path(facing: str, index: int) -> Path:
    return ROOT / f"idle_{facing}_{index}.png"


def split_frames() -> None:
    sheet = Image.open(RAW_SHEET).convert("RGB")
    if sheet.size[0] < 900 or sheet.size[1] < 1400:
        raise SystemExit(f"refined sheet unexpectedly small: {sheet.size}")
    sx = sheet.width / SHEET_W
    sy = sheet.height / SHEET_H
    for row, facing in enumerate(FACINGS):
        for col in range(5):
            x0 = round((CELL_X0 + PITCH_X * col) * sx)
            y0 = round((CELL_Y0 + PITCH_Y * row) * sy)
            x1 = round((CELL_X0 + PITCH_X * col + CELL_W) * sx)
            y1 = round((CELL_Y0 + PITCH_Y * row + CELL_H) * sy)
            crop = sheet.crop((x0, y0, x1, y1)).resize((CELL_W, CELL_H), Image.Resampling.LANCZOS)
            original = Image.open(SOURCE_DIR / f"idle_{facing}_{col + 1}.png").convert("RGBA")
            crop_rgba = crop.convert("RGBA")
            crop_rgba.putalpha(original.getchannel("A"))
            crop_rgba.save(frame_path(facing, col + 1))
    print(f"split 30 frames from {RAW_SHEET.name}; scale=({sx:.8f},{sy:.8f})")


def composite(path: Path, size=(120, 160)) -> Image.Image:
    im = Image.open(path).convert("RGBA").resize(size, Image.Resampling.LANCZOS)
    bg = Image.new("RGBA", size, (14, 14, 17, 255))
    return Image.alpha_composite(bg, im).convert("RGB")


def build_contact() -> None:
    tile_w, tile_h = 120, 160
    gap = 2
    panel_w = 5 * tile_w + 4 * gap
    panel_h = 6 * tile_h + 5 * gap
    header = 28
    canvas = Image.new("RGB", (panel_w * 2 + 24, panel_h + header), (35, 35, 39))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 7), "ORIGINAL", fill=(230, 230, 230))
    draw.text((panel_w + 32, 7), "REFINED", fill=(230, 230, 230))
    x_panels = (8, panel_w + 24)
    for panel_idx, base_x in enumerate(x_panels):
        for row, facing in enumerate(FACINGS):
            for col in range(5):
                idx = col + 1
                path = SOURCE_DIR / f"idle_{facing}_{idx}.png" if panel_idx == 0 else frame_path(facing, idx)
                tile = composite(path, (tile_w, tile_h))
                x = base_x + col * (tile_w + gap)
                y = header + row * (tile_h + gap)
                canvas.paste(tile, (x, y))
    out = ROOT / "contact/idle_hd_compare.png"
    canvas.save(out, optimize=True)
    print(f"contact {out}")


def build_gifs() -> None:
    # GIF stores frame duration in 10ms units; 1330ms is nearest to the
    # source idle cadence of 1327ms (source duration / 5).
    durations = 1330
    for facing in FACINGS:
        frames = [Image.open(frame_path(facing, i)).convert("RGBA") for i in range(1, 6)]
        out = ROOT / f"gifs/idle_{facing}.gif"
        frames[0].save(
            out,
            save_all=True,
            append_images=frames[1:],
            duration=durations,
            loop=0,
            disposal=2,
            transparency=0,
            optimize=False,
        )
    print(f"GIFs 6 directions × 5 frames; duration={durations}ms/frame")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"split", "contact", "gifs"}:
        raise SystemExit("usage: process_idle.py split|contact|gifs")
    if sys.argv[1] == "split":
        split_frames()
    elif sys.argv[1] == "contact":
        build_contact()
    else:
        build_gifs()


if __name__ == "__main__":
    main()
