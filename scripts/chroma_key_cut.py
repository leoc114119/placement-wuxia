#!/usr/bin/env python3
"""品红底色键抠图（chroma key）——帧生成标准底色方案（2026-09-02，终结抠白战役）。

原理：全局色键（按颜色距离判定，与连通性无关）——闭白/封闭残留问题根除。
用法：
  python3 chroma_key_cut.py <品红底图> <输出RGBA> [--tol 90] [--spill]
  --tol  色键容差（到品红的色距阈值，默认 90）
  --spill 去溢出（边缘半透明品红偏色去除）
"""
import sys, math
from PIL import Image

MAGENTA = (255, 0, 255)

def dist_to_magenta(r, g, b):
    # 品红色距：r 高 b 高 g 低为近；用加权欧氏
    return math.sqrt((255 - r) ** 2 * 0.9 + g ** 2 * 1.4 + (255 - b) ** 2 * 0.9)

def key_cut(src_path, dst_path, tol=90, spill=False):
    im = Image.open(src_path).convert('RGB')
    W, H = im.size
    px = im.load()
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    op = out.load()
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            dist = dist_to_magenta(r, g, b)
            if dist < tol:
                continue  # 背景品红 → 透明
            a = 255
            if dist < tol + 40:  # 边缘过渡带 → 半透明
                a = int((dist - tol) / 40 * 255)
            if spill and a > 0 and dist < tol + 120:
                # 去溢出：压品红偏色（g 通道提及、rb 收敛）
                g2 = min(255, g + 18)
                op[x, y] = (r, g2, b, a)
            else:
                op[x, y] = (r, g, b, a)
    # 裁剪
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    out.save(dst_path)
    return out

if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--tol', type=int, default=90)
    ap.add_argument('--spill', action='store_true')
    a = ap.parse_args()
    out = key_cut(a.src, a.dst, a.tol, a.spill)
    print(f'OK {a.dst} {out.size}')
