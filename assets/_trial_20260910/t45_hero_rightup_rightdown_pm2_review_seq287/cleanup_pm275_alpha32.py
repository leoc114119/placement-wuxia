from pathlib import Path
from PIL import Image
from collections import deque
import hashlib,json
ROOT=Path(__file__).parent
TARGETS={
 'rightdown/atk_rightdown_3.png': [[167,221,168,222]],
 'rightup/jump_rightup_1.png': [[222,166,224,167]],
 'rightup/jump_rightup_3.png': [[208,130,209,132]],
}
def comps32(im):
 a=im.getchannel('A');px=a.load();w,h=im.size;seen=set();cs=[]
 for y in range(h):
  for x in range(w):
   if px[x,y]<=32 or (x,y) in seen:continue
   st=[(x,y)];seen.add((x,y));pts=[]
   while st:
    x0,y0=st.pop();pts.append((x0,y0))
    for nx,ny in ((x0-1,y0),(x0+1,y0),(x0,y0-1),(x0,y0+1)):
     if 0<=nx<w and 0<=ny<h and px[nx,ny]>32 and (nx,ny) not in seen:seen.add((nx,ny));st.append((nx,ny))
   xs=[q[0] for q in pts];ys=[q[1] for q in pts];cs.append({'pixels':len(pts),'bbox':[min(xs),min(ys),max(xs)+1,max(ys)+1]})
 return sorted(cs,key=lambda x:x['pixels'],reverse=True)
results=[]
for rel,bbs in TARGETS.items():
 p=ROOT/'normalized'/rel; before=hashlib.sha256(p.read_bytes()).hexdigest();im=Image.open(p).convert('RGBA');a=im.getchannel('A');px=a.load();removed=0;rois=[]
 for bb in bbs:
  x0,y0,x1,y1=bb; ex=[max(0,x0-2),max(0,y0-2),min(im.width,x1+2),min(im.height,y1+2)];rois.append(ex)
  for y in range(ex[1],ex[3]):
   for x in range(ex[0],ex[2]):
    if px[x,y]>0: px[x,y]=0;removed+=1
 im.putalpha(a);im.save(p); after=hashlib.sha256(p.read_bytes()).hexdigest(); cs=comps32(im);results.append({'path':str(p),'beforeSha256':before,'targetBboxes':bbs,'clearedRois':rois,'removedAlphaPixels':removed,'afterSha256':after,'componentsAlphaGt32':cs,'singleComponentAlphaGt32':len(cs)==1})
# refresh contacts
for d in ('rightup','rightdown'):
 c=Image.new('RGBA',(1200,640),(52,52,52,255));order=[f'walk_{d}_1.png',f'walk_{d}_2.png',f'walk_{d}_3.png',f'atk_{d}_1.png',f'atk_{d}_2.png',f'atk_{d}_3.png',f'atk_{d}_4.png',f'jump_{d}_1.png',f'jump_{d}_2.png',f'jump_{d}_3.png']
 for i,n in enumerate(order): c.alpha_composite(Image.open(ROOT/'normalized'/d/n).convert('RGBA'),((i%5)*240,(i//5)*320))
 c.save(ROOT/'contact'/f'{d}_10frame_240x320.png')
qa={'task':'T45','seq':'287','check':'PM2 seq277 alpha>32 4-connectivity cleanup','method':'clear only 2px-expanded ROIs around PM2-located secondary components; preserve RGB/main body','targets':results,'allTargetsSingleComponent':all(r['singleComponentAlphaGt32'] for r in results),'runtimeTouched':False}
(ROOT/'qa/pm275_cleanup_alpha32_verification.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n');print(json.dumps(qa,ensure_ascii=False,indent=2))
