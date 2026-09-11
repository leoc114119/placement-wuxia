#!/usr/bin/env python3
"""装配角色（正确写法）：先建空节点树 → 逐个 add cc.Sprite → set_property spriteFrame"""
import json, subprocess, sys

SID = open("/tmp/cocos_sid.txt").read().strip()
URL = "http://127.0.0.1:3000/mcp"
_id = [700]

SF = {
    "Head":  "02b7b26c-16a5-4e42-b7b4-cbdc49199b76@f9941",
    "Torso": "b59dc4b6-d7a0-4eb2-8d15-efaa9462102a@f9941",
    "UarmA": "5b300c7d-1d2f-437d-8030-a6317f080b2a@f9941",
    "UarmB": "332dc354-56b1-46f7-9542-e225e770cdcd@f9941",
    "FarmA": "5bd5dd61-884e-4c8e-8c4f-e4deffd934c3@f9941",
    "FarmB": "e343db05-44f2-40c2-acc0-f4bb2d2d319d@f9941",
    "ThighA":"2901f91d-137c-4744-977b-22ce849f83fb@f9941",
    "ThighB":"5cd04dc4-5815-4e9f-b42b-3a02d1f3ea9e@f9941",
    "ShinA": "5b394792-dfab-44c7-8849-497febb37945@f9941",
    "ShinB": "5b226d95-4c79-44f7-bb8e-eec9202c7bdc@f9941",
}
POS = {
    "ThighA": (-62,-260), "ThighB": (70,-262),
    "ShinA": (-74,-430),  "ShinB": (78,-432),
    "Torso": (0,-70),
    "UarmA": (-158,-20),  "FarmA": (-206,-104),
    "UarmB": (158,-22),   "FarmB": (212,-100),
    "Head":  (8,148),
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
        return p.stdout[:300]

def j(txt):
    try: return json.loads(txt)
    except: return {}

cmd = sys.argv[1] if len(sys.argv)>1 else "build"

if cmd == "clean":
    r=call("cocos_node", {"action":"delete","node":"Canvas/Hero"})
    print("clean:", j(r).get("message"))

elif cmd == "build":
    # 1) 建空节点树（不带组件）
    tree = {"name":"Hero","position":{"x":0,"y":0,"z":0},
            "children":[{"name":n,"position":{"x":POS[n][0],"y":POS[n][1],"z":0}} for n in POS]}
    r = j(call("cocos_builder", {"action":"build","parent":"Canvas","tree":tree}))
    print("建树:", r.get("message") or r.get("data",{}).get("totalCreated"), "节点")

    # 2) 逐节点加 Sprite
    ok=0
    for n,sf in SF.items():
        a = j(call("cocos_component", {"action":"add","node":f"Canvas/Hero/{n}","componentType":"cc.Sprite"}))
        if not a.get("success"): print(f"  ✗ {n} add: {a.get('error') or a.get('message')}"); continue
        b = j(call("cocos_component", {"action":"set_property","node":f"Canvas/Hero/{n}",
                  "componentName":"cc.Sprite","property":"spriteFrame",
                  "propertyType":"spriteFrame","value":sf}))
        if b.get("success"): ok+=1
        else: print(f"  ✗ {n} set: {b.get('error') or b.get('message')}")
    print(f"Sprite 装配完成: {ok}/{len(SF)}")

elif cmd == "hier":
    print(call("cocos_scene", {"action":"hierarchy"})[:1500])
