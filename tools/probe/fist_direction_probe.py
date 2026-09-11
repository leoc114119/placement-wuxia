from PIL import Image

D="assets/_trial_20260910/t45_chain_limb_alternation_v2/raw/"

def skin_blobs(im, minsz=800):
    im=im.convert("RGBA"); px=im.load(); w,h=im.size
    m=[[False]*w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r,g,b,A=px[x,y]
            if A>32 and r>190 and g>120 and b>80 and r>g>b and (r-b)>40: m[y][x]=True
    seen=[[False]*w for _ in range(h)]; out=[]
    for y0 in range(h):
        for x0 in range(w):
            if m[y0][x0] and not seen[y0][x0]:
                st=[(x0,y0)]; seen[y0][x0]=True; pts=[]
                while st:
                    x,y=st.pop(); pts.append((x,y))
                    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                        nx,ny=x+dx,y+dy
                        if 0<=nx<w and 0<=ny<h and m[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx]=True; st.append((nx,ny))
                if len(pts)>=minsz:
                    xs=[q[0] for q in pts]; ys=[q[1] for q in pts]
                    out.append(dict(n=len(pts), cx=sum(xs)/len(xs), cy=sum(ys)/len(ys),
                                    x0=min(xs),x1=max(xs),y0=min(ys),y1=max(ys),
                                    w=max(xs)-min(xs)+1,h=max(ys)-min(ys)+1))
    return sorted(out,key=lambda d:-d["n"])

def torso(im):
    """躯干中线：用青色衣的 x 范围中值"""
    im=im.convert("RGBA"); px=im.load(); w,h=im.size
    xs=[]
    for y in range(int(h*0.35), int(h*0.75), 3):
        for x in range(0,w,2):
            r,g,b,A=px[x,y]
            if A>32 and g>70 and r<g-25 and b>50: xs.append(x)
    return (min(xs)+max(xs))/2 if xs else w/2

print("=== 三帧拳位：相对躯干中线，看『伸出方向』 ===")
for i in (1,2,3):
    im=Image.open(D+f"atk_right_{i}_chain.png")
    mid=torso(im)
    blobs=skin_blobs(im)
    print(f"\n  atk_{i}  躯干中线 x={mid:.0f}   画布宽={im.width}")
    for b in blobs[:3]:
        side = "画面右" if b['cx']>mid else "画面左"
        reach = b['cx']-mid
        print(f"      拳 中心x={b['cx']:.0f} y={b['cy']:.0f} 尺寸{b['w']}x{b['h']} 面积{b['n']}"
              f"  → 距中线 {reach:+.0f}px ({side})")
