#!/usr/bin/env python3
"""带单位人偶的三方案对比：平顶8×8 / 平顶7×7 / 尖顶5×8"""
import math

SQ3 = math.sqrt(3)

def hex_points_flat(cx, cy, s):
    return " ".join(f"{cx + s*math.cos(math.radians(60*k)):.1f},{cy - s*math.sin(math.radians(60*k)):.1f}" for k in range(6))

def hex_points_pointy(cx, cy, s):
    return " ".join(f"{cx + s*math.cos(math.radians(90+60*k)):.1f},{cy - s*math.sin(math.radians(90+60*k)):.1f}" for k in range(6))

def unit_sprite(svg, cx, cy, h, team):
    """溢出式人偶：脚锚定在格心，身体向上溢出格子。h=总高"""
    body = "#4299e1" if team == "b" else "#e53e3e"
    dark = "#2b6cb0" if team == "b" else "#c53030"
    # 脚下队伍色环
    svg.append(f'<ellipse cx="{cx}" cy="{cy+h*0.42:.0f}" rx="{h*0.26:.0f}" ry="{h*0.08:.0f}" fill="{dark}" opacity="0.55"/>')
    # 身体
    svg.append(f'<ellipse cx="{cx}" cy="{cy+h*0.12:.0f}" rx="{h*0.19:.0f}" ry="{h*0.3:.0f}" fill="{body}" stroke="{dark}" stroke-width="1.5"/>')
    # 头
    svg.append(f'<circle cx="{cx}" cy="{cy-h*0.3:.0f}" r="{h*0.16:.0f}" fill="#f6ad55" stroke="#9c4221" stroke-width="1.2"/>')
    # 头盔
    svg.append(f'<path d="M {cx-h*0.16:.0f} {cy-h*0.32:.0f} A {h*0.16:.0f} {h*0.16:.0f} 0 0 1 {cx+h*0.16:.0f} {cy-h*0.32:.0f}" fill="{dark}"/>')

def draw_phone(x0, title, screen_w=375, screen_h=667, hud_h=110, bar_h=130):
    o = [f'<text x="{x0 + screen_w/2}" y="38" text-anchor="middle" font-size="19" font-weight="bold" fill="#1a202c">{title}</text>',
         f'<rect x="{x0}" y="50" width="{screen_w}" height="{screen_h}" rx="24" fill="#ffffff" stroke="#2d3748" stroke-width="3"/>',
         f'<rect x="{x0+3}" y="53" width="{screen_w-6}" height="{hud_h}" rx="10" fill="#4a5568"/>',
         f'<text x="{x0+16}" y="{53+30}" font-size="13" fill="#e2e8f0">第 3 回合 · 行动点 6/8</text>']
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

