#!/usr/bin/env python3
"""T45 批 1 单帧驱动：gen 阶段（建表+配方+生图+check_left_v2+门测量）/ finish 阶段（抠图+归一+入库+credits）。
用法:
  python3 run_frame.py gen <帧名>     # a~d 步
  python3 run_frame.py finish <帧名>  # e~f 步（gen 通过+目检后）
所有命令逐字打印；全部数值写入 measure_log.json。
"""
import json
import os
import subprocess
import sys
from collections import deque
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
B1 = os.path.join(ROOT, "assets/_trial_20260904/t45_batch1")
LIB = os.path.join(ROOT, "assets/characters/hero/battle45")
ANCHOR = os.path.join(LIB, "battle_idle_down.png")

FRAME_ORDER = ["walk_down_1", "walk_down_2", "jump_down_1", "jump_down_2",
               "atk_down_1", "atk_down_2", "atk_down_3",
               "cast_down_1", "cast_down_2", "cast_down_3", "die_down"]

SKELETON = ("以参考图 1（左半格角色）为基准生成右半格。"
            "参考图 1 的左半格是角色的战斗待机帧——保持其画风、形象、比例完全不变。"
            "请在右半格空白区域绘制同一个角色的〈姿势词条〉："
            "同一角色（黑色高马尾白玉冠青绿发带、青绿汉服白衬袍深色腰封、白色灯笼裤黑色布鞋，空拳无武器无腰间挂物），"
            "45 度俯视直立立牌视角与左半格完全一致，头部正视前方，"
            "头身比例、体型宽窄、脸型五官、配色、像素密度、身形宽度全部与左格严格一致。"
            "右半格背景纯白，无文字，无水印。")

FRAMES = {
    "walk_down_1": {"pose": "战场行走迈步A：左腿向前迈出、右臂自然后摆、双拳空握", "gate": "aspect"},
    "walk_down_2": {"pose": "战场行走迈步B：右腿向前迈出、左臂自然后摆、双拳空握", "gate": "aspect"},
    "jump_down_1": {"pose": "轻功起跳：双膝弯曲向上纵起、双臂上扬、身体微蜷缩", "gate": "height"},
    "jump_down_2": {"pose": "轻功腾空：身体腾空舒展、双腿后摆、双臂展开", "gate": "height"},
    "atk_down_1":  {"pose": "普攻起手：右拳后收蓄力、左拳前护于胸前", "gate": "height"},
    "atk_down_2":  {"pose": "普攻挥击：右拳向前快速挥出、身体微前倾", "gate": "height"},
    "atk_down_3":  {"pose": "普攻收招：右拳收回、身体回正恢复戒备", "gate": "aspect"},
    "cast_down_1": {"pose": "施放聚气：双掌合于胸前、双膝微蹲聚气", "gate": "aspect"},
    "cast_down_2": {"pose": "施放释放：双掌向前推出、掌心朝前", "gate": "height"},
    "cast_down_3": {"pose": "施放收招：双掌收回、身体回正", "gate": "aspect"},
    "die_down":    {"pose": "死亡躺平：仰面躺平于地面、四肢自然舒展、闭眼", "gate": "none",
                    "norm": "wide", "append": "躺平于地面，人物横置。"},
}

WHITE_THRESH = 40   # 与纯白欧氏距离阈值（主体掩码）
MIN_CC = 2000       # 右格最大连通域最小像素数（低于=主体缺失疑似）
T_LEFT = 30.0       # check_left v2 阈值（Leo 09-04 校准 12→30：重绘地板 21.2/22.9 实测，拦大改放重绘噪声）
H_BAND = (0.9, 1.1)       # 高度比门
ASP_BAND = (0.38, 0.55)   # 宽高比门

# —— 画布几何（卡点降级，详见 measure_log._blocker_aspect_2_1）——
# 任务书口径 --aspect 2:1 被 mxai gpt-image-2 预检拒绝（尺寸比例不合法，确定性、零成本实证）。
# 降级：3:2 画布 640×427，原 640×320 双格条带垂直居中（上下白边各 53px），模型/prompt/单价不变。
ASPECT = "3:2"
STRIP_Y, STRIP_H = 53, 320   # 条带在画布中的 y 偏移与高
SHEET_W, SHEET_H = 640, 427


def out_band(W, H):
    """返回图上条带（原 640×320 内容区）的像素 y 范围（按比例映射）。"""
    y0 = round(H * STRIP_Y / SHEET_H)
    y1 = round(H * (STRIP_Y + STRIP_H) / SHEET_H)
    return y0, y1


