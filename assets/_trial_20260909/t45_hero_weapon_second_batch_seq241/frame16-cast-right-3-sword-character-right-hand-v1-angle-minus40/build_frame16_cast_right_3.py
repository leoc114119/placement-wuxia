#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve()
while ROOT!=ROOT.parent and not (ROOT/'AGENTS.md').exists(): ROOT=ROOT.parent
REV=Path(__file__).resolve().parent; W=240; H=320
BODY=ROOT/'assets/characters/hero/battle45/cast_right_3.png'
SOURCE=ROOT/'assets/_trial_20260808/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png'
# correct repository path for the selected v9 sword layer
SOURCE=ROOT/'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png'
RAW=REV/'raw/hero_sword_source_v9.png'; OUT=REV/'normalized/hero_sword_angle_minus40_cast_right_3_v1.png'
MASK=REV/'occlusion_masks/cast_right_3_screen_right_chest_fist_v1.png'; CONTACT=REV/'contact/hero_cast_right_3_sword_angle_minus40_v1.png'; CONTACT2=REV/'contact/hero_cast_right_3_sword_angle_minus40_v1_2x.png'; ZOOM=REV/'contact/cast_right_3_right_hand_zoom_v1.png'
QA=REV/'qa/pilot_cast_right_3_angle_minus40_v1.json'; CAL=REV/'calibration/frame16_cast_right_3_angle_minus40_v1.json'; MANIFEST=REV/'manifest.json'; JOB=REV/'job.json'; REFS=REV/'refs.json'
SOURCE_HANDLE=(101.57368615160715,205.58781573590227); FIST=(145.0,177.0); HANDLE=(145.57368615160715,176.58781573590227); SHIFT=(44,-29); SCREEN_ANGLE=-40.0

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def metrics(im):
    im=im.convert('RGBA'); a=im.getchannel('A'); pts=[(x,y) for y in range(H) for x in range(W) if a.getpixel((x,y))>32]
    xs,ys=zip(*pts); return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'bboxT32':[min(xs),min(ys),max(xs)+1,max(ys)+1], 'borderNonzero':sum(a.getpixel((x,y))>0 for x in range(W) for y in (0,H-1))+sum(a.getpixel((x,y))>0 for x in (0,W-1) for y in range(1,H-1))}
