#!/usr/bin/env python3
"""assets_pipeline.py — P0 素材批量管线（放置武侠）

流程：读 config/assets-p0.json → 并行提交全部任务 → 统一轮询下载
      → （帧表）切帧 → （帧表）白底转透明 → 生成 contact-sheet 验收页 → 汇总报告

用法:
  python3 scripts/assets_pipeline.py --only spr_shanzei     # 只跑指定 id（试跑/重跑单张）
  python3 scripts/assets_pipeline.py --skip hero            # 跑全部但跳过某些 id
  python3 scripts/assets_pipeline.py                        # 全量
依赖: MX_AI_API_KEY 环境变量；Pillow；项目根目录为 CWD 或自动切到脚本上级
"""
import argparse
import base64
import concurrent.futures as futures
import json
import os
import sys
import time
import urllib.request

from PIL import Image

BASE = "https://mcp.mxai.cn"
KEY = os.environ.get("MX_AI_API_KEY", "")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根


def req(method, path, body=None, timeout=90, retries=3):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    last = None
    for attempt in range(retries):
        r = urllib.request.Request(url, data=data, method=method)
        r.add_header("Authorization", f"Bearer {KEY}")
        if body is not None:
            r.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(r, timeout=timeout) as resp:
                return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            return e.code, {"error": e.read().decode()[:500]}
        except Exception as e:  # 网络抖动：Connection reset 等
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"请求重试 {retries} 次仍失败: {last}")


# ---------- 生成 ----------
def submit(asset):
    body = {
        "prompt": asset["prompt"],
        "model": asset["model"],
        "aspect_ratio": asset["aspect"],
        "resolution": asset.get("resolution", "2K"),
    }
    refs = [os.path.join(ROOT, p) for p in asset.get("refs", [])]
    if refs:
        imgs = []
        for p in refs:
            with open(p, "rb") as f:
                imgs.append("data:image/png;base64," + base64.b64encode(f.read()).decode())
        body["input_images"] = imgs
    st, r = req("POST", "/mcp/api/generate/image", body)
    if st != 200 or not r.get("serial_no"):
        raise RuntimeError(f"提交失败 {st}: {json.dumps(r, ensure_ascii=False)[:300]}")
    return r["serial_no"]


def poll(sn, timeout_s=420):
    start = time.time()
    while time.time() - start < timeout_s:
        st, r = req("GET", f"/mcp/api/task/{sn}")
        s = r.get("status")
        if s == 2:
            urls = r.get("image_urls") or []
            if not urls:
                raise RuntimeError("完成但无图")
            return urls[0]
        if s == 3:
            raise RuntimeError(f"生成失败: {r.get('fail_msg')}")
        time.sleep(5)
    raise TimeoutError(f"轮询超时 {sn}")


def download(url, path):
    path = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    urllib.request.urlretrieve(url, path)
    return path


# ---------- 后处理 ----------
def split_sheet(src, prefix, cols, rows):
    """按等距网格切帧（对齐 scripts/split_sheet.py 逻辑）"""
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    cw, ch = w // cols, h // rows
    outs = []
    for r_ in range(rows):
        for c in range(cols):
            box = (c * cw, r_ * ch, (c + 1) * cw, (r_ + 1) * ch)
            frame = img.crop(box)
            frame = frame.crop(frame.getbbox() or (0, 0, cw, ch))
            name = f"{prefix}{r_ * cols + c:02d}.png"
            frame.save(name)
            outs.append(name)
    return outs


