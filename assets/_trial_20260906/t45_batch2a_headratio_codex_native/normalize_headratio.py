from pathlib import Path
from PIL import Image
from collections import deque
import json, hashlib
JOB=Path('assets/_trial_20260906/t45_batch2a_headratio_codex_native'); RAW=JOB/'raw'; OUT=JOB/'normalized'; QA=JOB/'qa'; OUT.mkdir(exist_ok=True); QA.mkdir(exist_ok=True)
chosen={
'shanzei_a_right':'shanzei_a_right_headratio_attempt1.png',
'shanzei_b_right':'shanzei_b_right_headratio_attempt1.png',
'shanzei_b_rightup':'shanzei_b_rightup_headratio_attempt1.png',
'shanzei_b_rightdown':'shanzei_b_rightdown_headratio_attempt1.png'}
def cut_white(im):
 im=im.convert('RGBA'); w,h=im.size; px=im.load(); seen=set(); q=deque()
 def bg(x,y):
  r,g,b,a=px[x,y]; return a>=245 and min(r,g,b)>=240 and max(r,g,b)-min(r,g,b)<=12
 for x in range(w):
  for y in (0,h-1):
   if bg(x,y): q.append((x,y)); seen.add((x,y))
 for y in range(h):
  for x in (0,w-1):
   if bg(x,y): q.append((x,y)); seen.add((x,y))
 while q:
  x,y=q.popleft(); r,g,b,a=px[x,y]; px[x,y]=(r,g,b,0)
  for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
   if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen and bg(nx,ny): seen.add((nx,ny)); q.append((nx,ny))
 return im
recs=[]
for key,fn in chosen.items():
 src=RAW/fn; im=cut_white(Image.open(src)); a=im.getchannel('A'); bb=a.point(lambda p:255 if p>=30 else 0).getbbox(); crop=im.crop(bb); scale=256/crop.height; nw=round(crop.width*scale); crop=crop.resize((nw,256),Image.Resampling.LANCZOS); frame=Image.new('RGBA',(240,320),(0,0,0,0)); frame.alpha_composite(crop,(round(120-nw/2),44)); out=OUT/f'{key}.png'; frame.save(out,'PNG',optimize=False); ob=frame.getchannel('A').point(lambda p:255 if p>=30 else 0).getbbox(); ratio=(ob[2]-ob[0])/(ob[3]-ob[1]); rec={'key':key,'source':str(src.relative_to(Path('.'))),'output':str(out.relative_to(Path('.'))),'size':list(frame.size),'bbox':list(ob),'visualHeight':ob[3]-ob[1],'feetY':ob[3],'centroidX':(ob[0]+ob[2])/2,'widthHeightRatio':ratio,'ratioPass':0.38<=ratio<=0.55,'hands':'both empty gripping fists','weaponVisible':False,'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'nativeAttempt':1,'change':'head/body proportion'}; recs.append(rec); (QA/f'{key}.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n')
(QA/'summary.json').write_text(json.dumps({'count':len(recs),'mechanicalPass':sum(r['size']==[240,320] and r['visualHeight']==256 and r['feetY']==300 and abs(r['centroidX']-120)<=1 and r['ratioPass'] for r in recs),'files':recs},ensure_ascii=False,indent=2)+'\n')
for r in recs: print(r['key'],r['bbox'],round(r['widthHeightRatio'],3),r['ratioPass'])
