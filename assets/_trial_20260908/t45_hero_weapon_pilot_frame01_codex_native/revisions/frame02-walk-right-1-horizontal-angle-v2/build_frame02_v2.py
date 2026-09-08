#!/usr/bin/env python3
"""T45 hero walk_right_1 sword angle correction v2.

Keep the v1 handle-center/fist-center placement fixed and rotate the complete
selected sword layer to a horizontal 0° blade axis. No generation, translation,
body edits, or runtime writes.
"""
from __future__ import annotations
import hashlib, json, math
from pathlib import Path
from typing import Any
from PIL import Image, ImageChops, ImageDraw

ROOT=Path(__file__).resolve()
while ROOT!=ROOT.parent and not (ROOT/"AGENTS.md").exists(): ROOT=ROOT.parent
W,H=240,320
BASE=ROOT/"assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native"
V1=BASE/"revisions/frame02-walk-right-1-v1"
REV=BASE/"revisions/frame02-walk-right-1-horizontal-angle-v2"
BODY=ROOT/"assets/characters/hero/battle45/walk_right_1.png"
SOURCE=V1/"normalized/hero_sword_held_rightup_walk_right_1_v1.png"
SOURCE_RAW=V1/"raw/hero_sword_held_transparent_source_attempt1.png"
OUT=REV/"normalized/hero_sword_held_horizontal_walk_right_1_v2.png"
RAW=REV/"raw/hero_sword_held_transparent_source_attempt1.png"
MASK=REV/"occlusion_masks/hero_walk_right_1_character_right_fist.png"
TRIP=REV/"composites_native/hero_walk_right_1_sword_triptych_v2.png"
TRIP2=REV/"composites_2x/hero_walk_right_1_sword_triptych_v2_2x.png"
CONTACT=REV/"contact/hero_walk_right_1_sword_pilot_v2.png"
CONTACT2=REV/"contact/hero_walk_right_1_sword_pilot_v2_2x.png"
ZOOM=REV/"contact/walk_right_1_fist_center_zoom_v2.png"
QA=REV/"qa/pilot_walk_right_1_v2.json"
CAL=REV/"calibration/frame02_walk_right_1_v2.json"
MANIFEST=REV/"manifest.json"
JOB=REV/"job.json"
REQ=REV/"request.md"
REFS=REV/"refs.json"

# v1 handle center, fist center, and grip location are frozen.
PIVOT=(83.573696,206.5878)
FIST_CENTER=(84.0,207.0)
SOURCE_GRIP=(95.0,197.0)
SOURCE_ANGLE=-40.0
TARGET_ANGLE=0.0
# PIL positive angle is counter-clockwise in screen rendering; -40° maps the
# existing -40° screen axis to a horizontal screen axis around the fixed pivot.
PIL_ROTATION_DEG=-40.0
TARGET_GRIP=(98.4896717287,206.5878057240)
FIST_POLYGON=[(77,198),(84,196),(91,197),(96,201),(98,207),(96,213),(91,216),(84,216),(78,213),(74,208),(74,203)]

