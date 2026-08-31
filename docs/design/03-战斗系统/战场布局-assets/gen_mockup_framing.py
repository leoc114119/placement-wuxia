#!/usr/bin/env python3
"""自动取景相机三态示意：行动聚焦 / 交战同框 / 全局概览（12×12 地图）"""
import math

SQ3 = math.sqrt(3)

def hex_flat_pts(cx, cy, s):
    return " ".join(f"{cx + s*math.cos(math.radians(60*k)):.1f},{cy - s*math.sin(math.radians(60*k)):.1f}" for k in range(6))

def unit_sprite(svg, cx, cy, h, team, role=""):
    body = "#2b6cb0" if team == "b" else "#c53030"
    light = "#4299e1" if team == "b" else "#e53e3e"
    svg.append(f'<ellipse cx="{cx}" cy="{cy+h*0.42:.0f}" rx="{h*0.26:.0f}" ry="{h*0.08:.0f}" fill="{body}" opacity="0.55"/>')
    svg.append(f'<ellipse cx="{cx}" cy="{cy+h*0.12:.0f}" rx="{h*0.19:.0f}" ry="{h*0.3:.0f}" fill="{light}" stroke="{body}" stroke-width="1.5"/>')
    svg.append(f'<circle cx="{cx}" cy="{cy-h*0.3:.0f}" r="{h*0.16:.0f}" fill="#f6ad55" stroke="#9c4221" stroke-width="1.2"/>')
    svg.append(f'<path d="M {cx-h*0.16:.0f} {cy-h*0.32:.0f} A {h*0.16:.0f} {h*0.16:.0f} 0 0 1 {cx+h*0.16:.0f} {cy-h*0.32:.0f}" fill="{body}"/>')
    if role:
        svg.append(f'<text x="{cx}" y="{cy+h*0.17:.0f}" text-anchor="middle" font-size="{h*0.2:.0f}" fill="#ffffff" font-weight="bold">{role}</text>')

BOARD_X, BOARD_Y, BOARD_W, BOARD_H = 16, 163, 343, 427

def draw_phone(x0, title, pid):
    o = [f'<text x="{x0 + 187}" y="40" text-anchor="middle" font-size="18" font-weight="bold" fill="#1a202c">{title}</text>',
         f'<rect x="{x0}" y="50" width="375" height="667" rx="24" fill="#ffffff" stroke="#2d3748" stroke-width="3"/>',
         f'<rect x="{x0+3}" y="53" width="369" height="110" rx="10" fill="#4a5568"/>',
         f'<clipPath id="b{pid}"><rect x="{x0+BOARD_X}" y="{BOARD_Y}" width="{BOARD_W}" height="{BOARD_H}"/></clipPath>']
    bar_y = 50 + 667 - 130 - 3
    o.append(f'<rect x="{x0+3}" y="{bar_y}" width="369" height="130" rx="10" fill="#2d3748"/>')
    o.append(f'<rect x="{x0+16}" y="{bar_y+12}" width="52" height="52" rx="8" fill="#718096"/>')
    o.append(f'<text x="{x0+78}" y="{bar_y+32}" font-size="13" fill="#e2e8f0">剑士 · HP 24/30</text>')
    for i, b in enumerate(["移动", "攻击", "技能", "待命"]):
        bw = (375 - 32 - 24) / 4
        bx = x0 + 16 + i * (bw + 8)
        o.append(f'<rect x="{bx:.1f}" y="{bar_y+72}" width="{bw:.1f}" height="38" rx="8" fill="#4299e1"/>')
        o.append(f'<text x="{bx+bw/2:.1f}" y="{bar_y+96}" text-anchor="middle" font-size="14" fill="#ffffff">{b}</text>')
    return o

