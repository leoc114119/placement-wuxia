#!/usr/bin/env python3
"""gen_icons_v2.py — 主界面七图标批量重生成（Leo 08-22 01:49 指令）
gpt-image-2 · 1:1 · 1K · 白底（出图后 cutout_white 抠透明）
产出: assets/ui/drafts/icons_v2/icon_<name>_v2.png (+ _t.png 透明版)
"""
import base64
import concurrent.futures as futures
import json
import os
import sys
import time
import urllib.request

BASE = "https://mcp.mxai.cn"
KEY = os.environ.get("MX_AI_API_KEY", "")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets/ui/drafts/icons_v2")

PREFIX = ("中国Q版水墨国风武侠游戏UI图标，活泼年轻、明亮清透不灰暗。"
          "色板：宣纸米#F8F4EA、墨色#2B2B2B、朱砂#E2574C、竹青#7FB069、黛青#4A7A6B、淡金#D4AF37。")

ICONS = {
    "silver":  "传统金元宝，淡金#D4AF37主体+朱砂高光，水墨简笔勾边",
    "point":   "书卷/竹简卷轴，墨色简笔，卷轴微展开",
    "martial": "翻开的武学秘籍书，墨线勾边+朱砂书签飘带",
    "bag":     "武侠行囊布包裹，墨线勾边+竹青束带",
    "map":     "山水云路画卷，黛青山峦+竹青云路，水墨简笔",
    "sect":    "山门牌楼+两侧旌旗，三角顶飘旗，墨色简笔",
    "friend":  "两位侠客拱手对拜剪影，墨色简笔+朱砂腰带点缀",
}


def req(method, path, body=None, timeout=90, retries=3):
    data = json.dumps(body).encode() if body is not None else None
    last = None
    for attempt in range(retries):
        r = urllib.request.Request(BASE + path, data=data, method=method)
        r.add_header("Authorization", f"Bearer {KEY}")
        if body is not None:
            r.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(r, timeout=timeout) as resp:
                return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            return e.code, {"error": e.read().decode()[:300]}
        except Exception as e:
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"重试失败: {last}")


def gen_one(name: str, desc: str) -> str:
    prompt = (PREFIX + f"1:1正方形单个图标：{desc}，笔画清晰，主体居中占画面60%~70%，"
              "纯白色背景，无任何文字，无水印")
    body = {"prompt": prompt, "model": "gpt-image-2", "aspect_ratio": "1:1",
            "resolution": "1K"}
    st, r = req("POST", "/mcp/api/generate/image", body)
    if st != 200 or not r.get("serial_no"):
        raise RuntimeError(f"{name} 提交失败 {st}: {json.dumps(r, ensure_ascii=False)[:200]}")
    sn = r["serial_no"]
    start = time.time()
    while time.time() - start < 420:
        st, r = req("GET", f"/mcp/api/task/{sn}")
        s = r.get("status")
        if s == 2:
            url = (r.get("image_urls") or [""])[0]
            out = os.path.join(OUT_DIR, f"icon_{name}_v2.png")
            os.makedirs(OUT_DIR, exist_ok=True)
            urllib.request.urlretrieve(url, out)
            print(f"✅ {name} ({time.time()-start:.0f}s)")
            return out
        if s == 3:
            raise RuntimeError(f"{name} 生成失败: {r.get('fail_msg')}")
        time.sleep(5)
    raise TimeoutError(f"{name} 轮询超时")


def main():
    sys.path.insert(0, ROOT + "/scripts")
    from assets_pipeline import cutout_white  # noqa: E402

    with futures.ThreadPoolExecutor(max_workers=7) as ex:
        futs = {ex.submit(gen_one, n, d): n for n, d in ICONS.items()}
        outs = []
        for f in futures.as_completed(futs):
            name = futs[f]
            try:
                outs.append((name, f.result()))
            except Exception as e:  # noqa: BLE001
                print(f"❌ {name}: {e}")
    print("\n== 抠透明 ==")
    for name, path in sorted(outs):
        t = cutout_white(path)
        print(f"  {os.path.basename(t)}")
    print(f"\n完成 {len(outs)}/7")


if __name__ == "__main__":
    main()
