from PIL import Image

def load(p): return Image.open(p).convert("RGBA")

def runs_at(im, y):
    px=im.load(); w=im.width; out=[]; st=None
    for x in range(w):
        on = px[x,y][3]>32
        if on and st is None: st=x
        elif not on and st is not None:
            out.append((st,x-1,x-st)); st=None
    if st is not None: out.append((st,w-1,w-st))
    return [r for r in out if r[2]>=6]

N="assets/_trial_20260910/t45_v2_right_batch_seq328/normalized/"
print("=== v2 walk 三帧：踝部高度(x)的轮廓切片（找双腿分离段）===")
for i in (1,2,3):
    im=load(N+f"walk_right_{i}.png")
    ab=im.getchannel("A").point(lambda v:255 if v>32 else 0).getbbox()
    base=ab[3]
    print(f"\n  walk_right_{i}  (底部 y={base})")
    for dy in (8, 16, 26, 40, 60):
        y=base-dy
        rs=runs_at(im,y)
        desc=" | ".join(f"x[{a},{b}] w{c}" for a,b,c in rs)
        tag=""
        if len(rs)==2: tag="  ← 两段=双腿分开"
        print(f"    y={y:3d} (底上{dy:2d}px): {desc}{tag}")
