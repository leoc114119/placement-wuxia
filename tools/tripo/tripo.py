#!/usr/bin/env python3
"""Tripo v3 API 最小客户端：上传 / 生成 / 轮询 / 下载。
用法示例：
  python3 tripo.py balance
  python3 tripo.py upload <file>
  python3 tripo.py image-to-model --input <file_or_url> --model v3.1-20260211 --out out.glb
  python3 tripo.py rig-check --input task_xxx
  python3 tripo.py rig --input task_xxx --spec mixamo --out rigged.glb
  python3 tripo.py retarget --input task_xxx --animation preset:biped:punch --out anim.glb
  python3 tripo.py wait <task_id>
"""
import argparse, json, mimetypes, os, sys, time, urllib.request, urllib.error, uuid

BASE = "https://openapi.tripo3d.ai/v3"
KEY = open(os.path.expanduser("~/.config/tripo/api_key")).read().strip()


def _req(path, method="GET", body=None, raw=None, ctype=None, timeout=60):
    url = BASE + path
    if raw is not None:
        data = raw
    elif body is not None:
        data = json.dumps(body).encode()
    else:
        data = None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bearer " + KEY)
    if body is not None and raw is None:
        r.add_header("Content-Type", "application/json")
    if ctype:
        r.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        txt = e.read().decode()[:600]
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, {"raw": txt}
    except Exception as e:
        return -1, {"error": str(e)}


def balance():
    return _req("/account/balance")


def upload(path):
    """POST /files multipart/form-data with a single 'file' part."""
    boundary = "----tripo" + uuid.uuid4().hex
    fn = os.path.basename(path)
    ctype = mimetypes.guess_type(fn)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        content = f.read()
    parts = []
    parts.append(("--" + boundary + "\r\n").encode())
    parts.append(('Content-Disposition: form-data; name="file"; filename="%s"\r\n' % fn).encode())
    parts.append(("Content-Type: %s\r\n\r\n" % ctype).encode())
    parts.append(content)
    parts.append(("\r\n--" + boundary + "--\r\n").encode())
    return _req("/files", "POST", raw=b"".join(parts),
                ctype="multipart/form-data; boundary=" + boundary)


def create(kind, payload):
    ep = {
        "image_to_model": "/generation/image-to-model",
        "text_to_model": "/generation/text-to-model",
        "rig_check": "/animations/rig-check",
        "rig": "/animations/rig",
        "retarget": "/animations/retarget",
        "convert": "/models/convert",
        "texture": "/models/texture",
    }[kind]
    return _req(ep, "POST", body=payload)


def wait(task_id, timeout=600, interval=3):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st, r = _req("/tasks/" + task_id)
        if st != 200:
            print("[poll]", st, r); time.sleep(interval); continue
        d = r.get("data", r)
        status = d.get("status")
        print("[%4ds] %s %s%%" % (int(time.time() - t0), status, d.get("progress", "")), flush=True)
        if status == "success":
            return d
        if status in ("failed", "cancelled", "banned", "expired"):
            return d
        time.sleep(interval)
    return {"status": "timeout"}


def download(url, out):
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    urllib.request.urlretrieve(url, out)
    return out


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("balance")

    p = sub.add_parser("upload"); p.add_argument("file")

    p = sub.add_parser("image-to-model")
    p.add_argument("--input", required=True, help="本地文件路径 / 公开 URL / file_token / task_xxx")
    p.add_argument("--model", default="v3.1-20260211")
    p.add_argument("--no-texture", action="store_true")
    p.add_argument("--face-limit", type=int)
    p.add_argument("--out")
    p.add_argument("--submit-only", action="store_true")

    p = sub.add_parser("rig-check"); p.add_argument("--input", required=True)

    p = sub.add_parser("rig")
    p.add_argument("--input", required=True)
    p.add_argument("--model", default="v1.0-20240301")
    p.add_argument("--rig-type", default="biped")
    p.add_argument("--spec", default="mixamo")
    p.add_argument("--out-format", default="glb")
    p.add_argument("--out")

    p = sub.add_parser("retarget")
    p.add_argument("--input", required=True)
    p.add_argument("--animation", required=True)
    p.add_argument("--out")

    p = sub.add_parser("convert")
    p.add_argument("--input", required=True)
    p.add_argument("--format", required=True)
    p.add_argument("--out")

    p = sub.add_parser("wait"); p.add_argument("task_id")

    a = ap.parse_args()

    if a.cmd == "balance":
        print(balance()); return

    if a.cmd == "upload":
        st, r = upload(a.file)
        print(st, r); return

    if a.cmd == "wait":
        print(json.dumps(wait(a.task_id), ensure_ascii=False, indent=2)); return

    if a.cmd == "image-to-model":
        inp = a.input
        if os.path.exists(inp):
            st, r = upload(inp)
            print("[upload]", st, r)
            if st != 200:
                sys.exit(1)
            inp = r["data"]["file_token"]
            print("[file_token]", inp)
        body = {"input": inp, "model": a.model}
        if a.no_texture:
            body["texture"] = False
        if a.face_limit:
            body["face_limit"] = a.face_limit
        st, r = create("image_to_model", body)
        print("[create]", st, r)
        if st != 200 or r.get("code") != 0:
            sys.exit(1)
        tid = r["data"]["task_id"]
        print("[task_id]", tid)
        open("/tmp/tripo_last_task.txt", "w").write(tid)
        if a.submit_only:
            return
        d = wait(tid)
        print(json.dumps(d, ensure_ascii=False, indent=2))
        if d.get("status") == "success" and a.out:
            u = d["output"].get("model_url") or d["output"].get("pbr_model")
            print("[saved]", download(u, a.out))
        return

    if a.cmd == "rig-check":
        st, r = create("rig_check", {"input": a.input})
        print("[create]", st, r)
        if st == 200 and r.get("code") == 0:
            print(json.dumps(wait(r["data"]["task_id"]), ensure_ascii=False, indent=2))
        return

    if a.cmd == "rig":
        st, r = create("rig", {"input": a.input, "model": a.model,
                               "rig_type": a.rig_type, "spec": a.spec, "out_format": a.out_format})
        print("[create]", st, r)
        if st != 200 or r.get("code") != 0:
            sys.exit(1)
        d = wait(r["data"]["task_id"])
        print(json.dumps(d, ensure_ascii=False, indent=2))
        if d.get("status") == "success" and a.out:
            print("[saved]", download(d["output"]["model_url"], a.out))
        return

    if a.cmd == "retarget":
        st, r = create("retarget", {"input": a.input, "animation": a.animation})
        print("[create]", st, r)
        if st != 200 or r.get("code") != 0:
            sys.exit(1)
        d = wait(r["data"]["task_id"])
        print(json.dumps(d, ensure_ascii=False, indent=2))
        if d.get("status") == "success" and a.out:
            print("[saved]", download(d["output"]["model_url"], a.out))
        return

    if a.cmd == "convert":
        st, r = create("convert", {"input": a.input, "format": a.format})
        print("[create]", st, r)
        if st != 200 or r.get("code") != 0:
            sys.exit(1)
        d = wait(r["data"]["task_id"])
        print(json.dumps(d, ensure_ascii=False, indent=2))
        if d.get("status") == "success" and a.out:
            print("[saved]", download(d["output"]["model_url"], a.out))
        return


if __name__ == "__main__":
    main()
