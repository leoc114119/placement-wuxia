from pathlib import Path
from PIL import Image,ImageDraw
from collections import deque
import hashlib,json
ROOT=Path('assets/_trial_20260906/t45_batch2a_a_rightdown_singleframe_v1_codex_native');RAW=ROOT/'raw'/'shanzei_a_rightdown_attempt2.png';OUT=ROOT/'normalized';QA=ROOT/'qa';OUT.mkdir(exist_ok=True);QA.mkdir(exist_ok=True)
im=Image.open(RAW).convert('RGBA');pix=im.load();w,h=im.size
def bg(x,y):
 r,g,b,a=pix[x,y];return min(r,g,b)>=225 and max(r,g,b)-min(r,g,b)<=20
seen=bytearray(w*h);q=deque()
for x in range(w):
 for y in (0,h-1):
  if bg(x,y) and not seen[y*w+x]:seen[y*w+x]=1;q.append((x,y))
for y in range(h):
 for x in (0,w-1):
  if bg(x,y) and not seen[y*w+x]:seen[y*w+x]=1;q.append((x,y))
while q:
 x,y=q.popleft()
 for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
  if 0<=nx<w and 0<=ny<h and not seen[ny*w+nx] and bg(nx,ny):seen[ny*w+nx]=1;q.append((nx,ny))
removed=sum(seen)
for y in range(h):
 for x in range(w):
  if seen[y*w+x]:r,g,b,a=pix[x,y];pix[x,y]=(r,g,b,0)
# The source contains a detached checkerboard remnant. Crop to the largest 4-connected alpha component only.
a=im.getchannel('A');ap=a.load();marked=bytearray(w*h);components=[]
for y in range(h):
 for x in range(w):
  i=y*w+x
  if ap[x,y]>=30 and not marked[i]:
   marked[i]=1;qq=deque([(x,y)]);n=0;lo_x=hi_x=x;lo_y=hi_y=y
   while qq:
    xx,yy=qq.popleft();n+=1;lo_x=min(lo_x,xx);hi_x=max(hi_x,xx);lo_y=min(lo_y,yy);hi_y=max(hi_y,yy)
    for nx,ny in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)):
     j=ny*w+nx
     if 0<=nx<w and 0<=ny<h and ap[nx,ny]>=30 and not marked[j]:marked[j]=1;qq.append((nx,ny))
   components.append((n,(lo_x,lo_y,hi_x+1,hi_y+1)))
main_size,box=max(components,key=lambda x:x[0]);crop=im.crop(box);sprite=crop.resize((round(crop.width*256/crop.height),256),Image.Resampling.LANCZOS);frame=Image.new('RGBA',(240,320),(0,0,0,0));frame.alpha_composite(sprite,(round(120-sprite.width/2),44));out=OUT/'shanzei_a_rightdown.png';frame.save(out,'PNG',optimize=False);a=frame.getchannel('A');b=a.point(lambda p:255 if p>=30 else 0).getbbox()
rec={'key':'shanzei_a_rightdown','source':str(RAW),'output':str(out),'selectedAttempt':2,'size':list(frame.size),'sourceAlphaBBox':list(box),'largestForegroundComponentPixels':main_size,'bbox':list(b),'visualHeight':b[3]-b[1],'feetY':b[3],'centroidX':(b[0]+b[2])/2,'widthHeightRatio':(b[2]-b[0])/(b[3]-b[1]),'alphaExtrema':list(a.getextrema()),'removedExteriorCheckerboardPixels':removed,'sourceSha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'processing':'deterministic exterior-only light-neutral checkerboard removal; detached remnant excluded by largest foreground component crop; aspect-preserving 240x320 normalization; no semantic redraw','mechanicalPass':bool(frame.size==(240,320) and b[3]-b[1]==256 and b[3]==300 and abs((b[0]+b[2])/2-120)<=1 and a.getextrema()[0]==0)}
(QA/'shanzei_a_rightdown.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n');(QA/'summary.json').write_text(json.dumps({'count':1,'mechanicalPass':rec['mechanicalPass'],'files':[rec]},ensure_ascii=False,indent=2)+'\n');print(json.dumps(rec,ensure_ascii=False,indent=2))
