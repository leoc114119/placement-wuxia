from pathlib import Path
from collections import deque
from PIL import Image
import hashlib,json
ROOT=Path(__file__).parent; W,H,TARGET_H,FEET_Y,CX=240,320,256,300,120

def cut(im):
 im=im.convert('RGBA'); w,h=im.size; px=im.load(); seen=set();q=deque()
 def bg(x,y):
  r,g,b,a=px[x,y]; return a>0 and max(r,g,b)-min(r,g,b)<=28 and min(r,g,b)>=185
 for x in range(w):
  for y in (0,h-1):
   if bg(x,y): seen.add((x,y));q.append((x,y))
 for y in range(h):
  for x in (0,w-1):
   if bg(x,y): seen.add((x,y));q.append((x,y))
 while q:
  x,y=q.popleft()
  for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
   if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen and bg(nx,ny):seen.add((nx,ny));q.append((nx,ny))
 for x,y in seen:px[x,y]=(0,0,0,0)
 return im,len(seen)
def norm(im):
 c,n=cut(im);bb=c.getchannel('A').getbbox(); crop=c.crop(bb); s=TARGET_H/crop.height; nw=round(crop.width*s); crop=crop.resize((nw,TARGET_H),Image.Resampling.LANCZOS); a=crop.getchannel('A'); vals=list(a.getdata());tot=sum(vals); cx=sum((i%crop.width)*v for i,v in enumerate(vals))/tot; out=Image.new('RGBA',(W,H)); out.alpha_composite(crop,(round(CX-cx),FEET_Y-TARGET_H)); return out,n

def metrics(im):
 a=im.getchannel('A');bb=a.getbbox();vals=list(a.getdata());tot=sum(vals);cx=sum((i%im.width)*v for i,v in enumerate(vals))/tot; return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'bbox':list(bb),'visualHeight':bb[3]-bb[1],'feetYExclusive':bb[3],'alphaCentroidX':cx,'borderNonzero':sum(a.getpixel((x,y))>0 for x in range(im.width) for y in (0,im.height-1))+sum(a.getpixel((x,y))>0 for y in range(im.height) for x in (0,im.width-1))}
inputs=[ROOT/'raw/rightdown_walk_1.png',ROOT/'raw/rightdown_walk_2_user.png',ROOT/'raw/rightdown_walk_3.png']; outdir=ROOT/'normalized'; contact=Image.new('RGBA',(W*3,H),(52,52,52,255));qa={'task':'T45','seq':'286','direction':'rightdown','processing':'checkerboard edge cut + 256px height + feet y=300 + alpha centroid x=120','frames':{}}
for i,p in enumerate(inputs,1):
 fr,n=norm(Image.open(p));o=outdir/f'rightdown_walk_{i}.png';fr.save(o);contact.alpha_composite(fr,((i-1)*W,0));m=metrics(fr);g={'size240x320':m['size']==[240,320],'rgba':m['mode']=='RGBA','alphaHas0And255':m['alphaExtrema']==[0,255],'height256':m['visualHeight']==256,'feetY300':m['feetYExclusive']==300,'centroidXWithin1':abs(m['alphaCentroidX']-120)<=1,'borderTransparent':m['borderNonzero']==0};qa['frames'][f'rightdown_walk_{i}']={'source':str(p),'sourceSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'output':str(o),'outputSha256':hashlib.sha256(o.read_bytes()).hexdigest(),'metrics':m,'checks':g,'allHardGatesPass':all(g.values())}
contact.save(ROOT/'contact/rightdown_walk_aligned_240x320.png');qa['contact']=str(ROOT/'contact/rightdown_walk_aligned_240x320.png');qa['allHardGatesPass']=all(v['allHardGatesPass'] for v in qa['frames'].values());(ROOT/'qa/normalized_aligned.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n');print(json.dumps(qa,ensure_ascii=False))
