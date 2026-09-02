#!/usr/bin/env python3
"""封闭白报警分诊（T14）：对 walk_q/raw 各向 cut 前的 raw 图重跑检测门，
按块内平坦度（L 通道 std/mean）+ 归一位置分类：
  - garment  = 服装白（有衣纹阴影起伏，std 高）→ 只记录
  - residue  = 纯平白背景残留（std≈0、mean≈背景白）→ 外科候选
down 向为 v14 已验收基线（全部 garment 参照），不参与外科。
输出: /tmp/enclosed_triage.json + 控制台表
用法: python3 scripts/triage_enclosed_white.py [--dirs down up right down_right up_right]
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from build_walk_frames import POSES, detect_enclosed_white

ROOT = "assets/characters/hero/walk_q"

def blocks_with_stats(cut):
    """复刻 detect_enclosed_white 的 BFS，同时收集块内 L 统计与像素坐标"""
    W, H = cut.size
    px = cut.load()
    visited = [[False] * W for _ in range(H)]
    out = []
    for y in range(H):
        for x in range(W):
            p = px[x, y]
            if p[3] > 200 and min(p[0], p[1], p[2]) > 225 and not visited[y][x]:
                stack = [(x, y)]; visited[y][x] = True
                members = [(x, y)]
                while stack:
                    cx, cy = stack.pop()
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H and not visited[ny][nx]:
                            q = px[nx, ny]
                            if q[3] > 200 and min(q[0], q[1], q[2]) > 225:
                                visited[ny][nx] = True
                                stack.append((nx, ny)); members.append((nx, ny))
                if len(members) >= 400:
                    ls = [0.299 * px[m][0] + 0.587 * px[m][1] + 0.114 * px[m][2] for m in members]
                    n = len(ls)
                    mean = sum(ls) / n
                    std = (sum((v - mean) ** 2 for v in ls) / n) ** 0.5
                    xs = [m[0] for m in members]; ys = [m[1] for m in members]
                    out.append({
                        "n": n, "bbox": [min(xs), min(ys), max(xs), max(ys)],
                        "mean_L": round(mean, 2), "std_L": round(std, 2),
                        "members": members,
                    })
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dirs", nargs="+", default=["down", "up", "right", "down_right", "up_right"])
    ap.add_argument("--save-members", action="store_true")
    a = ap.parse_args()
    result = {}
    for d in a.dirs:
        for name in POSES[d]:
            cut = Image.open(os.path.join(ROOT, "cut", f"{name}.png")).convert("RGBA")
            bb = cut.getbbox()
            bh = bb[3] - bb[1]
            rows = []
            for b in blocks_with_stats(cut):
                cy = (b["bbox"][1] + b["bbox"][3]) / 2
                cx = (b["bbox"][0] + b["bbox"][2]) / 2
                rows.append({
                    "n": b["n"], "bbox": b["bbox"], "mean_L": b["mean_L"], "std_L": b["std_L"],
                    "y_pct": round((cy - bb[1]) / bh * 100, 1),
                    "x_pct_of_body": round((cx - bb[0]) / (bb[2] - bb[0]) * 100, 1),
                })
                if a.save_members:
                    rows[-1]["members"] = b["members"]
            result[f"{d}/{name}"] = rows
            for r in rows:
                print(f"{d}/{name}: n={r['n']:5d} y%={r['y_pct']:5.1f} x%={r['x_pct_of_body']:5.1f} "
                      f"mean={r['mean_L']:6.1f} std={r['std_L']:5.2f} bbox={r['bbox']}")
    with open("/tmp/enclosed_triage.json", "w") as f:
        json.dump(result, f)
    print("\nsaved /tmp/enclosed_triage.json")

if __name__ == "__main__":
    main()
