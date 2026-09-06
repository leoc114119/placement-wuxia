from pathlib import Path
from PIL import Image, ImageDraw
from collections import deque
import hashlib,json
ROOT=Path('assets/_trial_20260906/t45_batch2a_a_rightup_singleframe_v1_codex_native');RAW=ROOT/'raw'/'shanzei_a_rightup_attempt1.png';OUT=ROOT/'normalized';QA=ROOT/'qa';OUT.mkdir(exist_ok=True);QA.mkdir(exist_ok=True)
im=Image.open(RAW).convert('RGBA');pix=im.load();w,h=im.size
# Only near-neutral light checkerboard cells count as removable background. Flood from border so light costume details enclosed by the outline remain untouched.
def is_bg(x,y):
 r,g,b,a=pix[x,y];return min(r,g,b)>=225 and max(r,g,b)-min(r,g,b)<=20
seen=bytearray(w*h);q=deque()
for x in range(w):
 for y in (0,h-1):
  if is_bg(x,y) and not seen[y*w+x]:seen[y*w+x]=1;q.append((x,y))
for y in range(h):
 for x in (0,w-1):
  if is_bg(x,y) and not seen[y*w+x]:seen[y*w+x]=1;q.append((x,y))
while q:
 x,y=q.popleft()
 for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
  i=ny*w+nx
  if 0<=nx<w and 0<=ny<h and not seen[i] and is_bg(nx,ny):seen[i]=1;q.append((nx,ny))
removed=0
for y in range(h):
 for x in range(w):
  if seen[y*w+x]:
   r,g,b,a=pix[x,y];pix[x,y]=(r,g,b,0);removed+=1
a=im.getchannel('A');box=a.point(lambda p:255 if p>=30 else 0).getbbox();crop=im.crop(box);sprite=crop.resize((round(crop.width*256/crop.height),256),Image.Resampling.LANCZOS);frame=Image.new('RGBA',(240,320),(0,0,0,0));frame.alpha_composite(sprite,(round(120-sprite.width/2),44));out=OUT/'shanzei_a_rightup.png';frame.save(out,'PNG',optimize=False);a=frame.getchannel('A');b=a.point(lambda p:255 if p>=30 else 0).getbbox()
rec={'key':'shanzei_a_rightup','source':str(RAW),'output':str(out),'size':list(frame.size),'sourceAlphaBBox':list(box),'bbox':list(b),'visualHeight':b[3]-b[1],'feetY':b[3],'centroidX':(b[0]+b[2])/2,'widthHeightRatio':(b[2]-b[0])/(b[3]-b[1]),'alphaExtrema':list(a.getextrema()),'removedExteriorCheckerboardPixels':removed,'sourceSha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'processing':'deterministic 4-connected exterior removal of only light neutral checkerboard pixels, then alpha-bbox crop and aspect-preserving 240x320 normalization; no semantic redraw','mechanicalPass':bool(frame.size==(240,320) and b[3]-b[1]==256 and b[3]==300 and abs((b[0]+b[2])/2-120)<=1 and a.getextrema()[0]==0)}
(QA/'shanzei_a_rightup.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n');(QA/'summary.json').write_text(json.dumps({'count':1,'mechanicalPass':rec['mechanicalPass'],'files':[rec]},ensure_ascii=False,indent=2)+'\n')
anchor=Path('assets/_trial_20260906/t45_batch2a_a_right_singleframe_v1_codex_native/normalized/shanzei_a_right.png');canvas=Image.new('RGBA',(1040,460),(28,24,21,255));d=ImageDraw.Draw(canvas);d.text((38,20),'A right · selected identity anchor',fill='white');d.text((560,20),'A right-up · single-frame candidate',fill='white');d.line((0,54,520,54),fill=(137,108,66,255),width=2);d.line((520,54,1040,54),fill=(137,108,66,255),width=2)
for x,p in ((140,anchor),(660,out)):canvas.alpha_composite(Image.open(p).convert('RGBA').resize((360,480),Image.Resampling.NEAREST),(x-60,18))
canvas.save(ROOT/'review_pair.png');print(json.dumps(rec,ensure_ascii=False,indent=2))
