#!/usr/bin/env python3
"""行走帧正规管线：raw AI 单姿势图 → 泛洪抠图 → 羽化 → 高度归一 →
脚底/质心双对齐 → 统一画布 → 4 帧循环合成 → 镜像派生 → 校验门 → contact sheet。

规范依据：docs/reviews/交接-ZCode-家场景垂直切片-2026-09-01.md §4（12 条踩坑规范）
- 抠图=边缘泛洪连通性（禁纯亮度阈值，防白衣抠穿）
- 统一画布+人物高度归一+脚底/质心双对齐（禁逐帧 bbox 裁切成品）
- height 定尺；right=left 镜像不单独生成
- 校验门：非空/高度/脚底基线/质心/边缘裁切，任一失败 exit 1

用法：
  python3 build_walk_frames.py --root assets/characters/hero/walk_v2 --dirs down up right
"""
import argparse, json, os, sys
from PIL import Image, ImageDraw

# ---- 输出画布规格（统一网格，height 定尺）----
CANVAS_W, CANVAS_H = 240, 320
CHAR_H = 256            # 人物归一视觉高度
BASELINE_Y = 300        # 脚底基线
CENTER_X = 120          # 质心 x

WHITE = 236             # >= 视为背景白（L 通道）
FEATHER_L = 200         # 贴透明区的亮像素羽化阈值
FEATHER_ALPHA = 130

# 方向 → 三姿势 raw 文件名前缀（side_* 面朝右 = right 向；left 镜像派生）
POSES = {
    "down":  ["down_stand", "down_stepA", "down_stepB"],
    "up":    ["up_stand", "up_stepA", "up_stepB"],
    "right": ["side_stand", "side_stepA", "side_stepB"],
}
LOOP = [0, 1, 0, 2]     # 站→迈A→站→迈B


def flood_cut(im):
    """边缘泛洪抠图：从四角+四边中点播种，连通近白区域 → 全透明。
    返回 RGBA。轮廓封闭的内部白色（白衣）不受影响。"""
    g = im.convert("L")
    binimg = g.point(lambda v: 255 if v >= WHITE else 0)
    d = ImageDraw.floodfill
    w, h = binimg.size
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
                 (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if binimg.getpixel(seed) == 255:
            d(binimg, seed, 1, thresh=12)
    rgba = im.convert("RGBA")
    px = rgba.load()
    bp = binimg.load()
    n_bg = 0
    for y in range(h):
        for x in range(w):
            if bp[x, y] == 1:
                px[x, y] = (0, 0, 0, 0)
                n_bg += 1
    return feather(rgba), n_bg


def feather(rgba):
    """规范#11：贴透明区的亮像素半透明衰减（去白边光晕）"""
    w, h = rgba.size
    px = rgba.load()
    edge = []
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] == 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    edge.append((x, y))
                    break
    for (x, y) in edge:
        p = px[x, y]
        if (p[0] + p[1] + p[2]) / 3 > FEATHER_L:
            px[x, y] = (p[0], p[1], p[2], FEATHER_ALPHA)
    return rgba


def align(cut):
    """高度归一到 CHAR_H + 脚底/质心双对齐到统一画布。返回 (frame, metrics)"""
    bbox = cut.getbbox()
    if bbox is None:
        raise ValueError("cutout 全透明")
    x0, y0, x1, y1 = bbox
    ch = cut.crop(bbox)
    s = CHAR_H / (y1 - y0)
    nw, nh = max(1, round(ch.width * s)), max(1, round(ch.height * s))
    ch = ch.resize((nw, nh), Image.LANCZOS)
    # alpha 质心 x
    px = ch.load()
    sum_a = sum_ax = 0
    for y in range(nh):
        for x in range(nw):
            a = px[x, y][3]
            sum_a += a
            sum_ax += a * x
    cx_local = sum_ax / sum_a if sum_a else nw / 2
    frame = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    px_x = round(CENTER_X - cx_local)
    px_y = BASELINE_Y - nh
    frame.paste(ch, (px_x, px_y), ch)
    m = {"raw_bbox": [x0, y0, x1, y1], "scale": round(s, 4),
         "char_h_norm": nh, "char_w_norm": nw,
         "centroid_x_local": round(cx_local, 1), "paste": [px_x, px_y]}
    return frame, m


