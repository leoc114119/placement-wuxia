from pathlib import Path
import hashlib, json
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
RAW, OUT, QA = ROOT/'raw', ROOT/'normalized', ROOT/'qa'
OUT.mkdir(exist_ok=True); QA.mkdir(exist_ok=True)

def cutout(src):
    rgb=Image.open(src).convert('RGB'); mask=rgb.copy()
    for c in ((0,0),(rgb.width-1,0),(0,rgb.height-1),(rgb.width-1,rgb.height-1)):
        ImageDraw.floodfill(mask,c,(0,255,0),thresh=60)
    rgba=rgb.convert('RGBA'); op,mp=rgba.load(),mask.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            if mp[x,y]==(0,255,0):
                r,g,b,_=op[x,y]; op[x,y]=(r,g,b,0)
    return rgba

def bbox(im): return im.getchannel('A').point(lambda p:255 if p>=30 else 0).getbbox()

def norm(src):
    key=src.stem.replace('_attempt1','').replace('_attempt2','')
    im=cutout(src); sb=bbox(im)
    if not sb: raise ValueError(f'empty cutout: {src}')
    crop=im.crop(sb); scale=256/crop.height
    sprite=crop.resize((round(crop.width*scale),256),Image.Resampling.LANCZOS)
    frame=Image.new('RGBA',(240,320),(0,0,0,0)); frame.alpha_composite(sprite,(round(120-sprite.width/2),44))
    out=OUT/f'{key}.png'; frame.save(out,'PNG',optimize=False)
    b=bbox(frame); a=frame.getchannel('A'); w=b[2]-b[0]; h=b[3]-b[1]
    rec={'key':key,'source':str(src),'output':str(out),'size':list(frame.size),'bboxT30':list(b),'visualWidth':w,'visualHeight':h,'feetY':b[3],'centroidX':(b[0]+b[2])/2,'widthHeightRatio':w/h,'alphaExtrema':list(a.getextrema()),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'processing':'connected neutral-background flood-cut; aspect-preserving resize to visual height 256; 240x320 RGBA frame; no redraw'}
    rec['ratioPass']=0.375 <= rec['widthHeightRatio'] <= 0.515625
    rec['mechanicalPass']=bool(frame.size==(240,320) and h==256 and b[3]==300 and abs(rec['centroidX']-120)<=1 and a.getextrema()[0]==0 and rec['ratioPass'])
    (QA/f'{key}.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n')
    return rec

records=[norm(p) for p in sorted(RAW.glob('shanzei_*_attempt*.png'))]
summary={'count':len(records),'ratioGate':'0.375<=width/visualHeight<=0.515625','mechanicalPass':all(r['mechanicalPass'] for r in records),'files':records}
(QA/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
