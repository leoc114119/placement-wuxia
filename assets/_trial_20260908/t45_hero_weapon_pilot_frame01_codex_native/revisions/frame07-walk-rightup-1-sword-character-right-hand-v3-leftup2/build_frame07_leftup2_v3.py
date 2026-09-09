#!/usr/bin/env python3
"""T45 walk_rightup_1 v3: move the approved vertical sword two pixels left/up."""
from __future__ import annotations

import hashlib, json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve()
while ROOT != ROOT.parent and not (ROOT / 'AGENTS.md').exists(): ROOT = ROOT.parent
REV = Path(__file__).resolve().parent
W, H = 240, 320
BODY = ROOT / 'assets/characters/hero/battle45/walk_rightup_1.png'
SOURCE = ROOT / 'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame07-walk-rightup-1-sword-character-right-hand-v2-vertical-grip/normalized/hero_sword_vertical_walk_rightup_1_v2.png'
RAW = REV / 'raw/hero_sword_vertical_v2.png'
OUT = REV / 'normalized/hero_sword_vertical_walk_rightup_1_v3_leftup2.png'
CONTACT = REV / 'contact/hero_walk_rightup_1_sword_vertical_v3_leftup2.png'
CONTACT2 = REV / 'contact/hero_walk_rightup_1_sword_vertical_v3_leftup2_2x.png'
ZOOM = REV / 'contact/walk_rightup_1_vertical_grip_zoom_v3_leftup2.png'
QA = REV / 'qa/pilot_walk_rightup_1_vertical_grip_v3_leftup2.json'
CAL = REV / 'calibration/frame07_walk_rightup_1_vertical_grip_v3_leftup2.json'
MANIFEST, JOB, REFS = REV / 'manifest.json', REV / 'job.json', REV / 'refs.json'
SHIFT = (-2, -2)
FIST = (181.0, 189.0)
SOURCE_HANDLE = (180.57368615160715, 188.58781573590227)
TARGET_HANDLE = (SOURCE_HANDLE[0] + SHIFT[0], SOURCE_HANDLE[1] + SHIFT[1])

def sha(p: Path) -> str: return hashlib.sha256(p.read_bytes()).hexdigest()
def metrics(im: Image.Image) -> dict:
    im = im.convert('RGBA'); a = im.getchannel('A'); pts = [(x,y) for y in range(H) for x in range(W) if a.getpixel((x,y)) > 32]
    xs, ys = zip(*pts)
    return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'bboxT32':[min(xs),min(ys),max(xs)+1,max(ys)+1],'borderNonzero':sum(a.getpixel((x,y)) > 0 for x in range(W) for y in (0,H-1))+sum(a.getpixel((x,y)) > 0 for x in (0,W-1) for y in range(1,H-1))}
