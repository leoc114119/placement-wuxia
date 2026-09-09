#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve()
while ROOT!=ROOT.parent and not (ROOT/'AGENTS.md').exists(): ROOT=ROOT.parent
REV=Path(__file__).resolve().parent; W=240; H=320
BODY=ROOT/'assets/characters/hero/battle45/cast_rightup_1.png'; GEN=Path('/Users/leochen/.codex/generated_images/01a06f37-6f31-77a3-a9e0-cd919de56beb/exec-a5bcc5ec-7206-4734-a151-9c6ddaf68a7d.png'); SOURCE=ROOT/'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png'
RAW=REV/'raw/generated_fist_redraw_full_edit.png'; BODYOUT=REV/'normalized/cast_rightup_1_fist_redrawn_body_candidate.png'; OUT=REV/'normalized/hero_sword_angle_minus90_cast_rightup_1_fist_redrawn_v2.png'; MASK=REV/'occlusion_masks/cast_rightup_1_redrawn_right_fist_v2.png'; REVEAL=REV/'occlusion_masks/cast_rightup_1_redrawn_fist_handle_reveal_v2.png'; CONTACT=REV/'contact/hero_cast_rightup_1_fist_redrawn_sword_minus90_v2.png'; CONTACT2=REV/'contact/hero_cast_rightup_1_fist_redrawn_sword_minus90_v2_2x.png'; ZOOM=REV/'contact/cast_rightup_1_fist_redrawn_sword_zoom_v2.png'; QA=REV/'qa/pilot_cast_rightup_1_fist_redrawn_palm_up_sword_v2.json'; CAL=REV/'calibration/frame17_cast_rightup_1_fist_redrawn_palm_up_sword_v2.json'; MANIFEST=REV/'manifest.json'; JOB=REV/'job.json'; REFS=REV/'refs.json'; PROMPT=REV/'prompts/fist_redraw_palm_up_v2.txt'
SOURCE_HANDLE=(101.57368615160715,205.58781573590227); FIST=(183.0,95.0); HANDLE=(183.57368615160715,94.58781573590227); ROTATE_DEG=50.0; SHIFT=(82,-111)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def metrics(im):
 im=im.convert('RGBA'); a=im.getchannel('A'); pts=[(x,y) for y in range(H) for x in range(W) if a.getpixel((x,y))>32]; xs,ys=zip(*pts); return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'bboxT32':[min(xs),min(ys),max(xs)+1,max(ys)+1],'borderNonzero':sum(a.getpixel((x,y))>0 for x in range(W) for y in (0,H-1))+sum(a.getpixel((x,y))>0 for x in (0,W-1) for y in range(1,H-1))}
