#!/usr/bin/env python3
"""全 30 帧共用一套调色板 → PNG-8 无损编码（与美术线 idle 精修同一口径）。

为什么共用调色板：逐帧自适应调色板会让同一块颜色在不同帧落到略微不同的值，
5 帧循环播起来会闪色。共用一套 + 不抖动 → png8_encode.py 走 lossless 路径。

用法：python3 png8_shared_palette.py <dir>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

FRAME = (240, 320)
PALETTE_COLORS = 248
BG = (14, 14, 17)


def main() -> None:
    root = Path(sys.argv[1])
    files = sorted(root.glob("*.png"))
    originals = [(p, Image.open(p).convert("RGBA")) for p in files]
    bad = [str(p) for p, im in originals if im.size != FRAME]
    if bad:
        raise SystemExit(f"非 {FRAME} 的帧: {bad}")

    strip = Image.new("RGB", (FRAME[0] * len(originals), FRAME[1]), BG)
    for i, (_, im) in enumerate(originals):
        rgb = Image.new("RGB", FRAME, BG)
        rgb.paste(im.convert("RGB"), mask=im.getchannel("A"))
        strip.paste(rgb, (i * FRAME[0], 0))
    q = strip.quantize(colors=PALETTE_COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = q.getpalette()[: PALETTE_COLORS * 3]
    pal_img = Image.new("P", (1, 1))
    pal_img.putpalette(pal + [0] * (768 - len(pal)))

    rgba_dir = root / "_rgba_backup"
    rgba_dir.mkdir(exist_ok=True)
    for p, im in originals:
        im.save(rgba_dir / p.name)
        rgb = Image.new("RGB", FRAME, BG)
        rgb.paste(im.convert("RGB"), mask=im.getchannel("A"))
        red = rgb.quantize(palette=pal_img, dither=Image.Dither.NONE).convert("RGBA")
        red.putalpha(im.getchannel("A"))
        red.save(p)
    print(json.dumps({"frames": len(files), "paletteColors": PALETTE_COLORS,
                      "rgbaBackup": str(rgba_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
