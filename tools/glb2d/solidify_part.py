#!/usr/bin/env python3
"""把"3D 壳部件"填成"实心图形"——纯程序化，不用 AI。

背景：按骨骼切出来的部件是**开口的壳/空心的管**（渲出来是"管壁"，中间是透的）。
      静止时看着正常（只看外壁），一转到关节就看见管子内部 → 白/黑"甜甜圈"。
      而 2D 剪纸动画要求部件是**实心图形**（转起来只会移动旋转，不会看进去）。

做法（三步，全部确定性）：
  1. **剔背面**：输入用 CULL_BACK=1 渲的部件（只留外表面，去掉内壁）
  2. **补空腔**：alpha 从画布四边泛洪，泛不到的区域 = 被外壁围住的空腔 → 判为实体
  3. **填色**：空腔用最近的外壁颜色逐轮扩散填充（迭代膨胀取邻域均值），得到连续过渡

用法：python3 solidify_part.py <in.png> <out.png> [--iters 200]
"""
from __future__ import annotations

import argparse
from collections import deque

from PIL import Image


def flood_outside(mask, w, h):
    """从四边泛洪：返回"能从外部到达"的像素集合。mask[y][x]=True 表示不透明。"""
    outside = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not mask[y][x] and not outside[y][x]:
                outside[y][x] = True; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not mask[y][x] and not outside[y][x]:
                outside[y][x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not mask[ny][nx] and not outside[ny][nx]:
                outside[ny][nx] = True; q.append((nx, ny))
    return outside


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--iters", type=int, default=400)
    a = ap.parse_args()

    im = Image.open(a.src).convert("RGBA")
    w, h = im.size
    px = im.load()
    mask = [[px[x, y][3] > 0 for x in range(w)] for y in range(h)]
    outside = flood_outside(mask, w, h)

    holes = [(x, y) for y in range(h) for x in range(w)
             if not mask[y][x] and not outside[y][x]]
    # 实体 = 原本不透明 ∪ 被围住的空腔
    solid = [[mask[y][x] or (not mask[y][x] and not outside[y][x]) for x in range(w)] for y in range(h)]

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if mask[y][x]:
                op[x, y] = px[x, y]
            elif solid[y][x]:
                op[x, y] = (0, 0, 0, 255)          # 待填的种子
    # 迭代扩散填色：未知像素取已填邻居的均值（逐轮向外长）
    known = [[bool(mask[y][x]) for x in range(w)] for y in range(h)]
    pending = set(holes)
    for _ in range(a.iters):
        if not pending:
            break
        filled = []
        for x, y in pending:
            tot = [0, 0, 0]; n = 0
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and known[ny][nx]:
                    c = op[nx, ny]; tot[0] += c[0]; tot[1] += c[1]; tot[2] += c[2]; n += 1
            if n:
                op[x, y] = (tot[0] // n, tot[1] // n, tot[2] // n, 255)
                filled.append((x, y))
        for x, y in filled:
            known[y][x] = True; pending.discard((x, y))
    # 收尾：仍未知的用整体均值
    rest = [(x, y) for x, y in holes if op[x, y][:3] == (0, 0, 0)]
    if rest:
        cols = [op[x, y] for y in range(h) for x in range(w) if mask[y][x]]
        if cols:
            mean = tuple(sum(c[i] for c in cols) // len(cols) for i in range(3)) + (255,)
            for x, y in rest:
                op[x, y] = mean
    out.save(a.dst)
    print(f"{a.src} → {a.dst}  空腔像素 {len(holes)}（已填实）")


if __name__ == "__main__":
    main()
