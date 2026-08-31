#!/usr/bin/env python3
"""方形 vs 六边形：武器攻击范围的形状对比（7×8 方形 / 7×7 平顶六边形）"""
import math

SQ3 = math.sqrt(3)

def hex_flat_pts(cx, cy, s):
    return " ".join(f"{cx + s*math.cos(math.radians(60*k)):.1f},{cy - s*math.sin(math.radians(60*k)):.1f}" for k in range(6))

def unit_sprite(svg, cx, cy, h, team, role):
    body = "#2b6cb0" if team == "b" else "#c53030"
    light = "#4299e1" if team == "b" else "#e53e3e"
    svg.append(f'<ellipse cx="{cx}" cy="{cy+h*0.42:.0f}" rx="{h*0.26:.0f}" ry="{h*0.08:.0f}" fill="{body}" opacity="0.55"/>')
    svg.append(f'<ellipse cx="{cx}" cy="{cy+h*0.12:.0f}" rx="{h*0.19:.0f}" ry="{h*0.3:.0f}" fill="{light}" stroke="{body}" stroke-width="1.5"/>')
    svg.append(f'<circle cx="{cx}" cy="{cy-h*0.3:.0f}" r="{h*0.16:.0f}" fill="#f6ad55" stroke="#9c4221" stroke-width="1.2"/>')
    svg.append(f'<path d="M {cx-h*0.16:.0f} {cy-h*0.32:.0f} A {h*0.16:.0f} {h*0.16:.0f} 0 0 1 {cx+h*0.16:.0f} {cy-h*0.32:.0f}" fill="{body}"/>')
    svg.append(f'<text x="{cx}" y="{cy+h*0.17:.0f}" text-anchor="middle" font-size="{h*0.2:.0f}" fill="#ffffff" font-weight="bold">{role}</text>')

def draw_phone(x0, title):
    o = [f'<text x="{x0 + 187}" y="40" text-anchor="middle" font-size="19" font-weight="bold" fill="#1a202c">{title}</text>',
         f'<rect x="{x0}" y="50" width="375" height="667" rx="24" fill="#ffffff" stroke="#2d3748" stroke-width="3"/>',
         f'<rect x="{x0+3}" y="53" width="369" height="110" rx="10" fill="#4a5568"/>',
         f'<text x="{x0+16}" y="83" font-size="13" fill="#e2e8f0">第 2 回合 · 蓝色=近战(1格) 橙色=弓(2~3格)</text>']
    bar_y = 50 + 667 - 130 - 3
    o.append(f'<rect x="{x0+3}" y="{bar_y}" width="369" height="130" rx="10" fill="#2d3748"/>')
    o.append(f'<rect x="{x0+16}" y="{bar_y+12}" width="52" height="52" rx="8" fill="#718096"/>')
    o.append(f'<text x="{x0+78}" y="{bar_y+32}" font-size="13" fill="#e2e8f0">弓手 · HP 18/22</text>')
    o.append(f'<text x="{x0+78}" y="{bar_y+52}" font-size="11" fill="#a0aec0">射程 2~3 · 攻击 7</text>')
    return o

