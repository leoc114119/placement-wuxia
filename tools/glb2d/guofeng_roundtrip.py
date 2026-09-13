#!/usr/bin/env python3
"""国风明暗往返：AI 明暗图 → 配准 → 回填贴图 → 重渲 → 成品 PNG。

正向口径（渲染图 → 交给 AI 的明暗图）已实测复现，与 ref1 平均通道差 0.00：
  1. UVMAP=1 渲染 960×1280（yaw270 + 重定向 idle 某一时刻）
  2. 由 alpha 求人物 bbox → 外扩 MARGIN=24 渲染像素 → 裁框
  3. 合成到深色背景 BG，缩放到宽 640（高取 floor），LANCZOS

反向：
  4. AI 图用清洗后掩膜求人物 bbox（口径与 qa_shading_shape 一致）
  5. 等比缩放 k = mean(高比, 宽比) + 平移，把 AI 人物对到裁框内的人物框
     （与 prep_angle_views.py 同口径：整体缩放+平移，不做二参数搜索）
  6. 贴回 960×1280 缓冲 → backfill_tex.mjs（必须带 .uv/.shade/.normal）
  7. 用新贴图重渲 → 同 2/3 裁切 → 成品 PNG

用法：
  python3 tools/glb2d/guofeng_roundtrip.py <AI明暗图> --tag D2 [--reuse-view] [--t 3.3333]
    --reuse-view  复用已缓存的 view/rd.*（该缓存就是产出 ref1 的那次渲染，最忠实）
    --t           重渲视图时用的动画时刻（默认 3.3333）
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/glb2d"))
from qa_shading_shape import silhouette  # noqa: E402

BASE = ROOT / "assets/_trial_20260912/国风明暗试产"
VIEW = BASE / "view"
GLB = Path.home() / "Downloads/chibi+character+3d+model (2).glb"
BASE_TEX = ROOT / "assets/_trial_20260912/贴图回填_美术线输入/配准后/basecolor_detail_20views.raw"
ANIM = ROOT / "assets/_trial_20260912/model_v4/retarget_idle_v4.json"

W, H = 960, 1280
TW = TH = 4096
YAW = 270
MARGIN = 24
OUT_W = 640
BG = (20, 20, 24)


def render(out_raw: Path, tex: Path, t: str, aux: Path, yaw: int, mode: str = "lit") -> None:
    cmd = ["node", str(ROOT / "tools/glb2d/render.mjs"), str(GLB), str(out_raw),
           str(W), str(H), "none", str(t), mode, str(tex), str(TW), str(TH), str(yaw),
           str(aux), str(ANIM)]
    env = {"UVMAP": "1"}
    import os
    e = dict(os.environ); e.update(env)
    r = subprocess.run(cmd, capture_output=True, text=True, env=e)
    if r.returncode != 0:
        raise SystemExit(f"渲染失败：\n{r.stderr[-2000:]}")
    print("  " + r.stdout.strip().splitlines()[-1][:160])


def alpha_bbox(raw: Path) -> tuple[int, int, int, int]:
    d = raw.read_bytes()
    al = d[3::4]
    x0, y0, x1, y1 = W, H, -1, -1
    for y in range(H):
        row = al[y * W:(y + 1) * W]
        idx = [i for i, v in enumerate(row) if v]
        if idx:
            x0 = min(x0, idx[0]); x1 = max(x1, idx[-1])
            y0 = min(y0, y); y1 = max(y1, y)
    return x0, y0, x1, y1


def crop_box(bb) -> tuple[int, int, int, int]:
    """渲染人物 bbox → 裁框（外扩 MARGIN，右/下为开区间）。"""
    return bb[0] - MARGIN, bb[1] - MARGIN, bb[2] + 1 + MARGIN, bb[3] + 1 + MARGIN


def render_mask_crop(color_raw: Path, bb) -> Image.Image:
    """渲染 alpha → 裁框 → 缩放到 OUT_W 宽的二值掩膜（前景 255）。"""
    cb = crop_box(bb)
    cw, ch = cb[2] - cb[0], cb[3] - cb[1]
    d = color_raw.read_bytes()
    buf = bytearray()
    for y in range(cb[1], cb[3]):
        base = y * W
        for x in range(cb[0], cb[2]):
            v = 255 if d[(base + x) * 4 + 3] > 0 else 0
            buf += bytes([v, v, v, 255])
    m = Image.frombytes("RGBA", (cw, ch), bytes(buf)).convert("L")
    return m.point(lambda v: 255 if v > 127 else 0).resize(
        (OUT_W, ch * OUT_W // cw), Image.NEAREST)


def render_to_ai_input(color_raw: Path, bb, out_png: Path):
    """渲染缓冲 → 合成背景 → 裁框 → 缩放到宽 OUT_W。返回 (图, 裁框)。"""
    cb = crop_box(bb)
    cw, ch = cb[2] - cb[0], cb[3] - cb[1]
    d = color_raw.read_bytes()
    buf = bytearray()
    for y in range(cb[1], cb[3]):
        base = y * W
        for x in range(cb[0], cb[2]):
            i = (base + x) * 4
            a = d[i + 3] / 255.0
            buf += bytes([round(d[i] * a + BG[0] * (1 - a)),
                          round(d[i + 1] * a + BG[1] * (1 - a)),
                          round(d[i + 2] * a + BG[2] * (1 - a)), 255])
    im = Image.frombytes("RGBA", (cw, ch), bytes(buf)).convert("RGB")
    im = im.resize((OUT_W, ch * OUT_W // cw), Image.LANCZOS)
    if out_png:
        out_png.parent.mkdir(parents=True, exist_ok=True)
        im.save(out_png)
    return im, cb


def char_mask_orig(im: Image.Image) -> Image.Image:
    """清洗后的人物掩膜，缩回该图自身像素尺寸（mode "L"，前景 255）。"""
    m = silhouette(im)
    return m.resize(im.size, Image.NEAREST)


def char_bbox_orig(im: Image.Image) -> tuple[int, int, int, int]:
    """清洗后掩膜的人物 bbox，换回该图自身像素坐标（右/下为开区间）。"""
    w, h = im.size
    m = silhouette(im)
    mw, mh = m.size
    bx0, by0, bx1, by1 = m.getbbox()
    return (round(bx0 * w / mw), round(by0 * h / mh),
            round(bx1 * w / mw), round(by1 * h / mh))


def _row_extent(mask: Image.Image):
    """逐行前景横向范围。返回 [(x0,x1)]×h，空行为 None。"""
    w, h = mask.size
    px = mask.load()
    out = []
    for y in range(h):
        lo, hi = -1, -1
        for x in range(w):
            if px[x, y]:
                if lo < 0:
                    lo = x
                hi = x
        out.append(None if lo < 0 else (lo, hi))
    return out


def row_warp(ai: Image.Image, ai_m: Image.Image, tgt_m: Image.Image) -> Image.Image:
    """逐行把 AI 人物横向拉伸到目标轮廓的横向范围上（1D 扫描线配准）。

    为什么需要：全局等比缩放只能消掉"整体大小"，消不掉"某个部位相对变宽"
    （实测 AI 必把头和头发画宽 9~69%、把两脚画开 38~91%）。这些局部形变让
    颜色落到错纹素上——脸被头发/阴影色糊成灰色就是这么来的。
    做法：每行求出 AI 的 [ax0,ax1] 与目标的 [rx0,rx1]，按 x 线性映射采样。
    """
    w, h = ai.size
    ae = _row_extent(ai_m)
    re_ = _row_extent(tgt_m)
    src = ai.load()
    out = Image.new("RGB", (w, h), BG)
    dst = out.load()
    for y in range(h):
        a, r = ae[y], re_[y]
        if r is None:
            continue
        if a is None:
            continue
        ax0, ax1 = a
        rx0, rx1 = r
        span_a = max(ax1 - ax0, 1)
        span_r = max(rx1 - rx0, 1)
        for x in range(rx0, rx1 + 1):
            sx = ax0 + round((x - rx0) * span_a / span_r)
            if 0 <= sx < w:
                dst[x, y] = src[sx, y]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ai")
    ap.add_argument("--tag", required=True)
    ap.add_argument("--reuse-view", action="store_true")
    ap.add_argument("--t", default="0")
    ap.add_argument("--yaw", type=int, default=225)
    ap.add_argument("--row-warp", action="store_true",
                    help="逐行横向配准，消掉 AI 把局部画宽/画窄的形变")
    ap.add_argument("--paint-as-final", action="store_true",
                    help="AI 图是「已打好光的成品」：回填时不再除以打光系数、重渲用 unlit。"
                         "除以系数会在 8 位贴图上溢出截顶（暗侧 d≈0.25 → 肤色 200/0.25=800 → 截成 255 "
                         "→ 重渲乘 0.25 变灰 153），这是灰脸的真因。")
    ap.add_argument("--albedo-mode", default="pixel", choices=["pixel", "weighted"],
                    help="回填的 albedo 估计口径；weighted 不做逐样本除法，暗侧不会溢出截顶")
    ap.add_argument("--final-mode", default=None,
                    help="最终渲染用的 mode（默认 lit；paint-as-final 时强制 unlit）")
    ap.add_argument("--keep-base", action="store_true",
                    help="同时导出基准贴图渲染的成品（对照图左格）")
    a = ap.parse_args()

    VIEW.mkdir(parents=True, exist_ok=True)
    rdraw = VIEW / "rd.raw"
    if not a.reuse_view:
        print("[1/6] 渲染基准视图")
        render(rdraw, BASE_TEX, a.t, VIEW / "rd", a.yaw)
    else:
        print("[1/6] 复用缓存视图 view/rd.raw")
    # sidecar 命名有两种（历史遗留）：<outRaw>.uv / <outRaw去.raw>.normal —— 两种都认
    def sidecar(ext: str) -> Path:
        for cand in (Path(str(rdraw) + ext), rdraw.with_suffix("").with_suffix("" + ext)):
            if cand.exists():
                return cand
        raise SystemExit(f"FATAL: 缺 {rdraw}{ext}（也试过去 .raw 命名），不能用 --reuse-view")

    uv_p, nrm_p, shd_p = sidecar(".uv"), sidecar(".normal"), sidecar(".shade")
    print(f"      sidecar: {uv_p.name} / {nrm_p.name} / {shd_p.name}")

    bb = alpha_bbox(rdraw)
    print(f"[2/6] 渲染人物 bbox={bb} 尺寸 {bb[2]-bb[0]+1}x{bb[3]-bb[1]+1}")

    ai_in, cb = render_to_ai_input(rdraw, bb, BASE / f"AI输入_{a.tag}.png")
    print(f"[3/6] AI 输入帧 {ai_in.size}（裁框 {cb[2]-cb[0]}x{cb[3]-cb[1]}）")

    # 裁框内的人物框
    s_in = cb[2] - cb[0]
    sb = (MARGIN, MARGIN, MARGIN + (bb[2] - bb[0] + 1), MARGIN + (bb[3] - bb[1] + 1))
    # 换算到输出帧（缩放到宽 OUT_W）
    k_out = OUT_W / s_in
    sb_out = tuple(round(v * k_out) for v in sb)

    ai = Image.open(a.ai).convert("RGB")
    ai_mask = char_mask_orig(ai)
    rb = char_bbox_orig(ai)
    k = ((sb_out[3] - sb_out[1]) / (rb[3] - rb[1]) + (sb_out[2] - sb_out[0]) / (rb[2] - rb[0])) / 2
    ai2 = ai.resize((round(ai.width * k), round(ai.height * k)), Image.LANCZOS)
    rb2 = char_bbox_orig(ai2)
    frame = Image.new("RGB", ai_in.size, BG)
    off = (sb_out[0] - rb2[0], sb_out[1] - rb2[1])
    frame.paste(ai2, off)
    # ★ 兜底：AI 重画的人物轮廓与我们的渲染轮廓并不重合（实测差 3~9%）。
    #   落在我们轮廓内、但 AI 那边是背景的像素，若不处理就会把"背景深色"写进贴图，
    #   成品边缘发灰发闷。做法：这些像素回退用渲染图自己的颜色。
    mask2 = Image.new("L", ai_in.size, 0)
    mask2.paste(ai_mask.resize(ai2.size, Image.NEAREST), off)
    frame = Image.composite(frame, ai_in, mask2)
    if a.row_warp:
        tgt_m = Image.new("L", ai_in.size, 0)
        tgt_m.paste(render_mask_crop(rdraw, bb), (0, 0))
        frame = row_warp(frame, mask2, tgt_m)
        print("      已做逐行横向配准（消局部形变）")
    fb = sum(1 for v in mask2.getdata() if v) / (ai_in.size[0] * ai_in.size[1]) * 100
    print(f"      AI 掩膜在帧内占比 {fb:.1f}%")
    print(f"[4/6] 配准：AI 人物 {rb[2]-rb[0]}x{rb[3]-rb[1]} → 目标 {sb_out[2]-sb_out[0]}x{sb_out[3]-sb_out[1]}，k={k:.4f}")
    frame.save(BASE / f"配准后_{a.tag}.png")

    # 放回 960×1280 渲染坐标系
    full = Image.new("RGB", (W, H), BG)
    big = frame.resize((s_in, cb[3] - cb[1]), Image.LANCZOS)
    full.paste(big, (cb[0], cb[1]))
    aligned = BASE / f"aligned_{a.tag}.raw"
    aligned.write_bytes(full.convert("RGBA").tobytes())

    print("[5/6] 回填贴图")
    tex_out = BASE / f"tex_{a.tag}.raw"
    shd_use = shd_p
    if a.paint_as_final:
        import struct as _struct
        shd_use = BASE / f"shade_ones_{a.tag}.raw"
        shd_use.write_bytes(_struct.pack("<%df" % (W * H), *([1.0] * (W * H))))
    r = subprocess.run(["node", str(ROOT / "tools/glb2d/backfill_tex.mjs"),
                        "--tex", str(BASE_TEX), "--tw", str(TW), "--th", str(TH),
                        "--out", str(tex_out), "--w", str(W), "--h", str(H), "--mode", "avg",
                        "--albedo-mode", a.albedo_mode,
                        "--view", str(aligned), str(uv_p), str(nrm_p), str(shd_use)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"回填失败：\n{r.stderr[-2000:]}")
    print("  " + r.stdout.strip().splitlines()[-1][:200])

    print("[6/6] 用新贴图重渲")
    out_raw = VIEW / f"out_{a.tag}.raw"
    fmode = "unlit" if a.paint_as_final else (a.final_mode or "lit")
    render(out_raw, tex_out, a.t, VIEW / f"out_{a.tag}", a.yaw, fmode)
    bb2 = alpha_bbox(out_raw)
    final, _ = render_to_ai_input(out_raw, bb2, BASE / f"成品_{a.tag}.png")
    print(f"  成品 {final.size} → {BASE / f'成品_{a.tag}.png'}")

    if a.keep_base:
        base_raw = VIEW / "out_base.raw"
        render(base_raw, BASE_TEX, a.t, VIEW / "out_base", a.yaw, fmode)
        bb0 = alpha_bbox(base_raw)
        render_to_ai_input(base_raw, bb0, BASE / "成品_裸渲染.png")
        print(f"  基准贴图成品 → {BASE / '成品_裸渲染.png'}")

    (BASE / f"reg_report_{a.tag}.json").write_text(json.dumps({
        "tag": a.tag, "ai": str(Path(a.ai)), "yaw": a.yaw, "t": a.t,
        "ai_size": list(ai.size), "ai_bbox": list(rb), "target_bbox_in_out": list(sb_out),
        "scale_k": round(k, 4), "render_bbox": list(bb), "crop_box": list(cb),
        "final": final.size,
    }, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