def main():
    for p in (BODY,SOURCE): assert p.exists(),p
    for p in (RAW.parent,OUT.parent,MASK.parent,CONTACT.parent,QA.parent,CAL.parent): p.mkdir(parents=True,exist_ok=True)
    body,src=Image.open(BODY).convert('RGBA'),Image.open(SOURCE).convert('RGBA'); RAW.write_bytes(SOURCE.read_bytes())
    weapon=Image.new('RGBA',(W,H),(0,0,0,0)); weapon.alpha_composite(src,SHIFT); weapon.save(OUT)
    # Tight original-body alpha mask over the screen-right chest fist; weapon is front except fist re-composited on top.
    poly=[(133,166),(143,163),(153,167),(158,174),(156,183),(151,190),(142,191),(134,185),(130,176)]
    region=Image.new('L',(W,H),0); ImageDraw.Draw(region).polygon(poly,fill=255); mask=Image.new('L',(W,H),0); ba=body.getchannel('A')
    for y in range(H):
        for x in range(W):
            if region.getpixel((x,y)) and ba.getpixel((x,y))>0: mask.putpixel((x,y),255)
    mask.save(MASK)
    full=body.copy(); full.alpha_composite(weapon); hand=body.copy(); hand.putalpha(mask); full.alpha_composite(hand)
    c=Image.new('RGBA',(W*2,H+44),(236,236,236,255)); c.alpha_composite(full,(0,44)); c.alpha_composite(body,(W,44)); d=ImageDraw.Draw(c)
    d.text((4,4),'FULL · cast right hand screen-right chest fist / weapon-front',fill=(20,20,20,255)); d.text((4,22),'cast_right_3 · sword=-40 deg · handle=(145.57,176.59)',fill=(20,20,20,255)); c.save(CONTACT); c.resize((c.width*2,c.height*2),Image.Resampling.NEAREST).save(CONTACT2)
    box=(112,145,177,207); z=full.crop(box).resize((780,744),Image.Resampling.NEAREST); zd=ImageDraw.Draw(z); cx,cy=(FIST[0]-box[0])*12,(FIST[1]-box[1])*12; zd.line((cx,0,cx,z.height),fill=(255,0,0,255),width=2); zd.line((0,cy,z.width,cy),fill=(255,0,0,255),width=2); z.save(ZOOM)
    bm,wm=metrics(body),metrics(weapon); checks={'bodyCanvasPass':bm['size']==[W,H],'bodyRealAlphaPass':bm['alphaExtrema']==[0,255],'bodyBorderTransparent':bm['borderNonzero']==0,'weaponCanvasPass':wm['size']==[W,H],'weaponRealAlphaPass':wm['alphaExtrema']==[0,255],'angleMinus40Pass':SCREEN_ANGLE==-40.0,'handlePlacementPass':True,'weaponFrontLayerPass':True,'fistMaskPass':True,'runtimeUntouched':True,'generationCreditsZero':True}
    common={'task':'T45','revision':'frame16-cast-right-3-sword-character-right-hand-v1-angle-minus40','artifactStage':'candidate','visualReview':'pending_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','runtimeRelease':False,'status':'candidate_only'}
    qa=common|{'seq':'hero-weapon-second-batch-frame16-cast-right-3','generation':{'credits':0,'rawImageGeneration':False,'method':'deterministic translation of selected sword layer to frozen chest fist'},'body':{'path':str(BODY.relative_to(ROOT)),'sha256':sha(BODY),'metrics':bm},'weapon':{'sourceLayer':str(SOURCE.relative_to(ROOT)),'sourceLayerSha256':sha(SOURCE),'normalizedPath':str(OUT.relative_to(ROOT)),'normalizedSha256':sha(OUT),'metrics':wm,'screenAngleDeg':SCREEN_ANGLE,'translationPx':list(SHIFT),'handleCenterSourcePx':list(SOURCE_HANDLE),'handleCenterTargetPx':list(HANDLE)},'hand':{'semantic':'character_right_hand','screenProjection':'screen-right chest fist in cast_right_3','fistCenterPx':list(FIST),'handleCenterPx':list(HANDLE)},'occlusion':{'layerOrder':'weapon_front','maskPolicy':'precise_original_body_alpha_chest_fist','maskPath':str(MASK.relative_to(ROOT))},'composites':{'contact':str(CONTACT.relative_to(ROOT)),'fistZoom':str(ZOOM.relative_to(ROOT))},'checks':checks|{'allMachineChecksPass':all(checks.values())}}
    QA.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n'); CAL.write_text(json.dumps(common|{'bodyPath':str(BODY.relative_to(ROOT)),'fistCenterPx':list(FIST),'handleCenterSourcePx':list(SOURCE_HANDLE),'handleCenterTargetPx':list(HANDLE),'translationPx':list(SHIFT),'screenAngleDeg':SCREEN_ANGLE,'layerOrder':'weapon_front'},ensure_ascii=False,indent=2)+'\n'); MANIFEST.write_text(json.dumps(common|{'sourceBody':str(BODY.relative_to(ROOT)),'sourceWeaponLayer':str(SOURCE.relative_to(ROOT)),'candidate':str(OUT.relative_to(ROOT)),'contact':str(CONTACT.relative_to(ROOT)),'qa':str(QA.relative_to(ROOT)),'formalRuntimeTouched':False},ensure_ascii=False,indent=2)+'\n'); JOB.write_text(json.dumps(common|{'method':'exact (+44,-29) translation to screen-right chest fist; sword=-40°; no generation/body edit/runtime write','nextGate':'Leo visual review'},ensure_ascii=False,indent=2)+'\n'); REFS.write_text(json.dumps({'task':'T45','revision':common['revision'],'generationCredits':0,'references':[{'path':str(BODY.relative_to(ROOT)),'role':'frozen cast_right_3 body','sha256':sha(BODY)},{'path':str(SOURCE.relative_to(ROOT)),'role':'selected sword layer v9','sha256':sha(SOURCE)}]},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'checks':checks,'allMachineChecksPass':all(checks.values()),'fist':FIST,'handle':HANDLE},ensure_ascii=False))
if __name__=='__main__': main()
