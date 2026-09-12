#!/usr/bin/env python3
"""锐化通道（Unsharp Mask）—— 让 3D→2D 帧更精细。

为什么要单独一步：**必须放在后处理量化之前**。
  锐化会在边缘两侧拉出更亮的亮边/更暗的暗边 → 产生新颜色；
  若放在 256 色量化之后，新颜色放不下 → PNG-8 退化成有损 → 反而更糊（本项目踩过同类坑）。

原理：out = in + amount × (in − gaussian_blur(in, radius))
  只作用在实体像素（alpha>32）上，alpha 原样保留。

参数经验：
  amount 0.5~1.2 / radius 0.6~1.2 —— 再往上会出现白边（halo），观感变脏。
  本项目 4× 超采样用的是**箱式滤波**降采样（强低通），所以边缘偏软，锐化收益明显。

用法：
  python3 tools/glb2d/sharpen_pass.py <in.raw> <out.raw> <W> <H> [--amount 0.8] [--radius 0.8]
"""
import sys, argparse
from PIL import Image, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument('in_raw'); ap.add_argument('out_raw')
ap.add_argument('W', type=int); ap.add_argument('H', type=int)
ap.add_argument('--amount', type=float, default=0.8)
ap.add_argument('--radius', type=float, default=0.8)
a = ap.parse_args()

im = Image.frombytes('RGBA', (a.W, a.H), open(a.in_raw, 'rb').read())
rgb = im.convert('RGB')
blur = rgb.filter(ImageFilter.GaussianBlur(a.radius))
sharp = Image.blend(rgb, rgb.point(lambda v: v), 0)          # 占位，下面用像素级计算
src = rgb.load(); bl = blur.load(); dst = sharp.load(); alpha = im.getchannel('A').load()
amt = a.amount
for y in range(a.H):
    for x in range(a.W):
        if alpha[x, y] < 33:
            continue
        r, g, b = src[x, y]; br, bg, bb = bl[x, y]
        def c(v, bv):
            v2 = v + amt * (v - bv)
            return 0 if v2 < 0 else (255 if v2 > 255 else int(round(v2)))
        dst[x, y] = (c(r, br), c(g, bg), c(b, bb))

out = Image.merge('RGBA', (*sharp.split(), im.getchannel('A')))
open(a.out_raw, 'wb').write(out.tobytes())
out.save(a.out_raw + '.png')
print('锐化完成 amount=%.2f radius=%.2f → %s' % (a.amount, a.radius, a.out_raw))
