#!/usr/bin/env python3
"""Cocos 骨骼 demo 驱动器：通过 MCP HTTP 调用编辑器。
建节点层级 → 装 Sprite → 出拳动画。
"""
import json, subprocess, sys, time

SID = open("/tmp/cocos_sid.txt").read().strip()
URL = "http://127.0.0.1:3000/mcp"
_id = [100]

def call(tool, args, timeout=40):
    _id[0] += 1
    body = {"jsonrpc": "2.0", "id": _id[0], "method": "tools/call",
            "params": {"name": tool, "arguments": args}}
    p = subprocess.run(
        ["curl", "-s", "-m", str(timeout), "-X", "POST", URL,
         "-H", "Content-Type: application/json",
         "-H", "Accept: application/json, text/event-stream",
         "-H", f"mcp-session-id: {SID}",
         "-d", json.dumps(body)],
        capture_output=True, text=True)
    out = p.stdout.strip()
    try:
        d = json.loads(out)
        c = d.get("result", {}).get("content", [{}])
        txt = c[0].get("text", "") if c else ""
        return txt
    except Exception:
        return out[:600]

def show(label, txt, n=500):
    print(f"── {label}")
    print("   " + txt[:n].replace("\n", "\n   "))

# 部件 spriteFrame UUID
SF = {
    "head":  "02b7b26c-16a5-4e42-b7b4-cbdc49199b76@f9941",
    "torso": "b59dc4b6-d7a0-4eb2-8d15-efaa9462102a@f9941",
    "uarmA": "5b300c7d-1d2f-437d-8030-a6317f080b2a@f9941",
    "uarmB": "332dc354-56b1-46f7-9542-e225e770cdcd@f9941",
    "farmA": "5bd5dd61-884e-4c8e-8c4f-e4deffd934c3@f9941",
    "farmB": "e343db05-44f2-40c2-acc0-f4bb2d2d319d@f9941",
    "thighA":"2901f91d-137c-4744-977b-22ce849f83fb@f9941",
    "thighB":"5cd04dc4-5815-4e9f-b42b-3a02d1f3ea9e@f9941",
    "shinA": "5b394792-dfab-44c7-8849-497febb37945@f9941",
    "shinB": "5b226d95-4c79-44f7-bb8e-eec9202c7bdc@f9941",
}

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "hier":
        show("场景层级", call("cocos_scene", {"action": "hierarchy"}), 1500)
    elif len(sys.argv) > 1 and sys.argv[1] == "test":
        show("节点工具用法", call("cocos_node", {"action": "help"}), 1200)
    else:
        print("用法: drive.py hier | test")
