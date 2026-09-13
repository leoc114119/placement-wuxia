#!/usr/bin/env python3
"""jump / cast 六向 × 5 帧 —— **ratio 明暗版重出**（去掉影调与描边）

为什么重出：旧件 `*_6dir_v4_texd` 走的是 `export_all_texd.sh` 的流程，里面有
  ① `tone_pass.py --red 26 --red-scope warm`  ← **把棕发烧成暗红的元凶**（已定位）
  ② `postprocess.mjs`（量化 + 描边）          ← 描边已被 Leo 否决
所以旧交付件颜色是错的（头发暗红），且带已否决的描边。

本脚本按现定口径重出：
  模型/动画源/抽帧时间点/六向 yaw/画布 —— 与旧件**一字不动**
  渲染 mode = flatcel；贴图 = `明暗贴图试产/tex6r/tex_<方向>.raw`（ratio 转移 blur 3，每方向一张）
  **不做 tone_pass、不做 postprocess**
  保留：地面锁定 --target 299、PNG-8 共享调色板

用法：python3 tools/glb2d/export_jump_cast_ratio.py [--only jump|cast]
产出：glb2d_jump/jump_6dir_ratio/ 与 glb2d_cast/cast_6dir_ratio/
      （RGBA PNG 原件留在 <out>/_rgba/，同目录 PNG-8 为交付件）
"""
from __future__ import annotations

import argparse
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
B = ROOT / "assets/_trial_20260912"
TOOLS = ROOT / "tools/glb2d"
GLB = Path.home() / "Downloads/chibi+character+3d+model (2).glb"
TEXDIR = B / "明暗贴图试产/tex6r"
M4 = B / "model_v4"

SS = 4
W, H = 240 * SS, 320 * SS
DIRS = {"left": 90, "leftdown": 135, "leftup": 45, "right": 270, "rightdown": 225, "rightup": 315}
GROUPS = {
    "jump": {"out": B / "glb2d_jump/jump_6dir_ratio", "json": M4 / "retarget_jump_v4.json",
             "ts": [0, 0.5, 0.6, 0.8, 0.4]},          # 源帧 0/15/18/24/12
    "cast": {"out": B / "glb2d_cast/cast_6dir_ratio", "json": M4 / "retarget_cast_v4.json",
             "ts": [0, 0.3667, 0.7333, 1.1, 1.4667]},  # 源帧 0/11/22/33/44
}
WORK = Path("/tmp/ratio_export")


def one(job):
    name, d, yaw, i, t = job
    tex = TEXDIR / f"tex_{d}.raw"
    raw = WORK / f"{name}_{d}_{i}.raw"
    aux = WORK / f"{name}_{d}_{i}"
    env = {**os.environ}
    r = subprocess.run(["node", str(TOOLS / "render.mjs"), str(GLB), str(raw), str(W), str(H),
                        "none", f"{t:.5f}", "flatcel", str(tex), "4096", "4096", str(yaw),
                        str(aux), str(GROUPS[name]["json"])], capture_output=True, text=True, env=env)
    if r.returncode != 0:
        return (name, d, i, "render FAIL " + r.stderr[-160:])
    r = subprocess.run(["node", str(TOOLS / "downsample.mjs"), str(raw), f"{aux}.depth",
                        f"{aux}.normal", str(WORK / f"ds_{name}_{d}_{i}"), str(W), str(H), str(SS)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return (name, d, i, "downsample FAIL")
    return (name, d, i, "OK")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    a = ap.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)

    groups = {a.only: GROUPS[a.only]} if a.only else GROUPS
    for name, g in groups.items():
        out = g["out"]
        rgba = out / "_rgba"
        rgba.mkdir(parents=True, exist_ok=True)
        jobs = [(name, d, yaw, i, t) for d, yaw in DIRS.items()
                for i, t in enumerate(g["ts"], start=1)]
        bad = []
        with ThreadPoolExecutor(max_workers=8) as ex:
            for nm, d, i, st in ex.map(one, jobs):
                if st != "OK":
                    bad.append((d, i, st))
        if bad:
            raise SystemExit(f"{name} 渲染失败：{bad[:4]}")
        for d in DIRS:
            for i in range(1, len(g["ts"]) + 1):
                Image.frombytes("RGBA", (240, 320),
                                (WORK / f"ds_{name}_{d}_{i}.raw").read_bytes()).save(
                    rgba / f"{name}_{d}_{i}.png")
        # 地面锁定（旧件同口径：脚底最深那帧 → y=299）
        r = subprocess.run(["python3", str(TOOLS / "ground_lock.py"), str(rgba), f"{name}_*.png",
                            "--target", "299"], capture_output=True, text=True)
        print(f"  ground_lock {name}: {r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr.strip()[:120]}")
        # PNG-8 共享调色板（交付件）
        subprocess.run(["python3", str(B / "png8_shared_palette.py"), str(rgba)], capture_output=True)
        r = subprocess.run(["python3", str(TOOLS / "png8_encode.py"), str(rgba), str(out)],
                           capture_output=True, text=True)
        print(f"  png8 {name}: {r.stdout.strip().splitlines()[-1] if r.stdout.strip() else 'done'}")
        print(f"    {name}: {len(list(out.glob('*.png')))} 帧 → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
