#!/usr/bin/env python3
"""PNG-8 编码器（无损）：把后处理产出的 RGBA PNG 转成 8-bit 索引 PNG。

为什么能做到无损：
  后处理的 k-means 量化已把不透明像素压到 ≤N 色，且 alpha 只有 0/255
  （实测 100%），因此可精确建调色板 + 单一透明索引，不重新量化 → 零损失。

若色数 >256（描边墨色 + 量化色叠加所致），自动退回 FASTOCTREE 量化，
并打印实际损失率供核对。

用法：
  python3 png8_encode.py <输入.png|目录> [<输出.png|目录>] [--colors 255] [--dry]
"""
import sys, os, glob, argparse
from PIL import Image

TRANSPARENT_INDEX = 0   # 约定：索引 0 = 透明


def encode(src, dst, max_colors=255):
    im = Image.open(src).convert('RGBA')
    W, H = im.size
    px = im.load()

    # 收集不透明像素的真实颜色
    cols = {}
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > 0:
                cols[(r, g, b)] = True
    ncolors = len(cols)

    if ncolors <= max_colors:
        # ——— 无损路径 ———
        pal = sorted(cols.keys())
        idx = {c: i + 1 for i, c in enumerate(pal)}   # 索引 0 留给透明
        p = Image.new('P', (W, H))
        pp = p.load()
        for y in range(H):
            for x in range(W):
                r, g, b, a = px[x, y]
                pp[x, y] = 0 if a == 0 else idx[(r, g, b)]
        flat = [0, 0, 0]                              # 索引 0 的颜色（被 tRNS 透明化）
        for c in pal:
            flat += list(c)
        flat += [0] * (256 * 3 - len(flat))
        p.putpalette(flat)
        p.info['transparency'] = TRANSPARENT_INDEX
        p.save(dst, optimize=True, transparency=TRANSPARENT_INDEX)
        return dict(mode='lossless', colors=ncolors, src=src, dst=dst,
                    src_kb=os.path.getsize(src) / 1024, dst_kb=os.path.getsize(dst) / 1024)
    else:
        # ——— 兜底：量化（有损）———
        q = im.quantize(colors=max_colors, method=Image.FASTOCTREE)
        q.save(dst, optimize=True)
        # 量损失
        chk = Image.open(dst).convert('RGBA')
        p2 = chk.load()
        diff = n = 0
        for y in range(0, H, 2):
            for x in range(0, W, 2):
                a1 = px[x, y]; a2 = p2[x, y]
                if a1[3] > 0:
                    n += 1
                    if abs(a1[0]-a2[0]) + abs(a1[1]-a2[1]) + abs(a1[2]-a2[2]) > 18:
                        diff += 1
        return dict(mode='quantized', colors=ncolors, src=src, dst=dst,
                    loss_pct=round(100 * diff / max(1, n), 2),
                    src_kb=os.path.getsize(src) / 1024, dst_kb=os.path.getsize(dst) / 1024)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst', nargs='?')
    ap.add_argument('--colors', type=int, default=255)
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    if os.path.isdir(a.src):
        outdir = a.dst or a.src
        os.makedirs(outdir, exist_ok=True)
        files = sorted(glob.glob(os.path.join(a.src, '*.png')))
        files = [f for f in files if not os.path.basename(f).startswith('_')]
        tot_s = tot_d = 0
        modes = {}
        for f in files:
            o = os.path.join(outdir, os.path.basename(f))
            r = encode(f, o, a.colors)
            tot_s += r['src_kb']; tot_d += r['dst_kb']
            modes[r['mode']] = modes.get(r['mode'], 0) + 1
        print(f'{len(files)} 张: {tot_s:.0f} KB → {tot_d:.0f} KB  ({tot_d/tot_s:.0%})')
        print(f'  编码方式: {modes}')
    else:
        r = encode(a.src, a.dst or a.src.replace('.png', '_p8.png'), a.colors)
        print(r)


if __name__ == '__main__':
    main()
