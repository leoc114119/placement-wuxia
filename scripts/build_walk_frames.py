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
DEFRINGE_L = 195        # 贴透明区的亮像素直接抠除（白边光晕会成"虚影"，L 环反馈②）

# 方向 → 三姿势 raw 文件名前缀（side_* 面朝右 = right 向；left 镜像派生）
POSES = {
    "down":  ["down_stand", "down_stepA", "down_stepB"],
    "up":    ["up_stand", "up_stepA", "up_stepB"],
    "right": ["side_stand", "side_stepA", "side_stepB"],
}
# 头部尺寸代理（L 环反馈①：帧间头身比漂移，按头归一而非按全身高）
#   skin = 面部皮肤像素垂直跨度（down/side，发际→颈底）
#   height = 全身高归一（up 背面：宽度差主要是马尾摆动=合法动态，不做头校正）
HEAD_MODE = {"down": "skin", "up": "height", "right": "skin"}
HEAD_TOL = 0.02         # 归一后头代理一致性门（±2%）
HEIGHT_CLAMP = (246, 266)  # 头归一时全身高允许范围
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
    """规范#11：贴透明区的亮像素去边——直接抠除（半透明白边在深色地板上呈光晕"虚影"）"""
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
        if (p[0] + p[1] + p[2]) / 3 > DEFRINGE_L:
            px[x, y] = (0, 0, 0, 0)
    return rgba


def measure_head(cut, mode):
    """头尺寸代理：skin=面部皮肤垂直跨度（发际→颈底），hair=顶部18%行头发宽"""
    bb = cut.getbbox()
    x0, y0, x1, y1 = bb
    H = y1 - y0
    px = cut.load()
    if mode == "hair":
        y_line = y0 + int(H * 0.18)
        xs = [x for x in range(x0, x1) if px[x, y_line][3] > 60]
        return (max(xs) - min(xs) + 1) if xs else 0
    rows = []
    for y in range(y0, y0 + int(H * 0.5)):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a > 60 and r > 170 and r > b + 25 and g > 120 and r >= g:
                rows.append(y)
                break
    if not rows:
        return 0
    return rows[-1] - rows[0]


def align(cut, s, head_mode="skin"):
    """按给定缩放因子 s 归一 + 脚底/质心双对齐到统一画布。返回 (frame, metrics)"""
    bbox = cut.getbbox()
    if bbox is None:
        raise ValueError("cutout 全透明")
    x0, y0, x1, y1 = bbox
    ch = cut.crop(bbox)
    bbox_h = y1 - y0
    head = measure_head(cut, head_mode)
    nh, nw = max(1, round(bbox_h * s)), max(1, round((x1 - x0) * s))
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
         "head_mode": head_mode, "head_norm_px": round(head * s, 1),
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
    if not (CHAR_H - 10 <= h <= CHAR_H + 10):
        issues.append(f"{name}: 高度越界 {h} (目标 {CHAR_H}±10)")
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
    mode = HEAD_MODE[direction]
    # 第一遍：抠图 + 测头部代理（以 stand 帧为该方向基准）
    cuts, heads = {}, {}
    for name in names:
        raw_path = os.path.join(root, "raw", f"{name}.png")
        if not os.path.exists(raw_path):
            return None, [f"{direction}: 缺 raw {raw_path}"], {}
        cut, n_bg = flood_cut(Image.open(raw_path))
        cut.save(os.path.join(root, "cut", f"{name}.png"))
        cuts[name] = cut
        heads[name] = measure_head(cut, mode)
    target = heads[names[0]]
    if not target:
        return None, [f"{direction}: stand 帧头代理测量为 0，无法归一"], {}
    # 第二遍：头归一（相对校正 × 全局定标 × 全身高钳制）；height 模式=只做全局定标
    bbox_hs = {n: cuts[n].getbbox()[3] - cuts[n].getbbox()[1] for n in names}
    s_head = {n: (target / heads[n]) if mode != "height" else 1.0 for n in names}
    h_proj = sorted(bbox_hs[n] * s_head[n] for n in names)
    k = CHAR_H / h_proj[len(h_proj) // 2]          # 中位全身高定标到 256
    for name in names:
        s = s_head[name] * k
        fh = bbox_hs[name] * s
        if fh < HEIGHT_CLAMP[0]:
            s = HEIGHT_CLAMP[0] / bbox_hs[name]
        elif fh > HEIGHT_CLAMP[1]:
            s = HEIGHT_CLAMP[1] / bbox_hs[name]
        frame, m = align(cuts[name], s, head_mode=mode)
        m["head_raw_px"] = heads[name]
        m["head_delta_pct"] = round((heads[name] - target) / target * 100, 1) if mode != "height" else 0.0
        iss, m2 = verify(frame, name)
        m.update(m2)
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
        # 成品头一致性门（L 环反馈①；height 模式无头校正，跳过）
        mode = HEAD_MODE[direction]
        if mode != "height":
            hp = [rep[n]["head_norm_px"] for n in POSES[direction]]
            spread = (max(hp) - min(hp)) / (sum(hp) / len(hp)) * 100
            full_report[direction]["_head_consistency_pct"] = round(spread, 2)
            print(f"[{direction}] 头代理归一后散差 {spread:.2f}%")
            if spread > 6:
                all_issues.append(f"{direction}: 头尺寸散差 {spread:.1f}% > 6%（钳制触顶），建议重生成该向")
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
