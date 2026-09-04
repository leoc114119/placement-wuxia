#!/usr/bin/env python3
"""T45 批 1 补丁 5 · cast_down_2 劈停左下重出（1 张，Leo 逐字任务书）。
动作序列 = 举臂左上（cast_1 保留不动）→ 劈下停左下（cast_2 本张）→ 回位戒备（cast_3=复用锚已就位）。
链式锚定：左格基准/第二参照/校验基准一律 = cast_down_1 成品（画面锁手别）。
与 patch_cast4 的差异（任务书改口径）：
  ①双格表 640×320（左格原点粘贴，非 640×427 条带）②prompt 任务书逐字（无骨架代换）
  ③aspect 拒绝→9:16 重试一次并登记 ④门清单仅 check_left_v2 T=30（高度比只实测记录不拦截）
  ⑤mxai 抠图失败重试不超 1 次（铁律）。
用法:
  python3 run_patch5.py gen     # 生图+check_left_v2+测量
  python3 run_patch5.py finish  # 抠图+归一+入库（gen 过门后）
"""
import json
import os
import subprocess
import sys
from collections import deque
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
B1 = os.path.join(ROOT, "assets/_trial_20260904/t45_batch1")
PC = os.path.join(B1, "patch_cast5")
LIB = os.path.join(ROOT, "assets/characters/hero/battle45")

NAME = "cast_down_2"
ANCHOR = os.path.join(LIB, "cast_down_1.png")   # 链式锚：cast_1 成品（任务书步骤 2/4/5）
SHEET = os.path.join(PC, "sheets", f"{NAME}_sheet.png")
PF = os.path.join(PC, "prompts", f"{NAME}.txt")  # 任务书逐字 prompt（已落盘）
RAW = os.path.join(PC, "raw", f"{NAME}_raw.png")

WHITE_THRESH = 40
MIN_CC = 2000
T_LEFT = 30.0
ASPECT = "3:2"
ASPECT_FALLBACK = "9:16"   # 任务书：报价报 aspect 不支持→改 9:16 重试一次并登记


def out_band(W, H):
    return 0, H


