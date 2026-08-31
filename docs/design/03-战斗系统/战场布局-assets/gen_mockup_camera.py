#!/usr/bin/env python3
"""可变尺寸战场 + 7×7 视口相机系统示意图：8×8 战役 vs 16×16 大战役"""
import math

SQ3 = math.sqrt(3)
S = 31  # 统一格子边长：可读性优先，全战役尺寸通用

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

BOARD_X, BOARD_Y, BOARD_W, BOARD_H = 16, 163, 343, 427  # 棋盘可视区（基准 375×667）

def draw_phone(x0, title, pid):
    o = [f'<text x="{x0 + 187}" y="40" text-anchor="middle" font-size="19" font-weight="bold" fill="#1a202c">{title}</text>',
         f'<rect x="{x0}" y="50" width="375" height="667" rx="24" fill="#ffffff" stroke="#2d3748" stroke-width="3"/>',
         f'<rect x="{x0+3}" y="53" width="369" height="110" rx="10" fill="#4a5568"/>',
         f'<text x="{x0+16}" y="83" font-size="13" fill="#e2e8f0">第 2 回合 · 行动点 6/8</text>',
         f'<clipPath id="board{pid}"><rect x="{x0+BOARD_X}" y="{BOARD_Y}" width="{BOARD_W}" height="{BOARD_H}"/></clipPath>']
    bar_y = 50 + 667 - 130 - 3
    o.append(f'<rect x="{x0+3}" y="{bar_y}" width="369" height="130" rx="10" fill="#2d3748"/>')
    o.append(f'<rect x="{x0+16}" y="{bar_y+12}" width="52" height="52" rx="8" fill="#718096"/>')
    o.append(f'<text x="{x0+78}" y="{bar_y+32}" font-size="13" fill="#e2e8f0">剑士 · HP 24/30</text>')
    o.append(f'<text x="{x0+78}" y="{bar_y+52}" font-size="11" fill="#a0aec0">移动 3 · 攻击 5</text>')
    for i, b in enumerate(["移动", "攻击", "技能", "待命"]):
        bw = (375 - 32 - 24) / 4
        bx = x0 + 16 + i * (bw + 8)
        o.append(f'<rect x="{bx:.1f}" y="{bar_y+72}" width="{bw:.1f}" height="38" rx="8" fill="#4299e1"/>')
        o.append(f'<text x="{bx+bw/2:.1f}" y="{bar_y+96}" text-anchor="middle" font-size="14" fill="#ffffff">{b}</text>')
    return o

def draw_map(svg, x0, cols, rows, units, cam_center, pid, minimap=True):
    """绘制整张地图（裁剪到棋盘区）+ 视口框 + 小地图"""
    dx = 1.5 * S; dy = SQ3 * S
    grid_w = S * (1.5 * cols + 0.5); grid_h = dy * (rows + 0.5)
    # 地图原点：让相机中心对准棋盘区中心
    map_x = x0 + BOARD_X + BOARD_W / 2 - cam_center[0] * dx - S
    map_y = BOARD_Y + BOARD_H / 2 - (cam_center[1] + 0.5) * dy
    svg.append(f'<g clip-path="url(#board{pid})">')
    for r in range(rows):
        for q in range(cols):
            cx = map_x + S + q * dx; cy = map_y + dy / 2 + r * dy + (q % 2) * dy / 2
            # 粗剔除：视野外不画
            if not (x0 + BOARD_X - 80 < cx < x0 + BOARD_X + BOARD_W + 80 and BOARD_Y - 80 < cy < BOARD_Y + BOARD_H + 80):
                continue
            fill, stroke = "#c6f6d5", "#2f855a"
            svg.append(f'<polygon points="{hex_flat_pts(cx, cy, S-0.8)}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
    for q, r, team, role in sorted(units, key=lambda u: (u[1], u[0])):
        cx = map_x + S + q * dx; cy = map_y + dy / 2 + r * dy + (q % 2) * dy / 2
        unit_sprite(svg, cx, cy, S * 2.25, team, role)
    svg.append('</g>')
    # 视口框（红白虚线）：当前显示范围 ≈ 7×7
    vw = S * (1.5 * 7 + 0.5) * 0.97; vh = dy * 7
    cx0 = x0 + BOARD_X + BOARD_W / 2 - vw / 2
    cy0 = BOARD_Y + BOARD_H / 2 - vh / 2
    svg.append(f'<rect x="{cx0:.0f}" y="{cy0:.0f}" width="{vw:.0f}" height="{vh:.0f}" fill="none" stroke="#e53e3e" stroke-width="2.5" stroke-dasharray="7,5" rx="10"/>')
    # 小地图
    if minimap:
        mm_s = 5.5
        mm_x, mm_y = x0 + BOARD_X + BOARD_W - cols * mm_s - 8, BOARD_Y + 8
        svg.append(f'<rect x="{mm_x-4}" y="{mm_y-4}" width="{cols*mm_s+8:.0f}" height="{rows*mm_s+8:.0f}" rx="6" fill="#1a202c" opacity="0.75"/>')
        for q, r, team, _ in units:
            svg.append(f'<circle cx="{mm_x+q*mm_s+2:.0f}" cy="{mm_y+r*mm_s+2:.0f}" r="2.4" fill="{"#63b3ed" if team=="b" else "#fc8181"}"/>')
        # 小地图上的视口框
        vr_w = vw / grid_w * cols * mm_s; vr_h = vh / grid_h * rows * mm_s
        vr_x = mm_x + (cam_center[0] / cols) * cols * mm_s - vr_w / 2 + 2
        vr_y = mm_y + (cam_center[1] / rows) * rows * mm_s - vr_h / 2 + 2
        svg.append(f'<rect x="{vr_x:.0f}" y="{vr_y:.0f}" width="{vr_w:.0f}" height="{vr_h:.0f}" fill="none" stroke="#ffffff" stroke-width="1.5"/>')

svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="880" viewBox="0 0 900 880" font-family="PingFang SC, Hiragino Sans GB, sans-serif">',
       '<rect width="900" height="880" fill="#edf2f7"/>',
       '<text x="450" y="18" text-anchor="middle" font-size="14" fill="#4a5568">统一格子 s=31 · 视口≈7×7（红虚线）· 格子尺寸与地图尺寸解耦 · 黑框=右上角小地图</text>']

