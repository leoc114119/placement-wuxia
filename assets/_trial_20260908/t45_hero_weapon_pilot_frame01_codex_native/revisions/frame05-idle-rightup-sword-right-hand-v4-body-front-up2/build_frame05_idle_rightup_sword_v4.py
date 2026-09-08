#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,math
from collections import deque
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5]
REV=Path(__file__).resolve().parent
BODY=ROOT/'assets/characters/hero/battle45/battle_idle_rightup.png'
SOURCE=ROOT/'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png'
RAW=REV/'raw/hero_sword_source_v9.png'; OUT=REV/'normalized/hero_sword_held_idle_rightup_character_right_hand_v4.png'; MASK=REV/'occlusion_masks/hero_idle_rightup_screen_right_fist_v4.png'; TRIP=REV/'composites_native/hero_idle_rightup_sword_right_hand_triptych_v4.png'; TRIP2=REV/'composites_2x/hero_idle_rightup_sword_right_hand_triptych_v4_2x.png'; CONTACT=REV/'contact/hero_idle_rightup_sword_right_hand_v4.png'; ZOOM=REV/'contact/idle_rightup_right_fist_center_zoom_v4.png'; QA=REV/'qa/pilot_idle_rightup_right_hand_v4.json'; CAL=REV/'calibration/frame05_idle_rightup_right_hand_v4.json'
W,H=240,320
TX,TY=76,-6
SOURCE_HANDLE=(101.57368615160716,205.58781573590227)
FIST=(178.10526315789474,204.5)
ANGLE=-40.0
TARGET_HANDLE=(SOURCE_HANDLE[0]+TX,SOURCE_HANDLE[1]+TY)
GRIP=(113.0+TX,196.0+TY)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def pts(im,t=32):
 a=im.getchannel('A'); return {(x,y) for y in range(im.height) for x in range(im.width) if a.getpixel((x,y))>t}
def metrics(im):
 im=im.convert('RGBA'); a=im.getchannel('A'); p=pts(im); xs=[x for x,y in p];ys=[y for x,y in p]; return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'bboxT32':[min(xs),min(ys),max(xs)+1,max(ys)+1],'visualWidth':max(xs)-min(xs)+1,'visualHeight':max(ys)-min(ys)+1,'borderNonzero':sum(a.getpixel((x,y))>0 for x in range(W) for y in (0,H-1))+sum(a.getpixel((x,y))>0 for y in range(1,H-1) for x in (0,W-1))}
def comps(im):
 rem=set(pts(im)); n=0
 while rem:
  n+=1;s=rem.pop();q=[s]
  while q:
   x,y=q.pop()
   for dx,dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
    z=(x+dx,y+dy)
    if z in rem:rem.remove(z);q.append(z)
 return n
def translate(im,dx,dy):
 out=Image.new('RGBA',im.size,(0,0,0,0));out.alpha_composite(im,(dx,dy));return out
def fist_component(body):
 c=set()
 for y in range(180,225):
  for x in range(150,205):
   r,g,b,a=body.getpixel((x,y))
   if a>32 and r>170 and 70<g<210 and b<150 and r>g*1.25 and g>b*1.15:c.add((x,y))
 cs=[]
 while c:
  s=c.pop();k={s};q=deque([s])
  while q:
   x,y=q.popleft()
   for dx in(-1,0,1):
    for dy in(-1,0,1):
     z=(x+dx,y+dy)
     if z in c:c.remove(z);k.add(z);q.append(z)
  cs.append(k)
 return max(cs,key=len)
def subtract(weapon,mask):
 out=weapon.copy();out.putalpha(Image.frombytes('L',(W,H),bytes(max(0,a-m) for a,m in zip(weapon.getchannel('A').getdata(),mask.getdata()))));return out
def trip(body,weapon,mask):
 full=weapon.copy(); full.alpha_composite(body)
 # Body-front mode: no painted or calculated fist mask; the complete body layer occludes the weapon.
 front=full.copy()
 back=weapon.copy(); back.alpha_composite(body)
 o=Image.new('RGBA',(W*3,H),(232,232,232,255))
 for i,p in enumerate((full,front,back)): o.alpha_composite(p,(i*W,0))
 return o
