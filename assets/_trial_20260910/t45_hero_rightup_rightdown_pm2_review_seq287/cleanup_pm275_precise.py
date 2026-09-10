from pathlib import Path
from collections import deque
from PIL import Image
import hashlib,json,subprocess
ROOT=Path(__file__).parent; COMMIT='1164fd2ce375cf80c375075b1b67249187fd2ae0'
TARGETS=['normalized/rightdown/atk_rightdown_3.png','normalized/rightup/jump_rightup_1.png','normalized/rightup/jump_rightup_3.png']
def baseline(rel):
 full='assets/_trial_20260910/t45_hero_rightup_rightdown_pm2_review_seq287/'+rel
 data=subprocess.check_output(['git','show',f'{COMMIT}:{full}']); p=ROOT/rel; p.write_bytes(data); return data
def comps(im,thr=32):
 a=im.getchannel('A');px=a.load();w,h=im.size;seen=set();out=[]
 for y in range(h):
  for x in range(w):
   if px[x,y]<=thr or (x,y) in seen:continue
   st=[(x,y)];seen.add((x,y));pts=[]
   while st:
    x0,y0=st.pop();pts.append((x0,y0))
    for nx,ny in ((x0-1,y0),(x0+1,y0),(x0,y0-1),(x0,y0+1)):
     if 0<=nx<w and 0<=ny<h and px[nx,ny]>thr and (nx,ny) not in seen:seen.add((nx,ny));st.append((nx,ny))
   out.append(pts)
 return sorted(out,key=len,reverse=True)
results=[]
for rel in TARGETS:
 before=baseline(rel); p=ROOT/rel; im=Image.open(p).convert('RGBA'); a=im.getchannel('A');px=a.load(); cs=comps(im,32); main=set(cs[0]); second=[pt for c in cs[1:] for pt in c]
 # clear only the exact alpha>32 secondary component pixels; never touch bbox neighbors or RGB
 for x,y in second: px[x,y]=0
 im.putalpha(a); im.save(p)
 after=p.read_bytes(); diff=[]; rgb_changed=0; body_changed=0
 old=Image.open(__import__('io').BytesIO(before)).convert('RGBA'); new=Image.open(p).convert('RGBA')
 for y in range(im.height):
  for x in range(im.width):
   op=old.getpixel((x,y));np=new.getpixel((x,y))
   if op!=np:
    diff.append({'xy':[x,y],'before':list(op),'after':list(np)})
    if op[:3]!=np[:3]:rgb_changed+=1
    if (x,y) in main:body_changed+=1
 results.append({'path':str(p),'baselineCommit':COMMIT,'beforeSha256':hashlib.sha256(before).hexdigest(),'afterSha256':hashlib.sha256(after).hexdigest(),'componentsBeforeAlphaGt32':[{'pixels':len(c),'bbox':[min(x for x,y in c),min(y for x,y in c),max(x for x,y in c)+1,max(y for x,y in c)+1]} for c in cs],'removedSecondaryPixels':len(second),'diffPixels':len(diff),'rgbChangedPixels':rgb_changed,'mainBodyChangedPixels':body_changed,'diff':diff,'componentsAfterAlphaGt32':[len(c) for c in comps(new,32)]})
# contacts refresh
for d in ('rightup','rightdown'):
 c=Image.new('RGBA',(1200,640),(52,52,52,255)); order=[f'walk_{d}_1.png',f'walk_{d}_2.png',f'walk_{d}_3.png',f'atk_{d}_1.png',f'atk_{d}_2.png',f'atk_{d}_3.png',f'atk_{d}_4.png',f'jump_{d}_1.png',f'jump_{d}_2.png',f'jump_{d}_3.png']
 for i,n in enumerate(order):c.alpha_composite(Image.open(ROOT/'normalized'/d/n).convert('RGBA'),((i%5)*240,(i//5)*320))
 c.save(ROOT/'contact'/f'{d}_10frame_240x320.png')
qa={'task':'T45','seq':'287','check':'PM2 precise alpha>32 4-connectivity cleanup','method':'restore 1164fd2 baseline; clear only exact pixels in secondary alpha>32 4-connected components; no bbox expansion, no renormalization','targets':results,'allTargetsSingleAlphaGt32Component':all(len(r['componentsAfterAlphaGt32'])==1 for r in results),'allRgbUnchanged':all(r['rgbChangedPixels']==0 for r in results),'allMainBodyUnchanged':all(r['mainBodyChangedPixels']==0 for r in results),'runtimeTouched':False}
(ROOT/'qa/pm275_precise_cleanup_verification.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n');print(json.dumps(qa,ensure_ascii=False,indent=2))
