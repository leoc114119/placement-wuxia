import json, subprocess
SID=open("/tmp/cocos_sid.txt").read().strip(); URL="http://127.0.0.1:3000/mcp"; _id=[1700]
def call(tool,args,t=30):
    _id[0]+=1
    b={"jsonrpc":"2.0","id":_id[0],"method":"tools/call","params":{"name":tool,"arguments":args}}
    p=subprocess.run(["curl","-s","-m",str(t),"-X","POST",URL,
      "-H","Content-Type: application/json","-H","Accept: application/json, text/event-stream",
      "-H",f"mcp-session-id: {SID}","-d",json.dumps(b)],capture_output=True,text=True)
    try: return json.loads(p.stdout)["result"]["content"][0]["text"]
    except: return ""

S=0.58
# 直接从截图观察调整：躯干中心在 y≈-9（场景坐标），肩大约在 y≈+55
# 手臂：让上臂顶端贴肩。上臂图片 148 高，中心锚 → 中心应在 肩y - 148*S/2
SH_Y = 62                    # 肩的场景 y（观察值）
def arm(ux, uy_note, uimg_h, fx, fimg_h, fimg_w):
    return (ux, SH_Y - uimg_h*S/2 + 6), (fx, SH_Y - uimg_h*S - fimg_h*S/2 + 16)

# 上臂中心 y、前臂中心 y（场景坐标）
UP_Y = SH_Y - 148*S/2 + 4
FA_Y = SH_Y - 148*S - 118*S/2 + 14
UP_Y2 = SH_Y - 151*S/2 + 4
FB_Y = SH_Y - 151*S - 87*S/2 + 14

LAY = {
 "UarmA": (-95, UP_Y),
 "FarmA": (-113, FA_Y),
 "UarmB": ( 97, UP_Y2),
 "FarmB": ( 118, FB_Y),
}
for name,(x,y) in LAY.items():
    call("cocos_node",{"action":"modify","node":f"Canvas/Hero/{name}",
        "position":{"x":round(x,1),"y":round(y,1),"z":0}})
print("手臂已按肩位重新对位：")
for k,v in LAY.items(): print(f"  {k:7s} ({v[0]:7.1f},{v[1]:7.1f})")