# ---------- 测量（纯 PIL） ----------
def cc_largest(region, thresh=WHITE_THRESH):
    """最大连通域：返回 (size, bbox_exclusive, mean_x) 或 None。region: RGB PIL。"""
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
    """E-GEN-05 角部色值实测。"""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
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
    """check_left v2（内容对齐版）：gpt-image-2 受理 3:2 后保留双格语义但会重排两格位置
    （walk_down_1 双样实证：角色不再贴画布左缘，固定坐标裁剪必然错位，mean≈353 纯错位伪影）。
    门的本意=左格内容锁死（锚未被改动）：定位左半区最大连通域包络 → NEAREST 缩放至锚包络同尺寸 → 逐像素 RGB 距离均值。"""
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
    # 锚透明像素底层 RGB=黑，必须先白底合成再取包络（黑污染会伪造 mean≈180）
    aref = Image.alpha_composite(Image.new("RGBA", src.size, "WHITE"), src).crop(abox).convert("RGB")
    sd, ld = list(aref.getdata()), list(crop.getdata())
    total = 0.0
    for (r1, g1, b1), (r2, g2, b2) in zip(sd, ld):
        total += ((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) ** 0.5
    mean = total / len(sd)
    ok = mean <= t
    print(f"[check_left_v2] content_aligned mean_rgb_dist={mean:.3f} T={t} "
          f"{'PASS' if ok else 'FAIL'} raw_left_env={bx} anchor_env={abox}")
    return mean, ok


# ---------- 记录 ----------
def log_read():
    p = os.path.join(B1, "measure_log.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def log_write(rec):
    p = os.path.join(B1, "measure_log.json")
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
                "ts": "2026-09-04 T45-batch1", "note": note})
    with open(p, "w", encoding="utf-8") as f:
        json.dump(arr, f, ensure_ascii=False, indent=1)
    print(f"[credits] +2 分，累计 {sum(x['cost'] for x in arr)} 分 / {len(arr)} 张")


def sh(cmd, env=None):
    print("[CMD] " + " ".join(cmd))
    r = subprocess.run(cmd, cwd=ROOT, env=env or os.environ.copy())
    return r.returncode


# ---------- 门测量（gen 与 remeasure 共用） ----------
def measure_gates(name, raw, mean, ok, rerun=None):
    """d. 门测量（引擎会重排两格位置 → 左右各取整半幅、最大连通域定位主体包络）"""
    spec = FRAMES[name]
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
    gate = spec["gate"]
    gok = True
    if gate == "height":
        gok = H_BAND[0] <= hr <= H_BAND[1]
    elif gate == "aspect":
        gok = ASP_BAND[0] <= asp <= ASP_BAND[1]
    print(f"[gates] left_env={L[1]} h={lh} | right_env={R[1]} w={rw} h={rh} cc={R[0]} "
          f"| height_ratio={hr:.3f} aspect={asp:.3f} gate={gate} {'PASS' if gok else 'FAIL'}")
    rec = {"frame": name, "raw_size": [W, H], "check_left": round(mean, 3), "check_left_pass": ok,
           "rerun": rerun, "left_env": list(L[1]), "left_h": lh,
           "right_env": list(R[1]), "right_w": rw, "right_h": rh, "right_cc": R[0],
           "height_ratio": round(hr, 3), "aspect": round(asp, 3),
           "gate": gate, "gate_pass": gok,
           "result": "GATED" if gok else "GATE_FAIL"}
    log_write(rec)
    print(f"[measure] {name} 完成，result={rec['result']}（GATED→可 finish；GATE_FAIL→登记不重摇）")
    return rec