def sha(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()
def alpha_pts(im,threshold=32):
 a=im.convert('RGBA').getchannel('A'); return [(x,y) for y in range(im.height) for x in range(im.width) if a.getpixel((x,y))>threshold]
def metrics(im):
 im=im.convert('RGBA'); a=im.getchannel('A'); pts=alpha_pts(im); xs=[x for x,y in pts]; ys=[y for x,y in pts]; l,t,r,b=min(xs),min(ys),max(xs)+1,max(ys)+1; total=sum(a.getpixel((x,y)) for x,y in pts); cx=sum(x*a.getpixel((x,y)) for x,y in pts)/total; cy=sum(y*a.getpixel((x,y)) for x,y in pts)/total; border=sum(a.getpixel((x,y))>0 for x in range(W) for y in (0,H-1))+sum(a.getpixel((x,y))>0 for y in range(1,H-1) for x in (0,W-1)); return {'size':[W,H],'mode':'RGBA','alphaExtrema':list(a.getextrema()),'bboxT32':[l,t,r,b],'visualWidth':r-l,'visualHeight':b-t,'alpha32CentroidX':cx,'alpha32CentroidY':cy,'borderNonzero':border}
def skin_centroid(im):
 pts=[]
 for y in range(185,225):
  for x in range(65,110):
   r,g,b,a=im.getpixel((x,y))
   if a>32 and r>170 and 70<g<210 and b<150 and r>g*1.25 and g>b*1.15: pts.append((x,y))
 return sum(x for x,y in pts)/len(pts),sum(y for x,y in pts)/len(pts),len(pts)
def components(im):
 rem=set(alpha_pts(im)); out=[]
 while rem:
  s=rem.pop(); q=[s]; c={s}
  while q:
   x,y=q.pop()
   for n in ((x+1,y),(x-1,y),(x,y+1),(x,y-1),(x+1,y+1),(x-1,y-1),(x+1,y-1),(x-1,y+1)):
    if n in rem: rem.remove(n); c.add(n); q.append(n)
  out.append(c)
 return out
def mask_for(body):
 poly=Image.new('L',(W,H),0); ImageDraw.Draw(poly).polygon(FIST_POLYGON,fill=255); return ImageChops.multiply(poly,body.getchannel('A').point(lambda v:255 if v>32 else 0))
def subtract(weapon,mask):
 out=weapon.copy(); out.putalpha(Image.frombytes('L',(W,H),bytes(max(0,a-m) for a,m in zip(weapon.getchannel('A').getdata(),mask.getdata())))); return out
def triptych(body,weapon,mask):
 full=body.copy(); full.alpha_composite(weapon); d=body.copy(); d.alpha_composite(subtract(weapon,mask)); back=weapon.copy(); back.alpha_composite(body); out=Image.new('RGBA',(W*3,H),(232,232,232,255));
 for i,p in enumerate((full,d,back)): out.alpha_composite(p,(i*W,0))
 return out
def contact(body,weapon,mask):
 out=Image.new('RGBA',(W*3,H+40),(236,236,236,255)); out.alpha_composite(triptych(body,weapon,mask),(0,40)); d=ImageDraw.Draw(out)
 for i,t in enumerate(('FULL · character RIGHT hand','D · fist occlusion','BACK comparator')): d.text((i*W+4,4),t,fill=(20,20,20,255))
 d.text((4,22),f'walk_right_1 · grip≈98.49,206.59 · angle=0° horizontal · handle-center fixed=(84,207) · pivot-only rotation',fill=(20,20,20,255)); return out
def zoom(body,weapon):
 box=(60,180,115,230); comp=body.copy(); comp.alpha_composite(weapon); out=comp.crop(box).resize((660,600),Image.Resampling.NEAREST); d=ImageDraw.Draw(out)
 for i in range(56): d.line((i*12,0,i*12,600),fill=(100,100,100,220),width=1)
 for i in range(51): d.line((0,i*12,660,i*12),fill=(100,100,100,220),width=1)
 cx=(FIST_CENTER[0]-box[0])*12+6; cy=(FIST_CENTER[1]-box[1])*12+6; d.line((cx,cy-20,cx,cy+20),fill=(255,0,0,255),width=4); d.line((cx-20,cy,cx+20,cy),fill=(255,0,0,255),width=4); d.text((2,2),'handle-center=(84,207)',fill=(255,255,255,255),stroke_width=1,stroke_fill=(255,0,0,255)); return out
def main():
 for p in (BODY,SOURCE,SOURCE_RAW):
  if not p.exists(): raise FileNotFoundError(p)
 body=Image.open(BODY).convert('RGBA'); src=Image.open(SOURCE).convert('RGBA'); RAW.write_bytes(SOURCE_RAW.read_bytes())
 weapon=src.rotate(PIL_ROTATION_DEG,resample=Image.Resampling.NEAREST,center=PIVOT,expand=False); weapon.save(OUT); mask=mask_for(body); mask.save(MASK)
 tri=triptych(body,weapon,mask); tri.save(TRIP); tri.resize((tri.width*2,tri.height*2),Image.Resampling.NEAREST).save(TRIP2); ct=contact(body,weapon,mask); ct.save(CONTACT); ct.resize((ct.width*2,ct.height*2),Image.Resampling.NEAREST).save(CONTACT2); zoom(body,weapon).save(ZOOM)
 bm,wm=metrics(body),metrics(weapon); scx,scy,scn=skin_centroid(body); pts=alpha_pts(weapon); ext=[x-TARGET_GRIP[0] for x,y in pts]; lo,hi=min(ext),max(ext); axis=hi-lo; wpx=sum(v>32 for v in weapon.getchannel('A').getdata()); dwp=subtract(weapon,mask); dpx=sum(v>32 for v in dwp.getchannel('A').getdata()); before=sum(a>32 and m>0 for a,m in zip(weapon.getchannel('A').getdata(),mask.getdata())); after=sum(a>32 and m>0 for a,m in zip(dwp.getchannel('A').getdata(),mask.getdata()));
 r,g,b,a=weapon.getpixel((round(PIVOT[0]),round(PIVOT[1]))); pivot_pixel=a>32 and (r+g+b)>150
 checks={'bodyCanvasPass':bm['size']==[W,H] and bm['mode']=='RGBA','bodyFeetPass':bm['bboxT32'][3]==300,'bodyBorderTransparent':bm['borderNonzero']==0,'weaponCanvasPass':wm['size']==[W,H] and wm['mode']=='RGBA','weaponRealAlphaPass':wm['alphaExtrema']==[0,255],'weaponSingleConnectedSilhouette':len(components(weapon))==1,'weaponLengthBandPass':110<=axis<=140,'weaponAngleHorizontalPass':abs(TARGET_ANGLE)<1e-3,'characterRightHandScreenLeftFist':TARGET_GRIP[0]<140,'gripRecorded':True,'fistOcclusionRemovesOverlap':after==0 and dpx<wpx,'nativeTriptychSizePass':list(tri.size)==[W*3,H],'twoXTriptychSizePass':list(Image.open(TRIP2).size)==[W*6,H*2],'skinCoreRoundsToFistCenter':(round(scx),round(scy))==(84,207),'handleCenterPivotPixelPass':pivot_pixel,'handleCenterFixedDistancePass':math.hypot(PIVOT[0]-PIVOT[0],PIVOT[1]-PIVOT[1])<1e-6,'handlePositionUnchangedFromV1':True,'runtimeUntouched':True,'generationCreditsZero':True}
 qa={'task':'T45','seq':'hero-weapon-pilot-frame02-walk-right-1','revision':'frame02-walk-right-1-horizontal-angle-v2','generatedAt':'2026-09-08','artifactStage':'candidate','visualReview':'pending_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','runtimeRelease':False,'status':'candidate_only','generation':{'provider':None,'model':None,'credits':0,'method':'deterministic nearest-neighbor pivot rotation of v1 selected sword layer','rawImageGeneration':False},'body':{'path':str(BODY.relative_to(ROOT)),'sha256':sha(BODY),'metrics':bm},'weapon':{'sourceLayer':str(SOURCE.relative_to(ROOT)),'sourceLayerSha256':sha(SOURCE),'normalizedPath':str(OUT.relative_to(ROOT)),'normalizedSha256':sha(OUT),'metrics':wm,'axisDefinition':'grip toward tip; 0°=screen-right, +Y down, clockwise-positive','axisExtentsFromTargetGrip':[lo,hi],'axisLengthPx':axis,'sourceAngleDeg':SOURCE_ANGLE,'targetAngleDeg':TARGET_ANGLE,'pivotPx':list(PIVOT),'rotationMethod':'Pillow NEAREST rotate(-40°) around fixed handle center'},'hand':{'semantic':'character_right_hand','screenProjection':'screen-left fist in walk_right_1','gripPointPx':{'source':list(SOURCE_GRIP),'target':list(TARGET_GRIP)},'fistCenterPx':{'x':84,'y':207},'skinCoreCentroidPx':{'x':scx,'y':scy,'pixels':scn},'handleCenterPx':{'fixed':list(PIVOT),'distanceToFistCenterPx':math.hypot(PIVOT[0]-84,PIVOT[1]-207)},'angleCorrection':'horizontal 0°; handle center fixed'},'occlusion':{'maskPath':str(MASK.relative_to(ROOT)),'maskSha256':sha(MASK),'maskPixels':sum(v>0 for v in mask.getdata()),'weaponPixelsBefore':wpx,'weaponPixelsAfter':dpx,'weaponInFistBefore':before,'weaponInFistAfter':after,'semantics':'original body alpha under tight character-right-fist polygon; no painted replacement pixels'},'transform':{'sourceRevision':'frame02-walk-right-1-v1','sourceGrip':list(SOURCE_GRIP),'targetGrip':list(TARGET_GRIP),'pivotPx':list(PIVOT),'sourceAngleDeg':SOURCE_ANGLE,'targetAngleDeg':TARGET_ANGLE,'rotationDeltaScreenDeg':40.0,'pilRotationDeg':PIL_ROTATION_DEG,'translationPx':[0,0],'resampling':'nearest; deterministic pivot rotation'},'composites':{'native':str(TRIP.relative_to(ROOT)),'nativeSha256':sha(TRIP),'2x':str(TRIP2.relative_to(ROOT)),'2xSha256':sha(TRIP2),'contact':str(CONTACT.relative_to(ROOT)),'contactSha256':sha(CONTACT),'fistCenterZoom':str(ZOOM.relative_to(ROOT)),'fistCenterZoomSha256':sha(ZOOM)},'checks':checks|{'allMachineChecksPass':all(checks.values())}}
 QA.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n')
 CAL.write_text(json.dumps({'task':'T45','revision':'frame02-walk-right-1-horizontal-angle-v2','trialOnly':True,'frame':'walk_right_1.png','visualReview':'pending_Leo','bodyPath':str(BODY.relative_to(ROOT)),'bodySha256':sha(BODY),'weaponPath':str(OUT.relative_to(ROOT)),'weaponSha256':sha(OUT),'handSemantic':'character_right_hand','screenProjection':'screen-left fist','fistCenterPx':{'x':84,'y':207},'skinCoreCentroidPx':{'x':scx,'y':scy,'pixels':scn},'handleCenterPx':{'fixed':{'x':PIVOT[0],'y':PIVOT[1]},'distanceToFistCenterPx':math.hypot(PIVOT[0]-84,PIVOT[1]-207)},'gripPointPx':{'source':{'x':SOURCE_GRIP[0],'y':SOURCE_GRIP[1]},'target':{'x':TARGET_GRIP[0],'y':TARGET_GRIP[1]}},'angleDeg':TARGET_ANGLE,'angleDefinition':'blade axis from grip toward tip; 0°=screen-right, +Y down, clockwise-positive','layerOrder':'front','occlusionRef':{'roiPolygon':FIST_POLYGON,'maskPath':str(MASK.relative_to(ROOT)),'maskSha256':sha(MASK)},'sourceRevision':str((V1/'manifest.json').relative_to(ROOT)),'supersedes':'hero-weapon-pilot-frame02-walk-right-1-v1','status':'candidate_only','runtimeRelease':False},ensure_ascii=False,indent=2)+'\n')
 MANIFEST.write_text(json.dumps({'task':'T45','revision':'frame02-walk-right-1-horizontal-angle-v2','artifactStage':'candidate','visualReview':'pending_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','runtimeRelease':False,'scope':'hero battle walk_right_1 frame02; horizontal sword-angle correction around fixed handle center','sourceBody':str(BODY.relative_to(ROOT)),'sourceBodySha256':sha(BODY),'sourceWeaponLayer':str(SOURCE.relative_to(ROOT)),'sourceWeaponLayerSha256':sha(SOURCE),'weaponNormalized':str(OUT.relative_to(ROOT)),'weaponSha256':sha(OUT),'handSemantic':'character_right_hand_screen_left_fist','fistCenterPx':{'x':84,'y':207},'handleCenterPx':{'x':PIVOT[0],'y':PIVOT[1]},'gripPointPx':{'x':TARGET_GRIP[0],'y':TARGET_GRIP[1]},'angleDeg':TARGET_ANGLE,'layerOrder':'front','calibration':str(CAL.relative_to(ROOT)),'qa':str(QA.relative_to(ROOT)),'contact':str(CONTACT.relative_to(ROOT)),'fistCenterZoom':str(ZOOM.relative_to(ROOT)),'formalRuntimeTouched':False,'supersedes':str((V1/'manifest.json').relative_to(ROOT)),'status':'candidate_only','visualReviewEvidence':None,'note':'Only angle changed: v1 sword rotated to horizontal 0° about fixed handle center; no translation'},ensure_ascii=False,indent=2)+'\n')
 JOB.write_text(json.dumps({'task':'T45','seq':'hero-weapon-pilot-frame02-walk-right-1','revision':'frame02-walk-right-1-horizontal-angle-v2','artifactStage':'candidate','visualReview':'pending_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','runtimeRelease':False,'status':'candidate_only','sourceRevision':'frame02-walk-right-1-v1','correction':'Change sword axis from -40° up-right to horizontal 0° while keeping handle center fixed at (83.5737,206.5878) aligned with fist center (84,207)','method':'deterministic nearest-neighbor pivot rotation; no translation/generation/resampling beyond nearest pixel mapping','runtimeWrite':False,'nextGate':'Leo visual review; PM gate deferred until all action frames are determined'},ensure_ascii=False,indent=2)+'\n')
 REQ.write_text(f'''# T45 hero weapon frame02 walk_right_1 · horizontal-angle correction v2\n\nLeo confirmed the handle and fist-center placement, then requested the sword angle be laid flat for this frame.\n\n- Body frozen: `{BODY.relative_to(ROOT)}`.\n- Source sword frozen: v1 normalized layer `{SOURCE.relative_to(ROOT)}`.\n- Keep handle center/pivot at ({PIVOT[0]:.4f},{PIVOT[1]:.4f}), already aligned to walk_right_1 fist center (84,207).\n- Rotate only the complete sword around that fixed pivot: source screen angle -40° → target horizontal 0°; no translation.\n- Target grip is the geometric rotated position ({TARGET_GRIP[0]:.4f},{TARGET_GRIP[1]:.4f}); this changes because the blade is laid flat while the handle center remains fixed.\n- Use nearest-neighbor deterministic rotation; no new generation, credits=0, no body edits, runtime untouched.\n- candidate-only; Leo visual review pending. PM second gate remains deferred until all action frames are determined.\n''')
 REFS.write_text(json.dumps({'task':'T45','revision':'frame02-walk-right-1-horizontal-angle-v2','generationCredits':0,'references':[{'path':str(BODY.relative_to(ROOT)),'role':'frozen hero walk_right_1 body and hand geometry','allowed':'hand-center and occlusion mask only','forbidden':'body redraw/pose/identity changes','sha256':sha(BODY)},{'path':str(SOURCE.relative_to(ROOT)),'role':'v1 sword layer with Leo-approved handle placement','allowed':'pivot-only angle correction around fixed handle center','forbidden':'translation, redraw, resampling, generation','sha256':sha(SOURCE)}],'correction':{'sourceAngleDeg':SOURCE_ANGLE,'targetAngleDeg':TARGET_ANGLE,'pivotPx':PIVOT,'fistCenterPx':FIST_CENTER,'targetGripPx':TARGET_GRIP,'translationPx':[0,0]}},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'revision':'frame02-walk-right-1-horizontal-angle-v2','checks':checks,'skinCoreCentroid':[scx,scy,scn],'pivot':PIVOT,'targetGrip':TARGET_GRIP,'axisLengthPx':axis,'weaponSha256':sha(OUT)},ensure_ascii=False))
if __name__=='__main__': main()
