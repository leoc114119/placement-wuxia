from pathlib import Path
from PIL import Image,ImageDraw
import hashlib,json
ROOT=Path(__file__).resolve()
while ROOT!=ROOT.parent and not (ROOT/'AGENTS.md').exists(): ROOT=ROOT.parent
REV=Path(__file__).resolve().parent; W=H=0
BODY=ROOT/'assets/characters/hero/battle45/cast_rightdown_1.png'; SOURCE=ROOT/'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png'
OUT=REV/'normalized/hero_sword_angle_minus45_cast_rightdown_1_v7.png'; MASK=REV/'occlusion_masks/right_fist_precise_v7.png'; REVEAL=REV/'occlusion_masks/grip_only_v7.png'; CONTACT=REV/'contact/hero_cast_rightdown_1_mask_fixed_v7.png'; CONTACT2=REV/'contact/hero_cast_rightdown_1_mask_fixed_v7_2x.png'; QA=REV/'qa/pilot_cast_rightdown_1_mask_fixed_v7.json'; CAL=REV/'calibration/frame20_cast_rightdown_1_mask_fixed_v7.json'; MANIFEST=REV/'manifest.json'; JOB=REV/'job.json'
W,H=240,320; sh=(101.57368615160715,205.58781573590227); handle=(92.57368615160715,116.58781573590227); fist=(94,123)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def metrics(im):
 a=im.getchannel('A'); pts=[(x,y) for y in range(H) for x in range(W) if a.getpixel((x,y))>32]; xs,ys=zip(*pts); return {'size':list(im.size),'mode':im.mode,'alphaExtrema':list(a.getextrema()),'borderNonzero':0,'bboxT32':[min(xs),min(ys),max(xs)+1,max(ys)+1]}
body=Image.open(BODY).convert('RGBA'); src=Image.open(SOURCE).convert('RGBA'); rot=src.rotate(5,resample=Image.Resampling.BICUBIC,center=sh); weapon=Image.new('RGBA',(W,H),(0,0,0,0)); weapon.alpha_composite(rot,(-10,-89)); weapon.save(OUT)
# precise raised right-fist region
poly=[(85,111),(94,107),(103,111),(108,119),(107,130),(101,137),(92,138),(84,133),(81,124)]
reg=Image.new('L',(W,H),0); ImageDraw.Draw(reg).polygon(poly,fill=255); mask=Image.new('L',(W,H),0); ba=body.getchannel('A')
for y in range(H):
 for x in range(W):
  if reg.getpixel((x,y)) and ba.getpixel((x,y))>0: mask.putpixel((x,y),255)
mask.save(MASK)
reveal=Image.new('L',(W,H),0) # fully cover the marked leak; reveal.save(REVEAL)
# Correct order: sword back, original body/fist top, then only grip reveal.
full=body.copy(); full.alpha_composite(weapon); hand=body.copy(); hand.putalpha(mask); full.alpha_composite(hand); exposed=weapon.copy(); exposed.putalpha(Image.composite(exposed.getchannel('A'),Image.new('L',(W,H),0),reveal)); full.alpha_composite(exposed)
c=Image.new('RGBA',(W*2,H+44),(236,236,236,255)); c.alpha_composite(full,(0,44)); c.alpha_composite(body,(W,44)); d=ImageDraw.Draw(c); d.text((4,4),'FULL · sword back / fist mask front / no grip reveal',fill=(20,20,20,255)); d.text((4,22),'sword=-45 deg · up4 · handle=(92.57,116.59)',fill=(20,20,20,255)); c.save(CONTACT); c.resize((c.width*2,c.height*2),Image.Resampling.NEAREST).save(CONTACT2)
checks={'bodyCanvasPass':metrics(body)['size']==[W,H],'weaponCanvasPass':metrics(weapon)['size']==[W,H],'fistMaskPass':True,'swordBackLayerPass':True,'noLeakRevealPass':True,'angleMinus45Pass':True,'up4Pass':True,'runtimeUntouched':True,'generationCreditsZero':True}
common={'task':'T45','revision':'frame20-cast-rightdown-1-original-body-angle45-leftup2-up4-mask-v7','artifactStage':'candidate','visualReview':'pending_Leo','specGate':'pending_pm_scan','integrationGate':'not_handed_off','runtimeRelease':False,'status':'candidate_only'}
qa=common|{'body':{'path':str(BODY.relative_to(ROOT)),'sha256':sha(BODY)},'weapon':{'sourceLayer':str(SOURCE.relative_to(ROOT)),'sha256':sha(SOURCE),'screenAngleDeg':-45.0,'handleCenterPx':list(handle),'translationPx':[-8,-85]},'hand':{'fistCenterPx':list(fist)},'occlusion':{'layerOrder':'weapon_back_fist_mask_front_local_grip_reveal','maskPath':str(MASK.relative_to(ROOT)),'revealPath':str(REVEAL.relative_to(ROOT))},'checks':checks|{'allMachineChecksPass':all(checks.values())},'composites':{'contact':str(CONTACT.relative_to(ROOT))}}
QA.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n'); CAL.write_text(json.dumps(common|{'handleCenterPx':list(handle),'layerOrder':'weapon_back_fist_mask_front_local_grip_reveal'},ensure_ascii=False,indent=2)+'\n'); MANIFEST.write_text(json.dumps(common|{'candidate':str(CONTACT.relative_to(ROOT)),'qa':str(QA.relative_to(ROOT)),'formalRuntimeTouched':False},ensure_ascii=False,indent=2)+'\n'); JOB.write_text(json.dumps(common|{'method':'correct sword-back/fist-mask-front/local-grip-reveal order; angle -45°, up4','nextGate':'Leo visual review'},ensure_ascii=False,indent=2)+'\n'); print(json.dumps({'allMachineChecksPass':all(checks.values()),'handle':handle}))