# ---------- 测量（纯 PIL，同 patch_cast4） ----------
def cc_largest(region, thresh=WHITE_THRESH):
    W, H = region.size
    px = list(region.getdata())
    fg = bytearray(W * H)
    for i, (r, g, b) in enumerate(px):
        if (255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2 > thresh * thresh:
            fg[i] = 1
    seen = bytearray(W * H)
    best = None
    for start in range(W * H):
        if seen[start] or not fg[start]:
            continue
        seen[start] = 1
        q = deque([start])
        size = 0
        minx = maxx = start % W
        miny = maxy = start // W
        sx = 0
        while q:
            i = q.popleft()
            size += 1
            x, y = i % W, i // W
            sx += x
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
            if x > 0 and fg[i - 1] and not seen[i - 1]:
                seen[i - 1] = 1; q.append(i - 1)
            if x < W - 1 and fg[i + 1] and not seen[i + 1]:
                seen[i + 1] = 1; q.append(i + 1)
            if y > 0 and fg[i - W] and not seen[i - W]:
                seen[i - W] = 1; q.append(i - W)
            if y < H - 1 and fg[i + W] and not seen[i + W]:
                seen[i + W] = 1; q.append(i + W)
        if best is None or size > best[0]:
            best = (size, (minx, miny, maxx + 1, maxy + 1), sx / size)
    return best


def corners(img, box, tag):
    x0, y0, x1, y1 = box
    pts = [(x0 + 4, y0 + 4), (x1 - 5, y0 + 4), (x0 + 4, y1 - 5), (x1 - 5, y1 - 5)]
    vals = [img.getpixel(p) for p in pts]
    bad = []
    for p, v in zip(pts, vals):
        r, g, b = v[:3]
        if min(r, g, b) < 245 or (max(r, g, b) - min(r, g, b)) > 12:
            bad.append((p, v[:3]))
    print(f"[corners:{tag}] {vals} " + ("OK" if not bad else f"NONWHITE={bad}"))
    return bad


def check_left(src_path, raw_path, t=T_LEFT):
    """check_left v2（内容对齐版）：基准=cast_down_1 成品"""
    src = Image.open(src_path).convert("RGBA")
    raw = Image.open(raw_path).convert("RGB")
    W, H = raw.size
    region = raw.crop((0, 0, W // 2, H))
    cc = cc_largest(region)
    if cc is None:
        print("[check_left_v2] 左半区无主体 FAIL")
        return 999.0, False
    bx = cc[1]
    amask = src.getchannel("A").point(lambda v: 255 if v > 0 else 0)
    abox = amask.getbbox()
    tw, th = abox[2] - abox[0], abox[3] - abox[1]
    crop = raw.crop(bx).resize((tw, th), Image.NEAREST)
    aref = Image.alpha_composite(Image.new("RGBA", src.size, "WHITE"), src).crop(abox).convert("RGB")
    sd, ld = list(aref.getdata()), list(crop.getdata())
    total = 0.0
    for (r1, g1, b1), (r2, g2, b2) in zip(sd, ld):
        total += ((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) ** 0.5
    mean = total / len(sd)
    ok = mean <= t
    print(f"[check_left_v2] baseline={os.path.basename(src_path)} content_aligned mean_rgb_dist={mean:.3f} T={t} "
          f"{'PASS' if ok else 'FAIL'} raw_left_env={bx} anchor_env={abox}")
    return mean, ok


# ---------- 记录 ----------
def log_read():
    p = os.path.join(PC, "measure_log_patch5.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def log_write(rec):
    p = os.path.join(PC, "measure_log_patch5.json")
    logs = log_read()
    logs[rec["frame"]] = rec
    with open(p, "w", encoding="utf-8") as f:
        json.dump(logs, f, ensure_ascii=False, indent=1)


def credits_append(name, note):
    p = os.path.join(B1, "credits.json")
    arr = []
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            arr = json.load(f)
    arr.append({"name": name, "model": "gpt-image-2", "cost": 2,
                "ts": "2026-09-04 T45-batch1-patch5", "note": note})
    with open(p, "w", encoding="utf-8") as f:
        json.dump(arr, f, ensure_ascii=False, indent=1)
    print(f"[credits] +2 分，累计 {sum(x['cost'] for x in arr)} 分 / {len(arr)} 张")


def sh(cmd, env=None):
    print("[CMD] " + " ".join(cmd))
    r = subprocess.run(cmd, cwd=ROOT, env=env or os.environ.copy(),
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    print(r.stdout[-2000:] if r.stdout else "")
    return r.returncode, r.stdout or ""


def gen_once(aspect):
    return sh(["python3", "scripts/mxai_img2img.py", SHEET, ANCHOR,
               "--out", RAW, "--prompt-file", PF, "--aspect", aspect])


# ---------- gen 阶段 ----------
def stage_gen():
    if not os.path.exists(ANCHOR):
        print(f"[STOP] 链式锚不存在: {ANCHOR}"); sys.exit(6)
    if not os.path.exists(SHEET):
        print(f"[STOP] 双格表不存在（步骤 2 应已构造）: {SHEET}"); sys.exit(6)
    if not os.path.exists(PF):
        print(f"[STOP] prompt 不存在（步骤 3 应已落盘）: {PF}"); sys.exit(6)
    if os.path.exists(RAW):
        print(f"[E-ENV-05] raw 已存在，禁覆盖: {RAW}"); sys.exit(5)

    rc, outp = gen_once(ASPECT)
    aspect_note = ASPECT
    if rc != 0 or not os.path.exists(RAW):
        if "aspect" in outp.lower():
            print(f"[aspect-拒绝] 改 {ASPECT_FALLBACK} 重试一次并登记（任务书步骤 4）")
            aspect_note = ASPECT_FALLBACK
            rc, outp = gen_once(ASPECT_FALLBACK)
        else:
            print("[E-GEN-01] 同命令重跑 1 次")
            rc, outp = gen_once(ASPECT)
    if rc != 0 or not os.path.exists(RAW):
        rec = {"frame": NAME, "result": "SKIP", "reason": "生图两次失败", "log": outp[-500:]}
        log_write(rec)
        print("[STOP] 生图两次失败，登记停上报"); sys.exit(3)
    try:
        Image.open(RAW).verify()
    except Exception as e:
        print(f"[E-GEN-02] 返回图损坏: {e}")
        os.rename(RAW, RAW.replace("_raw.png", "_fail1.png"))
        rc, outp = gen_once(aspect_note)
        if rc != 0 or not os.path.exists(RAW):
            rec = {"frame": NAME, "result": "SKIP", "reason": "重跑后仍失败/损坏", "log": outp[-500:]}
            log_write(rec)
            print("[STOP] 登记停上报"); sys.exit(3)

    credits_append(NAME, f"劈停左下重出：640x320 双格表双参照 img2img aspect={aspect_note}，"
                         f"左格基准=cast_down_1.png（链式锁手别）；prompt 任务书逐字")

    # check_left_v2（基准=cast_down_1，T=30；FAIL→重跑 1 次→再犯登记停上报）
    mean, ok = check_left(ANCHOR, RAW)
    rerun = None
    if not ok:
        rerun = f"check_left_FAIL_mean={mean:.3f}"
        os.rename(RAW, RAW.replace("_raw.png", "_fail1.png"))
        rc, outp = gen_once(aspect_note)
        if rc != 0 or not os.path.exists(RAW):
            rec = {"frame": NAME, "result": "SKIP", "reason": "check_left FAIL 后重跑生图失败"}
            log_write(rec)
            print("[STOP] 登记停上报"); sys.exit(3)
        credits_append(NAME + "_rerun", "check_left FAIL 同命令重跑 1 次（E-ANCHOR-01 口径）")
        mean, ok = check_left(ANCHOR, RAW)
        if not ok:
            rec = {"frame": NAME, "result": "SKIP", "reason": f"check_left_v2 两次 FAIL mean={mean:.3f}",
                   "check_left": round(mean, 3), "rerun": rerun}
            log_write(rec)
            print("[STOP] check_left_v2 再犯，登记停上报"); sys.exit(4)

    # 测量（门=任务书清单仅 check_left；高度比只实测记录不拦截）
    img = Image.open(RAW).convert("RGB")
    W, H = img.size
    corners(img, (0, 0, W // 2, H), "left")
    corners(img, (W // 2, 0, W, H), "right")
    L = cc_largest(img.crop((0, 0, W // 2, H)))
    R = cc_largest(img.crop((W // 2, 0, W, H)))
    lh = L[1][3] - L[1][1] if L else 0
    rw = R[1][2] - R[1][0] if R else 0
    rh = R[1][3] - R[1][1] if R else 0
    hr = rh / lh if lh and R else 0
    asp = rw / rh if rh and R else 0
    print(f"[gates] left_env={L[1] if L else None} h={lh} | right_env={R[1] if R else None} w={rw} h={rh} cc={R[0] if R else 0} "
          f"| height_ratio={hr:.3f}（实测记录） aspect={asp:.3f}（实测记录）")
    rec = {"frame": NAME, "raw_size": [W, H], "aspect": aspect_note, "check_left": round(mean, 3),
           "check_left_pass": ok, "rerun": rerun,
           "left_env": list(L[1]) if L else None, "left_h": lh,
           "right_env": list(R[1]) if R else None, "right_w": rw, "right_h": rh, "right_cc": R[0] if R else 0,
           "height_ratio_recorded": round(hr, 3), "aspect_recorded": round(asp, 3),
           "result": "GATED" if (R and R[0] >= MIN_CC) else "SKIP_RIGHT_MISSING"}
    log_write(rec)
    if rec["result"] != "GATED":
        print(f"[STOP] 右格主体缺失/过小（cc={R[0] if R else 0} < {MIN_CC}），登记停上报"); sys.exit(4)
    print("[gen] 完成（GATED→可 finish）")


# ---------- finish 阶段 ----------
def stage_finish():
    right = os.path.join(PC, "right", f"{NAME}_right.png")
    cut = os.path.join(PC, "cut", f"{NAME}_cut.png")
    final = os.path.join(LIB, f"{NAME}.png")
    if os.path.exists(final):
        print(f"[E-ENV-05] 入库目标已存在: {final}（步骤 1 应已归档）"); sys.exit(5)

    img = Image.open(RAW).convert("RGB")
    W, H = img.size
    img.crop((W // 2, 0, W, H)).save(right)

    # mxai 抠图（失败重试不超 1 次）
    env = os.environ.copy()
    nm = os.path.join(ROOT, "node_modules")
    if os.path.isdir(nm):
        env["NODE_PATH"] = nm
    rc = None
    for attempt in (1, 2):
        rc, _ = sh(["node", "scripts/mxai_web_cutout.js", right, cut], env=env)
        if rc == 0 and os.path.exists(cut):
            try:
                Image.open(cut).verify()
                break
            except Exception as e:
                print(f"[E-CUT] 抠图产物损坏 attempt{attempt}: {e}")
        else:
            print(f"[E-CUT-01] 抠图失败 attempt{attempt} rc={rc}")
        if attempt == 1 and os.path.exists(cut):
            os.rename(cut, cut.replace("_cut.png", "_fail1.png"))
    if rc != 0 or not os.path.exists(cut):
        rec = log_read().get(NAME, {"frame": NAME})
        rec["result"] = "SKIP"
        rec["reason"] = "mxai 抠图两次失败（E-CUT-01 上报）"
        log_write(rec)
        print("[STOP] 抠图两次失败，登记停上报"); sys.exit(3)

    # 归一 240×320：包络高 256、脚底基线 y=300、质心 x=120（任务书步骤 6）
    cimg = Image.open(cut).convert("RGBA")
    a = cimg.getchannel("A")
    bbox = a.point(lambda v: 255 if v > 0 else 0).getbbox()
    if bbox is None:
        rec = log_read().get(NAME, {"frame": NAME})
        rec["result"] = "SKIP"; rec["reason"] = "抠图结果全透明"; log_write(rec)
        print("[STOP] 抠图全透明"); sys.exit(3)
    ew, eh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    s = 256.0 / eh
    nw, nh = round(ew * s), round(eh * s)
    print(f"[norm] cut_env={ew}x{eh} scale={s:.4f} -> {nw}x{nh}")
    if nw > 240 or nh > 320:
        rec = log_read().get(NAME, {"frame": NAME})
        rec["result"] = "SKIP"
        rec["reason"] = f"归一溢出：适配后 {nw}x{nh} 超出 240x320 画布（报 Leo）"
        rec["cut_env"] = [ew, eh]
        log_write(rec)
        print(f"[STOP] {rec['reason']}"); sys.exit(4)
    body = cimg.crop(bbox).resize((nw, nh), Image.NEAREST)
    bd = list(body.getdata())
    sw = sx = 0
    for i, px in enumerate(bd):
        al = px[3]
        if al > 0:
            sw += al; sx += al * (i % nw)
    cx = sx / sw
    paste_x = round(120 - cx)
    canvas = Image.new("RGBA", (240, 320), (0, 0, 0, 0))
    canvas.paste(body, (paste_x, 300 - nh), body)
    canvas.save(final)
    # 复核
    fa = Image.open(final).getchannel("A")
    fb = fa.point(lambda v: 255 if v > 0 else 0).getbbox()
    fdata = list(Image.open(final).getdata())
    fw = 240; fsw = fsx = 0
    for i, px in enumerate(fdata):
        if px[3] > 0:
            fsw += px[3]; fsx += px[3] * (i % fw)
    fasp = (fb[2] - fb[0]) / (fb[3] - fb[1])
    print(f"[final] {final} bbox={fb} env={fb[2]-fb[0]}x{fb[3]-fb[1]} "
          f"bottom={fb[3]} centroid_x={fsx/fsw:.2f} aspect={fasp:.3f}")
    rec = log_read().get(NAME)
    rec["result"] = "OK"
    rec["final_bbox"] = list(fb)
    rec["final_env"] = [fb[2] - fb[0], fb[3] - fb[1]]
    rec["final_centroid_x"] = round(fsx / fsw, 2)
    rec["final_aspect"] = round(fasp, 3)
    log_write(rec)
    print(f"[finish] {NAME} 入库 OK")


if __name__ == "__main__":
    {"gen": stage_gen, "finish": stage_finish}[sys.argv[1]]()
