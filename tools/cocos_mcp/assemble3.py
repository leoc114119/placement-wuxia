"""按"关节连接点"对齐装配（不再用中心点硬摆）"""
import json, subprocess
SID=open("/tmp/cocos_sid.txt").read().strip(); URL="http://127.0.0.1:3000/mcp"; _id=[1500]
def call(tool,args,t=30):
    _id[0]+=1
    b={"jsonrpc":"2.0","id":_id[0],"method":"tools/call","params":{"name":tool,"arguments":args}}
    p=subprocess.run(["curl","-s","-m",str(t),"-X","POST",URL,
      "-H","Content-Type: application/json","-H","Accept: application/json, text/event-stream",
      "-H",f"mcp-session-id: {SID}","-d",json.dumps(b)],capture_output=True,text=True)
    try: return json.loads(p.stdout)["result"]["content"][0]["text"]
    except: return ""

S=0.58
# 真实像素尺寸
SZ={"Head":(347,342),"Torso":(248,322),"UarmA":(143,148),"UarmB":(136,151),
    "FarmA":(108,118),"FarmB":(112,87),"ThighA":(140,174),"ThighB":(139,172),
    "ShinA":(139,191),"ShinB":(140,189)}

# 布局：origin = 躯干中线在骨盆处。所有坐标以"像素"算，最后乘 S
# 躯干：中心 y。躯干顶=肩附近，底=腰/胯
# 参考立绘比例（原图角色总高约 1151px 源图，部件合计约 900px）
T = 0                     # 躯干中心
torso_h = 322
# 关键锚点（像素，y 向上为正）
SHOULDER_Y  = T + torso_h/2 - 40      # 肩在躯干上部
WAIST_Y     = T - torso_h/2 + 40      # 腰
HIP_Y       = T - torso_h/2 - 10      # 胯在躯干之下
HEAD_CY     = T + torso_h/2 + 342/2 - 30   # 头中心

LAY = {
  "Torso":  (0, T),
  "Head":   (10, HEAD_CY),
  # 上臂：肩连接（上臂顶端在肩）
  "UarmA":  (-150, SHOULDER_Y - 148/2 + 20),
  "UarmB":  ( 152, SHOULDER_Y - 151/2 + 20),
  # 前臂：肘连接（前臂顶端接上臂底端）
  "FarmA":  (-186, SHOULDER_Y - 148 - 118/2 + 70),
  "FarmB":  ( 194, SHOULDER_Y - 151 -  87/2 + 70),
  # 大腿：胯连接
  "ThighA": (-58, HIP_Y - 174/2 + 30),
  "ThighB": ( 66, HIP_Y - 172/2 + 30),
  # 小腿：膝连接
  "ShinA":  (-70, HIP_Y - 174 - 191/2 + 60),
  "ShinB":  ( 74, HIP_Y - 172 - 189/2 + 60),
}
n=0
for name,(x,y) in LAY.items():
    call("cocos_node",{"action":"modify","node":f"Canvas/Hero/{name}",
        "position":{"x":round(x*S,1),"y":round(y*S,1),"z":0}})
    call("cocos_node",{"action":"modify","node":f"Canvas/Hero/{name}",
        "scale":{"x":S,"y":S,"z":1}})
    n+=1
print(f"按关节对齐 {n} 个部件（S={S}）")
for k,v in LAY.items(): print(f"  {k:7s} 像素({v[0]:6.0f},{v[1]:6.0f}) → 场景({v[0]*S:6.1f},{v[1]*S:6.1f})")
