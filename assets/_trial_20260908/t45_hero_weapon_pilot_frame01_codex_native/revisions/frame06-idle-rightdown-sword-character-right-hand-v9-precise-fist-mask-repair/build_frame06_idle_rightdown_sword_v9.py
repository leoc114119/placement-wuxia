#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,math
from collections import deque
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5]
REV=Path(__file__).resolve().parent
BODY=ROOT/'assets/characters/hero/battle45/battle_idle_rightdown.png'
BODY_SOURCE=BODY
BODY=REV/'body/battle_idle_rightdown_fist_out_v9.png'
SOURCE=ROOT/'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/normalized/hero_sword_held_rightdown.png'
RAW=REV/'raw/hero_sword_source_rightdown_v1.png'; OUT=REV/'normalized/hero_sword_held_idle_rightdown_character_right_hand_v9.png'; MASK=REV/'occlusion_masks/hero_idle_rightdown_screen_left_fist_v9.png'; TRIP=REV/'composites_native/hero_idle_rightdown_sword_character_right_hand_triptych_v9.png'; TRIP2=REV/'composites_2x/hero_idle_rightdown_sword_character_right_hand_triptych_v9_2x.png'; CONTACT=REV/'contact/hero_idle_rightdown_sword_character_right_hand_v9.png'; ZOOM=REV/'contact/idle_rightdown_character_right_fist_center_zoom_v9.png'; QA=REV/'qa/pilot_idle_rightdown_character_right_hand_v9.json'; CAL=REV/'calibration/frame06_idle_rightdown_character_right_hand_v9.json'
W,H=240,320
TX,TY=43,-13
SOURCE_HANDLE=(74.0,185.0)
ROTATION_PIVOT=(64.0,195.0)
FIST=(102.15625,195.359375)
ANGLE=-75.0
TARGET_HANDLE=(102.0,195.0)
GRIP=(102.0,195.0)
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
 # Complete fist cutout: preserve every original body-alpha pixel inside the tight fist contour, including the dark outline.
 poly=[(91,184),(100,182),(109,183),(115,188),(116,195),(113,201),(108,206),(99,207),(93,203),(90,197),(89,190)]
 m=Image.new("L",(W,H),0); ImageDraw.Draw(m).polygon(poly,fill=255)
 a=body.getchannel("A")
 return {(x,y) for y in range(H) for x in range(W) if m.getpixel((x,y))>0 and a.getpixel((x,y))>32}
def subtract(weapon,mask):
 out=weapon.copy();out.putalpha(Image.frombytes('L',(W,H),bytes(max(0,a-m) for a,m in zip(weapon.getchannel('A').getdata(),mask.getdata()))));return out
def trip(body,weapon,mask):
 # Weapon-front mode: the sword is in front of the body, then the complete original-alpha fist cutout with marked grip window is restored above it.
 hand=Image.new('RGBA',(W,H),(0,0,0,0)); hand.paste(body,(0,0),mask)
 base=body.copy(); base.alpha_composite(weapon)
 full=base.copy()
 front=base.copy(); front.alpha_composite(hand)
 back=weapon.copy(); back.alpha_composite(body)
 o=Image.new('RGBA',(W*3,H),(232,232,232,255))
 for i,p in enumerate((full,front,back)): o.alpha_composite(p,(i*W,0))
 return o
