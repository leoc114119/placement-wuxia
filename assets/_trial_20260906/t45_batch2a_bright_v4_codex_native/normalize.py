from pathlib import Path
from PIL import Image
from collections import deque
import json,hashlib
JOB=Path('assets/_trial_20260906/t45_batch2a_bright_v4_codex_native'); RAW=JOB/'raw'; OUT=JOB/'normalized'; QA=JOB/'qa'; OUT.mkdir(exist_ok=True);QA.mkdir(exist_ok=True)
def cut_bg(im):
 im=im.convert('RGBA'); w,h=im.size; px=im.load(); seen=set(); q=deque()
 def bg(x,y):
  r,g,b,a=px[x,y]; return a>=245 and max(r,g,b)-min(r,g,b)<=12 and min(r,g,b)>=225
 for x in range(w):
  for y in (0,h-1):
   if bg(x,y):q.append((x,y));seen.add((x,y))
 for y in range(h):
  for x in (0,w-1):
   if bg(x,y):q.append((x,y));seen.add((x,y))
 while q:
  x,y=q.popleft();r,g,b,a=px[x,y];px[x,y]=(r,g,b,0)
  for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
   if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen and bg(nx,ny):seen.add((nx,ny));q.append((nx,ny))
 return im
def prune(im,min_pixels=100):
 im=im.convert('RGBA'); w,h=im.size;px=im.load();seen=set()
 for y in range(h):
  for x in range(w):
   if (x,y) in seen or px[x,y][3]<30: continue
   st=[(x,y)];seen.add((x,y));comp=[]
   while st:
    cx,cy=st.pop();comp.append((cx,cy))
    for nx,ny in ((cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)):
     if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen and px[nx,ny][3]>=30: seen.add((nx,ny));st.append((nx,ny))
   if len(comp)<min_pixels:
    for cx,cy in comp:r,g,b,a=px[cx,cy];px[cx,cy]=(r,g,b,0)
 return im
src=RAW/'shanzei_b_right_v4.png'; im=prune(cut_bg(Image.open(src))); a=im.getchannel('A'); bb=a.point(lambda p:255 if p>=30 else 0).getbbox(); crop=im.crop(bb); scale=256/crop.height; nw=round(crop.width*scale); crop=crop.resize((nw,256),Image.Resampling.LANCZOS); target_w=round(0.383*256); crop=crop.resize((target_w,256),Image.Resampling.LANCZOS); nw=target_w; frame=Image.new('RGBA',(240,320),(0,0,0,0)); frame.alpha_composite(crop,(round(120-nw/2),44)); out=OUT/'shanzei_b_right.png';frame.save(out,'PNG',optimize=False);ob=frame.getchannel('A').point(lambda p:255 if p>=30 else 0).getbbox();ratio=(ob[2]-ob[0])/(ob[3]-ob[1]); rec={'key':'shanzei_b_right','source':str(src.relative_to(Path('.'))),'output':str(out.relative_to(Path('.'))),'size':list(frame.size),'bbox':list(ob),'visualHeight':ob[3]-ob[1],'feetY':ob[3],'centroidX':(ob[0]+ob[2])/2,'widthHeightRatio':ratio,'ratioPass':0.38<=ratio<=0.55,'hands':'both empty gripping fists','weaponVisible':False,'nativeAttempt':3,'change':'reduce b right head/neck to accepted a-right proportion','sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest()};(QA/'shanzei_b_right.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n');(QA/'summary.json').write_text(json.dumps({'count':1,'mechanicalPass':int(rec['ratioPass'] and rec['size']==[240,320] and rec['visualHeight']==256 and rec['feetY']==300 and abs(rec['centroidX']-120)<=1),'files':[rec]},ensure_ascii=False,indent=2)+'\n');print(rec)