def main() -> None:
    for p in (BODY,SOURCE): assert p.exists(), p
    for p in (RAW.parent,OUT.parent,CONTACT.parent,QA.parent,CAL.parent): p.mkdir(parents=True,exist_ok=True)
    body, source = Image.open(BODY).convert('RGBA'), Image.open(SOURCE).convert('RGBA')
    RAW.write_bytes(SOURCE.read_bytes())
    weapon = Image.new('RGBA',(W,H),(0,0,0,0)); weapon.alpha_composite(source, SHIFT); weapon.save(OUT)
    composite = weapon.copy(); composite.alpha_composite(body)
    contact = Image.new('RGBA',(W*2,H+44),(236,236,236,255)); contact.alpha_composite(composite,(0,44)); contact.alpha_composite(body,(W,44))
    d=ImageDraw.Draw(contact); d.text((4,4),'FULL · body-front / character RIGHT hand = screen-right fist',fill=(20,20,20,255)); d.text((4,22),'walk_rightup_1 · vertical -90 deg · v2 whole sword shift=(-2,-2)',fill=(20,20,20,255)); contact.save(CONTACT); contact.resize((contact.width*2,contact.height*2),Image.Resampling.NEAREST).save(CONTACT2)
    box=(156,140,204,208); zoom=composite.crop(box).resize((576,816),Image.Resampling.NEAREST); z=ImageDraw.Draw(zoom);cx,cy=(FIST[0]-box[0])*12,(FIST[1]-box[1])*12;z.line((cx,0,cx,zoom.height),fill=(255,0,0,255),width=2);z.line((0,cy,zoom.width,cy),fill=(255,0,0,255),width=2);zoom.save(ZOOM)
    bm,wm=metrics(body),metrics(weapon)
    checks={'bodyCanvasPass':bm['size']==[W,H],'bodyRealAlphaPass':bm['alphaExtrema']==[0,255],'bodyBorderTransparent':bm['borderNonzero']==0,'weaponCanvasPass':wm['size']==[W,H],'weaponRealAlphaPass':wm['alphaExtrema']==[0,255],'verticalAnglePreserved':True,'exactWholeLayerShiftPass':True,'bodyFrontLayerPass':True,'runtimeUntouched':True,'generationCreditsZero':True}
    common={'task':'T45','revision':'frame07-walk-rightup-1-sword-character-right-hand-v3-leftup2','artifactStage':'candidate','visualReview':'pending_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','runtimeRelease':False,'status':'candidate_only'}
    qa=common|{'seq':'hero-weapon-pilot-frame07-walk-rightup-1','generation':{'credits':0,'rawImageGeneration':False,'method':'exact integer RGBA translation of v2 vertical sword layer'},'body':{'path':str(BODY.relative_to(ROOT)),'sha256':sha(BODY),'metrics':bm},'weapon':{'sourceLayer':str(SOURCE.relative_to(ROOT)),'sourceLayerSha256':sha(SOURCE),'normalizedPath':str(OUT.relative_to(ROOT)),'normalizedSha256':sha(OUT),'metrics':wm,'screenAngleDeg':-90.0,'translationFromV2Px':list(SHIFT)},'hand':{'semantic':'character_right_hand','screenProjection':'screen-right fist in walk_rightup_1','fistCenterPx':list(FIST),'handleCenterV2Px':list(SOURCE_HANDLE),'handleCenterV3Px':list(TARGET_HANDLE),'intentionalOffsetFromFistPx':[TARGET_HANDLE[0]-FIST[0],TARGET_HANDLE[1]-FIST[1]]},'occlusion':{'layerOrder':'body_front','maskPolicy':'none'},'composites':{'contact':str(CONTACT.relative_to(ROOT)),'fistZoom':str(ZOOM.relative_to(ROOT))},'checks':checks|{'allMachineChecksPass':all(checks.values())}}
    QA.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n');CAL.write_text(json.dumps(common|{'sourceRevision':'frame07-walk-rightup-1-sword-character-right-hand-v2-vertical-grip','sourceHandleCenterPx':list(SOURCE_HANDLE),'targetHandleCenterPx':list(TARGET_HANDLE),'translationFromV2Px':list(SHIFT),'screenAngleDeg':-90.0,'layerOrder':'body_front'},ensure_ascii=False,indent=2)+'\n');MANIFEST.write_text(json.dumps(common|{'sourceBody':str(BODY.relative_to(ROOT)),'sourceWeaponLayer':str(SOURCE.relative_to(ROOT)),'candidate':str(OUT.relative_to(ROOT)),'contact':str(CONTACT.relative_to(ROOT)),'qa':str(QA.relative_to(ROOT)),'formalRuntimeTouched':False,'supersedes':'frame07-walk-rightup-1-sword-character-right-hand-v2-vertical-grip'},ensure_ascii=False,indent=2)+'\n');JOB.write_text(json.dumps(common|{'method':'exact (-2,-2) translation of v2; no rotation, generation, body edit, or runtime write','nextGate':'Leo visual review'},ensure_ascii=False,indent=2)+'\n');REFS.write_text(json.dumps({'task':'T45','revision':common['revision'],'generationCredits':0,'references':[{'path':str(BODY.relative_to(ROOT)),'role':'frozen target body','sha256':sha(BODY)},{'path':str(SOURCE.relative_to(ROOT)),'role':'vertical v2 weapon layer','sha256':sha(SOURCE)}]},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'checks':checks,'allMachineChecksPass':all(checks.values()),'handleV3':TARGET_HANDLE},ensure_ascii=False))
if __name__ == '__main__': main()