def phone_layout(svg, x0, cell_drawer, cols, rows, board_w, board_h, units, ranges):
    """ranges: list of (col,row,type) type: 'm1' 蓝 / 'r23' 橙"""
    ox = x0 + (375 - board_w) / 2
    oy = 53 + 110 + (667 - 110 - 130 - board_h) / 2
    for r in range(rows):
        for q in range(cols):
            cx, cy = cell_drawer(q, r)
            fill, stroke = "#c6f6d5", "#2f855a"
            if r <= 1: fill, stroke = "#fed7d7", "#e53e3e"
            elif r >= rows - 2: fill, stroke = "#bee3f8", "#2b6cb0"
            svg.append(f'<polygon points="{cell_drawer(q, r, True)}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>' if False else "")
    # 两遍绘制：先画所有格子与范围，再画人偶
    cells, overlays = [], []
    for r in range(rows):
        for q in range(cols):
            key = (q, r)
            fill, stroke = "#c6f6d5", "#2f855a"
            if r <= 1: fill, stroke = "#fed7d7", "#e53e3e"
            elif r >= rows - 2: fill, stroke = "#bee3f8", "#2b6cb0"
            cells.append((key, fill, stroke))
    for q, r, t in ranges:
        pass
    # 格子
    for key, fill, stroke in cells:
        q, r = key
        if (q, r) in [(qq, rr) for qq, rr, _ in ranges]:
            continue
        svg.append(f'<polygon points="{cell_drawer(q, r, True)}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
    # 范围高亮
    for q, r, t in ranges:
        fill = "#90cdf4" if t == "m1" else "#f6ad55"
        stroke = "#2b6cb0" if t == "m1" else "#c05621"
        svg.append(f'<polygon points="{cell_drawer(q, r, True)}" fill="{fill}" stroke="{stroke}" stroke-width="1.4"/>')
    # 人偶
    for q, r, team, role in sorted(units, key=lambda u: (u[1], u[0])):
        cx, cy = cell_drawer(q, r)
        unit_sprite(svg, cx, cy, UNIT_H, team, role)
    return ox, oy

UNIT_H = 70

# ---------- 方形 7×8 ----------
SQ_CELL, SQ_COLS, SQ_ROWS = 49, 7, 8
def sq_drawer_factory(x0):
    bw, bh = SQ_CELL * SQ_COLS, SQ_CELL * SQ_ROWS
    ox = x0 + (375 - bw) / 2
    oy = 53 + 110 + (667 - 110 - 130 - bh) / 2
    def drawer(q, r, poly=False):
        cx = ox + q * SQ_CELL + SQ_CELL / 2
        cy = oy + r * SQ_CELL + SQ_CELL / 2
        if poly:
            return f"{cx-SQ_CELL/2+1:.1f},{cy-SQ_CELL/2+1:.1f} {cx+SQ_CELL/2-1:.1f},{cy-SQ_CELL/2+1:.1f} {cx+SQ_CELL/2-1:.1f},{cy+SQ_CELL/2-1:.1f} {cx-SQ_CELL/2+1:.1f},{cy+SQ_CELL/2-1:.1f}"
        return cx, cy
    return drawer

# 方形：曼哈顿距离
def sq_range(cq, cr, lo, hi):
    out = []
    for r in range(SQ_ROWS):
        for q in range(SQ_COLS):
            d = abs(q - cq) + abs(r - cr)
            if lo <= d <= hi: out.append((q, r, "r23" if hi > 1 else "m1"))
    return out

# ---------- 六边形 7×7 ----------
HX_S, HX_COLS, HX_ROWS = 31, 7, 7
def hx_drawer_factory(x0):
    dx = 1.5 * HX_S; dy = SQ3 * HX_S
    bw = HX_S * (1.5 * HX_COLS + 0.5); bh = dy * (HX_ROWS + 0.5)
    ox = x0 + (375 - bw) / 2
    oy = 53 + 110 + (667 - 110 - 130 - bh) / 2
    def drawer(q, r, poly=False):
        cx = ox + HX_S + q * dx
        cy = oy + dy / 2 + r * dy + (q % 2) * dy / 2
        if poly:
            return hex_flat_pts(cx, cy, HX_S - 0.8)
        return cx, cy
    return drawer

def hx_cube(q, r):
    return q, r - (q - (q & 1)) // 2

def hx_range(cq, cr, lo, hi):
    cqq, crr = hx_cube(cq, cr)
    out = []
    for r in range(HX_ROWS):
        for q in range(HX_COLS):
            qq, rr = hx_cube(q, r)
            d = (abs(qq - cqq) + abs(rr - crr) + abs(qq + rr - cqq - crr)) // 2
            if lo <= d <= hi: out.append((q, r, "r23" if hi > 1 else "m1"))
    return out

svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="870" viewBox="0 0 900 870" font-family="PingFang SC, Hiragino Sans GB, sans-serif">',
       '<rect width="900" height="870" fill="#edf2f7"/>',
       '<text x="450" y="18" text-anchor="middle" font-size="14" fill="#4a5568">攻击范围形状对比 · 红区=敌方 蓝区=我方部署区 · 蓝格=近战射程1 橙格=弓射程2~3</text>']

UNITS_SQ = [(2,5,"b","剑"),(3,6,"b","弓"),(5,6,"b","法"),(2,1,"r","盾"),(4,1,"r","枪"),(3,0,"r","弓")]
UNITS_HX = [(2,5,"b","剑"),(3,6,"b","弓"),(5,6,"b","法"),(2,1,"r","盾"),(4,1,"r","枪"),(3,0,"r","弓")]

svg.extend(draw_phone(25, "方形 7×8 (格 49pt)"))
d1 = sq_drawer_factory(25)
ranges1 = sq_range(2, 5, 1, 1) + sq_range(3, 6, 2, 3)
phone_layout(svg, 25, d1, SQ_COLS, SQ_ROWS, SQ_CELL*SQ_COLS, SQ_CELL*SQ_ROWS, UNITS_SQ, ranges1)

svg.extend(draw_phone(480, "平顶六边形 7×7 (s=31)"))
d2 = hx_drawer_factory(480)
ranges2 = hx_range(2, 5, 1, 1) + hx_range(3, 6, 2, 3)
phone_layout(svg, 480, d2, HX_COLS, HX_ROWS, HX_S*(1.5*HX_COLS+0.5), SQ3*HX_S*(HX_ROWS+0.5), UNITS_HX, ranges2)

svg.append('<text x="212" y="745" text-anchor="middle" font-size="14" fill="#e53e3e">菱形射程环 · 横列/纵列直观，上手零门槛</text>')
svg.append('<text x="667" y="745" text-anchor="middle" font-size="14" fill="#e53e3e">六边形射程环 · 6 向均匀，无斜角歧义，但数格略烧脑</text>')

svg.append('<rect x="25" y="765" width="850" height="90" rx="10" fill="#ffffff" stroke="#cbd5e0"/>')
svg.append('<text x="40" y="790" font-size="13" fill="#2d3748">方形：射程/直线弹道/横排站位都符合直觉（火焰纹章式）；代价 = 必须裁决"斜向"：斜邻算 1 格还是 2 格？移动走不走斜线？</text>')
svg.append('<text x="40" y="812" font-size="13" fill="#2d3748">推荐裁决：移动 4 向（不走斜线）+ 攻击按曼哈顿距离（斜角=2格）→ 规则完全无歧义，就是你说的"更好设置"</text>')
svg.append('<text x="40" y="834" font-size="13" fill="#2d3748">六边形：规则天然无斜角问题、包围走位更顺滑，但玩家数射程的心智负担略高，且放弃了你最初想要的"六边形美感"</text>')
svg.append('</svg>')

with open("design/ux/mockups/grid-square-vs-hex.svg", "w") as f:
    f.write("\n".join(svg))
print("SVG written")
