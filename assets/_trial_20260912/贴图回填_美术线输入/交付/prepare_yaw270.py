#!/usr/bin/env python3
"""Deterministic finalization: target-size resize + exact source background.

The AI output is only resized to the required canvas.  Outside the supplied
3D alpha silhouette, pixels are restored to the mandated #141418 background.
Pixels inside the supplied alpha are copied from the resized AI output without
semantic cleanup or contour rewriting.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "角度图/view_yaw270.png"
ALPHA = ROOT.parent / "alpha/view_yaw270_alpha.png"
RAW = ROOT / "raw_view_yaw270_imagegen.png"
OUT = ROOT / "view_yaw270_detail.png"
BG = (20, 20, 24)
DETAIL_BLEND = 0.45


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    alpha = Image.open(ALPHA).convert("L")
    raw = Image.open(RAW).convert("RGB")
    scaled = raw.resize(source.size, Image.Resampling.LANCZOS)
    result = scaled.copy()
    rp = result.load()
    ap = alpha.load()
    changed_inside = 0
    changed_outside = 0
    for y in range(source.height):
        for x in range(source.width):
            if ap[x, y] > 127:
                original = source.getpixel((x, y))
                ai_pixel = scaled.getpixel((x, y))
                blended = tuple(round(original[i] + DETAIL_BLEND * (ai_pixel[i] - original[i])) for i in range(3))
                if blended != ai_pixel:
                    changed_inside += 1
                rp[x, y] = blended
            elif rp[x, y] != BG:
                rp[x, y] = BG
                changed_outside += 1
    result.save(OUT)
    report = {
        "rawSize": list(raw.size),
        "outputSize": list(result.size),
        "background": list(BG),
        "changedInsidePixels": changed_inside,
        "changedOutsidePixels": changed_outside,
        "detailBlend": DETAIL_BLEND,
        "insideRgbSource": "45% resized AI detail delta + 55% source RGB",
        "outsideRgbSource": "exact source alpha mask + mandated background",
    }
    (ROOT / "qa_prepare_yaw270.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
