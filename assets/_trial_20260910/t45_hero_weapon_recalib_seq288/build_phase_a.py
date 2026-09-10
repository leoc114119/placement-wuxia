from pathlib import Path
from collections import deque
from PIL import Image
import hashlib,json
ROOT=Path(__file__).parent; W,H,TARGET,CX,FEET=240,320,256,120,300
SOURCES={}
for action in ('walk','jump'):
 for i in range(1,4): SOURCES[(action,i)]=Path(f'assets/_trial_20260910/t45_hero_right_walk_jump_selected_seq278/raw/{action}_right_{i}.png')
for i in range(1,5): SOURCES[('atk',i)]=Path(f'assets/_trial_20260910/t45_hero_atk_selected_seq279/raw/atk_right_{i}.png')
def cut(im):
 im=im.convert('RGBA');w,h=im.size;px=im.load();seen=set();q=deque()
 def bg(x,y):
  r,g,b,a=px[x,y];return a>0 and max(r,g,b)-min(r,g,b)<=28 and min(r,g,b)>=185
 for x in range(w):
  for y in (0,h-1):
   if bg(x,y):seen.add((x,y));q.append((x,y))
 for y in range(h):
  for x in (0,w-1):
   if bg(x,y):seen.add((x,y));q.append((x,y))
 while q:
  x,y=q.popleft()
  for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
   if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen and bg(nx,ny):seen.add((nx,ny));q.append((nx,ny))
 for x,y in seen: px[x,y]=(0,0,0,0)
 # remove only light fringe at transparent boundary
 for y in range(h):
  for x in range(w):
   r,g,b,a=px[x,y]
   if a and min(r,g,b)>=190 and max(r,g,b)-min(r,g,b)<=35 and any(0<=nx<w and 0<=ny<h and px[nx,ny][3]==0 for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))):px[x,y]=(0,0,0,0)
 return im
def norm(im):
 c=cut(im);bb=c.getchannel('A').getbbox();crop=c.crop(bb);s=min(TARGET/crop.height,236/crop.width);nw=max(1,round(crop.width*s));nh=max(1,round(crop.height*s));crop=crop.resize((nw,nh),Image.Resampling.LANCZOS);a=crop.getchannel('A');vals=list(a.getdata());tot=sum(vals);cx=sum((i%nw)*v for i,v in enumerate(vals))/tot;out=Image.new('RGBA',(W,H));out.alpha_composite(crop,(round(CX-cx),FEET-nh));op=out.load();
 for x in range(W):
  op[x,0]=(0,0,0,0);op[x,H-1]=(0,0,0,0)
 for y in range(H):
  op[0,y]=(0,0,0,0);op[W-1,y]=(0,0,0,0)
 return out,{'cutBBox':list(bb),'scale':s,'scaledSize':[nw,nh],'alphaCentroidXLocal':cx}

def cleanup_secondary(im):
 a=im.getchannel('A');px=a.load();w,h=im.size;seen=set();comps=[]
 for y in range(h):
  for x in range(w):
   if px[x,y]<=32 or (x,y) in seen: continue
   st=[(x,y)];seen.add((x,y));pts=[]
   while st:
    x0,y0=st.pop();pts.append((x0,y0))
    for nx,ny in ((x0-1,y0),(x0+1,y0),(x0,y0-1),(x0,y0+1)):
     if 0<=nx<w and 0<=ny<h and px[nx,ny]>32 and (nx,ny) not in seen: seen.add((nx,ny));st.append((nx,ny))
   comps.append(pts)
 comps.sort(key=len,reverse=True); removed=[]
 for pts in comps[1:]:
  for x,y in pts: px[x,y]=0;removed.append([x,y])
 im.putalpha(a); return im,{'componentsBefore':[len(c) for c in comps],'removedAlphaGt32Pixels':removed,'componentsAfter':cleanup_components(im)}
def cleanup_components(im):
 a=im.getchannel('A');px=a.load();w,h=im.size;seen=set();out=[]
 for y in range(h):
  for x in range(w):
   if px[x,y]<=32 or (x,y) in seen:continue
   st=[(x,y)];seen.add((x,y));n=0
   while st:
    x0,y0=st.pop();n+=1
    for nx,ny in ((x0-1,y0),(x0+1,y0),(x0,y0-1),(x0,y0+1)):
     if 0<=nx<w and 0<=ny<h and px[nx,ny]>32 and (nx,ny) not in seen:seen.add((nx,ny));st.append((nx,ny))
   out.append(n)
 return sorted(out,reverse=True)

def comps32(im):
 a=im.getchannel('A');px=a.load();w,h=im.size;seen=set();cs=[]
 for y in range(h):
  for x in range(w):
   if px[x,y]<=32 or (x,y) in seen:continue
   st=[(x,y)];seen.add((x,y));n=0;xs=[];ys=[]
   while st:
    x0,y0=st.pop();n+=1;xs.append(x0);ys.append(y0)
    for nx,ny in ((x0-1,y0),(x0+1,y0),(x0,y0-1),(x0,y0+1)):
     if 0<=nx<w and 0<=ny<h and px[nx,ny]>32 and (nx,ny) not in seen:seen.add((nx,ny));st.append((nx,ny))
   cs.append({'pixels':n,'bbox':[min(xs),min(ys),max(xs)+1,max(ys)+1]})
 return sorted(cs,key=lambda z:z['pixels'],reverse=True)
def metrics(im):
 a=im.getchannel('A');bb=a.getbbox();vals=list(a.getdata());tot=sum(vals);cx=sum((i%im.width)*v for i,v in enumerate(vals))/tot
 return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'bbox':list(bb),'visualHeight':bb[3]-bb[1],'feetYExclusive':bb[3],'alphaCentroidX':cx,'borderNonzero':sum(a.getpixel((x,y))>0 for x in range(im.width) for y in (0,im.height-1))+sum(a.getpixel((x,y))>0 for y in range(im.height) for x in (0,im.width-1)),'componentsAlphaGt32':comps32(im)}
qa={'task':'T45','seq':'288','phase':'A_rightNormalize','frames':{},'runtimeTouched':False}
for (act,i),src_rel in SOURCES.items():
 src=Path(src_rel); raw=ROOT/'raw_sources'/f'{act}_right_{i}.png'; raw.write_bytes(src.read_bytes()); fr,proc=norm(Image.open(src)); fr,cleanproc=cleanup_secondary(fr); proc['secondaryCleanup']=cleanproc; out=ROOT/'normalized/right'/f'{act}_right_{i}.png';fr.save(out);m=metrics(fr);height_ok=(230<=m['visualHeight']<=282) if act=='jump' else m['visualHeight']==256;g={'size240x320':m['size']==[240,320],'rgba':m['mode']=='RGBA','alphaHas0And255':m['alphaExtrema']==[0,255],'heightBand':height_ok,'feetY300':m['feetYExclusive']==300,'centroidXWithin1':abs(m['alphaCentroidX']-120)<=1,'borderTransparent':m['borderNonzero']==0,'singleAlphaGt32Component':len(m['componentsAlphaGt32'])==1};qa['frames'][f'{act}_right_{i}']={'source':str(src),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'rawCopy':str(raw),'output':str(out),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'processing':proc,'metrics':m,'checks':g,'allHardGatesPass':all(g.values())}
qa['allHardGatesPass']=all(v['allHardGatesPass'] for v in qa['frames'].values());(ROOT/'qa/phase_a_right_normalize.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'allHardGatesPass':qa['allHardGatesPass'],'frames':len(qa['frames'])},ensure_ascii=False))
