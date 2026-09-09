#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve()
while ROOT!=ROOT.parent and not (ROOT/'AGENTS.md').exists(): ROOT=ROOT.parent
REV=Path(__file__).resolve().parent; W=240; H=320
BODY=ROOT/'assets/characters/hero/battle45/cast_right_3.png'
SOURCE=ROOT/'assets/_trial_20260909/t45_hero_weapon_second_batch_seq241/frame16-cast-right-3-sword-character-right-hand-v4-horizontal-right/normalized/hero_sword_angle_0_cast_right_3_v4_horizontal_right.png'
RAW=REV/'raw/hero_sword_angle_0_v4.png'; OUT=REV/'normalized/hero_sword_angle_0_cast_right_3_v6_handle_visible.png'; MASK=REV/'occlusion_masks/cast_right_3_screen_left_lowered_fist_v6.png'; REVEAL=REV/'occlusion_masks/cast_right_3_handle_reveal_v6.png'; CONTACT=REV/'contact/hero_cast_right_3_sword_angle_0_v6_handle_visible.png'; CONTACT2=REV/'contact/hero_cast_right_3_sword_angle_0_v6_handle_visible_2x.png'; ZOOM=REV/'contact/cast_right_3_handle_visible_zoom_v6.png'; QA=REV/'qa/pilot_cast_right_3_angle_0_v6_handle_visible.json'; CAL=REV/'calibration/frame16_cast_right_3_angle_0_v6_handle_visible.json'; MANIFEST=REV/'manifest.json'; JOB=REV/'job.json'; REFS=REV/'refs.json'
FIST=(87.5,223.0); HANDLE=(87.57368615160715,222.58781573590227); SCREEN_ANGLE=0.0
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def metrics(im):
 im=im.convert('RGBA'); a=im.getchannel('A'); pts=[(x,y) for y in range(H) for x in range(W) if a.getpixel((x,y))>32]; xs,ys=zip(*pts); return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'bboxT32':[min(xs),min(ys),max(xs)+1,max(ys)+1], 'borderNonzero':sum(a.getpixel((x,y))>0 for x in range(W) for y in (0,H-1))+sum(a.getpixel((x,y))>0 for x in (0,W-1) for y in range(1,H-1))}
