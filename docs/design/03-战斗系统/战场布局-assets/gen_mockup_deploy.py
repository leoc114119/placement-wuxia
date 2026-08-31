#!/usr/bin/env python3
"""5v5 部署站位对比：两排纵深 vs 三排自由"""
import math

SQ3 = math.sqrt(3)
S_FLAT, ROWS, COLS, SS = 31, 7, 7, 31  # 平顶 7×7 s=31

def hex_flat(cx, cy, s):
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
         f'<text x="{x0+16}" y="83" font-size="13" fill="#e2e8f0">第 1 回合 · 部署阶段</text>']
    bar_y = 50 + 667 - 130 - 3
    o.append(f'<rect x="{x0+3}" y="{bar_y}" width="369" height="130" rx="10" fill="#2d3748"/>')
    o.append(f'<text x="{x0+187}" y="{bar_y+40}" text-anchor="middle" font-size="14" fill="#e2e8f0">拖动棋子调整站位 / 点队伍预设一键布阵</text>')
    return o

def board(svg, x0, player_units):
    s, cols, rows = S_FLAT, COLS, ROWS
    dx = 1.5 * s; dy = SQ3 * s
    grid_w = s * (1.5 * cols + 0.5); grid_h = dy * (rows + 0.5)
    ox = x0 + (375 - grid_w) / 2
    oy = 53 + 110 + (667 - 110 - 130 - grid_h) / 2
    for r in range(rows):
        for q in range(cols):
            cx = ox + s + q*dx; cy = oy + dy/2 + r*dy + (q % 2) * dy/2
            fill, stroke = "#c6f6d5", "#2f855a"
            if r <= 1: fill, stroke = "#fed7d7", "#e53e3e"        # 敌方部署区
            elif r >= 5: fill, stroke = "#bee3f8", "#2b6cb0"      # 我方部署区
            if (q, r) == (3, 3): fill, stroke = "#fefcbf", "#d69e2e"  # 中央争夺点
            svg.append(f'<polygon points="{hex_flat(cx, cy, s-0.8)}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
            if (q, r) == (3, 3):
                svg.append(f'<text x="{cx}" y="{cy+5}" text-anchor="middle" font-size="16" fill="#b7791f">★</text>')
    for q, r, team, role in sorted(player_units, key=lambda u: (u[1], u[0])):
        cx = ox + s + q*dx; cy = oy + dy/2 + r*dy + (q % 2) * dy/2
        unit_sprite(svg, cx, cy, s * 2.25, team, role)
    return grid_h

svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="870" viewBox="0 0 900 870" font-family="PingFang SC, Hiragino Sans GB, sans-serif">',
       '<rect width="900" height="870" fill="#edf2f7"/>',
       '<text x="450" y="18" text-anchor="middle" font-size="14" fill="#4a5568">5v5 部署站位对比 · 平顶 7×7 (s=31) · 红区=敌方部署区 蓝区=我方部署区 ★=中央争夺点</text>']

# 方案一：两排纵深（2 前排 + 3 后排）
ENEMY = [(2,1,"r","盾"),(4,1,"r","枪"),(1,0,"r","弓"),(3,0,"r","法"),(5,0,"r","弓")]
P1 = [(2,5,"b","盾"),(4,5,"b","枪"),(1,6,"b","弓"),(3,6,"b","牧"),(5,6,"b","法")]
svg.extend(draw_phone(25, "两排纵深（2 前 + 3 后）"))
board(svg, 25, ENEMY + P1)

# 方案二：三排自由部署
P2 = [(3,4,"b","盾"),(4,5,"b","枪"),(2,5,"b","弓"),(1,6,"b","牧"),(5,6,"b","法")]
svg.extend(draw_phone(480, "三排自由部署（可前压）"))
board(svg, 480, ENEMY + P2)

svg.append('<text x="212" y="745" text-anchor="middle" font-size="14" fill="#e53e3e">结构稳定，前后排职责清晰；中路 3 行缓冲，第 2 回合接触</text>')
svg.append('<text x="667" y="745" text-anchor="middle" font-size="14" fill="#e53e3e">站位更灵活、抢★更快；但新手容易摆出漏洞阵</text>')

svg.append('<rect x="25" y="765" width="850" height="90" rx="10" fill="#ffffff" stroke="#cbd5e0"/>')
svg.append('<text x="40" y="790" font-size="13" fill="#2d3748">推荐：默认两排纵深 + 部署区内自由换位 + 一键预设阵型（鱼鳞/雁行/方圆）。双方距离 5 格，近战移动 3 → 第 2 回合接敌，节奏成立</text>')
svg.append('<text x="40" y="812" font-size="13" fill="#2d3748">侧翼：第 0/6 列是空旷边路，5v5 摆 5 列必留 2 列空档 —— 包抄路线天然存在，是走位深度的来源</text>')
svg.append('<text x="40" y="834" font-size="13" fill="#2d3748">★中央争夺点建议给 Buff（+行动力/回复），把"要不要抢中路"变成每局的核心决策</text>')
svg.append('</svg>')

with open("design/ux/mockups/hexboard-deploy-mockup.svg", "w") as f:
    f.write("\n".join(svg))
print("SVG written")
