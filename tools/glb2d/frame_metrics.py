#!/usr/bin/env python3
"""统一的帧质量度量（本项目专用，口径锁死，禁止再手搓变体）。

口径（写死，不得改动；要改必须同时重算全部历史数字）：
  1. 载入：有 alpha 就用 alpha 判主体；无 alpha 才用背景距离（阈值 30）。
  2. 主体掩膜 = 上述掩膜，再 MinFilter(9) **腐蚀 4px**（避开轮廓带 —— 那里的硬混叠会污染锐度）。
  3. 亮度 = RGB→L（不做任何 gamma/色彩管理变换）。
  4. 锐度 = 向右/向下各偏移 1px 的绝对差，在掩膜内取均值，横竖再平均。
  5. 对比度 = 掩膜内 L 的标准差。
  6. 显示用图另外合成，**不参与度量**。

用法：python3 tools/glb2d/frame_metrics.py <图1> [图2 ...]
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat

BG = (20, 20, 24)
ERODE = 4
RAW_SIZES = {(960, 1280), (240, 320), (480, 640)}      # 已知的裸 RGBA 缓冲尺寸


def load(path: str) -> Image.Image:
    p = Path(path)
    if p.suffix == ".raw":
        w, h = (960, 1280) if p.stat().st_size == 960 * 1280 * 4 else (240, 320)
        return Image.frombytes("RGBA", (w, h), p.read_bytes())
    return Image.open(p).convert("RGBA")


def subject_mask(im: Image.Image) -> Image.Image:
    a = im.getchannel("A")
    lo, _ = a.getextrema()
    if lo < 250:                       # 存在透明像素 ⇒ alpha 可信，用它
        return a.point(lambda v: 255 if v > 32 else 0)
    px = im.convert("RGB").load()
    w, h = im.size
    m = Image.new("L", (w, h), 0)
    pm = m.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if abs(c[0] - BG[0]) + abs(c[1] - BG[1]) + abs(c[2] - BG[2]) > 30:
                pm[x, y] = 255
    return m


def metric(im: Image.Image):
    m = subject_mask(im).filter(ImageFilter.MinFilter(2 * ERODE + 1))
    g = im.convert("L")
    z = Image.new("L", im.size, 0)
    dx = ImageChops.difference(g, ImageChops.offset(g, 1, 0))
    dy = ImageChops.difference(g, ImageChops.offset(g, 0, 1))
    sharp = (ImageStat.Stat(Image.composite(dx, z, m)).mean[0]
             + ImageStat.Stat(Image.composite(dy, z, m)).mean[0]) / 2
    return sharp, ImageStat.Stat(Image.composite(g, z, m)).stddev[0]


if __name__ == "__main__":
    print("口径：alpha 优先 / 腐 4px / 亮度 RGB→L / 锐度=相邻像素梯度均值")
    print("%-44s %10s %11s" % ("", "锐度", "对比度"))
    for p in sys.argv[1:]:
        try:
            s, c = metric(load(p))
            print("%-44s %10.2f %11.1f" % (p.split("/")[-1], s, c))
        except Exception as e:  # noqa: BLE001
            print("%-44s  读取失败: %s" % (p, e))
