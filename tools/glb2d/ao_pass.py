#!/usr/bin/env python3
"""AO 通道（环境光遮蔽）—— 给平涂帧补纵深，压掉"纸片人感"。

来源：Leo 2026-09-12 目视裁定 —— 加了 AO 之后"立起来一些"；
      **边缘光被否**（"太丑了"），**只上 AO**；强度选**轻档 0.22**。

原理：用渲染器已经产出的**深度缓冲**做屏幕空间 AO ——
      某像素的深度明显**比环形邻域更远**（z 越大越远），说明它处在凹处（腋下/衣褶/领口）→ 按凹陷程度压暗。
      只动凹处，平面的明暗关系不变，所以观感"安静"。

为什么放在后处理之后（而不是改渲染器）：AO 只需要深度缓冲，是纯 2D 操作；
分离成一步的好处是**可以随时开关/调强度**，且不碰渲染与后处理两条主链。

用法：
  python3 tools/glb2d/ao_pass.py <in.raw> <in.depth> <out.raw> <W> <H> [--strength 0.22] [--radius 6]
  # 入参 in.raw 必须是 postprocess 输出的 240×320 RGBA；in.depth 是 downsample 输出的 1× 深度

产出：同尺寸 RGBA（alpha 原样保留），随后照常走 png8_encode.py
"""
import sys, os, struct, argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('in_raw'); ap.add_argument('in_depth'); ap.add_argument('out_raw')
ap.add_argument('W', type=int); ap.add_argument('H', type=int)
ap.add_argument('--strength', type=float, default=0.22,
                help='AO 强度（Leo 09-12 选定轻档 0.22；0=关）')
ap.add_argument('--radius', type=int, default=6, help='邻域半径（px）')
ap.add_argument('--gain', type=float, default=60.0, help='深度差的响应斜率（越大越敏感）')
a = ap.parse_args()

W, H = a.W, a.H
rgba = open(a.in_raw, 'rb').read()
assert len(rgba) == W*H*4, 'in.raw 尺寸不对：%d != %d' % (len(rgba), W*H*4)
db = open(a.in_depth, 'rb').read()
assert len(db) >= W*H*4, 'in.depth 尺寸不对'
depth = struct.unpack('<%df' % (W*H), db[:W*H*4])

out = bytearray(rgba)
R = a.radius
OFF = ((-R,0),(R,0),(0,-R),(0,R),(-R,-R),(R,-R),(-R,R),(R,R))
for y in range(H):
    for x in range(W):
        i = y*W + x
        if rgba[i*4+3] < 33:            # 与门检同口径：alpha>32 才算实体
            continue
        s = 0.0; n = 0
        for dx, dy in OFF:
            xx, yy = x+dx, y+dy
            if 0 <= xx < W and 0 <= yy < H:
                j = yy*W + xx
                if rgba[j*4+3] > 32:
                    s += depth[j]; n += 1
        if not n:
            continue
        d = depth[i] - s/n              # >0 = 自己比周围远 = 凹
        f = 1.0 - a.strength * min(1.0, max(0.0, d*a.gain))
        if f >= 0.999:
            continue
        out[i*4]   = int(rgba[i*4]   * f)
        out[i*4+1] = int(rgba[i*4+1] * f)
        out[i*4+2] = int(rgba[i*4+2] * f)

open(a.out_raw, 'wb').write(bytes(out))
Image.frombytes('RGBA', (W, H), bytes(out)).save(a.out_raw + '.png')
print('AO 完成 strength=%.2f radius=%d → %s' % (a.strength, R, a.out_raw))
