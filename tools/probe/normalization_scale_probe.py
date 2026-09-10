from PIL import Image

def load(p): return Image.open(p).convert("RGBA")
def bbox(pts):
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    return min(xs),min(ys),max(xs),max(ys)
def blobs(im,pred,minsz):
    px=im.load(); w,h=im.size
    m=[[False]*w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r,g,b,A=px[x,y]
            if A>32 and pred(r,g,b): m[y][x]=True
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
                if len(pts)>=minsz: out.append(pts)
    return out
skin=lambda r,g,b: r>190 and g>120 and b>80 and r>g>b and (r-b)>40

def face_w(im):
    w,h=im.size
    fs=blobs(im,skin,max(200,w*h//300000))
    if not fs: return None
    fs.sort(key=lambda c:bbox(c)[1])
    b=bbox(fs[0]); return b[2]-b[0]+1

R="assets/_trial_20260910/t45_v2_right_batch_seq328/raw/"
raws=[load(f"{R}idle_right_native.png")]+[load(f"{R}jump_right_{i}_native.png") for i in (1,2,3)]
labels=["idle(锚)","jump_1(蹲)","jump_2(跃)","jump_3(落)"]
info=[]
for lab,im in zip(labels,raws):
    ab=im.getchannel("A").point(lambda v:255 if v>32 else 0).getbbox()
    H=ab[3]-ab[1]
    fw=face_w(im)
    info.append(dict(lab=lab,H=H,fw=fw))
    print(f"  {lab:12s} 原生生图: 人物高={H:5d}  脸宽={fw}")

idleH=info[0]['H']
print(f"\n  → idle 源高 {idleH} → v2 单系数 = 256/{idleH} = {256/idleH:.6f}")

print("\n=== 方案 A：v2 单系数归一（全批共用一个系数）===")
A=[info[0]['fw']*256/idleH]+[x['fw']*256/idleH for x in info[1:]]
for lab,v in zip(labels,A): print(f"  {lab:12s} 归一后脸宽 = {v:.1f}")
a=A[1:]  # 只比 jump 三帧（姿势族内）
print(f"  jump 三帧脸宽 {[round(x,1) for x in a]}  极差 {(max(a)-min(a))/(sum(a)/len(a))*100:.2f}%")

print("\n=== 方案 B：包围盒自适应归一（旧管线：每帧高度都顶到 256）===")
B=[x['fw']*256/x['H'] for x in info]
for lab,v,b in zip(labels,B,info): print(f"  {lab:12s} 归一后脸宽 = {v:.1f}   (系数 {256/b['H']:.4f})")
b=B[1:]
print(f"  jump 三帧脸宽 {[round(x,1) for x in b]}  极差 {(max(b)-min(b))/(sum(b)/len(b))*100:.2f}%")
print(f"\n  ★ 对比：方案 B 的 jump_1 脸宽 {B[1]:.1f} vs 方案 A 的 {A[1]:.1f} → 放大 {B[1]/A[1]-1:+.1%}")
print(f"  ★ 方案 B 里 jump_1 被放大了 {256/info[1]['H']/(256/idleH):.3f}× 于单系数")
