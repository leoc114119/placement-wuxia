#!/usr/bin/env python3
"""check_left v2（规范 §2.3 · 内容对齐版）：定位返回图左半区主体包络 → NEAREST 缩放至锚包络同尺寸 →
与锚帧包络逐像素 RGB 距离取均值，T=12 内=过。
用法: python3 check_left_v2.py <锚帧240x320.png> <返回图raw.png> [T]
几何说明：mxai gpt-image-2 受理 3:2 后保留"左角色+右角色"双格语义但会重排两格位置
（固定坐标裁剪必然错位），故按包络定位做内容对齐比较——门本意=验证左格内容（锚）未被改动。
"""
import os
import sys
from collections import deque

from PIL import Image

src_path, raw_path = sys.argv[1], sys.argv[2]
T = float(sys.argv[3]) if len(sys.argv) > 3 else 30.0  # Leo 09-04 校准 12→30（重绘地板 21.2/22.9 实测）
THRESH = 40  # 主体掩码：与纯白欧氏距离阈值

src = Image.open(src_path).convert("RGBA")
raw = Image.open(raw_path).convert("RGB")
W, H = raw.size
region = raw.crop((0, 0, W // 2, H))
rw, rh = region.size
px = list(region.getdata())
fg = bytearray(rw * rh)
for i, (r, g, b) in enumerate(px):
    if (255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2 > THRESH * THRESH:
        fg[i] = 1
seen = bytearray(rw * rh)
best = None
for start in range(rw * rh):
    if seen[start] or not fg[start]:
        continue
    seen[start] = 1
    q = deque([start])
    size = 0
    minx = maxx = start % rw
    miny = maxy = start // rw
    while q:
        i = q.popleft()
        size += 1
        x, y = i % rw, i // rw
        minx = min(minx, x); maxx = max(maxx, x)
        miny = min(miny, y); maxy = max(maxy, y)
        for n in ((i - 1) if x > 0 else -1, (i + 1) if x < rw - 1 else -1,
                  (i - rw) if y > 0 else -1, (i + rw) if y < rh - 1 else -1):
            if n >= 0 and fg[n] and not seen[n]:
                seen[n] = 1
                q.append(n)
    if best is None or size > best[0]:
        best = (size, (minx, miny, maxx + 1, maxy + 1))
if best is None:
    print("CHECK_LEFT_V2 FAIL 左半区无主体")
    sys.exit(2)

amask = src.getchannel("A").point(lambda v: 255 if v > 0 else 0)
abox = amask.getbbox()
tw, th = abox[2] - abox[0], abox[3] - abox[1]
crop = raw.crop(best[1]).resize((tw, th), Image.NEAREST)
# 锚透明像素底层 RGB=黑，必须先白底合成再取包络（黑污染会伪造 mean≈180）
aref = Image.alpha_composite(Image.new("RGBA", src.size, "WHITE"), src).crop(abox).convert("RGB")
sd, ld = list(aref.getdata()), list(crop.getdata())
total = 0.0
for (r1, g1, b1), (r2, g2, b2) in zip(sd, ld):
    total += ((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) ** 0.5
mean = total / len(sd)
ok = mean <= T
print(f"CHECK_LEFT_V2 content_aligned mean_rgb_dist={mean:.3f} T={T} "
      f"{'PASS' if ok else 'FAIL'} raw_left_env={best[1]} anchor_env={abox} raw_size={raw.size}")
sys.exit(0 if ok else 2)