# 左：8×8 小战役 —— 视口几乎覆盖全图，基本不用挪镜头
svg.extend(draw_phone(25, "常规战役 8×8", 1))
draw_map(svg, 25, 8, 8, [(0,1,"r","弓"),(3,1,"r","盾"),(5,1,"r","枪"),
                          (2,6,"b","剑"),(4,6,"b","剑"),(1,7,"b","弓"),(5,7,"b","法"),(3,7,"b","牧")],
         (3.5, 3.5), 1, minimap=False)

# 右：16×16 大战役 —— 相机跟随行动单位，小地图看全局
svg.extend(draw_phone(480, "大战役 16×16", 2))
draw_map(svg, 480, 16, 16, [(2,3,"b","剑"),(3,4,"b","弓"),(4,3,"b","牧"),(3,2,"r","盾"),(5,3,"r","枪"),
                             (10,10,"r","弓"),(12,11,"r","法"),(0,13,"b","枪"),(1,14,"b","剑"),(13,2,"r","盾")],
         (3.5, 3.5), 2, minimap=True)

svg.append('<text x="212" y="755" text-anchor="middle" font-size="14" fill="#e53e3e">8×8：超出视口仅 1 格，几乎全景，镜头基本静止</text>')
svg.append('<text x="667" y="755" text-anchor="middle" font-size="14" fill="#e53e3e">16×16：镜头跟随行动单位，右上小地图 + 边缘箭头报点</text>')

svg.append('<rect x="25" y="775" width="850" height="92" rx="10" fill="#ffffff" stroke="#cbd5e0"/>')
svg.append('<text x="40" y="800" font-size="13" fill="#2d3748">相机规则：① 回合开始自动居中行动单位 ② 空白处拖动平移（与点选按位移阈值区分）③ 双指缩放两档：7×7 战术档 / 全图概览档</text>')
svg.append('<text x="40" y="822" font-size="13" fill="#2d3748">视野外信息：屏幕边缘红色箭头提示场外敌人；点小地图跳转；选中远程单位时若射程越出视野，自动平移镜头到射程边缘</text>')
svg.append('<text x="40" y="844" font-size="13" fill="#2d3748">注意：地图变大后 5v5 会显空旷 —— 建议单位数随地图配置（8×8→5v5，12×12→8v8，16×16→12v12），进 GDD 时定</text>')
svg.append('</svg>')

with open("design/ux/mockups/hexboard-camera-mockup.svg", "w") as f:
    f.write("\n".join(svg))
print("SVG written")
