#!/usr/bin/env python3
"""A 方案精修输出：切帧 + 轮廓配准 + 回填原 alpha。

要点：模型会把人物整体放大（实测 +17~19%），直接套原 alpha 会切掉头发/靴子。
所以每帧先做一次**外形配准**——按「模型人物掩膜 ∩ 源 alpha 掩膜」的 IoU 搜
最贴合的缩放与偏移，把模型人物拉回源帧的尺寸与位置，再套 alpha、缩回 240×320。

用法：python3 split_refine_A.py <raw_sheet.png> <facing> <out_dir>
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/_trial_20260912/glb2d_idle/idle_6dir_v4"
FRAME = (240, 320)
CELL_IN = (341, 512)        # 建图纸时的输入格
PAD = 9
INNER_W = CELL_IN[0] - PAD * 2                  # 323
SCALE_IN = INNER_W / FRAME[0]                   # 1.34583
Y_OFF_IN = (CELL_IN[1] - round(FRAME[1] * SCALE_IN)) // 2   # 40
LUM_THR = 45


def masks_and_geom(sheet: Image.Image):
    """返回 (cols, rows, cell_px, 把源帧像素映射到输出图纸坐标的系数)。"""
    cols, rows = 3, 2
    cw, ch = sheet.size[0] / cols, sheet.size[1] / rows
    k = cw / CELL_IN[0]                          # 输出格 / 输入格
    return cols, rows, (cw, ch), k


def src_mask_in_sheet(facing: str, idx: int, layout, sheet_size):
    """把第 idx 帧的 alpha 放到输出图纸坐标系里。"""
    cols, rows, (cw, ch), k = layout
    col, row = idx % cols, idx // cols
    a = Image.open(SRC / f"idle_{facing}_{idx + 1}.png").convert("RGBA").getchannel("A")
    a = a.point(lambda v: 255 if v > 128 else 0)
    # 源帧像素 -> 输入格坐标 -> 输出图纸坐标
    w = cw * (INNER_W / CELL_IN[0])
    h = ch * (round(FRAME[1] * SCALE_IN) / CELL_IN[1])
    a = a.resize((max(1, round(w)), max(1, round(h))), Image.Resampling.LANCZOS).point(lambda v: 255 if v > 128 else 0)
    canvas = Image.new("L", sheet_size, 0)
    x = round(cw * col + cw * (PAD / CELL_IN[0]))
    y = round(ch * row + ch * (Y_OFF_IN / CELL_IN[1]))
    canvas.paste(a, (x, y))
    return canvas


def bg_distance(cell: Image.Image) -> Image.Image:
    """每像素与背景色的距离（L 图）。深色头发在近黑背景上仍有差值，不靠亮度阈值。"""
    bg = cell.getpixel((cell.size[0] - 4, cell.size[1] - 4))
    r, g, b = cell.split()
    d = ImageChops.add(ImageChops.add(ImageChops.difference(r, Image.new("L", cell.size, bg[0])),
                                      ImageChops.difference(g, Image.new("L", cell.size, bg[1]))),
                       ImageChops.difference(b, Image.new("L", cell.size, bg[2])))
    return d.point(lambda v: min(255, v))


def match_score(dist: Image.Image, target: Image.Image, inv: Image.Image, area_in, area_out):
    """匹配滤波：掩膜内平均背景距离 − 掩膜外平均背景距离，越大越贴合。"""
    si = ImageStat.Stat(ImageChops.multiply(dist, target)).sum[0]
    so = ImageStat.Stat(ImageChops.multiply(dist, inv)).sum[0]
    return si / area_in - so / area_out


def transform_cell(cell: Image.Image, s: float) -> Image.Image:
    w, h = cell.size
    sw, sh = max(1, round(w * s)), max(1, round(h * s))
    canvas = Image.new("RGB", (w, h), cell.getpixel((w - 4, h - 4)))
    canvas.paste(cell.resize((sw, sh), Image.Resampling.LANCZOS), ((w - sw) // 2, (h - sh) // 2))
    return canvas


def register(cell: Image.Image, target: Image.Image):
    """返回 (score, 缩放s, dx, dy)：把 cell 缩放 s、平移 (dx,dy) 后与 target 最贴合。"""
    w, h = cell.size
    inv = ImageChops.invert(target)
    area_in = max(1.0, ImageStat.Stat(target).sum[0] / 255.0)
    area_out = max(1.0, ImageStat.Stat(inv).sum[0] / 255.0)
    best = (-1e9, 1.0, 0, 0)

    def evaluate(s, dx, dy):
        d = bg_distance(transform_cell(cell, s))
        return match_score(ImageChops.offset(d, dx, dy), target, inv, area_in, area_out)

    for si in range(30, 51):                       # 0.75 ~ 0.95 粗搜
        s = 0.75 + (si - 30) * 0.01
        for dx in range(-40, 41, 5):
            for dy in range(-40, 41, 5):
                sc = evaluate(s, dx, dy)
                if sc > best[0]:
                    best = (sc, s, dx, dy)
    _, s0, dx0, dy0 = best
    for si in range(-3, 4):
        s = round(s0 + si * 0.004, 4)
        if not 0.70 <= s <= 0.99:
            continue
        for dx in range(dx0 - 5, dx0 + 6):
            for dy in range(dy0 - 5, dy0 + 6):
                sc = evaluate(s, dx, dy)
                if sc > best[0]:
                    best = (sc, s, dx, dy)
    return best


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: split_refine_A.py <raw_sheet.png> <facing> <out_dir>")
    raw, facing, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    sheet = Image.open(raw).convert("RGB")
    layout = masks_and_geom(sheet)
    cols, rows, (cw, ch), k = layout
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"图纸 {sheet.size}  格 {cw:.1f}×{ch:.1f}  输出格/输入格 = {k:.4f}")

    for idx in range(5):
        col, row = idx % cols, idx // cols
        box = (round(col * cw), round(row * ch), round((col + 1) * cw), round((row + 1) * ch))
        cell = sheet.crop(box)
        target = src_mask_in_sheet(facing, idx, layout, sheet.size).crop(box)

        score, s, dx, dy = register(cell, target)
        aligned = ImageChops.offset(transform_cell(cell, s), dx, dy)

        frame = aligned.resize(FRAME, Image.Resampling.LANCZOS).convert("RGBA")
        src = Image.open(SRC / f"idle_{facing}_{idx + 1}.png").convert("RGBA")
        frame.putalpha(src.getchannel("A"))
        dst = out_dir / f"idle_{facing}_{idx + 1}.png"
        frame.save(dst)
        print(f"  帧{idx+1}: 缩放 {s:.4f} 偏移 ({dx:+d},{dy:+d})  IoU {score:.3f} -> {dst.name}")


if __name__ == "__main__":
    main()
