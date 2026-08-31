#!/usr/bin/env python3
"""生成竖屏六边形战棋布局示意图（精确按 pt 尺寸渲染）"""
import math

S = math.sqrt(3)  # √3

def hex_points(cx, cy, s):
    """尖顶六边形顶点：顶点在正上方"""
    pts = []
    for k in range(6):
        theta = math.radians(90 + 60 * k)
        x = cx + s * math.cos(theta)
        y = cy - s * math.sin(theta)
        pts.append(f"{x:.1f},{y:.1f}")
    return " ".join(pts)

def draw_phone(svg, x0, title, s, cols, rows, hud_h, bar_h, screen_w=375, screen_h=667):
    o = []
    o.append(f'<text x="{x0 + screen_w/2}" y="38" text-anchor="middle" font-size="20" font-weight="bold" fill="#1a202c">{title}</text>')
    # 手机外壳
    o.append(f'<rect x="{x0}" y="50" width="{screen_w}" height="{screen_h}" rx="24" fill="#ffffff" stroke="#2d3748" stroke-width="3"/>')
    # 顶部 HUD
    o.append(f'<rect x="{x0+3}" y="53" width="{screen_w-6}" height="{hud_h}" rx="10" fill="#4a5568"/>')
    o.append(f'<text x="{x0+16}" y="{53+30}" font-size="13" fill="#e2e8f0">第 3 回合 · 行动点 6/8</text>')
    for i in range(4):
        o.append(f'<rect x="{x0+16+i*34}" y="{53+42}" width="28" height="28" rx="6" fill="#718096"/>')
    o.append(f'<rect x="{x0+screen_w-60}" y="{53+42}" width="44" height="28" rx="6" fill="#718096"/>')
    # 底部操作区
    bar_y = 50 + screen_h - bar_h - 3
    o.append(f'<rect x="{x0+3}" y="{bar_y}" width="{screen_w-6}" height="{bar_h}" rx="10" fill="#2d3748"/>')
    o.append(f'<rect x="{x0+16}" y="{bar_y+12}" width="52" height="52" rx="8" fill="#718096"/>')
    o.append(f'<text x="{x0+78}" y="{bar_y+32}" font-size="13" fill="#e2e8f0">剑士 · HP 24/30</text>')
    o.append(f'<text x="{x0+78}" y="{bar_y+52}" font-size="11" fill="#a0aec0">移动 3 · 攻击 5</text>')
    btns = ["移动", "攻击", "技能", "待命"]
    bw = (screen_w - 32 - 3*8) / 4
    for i, b in enumerate(btns):
        bx = x0 + 16 + i * (bw + 8)
        o.append(f'<rect x="{bx:.1f}" y="{bar_y+72}" width="{bw:.1f}" height="38" rx="8" fill="#4299e1"/>')
        o.append(f'<text x="{bx+bw/2:.1f}" y="{bar_y+96}" text-anchor="middle" font-size="14" fill="#ffffff">{b}</text>')
    # 棋盘六边形
    w = S * s
    dx = w
    dy = 1.5 * s
    grid_w = w * (cols + 0.5)
    grid_h = s * (1.5 * rows + 0.5)
    ox = x0 + (screen_w - grid_w) / 2
    oy = 53 + hud_h + (screen_h - hud_h - bar_h - grid_h) / 2  # 垂直居中于棋盘区
    for r in range(rows):
        for q in range(cols):
            cx = ox + w/2 + q * dx + (dy and (r % 2) * dx/2)
            cy = oy + s + r * dy
            fill = "#c6f6d5"
            stroke = "#2f855a"
            if (q, r) == (2, 4):  # 示例选中单位
                fill = "#f6ad55"; stroke = "#c05621"
            elif (q, r) in [(1,3),(2,3),(3,3),(1,4),(3,4),(1,5),(2,5),(3,5),(2,6)]:
                fill = "#faf089"; stroke = "#d69e2e"  # 移动范围高亮
            o.append(f'<polygon points="{hex_points(cx, cy, s-0.8)}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
            if (q, r) == (2, 4):
                o.append(f'<circle cx="{cx}" cy="{cy}" r="{s*0.42:.1f}" fill="#c05621"/>')
    return o, grid_w, grid_h, ox, oy, s

svg = []
svg.append('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="810" viewBox="0 0 900 810" font-family="PingFang SC, Hiragino Sans GB, sans-serif">')
svg.append('<rect width="900" height="810" fill="#edf2f7"/>')
svg.append('<text x="450" y="24" text-anchor="middle" font-size="15" fill="#4a5568">竖屏六边形战棋布局对比 · 基准 375×667pt · 黄=移动范围 橙=选中单位</text>')

# 左：6×9 s=30
left, gw1, gh1, ox1, oy1, s1 = draw_phone(svg, 45, "方案 A · 尖顶 6列×9行 (s=30)", 30, 6, 9, 110, 130)
svg.extend(left)
# 右：5×7 s=36
right, gw2, gh2, ox2, oy2, s2 = draw_phone(svg, 480, "方案 B · 尖顶 5列×7行 (s=36)", 36, 5, 7, 110, 130)
svg.extend(right)

# 触控标注：左边格子 52pt 宽，右边 62pt 宽
svg.append(f'<line x1="{ox1}" y1="{oy1-10}" x2="{ox1+gw1}" y2="{oy1-10}" stroke="#e53e3e" stroke-width="2"/>')
svg.append(f'<text x="{ox1+gw1/2}" y="{oy1-16}" text-anchor="middle" font-size="13" fill="#e53e3e">格宽 52pt（红圈=44pt 最小触控标准）</text>')
svg.append(f'<circle cx="{ox1+156:.0f}" cy="{oy1+210:.0f}" r="22" fill="none" stroke="#e53e3e" stroke-width="2.5" stroke-dasharray="4,3"/>')
svg.append(f'<line x1="{ox2}" y1="{oy2-10}" x2="{ox2+gw2}" y2="{oy2-10}" stroke="#e53e3e" stroke-width="2"/>')
svg.append(f'<text x="{ox2+gw2/2}" y="{oy2-16}" text-anchor="middle" font-size="13" fill="#e53e3e">格宽 62pt · 格高 72pt</text>')
svg.append(f'<circle cx="{ox2+156:.0f}" cy="{oy2+252:.0f}" r="22" fill="none" stroke="#e53e3e" stroke-width="2.5" stroke-dasharray="4,3"/>')

# 底部结论条
svg.append('<rect x="45" y="740" width="810" height="50" rx="10" fill="#ffffff" stroke="#cbd5e0"/>')
svg.append('<text x="60" y="760" font-size="13" fill="#2d3748">左：格子多、信息密度高，但单格触控接近下限，误触风险高（你担心的问题）</text>')
svg.append('<text x="60" y="780" font-size="13" fill="#2d3748">右：格子大 34%，点选轻松；棋盘纵深靠双指平移/关卡分段补回（推荐）</text>')
svg.append('</svg>')

with open("design/ux/mockups/hexboard-mockup.svg", "w") as f:
    f.write("\n".join(svg))
print("SVG written")
