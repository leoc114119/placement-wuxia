#!/usr/bin/env python3
"""给「裸渲染（无影调·无后处理）」的六向帧补描边 —— 除线条外零改动。

做法：渲染（flatcel + 已回填贴图，带 UVMAP/sidecar）→ 箱式滤波降采样 4× 到 240×320
      → postprocess.mjs（--preserve-color --outline 2，只留外轮廓）→ RGBA PNG。

为什么用 --preserve-color：这条链的定位是「观感已定稿、只补线条」。
   即使 --levels 256 也仍走 q(v)=round(floor(v)+0.5)，会引入 ±1 取整；--speckle 也改像素。
   --preserve-color 绕开整条量化链路，颜色字节原样透传 ⇒ 可程序化验证「除描边外零改动」。

为什么只留外轮廓（--normal-thresh 999 --depth-thresh 999）：
   实测「法线边」在头发上全是噪声（发丝被描成黑点），深度边也会在头发里加杂线。
   外轮廓是唯一干净可控的一类。

用法：python3 tools/glb2d/build_outline_frames.py [--outline N] [--out-dir DIR]
产出：<out-dir>/<dir>.png （240×320 RGBA，六向）
"""
from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "assets/_trial_20260912/明暗贴图试产"
TEX = BASE / "tex6"
WORK = Path("/tmp/outline_frames")
GLB = Path.home() / "Downloads/chibi+character+3d+model (2).glb"
ANIM = ROOT / "assets/_trial_20260912/model_v4/retarget_idle_v4.json"
W, H, TW, TH = 960, 1280, 4096, 4096
SS = 4
OW, OH = W // SS, H // SS          # 240×320
OUTLINE_RGB = (26, 24, 28)
DIRS = {"leftdown": 135, "left": 90, "leftup": 45,
        "rightdown": 225, "right": 270, "rightup": 315}


def run(cmd, env=None) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise SystemExit(f"命令失败：{' '.join(map(str, cmd))}\n{r.stderr[-1500:]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--outline", type=int, default=2)
    ap.add_argument("--out-dir", default=str(BASE / "frames6b_outline"))
    a = ap.parse_args()
    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / "no_line"
    dst.mkdir(parents=True, exist_ok=True)

    for d, yaw in DIRS.items():
        tex = TEX / f"tex_{d}.raw"
        if not tex.exists():
            print(f"缺贴图 {tex}，跳过 {d}")
            continue
        WORK.mkdir(parents=True, exist_ok=True)
        raw = WORK / f"{d}.raw"
        env = {**os.environ, "UVMAP": "1"}
        run(["node", str(ROOT / "tools/glb2d/render.mjs"), str(GLB), str(raw), str(W), str(H),
             "none", "0", "flatcel", str(tex), str(TW), str(TH), str(yaw),
             str(WORK / d), str(ANIM)], env=env)
        run(["node", str(ROOT / "tools/glb2d/downsample.mjs"), str(raw),
             str(WORK / f"{d}.depth"), str(WORK / f"{d}.normal"), str(WORK / f"ds_{d}"),
             str(W), str(H), str(SS)])
        ds = WORK / f"ds_{d}.raw"

        # 无描边版（对照）
        Image.frombytes("RGBA", (OW, OH), ds.read_bytes()).save(dst / f"idle_{d}_1.png")

        # 描边版
        ol = WORK / f"ol_{d}.raw"
        run(["node", str(ROOT / "tools/glb2d/postprocess.mjs"), str(ds),
             str(WORK / f"ds_{d}.depth"), str(WORK / f"ds_{d}.normal"), str(ol),
             str(OW), str(OH), "--preserve-color", "--outline", str(a.outline),
             "--normal-thresh", "999", "--depth-thresh", "999"])
        Image.frombytes("RGBA", (OW, OH), ol.read_bytes()).save(out_dir / f"idle_{d}_1.png")

        # 校验：非描边色的改动必须为 0
        src, outb = ds.read_bytes(), ol.read_bytes()
        bad = sum(1 for i in range(0, len(src), 4)
                  if src[i + 3] and outb[i:i + 3] != src[i:i + 3] and outb[i:i + 3] != bytes(OUTLINE_RGB))
        line = sum(1 for i in range(0, len(src), 4) if src[i + 3] and outb[i:i + 3] == bytes(OUTLINE_RGB))
        subj = sum(1 for i in range(0, len(src), 4) if src[i + 3])
        print(f"  {d:10s} 描边 {line:5d}px（人物 {subj} 的 {line/subj*100:4.1f}%）"
              f"  非描边色改动 {bad} → {'✅ 零改动' if bad == 0 else '❌ 颜色被动了'}")
    print(f"→ {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
