#!/usr/bin/env python3
"""T45 批 1 补丁 4 · 施放帧高举劈砍重出（cast_down_1/2，Leo 两轮纠偏合并：高位劈砍 + 手别锚定）。
正确动作 = 举臂过肩/过头向斜下劈砍：cast_1 右臂高举向左劈 → cast_2 从左上劈向右（收回剑位由 cast_3 复用锚承担）。
纠偏要点（任务书）：①词条禁"横扫/伸直微抬"（前两轮画成水平平举=做操）②cast_2 左格/参照/校验基准一律
锁定为 cast_down_1 成品（画面锚定手别，禁纯文字描述手别）③身体帧禁任何武器词。
流程同 patch_cast2：3:2 双格表 + check_left_v2 T=30 内容对齐 + 高度比 ±10% 门
+ mxai 抠图（右半区）+ 归一 240×320/包络高 256/底边 y=300/质心 x=120。
中间件全部落 patch_cast4/；骨架与姿势词条逐字来自任务书，禁自拟。
用法:
  python3 run_patch4.py gen <帧名>     # 建表+配方+生图+check_left_v2+门测量
  python3 run_patch4.py finish <帧名>  # 抠图+归一+入库（gen GATED 后）
"""
import json
import os
import subprocess
import sys
from collections import deque
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
B1 = os.path.join(ROOT, "assets/_trial_20260904/t45_batch1")
PC = os.path.join(B1, "patch_cast4")
LIB = os.path.join(ROOT, "assets/characters/hero/battle45")

# 链式锚定：cast_1 左格基准=battle_idle_down；cast_2 左格基准=cast_1 本轮成品（任务书步骤 3）
ANCHORS = {
    "cast_down_1": os.path.join(LIB, "battle_idle_down.png"),
    "cast_down_2": os.path.join(LIB, "cast_down_1.png"),
}

# 【共用骨架】任务书逐字（〈姿势词条〉代入；禁武器词已由任务书口径保证）
SKELETON = ("这是一张左右两格的精灵表。参考图 1 的左半格是角色的战斗待机帧——保持其画风、形象、比例完全不变。"
            "请在右半格空白区域绘制同一个角色的〈姿势词条〉："
            "同一角色（黑色高马尾白玉冠青绿发带、青绿汉服白衬袍深色腰封、白色灯笼裤黑色布鞋，空拳无武器无腰间挂物），"
            "45 度俯视直立立牌视角与左半格完全一致，头部正视前方，"
            "头身比例、体型宽窄、脸型五官、配色、像素密度、身形宽度全部与左格严格一致。"
            "全程只有角色的右臂在做劈砍挥动，角色的左臂始终自然垂放身侧完全不变。"
            "右半格背景纯白，无文字，无水印。")

FRAMES = {
    "cast_down_1": {"pose": "战斗劈砍动作·举臂向左：右臂高高举过头顶、向身体左上方伸展，肘部微曲，五指合拢握拳（拳头位置在头部左上方），手臂与身体形成向左下劈砍的弧线，上身微微向左倾，双腿微张发力站稳。"},
    "cast_down_2": {"pose": "战斗劈砍动作·从左上方向右劈：同一个角色，右臂从身体左上方（左半格中手臂所在的位置）挥动至身体右侧肩旁、肘部弯曲高举、五指合拢握拳（拳头位置在右肩上方），形成从左上向右下劈砍的弧线，上身微微向右转，双腿微张发力站稳。"},
}

WHITE_THRESH = 40
MIN_CC = 2000
T_LEFT = 30.0
H_BAND = (0.9, 1.1)   # 高度比门（任务书：高度比 ±10%）

# 画布几何同批 1/patch_cast2（--aspect 2:1 被 mxai gpt-image-2 预检拒绝的既证降级：3:2 画布 640×427，
# 640×320 双格条带垂直居中，上下白边各 53px）
ASPECT = "3:2"
STRIP_Y, STRIP_H = 53, 320
SHEET_W, SHEET_H = 640, 427


def out_band(W, H):
    y0 = round(H * STRIP_Y / SHEET_H)
    y1 = round(H * (STRIP_Y + STRIP_H) / SHEET_H)
    return y0, y1


# ---------- 测量（纯 PIL，同批 1/patch_cast2） ----------
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
    """check_left v2（内容对齐版，同批 1）：基准=本帧锚（cast_1=battle_idle_down / cast_2=cast_1 成品）"""
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
    p = os.path.join(PC, "measure_log_patch4.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def log_write(rec):
    p = os.path.join(PC, "measure_log_patch4.json")
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
                "ts": "2026-09-04 T45-batch1-patch4", "note": note})
    with open(p, "w", encoding="utf-8") as f:
        json.dump(arr, f, ensure_ascii=False, indent=1)
    print(f"[credits] +2 分，累计 {sum(x['cost'] for x in arr)} 分 / {len(arr)} 张")


