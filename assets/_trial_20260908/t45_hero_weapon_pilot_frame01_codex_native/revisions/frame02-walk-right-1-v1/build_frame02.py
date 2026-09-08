#!/usr/bin/env python3
"""Deterministic hero weapon calibration for battle walk_right_1.

Reuses Leo-selected frame01 v9 transparent sword geometry and moves the complete
layer to the frozen character-right (screen-left) fist center in walk_right_1.
No image generation, rotation, resampling, body edits, or runtime writes.
"""
from __future__ import annotations
import hashlib, json, math
from pathlib import Path
from typing import Any
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve()
while ROOT != ROOT.parent and not (ROOT / "AGENTS.md").exists(): ROOT = ROOT.parent
W,H=240,320
BASE=ROOT/"assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native"
V9=BASE/"revisions/handle-center-half-length-v9"
REV=BASE/"revisions/frame02-walk-right-1-v1"
BODY=ROOT/"assets/characters/hero/battle45/walk_right_1.png"
SOURCE=V9/"normalized/hero_sword_held_rightup_v9.png"
SOURCE_RAW=V9/"raw/hero_sword_held_transparent_source_attempt1.png"
OUT_LAYER=REV/"normalized/hero_sword_held_rightup_walk_right_1_v1.png"
RAW_COPY=REV/"raw/hero_sword_held_transparent_source_attempt1.png"
MASK=REV/"occlusion_masks/hero_walk_right_1_character_right_fist.png"
TRIP=REV/"composites_native/hero_walk_right_1_sword_triptych_v1.png"
TRIP2=REV/"composites_2x/hero_walk_right_1_sword_triptych_v1_2x.png"
CONTACT=REV/"contact/hero_walk_right_1_sword_pilot_v1.png"
CONTACT2=REV/"contact/hero_walk_right_1_sword_pilot_v1_2x.png"
ZOOM=REV/"contact/walk_right_1_fist_center_zoom_v1.png"
QA=REV/"qa/pilot_walk_right_1_v1.json"
CAL=REV/"calibration/frame02_walk_right_1_v1.json"
MANIFEST=REV/"manifest.json"
JOB=REV/"job.json"
REQUEST=REV/"request.md"
REFS=REV/"refs.json"

# v9's validated handle center is (101.5737,205.5878) for fist center (102,206).
# walk_right_1's orange skin core centroid rounds to (84,207); same residual is kept.
SOURCE_GRIP=(113.0,196.0)
SOURCE_HANDLE_CENTER=(101.573696,205.5878)
FIST_CENTER=(84.0,207.0)
TRANSLATION=(-18,1)
TARGET_GRIP=(SOURCE_GRIP[0]+TRANSLATION[0], SOURCE_GRIP[1]+TRANSLATION[1])
TARGET_HANDLE_CENTER=(SOURCE_HANDLE_CENTER[0]+TRANSLATION[0], SOURCE_HANDLE_CENTER[1]+TRANSLATION[1])
ANGLE=-40.0
# Tight polygon around the complete screen-left fist in walk_right_1.
FIST_POLYGON=[(77,198),(84,196),(91,197),(96,201),(98,207),(96,213),(91,216),(84,216),(78,213),(74,208),(74,203)]


def sha(path:Path)->str:
 h=hashlib.sha256(); h.update(path.read_bytes()); return h.hexdigest()

def alpha_pts(im:Image.Image, threshold=32):
 a=im.convert("RGBA").getchannel("A")
 return [(x,y) for y in range(im.height) for x in range(im.width) if a.getpixel((x,y))>threshold]

def metrics(im:Image.Image)->dict[str,Any]:
 im=im.convert("RGBA"); a=im.getchannel("A"); pts=alpha_pts(im)
 if not pts: raise ValueError("empty alpha")
 xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
 l,t,r,b=min(xs),min(ys),max(xs)+1,max(ys)+1
 total=sum(a.getpixel((x,y)) for x,y in pts)
 cx=sum(x*a.getpixel((x,y)) for x,y in pts)/total; cy=sum(y*a.getpixel((x,y)) for x,y in pts)/total
 border=sum(a.getpixel((x,y))>0 for x in range(W) for y in (0,H-1))+sum(a.getpixel((x,y))>0 for y in range(1,H-1) for x in (0,W-1))
 return {"size":[W,H],"mode":"RGBA","alphaExtrema":list(a.getextrema()),"bboxT32":[l,t,r,b],"visualWidth":r-l,"visualHeight":b-t,"alpha32CentroidX":cx,"alpha32CentroidY":cy,"borderNonzero":border}

