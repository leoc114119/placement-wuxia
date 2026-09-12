#!/usr/bin/env python3
"""A 方案精修输出 v5：正确坐标映射 + **按方向统一缩放** + 脚底/水平居中 + 回填原 alpha。

为什么还要缩放（v4 只平移不够）：
  模型会把人物**整体放大**（逐方向实测 2%~15%），且放大几乎全部加在**上半身/头顶**：
  源 alpha 的上沿是硬边界，头顶超出 19~38px 就被整块切掉 —— Leo 看到的就是「**头都没了**」。
  面积比对照高度比的平方（right 1.083 vs 1.156 / rightup 1.252 vs 1.314）说明**近似整体等比放大**，
  所以正确的药是**缩放**，不是平移。

缩放口径：
  · **每个方向共用同一个 s**（取该方向 5 帧 源高/模型高 的中位数）——逐帧各自定 s 会造成帧间大小漂移；
  · 变换 = 先绕区域中心缩放 s，再平移使 **脚底对齐源底线、水平中心对齐源中心**；
  · 缩放后仍套**源 alpha**，保证轮廓与现有素材像素级一致。

用法：python3 split_refine_A5.py <raw_sheet.png> <facing> <out_dir>
"""
from __future__ import annotations

import statistics
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/_trial_20260912/glb2d_idle/idle_6dir_v4"
FRAME = (240, 320)
SHEET_IN = 1024
CELL_IN = (341, 512)
PAD = 9
INNER_W = CELL_IN[0] - PAD * 2
INNER_H = round(FRAME[1] * INNER_W / FRAME[0])
Y_OFF_IN = (CELL_IN[1] - INNER_H) // 2
BG_THR = 20
INSET = 6
MAX_SHIFT = 90


def bg_color(im: Image.Image, margin: int = 12, patch: int = 24):
    w, h = im.size
    boxes = [(margin, margin), (w - margin - patch, margin),
             (margin, h - margin - patch), (w - margin - patch, h - margin - patch)]
    means = [ImageStat.Stat(im.crop((ox, oy, ox + patch, oy + patch))).mean for ox, oy in boxes]
    med = lambda i: round(sorted(m[i] for m in means)[len(means) // 2])
    return med(0), med(1), med(2)


def model_mask(im: Image.Image) -> Image.Image:
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
    kx = sheet_size[0] / SHEET_IN
    ky = sheet_size[1] / SHEET_IN
    return (round((col * CELL_IN[0] + PAD) * kx), round((row * CELL_IN[1] + Y_OFF_IN) * ky),
            round((col * CELL_IN[0] + PAD + INNER_W) * kx), round((row * CELL_IN[1] + Y_OFF_IN + INNER_H) * ky))


def zoom_about_center(im: Image.Image, s: float) -> Image.Image:
    w, h = im.size
    sw, sh = max(1, round(w * s)), max(1, round(h * s))
    small = im.resize((sw, sh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (w, h), im.getpixel((w - 3, h - 3)))
    canvas.paste(small, ((w - sw) // 2, (h - sh) // 2))
    return canvas


def main() -> None:
    raw, facing, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    sheet = Image.open(raw).convert("RGB")
    cols, rows = 3, 2
    out_dir.mkdir(parents=True, exist_ok=True)

    regions, srcs, src_boxes = [], [], []
    for idx in range(5):
        col, row = idx % cols, idx // cols
        region = sheet.crop(frame_region(sheet.size, col, row))
        src = Image.open(SRC / f"idle_{facing}_{idx + 1}.png").convert("RGBA")
        regions.append(region)
        srcs.append(src)
        src_boxes.append(src.getchannel("A").getbbox())

    rx = regions[0].size[0] / FRAME[0]
    ry = regions[0].size[1] / FRAME[1]

    # 每个方向共用同一个缩放：取 5 帧 源高/模型高 的中位数
    ratios = []
    for region, sb in zip(regions, src_boxes):
        mb = model_mask(region).getbbox()
        if mb is None:
            raise SystemExit("模型掩膜为空")
        ratios.append((sb[3] - sb[1]) * ry / (mb[3] - mb[1]))
    s_dir = statistics.median(ratios)
    print(f"方向 {facing}: 每帧 源高/模型高 = {[round(r,3) for r in ratios]} → 共用缩放 {s_dir:.4f}")

    for idx, (region, src, sb) in enumerate(zip(regions, srcs, src_boxes)):
        scaled = zoom_about_center(region, s_dir)
        mb = model_mask(scaled).getbbox()
        if mb is None:
            raise SystemExit(f"帧{idx+1} 缩放后掩膜为空")
        dy = round(sb[3] * ry - mb[3])
        dx = round((sb[0] + sb[2]) / 2 * rx - (mb[0] + mb[2]) / 2)
        if abs(dx) > MAX_SHIFT or abs(dy) > MAX_SHIFT:
            raise SystemExit(f"帧{idx+1} 平移异常 dx={dx} dy={dy}")
        aligned = ImageChops.offset(scaled, dx, dy)
        frame = aligned.resize(FRAME, Image.Resampling.LANCZOS).convert("RGBA")
        frame.putalpha(src.getchannel("A"))
        frame.save(out_dir / f"idle_{facing}_{idx + 1}.png")
        print(f"  帧{idx+1}: 缩放 {s_dir:.4f} 平移 ({dx:+d},{dy:+d}) "
              f"头顶 {mb[1]}/{sb[1]*ry:.0f} 底线 {mb[3]}/{sb[3]*ry:.0f}")


if __name__ == "__main__":
    main()
