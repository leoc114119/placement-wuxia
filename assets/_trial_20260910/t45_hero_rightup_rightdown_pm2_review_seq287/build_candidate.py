from pathlib import Path
from collections import deque
from PIL import Image
import hashlib,json
ROOT=Path(__file__).parent; W,H,TARGET,FEET,CX=240,320,256,300,120
SHEETS={d:ROOT.parent/'t45_hero_rightup_rightdown_regen_seq272/raw'/f'{d}_from_rightward_selected_2x5.png' for d in ('rightup','rightdown')}
WALKS={
 'rightup':[Path('assets/_trial_20260910/t45_hero_rightup_walk_user_frame2_merge_seq285/normalized/rightup_walk_1.png'),Path('assets/_trial_20260910/t45_hero_rightup_walk_user_frame2_merge_seq285/normalized/rightup_walk_2.png'),Path('assets/_trial_20260910/t45_hero_rightup_walk_user_frame2_merge_seq285/normalized/rightup_walk_3.png')],
 'rightdown':[Path('assets/_trial_20260910/t45_hero_rightdown_walk_user_frame2_merge_seq286/normalized/rightdown_walk_1.png'),Path('assets/_trial_20260910/t45_hero_rightdown_walk_user_frame2_merge_seq286/normalized/rightdown_walk_2.png'),Path('assets/_trial_20260910/t45_hero_rightdown_walk_user_frame2_merge_seq286/normalized/rightdown_walk_3.png')],
}
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
 for x,y in seen:px[x,y]=(0,0,0,0)
 return im

def norm(im):
 c=cut(im); bb=c.getchannel('A').getbbox(); crop=c.crop(bb); s=min(TARGET/crop.height,236/crop.width); nw=round(crop.width*s); nh=round(crop.height*s); crop=crop.resize((nw,nh),Image.Resampling.LANCZOS);a=crop.getchannel('A');vals=list(a.getdata());tot=sum(vals);cx=sum((i%crop.width)*v for i,v in enumerate(vals))/tot;out=Image.new('RGBA',(W,H));out.alpha_composite(crop,(round(CX-cx),FEET-nh));
 # Deterministic edge cleanup: remove only any antialias pixels landing on canvas border.
 op=out.load()
 for x in range(W):
  for y in (0,H-1): op[x,y]=(0,0,0,0)
 for y in range(H):
  for x in (0,W-1): op[x,y]=(0,0,0,0)
 return out

def metrics(im):
 a=im.getchannel('A');bb=a.getbbox();vals=list(a.getdata());tot=sum(vals);cx=sum((i%im.width)*v for i,v in enumerate(vals))/tot;return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'bbox':list(bb),'visualHeight':bb[3]-bb[1],'feetYExclusive':bb[3],'alphaCentroidX':cx,'borderNonzero':sum(a.getpixel((x,y))>0 for x in range(im.width) for y in (0,im.height-1))+sum(a.getpixel((x,y))>0 for y in range(im.height) for x in (0,im.width-1))}
qa={'task':'T45','seq':'287','artifactStage':'candidate','visualReview':'selected_by_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','directions':{}}
for d in ('rightup','rightdown'):
 sheet=Image.open(SHEETS[d]).convert('RGB'); sp=ROOT/'raw_sources'/f'{d}_source_2x5.png'; sheet.save(sp)
 outdir=ROOT/'normalized'/d; frames=[]; srcs=[]
 # walk: use Leo-confirmed normalized replacements for all 3
 for i,p in enumerate(WALKS[d],1):
  out=outdir/f'walk_{d}_{i}.png'; Image.open(ROOT.parent.parent.parent/p).convert('RGBA').save(out); srcs.append({'action':'walk','index':i,'source':str(p),'output':str(out),'sourceSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'metrics':metrics(Image.open(out))})
 # atk indices 3,4 on row0 and 0,1 on row1; jump indices 2,3,4 row1
 layout=[('atk',0,3),('atk',0,4),('atk',1,0),('atk',1,1),('jump',1,2),('jump',1,3),('jump',1,4)]
 for j,(act,row,col) in enumerate(layout,1):
  crop=sheet.crop((round(col*sheet.width/5),round(row*sheet.height/2),round((col+1)*sheet.width/5),round((row+1)*sheet.height/2)))
  out=outdir/f'{act}_{d}_{j if act=="atk" else j-4}.png'; norm(crop).save(out);srcs.append({'action':act,'index':j if act=='atk' else j-4,'sheetCell':[row,col],'source':str(sp),'sourceSha256':hashlib.sha256(sp.read_bytes()).hexdigest(),'output':str(out),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'metrics':metrics(Image.open(out))})
 # reorder by action/index and contact 2x5
 ordered=sorted(srcs,key=lambda x:({'walk':0,'atk':1,'jump':2}[x['action']],x['index']))
 contact=Image.new('RGBA',(W*5,H*2),(52,52,52,255))
 for i,e in enumerate(ordered): contact.alpha_composite(Image.open(ROOT.parent.parent.parent/e['output']).convert('RGBA'),((i%5)*W,(i//5)*H))
 cp=ROOT/'contact'/f'{d}_10frame_240x320.png';contact.save(cp)
 qa['directions'][d]={'sourceSheet':str(sp),'sourceSheetSha256':hashlib.sha256(sp.read_bytes()).hexdigest(),'frames':ordered,'contact':str(cp),'allMachineChecksPass':all(e['metrics']['size']==[240,320] and e['metrics']['mode']=='RGBA' and e['metrics']['alphaExtrema']==[0,255] and 230<=e['metrics']['visualHeight']<=282 and e['metrics']['feetYExclusive']==300 and abs(e['metrics']['alphaCentroidX']-120)<=1 and e['metrics']['borderNonzero']==0 for e in ordered)}
qa['allMachineChecksPass']=all(v['allMachineChecksPass'] for v in qa['directions'].values());(ROOT/'qa/manifest_seq287.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'allMachineChecksPass':qa['allMachineChecksPass'],'rightup':len(qa['directions']['rightup']['frames']),'rightdown':len(qa['directions']['rightdown']['frames'])},ensure_ascii=False))
