#!/usr/bin/env python3
"""从色键底（品红）抠出干净 alpha —— 借用 sprite-gen 的「软 alpha 解混」思路。

为什么不用二值抠底：二分法会把抗锯齿的发丝、细描边削成锯齿阶梯。
软解混解 blend 模型 `observed = (1-k)·subject + k·key`，反推 k 得到部分 alpha。

做法（无 numpy，纯 PIL）：
  1. 从四边采样检出**生成器实际画出的背景色**（不假设纯品红 —— 实测生成器会把
     #FF00FF 画成 (216,46,147) 这类偏色）
  2. 距背景色 ≤ T_hard 的像素 → alpha=0，RGB 清成 0（不留光晕）
  3. 距背景色在 (T_hard, T_soft] 的像素 → 按色键方向解混：k = 投影比例，alpha = 1-k
  4. 其余保持不透明

用法：python3 chroma_extract.py <in.png> <out_dir> --cols 3 --rows 2 --inset 8
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops

MAG = (255, 0, 255)
T_HARD = 60
T_SOFT = 150


def detect_bg(im: Image.Image, inset: int = 8) -> tuple[int, int, int]:
    """从四边条带取中值当背景色（比取均值稳，渐变背景也不漂）。"""
    w, h = im.size
    px = im.load()
    samples = []
    step = max(1, w // 60)
    for x in range(inset, w - inset, step):
        samples.append(px[x, inset]); samples.append(px[x, h - inset - 1])
    step = max(1, h // 60)
    for y in range(inset, h - inset, step):
        samples.append(px[inset, y]); samples.append(px[w - inset - 1, y])
    med = lambda i: sorted(s[i] for s in samples)[len(samples) // 2]
    return med(0), med(1), med(2)


def key_frame(im: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    w, h = im.size
    src = im.convert("RGB"); px = src.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0)); po = out.load()
    # 色键方向的单位向量
    vx, vy, vz = bg[0] - 128.0, bg[1] - 128.0, bg[2] - 128.0
    vl = max(1e-6, (vx * vx + vy * vy + vz * vz) ** 0.5)
    vx, vy, vz = vx / vl, vy / vl, vz / vl
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if d <= T_HARD:
                continue                                   # 背景：全透明
            if d <= T_SOFT:
                # 解混：把 (像素-背景) 投到色键方向，k 越大越像背景
                pr, pg, pb = r - bg[0], g - bg[1], b - bg[2]
                proj = pr * vx + pg * vy + pb * vz
                k = max(0.0, min(1.0, 1.0 - (-proj) / max(1.0, T_SOFT)))
                if k >= 0.999:
                    continue
                a = 1.0 - k
                if a <= 0.02:
                    continue
                sr = (r - k * bg[0]) / max(a, 1e-6)
                sg = (g - k * bg[1]) / max(a, 1e-6)
                sb = (b - k * bg[2]) / max(a, 1e-6)
                po[x, y] = (max(0, min(255, int(sr))), max(0, min(255, int(sg))),
                            max(0, min(255, int(sb))), int(a * 255))
            else:
                po[x, y] = (r, g, b, 255)
    return out


def largest_component(im: Image.Image) -> Image.Image:
    """只保留最大的不透明连通块（人物本体），去掉分隔线/边框等碎片。4 连通。"""
    w, h = im.size
    a = im.getchannel("A"); pa = a.load()
    seen = [[False] * w for _ in range(h)]
    best = []
    from collections import deque
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or pa[sx, sy] <= 32:
                continue
            q = deque([(sx, sy)]); seen[sy][sx] = True; comp = []
            while q:
                x, y = q.popleft(); comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and pa[nx, ny] > 32:
                        seen[ny][nx] = True; q.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    keep = Image.new("L", (w, h), 0); pk = keep.load()
    for x, y in best:
        pk[x, y] = 255
    out = im.copy(); out.putalpha(ImageChops.multiply(a, keep))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("out_dir")
    ap.add_argument("--cols", type=int, default=3); ap.add_argument("--rows", type=int, default=2)
    ap.add_argument("--inset", type=int, default=10); ap.add_argument("--prefix", default="atk")
    a = ap.parse_args()
    out = Path(a.out_dir); out.mkdir(parents=True, exist_ok=True)
    im = Image.open(a.src).convert("RGB")
    cw, ch = im.size[0] / a.cols, im.size[1] / a.rows
    n = 0
    for r in range(a.rows):
        for c in range(a.cols):
            box = (round(c * cw) + a.inset, round(r * ch) + a.inset,
                   round((c + 1) * cw) - a.inset, round((r + 1) * ch) - a.inset)
            cell = im.crop(box)
            bg = detect_bg(cell, inset=6)
            fr = largest_component(key_frame(cell, bg))
            n += 1
            fr.save(out / f"{a.prefix}_{n}.png")
            nz = sum(1 for p in fr.getdata() if p[3] > 0)
            print(f"  第{n}格 背景检出 RGB{bg}  非透明 {nz} px")
    print(f"共 {n} 帧 → {out}")


if __name__ == "__main__":
    main()
