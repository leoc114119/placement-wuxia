#!/usr/bin/env python3
"""scene_jianghu 构图像素行采样分析（验收诊断用）
逐行采样中间 40% 宽区域，按色调分类：水/植被/留白(纸面)/石径/其他，
输出每 5% 高度的成分占比表 + 河岸线估计位置。
用法: python3 scripts/analyze_scene_rows.py [image_path]
"""
import sys
from collections import Counter

from PIL import Image

IMG = sys.argv[1] if len(sys.argv) > 1 else "assets/ui/scene_jianghu.png"


def classify(r: int, g: int, b: int) -> str:
    """粗分类：返回 水/植被/纸面/石径/山雾/其他"""
    mx, mn = max(r, g, b), min(r, g, b)
    sat = mx - mn
    # 纸面留白：亮且低饱和（宣纸米 #F8F4EA 一带）
    if r > 225 and g > 220 and sat < 25:
        return "纸面"
    # 石径：中亮度低饱和灰
    if sat < 22 and 120 <= mx <= 215:
        return "石径"
    # 水面：蓝青主导或灰青（b>=g>r 且有一定饱和）
    if b >= g >= r and sat >= 12 and mx > 90:
        return "水"
    # 植被：绿主导
    if g >= r and g >= b and sat >= 18:
        return "植被"
    # 山雾：亮灰青、高明度低中饱和
    if mx > 180 and sat < 45:
        return "山雾"
    return "其他"


def main() -> None:
    im = Image.open(IMG).convert("RGB")
    w, h = im.size
    px = im.load()
    print(f"图: {IMG}  {w}x{h}")
    print(f"{'y%':>5} | {'水':>5} {'植被':>5} {'纸面':>5} {'石径':>5} {'山雾':>5} {'其他':>5} | 主导")
    print("-" * 60)
    counts_all: Counter[str] = Counter()
    for pct in range(5, 100, 5):
        y = min(int(h * pct / 100), h - 1)
        x0, x1 = int(w * 0.30), int(w * 0.70)  # 中央 40%
        c: Counter[str] = Counter()
        step = max(1, (x1 - x0) // 80)
        for x in range(x0, x1, step):
            c[classify(*px[x, y])] += 1
        total = sum(c.values())
        counts_all.update(c)
        dom = c.most_common(1)[0][0] if c else "-"
        cells = "".join(f"{c.get(k, 0) / total * 100:6.0f}" for k in ("水", "植被", "纸面", "石径", "山雾", "其他"))
        print(f"{pct:>4}% | {cells} | {dom}")
    total_all = sum(counts_all.values())
    print("-" * 60)
    print("中央40%整体:", "  ".join(f"{k}:{v / total_all * 100:.0f}%" for k, v in counts_all.most_common()))


if __name__ == "__main__":
    main()
