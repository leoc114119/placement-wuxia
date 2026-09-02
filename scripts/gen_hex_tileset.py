#!/usr/bin/env python3
"""六边形战棋瓦片集生成（T16 拼贴贴图）——程序化绘制，几何精确。

规格（Leo 2026-09-02）：平顶六边形纵向压扁（宽:高≈1:0.63），底部深棕立体侧面
（厚≈总高13%），草地/土路两种顶面材质（布纹+颗粒+描边+上亮下暗），2×1 横排，
轮廓逐像素一致、可无缝拼贴，透明背景。
输出：瓦片集 + 单块 + 4×4 拼贴验证图 + 拼贴参数。
"""
import math, random
from PIL import Image, ImageDraw

# ---- 规格 ----
TILE_W = 256                          # 单瓦片宽（2s，s=半宽=128）
SQUASH = 0.63                         # 纵向压扁系数（宽:高=1:0.63）
TOP_H = round(TILE_W * SQUASH)        # 顶面高 = 161
SIDE = round(TOP_H * 0.13 / 0.87)     # 侧面厚 ≈ 总高13% → 24
TILE_H = TOP_H + SIDE                 # 总高 185
HW, HH = TILE_W / 2, TOP_H / 2        # 半宽/半顶面高
CX, CY = HW, HH                       # 顶面中心（瓦片内）

# 平顶六边形顶点角度（度）：右尖/右下/左下/左尖/左上/右上
ANGLES = [math.radians(a) for a in (0, 60, 120, 180, 240, 300)]

def hex_pts(cx, cy):
    return [(cx + HW * math.cos(a), cy + HH * math.sin(a)) for a in ANGLES]

def lerp(c1, c2, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))

# ---- 纹理（可平铺：周期取瓦片宽的约数）----
random.seed(42)
TEX_PERIOD = 32

def weave(x, y, base, amp):
    """布纹：横竖交织细线 + 像素噪点，周期化保证四方连续感"""
    w1 = 6 if (x % TEX_PERIOD) < TEX_PERIOD // 2 else -4
    w2 = 5 if (y % 12) < 6 else -5
    n = random.randint(-amp, amp)
    v = w1 + w2 + n
    return tuple(max(0, min(255, c + v)) for c in base)

def make_top(material):
    """顶面：底色+布纹+颗粒+受光渐变（上亮下暗）+描边"""
    top = Image.new('RGB', (TILE_W, TOP_H))
    tp = top.load()
    if material == 'grass':
        base_hi, base_lo, edge = (116, 148, 78), (96, 126, 62), (48, 62, 34)
    else:  # dirt
        base_hi, base_lo, edge = (178, 150, 100), (158, 130, 82), (82, 64, 40)
    for y in range(TOP_H):
        t = y / TOP_H
        base = lerp(base_hi, base_lo, t)          # 上亮下暗
        for x in range(TILE_W):
            tp[x, y] = weave(x, y, base, 7)
    # 颗粒（土路更明显）
    n_grain = 2600 if material == 'dirt' else 1500
    for _ in range(n_grain):
        x, y = random.randrange(TILE_W), random.randrange(TOP_H)
        c = lerp(base_hi, (0, 0, 0), random.uniform(0.15, 0.35)) if random.random() < 0.5 \
            else lerp(base_hi, (255, 255, 240), random.uniform(0.1, 0.3))
        tp[x, y] = c
    # 蒙版：六边形（内缩 2px 再描边）
    mask = Image.new('L', (TILE_W, TOP_H), 0)
    md = ImageDraw.Draw(mask)
    md.polygon(hex_pts(CX, CY), fill=255)
    # 描边：轮廓向内 3px 的边框（深色缝隙）
    inner = Image.new('L', (TILE_W, TOP_H), 0)
    idr = ImageDraw.Draw(inner)
    idr.polygon([(x + (CX - x) * 0.045, y + (CY - y) * 0.045) for x, y in hex_pts(CX, CY)], fill=255)
    edge_band = Image.composite(Image.new('L', mask.size, 0), mask, inner)  # mask-inner
    edge_band = Image.eval(edge_band, lambda v: 255 - v)
    overlay = Image.new('RGB', (TILE_W, TOP_H), edge)
    top.paste(overlay, (0, 0), edge_band)
    top.putalpha(mask)
    # 顶缘受光亮线（顶面上边两条水平边）
    dd = ImageDraw.Draw(top)
    pts = hex_pts(CX, CY)
    dd.line([pts[4], pts[5]], fill=lerp(base_hi, (255,255,230), 0.35), width=2)
    dd.line([pts[5], pts[0]], fill=lerp(base_hi, (255,255,230), 0.2), width=2)
    return top

