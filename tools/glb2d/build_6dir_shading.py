#!/usr/bin/env python3
"""把六向明暗图分别回填成六套贴图，并渲出六向成品。

与拼图版的区别：**每方向一张满尺寸明暗图**（不是拼图里的小格）。
  · 明暗图是"该方向渲染图的一个裁剪"，所以先算出当时用的裁框（由渲染图的 alpha bbox 决定，可确定性复算）
  · 把明暗图贴回整幅视图 → 回填 → 得到该方向的贴图
  · 每个方向用自己的贴图渲一次

用法：python3 build_6dir_shading.py
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "assets/_trial_20260912/明暗贴图试产"
W, H, TW, TH = 960, 1280, 4096, 4096
BG = (20, 20, 24)
GLB = str(Path.home() / "Downloads/chibi+character+3d+model (2).glb")
TEX_BASE = ROOT / "assets/_trial_20260912/贴图回填_美术线输入/配准后/basecolor_detail_20views.raw"
ANIM = ROOT / "assets/_trial_20260912/model_v4/retarget_idle_v4.json"

DIRS = {"left": (90, BASE / "交付/全身_left_明暗分块.png"),
        "leftdown": (135, BASE / "交付/全身_leftdown_明暗分块.png"),
        "leftup": (45, BASE / "交付/全身_leftup_明暗分块.png"),
        "right": (270, BASE / "交付/全身_right_明暗分块.png"),
        "rightdown": (225, BASE / "交付/全身_明暗分块.png"),
        "rightup": (315, BASE / "交付/全身_rightup_明暗分块.png")}

VIEWS = BASE / "views6"; TEX = BASE / "tex6"; FRAMES = BASE / "frames6"


def main() -> None:
    for p in (VIEWS, TEX, FRAMES):
        p.mkdir(parents=True, exist_ok=True)
    report = {}
    for d, (yaw, shade_png) in DIRS.items():
        if not shade_png.exists():
            print(f"缺 {shade_png}"); continue
        # 1) 渲染该方向（带 sidecar）
        raw = VIEWS / f"{d}.raw"
        subprocess.run(["node", str(ROOT / "tools/glb2d/render.mjs"), GLB, str(raw), str(W), str(H),
                        "none", "0", "flatcel", str(TEX_BASE), "4096", "4096", str(yaw),
                        str(VIEWS / d), str(ANIM)], check=True, capture_output=True,
                       env={**os.environ, "UVMAP": "1"})
        ren = Image.frombytes("RGBA", (W, H), raw.read_bytes())
        ab = ren.getchannel("A").getbbox()
        box = (max(0, ab[0] - 24), max(0, ab[1] - 24), min(W, ab[2] + 24), min(H, ab[3] + 24))
        cw, ch = box[2] - box[0], box[3] - box[1]
        # 2) 明暗图贴回整幅视图（明暗图宽度当时归一为 640）
        sh = Image.open(shade_png).convert("RGB")
        sh_fit = sh.resize((cw, ch), Image.Resampling.LANCZOS)
        rgb = Image.new("RGB", (W, H), BG)
        rgb.paste(ren.convert("RGB"), mask=ren.getchannel("A"))
        rgb.paste(sh_fit, (box[0], box[1]))
        comp = VIEWS / f"{d}_comp.raw"
        comp.write_bytes(rgb.convert("RGBA").tobytes())
        # 3) 回填
        tx = TEX / f"tex_{d}.raw"
        subprocess.run(["node", str(ROOT / "tools/glb2d/backfill_tex.mjs"), "--mode", "best",
                        "--tex", str(TEX_BASE), "--tw", str(TW), "--th", str(TH), "--out", str(tx),
                        "--splat", "2", "--w", str(W), "--h", str(H),
                        "--view", str(comp), str(VIEWS / f"{d}.raw.uv"),
                        str(VIEWS / f"{d}.normal"), str(VIEWS / f"{d}.raw.shade")],
                       check=True, capture_output=True)
        report[d] = {"yaw": yaw, "cropBox": list(box), "shadingSize": list(sh.size)}
        print(f"  {d:10s} 裁框{box} 明暗图{sh.size} → 回填完成")
    (BASE / "build6_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n")
    print("六向贴图就绪 →", TEX)


if __name__ == "__main__":
    main()
