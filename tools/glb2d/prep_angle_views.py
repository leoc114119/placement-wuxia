#!/usr/bin/env python3
"""把美术线交的 AI 增强角度图配准回源渲染图坐标系，并套源 alpha。

为什么要配准：生成模型**一定会把人物放大**（实测 yaw270 +6.1%，其余 7 张类似），
不配准就直接回填，颜色会写到错的纹素上（贴图被抹花）。
配准口径：非背景色差掩膜求 bbox → 等比缩放 + 平移，不用二参数搜索（模型是整体缩放，bbox 已足够稳）。

用法：python3 prep_angle_views.py
输出：assets/_trial_20260912/贴图回填_美术线输入/配准后/view_yaw###_reg.raw  (+ .png 供人眼核对)
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "assets/_trial_20260912/贴图回填_美术线输入"
SRC = BASE / "角度图"
ALPHA = BASE / "alpha"
DELIV = BASE / "交付"
OUT = BASE / "配准后"
BG = (20, 20, 24)
YAW = (0, 45, 90, 135, 180, 225, 270, 315)
# 俯仰环：up25_* 俯视 25°（看头顶，水平环看不到）；dn20_* 仰视 20°（看下巴/腋下）
PITCHED = tuple([f"up25_yaw{y:03d}" for y in YAW] + [f"dn20_yaw{y:03d}" for y in (45, 135, 225, 315)])
SRC_P = BASE / "角度图_俯仰"
ALPHA_P = BASE / "alpha_俯仰"


def bgmask(im: Image.Image, thr: int = 20) -> Image.Image:
    """背景距离掩膜。不能用亮度阈值——深色头发会被整块漏掉。"""
    px = im.convert("RGB").load()
    w, h = im.size
    o = Image.new("L", (w, h), 0)
    po = o.load()
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if abs(p[0] - BG[0]) + abs(p[1] - BG[1]) + abs(p[2] - BG[2]) > thr:
                po[x, y] = 255
    return o


def report(name: str, src_dir: Path, alpha_dir: Path) -> dict:
    src = Image.open(src_dir / f"{name}.png").convert("RGB")
    alpha = Image.open(alpha_dir / f"{name}_alpha.png").convert("L")
    ai = Image.open(DELIV / f"raw_{name}_imagegen.png").convert("RGB")

    sb = bgmask(src).getbbox()
    rb = bgmask(ai).getbbox()
    if not sb or not rb:
        raise SystemExit(f"{name}: 掩膜为空")
    k = ((sb[3] - sb[1]) / (rb[3] - rb[1]) + (sb[2] - sb[0]) / (rb[2] - rb[0])) / 2
    ai2 = ai.resize((round(ai.size[0] * k), round(ai.size[1] * k)), Image.Resampling.LANCZOS)
    rb2 = bgmask(ai2).getbbox()
    canvas = Image.new("RGB", src.size, BG)
    canvas.paste(ai2, (sb[0] - rb2[0], sb[1] - rb2[1]))

    am = alpha.point(lambda v: 255 if v > 32 else 0)
    out = Image.composite(canvas, Image.new("RGB", src.size, BG), am)   # 套源 alpha
    out512 = out.convert("RGBA")
    out512.putalpha(alpha)
    OUT.mkdir(parents=True, exist_ok=True)
    out512.save(OUT / f"{name}_reg.png")

    # 几何：轮廓 IoU（用背景距离掩膜，不用亮度）
    m = ImageChops.multiply(bgmask(out), am)
    inter = ImageStat.Stat(m).sum[0] / 255
    u = ImageStat.Stat(bgmask(out)).sum[0] / 255 + ImageStat.Stat(am).sum[0] / 255 - inter
    # 配色：大半径模糊后比（逐像素色差会把"加的细节"也算成色偏，口径错）
    from PIL import ImageFilter
    ds = ImageChops.difference(src.filter(ImageFilter.GaussianBlur(10)),
                               out.filter(ImageFilter.GaussianBlur(10))).convert("L")
    sel = [p for p, q in zip(ds.getdata(), am.getdata()) if q]
    # 细节：主体内部腐 3px 梯度
    def grad(im):
        g = im.convert("L")
        dx = ImageChops.difference(g, ImageChops.offset(g, 1, 0))
        dy = ImageChops.difference(g, ImageChops.offset(g, 0, 1))
        mm = am.filter(ImageFilter.MinFilter(7))
        z = Image.new("L", im.size, 0)
        return (ImageStat.Stat(Image.composite(dx, z, mm)).mean[0]
                + ImageStat.Stat(Image.composite(dy, z, mm)).mean[0]) / 2
    gs, ga = grad(src), grad(out)
    return {"name": name, "scale": round(k, 4), "iou": round(inter / u, 4),
            "colorBlurDelta": round(sum(sel) / len(sel), 2),
            "detailSrc": round(gs, 4), "detailOut": round(ga, 4),
            "detailGainPct": round((ga / gs - 1) * 100, 1)}


if __name__ == "__main__":
    rows = []
    jobs = [(f"view_yaw{y:03d}", SRC, ALPHA) for y in YAW] + [(n, SRC_P, ALPHA_P) for n in PITCHED]
    for name, sd, ad in jobs:
        r = report(name, sd, ad)
        rows.append(r)
        print("%-16s 配准缩放 %.4f  IoU %.4f  配色漂移 %5.2f/255  细节 %+.1f%%"
              % (r["name"], r["scale"], r["iou"], r["colorBlurDelta"], r["detailGainPct"]))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "register_report.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    ok = all(r["iou"] >= 0.85 and r["colorBlurDelta"] <= 8 and r["detailGainPct"] > 0 for r in rows)
    print("\n门检：IoU≥0.85 且 配色漂移≤8 且 细节>0  →", "全部通过" if ok else "有未过项，见上表")
