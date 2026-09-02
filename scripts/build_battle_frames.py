#!/usr/bin/env python3
"""T14 战斗帧合成管线（P1 前半 · 主角战斗帧全套）。

输入：battle_q/raw/ 下泛洪抠图后的单帧 RGBA（battle_idle_{dir} + 11 动作帧 × down/up/side）
输出：battle_q/frames/（240×320 统一画布）+ report.json + contact_sheet.png

定标口径（任务卡铁律）：
- 每方向以该方向 battle_idle 帧定 scale：人物高 256 / 脚底基线 y=300 / 质心 x=120
- 该方向全部动作帧用同一 scale 因子（序列无缩放跳动）
- die 跪地/倒地/躺平、hit 后仰帧允许轮廓高度/形态变化（动作语义），逐帧记录 bbox 与高度
- 脚底基线对不齐的帧（躺平系）以质心 x 对齐（align 默认行为），记录决策

校验门：非空 / 不触边 / 画布规格；idle 额外查高度 256±10。
封闭白检测门：只记录不自动清除（规范 §3#3）。
影子清除：规范 §3#4 底部带（y>84%）140<min≤215 且饱和差<42 → 透明，白裤 min>210
受保护；清除前后对比存 surgical/，清后核对。

用法：python3 scripts/build_battle_frames.py [--root assets/characters/hero/battle_q]
"""
import argparse, json, os, sys, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_walk_frames import (CANVAS_W, CANVAS_H, CHAR_H, BASELINE_Y, CENTER_X,
                               BREATH_SHIFT, flood_cut, detect_enclosed_white,
                               align, verify, make_breath)
from PIL import Image, ImageDraw

DIRS = ["down", "up", "side"]
ACTIONS = ["atk_1", "atk_2", "atk_3", "cast_1", "cast_2", "cast_3",
           "hit_1", "hit_2", "die_1", "die_2", "die_3"]
# 脚底基线语义不成立的帧（躺/倒系）：底部贴地为触地而非脚底，记录决策
LYING = {"die_2", "die_3"}
H_MAX = BASELINE_Y - 2          # 顶部不触边前提下的最大可容纳高度（298）


