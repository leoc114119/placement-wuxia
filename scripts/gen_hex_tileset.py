#!/usr/bin/env python3
"""六边形战棋瓦片集生成（T16 拼贴贴图）——程序化绘制，几何精确。

规格（Leo 2026-09-03 试产改写：pointy-top，对齐 config/battle-hex.ts TILE_SPEC
与 ui/battle-hex-render.ts tilePath）：尖角朝上/朝下的压扁六边形（上下尖角、左右
竖直边），宽:高=1:0.7，底部深棕立体侧面（厚=顶面高×12%），草地/土路两种顶面材质
（布纹+颗粒+描边+上亮下暗），2×1 横排，轮廓逐像素一致，透明背景。
输出：瓦片集 + 单块×2 + 4×4 拼贴验证图 + 拼贴参数（试产期落 _trial 目录，不入库）。
"""
import math, random
from PIL import Image, ImageDraw

# ---- 规格（pointy-top，契约=config/battle-hex.ts TILE_SPEC）----
TILE_W = 88                           # 单瓦片宽（横向平边间距，TILE_SPEC.w）
SQUASH = 0.70                         # 纵向压扁系数（宽:高=1:0.7，TILE_SPEC.hRatio）
TOP_H = round(TILE_W * SQUASH)        # 顶面高 = 62（尖到尖）
SIDE = round(TOP_H * 0.12)            # 侧面厚 = 顶面高×12% → 7（TILE_SPEC.sideRatio）
TILE_H = TOP_H + SIDE                 # 总高 69
ROW_H = round(TOP_H * 0.75)           # 拼贴行距 = 46（TILE_SPEC.rowRatio）
HW, HH = TILE_W / 2, TOP_H / 2        # 半宽/半顶面高
CX, CY = HW, HH                       # 顶面中心（瓦片内）

# 尖顶六边形顶点角度（度）：右下/下尖/左下/左上/上尖/右上
# 注：x 半径需除以 cos30°，使左右竖直边落在 ±HW（宽恰为 TILE_W，与 tilePath 一致；
# 若直接用 HW·cos(30°) 参数化会得到 76.2px 宽，与代码契约"左右竖直边在 ±hw"冲突）
ANGLES = [math.radians(a) for a in (30, 90, 150, 210, 270, 330)]
RX = HW / math.cos(math.radians(30))  # 顶点 x 半径（竖直边贴 ±HW）

def hex_pts(cx, cy):
    return [(cx + RX * math.cos(a), cy + HH * math.sin(a)) for a in ANGLES]

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
    # 顶缘受光亮线（尖顶版：上尖两侧的两条上斜边）
    dd = ImageDraw.Draw(top)
    pts = hex_pts(CX, CY)
    dd.line([pts[3], pts[4]], fill=lerp(base_hi, (255,255,230), 0.35), width=2)
    dd.line([pts[4], pts[5]], fill=lerp(base_hi, (255,255,230), 0.2), width=2)
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
    # 侧面：下半轮廓（尖顶版：右下→下尖→左下，两条下斜边）挤出
    lower = [pts[0], pts[1], pts[2]]
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
    # 侧面顶缘暗线（顶/侧交界的转折感；尖顶版两条下斜边）
    dd = ImageDraw.Draw(tile)
    dd.line([pts[2], pts[1]], fill=(30, 22, 14), width=2)
    dd.line([pts[1], pts[0]], fill=(30, 22, 14), width=2)
    return tile

# ---- 生成 2×1 横排（试产输出落 _trial 隔离目录，不入库正式 tileset/）----
import os
OUT_DIR = 'assets/_trial_20260903/c08'
os.makedirs(OUT_DIR, exist_ok=True)
grass = make_tile('grass')
dirt = make_tile('dirt')
sheet = Image.new('RGBA', (TILE_W * 2, TILE_H), (0, 0, 0, 0))
sheet.paste(grass, (0, 0))
sheet.paste(dirt, (TILE_W, 0))
grass.save(f'{OUT_DIR}/hex_grass.png')       # 单块 grass
dirt.save(f'{OUT_DIR}/hex_dirt.png')         # 单块 dirt
sheet.save(f'{OUT_DIR}/hex_tiles_2x1.png')
print(f'tileset: {sheet.size}, 单块 {TILE_W}x{TILE_H}（顶面 {TOP_H}+侧面 {SIDE}），压扁比 1:{SQUASH}')

# ---- 4×4 拼贴验证图（契约拼贴算式：px=(col+奇行0.5)×TILE_W，py=row×ROW_H，hexToWorld 同源）----
COLS, ROWS = 4, 4
MARGIN = 10
board_w = MARGIN * 2 + int((COLS - 1 + 0.5) * TILE_W) + TILE_W
board_h = MARGIN * 2 + (ROWS - 1) * ROW_H + TILE_H
board = Image.new('RGBA', (board_w, board_h), (40, 34, 26))
r = 0
for row in range(ROWS):
    for col in range(COLS):
        cx = MARGIN + (col + (0.5 if row % 2 else 0)) * TILE_W   # 顶面中心 x
        cy = MARGIN + row * ROW_H                                # 顶面中心 y
        t = grass if (row + col) % 2 == 0 else dirt
        board.paste(t, (int(cx - HW), int(cy - TOP_H / 2)), t)
        r += 1
board.save(f'{OUT_DIR}/hex_tiles_preview_4x4.png')
print(f'拼贴验证: {board.size}（交错 {r} 块）')

# ---- 拼贴参数（供 T16 渲染；与 config/battle-hex.ts hexToWorld 一致）----
print(f'拼贴参数: 列步进 dx={TILE_W}px（整宽），行步进 dy={ROW_H}px（0.75×顶面高），奇数行偏移 {TILE_W // 2}px（半格）')