def skin_centroid(im:Image.Image):
 pts=[]
 for y in range(185,225):
  for x in range(65,110):
   r,g,b,a=im.getpixel((x,y))
   if a>32 and r>170 and 70<g<210 and b<150 and r>g*1.25 and g>b*1.15: pts.append((x,y))
 if not pts: raise ValueError("empty walk_right_1 fist skin core")
 return (sum(x for x,_ in pts)/len(pts),sum(y for _,y in pts)/len(pts),len(pts))

def connected(im):
 rem=set(alpha_pts(im)); comps=[]
 while rem:
  seed=rem.pop(); st=[seed]; c={seed}
  while st:
   x,y=st.pop()
   for n in ((x+1,y),(x-1,y),(x,y+1),(x,y-1),(x+1,y+1),(x-1,y-1),(x+1,y-1),(x-1,y+1)):
    if n in rem: rem.remove(n); c.add(n); st.append(n)
  comps.append(c)
 return comps

def make_mask(body):
 poly=Image.new("L",(W,H),0); ImageDraw.Draw(poly).polygon(FIST_POLYGON,fill=255)
 binary=body.getchannel("A").point(lambda v:255 if v>32 else 0)
 return ImageChops.multiply(poly,binary)

def subtract(weapon,mask):
 out=weapon.copy(); av=weapon.getchannel("A"); mv=mask
 vals=bytes(max(0,a-m) for a,m in zip(av.getdata(),mv.getdata())); out.putalpha(Image.frombytes("L",(W,H),vals)); return out

def triptych(body,weapon,mask):
 full=body.copy(); full.alpha_composite(weapon)
 d=body.copy(); d.alpha_composite(subtract(weapon,mask))
 back=weapon.copy(); back.alpha_composite(body)
 out=Image.new("RGBA",(W*3,H),(232,232,232,255))
 for i,p in enumerate((full,d,back)): out.alpha_composite(p,(W*i,0))
 return out

def contact(body,weapon,mask):
 header=40; out=Image.new("RGBA",(W*3,H+header),(236,236,236,255)); dr=ImageDraw.Draw(out)
 out.alpha_composite(triptych(body,weapon,mask),(0,header))
 for i,label in enumerate(("FULL · character RIGHT hand","D · fist occlusion","BACK comparator")): dr.text((i*W+4,4),label,fill=(20,20,20,255))
 dr.text((4,22),f"walk_right_1 · grip={TARGET_GRIP[0]:.0f},{TARGET_GRIP[1]:.0f} · angle={ANGLE:.1f}° up-right · handle-center@fist=(84,207); shift={TRANSLATION[0]:+d},{TRANSLATION[1]:+d}px",fill=(20,20,20,255))
 return out

def zoom(body,weapon):
 comp=body.copy(); comp.alpha_composite(weapon); box=(60,180,115,230); crop=comp.crop(box).resize((660,600),Image.Resampling.NEAREST)
 dr=ImageDraw.Draw(crop)
 for i in range(56): dr.line((i*12,0,i*12,600),fill=(100,100,100,220),width=1)
 for i in range(51): dr.line((0,i*12,660,i*12),fill=(100,100,100,220),width=1)
 cx=(FIST_CENTER[0]-box[0])*12+6; cy=(FIST_CENTER[1]-box[1])*12+6
 dr.line((cx,cy-20,cx,cy+20),fill=(255,0,0,255),width=4); dr.line((cx-20,cy,cx+20,cy),fill=(255,0,0,255),width=4)
 dr.text((2,2),"handle-center=(84,207)",fill=(255,255,255,255),stroke_width=1,stroke_fill=(255,0,0,255))
 return crop

def handle_pass(im,point):
 x,y=round(point[0]),round(point[1]); r,g,b,a=im.getpixel((x,y)); return a>32 and (r+g+b)>180 and not (r>180 and g>180 and b>180)

