#!/usr/bin/env python3
"""A 方案精修输出 v3：切帧 + **只做平移**配准 + 回填原 alpha。

为什么把 v2 的 IoU 三参数搜索换掉：
  实测（v2）模型的人物**脚底位置本来就基本对得上**（底差 0～±8px，仅个别行差 −14/−32px），
  多出来的高度是**头发体积**。而 IoU 搜索会自作主张给一个 0.87~0.99 的缩放 +最 34px 的平移，
  结果把内容整体抬高 16~33px（脚离地），**帧与帧之间缩放还不一致（同一方向 0.878~0.942，差 7.3%）**
  → Leo 一眼看出「有高有低，不一致」。

现在的口径：**不缩放**，只做一次平移——
  · dy = 源剪影底线 − 模型剪影底线   （脚落回地线，与原素材一致）
  · dx = 源剪影水平中心 − 模型剪影水平中心
  缩放恒为 1 ⇒ 帧间大小不可能漂；剩下的只有头发体积差异（由 alpha 裁掉，实测约占 2%）。

用法：python3 split_refine_A3.py <raw_sheet.png> <facing> <out_dir>
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/_trial_20260912/glb2d_idle/idle_6dir_v4"
FRAME = (240, 320)
CELL_IN = (341, 512)
PAD = 9
INNER_W = CELL_IN[0] - PAD * 2
SCALE_IN = INNER_W / FRAME[0]
Y_OFF_IN = (CELL_IN[1] - round(FRAME[1] * SCALE_IN)) // 2
BG_THR = 20
INSET = 6
MAX_SHIFT = 80          # 超过这个平移量说明取景对不上，宁可报错也不硬掰


def bg_color(cell: Image.Image, margin: int = 12, patch: int = 24):
    w, h = cell.size
    boxes = [(margin, margin), (w - margin - patch, margin),
             (margin, h - margin - patch), (w - margin - patch, h - margin - patch)]
    means = [ImageStat.Stat(cell.crop((ox, oy, ox + patch, oy + patch))).mean for ox, oy in boxes]
    med = lambda i: round(sorted(m[i] for m in means)[len(means) // 2])
    return med(0), med(1), med(2)


def model_mask(cell: Image.Image) -> Image.Image:
    """背景距离掩膜（不能用亮度阈值——本项目头发是深色，会被整块漏掉）。"""
    bg = bg_color(cell)
    r, g, b = cell.split()
    d = ImageChops.add(
        ImageChops.add(ImageChops.difference(r, Image.new("L", cell.size, bg[0])),
                       ImageChops.difference(g, Image.new("L", cell.size, bg[1]))),
        ImageChops.difference(b, Image.new("L", cell.size, bg[2]))).point(lambda v: min(255, v))
    m = d.point(lambda v: 255 if v > BG_THR else 0)
    keep = Image.new("L", cell.size, 0)
    keep.paste(m.crop((INSET, INSET, cell.size[0] - INSET, cell.size[1] - INSET)), (INSET, INSET))
    return keep


def source_mask(facing: str, idx: int, cols: int, rows: int, cell, sheet_size) -> Image.Image:
    cw, ch = cell
    col, row = idx % cols, idx // cols
    a = Image.open(SRC / f"idle_{facing}_{idx + 1}.png").convert("RGBA").getchannel("A")
    a = a.point(lambda v: 255 if v > 128 else 0)
    a = a.resize((round(cw * INNER_W / CELL_IN[0]), round(ch * round(FRAME[1] * SCALE_IN) / CELL_IN[1])),
                 Image.Resampling.LANCZOS).point(lambda v: 255 if v > 128 else 0)
    canvas = Image.new("L", sheet_size, 0)
    canvas.paste(a, (round(cw * col + cw * PAD / CELL_IN[0]), round(ch * row + ch * Y_OFF_IN / CELL_IN[1])))
    return canvas


def align_shift(cell: Image.Image, target: Image.Image):
    """只求平移：脚底对齐 + 水平中心对齐。返回 (dx, dy, 模型bbox, 源bbox)。"""
    mb = model_mask(cell).getbbox()
    sb = target.getbbox()
    if mb is None or sb is None:
        raise SystemExit("掩膜为空，无法配准")
    dy = sb[3] - mb[3]                                    # 底线对齐
    dx = (sb[0] + sb[2]) // 2 - (mb[0] + mb[2]) // 2      # 水平中心对齐
    return dx, dy, mb, sb


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: split_refine_A3.py <raw_sheet.png> <facing> <out_dir>")
    raw, facing, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    sheet = Image.open(raw).convert("RGB")
    cols, rows = 3, 2
    cw, ch = sheet.size[0] / cols, sheet.size[1] / rows
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"图纸 {sheet.size}  格 {cw:.1f}×{ch:.1f}  （只平移，缩放恒 1）")

    for idx in range(5):
        col, row = idx % cols, idx // cols
        box = (round(col * cw), round(row * ch), round((col + 1) * cw), round((row + 1) * ch))
        cell = sheet.crop(box)
        target = source_mask(facing, idx, cols, rows, (cw, ch), sheet.size).crop(box)

        dx, dy, mb, sb = align_shift(cell, target)
        if abs(dx) > MAX_SHIFT or abs(dy) > MAX_SHIFT:
            raise SystemExit(f"帧{idx+1} 平移量异常 dx={dx} dy={dy}，取景对不上，停")
        aligned = ImageChops.offset(cell, dx, dy)

        frame = aligned.resize(FRAME, Image.Resampling.LANCZOS).convert("RGBA")
        src = Image.open(SRC / f"idle_{facing}_{idx + 1}.png").convert("RGBA")
        frame.putalpha(src.getchannel("A"))
        frame.save(out_dir / f"idle_{facing}_{idx + 1}.png")
        print(f"  帧{idx+1}: 平移 ({dx:+d},{dy:+d})  模型底线 {mb[3]} → 源底线 {sb[3]}")


if __name__ == "__main__":
    main()
