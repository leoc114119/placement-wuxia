#!/usr/bin/env python3
"""T45 批 1a（right 向 11 帧）单帧驱动 · 依据 tasks/idle_prompts/t45-batch1a-right-frames.md 逐步实现。
用法:
  python3 run_frame_1a.py run <帧名>    # 全流程：双格表→img2img→check_left_v2→门→切右格→抠图→归一→体宽锁→入库
  python3 run_frame_1a.py retry_bw <帧名>  # 体宽锁越界后的同命令整帧重跑（限 1 次）
所有命令逐字打印；数值写 measure_log.json；生图记账 credits.json。

与批 1（down）管线差异（任务书给死）:
  - 左格锚 = battle_idle_right.png；右格 = 锚的复制（供模型改姿势），非空白
  - prompt 骨架逐字换新（任务书 §1 步 2）；姿势词条给死逐字（§2）
  - 内容对齐定位右半区主体（连通域左右分类，取代固定半幅裁切）
  - 新增体宽锁门：头部区宽（包络顶部 30% 最大行宽）vs 基准（实测 119px，Leo 09-04
    现场裁定替代存档 123px——123 与门定义口径实测冲突，勘误登记走工单）；
    [0.97,1.03] PASS / (0.94,1.06) 横向微缩放校正限幅 ±6% 复测 / 越界 FAIL 整帧重跑 1 次
  - jump 免宽高比门（高度一致性门=raw 双主体高度比 [0.9,1.1]，锚即 256 基准）
  - die 免高度比/宽高比/体宽锁，归一=宽适配 220、贴底 y300、质心 x120
"""
import json
import os
import subprocess
import sys
from collections import deque
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
B1A = os.path.join(ROOT, "assets/_trial_20260904/t45_batch1a")
CHECK_SCRIPT = os.path.join(ROOT, "assets/_trial_20260904/t45_batch1/check_left_v2.py")
LIB = os.path.join(ROOT, "assets/characters/hero/battle45")
ANCHOR = os.path.join(LIB, "battle_idle_right.png")

# —— 任务书 §1 步 6 基准：Leo 09-04 现场裁定用实测 119px（存档 123px 与门定义口径冲突，勘误另登记）——
HEAD_BASE = 119.0

FRAME_ORDER = ["walk_right_1", "walk_right_2", "jump_right_1", "jump_right_2",
               "atk_right_1", "atk_right_2", "atk_right_3",
               "cast_right_1", "cast_right_2", "cast_right_3", "die_right"]

# —— prompt 骨架（任务书 §1 步 2 逐字，<姿势词条> 为占位替换）——
SKELETON = ("以双格表为基准生成：左格角色保持完全不变；右格生成同一角色的姿势帧：<姿势词条>。"
            "画风（细颗粒小色块平涂、清晰细深色描边、明亮清透）、服饰配色、头身比例、体格宽度与左格完全一致（禁止变瘦变宽）。"
            "纯白背景，无文字，无武器，无水印。")

# —— 姿势词条（任务书 §2 给死逐字；括注的门元数据不入 prompt）——
FRAMES = {
    "walk_right_1": {"pose": "行走迈步：画面右侧的腿在前弯曲迈步、画面左侧的腿在后蹬直，双臂一前一后自然摆动，身体略前倾", "gate": "aspect", "bw": True},
    "walk_right_2": {"pose": "行走迈步换相：画面左侧的腿迈到前方弯曲、画面右侧的腿在后蹬直，双臂摆动位置与迈步相反", "gate": "aspect", "bw": True},
    "jump_right_1": {"pose": "起跳蜷缩：双膝深蹲蜷缩收紧，双臂收于身侧偏后，重心下沉", "gate": "height", "bw": True},
    "jump_right_2": {"pose": "腾空：双腿离地伸展微分开，身体向上拉长，双臂上扬展开", "gate": "height", "bw": True},
    "atk_right_1":  {"pose": "普攻起手：双拳收护于胸前，身体微后倾蓄力", "gate": "aspect", "bw": True},
    "atk_right_2":  {"pose": "普攻挥击：画面右侧的臂朝画面右方直拳挥出打直，另一拳护于腰侧，身体前倾", "gate": "aspect", "bw": True},
    "atk_right_3":  {"pose": "普攻收招：挥出的拳收回护于胸前，身体回正微蹲", "gate": "aspect", "bw": True},
    "cast_right_1": {"pose": "施放举臂：画面右侧的臂伸向画面右上方举过头顶，拳握紧，身体微后仰", "gate": "aspect", "bw": True},
    "cast_right_2": {"pose": "施放挥砍：画面右侧的臂从画面右上方朝画面左下横挥扫过身前，拳过胸腹前，身体前倾", "gate": "aspect", "bw": True},
    "cast_right_3": {"pose": "施放收回：手臂收回垂于身侧，回到戒备站姿", "gate": "aspect", "bw": True},
    "die_right":    {"pose": "死亡躺平：全身水平横躺，头在画面左侧、双腿伸直在画面右侧，双目闭合", "gate": "none", "norm": "wide", "bw": False},
}

