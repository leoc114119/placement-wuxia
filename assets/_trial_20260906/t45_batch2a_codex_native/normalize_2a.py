from pathlib import Path
from PIL import Image
from collections import deque
import json, hashlib, math

JOB=Path('assets/_trial_20260906/t45_batch2a_codex_native')
RAW=JOB/'raw'; OUT=JOB/'normalized'; QA=JOB/'qa'; CONTACT=JOB/'contact'
OUT.mkdir(exist_ok=True); QA.mkdir(exist_ok=True); CONTACT.mkdir(exist_ok=True)
chosen={
 'shanzei_a_right':'shanzei_a_right_attempt2.png',
 'shanzei_a_rightup':'shanzei_a_rightup_attempt2.png',
 'shanzei_a_rightdown':'shanzei_a_rightdown_attempt2.png',
 'shanzei_b_right':'shanzei_b_right_attempt1.png',
 'shanzei_b_rightup':'shanzei_b_rightup_attempt1.png',
 'shanzei_b_rightdown':'shanzei_b_rightdown_attempt1.png',
}

def cut_white(im):
    # Deterministic edge flood for near-white single-color isolation backgrounds.
    im=im.convert('RGBA'); w,h=im.size; px=im.load(); seen=set(); q=deque()
    def bg(x,y):
        r,g,b,a=px[x,y]
        return a>=245 and min(r,g,b)>=240 and max(r,g,b)-min(r,g,b)<=12
    for x in range(w):
        for y in (0,h-1):
            if bg(x,y): q.append((x,y)); seen.add((x,y))
    for y in range(h):
        for x in (0,w-1):
            if bg(x,y): q.append((x,y)); seen.add((x,y))
    while q:
        x,y=q.popleft(); px[x,y]=(px[x,y][0],px[x,y][1],px[x,y][2],0)
        for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen and bg(nx,ny): seen.add((nx,ny)); q.append((nx,ny))
    return im

def process(key,fn):
    src=RAW/fn; im=Image.open(src).convert('RGBA')
    if im.getchannel('A').getextrema()==(255,255): im=cut_white(im); cut='edge-flood-white'
    else: cut='source-alpha-preserved'
    alpha=im.getchannel('A')
    bbox=alpha.point(lambda p: 255 if p>=30 else 0).getbbox()
    if not bbox: raise RuntimeError(f'no subject: {fn}')
    crop=im.crop(bbox)
    scale=256/crop.height
    nw=max(1,round(crop.width*scale)); nh=256
    crop=crop.resize((nw,nh),Image.Resampling.LANCZOS)
    frame=Image.new('RGBA',(240,320),(0,0,0,0))
    x=round(120-nw/2); y=300-nh
    frame.alpha_composite(crop,(x,y))
    out=OUT/f'{key}.png'; frame.save(out,'PNG',optimize=False)
    ob=frame.getchannel('A').point(lambda p:255 if p>=8 else 0).getbbox()
    ratio=(ob[2]-ob[0])/(ob[3]-ob[1]) if ob else None
    rec={'key':key,'source':str(src.relative_to(Path('.'))),'output':str(out.relative_to(Path('.'))),'cutMethod':cut,'sourceSize':list(im.size),'sourceBBox':list(bbox),'outputSize':list(frame.size),'outputBBox':list(ob) if ob else None,'visualHeight':ob[3]-ob[1] if ob else None,'widthHeightRatio':ratio,'ratioPass':ratio is not None and 0.38<=ratio<=0.55,'feetY':ob[3] if ob else None,'centroidX':((ob[0]+ob[2])/2 if ob else None),'alphaExtrema':list(frame.getchannel('A').getextrema()),'hasWeapon':False}
    (QA/f'{key}.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n')
    return rec
recs=[process(k,v) for k,v in chosen.items()]
(JOB/'qa'/'normalized_summary.json').write_text(json.dumps({'count':len(recs),'files':recs,'allMechanical':all(r['outputSize']==[240,320] and r['visualHeight']==256 and r['feetY']==300 and r['centroidX']==120 and r['alphaExtrema']==[0,255] for r in recs)},ensure_ascii=False,indent=2)+'\n')
for r in recs: print(r['key'],r['outputBBox'],'ratio',round(r['widthHeightRatio'],3),'ratioPass',r['ratioPass'])
