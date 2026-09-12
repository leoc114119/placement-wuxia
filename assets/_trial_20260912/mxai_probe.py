#!/usr/bin/env python3
"""mxai 参数探测 —— 全部走 dry_run，绝不产生扣费。"""
import base64, json, os, sys, urllib.request

BASE = "https://mcp.mxai.cn"
KEY = os.environ.get("MX_AI_API_KEY", "")


def req(body, timeout=60):
    r = urllib.request.Request(BASE + "/mcp/api/generate/image",
                               data=json.dumps(body).encode(), method="POST")
    r.add_header("Authorization", f"Bearer {KEY}")
    r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode()[:300]}
    except Exception as e:
        return -1, {"error": str(e)}


if __name__ == "__main__":
    if not KEY:
        print("ERR: MX_AI_API_KEY 未设置"); sys.exit(1)

    # 一张小参照图（只为走通 img2img 形态，不生成）
    ref = sys.argv[1] if len(sys.argv) > 1 else None
    imgs = []
    if ref:
        imgs = ["data:image/png;base64," + base64.b64encode(open(ref, "rb").read()).decode()]

    print("=== 模型 x 画幅 x 分辨率 dry_run 探测 ===")
    for model in ["gpt-image-2"]:
        for aspect in ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "5:2"]:
            for res in ["1K", "2K"]:
                st, r = req({"prompt": "probe", "model": model, "aspect_ratio": aspect,
                             "resolution": res, "input_images": imgs, "dry_run": True})
                if st == 200 and r.get("quote_available"):
                    print("  OK   %-12s %-5s %-5s quote=%s" % (model, aspect, res, r.get("quote")))
                else:
                    msg = json.dumps(r, ensure_ascii=False)[:140]
                    print("  FAIL %-12s %-5s %-5s %s %s" % (model, aspect, res, st, msg))
