#!/usr/bin/env python3
"""mxai img2img 通用脚本（放置武侠）
用法: python3 mxai_img2img.py <input.png> <out.png> [--prompt-file p.txt | --prompt "..."] [--model slug] [--aspect 9:16]
不传 prompt 参数时回退到内置 PROMPT（角色形象类，风格锚 = assets/ui/ref_char_style_v1.png 的原始用法）
"""
import base64, json, os, sys, time, urllib.request

BASE = "https://mcp.mxai.cn"
KEY = os.environ.get("MX_AI_API_KEY", "")

PROMPT = (
    "中国Q版水墨国风武侠游戏UI设计，活泼年轻、现代国风气质（参考一念逍遥/逆水寒），"
    "明亮清透不灰暗、年轻不老气。"
    "色板：宣纸米#F8F4EA为底、浅杏#F0E6D4与深杏#E0D2B4次级面板；朱砂#E2574C主强调、"
    "深朱砂#C94A40按钮重点；竹青#7FB069与黛青#4A7A6B点缀；淡金#D4AF37印章装饰。"
    "宣纸底细腻纸纹，墨色细描边，大圆角，水墨纸卡/木匾面板，纸纹噪点、墨晕投影。"
    "【布局】严格保持参考图的布局结构与各区域比例："
    "顶部状态栏——左侧圆形头像框，右上角为两组「圆形小图标+数字」资源显示（银两、学点），"
    "不出现文字标签；"
    "中央为2.5D等距视角水墨野外场景——主体是斜向透视的可行走地面"
    "（草地、石板野径、几株松树），地面开阔、角色可在上面移动，远处水墨晕染远山；"
    "场景中下部三个圆形朱砂描边功能按钮（闭关/挂机/挑战）——图标占按钮主体、文字极小；"
    "底部导航栏四个Tab（武学/装备/江湖/门派）——图标大、文字小，选中Tab带淡金印章角标；"
    "无助战或社交入口；除上述按钮与Tab的小字外画面不出现任何文字数字，无水印"
)


def req(method, path, body=None, timeout=90):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {KEY}")
    if body is not None:
        r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode())


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("out")
    ap.add_argument("--prompt", default=None, help="内联 prompt；与 --prompt-file 二选一")
    ap.add_argument("--prompt-file", dest="prompt_file", default=None)
    ap.add_argument("--model", default="gpt-image-2",
                    help="默认 gpt-image-2 标准版 1K（2分/张，Leo 2026-09-01 成本口径）；按需 --model seedream-5.0-pro")
    ap.add_argument("--aspect", default="9:16")
    ap.add_argument("--resolution", default="1K")
    a = ap.parse_args()

    if a.prompt_file:
        with open(a.prompt_file, encoding="utf-8") as f:
            prompt = f.read().strip()
    elif a.prompt:
        prompt = a.prompt
    else:
        prompt = PROMPT

    src, out = a.input, a.out
    if not KEY:
        print("ERR: MX_AI_API_KEY 未设置"); sys.exit(1)

    with open(src, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    st, r = req("POST", "/mcp/api/generate/image", {
        "prompt": prompt,
        "model": a.model,
        "aspect_ratio": a.aspect,
        "resolution": a.resolution,
        "input_images": [f"data:image/png;base64,{b64}"],
    })
    if st != 200 or not r.get("serial_no"):
        print(f"[提交失败] {st}: {json.dumps(r, ensure_ascii=False)[:400]}"); sys.exit(1)
    sn = r["serial_no"]
    print(f"[已提交] serial_no={sn}")

    for i in range(60):
        time.sleep(5)
        st, r = req("GET", f"/mcp/api/task/{sn}")
        s = r.get("status")
        print(f"[{i*5}s] status={s} {r.get('status_text','')}")
        if s == 2:
            urls = r.get("image_urls") or []
            os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
            urllib.request.urlretrieve(urls[0], out)
            print(f"[OK] {out}")
            print(f"[URL] {urls[0]}")
            sys.exit(0)
        if s == 3:
            print(f"[失败] {r.get('fail_msg')}"); sys.exit(1)
    print("[超时]"); sys.exit(1)


if __name__ == "__main__":
    main()
