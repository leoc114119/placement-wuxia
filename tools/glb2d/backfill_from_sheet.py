#!/usr/bin/env python3
"""把「六向明暗拼图」直接回填成 6 套贴图 —— 不拆中间文件。

思路（Leo 提议）：拼图一次生成 ⇒ 六格共享同一套光照逻辑 ⇒ 直接当源最忠实。
  · 不做"裁格→存 6 个文件"这一步，而是**逐像素坐标映射**：
    渲染图像素 (x,y) → 人物 bbox 内相对位置 → ×scale → +pasteAt → 拼图坐标 → 采样
  · 每格再用轮廓 bbox 的实际偏差做一次微调（模型可能把某格整体挪几像素）

用法：python3 backfill_from_sheet.py
产出：assets/_trial_20260912/明暗贴图试产/tex/tex_<dir>.raw（每方向一套）
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "assets/_trial_20260912/明暗贴图试产"
SHEET = BASE / "交付/六向_明暗分块拼图.png"
LAYOUT = BASE / "六向拼图输入/layout.json"
VIEWDIR = BASE / "views"          # 各方向的渲染（含 .uv/.shade/.normal）
OUT = BASE / "tex"
BG = (20, 20, 24)
W, H = 960, 1280
GLB = str(Path.home() / "Downloads/chibi+character+3d+model (2).glb")
TEX_BASE = ROOT / "assets/_trial_20260912/贴图回填_美术线输入/配准后/basecolor_detail_20views.raw"
ANIM = ROOT / "assets/_trial_20260912/model_v4/retarget_idle_v4.json"
YAW = {"left": 90, "leftdown": 135, "leftup": 45, "right": 270, "rightdown": 225, "rightup": 315}


def bg_bbox(im: Image.Image, thr: int = 30):
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if abs(c[0] - BG[0]) + abs(c[1] - BG[1]) + abs(c[2] - BG[2]) > thr:
                xs.append(x); ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys))


def main() -> None:
    lay = json.loads(LAYOUT.read_text())
    sheet = Image.open(SHEET).convert("RGB")
    if sheet.size != tuple(lay["sheet"]):
        sheet = sheet.resize(tuple(lay["sheet"]), Image.Resampling.LANCZOS)
    sx = sheet.load()

    VIEWDIR.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    for it in lay["items"]:
        d = it["dir"]; yaw = YAW[d]
        ox, oy = it["cell"]; cw, ch = it["cellSize"]
        ab = it["bbox"]; scale = it["scale"]; pa = it["pasteAt"]
        # —— 1) 渲染该方向（带 UV/shade/normal sidecar）——
        raw = VIEWDIR / f"{d}.raw"
        subprocess.run(["node", str(ROOT / "tools/glb2d/render.mjs"), GLB, str(raw), str(W), str(H),
                        "none", "0", "flatcel", str(TEX_BASE), "4096", "4096", str(yaw),
                        str(VIEWDIR / d), str(ANIM)], check=True, capture_output=True,
                       env={**__import__("os").environ, "UVMAP": "1"})
        ren = Image.frombytes("RGBA", (W, H), raw.read_bytes())
        rgb = Image.new("RGB", (W, H), BG)
        rgb.paste(ren.convert("RGB"), mask=ren.getchannel("A"))

        # —— 2) 逐格微调：拿拼图格内实际轮廓 vs 输入时预期轮廓 ——
        cell = sheet.crop((ox, oy, ox + cw, oy + ch))
        got = bg_bbox(cell)
        exp = (pa[0] - ox, pa[1] - oy, pa[0] - ox + it["size"][0], pa[1] - oy + it["size"][1])
        dx = (got[0] - exp[0] + got[2] - exp[2]) / 2
        dy = (got[1] - exp[1] + got[3] - exp[3]) / 2

        # —— 3) 坐标映射：渲染像素 → 拼图像素，直接采样（不落中间文件）——
        out = rgb.copy(); po = out.load()
        mask = ren.getchannel("A").load()
        for y in range(ab[1], ab[3]):
            for x in range(ab[0], ab[2]):
                if mask[x, y] == 0:
                    continue
                u = (x - ab[0]) * scale + pa[0] + dx
                v = (y - ab[1]) * scale + pa[1] + dy
                xi = min(sheet.size[0] - 1, max(0, int(round(u))))
                yi = min(sheet.size[1] - 1, max(0, int(round(v))))
                po[x, y] = sx[xi, yi]
        comp = OUT / f"comp_{d}.raw"
        rgba = out.convert("RGBA")
        comp.write_bytes(rgba.tobytes())
        out.save(OUT / f"comp_{d}.png")
        print(f"  {d:10s} 格内微调 dx={dx:+.1f} dy={dy:+.1f}  → {comp.name} / comp_{d}.png")

        # —— 4) 回填成该方向的贴图 ——
        tx = OUT / f"tex_{d}.raw"
        subprocess.run(["node", str(ROOT / "tools/glb2d/backfill_tex.mjs"), "--mode", "best",
                        "--tex", str(TEX_BASE), "--tw", "4096", "--th", "4096", "--out", str(tx),
                        "--splat", "2", "--w", str(W), "--h", str(H),
                        "--view", str(comp),
                        str(VIEWDIR / f"{d}.raw.uv"), str(VIEWDIR / f"{d}.normal"),
                        str(VIEWDIR / f"{d}.raw.shade")], check=True, capture_output=True)
        print(f"    → {tx.name}")


if __name__ == "__main__":
    main()
