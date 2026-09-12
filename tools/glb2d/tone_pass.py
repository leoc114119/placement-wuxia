#!/usr/bin/env python3
"""影调通道（对比 + 饱和）—— 让 3D→2D 帧在**小屏实际尺寸**下读得更清楚。

来源：Leo 2026-09-12 目视裁定 —— 对比 +50% / 饱和 +25% 那一档「明显更好」
      （原话「恩，对，右边的好多了」；此前锐化档位他看不出差别）。

为什么要单独一步、且**必须在后处理量化之前**：
  对比/饱和会把颜色推向两端 → 产生新颜色；放在 256 色量化之后会让 PNG-8 退化成有损（同 AO 那个坑）。

公式：
  对比：v' = clamp((v/255 − 0.5) × k × 255 + 127.5)
  饱和：以亮度 l = 0.299R+0.587G+0.114B 为中心外扩：v' = clamp(l + (v − l) × s)
  只作用在实体像素（alpha>32）；alpha 原样保留。

用法：
  python3 tools/glb2d/tone_pass.py <in.raw> <out.raw> <W> <H> [--contrast 1.5] [--saturation 1.25]
"""
import argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('in_raw'); ap.add_argument('out_raw')
ap.add_argument('W', type=int); ap.add_argument('H', type=int)
ap.add_argument('--contrast', type=float, default=1.5,
                help='对比倍数（Leo 09-12 选定 1.5 = +50%%；1.0 = 不动）')
ap.add_argument('--red', type=float, default=0.0,
                help='加红：R 增 + G 减（真正压掉发黄；只动 R/B 压不掉黄，因为黄=R+G 都高）')
ap.add_argument('--red-scope', default='warm', choices=['warm','all'],
                help='warm=只对暖色像素(r>=g)生效，保住袍子青绿；all=全局')
ap.add_argument('--temperature', type=float, default=0.0,
                help='色温补偿：>0 变冷（R 减、B 加），用于压掉整体偏黄')
ap.add_argument('--brightness', type=float, default=0.0,
                help='亮度补偿（加性，0~40；对比会把中间调压暗，用它补回来）')
ap.add_argument('--saturation', type=float, default=1.25,
                help='饱和倍数（Leo 09-12 选定 1.25 = +25%%；1.0 = 不动）')
a = ap.parse_args()

im = Image.frombytes('RGBA', (a.W, a.H), open(a.in_raw, 'rb').read())
px = im.load()
k, s, br, tp = a.contrast, a.saturation, a.brightness, a.temperature
rd, rdscope = a.red, a.red_scope
cl = lambda v: 0 if v < 0 else (255 if v > 255 else int(v + 0.5))

for y in range(a.H):
    for x in range(a.W):
        r, g, b, al = px[x, y]
        if al < 33:
            continue
        if k != 1.0:
            r, g, b = [cl((v/255.0 - 0.5)*k*255 + 127.5) for v in (r, g, b)]
        if s != 1.0:
            l = r*0.299 + g*0.587 + b*0.114
            r, g, b = [cl(l + (v - l)*s) for v in (r, g, b)]
        if br != 0.0:                       # 亮度补偿：对比把中间调压暗了，这里补回来
            r, g, b = [cl(v + br) for v in (r, g, b)]
        if tp != 0.0:                       # 色温：R 减 / B 加 = 变冷
            r, b = cl(r - tp), cl(b + tp)
        if rd != 0.0 and (rdscope == 'all' or r >= g - 8):
            # 加红：R 上去 + G 下来 —— 这才是压「发黄」的正解（黄 = R、G 都高）
            r, g = cl(r + rd), cl(g - rd*0.6)
        px[x, y] = (r, g, b, al)

open(a.out_raw, 'wb').write(im.tobytes())
im.save(a.out_raw + '.png')
print('影调完成 contrast=%.2f sat=%.2f bright=%.1f temp=%.1f red=%.1f(%s) → %s' % (k, s, br, tp, rd, rdscope, a.out_raw))