def clear_shadow_band(cut, name, root, shadow_log):
    """影子检测门（只检测不自动清除——T14 实测：紧裁 raw 的底部 16% 带基本是白灯笼裤
    的灰色衣纹阴影区，规范 §3#4 的"底部带暖灰清除"按 walk 画布坐标设计，直接套 raw 会
    误清裤褶）。命中 → 存 band 对比图到 surgical/shadow_{name}.png + 记 report，待人工判读。
    返回 (cut 原样, 命中像素数)"""
    bb = cut.getbbox()
    if not bb:
        return cut, 0
    y_start = bb[1] + int((bb[3] - bb[1]) * 0.84)
    px = cut.load()
    hits = []
    for y in range(y_start, bb[3]):
        for x in range(cut.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            mn, mx = min(r, g, b), max(r, g, b)
            if 140 < mn <= 215 and (mx - mn) < 42:
                hits.append((x, y))
    if not hits:
        return cut, 0
    xs = [h[0] for h in hits]; ys = [h[1] for h in hits]
    x0, x1 = max(0, min(xs) - 30), min(cut.width, max(xs) + 30)
    y0, y1 = max(0, min(ys) - 30), min(cut.height, bb[3])
    w, h = x1 - x0, y1 - y0
    if w > 0 and h > 0:
        band = cut.crop((x0, y0, x1, y1)).convert("RGB")
        band.save(os.path.join(root, "surgical", f"shadow_{name}.png"))
    shadow_log[name] = {"px": len(hits), "bbox": [min(xs), min(ys), max(xs), max(ys)],
                        "note": "检测门命中（含裤褶灰影假阳性），只记录待人工判读"}
    return cut, len(hits)


def legs_band_cx(frame):
    """诊断量（不设门）：bbox 62%~82% 行的 alpha 质心 x——站立帧腿部锚参考，
    用于人工复核横向跳动（质心对齐在挥剑帧会把身体拉离原地）。"""
    bb = frame.getbbox()
    if not bb:
        return None
    y0, y1 = bb[1], bb[3]
    a0 = y0 + int((y1 - y0) * 0.62)
    a1 = y0 + int((y1 - y0) * 0.82)
    px = frame.load()
    s = sx = 0
    for y in range(a0, a1):
        for x in range(bb[0], bb[2]):
            v = px[x, y][3]
            if v:
                s += v; sx += v * x
    return round(sx / s, 1) if s else None


def frame_centroid_x(frame):
    bb = frame.getbbox()
    if not bb:
        return None
    px = frame.load()
    s = sx = 0
    for y in range(bb[1], bb[3]):
        for x in range(bb[0], bb[2]):
            v = px[x, y][3]
            if v:
                s += v; sx += v * x
    return round(sx / s, 1) if s else None


def fit_frame(cut, s, name, decisions):
    """align 后做画布适配：宽度溢出 → x 平移入画（记录质心偏差）；高度溢出 → 失败。"""
    frame, m = align(cut, s)
    bb = frame.getbbox()
    if bb is None:
        return None, m, [f"{name}: 全透明"]
    x0, y0, x1, y1 = bb
    issues = []
    if x0 <= 1 or x1 >= CANVAS_W - 2:
        dx = (2 - x0) if x0 <= 1 else (CANVAS_W - 3) - x1
        if dx:
            moved = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
            moved.paste(frame, (dx, 0))     # 无 mask 平移（alpha 不平方）
            frame = moved
            nb = frame.getbbox()
            m["shift_x"] = dx
            m["centroid_x_after_shift"] = frame_centroid_x(frame)
            decisions.append(f"{name}: 宽度溢出，x 平移 {dx}px 入画（质心偏离规格 120，见 metrics）")
            x0, y0, x1, y1 = nb
            if x0 <= 1 or x1 >= CANVAS_W - 2:
                issues.append(f"{name}: 平移后仍触左右边 bbox={nb}")
    if y0 <= 1:
        issues.append(f"{name}: 高度溢出触顶 bbox={bb}（同 scale 下超高，需重摇或降 scale）")
    return frame, m, issues


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="assets/characters/hero/battle_q")
    args = ap.parse_args()
    root = args.root
    for sub in ("frames", "cut", "surgical"):
        os.makedirs(os.path.join(root, sub), exist_ok=True)

    report = {"_meta": {
        "canvas": [CANVAS_W, CANVAS_H], "char_h": CHAR_H,
        "baseline_y": BASELINE_Y, "centroid_x": CENTER_X,
        "scale_policy": "每方向以 battle_idle 定 scale，动作帧同因子",
        "lying_frames": sorted(LYING),
        "breath": f"程序化 make_breath 上移 {BREATH_SHIFT}px（禁 AI 重绘）",
        "mirror": "left=side FLIP_LEFT_RIGHT；right=side 同款拷贝",
        "built_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
    }}
    decisions, failures, shadow_log = [], [], {}
    enclosed_log = {}
    final_frames = {}

    for d in DIRS:
        idle_path = os.path.join(root, "raw", f"battle_idle_{d}.png")
        if not os.path.exists(idle_path):
            failures.append(f"{d}: 缺 battle_idle raw")
            continue
        idle_cut = Image.open(idle_path).convert("RGBA")
        idle_cut, n_sh = clear_shadow_band(idle_cut, f"battle_idle_{d}", root, shadow_log)
        idle_cut.save(os.path.join(root, "cut", f"battle_idle_{d}.png"))
        for n_px, bbox in detect_enclosed_white(idle_cut):
            enclosed_log.setdefault(f"battle_idle_{d}", []).append(
                f"封闭白残留 {n_px}px bbox={bbox}（泛洪盲区，待人工判读）")
        bb = idle_cut.getbbox()
        if not bb:
            failures.append(f"{d}: battle_idle 全透明")
            continue
        s = CHAR_H / (bb[3] - bb[1])           # 定标：idle 高 → 256
        rep = {"scale": round(s, 5), "frames": {}}

        frame, m, iss = fit_frame(idle_cut, s, f"battle_idle_{d}", decisions)
        if frame is None:
            failures += iss
            continue
        m["legs_band_cx"] = legs_band_cx(frame)
        iss_v, m_v = verify(frame, f"battle_idle_{d}")
        m.update(m_v)
        failures += iss + iss_v
        final_frames[f"battle_idle_{d}"] = frame
        rep["frames"]["battle_idle"] = m

        # 程序化呼吸帧
        breath = make_breath(frame)
        iss_b, m_b = verify(breath, f"battle_idle_{d}_breath", h_slack=BREATH_SHIFT)
        m_b["mode"] = "programmatic"; m_b["shift_px"] = BREATH_SHIFT
        m_b["legs_band_cx"] = legs_band_cx(breath)
        failures += iss_b
        final_frames[f"battle_idle_{d}_breath"] = breath
        rep["frames"]["battle_idle_breath"] = m_b

        # 动作帧（同 scale）
        for act in ACTIONS:
            name = f"{d}_{act}"
            p = os.path.join(root, "raw", f"{name}.png")
            if not os.path.exists(p):
                failures.append(f"{name}: 缺 raw（生成失败/未生成）")
                continue
            cut = Image.open(p).convert("RGBA")
            cut, n_sh = clear_shadow_band(cut, name, root, shadow_log)
            cut.save(os.path.join(root, "cut", f"{name}.png"))
            for n_px, bbox in detect_enclosed_white(cut):
                enclosed_log.setdefault(name, []).append(
                    f"封闭白残留 {n_px}px bbox={bbox}（泛洪盲区，待人工判读）")
            frame_a, m_a, iss_a = fit_frame(cut, s, name, decisions)
            if frame_a is None:
                failures += iss_a
                continue
            m_a["legs_band_cx"] = legs_band_cx(frame_a)
            # 动作帧形态门放宽：不查高度（动作语义），只查非空/触边（fit_frame 已查）
            bb2 = frame_a.getbbox()
            m_a["bbox"] = list(bb2); m_a["char_h"] = bb2[3] - bb2[1]
            m_a["feet_y"] = bb2[3]
            if act in LYING:
                decisions.append(
                    f"{name}: 躺/倒帧无脚底基线语义 → 质心 x 对齐 + 底部贴地 y={bb2[3]}")
            final_frames[f"{act.split('_')[0]}_{d}_{act.split('_')[1]}"] = frame_a
            rep["frames"][act] = m_a
            failures += iss_a
        report[d] = rep

    # 镜像派生：left = side FLIP；right = side 拷贝（便于接线直寻）
    def rename_dir(key, newdir):
        if key == "battle_idle_side":
            return f"battle_idle_{newdir}"
        if key == "battle_idle_side_breath":
            return f"battle_idle_{newdir}_breath"
        pre, n = key.rsplit("_", 1)          # atk_side, 1
        mid = pre.rsplit("_", 1)[0]          # atk
        return f"{mid}_{newdir}_{n}"

    for k in [k for k in list(final_frames) if "_side" in k]:
        final_frames[rename_dir(k, "left")] = final_frames[k].transpose(Image.FLIP_LEFT_RIGHT)
        final_frames[rename_dir(k, "right")] = final_frames[k].copy()

    # 镜像/拷贝件复检：轻量门（非空 + 不触上下左右边；底部 300 同源帧不查）
    for name, f in final_frames.items():
        if "_left" in name or "_right" in name:
            bb = f.getbbox()
            if bb is None:
                failures.append(f"{name}: 全透明")
            elif bb[0] <= 1 or bb[2] >= CANVAS_W - 2 or bb[1] <= 1:
                failures.append(f"{name}: 触边疑裁切 bbox={bb}")

    # 落盘
    for name, f in final_frames.items():
        f.save(os.path.join(root, "frames", f"{name}.png"))

    # contact sheet（深底 + 名字标注）
    names = sorted(final_frames.keys())
    cols = 8
    zw = 1
    cell_w, cell_h = CANVAS_W // 2 + 8, CANVAS_H // 2 + 24
    rows_n = (len(names) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell_w, rows_n * cell_h), (48, 44, 40, 255))
    dr = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        gx, gy = (i % cols) * cell_w + 4, (i // cols) * cell_h + 4
        f2 = final_frames[name].resize((CANVAS_W // 2, CANVAS_H // 2), Image.NEAREST)
        sheet.paste(f2, (gx, gy), f2)
        dr.text((gx, gy + CANVAS_H // 2 + 6), name, fill=(230, 220, 190, 255))
    sheet.convert("RGB").save(os.path.join(root, "contact_sheet.png"))

    if shadow_log:
        report["_alarms_shadow_band"] = shadow_log
    if enclosed_log:
        report["_alarms_enclosed_white"] = enclosed_log
    report["_decisions"] = decisions
    report["_failures"] = failures
    report["_final_frame_count"] = len(final_frames)
    with open(os.path.join(root, "report.json"), "w", encoding="utf-8") as fp:
        json.dump(report, fp, ensure_ascii=False, indent=1)

    print(f"共 {len(final_frames)} 帧 → {root}/frames/ · contact_sheet.png · report.json")
    if shadow_log:
        print(f"影子带报警 {len(shadow_log)} 帧（surgical/shadow_*.png，只记录待人工判读）")
    if enclosed_log:
        n = sum(len(v) for v in enclosed_log.values())
        print(f"封闭白报警 {n} 条（只记录不清除，待人工判读）")
    if failures:
        print("校验失败项：")
        print("\n".join(failures))
        sys.exit(1)
    print("校验门全过（硬失败 0）")


if __name__ == "__main__":
    main()
