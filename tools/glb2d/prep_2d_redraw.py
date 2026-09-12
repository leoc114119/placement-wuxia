#!/usr/bin/env python3
"""2D 重绘成品的落地：配准到 3D 姿势锚 → 缩到 240×320 → 地面归一化 → 门检。

为什么必须配准（不能直接缩）：
  生成模型输出的尺寸是随机的（实测 1086×1448），人物在画布里的占位也不固定。
  若直接 resize 到 240×320，比例就跟着生成模型走 —— 正是我们要避免的。
  所以一律以 **3D 姿势锚** 为基准：等比缩放（高度对齐锚）+ 平移（水平居中、脚底对齐），
  缩放恒为**等比**（不做非等比拉伸），因此画出来的形状不会被扭。

地面归一化：整批帧统一平移到「最深脚底 = 299」，与现有素材一致。

用法：
  python3 prep_2d_redraw.py <ai_out_dir> <anchor_dir> <out_dir> --prefix idle --anchor-pattern 'idle_{dir}_{i}.png' --ai-pattern 'idle_{dir}_{i}.png'
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import statistics
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat

FRAME = (240, 320)
BG = (20, 20, 24)
GROUND = 299
DIRS = ("left", "leftdown", "leftup", "right", "rightdown", "rightup")


def bg_bbox(im: Image.Image, thr: int = 30):
    im = im.convert("RGB")
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            p = px[x, y]
            if abs(p[0] - BG[0]) + abs(p[1] - BG[1]) + abs(p[2] - BG[2]) > thr:
                xs.append(x); ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def alpha_bbox(im: Image.Image):
    return im.convert("RGBA").getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox()


def anchor_bbox(path: Path):
    """3D 锚是 240×320 RGBA（有 alpha 用 alpha，否则用背景距离）"""
    im = Image.open(path).convert("RGBA")
    a = im.getchannel("A")
    if a.getextrema()[0] < 250:
        return alpha_bbox(im)
    return bg_bbox(im)


def register(ai: Image.Image, abox, tbox):
    """等比缩放使高度对齐锚，再平移到「水平居中 + 脚底对齐」。返回 240×320 RGBA。"""
    ah = abox[3] - abox[1]
    th = tbox[3] - tbox[1]
    s = th / ah
    resized = ai.convert("RGBA").resize((max(1, round(ai.size[0] * s)), max(1, round(ai.size[1] * s))),
                                        Image.Resampling.LANCZOS)
    rb = bg_bbox(resized) if resized.getchannel("A").getextrema()[0] >= 250 else alpha_bbox(resized)
    canvas = Image.new("RGBA", FRAME, BG + (255,))
    dx = round((tbox[0] + tbox[2]) / 2 - (rb[0] + rb[2]) / 2)
    dy = round(tbox[3] - rb[3])
    canvas.alpha_composite(resized, (dx, dy))
    return key_alpha(canvas)


def key_alpha(im: Image.Image, thr: int = 30) -> Image.Image:
    """按背景色抠出人物 alpha：背景距离 > thr 为前景；再从画布四边泛洪，没被泛到的空洞填实。"""
    rgb = im.convert("RGB"); px = rgb.load(); w, h = im.size
    fg = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            fg[y][x] = abs(p[0]-BG[0]) + abs(p[1]-BG[1]) + abs(p[2]-BG[2]) > thr
    # 从边框泛洪背景，填内部空洞（人物身上的暗色块不应被抠掉）
    seen = [[False] * w for _ in range(h)]
    stack = [(x, 0) for x in range(w)] + [(x, h-1) for x in range(w)] + \
            [(0, y) for y in range(h)] + [(w-1, y) for y in range(h)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x] or fg[y][x]:
            continue
        seen[y][x] = True
        stack += [(x+1, y), (x-1, y), (x, y+1), (x, y-1)]
    out = im.convert("RGBA").copy(); po = out.load()
    for y in range(h):
        for x in range(w):
            po[x, y] = (po[x, y][0], po[x, y][1], po[x, y][2], 255 if (fg[y][x] or not seen[y][x]) else 0)
    return out


def metrics(im: Image.Image):
    a = im.getchannel("A"); m = a.point(lambda v: 255 if v > 128 else 0)
    inner = m.filter(ImageFilter.MinFilter(9))
    g = im.convert("L"); z = Image.new("L", im.size, 0)
    dx = ImageChops.difference(g, ImageChops.offset(g, 1, 0))
    dy = ImageChops.difference(g, ImageChops.offset(g, 0, 1))
    sharp = (ImageStat.Stat(Image.composite(dx, z, inner)).mean[0]
             + ImageStat.Stat(Image.composite(dy, z, inner)).mean[0]) / 2
    return sharp, ImageStat.Stat(Image.composite(g, z, inner)).stddev[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ai_dir"); ap.add_argument("anchor_dir"); ap.add_argument("out_dir")
    ap.add_argument("--ai-pattern", default="{dir}_{i}.png")
    ap.add_argument("--anchor-pattern", default="{dir}_{i}.png")
    ap.add_argument("--action", default="idle")
    a = ap.parse_args()
    ai_dir, anc_dir, out_dir = Path(a.ai_dir), Path(a.anchor_dir), Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rows, frames = [], []
    for d in DIRS:
        for i in range(1, 6):
            ap_ = ai_dir / a.ai_pattern.format(dir=d, i=i)
            an_ = anc_dir / a.anchor_pattern.format(dir=d, i=i)
            if not ap_.exists() or not an_.exists():
                rows.append({"dir": d, "i": i, "status": "MISSING",
                             "ai": str(ap_), "anchor": str(an_)})
                continue
            ai = Image.open(ap_).convert("RGBA")
            ab = bg_bbox(ai) if ai.getchannel("A").getextrema()[0] >= 250 else alpha_bbox(ai)
            tb = anchor_bbox(an_)
            out = register(ai, ab, tb)
            s, c = metrics(out)
            frames.append((d, i, out))
            rows.append({"dir": d, "i": i, "status": "OK", "aiSize": list(ai.size),
                         "aiBbox": list(ab), "anchorBbox": list(tb),
                         "sharp": round(s, 3), "contrast": round(c, 1)})

    # 地面归一化：整批平移到最深脚底 = 299
    if frames:
        bots = []
        for d, i, im in frames:
            b = alpha_bbox(im)
            bots.append(b[3])
        shift = GROUND - max(bots)
        for d, i, im in frames:
            canvas = Image.new("RGBA", FRAME, (0, 0, 0, 0))
            canvas.alpha_composite(im, (0, shift))
            canvas.save(out_dir / f"{a.action}_{d}_{i}.png")
        for r in rows:
            r["groundShift"] = shift

    (out_dir / "prep_report.json").write_text(json.dumps(
        {"action": a.action, "groundShift": (GROUND - max(bots)) if frames else None, "rows": rows},
        ensure_ascii=False, indent=2) + "\n")

    # 门检汇总
    hs = {}
    for d, i, im in frames:
        b = alpha_bbox(im)
        hs.setdefault(d, []).append(b[3] - b[1])
    print(f"落地 {len(frames)} 帧 → {out_dir}")
    if frames:
        print(f"地面归一化平移 {GROUND - max(bots)} px")
        worst = max((max(v) - min(v)) / (sum(v) / len(v)) for v in hs.values())
        print(f"跨帧/跨向 高度极差最大值 {worst*100:.1f}%")


if __name__ == "__main__":
    main()
