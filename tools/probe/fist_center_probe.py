import json, math
from PIL import Image
rows=json.load(open('/tmp/rows26.json'))
BASE="assets/characters/hero/battle45/"
def skin_mask(im):
    px=im.load(); w,h=im.size
    m=Image.new("L",(w,h),0); mp=m.load()
    for y in range(h):
        for x in range(w):
            R,G,B,A=px[x,y]
            if A>32 and R>215 and 150<=G<=232 and 95<=B<=200 and R>G>B and (R-B)>50: mp[x,y]=255
    return m
def comps(mask,min_size=25):
    w,h=mask.size; px=mask.load(); seen=[[False]*w for _ in range(h)]; out=[]
    for y0 in range(h):
        for x0 in range(w):
            if px[x0,y0] and not seen[y0][x0]:
                st=[(x0,y0)]; seen[y0][x0]=True; pts=[]
                while st:
                    x,y=st.pop(); pts.append((x,y))
                    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                        nx,ny=x+dx,y+dy
                        if 0<=nx<w and 0<=ny<h and px[nx,ny] and not seen[ny][nx]:
                            seen[ny][nx]=True; st.append((nx,ny))
                if len(pts)>=min_size: out.append(pts)
    return out

def stats(c):
    xs=[q[0] for q in c]; ys=[q[1] for q in c]
    return dict(n=len(c), cx=sum(xs)/len(xs), cy=sum(ys)/len(ys),
                w=max(xs)-min(xs)+1, h=max(ys)-min(ys)+1)

print(f"{'frame':26s} {'label':>15s} {'picked':>15s} {'err':>6s} {'最佳可达':>8s}  pick_ok")
errs=[]; ceil=[]; okc=0
for r in rows:
    im=Image.open(BASE+r['body']).convert("RGBA")
    cs=[stats(c) for c in comps(skin_mask(im))]
    lab=r['fist']
    # 理论天花板：任意块中离标签最近的
    best=min(math.hypot(s['cx']-lab[0], s['cy']-lab[1]) for s in cs)
    ceil.append(best)
    # 规则：先排脸（大块或宽块），再在"紧凑块"里取最大
    nonface=[s for s in cs if not (s['n']>=250 or s['w']>=25)]
    cand=[s for s in nonface if 90<=s['n']<=260 and 9<=s['w']<=22 and 8<=s['h']<=24]
    pick=max(cand,key=lambda s:s['n']) if cand else (max(nonface,key=lambda s:s['n']) if nonface else None)
    if pick is None:
        print(f"{r['body']:26s} ... 无候选"); continue
    e=math.hypot(pick['cx']-lab[0], pick['cy']-lab[1]); errs.append(e)
    good = e<=5
    if good: okc+=1
    print(f"{r['body']:26s} ({lab[0]:6.1f},{lab[1]:6.1f}) ({pick['cx']:6.1f},{pick['cy']:6.1f}) {e:6.2f} {best:8.2f}  {'✓' if good else '✗'}")
n=len(errs)
errs.sort()
print(f"\n=== 规则命中（≤5px）: {okc}/{n} ===")
print(f"  中位误差 {errs[n//2]:.2f}px  最大 {errs[-1]:.2f}px")
print(f"  理论天花板（挑对块）: 中位 {sorted(ceil)[len(ceil)//2]:.2f}px  最大 {max(ceil):.2f}px  → 块测量本身可靠")
