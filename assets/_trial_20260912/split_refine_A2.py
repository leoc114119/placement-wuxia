#!/usr/bin/env python3
"""A 方案精修输出：切帧 + 轮廓配准 + 回填原 alpha（v2）。

判据用 **IoU**（不是"掩膜内亮度均值"那类匹配滤波——后者会被"缩到只剩亮部"骗到，
实测同一组帧搜出 0.842~0.938 的乱跳缩放）。
模型人物掩膜走**背景距离**（深色头发在近黑背景上仍有差值），不用亮度阈值（会漏掉头发）。

用法：python3 split_refine_A2.py <raw_sheet.png> <facing> <out_dir>
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


def count(mask: Image.Image) -> float:
    return ImageStat.Stat(mask).sum[0] / 255.0


def bg_color(cell: Image.Image, margin: int = 12, patch: int = 24):
    """四角小方块取中值当背景色。

    不能直接取右下角单像素——格宽 427 时右下角正好压在分隔线上，
    会把灰色分隔线当背景，整幅背景被判成"人物"。
    （也不要取"最高频值"：零频值在稳定排序里会挤进前几名，中值会被拉到 0 附近。）
    """
    w, h = cell.size
    boxes = [(margin, margin), (w - margin - patch, margin),
             (margin, h - margin - patch), (w - margin - patch, h - margin - patch)]
    means = [ImageStat.Stat(cell.crop((ox, oy, ox + patch, oy + patch))).mean for ox, oy in boxes]
    med = lambda i: round(sorted(m[i] for m in means)[len(means) // 2])
    return med(0), med(1), med(2)


def model_mask(cell: Image.Image, inset: int) -> Image.Image:
    bg = bg_color(cell)
    r, g, b = cell.split()
    d = ImageChops.add(
        ImageChops.add(ImageChops.difference(r, Image.new("L", cell.size, bg[0])),
                       ImageChops.difference(g, Image.new("L", cell.size, bg[1]))),
        ImageChops.difference(b, Image.new("L", cell.size, bg[2]))).point(lambda v: min(255, v))
    m = d.point(lambda v: 255 if v > BG_THR else 0)
    if inset:
        box = (inset, inset, cell.size[0] - inset, cell.size[1] - inset)
        keep = Image.new("L", cell.size, 0)
        keep.paste(m.crop(box), (inset, inset))
        m = keep
    return m


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


def register(cell: Image.Image, target: Image.Image):
    """IoU 最大化搜 (s, dx, dy)：把 cell 绕中心缩放 s 再平移 (dx,dy)。"""
    w, h = cell.size
    tgt_count = count(target)
    inv_keep = Image.new("L", (w, h), 0)     # 只在格内比，避免 offset 环绕
    inv_keep.paste(Image.new("L", (w - 2 * INSET, h - 2 * INSET), 255), (INSET, INSET))
    target = ImageChops.multiply(target, inv_keep)
    tgt_count = count(target)
    best = (-1.0, 1.0, 0, 0)

    def score(s, dx, dy):
        sw, sh = max(1, round(w * s)), max(1, round(h * s))
        canvas = Image.new("L", (w, h), 0)
        canvas.paste(model_mask(cell, INSET).resize((sw, sh), Image.Resampling.NEAREST).point(
            lambda v: 255 if v > 127 else 0), ((w - sw) // 2, (h - sh) // 2))
        m = ImageChops.multiply(ImageChops.offset(canvas, dx, dy), inv_keep)
        inter = count(ImageChops.multiply(m, target))
        return inter / max(1.0, count(m) + tgt_count - inter)

    for si in range(-12, 7):                       # 0.88 ~ 1.06
        s = 1.0 + si * 0.01
        for dx in range(-30, 31, 5):
            for dy in range(-30, 31, 5):
                v = score(s, dx, dy)
                if v > best[0]:
                    best = (v, s, dx, dy)
    _, s0, dx0, dy0 = best
    for si in range(-3, 4):
        s = round(s0 + si * 0.004, 4)
        for dx in range(dx0 - 4, dx0 + 5):
            for dy in range(dy0 - 4, dy0 + 5):
                v = score(s, dx, dy)
                if v > best[0]:
                    best = (v, s, dx, dy)
    return best


def main() -> None:
    raw, facing, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    sheet = Image.open(raw).convert("RGB")
    cols, rows = 3, 2
    cw, ch = sheet.size[0] / cols, sheet.size[1] / rows
    cell_px = (round(cw), round(ch))
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"图纸 {sheet.size}  格 {cw:.1f}×{ch:.1f}")

    for idx in range(5):
        col, row = idx % cols, idx // cols
        box = (col * cell_px[0], row * cell_px[1], (col + 1) * cell_px[0], (row + 1) * cell_px[1])
        cell = sheet.crop(box)
        target = source_mask(facing, idx, cols, rows, (cw, ch), sheet.size).crop(box)

        iou, s, dx, dy = register(cell, target)
        w, h = cell.size
        sw, sh = max(1, round(w * s)), max(1, round(h * s))
        canvas = Image.new("RGB", (w, h), cell.getpixel((w - 3, h - 3)))
        canvas.paste(cell.resize((sw, sh), Image.Resampling.LANCZOS), ((w - sw) // 2, (h - sh) // 2))
        aligned = ImageChops.offset(canvas, dx, dy)

        frame = aligned.resize(FRAME, Image.Resampling.LANCZOS).convert("RGBA")
        src = Image.open(SRC / f"idle_{facing}_{idx + 1}.png").convert("RGBA")
        frame.putalpha(src.getchannel("A"))
        frame.save(out_dir / f"idle_{facing}_{idx + 1}.png")
        print(f"  帧{idx+1}: 缩放 {s:.4f} 偏移 ({dx:+d},{dy:+d})  IoU {iou:.3f}")


if __name__ == "__main__":
    main()