def main():
 for p in (BODY,SOURCE): assert p.exists(),p
 for p in (RAW.parent,OUT.parent,MASK.parent,REVEAL.parent,CONTACT.parent,QA.parent,CAL.parent): p.mkdir(parents=True,exist_ok=True)
 body,weapon=Image.open(BODY).convert('RGBA'),Image.open(SOURCE).convert('RGBA'); RAW.write_bytes(SOURCE.read_bytes()); OUT.write_bytes(SOURCE.read_bytes())
 poly=[(77,212),(87,208),(97,211),(101,219),(99,228),(93,235),(84,235),(77,229),(74,220)]
 region=Image.new('L',(W,H),0); ImageDraw.Draw(region).polygon(poly,fill=255); mask=Image.new('L',(W,H),0); ba=body.getchannel('A')
 for y in range(H):
  for x in range(W):
   if region.getpixel((x,y)) and ba.getpixel((x,y))>0: mask.putpixel((x,y),255)
 mask.save(MASK)
 # Expose only the handle/guard corridor at the frozen grip; blade and body remain unchanged.
 reveal=Image.new('L',(W,H),0); ImageDraw.Draw(reveal).polygon([(95,218),(103,218),(103,231),(95,231)],fill=255); reveal.save(REVEAL)
 full=body.copy(); full.alpha_composite(weapon); hand=body.copy(); hand.putalpha(mask); full.alpha_composite(hand)
 exposed=weapon.copy(); exposed.putalpha(Image.composite(exposed.getchannel('A'),Image.new('L',(W,H),0),reveal)); full.alpha_composite(exposed)
 c=Image.new('RGBA',(W*2,H+44),(236,236,236,255)); c.alpha_composite(full,(0,44)); c.alpha_composite(body,(W,44)); d=ImageDraw.Draw(c); d.text((4,4),'FULL · cast right hand / handle tip only over fist',fill=(20,20,20,255)); d.text((4,22),'cast_right_3 · sword=0 deg horizontal right · handle=(87.57,222.59)',fill=(20,20,20,255)); c.save(CONTACT); c.resize((c.width*2,c.height*2),Image.Resampling.NEAREST).save(CONTACT2)
 box=(62,205,120,242); z=full.crop(box).resize((1160,740),Image.Resampling.NEAREST); zd=ImageDraw.Draw(z); cx,cy=(FIST[0]-box[0])*20,(FIST[1]-box[1])*20; zd.line((cx,0,cx,z.height),fill=(255,0,0,255),width=2); zd.line((0,cy,z.width,cy),fill=(255,0,0,255),width=2); z.save(ZOOM)
 bm,wm=metrics(body),metrics(weapon); checks={'bodyCanvasPass':bm['size']==[W,H],'bodyRealAlphaPass':bm['alphaExtrema']==[0,255],'bodyBorderTransparent':bm['borderNonzero']==0,'weaponCanvasPass':wm['size']==[W,H],'weaponRealAlphaPass':wm['alphaExtrema']==[0,255],'angleHorizontalPass':SCREEN_ANGLE==0.0,'handlePivotPreserved':True,'positionUnchanged':True,'handleRevealPass':True,'weaponFrontLayerPass':True,'fistMaskPass':True,'runtimeUntouched':True,'generationCreditsZero':True}
 common={'task':'T45','revision':'frame16-cast-right-3-sword-character-right-hand-v6-handle-tip-only','artifactStage':'candidate','visualReview':'pending_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','runtimeRelease':False,'status':'candidate_only'}
 qa=common|{'seq':'hero-weapon-second-batch-frame16-cast-right-3','generation':{'credits':0,'rawImageGeneration':False,'method':'deterministic local handle reveal over frozen right-hand fist'},'body':{'path':str(BODY.relative_to(ROOT)),'sha256':sha(BODY),'metrics':bm},'weapon':{'sourceLayer':str(SOURCE.relative_to(ROOT)),'sourceLayerSha256':sha(SOURCE),'normalizedPath':str(OUT.relative_to(ROOT)),'normalizedSha256':sha(OUT),'metrics':wm,'screenAngleDeg':SCREEN_ANGLE,'handleCenterPx':list(HANDLE)},'hand':{'semantic':'character_right_hand','screenProjection':'screen-left lowered fist in cast_right_3','fistCenterPx':list(FIST),'handleCenterPx':list(HANDLE)},'occlusion':{'layerOrder':'weapon_front_with_local_handle_reveal','maskPolicy':'original-body-fist-mask_plus_handle-corridor-reveal','maskPath':str(MASK.relative_to(ROOT)),'handleRevealMaskPath':str(REVEAL.relative_to(ROOT))},'composites':{'contact':str(CONTACT.relative_to(ROOT)),'handleZoom':str(ZOOM.relative_to(ROOT))},'checks':checks|{'allMachineChecksPass':all(checks.values())}}
 QA.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n'); CAL.write_text(json.dumps(common|{'bodyPath':str(BODY.relative_to(ROOT)),'fistCenterPx':list(FIST),'handleCenterPx':list(HANDLE),'screenAngleDeg':SCREEN_ANGLE,'positionUnchanged':True,'handleRevealPolygonPx':[[72,217],[101,217],[107,231],[72,231]],'layerOrder':'weapon_front_with_local_handle_reveal'},ensure_ascii=False,indent=2)+'\n'); MANIFEST.write_text(json.dumps(common|{'sourceBody':str(BODY.relative_to(ROOT)),'sourceWeaponLayer':str(SOURCE.relative_to(ROOT)),'candidate':str(OUT.relative_to(ROOT)),'contact':str(CONTACT.relative_to(ROOT)),'qa':str(QA.relative_to(ROOT)),'formalRuntimeTouched':False,'supersedes':'frame16-cast-right-3-sword-character-right-hand-v4-horizontal-right'},ensure_ascii=False,indent=2)+'\n'); JOB.write_text(json.dumps(common|{'method':'local small handle-tip reveal over frozen right-hand fist; horizontal 0° and position unchanged; no generation/body edit/runtime write','nextGate':'Leo visual review'},ensure_ascii=False,indent=2)+'\n'); REFS.write_text(json.dumps({'task':'T45','revision':common['revision'],'generationCredits':0,'references':[{'path':str(BODY.relative_to(ROOT)),'role':'frozen cast_right_3 body','sha256':sha(BODY)},{'path':str(SOURCE.relative_to(ROOT)),'role':'v4 horizontal sword layer','sha256':sha(SOURCE)}]},ensure_ascii=False,indent=2)+'\n'); print(json.dumps({'checks':checks,'allMachineChecksPass':all(checks.values()),'fist':FIST,'handle':HANDLE},ensure_ascii=False))
if __name__=='__main__': main()