def make_side(material):
    """侧面：深棕渐变（上深下更暗）+垂直细纹"""
    side = Image.new('RGB', (TILE_W, SIDE))
    sp = side.load()
    top_c, bot_c = ((70,52,34),(46,34,22)) if material=='grass' else ((78,60,40),(52,40,26))
    for y in range(SIDE):
        base = lerp(top_c, bot_c, y / SIDE)
        for x in range(TILE_W):
            v = random.randint(-5, 5) + (4 if (x % 16) < 8 else -3)
            sp[x, y] = tuple(max(0, min(255, c + v)) for c in base)
    return side

def make_tile(material):
    tile = Image.new('RGBA', (TILE_W, TILE_H), (0, 0, 0, 0))
    pts = hex_pts(CX, CY)
    # 侧面：下半轮廓（右尖→右下→左下→左尖）挤出
    lower = [pts[0], pts[1], pts[2], pts[3]]
    lower_bot = [(x, y + SIDE) for (x, y) in reversed(lower)]
    sd = ImageDraw.Draw(tile)
    sd.polygon(lower + lower_bot, fill=(0, 0, 0, 255))
    side_tex = make_side(material)
    side_layer = Image.new('RGBA', (TILE_W, TILE_H), (0, 0, 0, 0))
    side_layer.paste(side_tex, (0, round(HH)))
    smask = Image.new('L', (TILE_W, TILE_H), 0)
    ImageDraw.Draw(smask).polygon(lower + lower_bot, fill=255)
    tile.paste(side_layer, (0, 0), smask)
    # 顶面
    top = make_top(material)
    tile.paste(top, (0, 0), top)
    # 侧面顶缘暗线（顶/侧交界的转折感）
    dd = ImageDraw.Draw(tile)
    dd.line([pts[3], pts[2]], fill=(30, 22, 14), width=2)
    dd.line([pts[2], pts[1]], fill=(30, 22, 14), width=2)
    dd.line([pts[1], pts[0]], fill=(30, 22, 14), width=2)
    return tile

# ---- 生成 2×1 横排 ----
grass = make_tile('grass')
dirt = make_tile('dirt')
sheet = Image.new('RGBA', (TILE_W * 2, TILE_H), (0, 0, 0, 0))
sheet.paste(grass, (0, 0))
sheet.paste(dirt, (TILE_W, 0))
import os
os.makedirs('assets/ui/pixel/battle/tileset', exist_ok=True)
sheet.save('assets/ui/pixel/battle/tileset/hex_tiles.png')
print(f'tileset: {sheet.size}, 单块 {TILE_W}x{TILE_H}（顶面 {TOP_H}+侧面 {SIDE}），压扁比 1:{SQUASH}')

# ---- 4×4 拼贴验证图（无缝性检查）----
dx = TILE_W * 0.75          # 列间距 = 0.75 宽
dy = TOP_H                  # 行间距 = 顶面高（奇数行偏移半宽）
COLS, ROWS = 4, 4
board = Image.new('RGBA', (int(dx * COLS + TILE_W * 0.25) + 20, int(dy * (ROWS - 1) + TILE_H) + 20), (40, 34, 26))
bd = ImageDraw.Draw(board)
r = 0
for row in range(ROWS):
    for col in range(COLS + 1):
        cx = 10 + col * dx + (dx / 2 if row % 2 else 0)
        cy = 10 + row * dy
        t = grass if (row + col) % 2 == 0 else dirt
        board.paste(t, (int(cx - HW), int(cy - HH)), t)
        r += 1
board.save('assets/ui/pixel/battle/tileset/hex_tiles_preview.png')
print(f'拼贴验证: {board.size}（交错 {r} 块）')

# ---- 拼贴参数（供 T16 渲染）----
print(f'拼贴参数: 列步进 dx={dx:.0f}px（0.75宽），行步进 dy={dy}px（顶面高），奇数行偏移 {TILE_W//4}px（半宽/2）')
