#!/usr/bin/env python3
"""A 方案精修输出 v4：**正确坐标映射** + 只做平移 + 回填原 alpha。

────────────────────────────────────────────────────────────────
v2/v3 两个版本都错在同一件事上：**切帧的坐标映射错了**。

建图纸时，源帧 240×320 是**按 1.34583 倍放大后"信箱式"放进 341×512 的格子里**的
（水平留白 9px、垂直留白 40px，即放进去的是 323×431）。
而 v2/v3 把**整格**（含留白）直接 resize 成 240×320 —— 等于给内容叠了一次
(0.5625, 0.5) 的**非等比压缩**。后果：人物在帧内被压扁并整体上浮 ~20px，
套上源 alpha 后脚离地，帧间再被搜索出来的缩放放大 → Leo 看到的「有高有低，不一致」。

正确映射：先把输出图纸里对应源帧的那块**区域**裁出来，再等比缩到 240×320。
  · 区域在输入图纸坐标 = (col*341 + 9, row*512 + 40) 起，宽 323 高 431
  · 输出图纸 = 输入图纸 × (out_w/1024, out_h/1024)
  · 区域等比缩放 323→240 与 431→320 的系数一致（都是 1/(1.25*1.34583)），不会变形

配准只保留**平移**（脚底对齐 + 水平中心对齐），不做缩放：
  实测模型的人物脚底位置本来就基本对得上（个别行差 −14/−32px 系模型自己排布偏移），
  多出来的高度是头发体积——缩放是错的药。
────────────────────────────────────────────────────────────────

用法：python3 split_refine_A4.py <raw_sheet.png> <facing> <out_dir>
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/_trial_20260912/glb2d_idle/idle_6dir_v4"
FRAME = (240, 320)
SHEET_IN = 1024
CELL_IN = (341, 512)
PAD = 9
INNER_W = CELL_IN[0] - PAD * 2                       # 323
INNER_H = round(FRAME[1] * INNER_W / FRAME[0])       # 431
Y_OFF_IN = (CELL_IN[1] - INNER_H) // 2               # 40
BG_THR = 20
INSET = 6
MAX_SHIFT = 90


def bg_color(cell: Image.Image, margin: int = 12, patch: int = 24):
    w, h = cell.size
    boxes = [(margin, margin), (w - margin - patch, margin),
             (margin, h - margin - patch), (w - margin - patch, h - margin - patch)]
    means = [ImageStat.Stat(cell.crop((ox, oy, ox + patch, oy + patch))).mean for ox, oy in boxes]
    med = lambda i: round(sorted(m[i] for m in means)[len(means) // 2])
    return med(0), med(1), med(2)


def model_mask(im: Image.Image) -> Image.Image:
    """背景距离掩膜（不能用亮度阈值——本项目头发是深色，会被整块漏掉）。"""
    bg = bg_color(im)
    r, g, b = im.split()
    d = ImageChops.add(
        ImageChops.add(ImageChops.difference(r, Image.new("L", im.size, bg[0])),
                       ImageChops.difference(g, Image.new("L", im.size, bg[1]))),
        ImageChops.difference(b, Image.new("L", im.size, bg[2]))).point(lambda v: min(255, v))
    m = d.point(lambda v: 255 if v > BG_THR else 0)
    keep = Image.new("L", im.size, 0)
    keep.paste(m.crop((INSET, INSET, im.size[0] - INSET, im.size[1] - INSET)), (INSET, INSET))
    return keep


def frame_region(sheet_size, col: int, row: int):
    """返回输出图纸里对应源帧的区域 box。"""
    kx = sheet_size[0] / SHEET_IN
    ky = sheet_size[1] / SHEET_IN
    x0 = round((col * CELL_IN[0] + PAD) * kx)
    y0 = round((row * CELL_IN[1] + Y_OFF_IN) * ky)
    x1 = round((col * CELL_IN[0] + PAD + INNER_W) * kx)
    y1 = round((row * CELL_IN[1] + Y_OFF_IN + INNER_H) * ky)
    return (x0, y0, x1, y1)


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: split_refine_A4.py <raw_sheet.png> <facing> <out_dir>")
    raw, facing, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    sheet = Image.open(raw).convert("RGB")
    out_dir.mkdir(parents=True, exist_ok=True)
    cols, rows = 3, 2
    print(f"图纸 {sheet.size}  每格 {sheet.size[0]/cols:.1f}×{sheet.size[1]/rows:.1f}  "
          f"帧区域 {INNER_W}×{INNER_H}（等比缩到 {FRAME[0]}×{FRAME[1]}）")

    for idx in range(5):
        col, row = idx % cols, idx // cols
        region = sheet.crop(frame_region(sheet.size, col, row))
        src = Image.open(SRC / f"idle_{facing}_{idx + 1}.png").convert("RGBA")

        # 在区域坐标里做「只平移」配准：源 alpha bbox 按区域/帧 的比例换算过来
        m = model_mask(region)
        mb = m.getbbox()
        sb = src.getchannel("A").getbbox()
        if mb is None or sb is None:
            raise SystemExit(f"帧{idx+1} 掩膜为空")
        rx = region.size[0] / FRAME[0]
        ry = region.size[1] / FRAME[1]
        s_bottom = sb[3] * ry
        s_cx = (sb[0] + sb[2]) / 2 * rx
        dy = round(s_bottom - mb[3])
        dx = round(s_cx - (mb[0] + mb[2]) / 2)
        if abs(dx) > MAX_SHIFT or abs(dy) > MAX_SHIFT:
            raise SystemExit(f"帧{idx+1} 平移量异常 dx={dx} dy={dy}")

        aligned = ImageChops.offset(region, dx, dy)
        frame = aligned.resize(FRAME, Image.Resampling.LANCZOS).convert("RGBA")
        frame.putalpha(src.getchannel("A"))
        frame.save(out_dir / f"idle_{facing}_{idx + 1}.png")
        print(f"  帧{idx+1}: 平移 ({dx:+d},{dy:+d})  区域 {region.size}  模型底线 {mb[3]} → 源底线 {s_bottom:.0f}")


if __name__ == "__main__":
    main()
