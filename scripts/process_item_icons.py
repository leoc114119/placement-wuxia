#!/usr/bin/env python3
"""process_item_icons.py — 物品图标加工管线（T14 P2 · 任务 A）

raw(白底 1K) → 泛洪抠图(保内白) → 128×128 透明画布（主体长边≈60% 居中）
并输出风格门客观指标：金色主色（加权平均）与 #C9A227 的色距、主体覆盖率。

用法:
  python3 scripts/process_item_icons.py <raw.png> <out.png> [--canvas 128] [--ratio 0.60]
"""
import colorsys
import sys
from PIL import Image, ImageDraw

SENTINEL = (0, 255, 0)
THRESH = 60  # 近白阈值（欧氏距离），与 cutout_white_bg.py 一致
GOLD_REF = (0xC9, 0xA2, 0x27)


def flood_cutout(im_rgb: Image.Image) -> Image.Image:
    """四角泛洪标记背景 → 背景透明（保留物件内部被轮廓封闭的白色）。"""
    w, h = im_rgb.size
    mask = im_rgb.copy()
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(mask, corner, SENTINEL, thresh=THRESH)
    rgba = im_rgb.convert("RGBA")
    px, mp = rgba.load(), mask.load()
    for y in range(h):
        for x in range(w):
            if mp[x, y] == SENTINEL:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    return rgba


def normalize(rgba: Image.Image, canvas: int, ratio: float) -> tuple[Image.Image, tuple]:
    """裁到主体 bbox，长边缩至 canvas*ratio，居中放透明画布。返回(成品, bbox)。"""
    bbox = rgba.getbbox()  # 基于 alpha
    sub = rgba.crop(bbox)
    target = round(canvas * ratio)
    m = max(sub.size)
    scale = target / m
    sub = sub.resize((max(1, round(sub.width * scale)), max(1, round(sub.height * scale))),
                     Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(sub, ((canvas - sub.width) // 2, (canvas - sub.height) // 2), sub)
    return out, bbox


def gold_stats(rgba: Image.Image) -> dict:
    """不透明像素的加权平均色、与 #C9A227 的色距(HSV hue 差 + 明度差)、覆盖率。"""
    px = rgba.load()
    w, h = rgba.size
    rs = gs = bs = n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 128:
                rs += r; gs += g; bs += b; n += 1
    if n == 0:
        return {"coverage": 0.0}
    avg = (rs / n, gs / n, bs / n)
    hh, ss, vv = colorsys.rgb_to_hsv(*[c / 255 for c in avg])
    hr, sr, vr = colorsys.rgb_to_hsv(*[c / 255 for c in GOLD_REF])
    hue_deg = abs(hh - hr) * 360
    hue_deg = min(hue_deg, 360 - hue_deg)
    return {"avg_rgb": tuple(round(c) for c in avg), "hue_diff_deg": round(hue_deg, 1),
            "val_diff": round(abs(vv - vr), 3), "sat": round(ss, 3),
            "coverage": round(n / (w * h), 3)}


def main():
    raw_path, out_path = sys.argv[1], sys.argv[2]
    canvas = int(sys.argv[sys.argv.index("--canvas") + 1]) if "--canvas" in sys.argv else 128
    ratio = float(sys.argv[sys.argv.index("--ratio") + 1]) if "--ratio" in sys.argv else 0.60
    im = Image.open(raw_path).convert("RGB")
    rgba = flood_cutout(im)
    out, bbox = normalize(rgba, canvas, ratio)
    out.save(out_path)
    st = gold_stats(out)
    print(f"OK {out_path} bbox={bbox} stats={st}")


if __name__ == "__main__":
    main()
