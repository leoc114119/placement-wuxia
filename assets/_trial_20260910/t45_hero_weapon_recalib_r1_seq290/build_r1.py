from pathlib import Path
from collections import deque
from PIL import Image
import hashlib,json,statistics
ROOT=Path(__file__).parent; W,H,CX,FEET=240,320,120,300; BENCH_HEAD=141
# source resolver: returns source path, and crop box if from 2x5 sheet
SRC={}
for a in ('walk','jump'):
 for i in range(1,4): SRC[('right',a,i)]=(Path(f'assets/_trial_20260910/t45_hero_right_walk_jump_selected_seq278/raw/{a}_right_{i}.png'),None)
for i in range(1,5): SRC[('right','atk',i)]=(Path(f'assets/_trial_20260910/t45_hero_atk_selected_seq279/raw/atk_right_{i}.png'),None)
for d in ('rightup','rightdown'):
 sheet=Path(f'assets/_trial_20260910/t45_hero_rightup_rightdown_regen_seq272/raw/{d}_from_rightward_selected_2x5.png')
 for a,cols in [('walk',[0,1,2]),('atk',[3,4]),('jump',[2,3,4])]:
  for i,col in enumerate(cols,1): SRC[(d,a,i)]=(sheet,('sheet',0,col) if not (a=='walk' and i==2) else ('user',))
  if a=='atk':
   for i,col in enumerate([0,1],3): SRC[(d,a,i)]=(sheet,('sheet',1,col))
# overwrite user walk middle
SRC[('rightup','walk',2)]=(Path('assets/_trial_20260910/t45_hero_rightup_walk_user_frame2_merge_seq285/raw/rightup_walk_2_user.png'),None)
SRC[('rightdown','walk',2)]=(Path('assets/_trial_20260910/t45_hero_rightdown_walk_user_frame2_merge_seq286/raw/rightdown_walk_2_user.png'),None)
SCALES={'right':0.8197674418604651,'rightup':0.7704918032786885,'rightdown':0.7157360406091371}

def cut(im):
 im=im.convert('RGBA'); w,h=im.size;px=im.load();seen=set();q=deque()
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
 for x,y in seen:px[x,y]=(0,0,0,0)
 return im

def getsrc(path,box):
 im=Image.open(path)
 if box and box[0]=='sheet':
  _,row,col=box;return im.crop((round(col*im.width/5),round(row*im.height/2),round((col+1)*im.width/5),round((row+1)*im.height/2)))
 return im

def rigid_head(im):
 c=cut(im);bb=c.getchannel('A').getbbox();x0,y0,x1,y1=bb;h=y1-y0;w=x1-x0;px=c.load();rows=[]
 for y in range(y0,min(y1,y0+round(h*.55))):
  if any(px[x,y][3]>32 and sum(px[x,y][:3])<300 and max(px[x,y][:3])-min(px[x,y][:3])<55 for x in range(x0+int(w*.35),x1)):rows.append(y)
 return max(rows)-min(rows)+1 if rows else None

def norm(im,scale):
 c=cut(im);bb=c.getchannel('A').getbbox();crop=c.crop(bb);nw=round(crop.width*scale);nh=round(crop.height*scale);crop=crop.resize((nw,nh),Image.Resampling.LANCZOS);a=crop.getchannel('A');vals=list(a.getdata());tot=sum(vals);cx=sum((i%nw)*v for i,v in enumerate(vals))/tot;out=Image.new('RGBA',(W,H));out.alpha_composite(crop,(round(CX-cx),FEET-nh));return out,{'sourceBBox':list(bb),'scale':scale,'scaledSize':[nw,nh],'sourceHeadSpan':rigid_head(im),'targetHeadSpan':round((rigid_head(im) or 0)*scale,2)}
def metrics(im):
 a=im.getchannel('A');bb=a.getbbox();vals=list(a.getdata());tot=sum(vals);cx=sum((i%im.width)*v for i,v in enumerate(vals))/tot;return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'bbox':list(bb),'visualHeight':bb[3]-bb[1],'visualWidth':bb[2]-bb[0],'feetYExclusive':bb[3],'alphaCentroidX':cx,'borderNonzero':sum(a.getpixel((x,y))>0 for x in range(im.width) for y in (0,im.height-1))+sum(a.getpixel((x,y))>0 for y in range(im.height) for x in (0,im.width-1))}
qa={'task':'T45','seq':'290','revision':'R1','phase':'fixed_scale_normalization','benchmark':{'path':'assets/characters/hero/battle45/battle_idle_right.png','rigidHeadSpan':BENCH_HEAD,'standingHeight':256},'batchScales':SCALES,'frames':{},'runtimeTouched':False}
for (d,a,i),(src,box) in SRC.items():
 key=f'{d}_{a}_{i}'; im=getsrc(src,box); raw=ROOT/'raw_sources'/f'{key}.png';im.save(raw);fr,proc=norm(im,SCALES[d]);out=ROOT/'normalized'/d/f'{a}_{d}_{i}.png';fr.save(out);m=metrics(fr);g={'size240x320':m['size']==[240,320],'rgba':m['mode']=='RGBA','alphaHas0And255':m['alphaExtrema']==[0,255],'widthLe236':m['visualWidth']<=236,'feetY300':m['feetYExclusive']==300,'centroidXWithin1':abs(m['alphaCentroidX']-120)<=1,'borderTransparent':m['borderNonzero']==0};qa['frames'][key]={'direction':d,'action':a,'index':i,'source':str(src),'sourceCrop':box,'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'rawCopy':str(raw),'output':str(out),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'processing':proc,'metrics':m,'checks':g,'allHardGatesPass':all(g.values())}
qa['allHardGatesPass']=all(v['allHardGatesPass'] for v in qa['frames'].values());
# contacts
for d in ('right','rightup','rightdown'):
 c=Image.new('RGBA',(1200,640),(52,52,52,255));order=[f'walk_{d}_{i}.png' for i in range(1,4)]+[f'atk_{d}_{i}.png' for i in range(1,5)]+[f'jump_{d}_{i}.png' for i in range(1,4)]
 for j,n in enumerate(order):c.alpha_composite(Image.open(ROOT/'normalized'/d/n),((j%5)*240,(j//5)*320))
 cp=ROOT/'contact'/f'{d}_r1_10frame.png';c.save(cp);qa.setdefault('contacts',{})[d]=str(cp)
(ROOT/'qa/r1_normalize.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'allHardGatesPass':qa['allHardGatesPass'],'frames':len(qa['frames']),'batchScales':SCALES},ensure_ascii=False))
