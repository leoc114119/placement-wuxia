#!/usr/bin/env python3
"""六向明暗回填 · 修正版：贴明暗图时按「AI 图自己的人物掩膜」贴，并先做配准对齐。

修的是旧版 `build_6dir_shading.py` 的这一步：
    sh_fit = sh.resize((cw, ch));  rgb.paste(sh_fit, (box[0], box[1]))
两个问题：
  ① **非等比拉伸**：AI 明暗图尺寸与我们的裁框宽高比不一致时直接被拉变形。
  ② **整块覆盖**：AI 画的人物比我们的小/位置有偏差，它的**深色背景会啃掉我们轮廓内侧一圈**。
     那些像素 uv 有效 ⇒ 被回填成 AI 背景的暗色 ⇒ 写成永久脏纹素。
     实测证据：`views6/rightdown_comp.raw` 比 `views6/rightdown.raw` 瘦一圈、边缘发暗；
     成品在**两腿之间**出现暗斑，且**动作摆大时特别明显**（那些是腿部内侧/轮廓纹素，
     idle 时看不见，张开就露出来）。

修法：
  1. 用背景距离掩膜求出 **AI 图的人物 bbox**（口径与 qa_shading_shape 一致）
  2. **等比缩放 + 平移**，把 AI 人物对到我们渲染的人物 bbox 上（与 prep_angle_views 同口径）
  3. **只贴 AI 掩膜覆盖的区域**；其余保留我们渲染自己的颜色（不引入任何外来像素）

用法：python3 tools/glb2d/build_6dir_shading2.py [--only rightdown] [--mode best|avg]
产出：assets/_trial_20260912/明暗贴图试产/tex6b/tex_<dir>.raw
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/glb2d"))
from qa_shading_shape import silhouette, bbox  # noqa: E402

BASE = ROOT / "assets/_trial_20260912/明暗贴图试产"
VIEWS = BASE / "views6"
TEXB = BASE / "tex6b"
DELIV = BASE / "交付"
GLB = Path.home() / "Downloads/chibi+character+3d+model (2).glb"
TEX_BASE = ROOT / "assets/_trial_20260912/贴图回填_美术线输入/配准后/basecolor_detail_20views.raw"
ANIM = ROOT / "assets/_trial_20260912/model_v4/retarget_idle_v4.json"
W, H, TW, TH = 960, 1280, 4096, 4096
BG = (20, 20, 24)
MARGIN = 24

DIRS = {"left": (90, "全身_left_明暗分块.png"),
        "leftdown": (135, "全身_leftdown_明暗分块.png"),
        "leftup": (45, "全身_leftup_明暗分块.png"),
        "right": (270, "全身_right_明暗分块.png"),
        "rightdown": (225, "全身_明暗分块.png"),
        "rightup": (315, "全身_rightup_明暗分块.png")}


def char_bbox(im: Image.Image):
    """清洗后的人物 bbox（右/下为开区间），在该图自身像素坐标下。"""
    m = silhouette(im)
    mw, mh = m.size
    x0, y0, x1, y1 = bbox(m)
    return (round(x0 * im.width / mw), round(y0 * im.height / mh),
            round(x1 * im.width / mw), round(y1 * im.height / mh))


def mask_orig(im: Image.Image) -> Image.Image:
    return silhouette(im).resize(im.size, Image.NEAREST)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--mode", default="best", choices=["best", "avg"])
    a = ap.parse_args()
    TEXB.mkdir(parents=True, exist_ok=True)

    jobs = {a.only: DIRS[a.only]} if a.only else DIRS
    for d, (yaw, shname) in jobs.items():
        shp = DELIV / shname
        if not shp.exists():
            print(f"缺明暗图 {shp}"); continue
        raw = VIEWS / f"{d}.raw"
        if not raw.exists():
            print(f"缺视图 {raw}（先用 build_6dir_shading.py 渲出来）"); continue

        ren = Image.frombytes("RGBA", (W, H), raw.read_bytes())
        rb = ren.getchannel("A").getbbox()
        box = (max(0, rb[0] - MARGIN), max(0, rb[1] - MARGIN),
               min(W, rb[2] + MARGIN), min(H, rb[3] + MARGIN))
        cw, ch = box[2] - box[0], box[3] - box[1]
        # 裁框内「我们的人物框」
        ours = (rb[0] - box[0], rb[1] - box[1], rb[2] - box[0], rb[3] - box[1])

        sh = Image.open(shp).convert("RGB")
        sm = mask_orig(sh)
        sb = char_bbox(sh)
        k = ((ours[3] - ours[1]) / (sb[3] - sb[1]) + (ours[2] - ours[0]) / (sb[2] - sb[0])) / 2
        sh2 = sh.resize((round(sh.width * k), round(sh.height * k)), Image.LANCZOS)
        m2 = sm.resize(sh2.size, Image.NEAREST)
        sb2 = char_bbox(sh2)
        off = (ours[0] - sb2[0], ours[1] - sb2[1])

        # 底：我们自己的渲染（合成到裁框坐标系）
        rgb = Image.new("RGB", (W, H), BG)
        rgb.paste(ren.convert("RGB"), mask=ren.getchannel("A"))
        crop = rgb.crop(box)
        # 只把 AI 掩膜覆盖处替换掉
        ai_layer = Image.new("RGB", (cw, ch), BG)
        ai_mask = Image.new("L", (cw, ch), 0)
        ai_layer.paste(sh2, off)
        ai_mask.paste(m2, off)
        crop = Image.composite(ai_layer, crop, ai_mask)
        rgb.paste(crop, (box[0], box[1]))
        comp = VIEWS / f"{d}_comp2.raw"
        comp.write_bytes(rgb.convert("RGBA").tobytes())

        tx = TEXB / f"tex_{d}.raw"
        r = subprocess.run(["node", str(ROOT / "tools/glb2d/backfill_tex.mjs"),
                            "--mode", a.mode, "--tex", str(TEX_BASE), "--tw", str(TW), "--th", str(TH),
                            "--out", str(tx), "--splat", "2", "--w", str(W), "--h", str(H),
                            "--view", str(comp), str(VIEWS / f"{d}.raw.uv"),
                            str(VIEWS / f"{d}.normal"), str(VIEWS / f"{d}.raw.shade")],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit(f"回填失败 {d}:\n{r.stderr[-1200:]}")
        print(f"  {d:10s} 配准 k={k:.4f}  我们人物 {ours[2]-ours[0]}x{ours[3]-ours[1]} ← AI {sb[2]-sb[0]}x{sb[3]-sb[1]}  → {tx.name}")
    print("→", TEXB)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