def sh(cmd, env=None):
    print("[CMD] " + " ".join(cmd))
    r = subprocess.run(cmd, cwd=ROOT, env=env or os.environ.copy())
    return r.returncode


# ---------- 门测量 ----------
def measure_gates(name, raw, mean, ok, rerun=None):
    img = Image.open(raw).convert("RGB")
    W, H = img.size
    corners(img, (0, 0, W // 2, H), "left")
    corners(img, (W // 2, 0, W, H), "right")
    L = cc_largest(img.crop((0, 0, W // 2, H)))
    R = cc_largest(img.crop((W // 2, 0, W, H)))
    if L is None or R is None or R[0] < MIN_CC:
        rec = {"frame": name, "result": "SKIP", "reason": f"右格主体缺失/过小 cc={R[0] if R else 0}",
               "check_left": round(mean, 3), "rerun": rerun}
        log_write(rec)
        print(f"[STOP] {name} 右格主体缺失（cc={R[0] if R else 0} < {MIN_CC}），登记跳过")
        return rec
    lh = L[1][3] - L[1][1]
    rw = R[1][2] - R[1][0]
    rh = R[1][3] - R[1][1]
    hr = rh / lh if lh else 0
    asp = rw / rh if rh else 0
    gok = H_BAND[0] <= hr <= H_BAND[1]   # 任务书：门=高度比 ±10%（劈砍轮廓变化，免宽高比门，宽高比仅实测记录）
    print(f"[gates] left_env={L[1]} h={lh} | right_env={R[1]} w={rw} h={rh} cc={R[0]} "
          f"| height_ratio={hr:.3f} aspect={asp:.3f} gate=height±10% {'PASS' if gok else 'FAIL'}")
    rec = {"frame": name, "raw_size": [W, H], "check_left": round(mean, 3), "check_left_pass": ok,
           "rerun": rerun, "left_env": list(L[1]), "left_h": lh,
           "right_env": list(R[1]), "right_w": rw, "right_h": rh, "right_cc": R[0],
           "height_ratio": round(hr, 3), "aspect": round(asp, 3),
           "gate": "height", "gate_pass": gok,
           "result": "GATED" if gok else "GATE_FAIL"}
    log_write(rec)
    print(f"[measure] {name} 完成，result={rec['result']}（GATED→可 finish；GATE_FAIL→登记不重摇）")
    return rec


# ---------- gen 阶段 ----------
def stage_gen(name):
    spec = FRAMES[name]
    anchor = ANCHORS[name]
    if not os.path.exists(anchor):
        print(f"[STOP] {name} 链式锚不存在: {anchor}（cast_2 须在 cast_1 finish 后）"); sys.exit(6)
    sheet = os.path.join(PC, "sheets", f"{name}_sheet.png")
    pf = os.path.join(PC, "prompts", f"{name}.txt")
    raw = os.path.join(PC, "raw", f"{name}_raw.png")

    # a. 双格表 640×427（3:2）：左格=本帧锚（cast_1=battle_idle_down / cast_2=cast_1 成品），右半区纯白
    if not os.path.exists(sheet):
        canvas = Image.new("RGB", (SHEET_W, SHEET_H), "WHITE")
        anch = Image.open(anchor).convert("RGBA")
        canvas.paste(anch, (0, STRIP_Y), anch)
        canvas.save(sheet)
        print(f"[sheet] {sheet} {SHEET_W}x{SHEET_H} 条带 y={STRIP_Y}..{STRIP_Y+STRIP_H} 左格={os.path.basename(anchor)}")
    else:
        print(f"[sheet] 复用已有 {sheet}")

    # b. 配方（任务书共用骨架+姿势词条逐字代入）
    if not os.path.exists(pf):
        text = SKELETON.replace("〈姿势词条〉", spec["pose"])
        with open(pf, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"[prompt] {pf}")
    else:
        print(f"[prompt] 复用已有 {pf}")

    if os.path.exists(raw):
        print(f"[E-ENV-05] raw 已存在，禁覆盖: {raw}"); sys.exit(5)

    fail = None
    for attempt in (1, 2):
        rc = sh(["python3", "scripts/mxai_img2img.py", sheet, anchor,
                 "--out", raw, "--prompt-file", pf, "--aspect", ASPECT])
        if rc == 0 and os.path.exists(raw):
            try:
                Image.open(raw).verify()
                fail = None
                break
            except Exception as e:
                print(f"[E-GEN-02] 返回图损坏 attempt{attempt}: {e}")
        else:
            print(f"[E-GEN-01] 生图失败 attempt{attempt} rc={rc}")
        if attempt == 1:
            fail = f"attempt1_rc={rc}"
            if os.path.exists(raw):
                os.rename(raw, raw.replace("_raw.png", "_fail1.png"))
    if fail or not os.path.exists(raw):
        print(f"[STOP] {name} 生图两次失败，登记跳过"); sys.exit(3)

    credits_append(name, "施放帧高举劈砍重出：双格表双参照 img2img aspect=3:2，左格基准=" + os.path.basename(anchor))

    # c. check_left_v2（基准=本帧锚；FAIL→同命令重跑 1 次；再犯登记跳过）
    mean, ok = check_left(anchor, raw)
    rerun = None
    if not ok:
        rerun = f"check_left_FAIL_mean={mean:.3f}"
        os.rename(raw, raw.replace("_raw.png", "_fail1.png"))
        rc = sh(["python3", "scripts/mxai_img2img.py", sheet, anchor,
                 "--out", raw, "--prompt-file", pf, "--aspect", ASPECT])
        if rc != 0 or not os.path.exists(raw):
            print(f"[STOP] {name} 重跑生图失败，登记跳过"); sys.exit(3)
        credits_append(name + "_rerun", "check_left FAIL 同命令重跑 1 次（E-ANCHOR-01 口径）")
        mean, ok = check_left(anchor, raw)
        if not ok:
            rec = {"frame": name, "result": "SKIP", "reason": f"check_left_v2 两次 FAIL mean={mean:.3f}",
                   "check_left": round(mean, 3), "rerun": rerun}
            log_write(rec)
            print(f"[STOP] {name} check_left_v2 再犯，登记跳过该帧"); sys.exit(4)

    # d. 门测量
    rec = measure_gates(name, raw, mean, ok, rerun)
    if rec["result"] != "GATED":
        sys.exit(4)


# ---------- finish 阶段 ----------
def stage_finish(name):
    raw = os.path.join(PC, "raw", f"{name}_raw.png")
    right = os.path.join(PC, "right", f"{name}_right.png")
    cut = os.path.join(PC, "cut", f"{name}_cut.png")
    final = os.path.join(LIB, f"{name}.png")
    if os.path.exists(final):
        print(f"[E-ENV-05] 入库目标已存在，禁覆盖: {final}"); sys.exit(5)

    img = Image.open(raw).convert("RGB")
    W, H = img.size
    img.crop((W // 2, 0, W, H)).save(right)

    # mxai 抠图（失败重试不超 1 次）
    env = os.environ.copy()
    nm = os.path.join(ROOT, "node_modules")
    if os.path.isdir(nm):
        env["NODE_PATH"] = nm
    rc = None
    for attempt in (1, 2):
        rc = sh(["node", "scripts/mxai_web_cutout.js", right, cut], env=env)
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
        rec = log_read().get(name, {"frame": name})
        rec["result"] = "SKIP"
        rec["reason"] = "mxai 抠图两次失败（E-CUT-01 上报）"
        log_write(rec)
        print(f"[STOP] {name} 抠图两次失败，登记跳过"); sys.exit(3)

    # 归一 240×320：包络高 256、脚底基线 y=300、质心 x=120（口径同批 1）
    cimg = Image.open(cut).convert("RGBA")
    a = cimg.getchannel("A")
    bbox = a.point(lambda v: 255 if v > 0 else 0).getbbox()
    if bbox is None:
        rec = log_read().get(name, {"frame": name})
        rec["result"] = "SKIP"; rec["reason"] = "抠图结果全透明"; log_write(rec)
        print("[STOP] 抠图全透明"); sys.exit(3)
    ew, eh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    s = 256.0 / eh
    nw, nh = round(ew * s), round(eh * s)
    print(f"[norm] cut_env={ew}x{eh} scale={s:.4f} -> {nw}x{nh}")
    if nw > 240 or nh > 320:
        rec = log_read().get(name, {"frame": name})
        rec["result"] = "SKIP"
        rec["reason"] = f"归一溢出：适配后 {nw}x{nh} 超出 240x320 画布（报 Leo）"
        rec["cut_env"] = [ew, eh]
        log_write(rec)
        print(f"[STOP] {name} {rec['reason']}"); sys.exit(4)
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
    rec = log_read().get(name)
    rec["result"] = "OK"
    rec["final_bbox"] = list(fb)
    rec["final_env"] = [fb[2] - fb[0], fb[3] - fb[1]]
    rec["final_centroid_x"] = round(fsx / fsw, 2)
    rec["final_aspect"] = round(fasp, 3)
    log_write(rec)
    print(f"[finish] {name} 入库 OK")


if __name__ == "__main__":
    stage, name = sys.argv[1], sys.argv[2]
    if name not in FRAMES:
        print(f"未知帧名 {name}"); sys.exit(1)
    {"gen": stage_gen, "finish": stage_finish}[stage](name)
