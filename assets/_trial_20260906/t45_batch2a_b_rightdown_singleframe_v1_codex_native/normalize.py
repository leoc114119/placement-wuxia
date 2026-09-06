from pathlib import Path
from PIL import Image, ImageDraw
import hashlib, json
ROOT=Path('assets/_trial_20260906/t45_batch2a_b_rightdown_singleframe_v1_codex_native')
RAW=ROOT/'raw'/'shanzei_b_rightdown_attempt2.png'; OUT=ROOT/'normalized'; QA=ROOT/'qa'; OUT.mkdir(exist_ok=True)
im=Image.open(RAW).convert('RGBA'); a=im.getchannel('A'); box=a.point(lambda p:255 if p>=30 else 0).getbbox()
crop=im.crop(box); scale=256/crop.height; sprite=crop.resize((round(crop.width*scale),256),Image.Resampling.LANCZOS)
frame=Image.new('RGBA',(240,320),(0,0,0,0)); frame.alpha_composite(sprite,(round(120-sprite.width/2),44)); out=OUT/'shanzei_b_rightdown.png'; frame.save(out,'PNG',optimize=False)
a=frame.getchannel('A'); b=a.point(lambda p:255 if p>=30 else 0).getbbox()
record={'key':'shanzei_b_rightdown','source':str(RAW),'output':str(out),'selectedAttempt':2,'size':list(frame.size),'sourceAlphaBBox':list(box),'bbox':list(b),'visualHeight':b[3]-b[1],'feetY':b[3],'centroidX':(b[0]+b[2])/2,'widthHeightRatio':(b[2]-b[0])/(b[3]-b[1]),'alphaExtrema':list(a.getextrema()),'sourceSha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'processing':'alpha-bbox crop only; aspect-preserving resize to visual height 256; 240x320 RGBA frame centered at x=120 with feet y=300; no redraw or proportion change','mechanicalPass':bool(frame.size==(240,320) and b[3]-b[1]==256 and b[3]==300 and abs((b[0]+b[2])/2-120)<=1 and a.getextrema()[0]==0),'visualReview':'selected by Leo after the two-attempt cap'}
(QA/'shanzei_b_rightdown.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
(QA/'summary.json').write_text(json.dumps({'count':1,'mechanicalPass':record['mechanicalPass'],'files':[record]},ensure_ascii=False,indent=2)+'\n')
# review contact is only evidence of the selected B direction family.
paths=[('right · approved',Path('assets/_trial_20260906/t45_batch2a_bright_v8_two_ref_hero_height_codex_native/normalized/shanzei_b_right.png')),('right-up · approved',Path('assets/_trial_20260906/t45_batch2a_b_rightup_singleframe_v5_codex_native/normalized/shanzei_b_rightup.png')),('right-down · approved',out)]
canvas=Image.new('RGBA',(1560,460),(28,24,21,255));d=ImageDraw.Draw(canvas)
for i,(label,p) in enumerate(paths):
 x=i*520;d.text((x+38,20),'B '+label,fill='white');d.line((x,54,x+520,54),fill=(137,108,66,255),width=2);sp=Image.open(p).convert('RGBA').resize((360,480),Image.Resampling.NEAREST);canvas.alpha_composite(sp,(x+80,18))
canvas.save(ROOT/'review_triplet_selected.png')
print(json.dumps(record,ensure_ascii=False,indent=2))