def verify(frame, name):
    """校验门（规范 §8：非空/高度/质心/脚底/边缘）"""
    bbox = frame.getbbox()
    issues = []
    if bbox is None:
        return [f"{name}: 全透明"], {}
    x0, y0, x1, y1 = bbox
    h = y1 - y0
    px = frame.load()
    opaque = sum(1 for y in range(y0, y1) for x in range(x0, x1) if px[x, y][3] > 32)
    ratio = opaque / (CANVAS_W * CANVAS_H)
    sum_a = sum_ax = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            a = px[x, y][3]
            sum_a += a
            sum_ax += a * x
    cx = sum_ax / sum_a if sum_a else CANVAS_W / 2
    m = {"bbox": list(bbox), "char_h": h, "opaque_ratio": round(ratio, 4),
         "centroid_x": round(cx, 1), "feet_y": y1}
    if not (0.02 <= ratio <= 0.55):
        issues.append(f"{name}: 非空占比异常 {ratio:.3f}")
    if not (CHAR_H * 0.96 <= h <= CHAR_H * 1.04):
        issues.append(f"{name}: 高度越界 {h} (目标 {CHAR_H}±4%)")
    if abs(y1 - BASELINE_Y) > 2:
        issues.append(f"{name}: 脚底基线漂移 {y1}≠{BASELINE_Y}")
    if abs(cx - CENTER_X) > 4:
        issues.append(f"{name}: 质心偏离 {cx:.0f}≠{CENTER_X}")
    if x0 <= 1 or x1 >= CANVAS_W - 2 or y0 <= 1:
        issues.append(f"{name}: 触边疑裁切 bbox={bbox}")
    return issues, m


def process_dir(root, direction):
    names = POSES[direction]
    frames, report = {}, {}
    issues_all = []
    for name in names:
        raw_path = os.path.join(root, "raw", f"{name}.png")
        if not os.path.exists(raw_path):
            return None, [f"{direction}: 缺 raw {raw_path}"], {}
        cut, n_bg = flood_cut(Image.open(raw_path))
        cut.save(os.path.join(root, "cut", f"{name}.png"))
        frame, m = align(cut)
        iss, m2 = verify(frame, name)
        m.update(m2); m["bg_px"] = n_bg
        issues_all += iss
        frames[name] = frame
        report[name] = m
    return frames, issues_all, report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="assets/characters/hero/walk_v2")
    ap.add_argument("--dirs", nargs="+", default=["down", "up", "right"])
    ap.add_argument("--zoom", type=int, default=1)
    args = ap.parse_args()
    root = args.root
    os.makedirs(os.path.join(root, "frames"), exist_ok=True)
    os.makedirs(os.path.join(root, "cut"), exist_ok=True)

    full_report, all_issues = {}, []
    final_frames = {}
    for direction in args.dirs:
        frames, iss, rep = process_dir(root, direction)
        if frames is None:
            print("\n".join(iss)); sys.exit(1)
        # 4 帧循环 + idle
        seq = [frames[names] for names in
               [POSES[direction][LOOP[0]], POSES[direction][LOOP[1]],
                POSES[direction][LOOP[2]], POSES[direction][LOOP[3]]]]
        for i, f in enumerate(seq):
            final_frames[f"walk_{direction}_{i}"] = f
        final_frames[f"idle_{direction}"] = frames[POSES[direction][0]]
        full_report[direction] = rep
        all_issues += iss
        print(f"[{direction}] 4 walk + idle 合成完毕，校验问题 {len(iss)}")

    # left = right 镜像（规范#10）
    if "right" in args.dirs and "left" in sys.argv or True:
        for key in [k for k in list(final_frames) if k.startswith(("walk_right", "idle_right"))]:
            if key == "idle_right" or True:
                lk = key.replace("right", "left")
                final_frames[lk] = final_frames[key].transpose(Image.FLIP_LEFT_RIGHT)

    # 全量复检（含镜像帧）
    for name, f in final_frames.items():
        iss, m = verify(f, name)
        full_report.setdefault("final", {})[name] = m
        all_issues += iss

    # 落盘
    for name, f in final_frames.items():
        f.save(os.path.join(root, "frames", f"{name}.png"))

    # contact sheet（深底、zoom、名字标注）
    names = sorted(final_frames.keys())
    zw = args.zoom
    cols = 8
    rows_n = (len(names) + cols - 1) // cols
    cell_w, cell_h = CANVAS_W * zw // 2 + 8, CANVAS_H * zw // 2 + 24
    sheet = Image.new("RGBA", (cols * cell_w, rows_n * cell_h), (48, 44, 40, 255))
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        gx, gy = (i % cols) * cell_w + 4, (i // cols) * cell_h + 4
        f = final_frames[name]
        f2 = f.resize((f.width * zw // 2, f.height * zw // 2), Image.NEAREST)
        sheet.paste(f2, (gx, gy), f2)
        d.text((gx, gy + CANVAS_H * zw // 2 + 4), name, fill=(230, 220, 190, 255))
    sheet.convert("RGB").save(os.path.join(root, "contact_sheet.png"))

    with open(os.path.join(root, "report.json"), "w", encoding="utf-8") as fp:
        json.dump(full_report, fp, ensure_ascii=False, indent=1)

    print(f"\n共 {len(final_frames)} 帧 → {root}/frames/ · contact_sheet.png · report.json")
    if all_issues:
        print("❌ 校验失败：")
        print("\n".join(all_issues))
        sys.exit(1)
    print("✅ 校验门全过")


if __name__ == "__main__":
    main()
