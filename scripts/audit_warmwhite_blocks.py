#!/usr/bin/env python3
"""暖白残留审计门（T04 腿间返工专用，CodeBuddy 出）。

扫描透明 PNG 中「大面积暖白不透明连通块」（≥min_size px），
输出块清单（数量/面积/bbox/中心/高度带）。供腿间/毛间隙残留的客观验收，
替代「只测自己清过的区域」的自证口径（该口径在 08-22 返工中漏网 spr_shanzei_02）。

用法:
    python3 scripts/audit_warmwhite_blocks.py assets/ui/frames/spr_shanzei/spr_shanzei_0*_transparent.png
    python3 scripts/audit_warmwhite_blocks.py --min-size 300 <files...>

判定参考: 腿部高度带（约 55%~90% 帧高）内出现 ≥400px 块 = 残留待清；
上身衣物浅色设计区（<50% 帧高）与肢体皮肤高光为正常，人工复核 bbox 定性。
"""
import sys
from PIL import Image


def audit(path: str, min_size: int = 400):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    # 暖白不透明掩码：alpha>180 且 minRGB>160 且彩度(max-min)<55
    mask = [
        [
            1
            if (
                px[x, y][3] > 180
                and min(px[x, y][:3]) > 160
                and max(px[x, y][:3]) - min(px[x, y][:3]) < 55
            )
            else 0
            for x in range(w)
        ]
        for y in range(h)
    ]
    seen = [[False] * w for _ in range(h)]
    blocks = []
    for y in range(h):
        for x in range(w):
            if mask[y][x] and not seen[y][x]:
                stack = [(x, y)]
                seen[y][x] = True
                pts = []
                while stack:
                    cx, cy = stack.pop()
                    pts.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                if len(pts) >= min_size:
                    xs = [p[0] for p in pts]
                    ys = [p[1] for p in pts]
                    blocks.append((len(pts), min(xs), min(ys), max(xs), max(ys)))
    return w, h, sorted(blocks, reverse=True)


def main():
    args = sys.argv[1:]
    min_size = 400
    if "--min-size" in args:
        i = args.index("--min-size")
        min_size = int(args[i + 1])
        del args[i : i + 2]
    if not args:
        print(__doc__)
        sys.exit(1)
    total_flagged = 0
    for f in args:
        w, h, blocks = audit(f, min_size)
        name = f.split("/")[-1]
        leg_band = [b for b in blocks if 0.55 <= ((b[2] + b[4]) / 2) / h <= 0.90]
        status = "❌" if leg_band else "✓"
        print(f"{status} {name}  ({w}x{h})  ≥{min_size}px 暖白不透明块: {len(blocks)}个（腿部带 {len(leg_band)}个）")
        for size, x0, y0, x1, y1 in blocks:  # 全量打印——截断打印曾致 3 处腿部带漏报漏清（fb37dac 返工②教训）
            band = " ⚠️腿部带" if 0.55 <= ((y0 + y1) / 2) / h <= 0.90 else ""
            print(f"   · {size}px @ ({x0},{y0})~({x1},{y1}) 高度带={((y0+y1)/2)/h:.0%}{band}")
        total_flagged += len(leg_band)
    sys.exit(1 if total_flagged else 0)


if __name__ == "__main__":
    main()