# ---------- gen 阶段 ----------
def stage_gen(name):
    spec = FRAMES[name]
    sheet = os.path.join(B1, "sheets", f"{name}_sheet.png")
    pf = os.path.join(B1, "prompts", f"{name}.txt")
    raw = os.path.join(B1, "raw", f"{name}_raw.png")

    # a. 双格表 640×427（3:2 画布）：640×320 双格条带垂直居中，左格=锚 240×320，右半区纯白
    if not os.path.exists(sheet):
        canvas = Image.new("RGB", (SHEET_W, SHEET_H), "WHITE")
        anchor = Image.open(ANCHOR).convert("RGBA")
        canvas.paste(anchor, (0, STRIP_Y), anchor)
        canvas.save(sheet)
        print(f"[sheet] {sheet} {SHEET_W}x{SHEET_H} 条带 y={STRIP_Y}..{STRIP_Y+STRIP_H}")
    else:
        print(f"[sheet] 复用已有 {sheet}")

    # b. 配方
    if not os.path.exists(pf):
        text = SKELETON.replace("〈姿势词条〉", spec["pose"])
        if spec.get("append"):
            text += spec["append"]
        with open(pf, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"[prompt] {pf}")
    else:
        print(f"[prompt] 复用已有 {pf}")

    if os.path.exists(raw):
        print(f"[E-ENV-05] raw 已存在，禁覆盖: {raw}"); sys.exit(5)

    fail = None
    for attempt in (1, 2):
        rc = sh(["python3", "scripts/mxai_img2img.py", sheet, ANCHOR,
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

    credits_append(name, f"锚定表双参照 img2img aspect={ASPECT}（2:1 被拒降级，见 measure_log._blocker；左格={os.path.basename(ANCHOR)}）")

    # c. check_left_v2（FAIL→同命令重跑 1 次；再犯登记跳过）
    mean, ok = check_left(ANCHOR, raw)
    rerun = None
    if not ok:
        rerun = f"check_left_FAIL_mean={mean:.3f}"
        os.rename(raw, raw.replace("_raw.png", "_fail1.png"))
        rc = sh(["python3", "scripts/mxai_img2img.py", sheet, ANCHOR,
                 "--out", raw, "--prompt-file", pf, "--aspect", ASPECT])
        if rc != 0 or not os.path.exists(raw):
            print(f"[STOP] {name} 重跑生图失败，登记跳过"); sys.exit(3)
        credits_append(name + "_rerun", "check_left FAIL 同命令重跑 1 次（E-ANCHOR-01 口径）")
        mean, ok = check_left(ANCHOR, raw)
        if not ok:
            rec = {"frame": name, "result": "SKIP", "reason": f"check_left_v2 两次 FAIL mean={mean:.3f}",
                   "check_left": round(mean, 3), "rerun": rerun}
            log_write(rec)
            print(f"[STOP] {name} check_left_v2 再犯，登记跳过该帧"); sys.exit(4)

    # d. 门测量
    rec = measure_gates(name, raw, mean, ok, rerun)
    if rec["result"] != "GATED":
        sys.exit(4)


# ---------- remeasure 阶段（现存 raw 补测：Leo 裁决零成本续用） ----------
def stage_remeasure(name):
    raw = os.path.join(B1, "raw", f"{name}_raw.png")
    if not os.path.exists(raw):
        print(f"[STOP] 现存 raw 不存在: {raw}"); sys.exit(4)
    mean, ok = check_left(ANCHOR, raw)
    if not ok:
        print(f"[STOP] {name} check_left_v2 仍 FAIL（T={T_LEFT}），禁续用"); sys.exit(4)
    rec = measure_gates(name, raw, mean, ok, rerun="Leo 裁决零成本续用（T 校准 12→30 追认）")
    if rec["result"] != "GATED":
        sys.exit(4)


# ---------- finish 阶段 ----------
def stage_finish(name):
    spec = FRAMES[name]
    rec = log_read().get(name)
    if not rec or rec.get("result") != "GATED":
        print(f"[STOP] {name} 无 GATED 记录，禁 finish"); sys.exit(4)
    raw = os.path.join(B1, "raw", f"{name}_raw.png")
    right = os.path.join(B1, "right", f"{name}_right.png")
    cut = os.path.join(B1, "cut", f"{name}_cut.png")
    final = os.path.join(LIB, f"{name}.png")
    if os.path.exists(final):
        print(f"[E-ENV-05] 入库目标已存在，禁覆盖: {final}"); sys.exit(5)

    img = Image.open(raw).convert("RGB")
    W, H = img.size
    img.crop((W // 2, 0, W, H)).save(right)

    # e. mxai 抠图（失败重试不超 1 次）
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
        rec["result"] = "SKIP"
        rec["reason"] = "mxai 抠图两次失败（E-CUT-01 上报）"
        log_write(rec)
        print(f"[STOP] {name} 抠图两次失败，登记跳过"); sys.exit(3)

    # 归一 240×320：直立帧=包络高 256；横躺帧（Leo 09-04 裁决）=按宽适配包络宽 220（≤220）、
    # 底边贴 y=300、质心 x=120，高随比例自然。口径=锚实测：alpha>0 包络、质量质心。
    cimg = Image.open(cut).convert("RGBA")
    a = cimg.getchannel("A")
    bbox = a.point(lambda v: 255 if v > 0 else 0).getbbox()
    if bbox is None:
        rec["result"] = "SKIP"; rec["reason"] = "抠图结果全透明"; log_write(rec)
        print("[STOP] 抠图全透明"); sys.exit(3)
    ew, eh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    wide = spec.get("norm") == "wide"
    s = (220.0 / ew) if wide else (256.0 / eh)
    nw, nh = round(ew * s), round(eh * s)
    print(f"[norm] cut_env={ew}x{eh} scale={s:.4f} -> {nw}x{nh}" + ("（横躺宽适配口径）" if wide else ""))
    if nw > 240 or nh > 320:
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
    {"gen": stage_gen, "finish": stage_finish, "remeasure": stage_remeasure}[stage](name)
