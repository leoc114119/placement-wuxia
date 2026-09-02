#!/usr/bin/env python3
"""T14 战斗帧生成流：按方向顺序生成 11 张动作帧（img2img 基准 = 该方向 battle_idle raw）。
每张：mxai img2img → flood_cut → 裁 bbox 存 raw → 积分台账。失败重试 1 次（换 v2 后缀）。
用法: python3 battle_gen_stream.py <dir>   # dir ∈ down/up/side
"""
import json, os, subprocess, sys, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_walk_frames import flood_cut, detect_enclosed_white
from PIL import Image

ROOT = "/Users/leochen/WorkBuddy/Claw/placement-wuxia/assets/characters/hero/battle_q"
SCRIPTS = "/Users/leochen/WorkBuddy/Claw/placement-wuxia/scripts"
ACTIONS = ["atk_1","atk_2","atk_3","cast_1","cast_2","cast_3","hit_1","hit_2","die_1","die_2","die_3"]

def ledger_add(entry):
    path = f"{ROOT}/credits.json"
    led = []
    if os.path.exists(path):
        with open(path) as f:
            led = json.load(f)
    led.append(entry)
    with open(path, "w") as f:
        json.dump(led, f, ensure_ascii=False, indent=1)
    return sum(x["cost"] for x in led)

def gen_one(name, prompt_file, base_img):
    """调 mxai_img2img.py 生成 gen/{name}.png；成功返回 True"""
    out = f"{ROOT}/gen/{name}.png"
    r = subprocess.run(
        ["python3", f"{SCRIPTS}/mxai_img2img.py", base_img, out,
         "--prompt-file", prompt_file],
        capture_output=True, text=True, timeout=420,
        env={**os.environ, "MX_AI_API_KEY": os.environ.get("MX_AI_API_KEY", "")})
    ok = r.returncode == 0 and os.path.exists(out)
    print(f"[{'OK' if ok else 'FAIL'}] {name}", flush=True)
    if not ok:
        print(r.stdout[-300:], r.stderr[-200:], flush=True)
    return ok

def cut_one(name):
    gen = Image.open(f"{ROOT}/gen/{name}.png")
    cut, _ = flood_cut(gen)
    bb = cut.getbbox()
    if bb is None:
        print(f"[EMPTY] {name} cutout 全透明", flush=True)
        return False
    cut.crop(bb).save(f"{ROOT}/raw/{name}.png")
    return True

def main(direction):
    base = f"{ROOT}/raw/battle_idle_{direction}.png"
    assert os.path.exists(base), f"缺基准帧 {base}"
    for act in ACTIONS:
        name = f"{direction}_{act}"
        gen_path = f"{ROOT}/gen/{name}.png"
        raw_path = f"{ROOT}/raw/{name}.png"
        if os.path.exists(raw_path):
            print(f"[SKIP] {name} 已有 raw", flush=True)
            continue
        prompt = f"{ROOT}/prompts/{name}.txt"
        ok = gen_one(name, prompt, base)
        used = 2 if ok else 0
        if ok:
            ok = cut_one(name)
        if not ok:
            print(f"[RETRY] {name}", flush=True)
            ok = gen_one(name + "_v2", prompt, base)
            if ok:
                ok = cut_one(name + "_v2")
            if ok:
                # v2 转正名
                os.replace(f"{ROOT}/raw/{name}_v2.png", raw_path)
                os.replace(f"{ROOT}/gen/{name}_v2.png", gen_path)
                used += 2
        if ok:
            ledger_add({"name": name, "model": "gpt-image-2", "cost": used,
                        "ts": datetime.datetime.now().strftime("%m-%d %H:%M"),
                        "note": f"动作帧 基准=battle_idle_{direction}" + (" 含重摇" if used > 2 else "")})
            print(f"[DONE] {name} (+{used}分)", flush=True)
        else:
            ledger_add({"name": name, "model": "gpt-image-2", "cost": used,
                        "ts": datetime.datetime.now().strftime("%m-%d %H:%M"),
                        "note": "FAILED 重摇后仍失败，跳过记报告"})
            print(f"[GIVEUP] {name}", flush=True)
    print(f"[STREAM {direction} FINISHED]", flush=True)

if __name__ == "__main__":
    main(sys.argv[1])
