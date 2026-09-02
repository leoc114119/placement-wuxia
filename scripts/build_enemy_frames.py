#!/usr/bin/env python3
"""T14 P1 后半 · 敌人战斗帧合成管线（山贼甲/乙 shanzei_a/shanzei_b）。

输入：assets/characters/enemy/<key>/gen/ 下白底生成稿（17 张：idle_down/idle_side +
      walk 4 + atk 6 + hit 2 + die 3；hit/die 通用不分方向，基于 down 锚生成）
输出：<root>/raw（泛洪抠图）→ cut（影子检测后）→ frames/（240×320 统一画布）+
      report.json + contact_sheet.png + credits.json 汇总核对

与 hero/battle_q 口径一致（build_battle_frames.py 复用）：
- 定标：每方向以该方向 idle 帧定 scale（高 256 / 脚底 y=300 / 质心 x=120），该方向
  动作帧同因子；hit/die 基于 down 锚生成 → 取 down 的 scale（决策记录在 report）
- die_2/die_3 躺倒系无脚底基线语义 → 质心 x 对齐 + 底部贴地（LYING 同 hero）
- 呼吸帧：程序化 make_breath 上移 3px（禁 AI 重绘），down/side 各 1 张
- 镜像：left = side FLIP_LEFT_RIGHT（idle/walk/atk + breath）；hit/die 不镜像
- 影子门：只检测不自动清除（紧裁 raw 底部带清除会误清衣纹，T14 主角批次已证实）
- 封闭白：只记录「待人工判读」，禁自动清除；纯平白大块且明确不在服装区可事后外科

用法：python3 scripts/build_enemy_frames.py --key shanzei_a [--key shanzei_b ...]
      （--key 可多次；缺 gen 的帧记失败不阻塞其余）
"""
import argparse, json, os, sys, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_walk_frames import (CANVAS_W, CANVAS_H, CHAR_H, BASELINE_Y, CENTER_X,
                               BREATH_SHIFT, flood_cut, detect_enclosed_white,
                               make_breath, verify)
from build_battle_frames import (fit_frame, clear_shadow_band, legs_band_cx,
                                 LYING)
from PIL import Image, ImageDraw

# 方向 → 该方向动作帧（同 scale 组）；hit/die 通用组挂 down 锚
DIR_ACTIONS = {
    "down": ["walk_down_1", "walk_down_2", "atk_down_1", "atk_down_2", "atk_down_3"],
    "side": ["walk_side_1", "walk_side_2", "atk_side_1", "atk_side_2", "atk_side_3"],
}
SHARED_ACTIONS = ["hit_1", "hit_2", "die_1", "die_2", "die_3"]   # 基于 down 锚


def cut_from_gen(root, name):
    """gen → raw（泛洪抠图，幂等：raw 存在则跳过）。返回 raw 路径或 None。"""
    raw_p = os.path.join(root, "raw", f"{name}.png")
    gen_p = os.path.join(root, "gen", f"{name}.png")
    if os.path.exists(raw_p):
        return raw_p
    if not os.path.exists(gen_p):
        return None
    cut, _ = flood_cut(Image.open(gen_p))
    cut.save(raw_p)
    return raw_p


