#!/usr/bin/env python3
"""8×8 六边形棋盘两种朝向对比示意图"""
import math

SQ3 = math.sqrt(3)

def hex_points_pointy(cx, cy, s):
    return " ".join(f"{cx + s*math.cos(math.radians(90+60*k)):.1f},{cy - s*math.sin(math.radians(90+60*k)):.1f}" for k in range(6))

def hex_points_flat(cx, cy, s):
    return " ".join(f"{cx + s*math.cos(math.radians(60*k)):.1f},{cy - s*math.sin(math.radians(60*k)):.1f}" for k in range(6))

def draw_phone(svg, x0, title, screen_w=375, screen_h=667, hud_h=110, bar_h=130):
    o = []
    o.append(f'<text x="{x0 + screen_w/2}" y="38" text-anchor="middle" font-size="20" font-weight="bold" fill="#1a202c">{title}</text>')
    o.append(f'<rect x="{x0}" y="50" width="{screen_w}" height="{screen_h}" rx="24" fill="#ffffff" stroke="#2d3748" stroke-width="3"/>')
    o.append(f'<rect x="{x0+3}" y="53" width="{screen_w-6}" height="{hud_h}" rx="10" fill="#4a5568"/>')
    o.append(f'<text x="{x0+16}" y="{53+30}" font-size="13" fill="#e2e8f0">第 3 回合 · 行动点 6/8</text>')
    for i in range(4):
        o.append(f'<rect x="{x0+16+i*34}" y="{53+42}" width="28" height="28" rx="6" fill="#718096"/>')
    o.append(f'<rect x="{x0+screen_w-60}" y="{53+42}" width="44" height="28" rx="6" fill="#718096"/>')
    bar_y = 50 + screen_h - bar_h - 3
    o.append(f'<rect x="{x0+3}" y="{bar_y}" width="{screen_w-6}" height="{bar_h}" rx="10" fill="#2d3748"/>')
    o.append(f'<rect x="{x0+16}" y="{bar_y+12}" width="52" height="52" rx="8" fill="#718096"/>')
    o.append(f'<text x="{x0+78}" y="{bar_y+32}" font-size="13" fill="#e2e8f0">剑士 · HP 24/30</text>')
    o.append(f'<text x="{x0+78}" y="{bar_y+52}" font-size="11" fill="#a0aec0">移动 3 · 攻击 5</text>')
    for i, b in enumerate(["移动", "攻击", "技能", "待命"]):
        bw = (screen_w - 32 - 24) / 4
        bx = x0 + 16 + i * (bw + 8)
        o.append(f'<rect x="{bx:.1f}" y="{bar_y+72}" width="{bw:.1f}" height="38" rx="8" fill="#4299e1"/>')
        o.append(f'<text x="{bx+bw/2:.1f}" y="{bar_y+96}" text-anchor="middle" font-size="14" fill="#ffffff">{b}</text>')
    return o

MOVE_CELLS = [(1,3),(2,3),(3,3),(1,4),(3,4),(1,5),(2,5),(3,5),(2,6)]