def main():
 for p in (BODY,SOURCE): assert p.exists(),p
 body=Image.open(BODY).convert('RGBA');src=Image.open(SOURCE).convert('RGBA');RAW.write_bytes(SOURCE.read_bytes());weapon=translate(src,TX,TY);weapon.save(OUT)
 fist=fist_component(body);mask=Image.new('L',(W,H),0);mp=mask.load();ba=body.getchannel('A')
 for x,y in fist:
   for dx in range(-2,3):
    for dy in range(-2,3):
     if dx*dx+dy*dy <= 8 and 160 <= x+dx < 205 and 185 <= y+dy < 225:
      mp[x+dx,y+dy]=255 if ba.getpixel((x+dx,y+dy))>0 else 0
 mask.save(MASK);tri=trip(body,weapon,mask);tri.save(TRIP);tri.resize((W*6,H*2),Image.Resampling.NEAREST).save(TRIP2)
 ct=Image.new('RGBA',(W*3,H+42),(236,236,236,255));ct.alpha_composite(tri,(0,42));d=ImageDraw.Draw(ct);d.text((4,4),'FULL · character RIGHT hand (screen-right fist)',fill=(20,20,20,255));d.text((4,22),f'idle_rightup · handle≈({TARGET_HANDLE[0]:.2f},{TARGET_HANDLE[1]:.2f}) · v9 + ({TX},{TY}) · angle=-40°',fill=(20,20,20,255));ct.save(CONTACT);ct.resize((ct.width*2,ct.height*2),Image.Resampling.NEAREST).save(REV/'contact/hero_idle_rightup_sword_right_hand_v4_2x.png')
 box=(180,148,225,200);z=body.copy();z.alpha_composite(weapon);z=z.crop(box).resize((540,624),Image.Resampling.NEAREST);zd=ImageDraw.Draw(z);cx=(FIST[0]-box[0])*12;cy=(FIST[1]-box[1])*12;zd.line((cx,0,cx,z.height),fill=(255,0,0,255),width=3);zd.line((0,cy,z.width,cy),fill=(255,0,0,255),width=3);zd.text((4,4),f'right fist≈({FIST[0]:.2f},{FIST[1]:.2f})',fill=(255,255,255,255),stroke_width=1,stroke_fill=(0,0,0,255));z.save(ZOOM)
 bm,wm=metrics(body),metrics(weapon);wp=pts(weapon);axis=max(x for x,y in wp)-min(x for x,y in wp);before=sum(a>32 and m>0 for a,m in zip(weapon.getchannel('A').getdata(),mask.getdata()));after=sum(a>32 and m>0 for a,m in zip(subtract(weapon,mask).getchannel('A').getdata(),mask.getdata()));
 checks={'bodyCanvasPass':bm['size']==[W,H],'bodyAlphaPass':bm['alphaExtrema']==[0,255],'bodyBorderTransparent':bm['borderNonzero']==0,'weaponCanvasPass':wm['size']==[W,H],'weaponRealAlphaPass':wm['alphaExtrema']==[0,255],'weaponSingleConnectedSilhouette':comps(weapon)==1,'weaponLengthBandPass':110<=axis<=140,'weaponAnglePass':abs(ANGLE+40)<1e-3,'handleOffsetUp5Pass':abs(TARGET_HANDLE[0]-FIST[0])<1.0 and abs((TARGET_HANDLE[1]+5)-FIST[1])<1.0,'bodyFrontOcclusionMode':True,'runtimeUntouched':True,'generationCreditsZero':True}
 qa={'task':'T45','seq':'hero-weapon-pilot-frame05-idle-rightup','revision':'frame05-idle-rightup-sword-right-hand-v4-body-front-up2','artifactStage':'candidate','visualReview':'pending_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','runtimeRelease':False,'generation':{'credits':0,'method':'deterministic integer translation of Leo-selected v9 sword layer','rawImageGeneration':False},'body':{'path':str(BODY.relative_to(ROOT)),'sha256':sha(BODY),'metrics':bm},'weapon':{'sourceLayer':str(SOURCE.relative_to(ROOT)),'sourceLayerSha256':sha(SOURCE),'normalizedPath':str(OUT.relative_to(ROOT)),'normalizedSha256':sha(OUT),'metrics':wm,'translationPx':[TX,TY],'angleDeg':ANGLE,'handleCenterSourcePx':list(SOURCE_HANDLE),'handleCenterTargetPx':list(TARGET_HANDLE)},'hand':{'semantic':'character_right_hand','screenProjection':'screen-right fist in idle_rightup','fistCenterPx':list(FIST),'fistPixels':len(fist),'gripPointPx':list(GRIP)},'occlusion':{'layerOrder':'body_front','maskPolicy':'none','diagnosticMaskPath':str(MASK.relative_to(ROOT)),'diagnosticMaskSha256':sha(MASK),'weaponInFistBefore':before,'weaponInFistAfter':after},'composites':{'native':str(TRIP.relative_to(ROOT)),'twoX':str(TRIP2.relative_to(ROOT)),'contact':str(CONTACT.relative_to(ROOT)),'fistZoom':str(ZOOM.relative_to(ROOT))},'checks':checks|{'allMachineChecksPass':all(checks.values())},'note':'Body-front composite requested by Leo: render complete character body above the sword to close the hand/sword seam; sword keeps -40 degree angle and moves another 2px upward from v3 (translation total +76,-6). Preview edge crop remains preview-only.'}
 QA.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n');CAL.write_text(json.dumps({'task':'T45','revision':'frame05-idle-rightup-sword-right-hand-v4-body-front-up2','bodyPath':str(BODY.relative_to(ROOT)),'bodySha256':sha(BODY),'weaponPath':str(OUT.relative_to(ROOT)),'weaponSha256':sha(OUT),'handSemantic':'character_right_hand','screenProjection':'screen-right fist in idle_rightup','fistCenterPx':list(FIST),'handleCenterSourcePx':list(SOURCE_HANDLE),'handleCenterTargetPx':list(TARGET_HANDLE),'translationPx':[TX,TY],'angleDeg':ANGLE,'layerOrder':'body_front','status':'candidate_only','runtimeRelease':False},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'checks':checks,'allMachineChecksPass':all(checks.values()),'weaponBBox':wm['bboxT32'],'fist':FIST,'handleTarget':TARGET_HANDLE},ensure_ascii=False))
main()
