#!/usr/bin/env python3
"""将白底 PNG 抠成透明背景（保留物件内部白色，如书页）。

策略：从图片四角做 flood-fill，只把与背景连通的近白色区域标记为透明，
不会误删物件内部被轮廓封闭的白色（如线装书的纸页）。
"""
import sys
from PIL import Image, ImageDraw

SENTINEL = (0, 255, 0)        # 用来标记背景的哨兵色（物件里几乎不会出现纯绿）
THRESH = 60                  # 近白阈值（欧氏距离），覆盖柔边/淡影


def cutout(src: str, dst: str) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size

    # 在副本上从四角 flood-fill 标记背景
    mask = im.copy()
    draw = ImageDraw.Draw(mask, "RGB")
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(mask, corner, SENTINEL, thresh=THRESH)

    # 背景像素 -> alpha 0；物件像素 -> alpha 255
    rgba = im.convert("RGBA")
    px = rgba.load()
    mp = mask.load()
    bg = 0
    for y in range(h):
        for x in range(w):
            if mp[x, y] == SENTINEL:
                px[x, y] = (px[x, y][0], px[x, y][1], px[x, y][2], 0)
                bg += 1

    rgba.save(dst)
    print(f"OK {src} -> {dst}  size={w}x{h}  transparent={bg}px "
          f"({bg / (w * h) * 100:.1f}%)")


if __name__ == "__main__":
    s = sys.argv[1]
    d = sys.argv[2] if len(sys.argv) > 2 else s.rsplit(".", 1)[0] + "_transparent.png"
    cutout(s, d)
