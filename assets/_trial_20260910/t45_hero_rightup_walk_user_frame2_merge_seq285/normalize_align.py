from pathlib import Path
from collections import deque
from PIL import Image
import json,hashlib
ROOT=Path(__file__).parent; W,H,TARGET_H,FEET_Y,CX=240,320,256,300,120

def cut_checker(im):
    im=im.convert('RGBA'); w,h=im.size; pix=im.load(); seen=set(); q=deque()
    def bg(x,y):
        r,g,b,a=pix[x,y]; return a>0 and max(r,g,b)-min(r,g,b)<=28 and min(r,g,b)>=185
    for x in range(w):
        for y in (0,h-1):
            if bg(x,y) and (x,y) not in seen: seen.add((x,y)); q.append((x,y))
    for y in range(h):
        for x in (0,w-1):
            if bg(x,y) and (x,y) not in seen: seen.add((x,y)); q.append((x,y))
    while q:
        x,y=q.popleft()
        for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen and bg(nx,ny): seen.add((nx,ny));q.append((nx,ny))
    for x,y in seen: pix[x,y]=(0,0,0,0)
    # remove light fringe immediately adjacent to transparent bg
    for y in range(h):
        for x in range(w):
            r,g,b,a=pix[x,y]
            if a==0: continue
            if any(0<=nx<w and 0<=ny<h and pix[nx,ny][3]==0 for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))) and min(r,g,b)>=190 and max(r,g,b)-min(r,g,b)<=35:
                pix[x,y]=(0,0,0,0)
    return im,len(seen)

def normalize(im):
    cut,removed=cut_checker(im); a=cut.getchannel('A'); bb=a.getbbox()
    if bb is None: raise ValueError('empty after checker cut')
    crop=cut.crop(bb); scale=TARGET_H/crop.height; nw=round(crop.width*scale); crop=crop.resize((nw,TARGET_H),Image.Resampling.LANCZOS)
    ap=crop.getchannel('A'); vals=list(ap.getdata()); total=sum(vals); cx_local=sum((i%crop.width)*v for i,v in enumerate(vals))/total
    out=Image.new('RGBA',(W,H),(0,0,0,0)); px=round(CX-cx_local); py=FEET_Y-TARGET_H; out.alpha_composite(crop,(px,py))
    return out,{'removedBgPixels':removed,'cutBBox':list(bb),'scale':scale,'scaledSize':[nw,TARGET_H],'alphaCentroidXLocal':cx_local,'paste':[px,py]}

def metrics(im):
 a=im.getchannel('A'); bb=a.getbbox(); vals=list(a.getdata()); total=sum(vals); cx=sum((i%im.width)*v for i,v in enumerate(vals))/total; cy=sum((i//im.width)*v for i,v in enumerate(vals))/total
 border=sum(a.getpixel((x,y))>0 for x in range(im.width) for y in (0,im.height-1))+sum(a.getpixel((x,y))>0 for y in range(im.height) for x in (0,im.width-1))
 return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'bbox':list(bb) if bb else None,'visualHeight':bb[3]-bb[1] if bb else 0,'feetYExclusive':bb[3] if bb else None,'alpha32CentroidX':cx,'alpha32CentroidY':cy,'borderNonzero':border}
inputs=[ROOT/'raw/rightup_walk_1_merged.png',ROOT/'raw/rightup_walk_2_user.png',ROOT/'raw/rightup_walk_3_merged.png']
outdir=ROOT/'normalized'; outdir.mkdir(exist_ok=True)
qa={'task':'T45','seq':'285','processing':'deterministic checkerboard edge-connected cut + 256px height normalization + feet baseline y=300 + alpha centroid x=120','frames':{}}
contact=Image.new('RGBA',(W*3,H),(52,52,52,255))
for i,p in enumerate(inputs,1):
 fr,proc=normalize(Image.open(p)); out=outdir/f'rightup_walk_{i}.png'; fr.save(out); contact.alpha_composite(fr,((i-1)*W,0)); m=metrics(fr); gates={'size240x320':m['size']==[240,320],'rgba':m['mode']=='RGBA','alphaHas0And255':m['alphaExtrema']==[0,255],'visualHeight256':m['visualHeight']==256,'feetY300':m['feetYExclusive']==300,'centroidXWithin1':abs(m['alpha32CentroidX']-120)<=1,'borderTransparent':m['borderNonzero']==0}
 qa['frames'][f'rightup_walk_{i}']={'source':str(p),'sourceSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'output':str(out),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'processing':proc,'metrics':m,'checks':gates,'allHardGatesPass':all(gates.values())}
contact.save(ROOT/'contact/rightup_walk_aligned_240x320.png'); qa['contact']=str(ROOT/'contact/rightup_walk_aligned_240x320.png'); qa['allHardGatesPass']=all(v['allHardGatesPass'] for v in qa['frames'].values()); (ROOT/'qa/normalized_aligned.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n'); print(json.dumps(qa,ensure_ascii=False,indent=2))