def board(svg, x0, orient, s, cols, rows, units, screen_w=375, hud_h=110, bar_h=130):
    """orient: 'flat' 平顶 / 'pointy' 尖顶。返回 (格高, 选中格位置)"""
    if orient == "flat":
        dx = 1.5 * s; dy = SQ3 * s
        grid_w = s * (1.5 * cols + 0.5); grid_h = dy * (rows + 0.5)
    else:
        dx = SQ3 * s; dy = 1.5 * s
        grid_w = dx * (cols + 0.5); grid_h = s * (1.5 * rows + 0.5)
    ox = x0 + (screen_w - grid_w) / 2
    oy = 53 + hud_h + (667 - hud_h - bar_h - grid_h) / 2
    sel = None
    for r in range(rows):
        for q in range(cols):
            if orient == "flat":
                cx = ox + s + q*dx; cy = oy + dy/2 + r*dy + (q % 2) * dy/2
                pts = hex_points_flat(cx, cy, s - 0.8)
            else:
                cx = ox + dx/2 + q*dx + (r % 2) * dx/2; cy = oy + s + r*dy
                pts = hex_points_pointy(cx, cy, s - 0.8)
            fill, stroke = "#c6f6d5", "#2f855a"
            if (q, r) == (2, 3): fill, stroke = "#fbd38d", "#c05621"  # 选中
            elif (q, r) in [(1,3),(3,3),(1,4),(3,4),(2,4),(2,5)]: fill, stroke = "#faf089", "#d69e2e"
            svg.append(f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
            if (q, r) == (2, 3): sel = (cx, cy)
    # 人偶按 y 排序绘制（下方格子的人偶盖住上方的，正确遮挡）；只画棋盘范围内的
    for q, r, team in sorted((u for u in units if u[0] < cols and u[1] < rows), key=lambda u: (u[1], u[0])):
        if orient == "flat":
            cx = ox + s + q*dx; cy = oy + dy/2 + r*dy + (q % 2) * dy/2
        else:
            cx = ox + dx/2 + q*dx + (r % 2) * dx/2; cy = oy + s + r*dy
        unit_sprite(svg, cx, cy, s * UNIT_H[orient], team)
    return grid_h, sel

UNIT_H = {"flat": 2.25, "pointy": 2.2}  # 人偶高 = 边长倍数

svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1225" height="860" viewBox="0 0 1225 860" font-family="PingFang SC, Hiragino Sans GB, sans-serif">',
       '<rect width="1225" height="860" fill="#edf2f7"/>',
       '<text x="612" y="18" text-anchor="middle" font-size="14" fill="#4a5568">人偶上格效果对比（溢出绘制：脚在格心、身体向上越行）· 黄=移动范围 · 头身颜色=队伍</text>']

UNITS = [(0,1,"r"),(4,0,"b"),(3,2,"b"),(1,3,"r"),(4,4,"b"),(3,6,"r"),(2,3,"b"),(4,1,"r")]

svg.extend(draw_phone(25, "平顶 8×8 (s=27)"))
gh1, sel1 = board(svg, 25, "flat", 27, 8, 8, UNITS)
svg.extend(draw_phone(425, "平顶 7×7 (s=31)"))
gh2, sel2 = board(svg, 425, "flat", 31, 7, 7, UNITS)
svg.extend(draw_phone(825, "尖顶 5×8 (s=34)"))
gh3, sel3 = board(svg, 825, "pointy", 34, 5, 8, UNITS)

# 指腹参考圈（选中格）
for x_mid, sel in [(212, sel1), (612, sel2), (1012, sel3)]:
    cx, cy = sel
    svg.append(f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="22" fill="none" stroke="#e53e3e" stroke-width="2.5" stroke-dasharray="4,3"/>')

svg.append('<text x="212" y="738" text-anchor="middle" font-size="14" fill="#e53e3e">格 54×47pt · 人偶 61pt 勉强可辨</text>')
svg.append('<text x="612" y="738" text-anchor="middle" font-size="14" fill="#e53e3e">格 62×54pt · 人偶 70pt 清晰</text>')
svg.append('<text x="1012" y="738" text-anchor="middle" font-size="14" fill="#e53e3e">格 59×68pt · 人偶 75pt 最清晰</text>')

svg.append('<rect x="25" y="755" width="1175" height="85" rx="10" fill="#ffffff" stroke="#cbd5e0"/>')
svg.append('<text x="40" y="780" font-size="13" fill="#2d3748">平顶 8×8：点选达标，但人偶只有 61pt 高，脸部/武器细节难辨认，多人混战时遮挡严重</text>')
svg.append('<text x="40" y="800" font-size="13" fill="#2d3748">平顶 7×7：人偶 70pt，细节可读，7 列战术宽度尚可 —— 触控/人偶/宽度的折中点</text>')
svg.append('<text x="40" y="820" font-size="13" fill="#2d3748">尖顶 5×8：人偶最清晰，但 5 列走位受限，横向战术单调</text>')
svg.append('</svg>')

with open("design/ux/mockups/hexboard-units-mockup.svg", "w") as f:
    f.write("\n".join(svg))
print("SVG written")
