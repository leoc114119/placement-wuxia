#!/usr/bin/env python3
"""头发去饱和：把偏棕的 3D 发色改成接近线上 2D 的中性灰黑。

为什么要做：线上 2D 的头发平均色 (32,33,32)（中性），我们渲染出来是 (48,32,32)/(32,16,16)（暖棕）。
这是**模型贴图自带的发色**，影调那步改不了（那步只有全局加红，越加越暖）。

做法（不碰几何、不改明暗，只改发色的饱和度）：
  1. 在**渲染空间**识别头发：人物上 42% 区域内、暗（luma<120）、暖（R≥B）、且不是青（G/B 不明显高于 R）、
     且不是亮红（R<140，保住红发绳）
  2. 把这个掩膜**回填到贴图空间**（合并六向）—— 得到"哪些纹素是头发"
  3. 对贴图里命中掩膜的纹素**去饱和**：R=G=B=luma（保留明暗起伏，只去掉色相）

用法：python3 desaturate_hair.py <tex_dir> [--dry]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "assets/_trial_20260912/明暗贴图试产"
VIEWS = BASE / "views"
TEX = BASE / "tex"
LAYOUT = BASE / "六向拼图输入/layout.json"
BG = (20, 20, 24)
W, H, TW, TH = 960, 1280, 4096, 4096
DIRS = ["left", "leftdown", "leftup", "right", "rightdown", "rightup"]


def luma(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b


def hair_mask(im: Image.Image) -> Image.Image:
    """渲染空间的头发掩膜（白=头发）"""
    a = im.getchannel("A")
    ab = a.getbbox()
    hy = ab[1] + int((ab[3] - ab[1]) * 0.42)          # 只取人物上 42% —— 把靴子/腰带排除在外
    rgb = im.convert("RGB"); px = rgb.load()
    m = Image.new("L", im.size, 0); pm = m.load()
    n = 0
    for y in range(ab[1], min(hy, im.size[1])):
        for x in range(ab[0], ab[2]):
            r, g, b = px[x, y]
            if a.getpixel((x, y)) == 0:
                continue
            if luma(r, g, b) >= 120:            # 亮的不动（肤色/高光/亮红发绳）
                continue
            if r > 140:                          # 亮红 = 发绳，保住
                continue
            if g > r + 10 or b > r + 10:         # 青/蓝 = 发带，保住
                continue
            pm[x, y] = 255; n += 1
    return m, n


def main() -> None:
    texdir = Path(sys.argv[1]) if len(sys.argv) > 1 else TEX
    # —— 1) 六向的头发掩膜 → 回填成贴图空间掩膜 ——
    tmp = BASE / "_hairmask"; tmp.mkdir(exist_ok=True)
    args = []
    for d in DIRS:
        raw = VIEWS / f"{d}.raw"
        if not raw.exists():
            print(f"缺 {raw}"); sys.exit(1)
        m, n = hair_mask(Image.frombytes("RGBA", (W, H), raw.read_bytes()))
        p = tmp / f"{d}.raw"
        p.write_bytes(m.convert("RGBA").tobytes())
        print(f"  {d:10s} 渲染空间头发像素 {n}")
        args += ["--view", str(p), str(VIEWS / f"{d}.raw.uv"),
                 str(VIEWS / f"{d}.normal"), str(VIEWS / f"{d}.raw.shade")]
    mask_tex = tmp / "hairmask_tex.raw"
    subprocess.run(["node", str(ROOT / "tools/glb2d/backfill_tex.mjs"), "--mode", "best",
                    "--tex", str(texdir / f"tex_{DIRS[0]}.raw"), "--tw", str(TW), "--th", str(TH),
                    "--out", str(mask_tex), "--splat", "3", "--w", str(W), "--h", str(H)] + args,
                   check=True, capture_output=True)
    mk = mask_tex.read_bytes()
    hit = sum(1 for i in range(TW * TH) if mk[i * 4] > 128)
    print(f"贴图空间命中头发纹素 {hit}（{hit / (TW * TH) * 100:.2f}%）")

    # —— 2) 对每张贴图去饱和 ——
    changed = 0
    for d in DIRS:
        src = texdir / f"tex_{d}.raw"
        if not src.exists():
            print(f"  跳过（不存在）{src.name}"); continue
        buf = bytearray(src.read_bytes())
        cnt = 0
        for i in range(TW * TH):
            if mk[i * 4] <= 128:
                continue
            r, g, b, al = buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2], buf[i * 4 + 3]
            if r > 140 or g > r + 10 or b > r + 10:      # 双保险：亮红/青不动
                continue
            L = int(round(luma(r, g, b)))
            buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = L
            cnt += 1
        out = texdir / f"tex_{d}_hairfix.raw"
        out.write_bytes(bytes(buf))
        changed += cnt
        print(f"  {d:10s} 去饱和纹素 {cnt} → {out.name}")


if __name__ == "__main__":
    main()