WHITE_THRESH = 40
MIN_CC = 2000
T_LEFT = 30.0
H_BAND = (0.9, 1.1)        # raw 双主体高度比门 = jump 高度一致性门（256±10% 同带）
ASP_BAND = (0.38, 0.55)    # 宽高比门（jump/die 豁免）
BW_PASS = (0.97, 1.03)     # 体宽锁 PASS 带
BW_CORR = (0.94, 1.06)     # 校正带（外侧=FAIL），校正限幅 ±6%
DIE_WIDE = 220             # die 宽适配包络宽

# —— 画布几何（沿批 1 卡点降级口径：3:2 画布 640×427，640×320 双格条带垂直居中）——
ASPECT = "3:2"
STRIP_Y, STRIP_H = 53, 320
SHEET_W, SHEET_H = 640, 427
RIGHT_X = 360  # 右格=锚的复制，在右半区(320..640)内居中摆放（240 宽 → x=360）


# ---------- 连通域（纯 PIL） ----------
def cc_all(region, thresh=WHITE_THRESH):
    """全图连通域列表 [(size,(x0,y0,x1,y1),cx,cy), ...]，size 降序。region: RGB PIL。"""
    W, H = region.size
    px = list(region.getdata())
    fg = bytearray(W * H)
    for i, (r, g, b) in enumerate(px):
        if (255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2 > thresh * thresh:
            fg[i] = 1
    seen = bytearray(W * H)
    out = []
    for start in range(W * H):
        if seen[start] or not fg[start]:
            continue
        seen[start] = 1
        q = deque([start])
        size = 0
        minx = maxx = start % W
        miny = maxy = start // W
        while q:
            i = q.popleft()
            size += 1
            x, y = i % W, i // W
            minx = min(minx, x); maxx = max(maxx, x)
            miny = min(miny, y); maxy = max(maxy, y)
            for n in ((i - 1) if x > 0 else -1, (i + 1) if x < W - 1 else -1,
                      (i - W) if y > 0 else -1, (i + W) if y < H - 1 else -1):
                if n >= 0 and fg[n] and not seen[n]:
                    seen[n] = 1
                    q.append(n)
        out.append((size, (minx, miny, maxx + 1, maxy + 1)))
    out.sort(key=lambda t: -t[0])
    return out


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


def anchor_env_whitesynth():
    src = Image.open(ANCHOR).convert("RGBA")
    aref = Image.alpha_composite(Image.new("RGBA", src.size, "WHITE"), src)
    abox = aref.getchannel("A").point(lambda v: 255 if v > 0 else 0).getbbox()
    return aref.crop(abox).convert("RGB"), abox


def content_dist(crop, aref_crop):
    """两 RGB 块（已同尺寸）逐像素 RGB 距离均值。"""
    sd, ld = list(aref_crop.getdata()), list(crop.getdata())
    total = 0.0
    for (r1, g1, b1), (r2, g2, b2) in zip(sd, ld):
        total += ((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) ** 0.5
    return total / len(sd)


def locate_subjects(raw_path):
    """内容对齐定位：全图连通域按包络中心 x 分左右（W/2 界），左主体=左族最大，右主体=右族最大。
    右族空且最大连通域跨中线（双主体粘连）→ 回退批 1 固定半幅法（各半幅内取最大）。
    返回 (left_cc, right_cc, mode)。"""
    img = Image.open(raw_path).convert("RGB")
    W, H = img.size
    ccs = [c for c in cc_all(img) if c[0] >= MIN_CC]
    left = [c for c in ccs if (c[1][0] + c[1][2]) / 2 < W / 2]
    right = [c for c in ccs if (c[1][0] + c[1][2]) / 2 >= W / 2]
    lcc = left[0] if left else None
    rcc = right[0] if right else None
    mode = "content_aligned"
    if rcc is None and ccs:
        big = ccs[0]
        if big[1][0] < W / 2 < big[1][2]:  # 跨中线粘连 → 固定半幅回退
            mode = "fixed_half_fallback"
            L = cc_all(img.crop((0, 0, W // 2, H)))
            R = cc_all(img.crop((W // 2, 0, W, H)))
            L = [c for c in L if c[0] >= MIN_CC]
            R = [c for c in R if c[0] >= MIN_CC]
            lcc = ((L[0][0], (L[0][1][0], L[0][1][1], L[0][1][2], L[0][1][3])) if L else None)
            rcc = ((R[0][0], (R[0][1][0] + W // 2, R[0][1][1], R[0][1][2] + W // 2, R[0][1][3])) if R else None)
    print(f"[locate:{mode}] cc>={MIN_CC}px: {[(c[0], c[1]) for c in ccs]} -> left={lcc and lcc[1]} right={rcc and rcc[1]}")
    return lcc, rcc


# ---------- 记录 ----------
def log_read():
    p = os.path.join(B1A, "measure_log.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def log_write(rec):
    p = os.path.join(B1A, "measure_log.json")
    logs = log_read()
    logs[rec["frame"]] = rec
    with open(p, "w", encoding="utf-8") as f:
        json.dump(logs, f, ensure_ascii=False, indent=1)


def log_write_meta(key, obj):
    p = os.path.join(B1A, "measure_log.json")
    logs = log_read()
    logs[key] = obj
    with open(p, "w", encoding="utf-8") as f:
        json.dump(logs, f, ensure_ascii=False, indent=1)


def credits_append(name, note):
    p = os.path.join(B1A, "credits.json")
    arr = []
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            arr = json.load(f)
    arr.append({"name": name, "model": "gpt-image-2", "cost": 2,
                "ts": "2026-09-04 T45-batch1a", "note": note})
    with open(p, "w", encoding="utf-8") as f:
        json.dump(arr, f, ensure_ascii=False, indent=1)
    print(f"[credits] +2 分，本批累计 {sum(x['cost'] for x in arr)} 分 / {len(arr)} 张")
    return sum(x["cost"] for x in arr)


def sh(cmd, env=None):
    print("[CMD] " + " ".join(cmd))
    r = subprocess.run(cmd, cwd=ROOT, env=env or os.environ.copy())
    return r.returncode


# ---------- a. 双格表 / b. 配方 ----------
def build_sheet(name):
    sheet = os.path.join(B1A, "sheets", f"frame_{name}.png")
    if not os.path.exists(sheet):
        canvas = Image.new("RGB", (SHEET_W, SHEET_H), "WHITE")
        anchor = Image.open(ANCHOR).convert("RGBA")
        canvas.paste(anchor, (0, STRIP_Y), anchor)            # 左格=锚原样锁死
        canvas.paste(anchor, (RIGHT_X, STRIP_Y), anchor)      # 右格=锚的复制（供改姿势）
        canvas.save(sheet)
        print(f"[sheet] {sheet} {SHEET_W}x{SHEET_H} 左格x=0 右格x={RIGHT_X} 条带y={STRIP_Y}..{STRIP_Y+STRIP_H}")
    else:
        print(f"[sheet] 复用已有 {sheet}")
    return sheet


def build_prompt(name):
    pf = os.path.join(B1A, "prompts", f"{name}.txt")
    if not os.path.exists(pf):
        with open(pf, "w", encoding="utf-8") as f:
            f.write(SKELETON.replace("<姿势词条>", FRAMES[name]["pose"]))
        print(f"[prompt] {pf}")
    else:
        print(f"[prompt] 复用已有 {pf}")
    return pf


# ---------- c/d. 生图+校验+raw 门 ----------
def gen_and_check(name, sheet, pf, credit_note=None):
    raw = os.path.join(B1A, "raw", f"{name}_raw.png")
    if os.path.exists(raw):
        print(f"[E-ENV-05] raw 已存在，禁覆盖: {raw}")
        sys.exit(5)

    def once():
        rc = sh(["python3", "scripts/mxai_img2img.py", sheet,
                 "--out", raw, "--prompt-file", pf, "--aspect", ASPECT])
        if rc == 0 and os.path.exists(raw):
            try:
                Image.open(raw).verify()
                return True
            except Exception as e:
                print(f"[E-GEN-02] 返回图损坏: {e}")
        else:
            print(f"[E-GEN-01] 生图失败 rc={rc}")
        return False

    if not once():
        if os.path.exists(raw):
            os.rename(raw, raw.replace("_raw.png", "_fail1.png"))
        if not once():
            print(f"[STOP] {name} 生图两次失败，登记停报")
            log_write({"frame": name, "result": "SKIP", "reason": "E-GEN-01/02 两次失败"})
            sys.exit(3)
    credits_append(name, credit_note or f"锚定表双格 img2img aspect={ASPECT}（左格=battle_idle_right 锁死，右格=锚复制；单参照=双格表）")

    # c. check_left_v2（T=30；FAIL→作废同命令重跑 1 次，再犯停报 E-ANCHOR-01）
    ok = False
    mean = None
    for attempt in (1, 2):
        r = subprocess.run(["python3", CHECK_SCRIPT, ANCHOR, raw, str(T_LEFT)],
                           cwd=ROOT, capture_output=True, text=True)
        print(r.stdout.strip())
        line = r.stdout.strip()
        if "mean_rgb_dist=" in line:
            mean = float(line.split("mean_rgb_dist=")[1].split()[0])
        ok = (r.returncode == 0)
        if ok:
            break
        print(f"[E-ANCHOR-01] check_left_v2 FAIL（attempt{attempt}），该张作废同命令重跑")
        if os.path.exists(raw):
            os.rename(raw, raw.replace("_raw.png", "_fail1.png"))
        if not once():
            print(f"[STOP] {name} 重跑生图失败，登记停报")
            log_write({"frame": name, "result": "SKIP", "reason": "check FAIL 后重跑生图失败", "check_left": mean})
            sys.exit(3)
        credits_append(name + "_rerun", "check_left_v2 FAIL 作废同命令重跑 1 次（E-ANCHOR-01 口径）")
    if not ok:
        print(f"[STOP] {name} check_left_v2 再犯（mean={mean}），停报")
        log_write({"frame": name, "result": "SKIP", "reason": f"E-ANCHOR-01 两次 FAIL mean={mean}", "check_left": mean})
        sys.exit(4)

    # d. raw 门：E-GEN-05 角部 + 内容对齐双主体 + 高度比（die 豁免）+ 右主体缺失重跑 1 次
    img = Image.open(raw).convert("RGB")
    W, H = img.size
    nb = corners(img, (0, 0, W, H), "raw")
    lcc, rcc = locate_subjects(raw)
    for attempt in (1, 2):
        if rcc is not None:
            break
        print(f"[E-GEN-04] 右格主体缺失（attempt{attempt}），同 prompt 重跑")
        if os.path.exists(raw):
            os.rename(raw, raw.replace("_raw.png", "_fail1.png"))
        if not once():
            print(f"[STOP] {name} 重跑生图失败，登记停报")
            log_write({"frame": name, "result": "SKIP", "reason": "右格主体缺失且重跑生图失败"})
            sys.exit(3)
        credits_append(name + "_rerun", "右格主体缺失同 prompt 重跑 1 次（E-GEN-04 口径）")
        img = Image.open(raw).convert("RGB")
        lcc, rcc = locate_subjects(raw)
    if rcc is None:
        print("[STOP] 右格主体缺失两次，登记停报")
        log_write({"frame": name, "result": "SKIP", "reason": "E-GEN-04 右格主体缺失两次"})
        sys.exit(4)

    lh = lcc[1][3] - lcc[1][1]
    rw = rcc[1][2] - rcc[1][0]
    rh = rcc[1][3] - rcc[1][1]
    hr = rh / lh if lh else 0
    gate = FRAMES[name]["gate"]
    hok = True
    if gate in ("height", "aspect"):   # 高度比对全部直立帧生效（die=none 豁免）
        hok = H_BAND[0] <= hr <= H_BAND[1]
    print(f"[rawgates] left_env={lcc[1]} h={lh} | right_env={rcc[1]} w={rw} h={rh} "
          f"| height_ratio={hr:.3f} band={H_BAND} {'PASS' if hok else 'FAIL'} (gate={gate})")

    # 姿势退化参考指标：右主体 vs 锚 内容距离（重绘噪声地板≈21~23）
    aref, abox = anchor_env_whitesynth()
    rcrop = img.crop(rcc[1]).resize((abox[2] - abox[0], abox[3] - abox[1]), Image.NEAREST)
    pd = content_dist(rcrop, aref)
    print(f"[pose_delta] right_vs_anchor={pd:.2f}（数值仅供退化参照，判定权在 Leo 目验）")

    rec = {"frame": name, "raw_size": [W, H], "check_left": mean, "corners_nonwhite": bool(nb),
           "left_env": list(lcc[1]), "left_h": lh,
           "right_env": list(rcc[1]), "right_w": rw, "right_h": rh,
           "height_ratio": round(hr, 3), "height_pass": hok,
           "pose_delta": round(pd, 2), "gate": gate}
    if not hok:
        rec["result"] = "SKIP"
        rec["reason"] = f"raw 高度比门 FAIL {hr:.3f}（登记不重摇，候 Leo）"
        log_write(rec)
        print(f"[STOP] {name} 高度比门 FAIL，登记跳过")
        sys.exit(4)
    if nb:
        rec["result"] = "SKIP"
        rec["reason"] = "E-GEN-05 背景非纯白（角部实测），禁自行处理，候 Leo"
        log_write(rec)
        print(f"[STOP] {name} E-GEN-05 背景非纯白，登记跳过")
        sys.exit(4)
    log_write(rec)
    return rec


# ---------- e/f. 切右格→抠图→归一→体宽锁→入库 ----------
def head_width(img_rgba):
    """包络顶部 30% 区域最大行宽（与基准同口径）。"""
    a = img_rgba.getchannel("A").point(lambda v: 255 if v > 0 else 0)
    bbox = a.getbbox()
    if bbox is None:
        return None, None
    eh = bbox[3] - bbox[1]
    band_bot = bbox[1] + int(eh * 0.30)
    maxw = 0
    for y in range(bbox[1], band_bot):
        xs = [x for x in range(bbox[0], bbox[2]) if img_rgba.getpixel((x, y))[3] > 0]
        if xs:
            maxw = max(maxw, xs[-1] - xs[0] + 1)
    return maxw, (bbox, eh)


def centroid_x(rgba):
    data = list(rgba.getdata())
    W = rgba.size[0]
    sw = sx = 0
    for i, px in enumerate(data):
        if px[3] > 0:
            sw += px[3]; sx += px[3] * (i % W)
    return (sx / sw) if sw else 0.0


def paste_norm(body, nw, nh):
    cx = centroid_x(body)
    px = round(120 - cx)
    canvas = Image.new("RGBA", (240, 320), (0, 0, 0, 0))
    canvas.paste(body, (px, 300 - nh), body)
    return canvas, px


def finish(name):
    spec = FRAMES[name]
    rec = log_read().get(name)
    if not rec or rec.get("result") not in (None, "GATED", "OK") or rec.get("check_left") is None:
        print(f"[STOP] {name} 无 gen 通过记录，禁 finish")
        sys.exit(4)
    if rec.get("result") == "SKIP":
        print(f"[STOP] {name} 已登记 SKIP，禁 finish")
        sys.exit(4)
    final = os.path.join(LIB, f"{name}.png")
    if os.path.exists(final):
        print(f"[E-ENV-05] 入库目标已存在，禁覆盖: {final}")
        sys.exit(5)
    raw = os.path.join(B1A, "raw", f"{name}_raw.png")
    right = os.path.join(B1A, "right", f"{name}_right.png")
    cut = os.path.join(B1A, "cut", f"{name}_cut.png")

    # 内容对齐切右格：右主体包络外扩 8px（全图坐标系裁切，防越中线截断）
    _, rcc = locate_subjects(raw)
    if rcc is None:
        print("[STOP] 右主体定位失败")
        sys.exit(4)
    img = Image.open(raw).convert("RGB")
    W, H = img.size
    x0, y0, x1, y1 = rcc[1]
    box = (max(0, x0 - 8), max(0, y0 - 8), min(W, x1 + 8), min(H, y1 + 8))
    img.crop(box).save(right)
    print(f"[cut-right] {right} box={box}")

    # mxai 统一通道抠图（失败重试不超 1 次）
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
        if attempt == 1:
            if os.path.exists(cut):
                os.rename(cut, cut.replace("_cut.png", "_fail1.png"))
            rc = None
    if rc != 0 or not os.path.exists(cut):
        rec["result"] = "SKIP"; rec["reason"] = "E-CUT-01 抠图两次失败"
        log_write(rec)
        print(f"[STOP] {name} 抠图两次失败，登记停报")
        sys.exit(3)

    cimg = Image.open(cut).convert("RGBA")
    a = cimg.getchannel("A")
    bbox = a.point(lambda v: 255 if v > 0 else 0).getbbox()
    if bbox is None:
        rec["result"] = "SKIP"; rec["reason"] = "抠图结果全透明"
        log_write(rec)
        print("[STOP] 抠图全透明")
        sys.exit(3)
    ew, eh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    wide = spec.get("norm") == "wide"
    s = (float(DIE_WIDE) / ew) if wide else (256.0 / eh)
    nw, nh = round(ew * s), round(eh * s)
    print(f"[norm] cut_env={ew}x{eh} scale={s:.4f} -> {nw}x{nh}" + ("（die 宽适配口径）" if wide else ""))
    if nw > 240 or nh > 320:
        rec["result"] = "SKIP"; rec["reason"] = f"归一溢出 {nw}x{nh} 超 240x320（报 Leo）"
        rec["cut_env"] = [ew, eh]
        log_write(rec)
        print(f"[STOP] {name} 归一溢出")
        sys.exit(4)
    body = cimg.crop(bbox).resize((nw, nh), Image.NEAREST)
    canvas, px_used = paste_norm(body, nw, nh)

    # 宽高比门（jump/die 豁免；校正前测）
    fb = canvas.getchannel("A").point(lambda v: 255 if v > 0 else 0).getbbox()
    fasp = (fb[2] - fb[0]) / (fb[3] - fb[1])
    asp_ok = True
    if spec["gate"] == "aspect":
        asp_ok = ASP_BAND[0] <= fasp <= ASP_BAND[1]
        print(f"[aspect] {fasp:.3f} band={ASP_BAND} {'PASS' if asp_ok else 'FAIL'}")
        if not asp_ok:
            rec["result"] = "SKIP"; rec["reason"] = f"宽高比门 FAIL {fasp:.3f}（登记不重摇，候 Leo）"
            rec["final_aspect"] = round(fasp, 3)
            log_write(rec)
            print(f"[STOP] {name} 宽高比门 FAIL，登记跳过")
            sys.exit(4)
    elif spec["gate"] == "height":
        print(f"[height-consistency] 归一包络高={fb[3]-fb[1]}（构造=256，带 256±26）PASS")

    # 体宽锁门（die 豁免；基准 119=锚实测，Leo 09-04 裁定）
    bw_data = {"baseline": HEAD_BASE}
    if spec["bw"]:
        hw, meta = head_width(canvas)
        r = hw / HEAD_BASE
        bw_data["head_w"] = hw
        bw_data["ratio"] = round(r, 4)
        print(f"[bw] head_w={hw} base={HEAD_BASE} ratio={r:.4f}")
        if r <= BW_CORR[0] or r >= BW_CORR[1]:
            bw_data["verdict"] = "FAIL_OUT_OF_BAND"
            rec["body_width"] = bw_data
            rec["result"] = "SKIP"
            rec["reason"] = f"体宽锁越界 FAIL ratio={r:.4f}（重跑经 retry_bw，限 1 次）"
            log_write(rec)
            print(f"[STOP] {name} 体宽锁越界（{r:.4f}），登记待重跑")
            sys.exit(4)
        elif not (BW_PASS[0] <= r <= BW_PASS[1]):
            factor = max(BW_CORR[0], min(BW_CORR[1], 1.0 / r))
            nw2 = max(1, round(nw * factor))
            print(f"[bw-corr] ratio 在校正带，横向微缩放 factor={factor:.4f} {nw}->{nw2}（限幅±6%）")
            body2 = body.resize((nw2, nh), Image.NEAREST)
            canvas, px_used = paste_norm(body2, nw2, nh)
            hw2, _ = head_width(canvas)
            r2 = hw2 / HEAD_BASE
            bw_data.update({"corrected_factor": round(factor, 4), "head_w_after": hw2,
                            "ratio_after": round(r2, 4),
                            "verdict": "PASS_AFTER_CORR" if BW_PASS[0] <= r2 <= BW_PASS[1] else "FAIL_AFTER_CORR"})
            print(f"[bw-corr] 复测 head_w={hw2} ratio={r2:.4f} -> {bw_data['verdict']}")
            if bw_data["verdict"] != "PASS_AFTER_CORR":
                rec["body_width"] = bw_data
                rec["result"] = "SKIP"
                rec["reason"] = f"体宽锁校正后复测仍出带 ratio={r2:.4f}"
                log_write(rec)
                print(f"[STOP] {name} 校正复测仍出带，登记待重跑")
                sys.exit(4)
        else:
            bw_data["verdict"] = "PASS"
    rec["body_width"] = bw_data

    canvas.save(final)
    # 入库复核
    f2 = Image.open(final)
    fb2 = f2.getchannel("A").point(lambda v: 255 if v > 0 else 0).getbbox()
    fcx = centroid_x(f2)
    print(f"[final] {final} bbox={fb2} env={fb2[2]-fb2[0]}x{fb2[3]-fb2[1]} "
          f"bottom={fb2[3]} centroid_x={fcx:.2f}")
    rec["result"] = "OK"
    rec["final_bbox"] = list(fb2)
    rec["final_env"] = [fb2[2] - fb2[0], fb2[3] - fb2[1]]
    rec["final_bottom_y"] = fb2[3]
    rec["final_centroid_x"] = round(fcx, 2)
    rec["final_aspect"] = round((fb2[2] - fb2[0]) / (fb2[3] - fb2[1]), 3)
    log_write(rec)
    print(f"[finish] {name} 入库 OK")


def stage_run(name):
    spec = FRAMES[name]
    sheet = build_sheet(name)
    pf = build_prompt(name)
    rec = log_read().get(name, {})
    if rec.get("result") == "OK":
        print(f"[skip] {name} 已入库，跳过")
        return
    if os.path.exists(os.path.join(LIB, f"{name}.png")):
        print(f"[E-ENV-05] 入库目标已存在: {name}.png")
        sys.exit(5)
    if not (os.path.exists(os.path.join(B1A, "raw", f"{name}_raw.png")) and rec.get("check_left") is not None
            and rec.get("result") not in ("SKIP",)):
        gen_and_check(name, sheet, pf)
        # gen_and_check 后重取记录
    finish(name)


def stage_retry_bw(name):
    """体宽锁越界后的同命令整帧重跑（任务书 §1 步 6：重跑 1 次，再犯停报）。"""
    rec = log_read().get(name, {})
    if rec.get("body_width", {}).get("verdict") not in ("FAIL_OUT_OF_BAND", "FAIL_AFTER_CORR"):
        print(f"[STOP] {name} 无体宽锁 FAIL 记录，禁 retry")
        sys.exit(4)
    if rec.get("bw_rerun_done"):
        print(f"[STOP] {name} 体宽锁重跑已用过（再犯停报），附数据上报")
        sys.exit(4)
    raw = os.path.join(B1A, "raw", f"{name}_raw.png")
    if os.path.exists(raw):
        os.rename(raw, raw.replace("_raw.png", "_bwfail1.png"))
    sheet = build_sheet(name)
    pf = build_prompt(name)
    # 清掉旧记录重来（保留 bw_rerun_done 标记）
    logs = log_read()
    logs[name] = {"frame": name, "bw_rerun_done": True}
    with open(os.path.join(B1A, "measure_log.json"), "w", encoding="utf-8") as f:
        json.dump(logs, f, ensure_ascii=False, indent=1)
    gen_and_check(name, sheet, pf, credit_note="体宽锁越界整帧同命令重跑 1 次（任务书 §1 步 6；基准 119px）")
    finish(name)


if __name__ == "__main__":
    stage, name = sys.argv[1], sys.argv[2]
    if name not in FRAMES:
        print(f"未知帧名 {name}")
        sys.exit(1)
    {"run": stage_run, "retry_bw": stage_retry_bw}[stage](name)
