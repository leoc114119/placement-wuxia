#!/usr/bin/env python3
"""从 ref_hero_v1.png 锚表裁单帧形象锚（T13）。

原理：行带内做列投影找人物 x 连通段，段内做行投影找最大 y 连通段
（自动剔除上下相邻行越界的人物头部出血）。
用法：
  python3 extract_anchor.py survey                 # 打印每行 8 段 bbox
  python3 extract_anchor.py <row> <col> <out.png>  # 裁指定格（带边距）
"""
import sys
from PIL import Image

SRC = "assets/characters/hero/ref_hero_v1.png"
WHITE = 236          # >= 视为背景白
MARGIN = 14          # 裁切边距（像素）


def load():
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    px = im.load()
    # 非白掩码（任一通道显著低于白即视为前景，暖白底也能咬住）
    rows = []
    for y in range(h):
        row = [1 if min(px[x, y]) < WHITE else 0 for x in range(w)]
        rows.append(row)
    return im, w, h, rows


def xruns(rows, y0, y1, w):
    proj = [0] * w
    for y in range(y0, y1):
        row = rows[y]
        for x in range(w):
            if row[x]:
                proj[x] += 1
    runs, s = [], None
    for x in range(w):
        if proj[x] > 0 and s is None:
            s = x
        elif proj[x] == 0 and s is not None:
            runs.append((s, x)); s = None
    if s is not None:
        runs.append((s, w))
    return [r for r in runs if r[1] - r[0] > 20]


def yrun(rows, x0, x1, y0, y1):
    """段内最大 y 连通段（允许 4px 白隙容差）"""
    ys = []
    for y in range(y0, y1):
        if any(rows[y][x] for x in range(x0, x1)):
            ys.append(y)
    if not ys:
        return None
    best, cs, ce, gap = None, ys[0], ys[0], 0
    for y in ys[1:]:
        if y - ce <= 4:
            ce = y; gap = 0
        else:
            gap += 1
            if gap > 4:
                if best is None or ce - cs > best[1] - best[0]:
                    best = (cs, ce)
                cs, ce = y, y; gap = 0
    if best is None or ce - cs > best[1] - best[0]:
        best = (cs, ce)
    return best


def survey():
    im, w, h, rows = load()
    rh = h // 4
    for r in range(4):
        runs = xruns(rows, r * rh, (r + 1) * rh, w)
        out = []
        for (x0, x1) in runs:
            yr = yrun(rows, x0, x1, r * rh, (r + 1) * rh)
            out.append(f"x[{x0},{x1})w{x1-x0} y{yr}")
        print(f"row{r}: " + " | ".join(out))


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "survey":
        survey(); return
    r, c, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    im, w, h, rows = load()
    rh, cw = h // 4, w // 8
    # 列带放宽半格：人物常压格线（col0 人物可越过 x=cw）
    band_x0, band_x1 = max(0, c * cw - cw // 2), min(w, (c + 1) * cw + cw // 2)
    runs = xruns(rows, r * rh, (r + 1) * rh, w)
    # 在放宽带内找覆盖 band 中心的最大段
    center = c * cw + cw // 2
    seg = None
    for (x0, x1) in runs:
        if x0 <= center <= x1 or (x0 < band_x1 and x1 > band_x0):
            if seg is None or x1 - x0 > seg[1] - seg[0]:
                seg = (x0, x1)
    if seg is None:
        print(f"ERR: row{r} col{c} 未找到人物段"); sys.exit(1)
    yr = yrun(rows, seg[0], seg[1], r * rh, (r + 1) * rh)
    x0, x1 = seg
    y0, y1 = yr
    box = (max(0, x0 - MARGIN), max(0, y0 - MARGIN),
           min(w, x1 + MARGIN), min(h, y1 + MARGIN))
    im.crop(box).save(out)
    print(f"OK row{r} col{c} -> {out} box={box} size={box[2]-box[0]}x{box[3]-box[1]}")


if __name__ == "__main__":
    main()