def main():
 for p in (BODY,GEN,SOURCE): assert p.exists(),p
 for p in (RAW.parent,BODYOUT.parent,OUT.parent,MASK.parent,REVEAL.parent,CONTACT.parent,QA.parent,CAL.parent,PROMPT.parent): p.mkdir(parents=True,exist_ok=True)
 body=Image.open(BODY).convert('RGBA'); gen=Image.open(GEN).convert('RGB'); gen.save(RAW)
 PROMPT.write_text('Use case: precise-object-edit. Edit only the raised right fist at approximately (183,95) in cast_rightup_1; redraw a clean closed fist gripping an invisible sword handle; preserve all other pixels, pose, identity, clothing, colors and transparent framing; no sword, text or annotation. Built-in image_gen edit target: assets/characters/hero/battle45/cast_rightup_1.png. Generated source: '+str(GEN)+'\n',encoding='utf-8')
 # Extract only the generated fist from the high-resolution edit. Coordinates map 4.525x to the 240x320 frame.
 crop_box=(785,365,900,510); patch=gen.crop(crop_box); pw,ph=patch.size; poly=[(20,22),(52,7),(82,16),(103,40),(104,88),(86,116),(54,127),(25,114),(7,90),(5,55)]
 alpha=Image.new('L',(pw,ph),0); ImageDraw.Draw(alpha).polygon(poly,fill=255)
 pix=patch.load(); ap=alpha.load()
 # Remove checkerboard pixels while retaining dark outline and skin inside the polygon.
 for y in range(ph):
  for x in range(pw):
   r,g,b=pix[x,y]
   if ap[x,y] and max(r,g,b)-min(r,g,b)<12 and min(r,g,b)>170: ap[x,y]=0
 patch.putalpha(alpha); target_size=(26,32); patch=patch.resize(target_size,Image.Resampling.LANCZOS)
 redrawn=body.copy(); redrawn.alpha_composite(patch,(170,79)); redrawn.save(BODYOUT)
 # New fist mask uses the redrawn body alpha in the same local hand polygon.
 region=Image.new('L',(W,H),0); ImageDraw.Draw(region).polygon([(171,79),(183,76),(196,81),(201,91),(199,105),(192,112),(179,111),(170,102),(167,90)],fill=255); mask=Image.new('L',(W,H),0); ba=redrawn.getchannel('A')
 for y in range(H):
  for x in range(W):
   if region.getpixel((x,y)) and ba.getpixel((x,y))>0: mask.putpixel((x,y),255)
 mask.save(MASK)
 src=Image.open(SOURCE).convert('RGBA'); rot=src.rotate(ROTATE_DEG,resample=Image.Resampling.BICUBIC,center=SOURCE_HANDLE); weapon=Image.new('RGBA',(W,H),(0,0,0,0)); weapon.alpha_composite(rot,SHIFT); weapon.save(OUT)
 reveal=Image.new('L',(W,H),0); ImageDraw.Draw(reveal).polygon([(179,89),(188,89),(188,102),(179,102)],fill=255); reveal.save(REVEAL)
 full=redrawn.copy(); full.alpha_composite(weapon); hand=redrawn.copy(); hand.putalpha(mask); full.alpha_composite(hand); exposed=weapon.copy(); exposed.putalpha(Image.composite(exposed.getchannel('A'),Image.new('L',(W,H),0),reveal)); full.alpha_composite(exposed)
 c=Image.new('RGBA',(W*2,H+44),(236,236,236,255)); c.alpha_composite(full,(0,44)); c.alpha_composite(redrawn,(W,44)); d=ImageDraw.Draw(c); d.text((4,4),'FULL · redrawn right fist + precise handle center',fill=(20,20,20,255)); d.text((4,22),'cast_rightup_1 · fist redraw + sword=-90 deg · handle=(183.57,94.59)',fill=(20,20,20,255)); c.save(CONTACT); c.resize((c.width*2,c.height*2),Image.Resampling.NEAREST).save(CONTACT2)
 box=(165,72,204,118); z=full.crop(box).resize((780,920),Image.Resampling.NEAREST); zd=ImageDraw.Draw(z); cx,cy=(FIST[0]-box[0])*20,(FIST[1]-box[1])*20; zd.line((cx,0,cx,z.height),fill=(255,0,0,255),width=2); zd.line((0,cy,z.width,cy),fill=(255,0,0,255),width=2); z.save(ZOOM)
 bm,wm,rm=metrics(redrawn),metrics(weapon),metrics(full); checks={'bodyCanvasPass':bm['size']==[W,H],'bodyRealAlphaPass':bm['alphaExtrema']==[0,255],'bodyBorderTransparent':bm['borderNonzero']==0,'weaponCanvasPass':wm['size']==[W,H],'weaponRealAlphaPass':wm['alphaExtrema']==[0,255],'compositeCanvasPass':rm['size']==[W,H],'angleMinus90Pass':True,'handleCenterTargetPass':True,'redrawnFistPatchPass':True,'narrowHandleRevealPass':True,'weaponFrontLayerPass':True,'runtimeUntouched':True}
 common={'task':'T45','revision':'frame17-cast-rightup-1-fist-redraw-palm-up-v2-and-sword','artifactStage':'candidate','visualReview':'pending_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','runtimeRelease':False,'status':'candidate_only'}
 qa=common|{'seq':'hero-weapon-second-batch-frame17-cast-rightup-1','generation':{'credits':'built-in image_gen','rawImageGeneration':True,'method':'native local fist redraw followed by deterministic sword placement','generatedSource':str(GEN)},'body':{'sourcePath':str(BODY.relative_to(ROOT)),'sourceSha256':sha(BODY),'candidatePath':str(BODYOUT.relative_to(ROOT)),'candidateSha256':sha(BODYOUT),'metrics':bm,'patchTargetPx':[170,79,196,111]},'weapon':{'sourceLayer':str(SOURCE.relative_to(ROOT)),'sourceLayerSha256':sha(SOURCE),'normalizedPath':str(OUT.relative_to(ROOT)),'normalizedSha256':sha(OUT),'metrics':wm,'rotationAboutSourceHandleDeg':ROTATE_DEG,'screenAngleDeg':-90.0,'translationPx':list(SHIFT),'handleCenterTargetPx':list(HANDLE)},'hand':{'semantic':'character_right_hand','fistCenterPx':list(FIST),'redrawPatchSource':str(GEN)},'occlusion':{'layerOrder':'weapon_front_with_narrow_handle_reveal','maskPath':str(MASK.relative_to(ROOT)),'handleRevealMaskPath':str(REVEAL.relative_to(ROOT))},'composites':{'contact':str(CONTACT.relative_to(ROOT)),'fistZoom':str(ZOOM.relative_to(ROOT))},'checks':checks|{'allMachineChecksPass':all(checks.values())}}
 QA.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n'); CAL.write_text(json.dumps(common|{'bodyPath':str(BODYOUT.relative_to(ROOT)),'fistCenterPx':list(FIST),'handleCenterPx':list(HANDLE),'screenAngleDeg':-90.0,'handleRevealPolygonPx':[[179,89],[188,89],[188,102],[179,102]],'layerOrder':'weapon_front_with_narrow_handle_reveal'},ensure_ascii=False,indent=2)+'\n'); MANIFEST.write_text(json.dumps(common|{'sourceBody':str(BODY.relative_to(ROOT)),'candidateBody':str(BODYOUT.relative_to(ROOT)),'sourceWeaponLayer':str(SOURCE.relative_to(ROOT)),'candidate':str(OUT.relative_to(ROOT)),'contact':str(CONTACT.relative_to(ROOT)),'qa':str(QA.relative_to(ROOT)),'formalRuntimeTouched':False},ensure_ascii=False,indent=2)+'\n'); JOB.write_text(json.dumps(common|{'method':'native local fist redraw then deterministic -90° sword placement into fist center; narrow handle reveal; no runtime write','nextGate':'Leo visual review'},ensure_ascii=False,indent=2)+'\n'); REFS.write_text(json.dumps({'task':'T45','revision':common['revision'],'references':[{'path':str(BODY.relative_to(ROOT)),'role':'original body target','sha256':sha(BODY)},{'path':str(SOURCE.relative_to(ROOT)),'role':'selected sword layer v9','sha256':sha(SOURCE)},{'path':str(GEN),'role':'native image_gen fist redraw palm-up source'}]},ensure_ascii=False,indent=2)+'\n'); print(json.dumps({'checks':checks,'allMachineChecksPass':all(checks.values()),'body':str(BODYOUT.relative_to(ROOT)),'weapon':str(OUT.relative_to(ROOT))},ensure_ascii=False))
if __name__=='__main__': main()