def board_pointy(svg, x0, s=23, cols=8, rows=8, screen_w=375, hud_h=110, bar_h=130):
    w = SQ3 * s; dx = w; dy = 1.5 * s
    grid_w = w * (cols + 0.5); grid_h = s * (1.5 * rows + 0.5)
    ox = x0 + (screen_w - grid_w) / 2
    oy = 53 + hud_h + (667 - hud_h - bar_h - grid_h) / 2
    for r in range(rows):
        for q in range(cols):
            cx = ox + w/2 + q*dx + (r % 2) * dx/2
            cy = oy + s + r*dy
            fill, stroke = "#c6f6d5", "#2f855a"
            if (q, r) == (4, 4): fill, stroke = "#f6ad55", "#c05621"
            elif (q, r) in MOVE_CELLS: fill, stroke = "#faf089", "#d69e2e"
            svg.append(f'<polygon points="{hex_points_pointy(cx, cy, s-0.8)}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
            if (q, r) == (4, 4):
                svg.append(f'<circle cx="{cx}" cy="{cy}" r="{s*0.42:.1f}" fill="#c05621"/>')
                selx, sely = cx, cy
    return grid_w, grid_h, ox, oy, selx, sely

def board_flat(svg, x0, s=27, cols=8, rows=8, screen_w=375, hud_h=110, bar_h=130):
    w = 2 * s; dx = 1.5 * s; dy = SQ3 * s
    grid_w = s * (1.5 * cols + 0.5); grid_h = dy * (rows + 0.5)
    ox = x0 + (screen_w - grid_w) / 2
    oy = 53 + hud_h + (667 - hud_h - bar_h - grid_h) / 2
    for r in range(rows):
        for q in range(cols):
            cx = ox + s + q*dx
            cy = oy + dy/2 + r*dy + (q % 2) * dy/2
            fill, stroke = "#c6f6d5", "#2f855a"
            if (q, r) == (4, 4): fill, stroke = "#f6ad55", "#c05621"
            elif (q, r) in MOVE_CELLS: fill, stroke = "#faf089", "#d69e2e"
            svg.append(f'<polygon points="{hex_points_flat(cx, cy, s-0.8)}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
            if (q, r) == (4, 4):
                svg.append(f'<circle cx="{cx}" cy="{cy}" r="{s*0.42:.1f}" fill="#c05621"/>')
                selx, sely = cx, cy
    return grid_w, grid_h, ox, oy, selx, sely

svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="850" viewBox="0 0 900 850" font-family="PingFang SC, Hiragino Sans GB, sans-serif">',
       '<rect width="900" height="850" fill="#edf2f7"/>',
       '<text x="450" y="24" text-anchor="middle" font-size="15" fill="#4a5568">8×8 六边形棋盘 · 两种朝向对比 · 基准 375×667pt · 黄=移动范围 橙=选中单位</text>']

svg.extend(draw_phone(svg, 45, "尖顶 8×8 (s=23)"))
gw1, gh1, ox1, oy1, selx1, sely1 = board_pointy(svg, 45)
svg.extend(draw_phone(svg, 480, "平顶 8×8 (s=27)"))
gw2, gh2, ox2, oy2, selx2, sely2 = board_flat(svg, 480)

# 指腹参考圈（落在选中单位所在格上）
svg.append(f'<circle cx="{selx1:.0f}" cy="{sely1:.0f}" r="22" fill="none" stroke="#e53e3e" stroke-width="2.5" stroke-dasharray="4,3"/>')
svg.append(f'<circle cx="{selx2:.0f}" cy="{sely2:.0f}" r="22" fill="none" stroke="#e53e3e" stroke-width="2.5" stroke-dasharray="4,3"/>')

# 每台手机下方的红色结论标注
svg.append('<text x="232" y="738" text-anchor="middle" font-size="14" fill="#e53e3e">格宽仅 40pt ✗ 低于 44pt 触控标准</text>')
svg.append('<text x="667" y="738" text-anchor="middle" font-size="14" fill="#e53e3e">格宽 54pt ✓ · 格高 47pt</text>')

svg.append('<rect x="45" y="755" width="810" height="80" rx="10" fill="#ffffff" stroke="#cbd5e0"/>')
svg.append('<text x="60" y="780" font-size="13" fill="#2d3748">尖顶 8×8：横向被宽度卡死，格子缩到 40pt，低于触控标准，点选困难（不推荐）</text>')
svg.append('<text x="60" y="800" font-size="13" fill="#2d3748">平顶 8×8：格宽 54pt 达标，横竖更均衡，8 列战术宽度好；格高 47pt 偏扁但可接受</text>')
svg.append('<text x="60" y="822" font-size="13" fill="#805ad5">红色虚线圆 = 指腹最小触控面（44pt）参考</text>')
svg.append('</svg>')

with open("design/ux/mockups/hexboard-8x8-mockup.svg", "w") as f:
    f.write("\n".join(svg))
print("SVG written")