def build_enemy(key):
    root = os.path.join("assets", "characters", "enemy", key)
    for sub in ("frames", "raw", "cut", "surgical"):
        os.makedirs(os.path.join(root, sub), exist_ok=True)

    report = {"_meta": {
        "enemy": key, "canvas": [CANVAS_W, CANVAS_H], "char_h": CHAR_H,
        "baseline_y": BASELINE_Y, "centroid_x": CENTER_X,
        "scale_policy": "每方向以该方向 idle 定 scale，动作帧同因子；hit/die 通用帧基于 down 锚 → 取 down scale",
        "lying_frames": sorted(LYING),
        "breath": f"程序化 make_breath 上移 {BREATH_SHIFT}px（禁 AI 重绘）",
        "mirror": "left=side FLIP_LEFT_RIGHT（idle/walk/atk+breath）；hit/die 通用不镜像",
        "built_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
    }}
    decisions, failures, shadow_log, enclosed_log = [], [], {}, {}
    final_frames = {}
    scales = {}

    for d in ("down", "side"):
        raw_p = cut_from_gen(root, f"idle_{d}")
        if raw_p is None:
            failures.append(f"idle_{d}: 缺 gen（生成失败/未生成）")
            continue
        idle_cut = Image.open(raw_p).convert("RGBA")
        idle_cut, _ = clear_shadow_band(idle_cut, f"idle_{d}", root, shadow_log)
        idle_cut.save(os.path.join(root, "cut", f"idle_{d}.png"))
        for n_px, bbox in detect_enclosed_white(idle_cut):
            enclosed_log.setdefault(f"idle_{d}", []).append(
                f"封闭白残留 {n_px}px bbox={bbox}（泛洪盲区，待人工判读）")
        bb = idle_cut.getbbox()
        if not bb:
            failures.append(f"idle_{d}: 全透明")
            continue
        s = CHAR_H / (bb[3] - bb[1])
        scales[d] = s
        rep = {"scale": round(s, 5), "frames": {}}

        frame, m, iss = fit_frame(idle_cut, s, f"idle_{d}", decisions)
        if frame is None:
            failures += iss
            continue
        m["legs_band_cx"] = legs_band_cx(frame)
        iss_v, m_v = verify(frame, f"idle_{d}")
        m.update(m_v)
        failures += iss + iss_v
        final_frames[f"idle_{d}"] = frame
        rep["frames"]["idle"] = m

        breath = make_breath(frame)
        iss_b, m_b = verify(breath, f"idle_{d}_breath", h_slack=BREATH_SHIFT)
        m_b["mode"] = "programmatic"; m_b["shift_px"] = BREATH_SHIFT
        m_b["legs_band_cx"] = legs_band_cx(breath)
        failures += iss_b
        final_frames[f"idle_{d}_breath"] = breath
        rep["frames"]["idle_breath"] = m_b

        # 该方向动作帧（同 scale）
        for name in DIR_ACTIONS[d]:
            raw_p = cut_from_gen(root, name)
            if raw_p is None:
                failures.append(f"{name}: 缺 gen（生成失败/未生成）")
                continue
            cut = Image.open(raw_p).convert("RGBA")
            cut, _ = clear_shadow_band(cut, name, root, shadow_log)
            cut.save(os.path.join(root, "cut", f"{name}.png"))
            for n_px, bbox in detect_enclosed_white(cut):
                enclosed_log.setdefault(name, []).append(
                    f"封闭白残留 {n_px}px bbox={bbox}（泛洪盲区，待人工判读）")
            frame_a, m_a, iss_a = fit_frame(cut, s, name, decisions)
            if frame_a is None:
                failures += iss_a
                continue
            m_a["legs_band_cx"] = legs_band_cx(frame_a)
            bb2 = frame_a.getbbox()
            m_a["bbox"] = list(bb2); m_a["char_h"] = bb2[3] - bb2[1]
            m_a["feet_y"] = bb2[3]
            final_frames[name] = frame_a
            rep["frames"][name] = m_a
            failures += iss_a
        report[d] = rep

    # 通用帧（hit/die）：down scale
    if "down" in scales:
        rep = {"scale": round(scales["down"], 5),
               "note": "通用姿态不分方向，基于 down 锚生成，取 down scale", "frames": {}}
        for name in SHARED_ACTIONS:
            raw_p = cut_from_gen(root, name)
            if raw_p is None:
                failures.append(f"{name}: 缺 gen（生成失败/未生成）")
                continue
            cut = Image.open(raw_p).convert("RGBA")
            cut, _ = clear_shadow_band(cut, name, root, shadow_log)
            cut.save(os.path.join(root, "cut", f"{name}.png"))
            for n_px, bbox in detect_enclosed_white(cut):
                enclosed_log.setdefault(name, []).append(
                    f"封闭白残留 {n_px}px bbox={bbox}（泛洪盲区，待人工判读）")
            frame_a, m_a, iss_a = fit_frame(cut, scales["down"], name, decisions)
            if frame_a is None:
                failures += iss_a
                continue
            m_a["legs_band_cx"] = legs_band_cx(frame_a)
            bb2 = frame_a.getbbox()
            m_a["bbox"] = list(bb2); m_a["char_h"] = bb2[3] - bb2[1]
            m_a["feet_y"] = bb2[3]
            act = name.split("_")[1]
            if act in LYING:
                decisions.append(
                    f"{name}: 躺/倒帧无脚底基线语义 → 质心 x 对齐 + 底部贴地 y={bb2[3]}")
            final_frames[name] = frame_a
            rep["frames"][name] = m_a
            failures += iss_a
        report["shared_hit_die"] = rep

    # 镜像派生：left = side FLIP（idle/walk/atk + breath）
    def to_left(k):
        if k == "idle_side":
            return "idle_left"
        if k == "idle_side_breath":
            return "idle_left_breath"
        return k.replace("_side_", "_left_")

    for k in [k for k in list(final_frames) if "_side" in k]:
        final_frames[to_left(k)] = final_frames[k].transpose(Image.FLIP_LEFT_RIGHT)

    # 镜像件复检：轻量门（非空 + 不触上下左右边）
    for name, f in final_frames.items():
        if "_left" in name:
            bb = f.getbbox()
            if bb is None:
                failures.append(f"{name}: 全透明")
            elif bb[0] <= 1 or bb[2] >= CANVAS_W - 2 or bb[1] <= 1:
                failures.append(f"{name}: 触边疑裁切 bbox={bb}")

    for name, f in final_frames.items():
        f.save(os.path.join(root, "frames", f"{name}.png"))

    # contact sheet（深底 + 名字标注）
    names = sorted(final_frames.keys())
    cols = 8
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

    print(f"[{key}] 共 {len(final_frames)} 帧 → {root}/frames/ · contact_sheet.png · report.json")
    if shadow_log:
        print(f"[{key}] 影子带报警 {len(shadow_log)} 帧（surgical/，只记录待人工判读）")
    if enclosed_log:
        n = sum(len(v) for v in enclosed_log.values())
        print(f"[{key}] 封闭白报警 {n} 条（只记录不清除，待人工判读）")
    if failures:
        print(f"[{key}] 校验失败项：")
        print("\n".join(failures))
    else:
        print(f"[{key}] 校验门全过（硬失败 0）")
    return not failures


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", action="append", required=True,
                    choices=["shanzei_a", "shanzei_b"], help="敌人 key，可多次")
    args = ap.parse_args()
    ok = True
    for key in args.key:
        ok = build_enemy(key) and ok
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
