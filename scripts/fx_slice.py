#!/usr/bin/env python3
"""光影素材等分切帧管线（老网金系纵向胶带 BMP → 透明 PNG 单元库）。

已验证规律（09-08 PM）：
- 每张 BMP = 纵向逐帧播放长条，帧数 6~13；例 KF1/1-1.bmp=150x1650=11 帧 x150x150
- 帧高判定 = 对 6..13 中整除候选算切割线行亮度，取边界亮度最低者（正确帧高切在帧间暗隙）
- tie-break：边界亮度接近时取宽高比更接近 1:1；仍难分（差距<20%）标 ambiguous 并附次优切分
- 黑底加色光效 → 亮度转 alpha（max(R,G,B) 为亮度，RGB 保留原色）

用法：
  python3 scripts/fx_slice.py <输入目录> <输出目录> [--kf-label KF1]
幂等可重跑（输出目录已存在则覆盖同名文件）。
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw

CAND_N = range(6, 14)  # 帧数候选 6~13
AMBIG_RATIO = 0.20     # 最优与次优 boundary_score 差距小于此值 → ambiguous
EMPTY_ALPHA_MAX = 2    # 全帧 alpha 最大值低于此 → 判空帧跳过


def luminance(px):
    return max(px[0], px[1], px[2])


def boundary_score(im_l, n):
    """帧数 n 的切割线行亮度均分（0=全暗最优，1=全亮最差）。"""
    W, H = im_l.size
    px = im_l.load()
    fh = H // n
    cuts = []
    step = max(1, W // 40)  # 采样 ≤40 列/行，够判暗隙
    for k in range(1, n):
        y = min(k * fh, H - 1)
        y2 = max(0, k * fh - 1)
        b = max(max(px[x, y] for x in range(0, W, step)),
                max(px[x, y2] for x in range(0, W, step)))
        cuts.append(b)
    return (sum(cuts) / len(cuts)) / 255.0


def detect_frames(im):
    """返回 (best_n, best_score, alt_n, alt_score)。"""
    W, H = im.size
    cands = []
    for n in CAND_N:
        if H % n != 0:
            continue
        fh = H // n
        ratio = abs(W / fh - 1.0)  # 宽高比接近 1:1 优先
        cands.append((n, boundary_score(im.convert("L"), n), ratio))
    if not cands:
        return None, None, None, None
    # 主排序：边界亮度；次排序：宽高比
    cands.sort(key=lambda c: (round(c[1], 4), c[2]))
    best = cands[0]
    alt = cands[1] if len(cands) > 1 else (None, None, None)
    return best[0], best[1], alt[0], alt[1]


def slice_one(src, out_dir, prefix):
    im = Image.open(src)
    if im.mode == "P":
        im = im.convert("RGB")
    elif im.mode != "RGB":
        im = im.convert("RGB")
    W, H = im.size
    n, score, alt_n, alt_score = detect_frames(im)
    if n is None:
        return {"file": prefix, "size": [W, H], "error": "no divisible candidate"}
    ambiguous = alt_n is not None and alt_score is not None and abs(score - alt_score) < AMBIG_RATIO
    fh = H // n
    frames = []
    px_src = im.load()
    for i in range(n):
        frame = Image.new("RGBA", (W, fh))
        px_out = frame.load()
        for y in range(fh):
            for x in range(W):
                r, g, b = px_src[x, i * fh + y]
                a = luminance((r, g, b))
                px_out[x, y] = (r, g, b, a)
        alpha_max = frame.getchannel("A").getextrema()[1]
        entry = {"frame": i + 1, "h": fh, "empty": alpha_max <= EMPTY_ALPHA_MAX}
        if not entry["empty"]:
            frame.save(os.path.join(out_dir, f"{prefix}_f{i + 1:02d}.png"))
        frames.append(entry)
    return {
        "file": prefix, "size": [W, H], "frames": n, "frame_h": fh,
        "boundary_score": round(score, 4),
        "alt_candidate": {"frames": alt_n, "score": round(alt_score, 4) if alt_score is not None else None},
        "ambiguous": ambiguous, "empty_frames": sum(1 for f in frames if f["empty"]),
        "saved": sum(1 for f in frames if not f["empty"]),
    }


def contact_sheet(out_dir, manifest_items, out_png, thumb=90, cols=12):
    items = [m for m in manifest_items if m.get("saved", 0) > 0]
    if not items:
        return
    rows = (len(items) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * (thumb + 6), rows * (thumb + 22)), (25, 25, 25))
    d = ImageDraw.Draw(canvas)
    for idx, m in enumerate(items):
        first = os.path.join(out_dir, f"{m['file']}_f01.png")
        if not os.path.exists(first):
            continue
        im = Image.open(first).convert("RGBA")
        im.thumbnail((thumb, thumb))
        cx, cy = (idx % cols) * (thumb + 6), (idx // cols) * (thumb + 22)
        canvas.paste(im, (cx + 3, cy + 18), im)
        mark = "?" if m.get("ambiguous") else ""
        d.text((cx + 2, cy + 3), f"{m['file']} {m['frames']}f{mark}", fill=(255, 210, 120))
    canvas.save(out_png)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("in_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--kf-label", default=None)
    args = ap.parse_args()
    label = args.kf_label or os.path.basename(os.path.normpath(args.in_dir))
    units_dir = os.path.join(args.out_dir, "units", label.lower())
    os.makedirs(units_dir, exist_ok=True)
    bm_files = sorted(f for f in os.listdir(args.in_dir) if f.lower().endswith(".bmp"))
    if not bm_files:
        print("输入目录无 BMP")
        sys.exit(1)
    items = []
    for f in bm_files:
        prefix = os.path.splitext(f)[0]
        items.append(slice_one(os.path.join(args.in_dir, f), units_dir, prefix))
    manifest = {
        "label": label, "sources": len(bm_files),
        "total_frames": sum(m.get("frames", 0) for m in items if "frames" in m),
        "saved_frames": sum(m.get("saved", 0) for m in items),
        "ambiguous": [m["file"] for m in items if m.get("ambiguous")],
        "errors": [m["file"] for m in items if "error" in m],
        "items": items,
    }
    with open(os.path.join(units_dir, "manifest.json"), "w") as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=1)
    contact_sheet(units_dir, items, os.path.join(args.out_dir, f"{label.lower()}_contact.png"))
    print(f"[{label}] 源文件 {len(bm_files)} 张 → 判定总帧数 {manifest['total_frames']}，"
          f"存出 {manifest['saved_frames']} 帧，ambiguous {len(manifest['ambiguous'])} 张，"
          f"错误 {len(manifest['errors'])} 张")
    print(f"manifest: {units_dir}/manifest.json")
    print(f"contact: {args.out_dir}/{label.lower()}_contact.png")


if __name__ == "__main__":
    main()
