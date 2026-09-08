#!/usr/bin/env python3
"""光影素材等分切帧管线 v2（老网金系纵向胶带 BMP → 透明 PNG 单元库）。

已验证规律（09-08 Leo 实证 + KF1 全量普查 149/154）：
- 帧高 = 帧宽（正方形帧）：h % w == 0 → n = h/w，帧数不限于 6~13（见过 25 帧）
- 质检：每条内部切割线 ±1 行的最大亮度 ≤55 视为切在帧间暗隙（PASS）；
  >55 标 suspicious（多为白雾/火光类光效溢出，切法通常仍正确，交目验）
- h % w != 0 的个案（如 320x2160）：扫全部整除候选（帧高 ≥ 宽/2），
  取切割线全暗候选中帧高最小者（大帧高会"连多帧为一块"仍全暗，故取最小）
- 黑底加色光效 → 亮度转 alpha（max(R,G,B) 为亮度，RGB 保留原色）
- 一条带可能混多段动画（如 114-1 = 前 13 帧绿弧 + 后 12 帧紫爆），归类阶段按段拆

用法：
  python3 scripts/fx_slice.py <输入目录> <输出目录> [--kf-label KF1]
幂等性：重跑前请先删除输出 units/<label>/（旧帧文件不自动清理）。
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageChops, ImageDraw

PASS_CUT_MAX = 55     # 切线 ±1 行最大亮度 ≤ 此值 → PASS
EMPTY_ALPHA_MAX = 2   # 全帧 alpha 最大值低于此 → 判空帧跳过
MIN_FRAMES, MAX_FRAMES = 1, 40


def cut_max(im_l, fh, n):
    """帧高 fh 切 n 帧时，内部切割线 ±1 行的最大亮度。"""
    W, H = im_l.size
    mx = 0
    for k in range(1, n):
        y = k * fh
        box = im_l.crop((0, max(0, y - 1), W, min(H, y + 2)))
        mx = max(mx, box.getextrema()[1])
    return mx


def detect_frame_h(im_l):
    """返回 (frame_h, n, detect, cut_max)。

    detect: square-single(单帧方形) / square(正方形等分) / scan(整除候选扫描)
    """
    W, H = im_l.size
    if H == W:
        return H, 1, "square-single", 0
    if H % W == 0:
        n = H // W
        if MIN_FRAMES <= n <= MAX_FRAMES:
            mx = cut_max(im_l, W, n)
            return W, n, "square", mx
    best = None  # (cut_max, fh, n)
    for n in range(2, MAX_FRAMES + 1):
        if H % n != 0:
            continue
        fh = H // n
        if fh < max(W // 2, 24) or fh > H // MIN_FRAMES:
            continue
        mx = cut_max(im_l, fh, n)
        # 全暗候选里取帧高最小（帧数最多）；否则取最暗
        key = (mx, fh if mx == 0 else 0, fh)
        if best is None or key < best:
            best = (mx, fh, n)
    if best is None:
        # 纵向无整除候选（如横向多剑排布的 16:9 单图）→ 整张作单帧保留
        return H, 1, "single", 0
    mx, fh, n = best
    status_mx = mx if mx <= PASS_CUT_MAX else mx  # scan 个案如实报告
    return fh, n, "scan", status_mx


def to_rgba(im):
    """黑底加色光效：alpha = max(R,G,B)。纯 C 通道运算。"""
    r, g, b = im.convert("RGB").split()
    a = ImageChops.lighter(ImageChops.lighter(r, g), b)
    return Image.merge("RGBA", (r, g, b, a))


def slice_one(src, out_dir, prefix):
    im = Image.open(src)
    W, H = im.size
    fh, n, detect, mx = detect_frame_h(im.convert("L"))
    if fh is None:
        return {"file": prefix, "size": [W, H], "error": "no divisible candidate"}
    status = "ok"
    if detect == "square" and mx > PASS_CUT_MAX:
        status = "suspicious"
    elif detect == "scan":
        status = "scan-ok" if mx <= PASS_CUT_MAX else "scan-suspicious"
    frames = []
    rgba = to_rgba(im)
    for i in range(n):
        frame = rgba.crop((0, i * fh, W, (i + 1) * fh))
        alpha_max = frame.getchannel("A").getextrema()[1]
        entry = {"frame": i + 1, "h": fh, "empty": alpha_max <= EMPTY_ALPHA_MAX}
        if not entry["empty"]:
            frame.save(os.path.join(out_dir, f"{prefix}_f{i + 1:02d}.png"))
        frames.append(entry)
    return {
        "file": prefix, "size": [W, H], "frames": n, "frame_h": fh,
        "detect": detect, "cut_max": mx, "status": status,
        "empty_frames": sum(1 for f in frames if f["empty"]),
        "saved": sum(1 for f in frames if not f["empty"]),
    }


def contact_pages(out_dir, items, out_base, per_page=16, frame_h=64):
    """每行 = 一条源的完整非空帧序横排；每页 per_page 行，输出 <base>_pN.png。"""
    items = [m for m in items if m.get("saved", 0) > 0]
    pages = []
    for p in range(0, len(items), per_page):
        chunk = items[p:p + per_page]
        rows = []
        for m in chunk:
            imgs = []
            for i in range(1, m["frames"] + 1):
                fp = os.path.join(out_dir, f"{m['file']}_f{i:02d}.png")
                if os.path.exists(fp):
                    im = Image.open(fp).convert("RGBA")
                    im.thumbnail((frame_h, frame_h))
                    imgs.append(im)
            if imgs:
                rows.append((m, imgs))
        if not rows:
            continue
        row_w = max(sum(x.width + 2 for x in imgs) for _, imgs in rows)
        W = max(row_w, 360) + 8
        H = sum(frame_h + 20 for _ in rows) + 8
        canvas = Image.new("RGB", (W, H), (60, 60, 66))
        d = ImageDraw.Draw(canvas)
        y = 4
        for m, imgs in rows:
            d.text((4, y), f"{m['file']}  {m['frames']}f h{m['frame_h']} [{m['status']}]",
                   fill=(255, 210, 120))
            x = 4
            for im in imgs:
                canvas.paste(im, (x, y + 14), im)
                d.rectangle([x, y + 14, x + im.width - 1, y + 14 + im.height - 1],
                            outline=(180, 180, 190))
                x += im.width + 2
            y += frame_h + 20
        fp = f"{out_base}_p{len(pages) + 1}.png"
        canvas.save(fp)
        pages.append(fp)
    return pages


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
        "status": {s: sum(1 for m in items if m.get("status") == s)
                   for s in {m.get("status") for m in items} if s},
        "errors": [m["file"] for m in items if "error" in m],
        "items": items,
    }
    with open(os.path.join(units_dir, "manifest.json"), "w") as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=1)
    pages = contact_pages(units_dir, items, os.path.join(args.out_dir, f"{label.lower()}_contact"))
    print(f"[{label}] 源文件 {len(bm_files)} 张 → 判定总帧数 {manifest['total_frames']}，"
          f"存出 {manifest['saved_frames']} 帧")
    print(f"  状态分布: {manifest['status']}")
    print(f"manifest: {units_dir}/manifest.json")
    for p in pages:
        print(f"contact: {p}")


if __name__ == "__main__":
    main()
