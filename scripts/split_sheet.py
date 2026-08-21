#!/usr/bin/env python3
"""split_sheet.py — 动画分帧表切割脚本
把一张「同一角色多帧」合成图按等距网格切成独立透明 PNG（77 清单 §0.1）。
用法: python3 split_sheet.py <sheet.png> <out_prefix> <cols> <rows>
例:   python3 split_sheet.py assets/ui/frames/hero_sheet.png assets/ui/frames/hero_ 4 2
输出: <out_prefix>00.png ~ <out_prefix>07.png（按行优先编号）
"""
import sys
from pathlib import Path
from PIL import Image


def main():
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    src, prefix, cols_s, rows_s = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    cols, rows = int(cols_s), int(rows_s)
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    cw, ch = w // cols, h // rows
    out = Path(prefix).parent
    out.mkdir(parents=True, exist_ok=True)
    for r in range(rows):
        for c in range(cols):
            box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
            frame = img.crop(box)
            # 裁掉透明边，保证贴地锚点对齐
            frame = frame.crop(frame.getbbox() or (0, 0, cw, ch))
            name = f"{prefix}{r * cols + c:02d}.png"
            frame.save(name)
            print(f"  {name}  ({frame.size[0]}x{frame.size[1]})")
    print(f"完成: {cols}x{rows} = {cols * rows} 帧 -> {prefix}*.png")


if __name__ == "__main__":
    main()