def draw_scene(svg, x0, pid, s, cols, rows, units, cam, focus_pairs=None, move_range=None):
    dx = 1.5 * s; dy = SQ3 * s
    map_x = x0 + BOARD_X + BOARD_W / 2 - cam[0] * dx - s
    map_y = BOARD_Y + BOARD_H / 2 - (cam[1] + 0.5) * dy
    def pos(q, r):
        return map_x + s + q * dx, map_y + dy / 2 + r * dy + (q % 2) * dy / 2
    svg.append(f'<g clip-path="url(#b{pid})">')
    for r in range(rows):
        for q in range(cols):
            cx, cy = pos(q, r)
            if not (x0 + BOARD_X - 80 < cx < x0 + BOARD_X + BOARD_W + 80 and BOARD_Y - 80 < cy < BOARD_Y + BOARD_H + 80):
                continue
            fill, stroke = "#c6f6d5", "#2f855a"
            if move_range and (q, r) in move_range: fill, stroke = "#faf089", "#d69e2e"
            svg.append(f'<polygon points="{hex_flat_pts(cx, cy, s-0.6)}" fill="{fill}" stroke="{stroke}" stroke-width="1"/>')
    if move_range:
        for q, r in move_range:
            cx, cy = pos(q, r)
            svg.append(f'<polygon points="{hex_flat_pts(cx, cy, s*0.4)}" fill="#d69e2e" opacity="0.5"/>')
    for q, r, team, role in sorted(units, key=lambda u: (u[1], u[0])):
        cx, cy = pos(q, r)
        unit_sprite(svg, cx, cy, s * 2.25, team, role)
    svg.append('</g>')
    if focus_pairs:
        pts = []
        for q, r in focus_pairs:
            cx, cy = pos(q, r)
            pts.append((cx, cy))
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        pad = s * 1.6
        svg.append(f'<rect x="{min(xs)-pad:.0f}" y="{min(ys)-pad:.0f}" width="{max(xs)-min(xs)+2*pad:.0f}" height="{max(ys)-min(ys)+2*pad:.0f}" fill="none" stroke="#e53e3e" stroke-width="2.5" stroke-dasharray="7,5" rx="10"/>')

svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1350" height="870" viewBox="0 0 1350 870" font-family="PingFang SC, Hiragino Sans GB, sans-serif">',
       '<rect width="1350" height="870" fill="#edf2f7"/>',
       '<text x="675" y="18" text-anchor="middle" font-size="14" fill="#4a5568">自动取景三态（12×12 地图）· 红虚线=本次必须同框的单位组 · 黄=行动单位移动范围</text>']

UNITS_ALL = [(5,6,"b","剑"),(4,7,"b","弓"),(6,8,"b","牧"),(2,9,"b","枪"),(8,9,"b","法"),
             (5,4,"r","盾"),(7,5,"r","枪"),(9,3,"r","弓"),(3,2,"r","法"),(10,2,"r","盾")]

# ① 行动聚焦：s=31 战术档，镜头=行动单位，必须同框=行动单位+移动范围+贴脸敌人
svg.extend(draw_phone(25, "① 行动聚焦（默认）", 1))
draw_scene(svg, 25, 1, 31, 12, 12, UNITS_ALL, (5, 6),
           focus_pairs=[(5,6),(5,4),(4,6),(6,6),(4,7),(6,7)],
           move_range=[(5,6),(4,6),(6,6),(4,7),(6,7),(5,5),(5,7),(3,6)])

# ② 交战同框：s=24 中档，取攻击者与目标中点
svg.extend(draw_phone(487, "② 选定远程目标", 2))
draw_scene(svg, 487, 2, 24, 12, 12, UNITS_ALL, (6.5, 5), focus_pairs=[(4,7),(9,3)])

# ③ 全局概览：s=16 概览档，全图阵型尽收眼底
svg.extend(draw_phone(949, "③ 全局概览（双指缩小）", 3))
draw_scene(svg, 949, 3, 16, 12, 12, UNITS_ALL, (5.5, 5.5))

svg.append('<text x="212" y="745" text-anchor="middle" font-size="13.5" fill="#e53e3e">s=31 · 框住「行动单位+可走格+邻敌」</text>')
svg.append('<text x="674" y="745" text-anchor="middle" font-size="13.5" fill="#e53e3e">s=24 · 框住「攻击者+目标」，镜头取中点</text>')
svg.append('<text x="1136" y="745" text-anchor="middle" font-size="13.5" fill="#e53e3e">s=16 · 全图阵型一览，格子缩小但仍可辨识</text>')

svg.append('<rect x="25" y="770" width="1300" height="88" rx="10" fill="#ffffff" stroke="#cbd5e0"/>')
svg.append('<text x="40" y="795" font-size="13" fill="#2d3748">取景算法：对「必须同框组」求包围盒 → 战术档(s31)装得下就居中；装不下降中档(s24)；再不行降概览档(s16)。三档封顶，绝不无限缩</text>')
svg.append('<text x="40" y="817" font-size="13" fill="#2d3748">同框组的定义随场景切换：行动时=行动单位+移动范围+射程内敌人；选目标时=攻守双方+弹道；回合回放时=本回合交战双方</text>')
svg.append('<text x="40" y="839" font-size="13" fill="#2d3748">镜头主权：玩家手动拖动后，本回合内自动取景只提示不抢镜头（小地图闪烁 + 定位按钮），点按或回合结束恢复自动</text>')
svg.append('</svg>')

with open("design/ux/mockups/camera-framing-mockup.svg", "w") as f:
    f.write("\n".join(svg))
print("SVG written")
