#!/usr/bin/env python3
"""外科清除封闭白残留（T14）：对指定 raw 图的指定连通块做块级精确清除
（只清 BFS 连通块像素，禁 bbox 矩形全清——规范 §3#1/#2）。
每块保存清除前后对比图到 walk_q/surgical/{name}_{idx}_before/after.png。
用法: python3 scripts/surgical_clear.py <spec.json>
spec: [{"img": "up_stand", "pick": [[x,y],...]}, ...]  pick=块内任一点
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw

ROOT = "assets/characters/hero/walk_q"
OUT = os.path.join(ROOT, "surgical")

def block_at(cut, seed):
    """从 seed 做 BFS，收集同块全部像素（同 detect_enclosed_white 判据）"""
    W, H = cut.size
    px = cut.load()
    sx, sy = seed
    if not (px[sx, sy][3] > 200 and min(px[sx, sy][:3]) > 225):
        return None
    seen = {(sx, sy)}
    stack = [(sx, sy)]
    while stack:
        cx, cy = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen:
                q = px[nx, ny]
                if q[3] > 200 and min(q[0], q[1], q[2]) > 225:
                    seen.add((nx, ny))
                    stack.append((nx, ny))
    return seen

def save_compare(before, after, members, tag):
    xs = [m[0] for m in members]; ys = [m[1] for m in members]
    bb = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    pad = 40
    x0, y0 = max(0, bb[0] - pad), max(0, bb[1] - pad)
    x1, y1 = min(before.width, bb[2] + pad), min(before.height, bb[3] + pad)
    w, h = x1 - x0, y1 - y0
    sheet = Image.new("RGBA", (w * 2 + 12, h), (120, 120, 120, 255))
    sheet.paste(before.crop((x0, y0, x1, y1)), (0, 0))
    sheet.paste(after.crop((x0, y0, x1, y1)), (w + 12, 0))
    d = ImageDraw.Draw(sheet)
    d.rectangle([bb[0] - x0, bb[1] - y0, bb[2] - x0 - 1, bb[3] - y0 - 1], outline=(255, 0, 0, 255), width=2)
    d.rectangle([w + 12 + bb[0] - x0, bb[1] - y0, w + 12 + bb[2] - x0 - 1, bb[3] - y0 - 1], outline=(255, 0, 0, 255), width=2)
    sheet.convert("RGB").save(os.path.join(OUT, f"{tag}.png"))
    return bb

def main():
    with open(sys.argv[1]) as f:
        spec = json.load(f)
    os.makedirs(OUT, exist_ok=True)
    for item in spec:
        name = item["img"]
        path = os.path.join(ROOT, "raw", f"{name}.png")
        cut = Image.open(path).convert("RGBA")
        before = cut.copy()
        for idx, seed in enumerate(item["pick"]):
            members = block_at(cut, tuple(seed))
            if not members or len(members) < 100:
                print(f"[skip] {name} #{idx} seed={seed}: 非近白块或块过小({len(members) if members else 0}px)")
                continue
            after = cut.copy()
            px = after.load()
            for (x, y) in members:
                px[x, y] = (0, 0, 0, 0)
            bb = save_compare(before, after, members, f"{name}_{idx:02d}")
            cut = after
            print(f"[cleared] {name} #{idx}: {len(members)}px bbox={bb} → surgical/{name}_{idx:02d}.png")
        cut.save(path)
        print(f"[saved] {path}")

if __name__ == "__main__":
    main()