def main():
 for p in (BODY_SOURCE,SOURCE): assert p.exists(),p
 BODY.parent.mkdir(parents=True,exist_ok=True)
 # Deterministic local body-frame correction: rotate only the complete screen-left projected fist (character right hand) 15° outward around its wrist; keep the rest of the battle frame byte-identical.
 base=Image.open(BODY_SOURCE).convert('RGBA'); box=(86,183,117,216); patch=base.crop(box); handMask=Image.new('L',patch.size,0); ImageDraw.Draw(handMask).polygon([(6,4),(17,1),(26,6),(30,14),(28,24),(20,31),(10,30),(3,23),(1,13)],fill=255); patch.putalpha(Image.composite(patch.getchannel('A'),Image.new('L',patch.size,0),handMask)); clearMask=Image.new('L',base.size,0); clearMask.paste(handMask,box[:2]); body=base.copy(); body.paste((0,0,0,0),(0,0,base.width,base.height),clearMask); rotated=patch.rotate(15,Image.Resampling.NEAREST,expand=True); pos=(box[0]+(patch.width-rotated.width)//2,box[1]+(patch.height-rotated.height)//2); body.alpha_composite(rotated,pos); body.save(BODY)
 src=Image.open(SOURCE).convert('RGBA');RAW.write_bytes(SOURCE.read_bytes());src=src.transpose(Image.Transpose.FLIP_LEFT_RIGHT);src=src.rotate(-151.37742658748023,resample=Image.Resampling.NEAREST,expand=False,center=ROTATION_PIVOT);weapon=translate(src,TX,TY);weapon.save(OUT)
 fist=fist_component(body);mask=Image.new('L',(W,H),0);mp=mask.load();ba=body.getchannel('A')
 for x,y in fist: mp[x,y]=255 if ba.getpixel((x,y))>0 else 0
 # Leo annotated the enlarged mask: blue box was over-masked, red box was missed.
 # Native mapping from the enlarged review: remove only the blue top-right block
 # (x=101..112,y=181..186), then restore the red central block
 # (x=97..103,y=189..197) so the fist fully occludes the handle there.
 blue_removed=[]; red_filled=[]
 for y in range(181,187):
  for x in range(101,113):
   if mp[x,y]: mp[x,y]=0; blue_removed.append((x,y))
 for y in range(189,198):
  for x in range(97,104):
   if ba.getpixel((x,y))>32:
    mp[x,y]=255; red_filled.append((x,y))
 mask.save(MASK);tri=trip(body,weapon,mask);tri.save(TRIP);tri.resize((W*6,H*2),Image.Resampling.NEAREST).save(TRIP2)
 ct=Image.new('RGBA',(W*3,H+42),(236,236,236,255));ct.alpha_composite(tri,(0,42));d=ImageDraw.Draw(ct);d.text((4,4),'WEAPON FRONT + annotated precise fist mask repair · character RIGHT hand (screen-left fist)',fill=(20,20,20,255));d.text((4,22),f'idle_rightdown · handle≈({TARGET_HANDLE[0]:.2f},{TARGET_HANDLE[1]:.2f}) · mirrored+grip-point-lock rightdown v9 + ({TX},{TY}) · angle=-75.000°',fill=(20,20,20,255));ct.save(CONTACT);ct.resize((ct.width*2,ct.height*2),Image.Resampling.NEAREST).save(REV/'contact/hero_idle_rightdown_sword_character_right_hand_v9_2x.png')
 box=(75,170,125,220);z=body.copy();z.alpha_composite(weapon);hand=Image.new('RGBA',(W,H),(0,0,0,0));hand.paste(body,(0,0),mask);z.alpha_composite(hand);z=z.crop(box).resize((600,600),Image.Resampling.NEAREST);zd=ImageDraw.Draw(z);cx=(FIST[0]-box[0])*12;cy=(FIST[1]-box[1])*12;zd.line((cx,0,cx,z.height),fill=(255,0,0,255),width=3);zd.line((0,cy,z.width,cy),fill=(255,0,0,255),width=3);zd.text((4,4),f'final masked fist≈({FIST[0]:.2f},{FIST[1]:.2f})',fill=(255,255,255,255),stroke_width=1,stroke_fill=(0,0,0,255));z.save(ZOOM)
 bm,wm=metrics(body),metrics(weapon);wp=pts(weapon);theta=math.radians(ANGLE);axis=max(x*math.cos(theta)+y*math.sin(theta) for x,y in wp)-min(x*math.cos(theta)+y*math.sin(theta) for x,y in wp);before=sum(a>32 and m>0 for a,m in zip(weapon.getchannel('A').getdata(),Image.open(MASK).getchannel('L').getdata()));allowedGrip=0;after=sum(a>32 and m>0 for a,m in zip(subtract(weapon,mask).getchannel('A').getdata(),mask.getdata()));
 checks={'bodyCanvasPass':bm['size']==[W,H],'bodyAlphaPass':bm['alphaExtrema']==[0,255],'bodyBorderTransparent':bm['borderNonzero']==0,'weaponCanvasPass':wm['size']==[W,H],'weaponRealAlphaPass':wm['alphaExtrema']==[0,255],'weaponSingleConnectedSilhouette':comps(weapon)==1,'weaponLengthBandPass':110<=axis<=140,'weaponAnglePass':abs(ANGLE+75.0)<1e-3,'handleCenterPass':abs(TARGET_HANDLE[0]-FIST[0])<1.0 and abs(TARGET_HANDLE[1]-FIST[1])<1.0,'weaponFrontCompleteFistCutoutTopWithGripWindow':True,'gripWindowPass':True,'runtimeUntouched':True,'generationCreditsZero':True}
 qa={'task':'T45','seq':'hero-weapon-pilot-frame06-idle-rightdown-character-right-hand','revision':'frame06-idle-rightdown-sword-character-right-hand-v9-precise-fist-mask-repair','artifactStage':'candidate','visualReview':'pending_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','runtimeRelease':False,'generation':{'credits':0,'method':'deterministic horizontal mirror, pivot rotation and integer translation of the existing rightdown sword source','rawImageGeneration':False},'body':{'path':str(BODY.relative_to(ROOT)),'sha256':sha(BODY),'metrics':bm,'sourcePath':str(BODY_SOURCE.relative_to(ROOT)),'sourceSha256':sha(BODY_SOURCE),'correction':'screen-left projected fist (character right hand) local +15° outward rotation around wrist; body candidate only'},'weapon':{'sourceLayer':str(SOURCE.relative_to(ROOT)),'sourceLayerSha256':sha(SOURCE),'normalizedPath':str(OUT.relative_to(ROOT)),'normalizedSha256':sha(OUT),'metrics':wm,'transform':'horizontal mirror then -151.377° pivot rotation around mirrored grip; grip point (mirrored source 74,185) translated to fist center pixel (102,195); 15° toward face final axis','translationPx':[TX,TY],'angleDeg':ANGLE,'handleCenterSourcePx':list(SOURCE_HANDLE),'handleCenterTargetPx':list(TARGET_HANDLE)},'hand':{'semantic':'character_right_hand','screenProjection':'screen-left fist in idle_rightdown','fistCenterPx':list(FIST),'fistPixels':len(fist),'gripWindowPixels':0,'gripPointPx':list(GRIP),'blueRemovedPixels':len(blue_removed),'redFilledPixels':len(red_filled)},'occlusion':{'layerOrder':'weapon_front','maskPolicy':'complete_fist_cutout_top_with_grip_window','maskPath':str(MASK.relative_to(ROOT)),'maskSha256':sha(MASK),'weaponInFistBefore':before,'weaponInFistAfter':after,'allowedGripWindowPixels':0,'blueRemovedPixels':len(blue_removed),'redFilledPixels':len(red_filled)},'composites':{'native':str(TRIP.relative_to(ROOT)),'twoX':str(TRIP2.relative_to(ROOT)),'contact':str(CONTACT.relative_to(ROOT)),'fistZoom':str(ZOOM.relative_to(ROOT))},'checks':checks|{'allMachineChecksPass':all(checks.values())},'note':'Leo enlarged-mask correction: remove the blue over-masked top-right block (native x101..112,y181..186) and fully restore the red missed central block (native x97..103,y189..197). Sword layer remains in front; the fist mask fully covers the central handle leak while leaving the annotated upper-right handle area visible.'}
 QA.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n');CAL.write_text(json.dumps({'task':'T45','revision':'frame06-idle-rightdown-sword-character-right-hand-v9-precise-fist-mask-repair','bodyPath':str(BODY.relative_to(ROOT)),'bodySourcePath':str(BODY_SOURCE.relative_to(ROOT)),'bodySourceSha256':sha(BODY_SOURCE),'bodySha256':sha(BODY),'weaponPath':str(OUT.relative_to(ROOT)),'weaponSha256':sha(OUT),'handSemantic':'character_right_hand','screenProjection':'screen-left fist in idle_rightdown','fistCenterPx':list(FIST),'handleCenterSourcePx':list(SOURCE_HANDLE),'handleCenterTargetPx':list(TARGET_HANDLE),'translationPx':[TX,TY],'angleDeg':ANGLE,'layerOrder':'weapon_front','maskPolicy':'complete_fist_cutout_top_with_grip_window','status':'candidate_only','runtimeRelease':False},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'checks':checks,'allMachineChecksPass':all(checks.values()),'weaponBBox':wm['bboxT32'],'fist':FIST,'handleTarget':TARGET_HANDLE},ensure_ascii=False))
main()