def cutout_white(src, dst=None):
    """白底转透明（flood-fill 版，保留物件内部白色）"""
    from PIL import ImageDraw
    SENTINEL, THRESH = (0, 255, 0), 60
    im = Image.open(src).convert("RGB")
    w, h = im.size
    mask = im.copy()
    draw = ImageDraw.Draw(mask, "RGB")
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(mask, corner, SENTINEL, thresh=THRESH)
    rgba = im.convert("RGBA")
    px, mp = rgba.load(), mask.load()
    for y in range(h):
        for x in range(w):
            if mp[x, y] == SENTINEL:
                r_, g, b, _ = px[x, y]
                px[x, y] = (r_, g, b, 0)
    dst = dst or src.rsplit(".", 1)[0] + "_transparent.png"
    rgba.save(dst)
    return dst


def contact_sheet(frames, out, cols=4, cell=220):
    """拼验收大图：所有帧并排 + 编号"""
    from PIL import ImageDraw
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 24)), (248, 244, 234))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(frames):
        im = Image.open(f).convert("RGBA")
        im.thumbnail((cell - 8, cell - 8))
        x, y = (i % cols) * cell, (i // cols) * (cell + 24)
        sheet.paste(im, (x + 4, y + 4), im)
        d.text((x + 8, y + cell + 4), f"{i:02d}", fill=(43, 43, 43))
    sheet.save(out)
    return out


# ---------- 主流程 ----------
def run_asset(asset):
    t0 = time.time()
    aid = asset["id"]
    print(f"[{aid}] 提交（{asset['model']} {asset['aspect']}）...")
    sn = submit(asset)
    url = poll(sn)
    sheet_path = download(url, asset["out"])
    result = {"id": aid, "sheet": sheet_path, "ok": True, "elapsed": int(time.time() - t0), "frames": []}

    if asset.get("split"):
        cols, rows = asset["split"]
        frames_dir = os.path.join(ROOT, asset["frames_dir"])
        os.makedirs(frames_dir, exist_ok=True)
        prefix = os.path.join(frames_dir, aid + "_")
        frames = split_sheet(sheet_path, prefix, cols, rows)
        if asset.get("cutout"):
            for f in frames:
                cutout_white(f)
        result["frames"] = frames
        cs = contact_sheet(frames, os.path.join(os.path.dirname(sheet_path), f"{aid}_contact.png"))
        result["contact"] = cs
        print(f"[{aid}] 帧表 {cols}x{rows} 切割+抠图完成 -> {cs}")
    print(f"[{aid}] 完成（{result['elapsed']}s）")
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="只跑这些 id（逗号分隔）")
    ap.add_argument("--skip", help="跳过这些 id（逗号分隔）")
    a = ap.parse_args()
    if not KEY:
        print("ERR: MX_AI_API_KEY 未设置"); sys.exit(1)

    with open(os.path.join(ROOT, "config", "assets-p0.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    assets = cfg["assets"]
    if a.only:
        only = set(a.only.split(","))
        assets = [x for x in assets if x["id"] in only]
    if a.skip:
        skip = set(a.skip.split(","))
        assets = [x for x in assets if x["id"] not in skip]
    if not assets:
        print("无待跑素材"); sys.exit(0)

    print(f"=== 共 {len(assets)} 项，并行提交 ===")
    t0 = time.time()
    results, errors = [], []
    with futures.ThreadPoolExecutor(max_workers=min(6, len(assets))) as ex:
        futs = {ex.submit(run_asset, x): x["id"] for x in assets}
        for fu in futures.as_completed(futs):
            aid = futs[fu]
            try:
                results.append(fu.result())
            except Exception as e:
                errors.append((aid, str(e)))
                print(f"[{aid}] ❌ {e}")

    print("\n=== 汇总 ===")
    for r_ in sorted(results, key=lambda x: x["id"]):
        n = len(r_.get("frames", []))
        print(f"✅ {r_['id']}: sheet={os.path.relpath(r_['sheet'], ROOT)} "
              f"帧={n} 耗时={r_['elapsed']}s")
    for aid, e in errors:
        print(f"❌ {aid}: {e}")
    print(f"总耗时 {int(time.time() - t0)}s")
    if errors:
        sys.exit(2)


if __name__ == "__main__":
    main()
