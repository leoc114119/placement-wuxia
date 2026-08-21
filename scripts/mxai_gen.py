#!/usr/bin/env python3
"""mxai 生图脚本：提交 → 轮询 → 下载。用法：
python3 mxai_gen.py --prompt "..." --model seedream-5.0-pro --aspect 9:16 --out /path/out.png
"""
import argparse, json, os, sys, time, urllib.request

BASE = "https://mcp.mxai.cn"
KEY = os.environ.get("MX_AI_API_KEY", "")


def req(method, path, body=None, timeout=60):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {KEY}")
    if body is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode()[:500]}
    except Exception as e:
        return -1, {"error": str(e)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--model", default="seedream-5.0-pro")
    ap.add_argument("--aspect", default="9:16")
    ap.add_argument("--resolution", default="2K")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    if not KEY:
        print("ERR: MX_AI_API_KEY 未设置"); sys.exit(1)

    # 1. dry_run 报价（可选验证）
    st, r = req("POST", "/mcp/api/generate/image", {
        "prompt": a.prompt, "model": a.model, "aspect_ratio": a.aspect,
        "resolution": a.resolution, "dry_run": True})
    if st == 200 and r.get("quote_available"):
        print(f"[报价] {r.get('quote')} 积分")
    elif st != 200:
        print(f"[dry_run] {st}: {r}")

    # 2. 提交
    st, r = req("POST", "/mcp/api/generate/image", {
        "prompt": a.prompt, "model": a.model, "aspect_ratio": a.aspect,
        "resolution": a.resolution})
    if st != 200 or not r.get("serial_no"):
        print(f"[提交失败] {st}: {json.dumps(r, ensure_ascii=False)[:400]}")
        sys.exit(1)
    sn = r["serial_no"]
    print(f"[已提交] serial_no={sn} model={r.get('model')}")

    # 3. 轮询
    for i in range(40):
        time.sleep(5)
        st, r = req("GET", f"/mcp/api/task/{sn}")
        if st != 200:
            print(f"[轮询异常] {st}: {r}"); continue
        s = r.get("status")
        print(f"[{i*5}s] status={s} {r.get('status_text','')}")
        if s == 2:
            urls = r.get("image_urls") or []
            if not urls:
                print("[完成] 但无图片 URL"); sys.exit(1)
            os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
            urllib.request.urlretrieve(urls[0], a.out)
            print(f"[OK] 已下载到 {a.out}")
            print(f"[URL] {urls[0]}")
            sys.exit(0)
        if s == 3:
            print(f"[失败] {r.get('fail_msg')}"); sys.exit(1)
    print("[超时] 40 次轮询未完成"); sys.exit(1)


if __name__ == "__main__":
    main()