def main():
 for p in (BODY,SOURCE,SOURCE_RAW):
  if not p.exists(): raise FileNotFoundError(p)
 body=Image.open(BODY).convert("RGBA"); src=Image.open(SOURCE).convert("RGBA")
 if body.size!=(W,H) or src.size!=(W,H): raise ValueError("body/source must be 240x320")
 RAW_COPY.write_bytes(SOURCE_RAW.read_bytes())
 weapon=Image.new("RGBA",(W,H),(0,0,0,0)); weapon.alpha_composite(src,TRANSLATION); weapon.save(OUT_LAYER)
 mask=make_mask(body); mask.save(MASK)
 tri=triptych(body,weapon,mask); tri.save(TRIP); tri.resize((tri.width*2,tri.height*2),Image.Resampling.NEAREST).save(TRIP2)
 ct=contact(body,weapon,mask); ct.save(CONTACT); ct.resize((ct.width*2,ct.height*2),Image.Resampling.NEAREST).save(CONTACT2); zoom(body,weapon).save(ZOOM)
 bm,wm=metrics(body),metrics(weapon); scx,scy,scn=skin_centroid(body)
 maskpx=sum(v>0 for v in mask.getdata()); wpx=sum(v>32 for v in weapon.getchannel("A").getdata()); dwp=subtract(weapon,mask); dpx=sum(v>32 for v in dwp.getchannel("A").getdata()); before=sum(a>32 and m>0 for a,m in zip(weapon.getchannel("A").getdata(),mask.getdata())); after=sum(a>32 and m>0 for a,m in zip(dwp.getchannel("A").getdata(),mask.getdata()))
 pts=alpha_pts(weapon); ux,uy=math.cos(math.radians(ANGLE)),math.sin(math.radians(ANGLE)); ext=[(x-TARGET_GRIP[0])*ux+(y-TARGET_GRIP[1])*uy for x,y in pts]; lo,hi=min(ext),max(ext); axis=hi-lo
 comps=connected(weapon)
 checks={"bodyCanvasPass":bm["size"]==[W,H] and bm["mode"]=="RGBA","bodyFeetPass":bm["bboxT32"][3]==300,"bodyBorderTransparent":bm["borderNonzero"]==0,"weaponCanvasPass":wm["size"]==[W,H] and wm["mode"]=="RGBA","weaponRealAlphaPass":wm["alphaExtrema"]==[0,255],"weaponSingleConnectedSilhouette":len(comps)==1,"weaponLengthBandPass":110<=axis<=140,"weaponAngleCanonicalPass":abs(ANGLE-(-40))<1e-3,"characterRightHandScreenLeftFist":TARGET_GRIP[0]<140,"gripRecorded":True,"fistOcclusionRemovesOverlap":after==0 and dpx<wpx,"nativeTriptychSizePass":list(tri.size)==[W*3,H],"twoXTriptychSizePass":list(Image.open(TRIP2).size)==[W*6,H*2],"skinCoreRoundsToFistCenter":(round(scx),round(scy))==(84,207),"handleCenterTargetPixelPass":handle_pass(weapon,TARGET_HANDLE_CENTER),"handleCenterFacesFistCenter":math.hypot(TARGET_HANDLE_CENTER[0]-FIST_CENTER[0],TARGET_HANDLE_CENTER[1]-FIST_CENTER[1])<=1.0,"runtimeUntouched":True,"generationCreditsZero":True}
 qa={"task":"T45","seq":"hero-weapon-pilot-frame02-walk-right-1","revision":"frame02-walk-right-1-v1","generatedAt":"2026-09-08","artifactStage":"candidate","visualReview":"pending_Leo","specGate":"pending_pm_scan","integrationGate":"not_handed_off","runtimeRelease":False,"status":"candidate_only","generation":{"provider":None,"model":None,"credits":0,"method":"deterministic reuse of Leo-selected frame01 v9 sword + integer translation","rawImageGeneration":False},"body":{"path":str(BODY.relative_to(ROOT)),"sha256":sha(BODY),"metrics":bm},"weapon":{"sourceLayer":str(SOURCE.relative_to(ROOT)),"sourceLayerSha256":sha(SOURCE),"normalizedPath":str(OUT_LAYER.relative_to(ROOT)),"normalizedSha256":sha(OUT_LAYER),"metrics":wm,"axisDefinition":"grip toward tip; 0°=screen-right, +Y down, clockwise-positive","axisExtentsFromTargetGrip":[lo,hi],"axisLengthPx":axis,"targetAngleDeg":ANGLE,"handleLengthBandPx":[25,35],"bladeLengthBandPx":[85,105]},"hand":{"semantic":"character_right_hand","screenProjection":"screen-left fist in walk_right_1","gripPoint":{"x":TARGET_GRIP[0],"y":TARGET_GRIP[1]},"fistCenterPx":{"x":84,"y":207},"skinCoreCentroidPx":{"x":scx,"y":scy,"pixels":scn},"handleCenterTargetPx":{"x":TARGET_HANDLE_CENTER[0],"y":TARGET_HANDLE_CENTER[1]},"distanceToFistCenterPx":math.hypot(TARGET_HANDLE_CENTER[0]-84,TARGET_HANDLE_CENTER[1]-207)},"occlusion":{"maskPath":str(MASK.relative_to(ROOT)),"maskSha256":sha(MASK),"maskPixels":maskpx,"weaponPixelsBefore":wpx,"weaponPixelsAfter":dpx,"weaponInFistBefore":before,"weaponInFistAfter":after,"semantics":"original body alpha under tight character-right-fist polygon; no painted replacement pixels"},"transform":{"sourceRevision":"frame01 handle-center-half-length-v9","sourceGrip":SOURCE_GRIP,"targetGrip":TARGET_GRIP,"translationPx":list(TRANSLATION),"rotationAppliedDeg":0.0,"resampling":"none; deterministic integer translation"},"composites":{"native":str(TRIP.relative_to(ROOT)),"nativeSha256":sha(TRIP),"2x":str(TRIP2.relative_to(ROOT)),"2xSha256":sha(TRIP2),"contact":str(CONTACT.relative_to(ROOT)),"contactSha256":sha(CONTACT),"fistCenterZoom":str(ZOOM.relative_to(ROOT)),"fistCenterZoomSha256":sha(ZOOM)},"checks":checks|{"allMachineChecksPass":all(checks.values())}}
 QA.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+"\n")
 cal={"task":"T45","revision":"hero-weapon-pilot-frame02-walk-right-1-v1","trialOnly":True,"frame":"walk_right_1.png","visualReview":"pending_Leo","bodyPath":str(BODY.relative_to(ROOT)),"bodySha256":sha(BODY),"weaponPath":str(OUT_LAYER.relative_to(ROOT)),"weaponSha256":sha(OUT_LAYER),"handSemantic":"character_right_hand","screenProjection":"screen-left fist","fistCenterPx":{"x":84,"y":207},"skinCoreCentroidPx":{"x":scx,"y":scy,"pixels":scn},"handleCenterPx":{"target":{"x":TARGET_HANDLE_CENTER[0],"y":TARGET_HANDLE_CENTER[1]},"distanceToFistCenterPx":math.hypot(TARGET_HANDLE_CENTER[0]-84,TARGET_HANDLE_CENTER[1]-207)},"gripPoint":{"x":TARGET_GRIP[0],"y":TARGET_GRIP[1]},"angleDeg":ANGLE,"angleDefinition":"blade axis from grip toward tip; 0°=screen-right, +Y down, clockwise-positive","layerOrder":"front","occlusionRef":{"roiPolygon":FIST_POLYGON,"maskPath":str(MASK.relative_to(ROOT)),"maskSha256":sha(MASK)},"sourceRevision":str((V9/"manifest.json").relative_to(ROOT)),"supersedes":"hero-weapon-pilot-frame01-handle-center-half-length-v9","status":"candidate_only","runtimeRelease":False}
 CAL.write_text(json.dumps(cal,ensure_ascii=False,indent=2)+"\n")
 MANIFEST.write_text(json.dumps({"task":"T45","revision":"hero-weapon-pilot-frame02-walk-right-1-v1","artifactStage":"candidate","visualReview":"pending_Leo","specGate":"pending_pm_scan","integrationGate":"not_handed_off","runtimeRelease":False,"scope":"hero battle walk_right_1 second frame; deterministic reuse of selected frame01 sword with hand-center translation","sourceBody":str(BODY.relative_to(ROOT)),"sourceBodySha256":sha(BODY),"sourceWeaponLayer":str(SOURCE.relative_to(ROOT)),"sourceWeaponLayerSha256":sha(SOURCE),"weaponNormalized":str(OUT_LAYER.relative_to(ROOT)),"weaponSha256":sha(OUT_LAYER),"handSemantic":"character_right_hand_screen_left_fist","gripPoint":{"x":TARGET_GRIP[0],"y":TARGET_GRIP[1]},"angleDeg":ANGLE,"layerOrder":"front","calibration":str(CAL.relative_to(ROOT)),"qa":str(QA.relative_to(ROOT)),"contact":str(CONTACT.relative_to(ROOT)),"fistCenterZoom":str(ZOOM.relative_to(ROOT)),"formalRuntimeTouched":False,"status":"candidate_only","visualReviewEvidence":None,"note":"v9 sword geometry and -40° angle frozen; integer shift (-18,+1) aligns handle center with walk_right_1 fist center (84,207)"},ensure_ascii=False,indent=2)+"\n")
 JOB.write_text(json.dumps({"task":"T45","seq":"hero-weapon-pilot-frame02-walk-right-1","revision":"frame02-walk-right-1-v1","artifactStage":"candidate","visualReview":"pending_Leo","specGate":"pending_pm_scan","integrationGate":"not_handed_off","runtimeRelease":False,"status":"candidate_only","sourceRevision":"frame01 handle-center-half-length-v9","method":"deterministic reuse + integer translation (-18,+1); no generation/rotation/resampling; body frozen","runtimeWrite":False,"nextGate":"Leo visual review before PM second gate"},ensure_ascii=False,indent=2)+"\n")
 REQUEST.write_text(f"""# T45 hero weapon frame02 · walk_right_1 v1\n\n本帧按 seq=186 主角武器合成逐帧顺序，在已通过 Leo 目验的 frame01 v9 后继续制作 `walk_right_1`。\n\n- 身体冻结：`{BODY.relative_to(ROOT)}`，仅读取既有空手帧。\n- 武器源冻结：frame01 v9 透明剑层 `{SOURCE.relative_to(ROOT)}`；保留 `-40°` 右上轴线、剑身像素和 `front` 层级。\n- `walk_right_1` 角色自身右手投影为画面左侧拳；橙色皮肤核心全像素质心=({scx:.4f},{scy:.4f})，拳心取整=(84,207)。\n- v9 剑层柄中心从 ({SOURCE_HANDLE_CENTER[0]:.4f},{SOURCE_HANDLE_CENTER[1]:.4f}) 平移 `(-18,+1)` 后为 ({TARGET_HANDLE_CENTER[0]:.4f},{TARGET_HANDLE_CENTER[1]:.4f})，距目标拳心 {math.hypot(TARGET_HANDLE_CENTER[0]-84,TARGET_HANDLE_CENTER[1]-207):.3f}px；握点从 (113,196)→({TARGET_GRIP[0]:.0f},{TARGET_GRIP[1]:.0f})。\n- 只做确定性整数平移，不重绘、不旋转、不重新生图、不修改身体；generation credits=0。\n- 拳部遮挡只取该帧原身体 alpha 的紧角色右拳 ROI，不绘制替代手。\n- candidate-only，正式 runtime 未写入，等待 Leo 视觉门；PM 第二道规格门按当前安排在动作帧全部确定后统一进行。\n""")
 REFS.write_text(json.dumps({"task":"T45","revision":"frame02-walk-right-1-v1","generationCredits":0,"references":[{"path":str(BODY.relative_to(ROOT)),"role":"frozen hero walk_right_1 body and hand geometry","allowed":"hand-center measurement and body alpha occlusion only","forbidden":"body redraw/identity/pose changes","sha256":sha(BODY)},{"path":str(SOURCE.relative_to(ROOT)),"role":"Leo-selected frame01 v9 transparent sword geometry","allowed":"integer translation only; preserve -40° axis and all sword pixels","forbidden":"redraw/rotation/resampling/new generation","sha256":sha(SOURCE)}],"correction":{"frame":"walk_right_1","hand":"character_right_hand_screen_left_fist","fistCenterPx":FIST_CENTER,"sourceHandleCenterPx":SOURCE_HANDLE_CENTER,"targetHandleCenterPx":TARGET_HANDLE_CENTER,"translationPx":list(TRANSLATION),"angleDeg":ANGLE}},ensure_ascii=False,indent=2)+"\n")
 print(json.dumps({"revision":"frame02-walk-right-1-v1","checks":checks,"skinCoreCentroid":[scx,scy,scn],"fistCenter":FIST_CENTER,"targetGrip":TARGET_GRIP,"targetHandleCenter":TARGET_HANDLE_CENTER,"axisLengthPx":axis,"weaponSha256":sha(OUT_LAYER)},ensure_ascii=False))

if __name__=='__main__': main()
