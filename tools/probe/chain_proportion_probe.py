from PIL import Image, ImageDraw
import math

def load(p): return Image.open(p).convert("RGBA")

def char_mask(im, strip_alpha=True):
    """角色掩膜：排除(无彩且亮)=棋盘格/白底；保留有彩像素与暗像素(头发/描边/眼)"""
    px=im.load(); w,h=im.size
    m=Image.new("L",(w,h),0); mp=m.load()
    for y in range(h):
        for x in range(w):
            R,G,B,A=px[x,y]
            if strip_alpha and A<=32: continue
            mx,mn=max(R,G,B),min(R,G,B)
            chroma=mx-mn
            if chroma>=30: mp[x,y]=255          # 有彩色(绿袍/肤色/青玉)
            elif mx<150: mp[x,y]=255            # 暗像素(黑发/描边)
    return m

def face_mask(im):
    px=im.load(); w,h=im.size
    m=Image.new("L",(w,h),0); mp=m.load()
    for y in range(h):
        for x in range(w):
            R,G,B,A=px[x,y]
            if A<=32: continue
            if R>195 and G>130 and B>90 and R>G>B and (R-B)>45: mp[x,y]=255
    return m

def comps(mask,min_size=200):
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

def measure(path, label):
    im=load(path); w,h=im.size
    cm=comps(char_mask(im), min_size=500)
    if not cm: print(f"{label:34s} 角色掩膜空"); return None
    body=max(cm,key=len)
    xs=[p[0] for p in body]; ys=[p[1] for p in body]
    bx0,bx1,by0,by1=min(xs),max(xs),min(ys),max(ys)
    BH=by1-by0; BW=bx1-bx0
    fm=comps(face_mask(im), min_size=150)
    fw=fh=None
    if fm:
        # 脸=上半身内最靠上的肤色块
        cands=[c for c in fm if sum(q[1] for q in c)/len(c) < by0+BH*0.55]
        if cands:
            f=max(cands,key=len)
            fx=[q[0] for q in f]; fy=[q[1] for q in f]
            fw=max(fx)-min(fx)+1; fh=max(fy)-min(fy)+1
    r = (fw/BH*100) if (fw and BH) else None
    print(f"{label:34s} canvas={w}x{h} 角色bbox={BW}x{BH} 脸={fw}x{fh} 脸宽/身高={r:.2f}%" if r else
          f"{label:34s} canvas={w}x{h} 角色bbox={BW}x{BH} 脸=未检出")
    return dict(BH=BH, BW=BW, fw=fw, fh=fh, ratio=r)

print("=== 归一化前的相对量（脸宽 ÷ 角色高），可跨分辨率比较 ===")
R={}
R['base_idle']      = measure("assets/_trial_20260910/t45_chain_edit_test/chain/idle_right.png","① 输入 idle（透明·干净）")
R['chain_a1']       = measure("assets/_trial_20260910/t45_chain_edit_test/raw/walk_right_1_chain.png","② 链式 walk_1（att1·棋盘格）")
R['chain_a2']       = measure("assets/_trial_20260910/t45_chain_edit_test/raw/walk_right_1_chain_attempt2.png","③ 链式 walk_1（att2·棋盘格）")
R['para_w1']        = measure("assets/_trial_20260910/t45_v2_right_batch_seq328/normalized/walk_right_1.png","④ 并行版 walk_1（同批次已过门）")

vals=[(k,v['ratio']) for k,v in R.items() if v and v['ratio']]
print()
if vals:
    rs=[v for _,v in vals]
    print(f"脸宽/身高: " + "  ".join(f"{k}={v:.2f}%" for k,v in vals))
    print(f"极差 {max(rs)-min(rs):.2f} 个百分点（相对 {min(rs):.2f}% 为 {(max(rs)-min(rs))/min(rs)*100:.1f}%）")
