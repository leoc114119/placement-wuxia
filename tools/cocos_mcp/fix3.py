import json, subprocess
SID=open("/tmp/cocos_sid.txt").read().strip(); URL="http://127.0.0.1:3000/mcp"; _id=[1300]
def call(tool,args,t=30):
    _id[0]+=1
    b={"jsonrpc":"2.0","id":_id[0],"method":"tools/call","params":{"name":tool,"arguments":args}}
    p=subprocess.run(["curl","-s","-m",str(t),"-X","POST",URL,
      "-H","Content-Type: application/json","-H","Accept: application/json, text/event-stream",
      "-H",f"mcp-session-id: {SID}","-d",json.dumps(b)],capture_output=True,text=True)
    try: return json.loads(p.stdout)["result"]["content"][0]["text"]
    except: return p.stdout[:120]
def ok(t):
    try: return json.loads(t).get("success")
    except: return False

# 部件真实像素尺寸
SZ = {"Head":(347,342),"Torso":(248,322),"UarmA":(143,148),"UarmB":(136,151),
      "FarmA":(108,118),"FarmB":(112,87),"ThighA":(140,174),"ThighB":(139,172),
      "ShinA":(139,191),"ShinB":(140,189)}
# 目标显示：整体缩到 ~520px 高（用节点 scale 统一 0.58 已设），这里只设 contentSize=原尺寸、scale=1
n=0
for name,(w,h) in SZ.items():
    a=call("cocos_component",{"action":"set_property","node":f"Canvas/Hero/{name}",
        "componentName":"cc.UITransform","property":"contentSize","propertyType":"size",
        "value":{"width":w,"height":h}})
    b=call("cocos_node",{"action":"modify","node":f"Canvas/Hero/{name}",
        "scale":{"x":0.58,"y":0.58,"z":1}})
    if ok(a): n+=1
    else: print(f"  ✗ {name}: {a[:120]}")
print(f"contentSize 设置成功 {n}/{len(SZ)}")
