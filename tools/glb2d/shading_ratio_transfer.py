#!/usr/bin/env python3
"""明暗图「只取光影、不抄颜色」——低频谱明暗转移。

问题（实测根因）：美术线交的「明暗分块图」**不只是改明暗，它把人物重画了** ——
  袍子那圈浅绿刺绣边整条消失、袍/裤形状挪位。旧做法把 AI 图整块贴上去回填，
  等于把 AI 的绘画偏差一起抄进贴图 ⇒ 成品在**两腿之间**出现暗斑，**动作摆大时特别明显**
  （那些是腿部内侧/轮廓纹素，idle 时看不见，张开就露出来）。

做法：
  1. 求 AI 图人物 bbox，等比缩放+平移到我们渲染的人物框（同 prep_angle_views 口径）
  2. 逐像素算亮度比 ratio = luma(AI) / luma(我们渲染)
  3. **高斯模糊 ratio** —— 只留大面积明暗分布，丢掉 AI 的线条/细节/形变
  4. 夹到 [lo, hi] 防止爆掉
  5. appearance = 我们的渲染 × ratio （**几何与细节全部来自我们自己**）
  6. 照常回填（--mode best / avg，除打光系数）

用法：
  python3 tools/glb2d/shading_ratio_transfer.py [--only rightdown] [--blur 12] [--lo 0.45] [--hi 1.7]
产出：assets/_trial_20260912/明暗贴图试产/tex6r/tex_<dir>.raw  + views6/<dir>_comp_ratio.raw
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/glb2d"))
from qa_shading_shape import silhouette, bbox  # noqa: E402

BASE = ROOT / "assets/_trial_20260912/明暗贴图试产"
VIEWS = BASE / "views6"
DELIV = BASE / "交付"
OUTTEX = BASE / "tex6r"
TEX_BASE = ROOT / "assets/_trial_20260912/贴图回填_美术线输入/配准后/basecolor_detail_20views.raw"
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
    m = silhouette(im)
    mw, mh = m.size
    x0, y0, x1, y1 = bbox(m)
    return (round(x0 * im.width / mw), round(y0 * im.height / mh),
            round(x1 * im.width / mw), round(y1 * im.height / mh))


def luma(im: Image.Image) -> Image.Image:
    r, g, b = im.split()
    return Image.merge("L", [r]).point(lambda v: v) if False else im.convert("L")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--blur", type=float, default=12.0)
    ap.add_argument("--lo", type=float, default=0.45)
    ap.add_argument("--hi", type=float, default=1.7)
    ap.add_argument("--mode", default="best", choices=["best", "avg"])
    a = ap.parse_args()
    OUTTEX.mkdir(parents=True, exist_ok=True)

    jobs = {a.only: DIRS[a.only]} if a.only else DIRS
    for d, (yaw, shname) in jobs.items():
        shp, raw = DELIV / shname, VIEWS / f"{d}.raw"
        if not shp.exists() or not raw.exists():
            print(f"跳过 {d}（缺 {shp.name if not shp.exists() else raw.name}）"); continue

        ren = Image.frombytes("RGBA", (W, H), raw.read_bytes())
        rb = ren.getchannel("A").getbbox()
        box = (max(0, rb[0] - MARGIN), max(0, rb[1] - MARGIN),
               min(W, rb[2] + MARGIN), min(H, rb[3] + MARGIN))
        cw, ch = box[2] - box[0], box[3] - box[1]

        # 我们渲染的裁框（合成到深底）
        rgb = Image.new("RGB", (W, H), BG)
        rgb.paste(ren.convert("RGB"), mask=ren.getchannel("A"))
        ours = rgb.crop(box)

        # AI 图 → 对到我们的人物框
        sh = Image.open(shp).convert("RGB")
        sb = char_bbox(sh)
        own = (MARGIN, MARGIN, MARGIN + (rb[2] - rb[0]), MARGIN + (rb[3] - rb[1]))
        k = ((own[3] - own[1]) / (sb[3] - sb[1]) + (own[2] - own[0]) / (sb[2] - sb[0])) / 2
        sh2 = sh.resize((round(sh.width * k), round(sh.height * k)), Image.LANCZOS)
        sb2 = char_bbox(sh2)

        ai = Image.new("RGB", (cw, ch), BG)
        ai.paste(sh2, (own[0] - sb2[0], own[1] - sb2[1]))

        # 亮度比 → 模糊 → 夹范围
        lo_a, lo_o = luma(ai), luma(ours)
        ra, ro = lo_a.load(), lo_o.load()
        ratio = Image.new("L", (cw, ch), 128)
        rp = ratio.load()
        for y in range(ch):
            for x in range(cw):
                den = ro[x, y]
                if den < 12:            # 背景/近黑不参与
                    rp[x, y] = 128
                    continue
                v = ra[x, y] / den
                v = max(a.lo, min(a.hi, v))
                rp[x, y] = int(round(v / a.hi * 255))   # 存到 0..255 便于模糊
        ratio = ratio.filter(ImageFilter.GaussianBlur(a.blur))
        # 乘回我们自己的渲染
        rp = ratio.load()
        op = ours.load()
        out = Image.new("RGB", (cw, ch), BG)
        wp = out.load()
        for y in range(ch):
            for x in range(cw):
                f = (rp[x, y] / 255.0) * a.hi
                r, g, b = op[x, y]
                wp[x, y] = (min(255, round(r * f)), min(255, round(g * f)), min(255, round(b * f)))

        comp = Image.new("RGB", (W, H), BG)
        comp.paste(out, (box[0], box[1]))
        compf = VIEWS / f"{d}_comp_ratio.raw"
        compf.write_bytes(comp.convert("RGBA").tobytes())

        tx = OUTTEX / f"tex_{d}.raw"
        r = subprocess.run(["node", str(ROOT / "tools/glb2d/backfill_tex.mjs"),
                            "--mode", a.mode, "--tex", str(TEX_BASE), "--tw", str(TW), "--th", str(TH),
                            "--out", str(tx), "--splat", "2", "--w", str(W), "--h", str(H),
                            "--view", str(compf), str(VIEWS / f"{d}.raw.uv"),
                            str(VIEWS / f"{d}.normal"), str(VIEWS / f"{d}.raw.shade")],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit(f"回填失败 {d}:\n{r.stderr[-1200:]}")
        print(f"  {d:10s} k={k:.4f} blur={a.blur} 范围[{a.lo},{a.hi}] → {tx.name}")
    print("→", OUTTEX)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
