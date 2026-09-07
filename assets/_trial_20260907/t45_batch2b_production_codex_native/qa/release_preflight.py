from pathlib import Path
from PIL import Image
import json, hashlib

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'integrated_candidate'
OUT = ROOT / 'release_candidate'
OUT.mkdir(exist_ok=True)

FILES = sorted(SRC.glob('*.png'))

def feather(im, light=195):
    px = im.load(); w,h=im.size; edge=[]
    for y in range(h):
        for x in range(w):
            r,g,b,a=px[x,y]
            if a==0: continue
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx,ny=x+dx,y+dy
                if 0<=nx<w and 0<=ny<h and px[nx,ny][3]==0:
                    edge.append((x,y)); break
    removed=0
    for x,y in edge:
        r,g,b,a=px[x,y]
        if (r+g+b)/3 > light:
            px[x,y]=(0,0,0,0); removed+=1
    return removed

def mask_metrics(im):
    px=im.load(); w,h=im.size
    mask={(x,y) for y in range(h) for x in range(w) if px[x,y][3]>32}
    if not mask: return None
    bb=(min(x for x,y in mask),min(y for x,y in mask),max(x for x,y in mask)+1,max(y for x,y in mask)+1)
    rem=set(mask); sizes=[]
    while rem:
        stack=[rem.pop()]; n=0
        while stack:
            x,y=stack.pop(); n+=1
            for dy in (-1,0,1):
                for dx in (-1,0,1):
                    q=(x+dx,y+dy)
                    if q in rem: rem.remove(q); stack.append(q)
        sizes.append(n)
    cx=sum(x for x,y in mask)/len(mask); cy=sum(y for x,y in mask)/len(mask)
    border=sum(1 for x in range(w) for y in (0,h-1) if px[x,y][3]>0)+sum(1 for y in range(h) for x in (0,w-1) if px[x,y][3]>0)
    light_boundary=0
    for y in range(h):
        for x in range(w):
            r,g,b,a=px[x,y]
            if a==0 or (r+g+b)/3<=195: continue
            if any(0<=x+dx<w and 0<=y+dy<h and px[x+dx,y+dy][3]==0 for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))): light_boundary+=1
    return {'bboxT32':list(bb),'visualWidth':bb[2]-bb[0],'visualHeight':bb[3]-bb[1],'feetY':bb[3],'alpha32CentroidX':cx,'alpha32CentroidY':cy,'alphaExtrema':list(im.getchannel('A').getextrema()),'components':len(sizes),'largestComponent':max(sizes),'borderNonzero':border,'lightBoundaryPixels':light_boundary}

records=[]
for src in FILES:
    im=Image.open(src).convert('RGBA')
    before=mask_metrics(im)
    removed=0
    for _ in range(8):
        n=feather(im)
        removed += n
        if n == 0:
            break
    after_feather=mask_metrics(im)
    pts=[(x,y) for y in range(im.height) for x in range(im.width) if im.getpixel((x,y))[3]>32]
    cx=sum(x for x,y in pts)/len(pts); dx=round(120-cx)
    shifted=Image.new('RGBA',im.size,(0,0,0,0)); shifted.alpha_composite(im,(dx,0))
    shifted.save(OUT/src.name,'PNG',optimize=False)
    m=mask_metrics(shifted)
    hard=bool(shifted.size==(240,320) and m and m['visualHeight']==256 and m['feetY']==300 and abs(m['alpha32CentroidX']-120)<=1 and m['alphaExtrema']==[0,255] and m['components']==1 and m['borderNonzero']==0)
    rec={'name':src.name,'source':str(src.relative_to(ROOT)),'output':str((OUT/src.name).relative_to(ROOT)),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256((OUT/src.name).read_bytes()).hexdigest(),'featherRemovedLightBoundaryPixels':removed,'recenterDxPx':dx,'before':before,'afterFeather':after_feather,**m,'ratioGate':'exempt_action_and_walk_per_seq87','hardGatesPass':hard}
    records.append(rec)
summary={'task':'T45','batch':'2b-production','stage':'release_preflight','count':len(records),'allHardGatesPass':all(r['hardGatesPass'] for r in records),'files':records}
(ROOT/'qa/release_preflight.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'count':len(records),'allHardGatesPass':summary['allHardGatesPass']},ensure_ascii=False))
for r in records: print(r['name'],'feather',r['featherRemovedLightBoundaryPixels'],'dx',r['recenterDxPx'],'cx',round(r['alpha32CentroidX'],3),'h',r['visualHeight'],'feet',r['feetY'],'comp',r['components'],'border',r['borderNonzero'],'lightEdge',r['lightBoundaryPixels'],'PASS',r['hardGatesPass'])
if not summary['allHardGatesPass']: raise SystemExit(1)
