#!/usr/bin/env python3
"""在 Cocos 里按真实部件尺寸装配角色（1:1 像素），并做出拳动画。
坐标系统：Canvas 设计分辨率 1280x720，原点在屏幕中心。
部件真实尺寸（px）：头347x342 / 躯干248x322 / 上臂143x148,136x151
  前臂+拳108x118,112x87 / 大腿140x174,139x172 / 小腿+鞋139x191,140x189
装配思路：以躯干为根，头在上、腿在下、臂在两侧。各部件用中心锚点(0.5,0.5)。
"""
import json, subprocess, sys

SID = open("/tmp/cocos_sid.txt").read().strip()
URL = "http://127.0.0.1:3000/mcp"
_id = [500]

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

def call(tool, args, timeout=45):
    _id[0] += 1
    body = {"jsonrpc":"2.0","id":_id[0],"method":"tools/call",
            "params":{"name":tool,"arguments":args}}
    p = subprocess.run(["curl","-s","-m",str(timeout),"-X","POST",URL,
        "-H","Content-Type: application/json",
        "-H","Accept: application/json, text/event-stream",
        "-H",f"mcp-session-id: {SID}",
        "-d",json.dumps(body)], capture_output=True, text=True)
    try:
        d = json.loads(p.stdout)
        return d["result"]["content"][0]["text"]
    except Exception:
        return p.stdout[:400]

def node(name, x, y, sf, z=0):
    return {"name": name, "position": {"x": x, "y": y, "z": z},
            "components": [{"type": "cc.Sprite", "props": {"spriteFrame": sf}}]}

# ---- 装配树（坐标单位=像素，Canvas 中心为原点）----
# 躯干中心放在 (0, -20)；头在躯干上方；腿在下方；臂在躯干两侧
TREE = {
    "name": "Hero",
    "position": {"x": 0, "y": 0, "z": 0},
    "children": [
        # 腿（最底层，先画）
        node("ThighA", -62, -260, SF["thighA"]),
        node("ThighB",  70, -262, SF["thighB"]),
        node("ShinA",  -74, -430, SF["shinA"]),
        node("ShinB",   78, -432, SF["shinB"]),
        # 躯干
        node("Torso", 0, -70, SF["torso"]),
        # 手臂（A=画面左/远侧，B=画面右/近侧）
        node("UarmA", -158, -20, SF["uarmA"]),
        node("FarmA", -206, -104, SF["farmA"]),
        node("UarmB",  158, -22, SF["uarmB"]),
        node("FarmB",  212, -100, SF["farmB"]),
        # 头
        node("Head", 8, 148, SF["head"]),
    ],
}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "build":
        r = call("cocos_builder", {"action":"build","parent":"Canvas","tree":TREE})
        print(r[:900])
    elif cmd == "hier":
        print(call("cocos_scene", {"action":"hierarchy"})[:1800])
    elif cmd == "shot":
        r = call("cocos_capture", {"action":"screenshot"})
        print(r[:600])
