#!/usr/bin/env python3
"""T45 批 2a · up/side 锚归一：包络高 256、底边贴 y=300、质心 x=120（口径与批 0 定锚实测一致）"""
from PIL import Image
import json, sys

CANVAS = (240, 320)
TARGET_H = 256
BASELINE_Y = 300  # 底边贴 y=300（最后占用行 299）
CENTROID_X = 120.0

def normalize(src, dst):
    im = Image.open(src).convert("RGBA")
    a = im.split()[3]
    bbox = a.getbbox()
    if bbox is None:
        return {"src": src, "GATE": "FAIL_EMPTY"}
    l, t, r, b = bbox
    env_w, env_h = r - l, b - t
    scale = TARGET_H / env_h
    new_w = max(1, round(env_w * scale))
    crop = im.crop(bbox)
    crop = crop.resize((new_w, TARGET_H), Image.LANCZOS)
    ca = crop.split()[3]
    cb = ca.getbbox()
    cl, ct, cr, cb_ = cb
    # 质心 x（crop 坐标）
    px = list(ca.getdata())
    w = crop.width
    sx = 0; n = 0
    for i, v in enumerate(px):
        if v > 0:
            sx += i % w; n += 1
    cx = sx / n
    off_x = round(CENTROID_X - cx)
    off_y = BASELINE_Y - TARGET_H  # 顶行 = 300-256 = 44
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.paste(crop, (off_x, off_y), crop)
    canvas.save(dst)
    # 复测
    fa = canvas.split()[3]
    fb = fa.getbbox()
    px2 = list(fa.getdata())
    sx2 = 0; n2 = 0
    for i, v in enumerate(px2):
        if v > 0:
            sx2 += i % CANVAS[0]; n2 += 1
    res = {
        "src": src, "dst": dst,
        "src_env": [env_w, env_h], "scale": round(scale, 4),
        "dst_env_w": fb[2] - fb[0], "dst_env_h": fb[3] - fb[1],
        "bottom_last_row": fb[3] - 1,
        "centroid_x": round(sx2 / n2, 1),
        "ratio_wh": round((fb[2] - fb[0]) / (fb[3] - fb[1]), 3),
        "gate_nonempty": n2 > 0,
        "gate_height_256": abs((fb[3] - fb[1]) - TARGET_H) <= 1,
        "gate_baseline_300": fb[3] - 1 == BASELINE_Y - 1,
        "gate_centroid_120": abs(sx2 / n2 - CENTROID_X) <= 1.0,
    }
    res["ratio_band_038_055"] = 0.38 <= res["ratio_wh"] <= 0.55
    return res

if __name__ == "__main__":
    out = []
    for pair in [("assets/_trial_20260904/t45_batch2/anchor45_up_cut.png",
                  "assets/_trial_20260904/t45_batch2/anchor45_up.png"),
                 ("assets/_trial_20260904/t45_batch2/anchor45_side_cut.png",
                  "assets/_trial_20260904/t45_batch2/anchor45_side.png")]:
        out.append(normalize(*pair))
    print(json.dumps(out, ensure_ascii=False, indent=1))
