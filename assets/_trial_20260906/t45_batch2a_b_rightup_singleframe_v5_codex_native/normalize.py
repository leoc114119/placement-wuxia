from pathlib import Path
from PIL import Image, ImageDraw
import hashlib, json

ROOT = Path('assets/_trial_20260906/t45_batch2a_b_rightup_singleframe_v5_codex_native')
RAW = ROOT / 'raw' / 'shanzei_b_rightup_attempt3.png'
OUT = ROOT / 'normalized'
QA = ROOT / 'qa'
OUT.mkdir(exist_ok=True)
QA.mkdir(exist_ok=True)

raw = Image.open(RAW).convert('RGBA')
alpha = raw.getchannel('A')
box = alpha.point(lambda p: 255 if p >= 30 else 0).getbbox()
if not box:
    raise SystemExit('No visible alpha component')
crop = raw.crop(box)
scale = 256 / crop.height
resized = crop.resize((round(crop.width * scale), 256), Image.Resampling.LANCZOS)
frame = Image.new('RGBA', (240, 320), (0, 0, 0, 0))
frame.alpha_composite(resized, (round(120 - resized.width / 2), 44))
out = OUT / 'shanzei_b_rightup.png'
frame.save(out, 'PNG', optimize=False)

out_alpha = frame.getchannel('A')
out_box = out_alpha.point(lambda p: 255 if p >= 30 else 0).getbbox()
record = {
    'key': 'shanzei_b_rightup',
    'source': str(RAW), 'output': str(out),
    'size': list(frame.size), 'sourceAlphaBBox': list(box), 'bbox': list(out_box),
    'visualHeight': out_box[3] - out_box[1], 'feetY': out_box[3],
    'centroidX': (out_box[0] + out_box[2]) / 2,
    'widthHeightRatio': (out_box[2] - out_box[0]) / (out_box[3] - out_box[1]),
    'alphaExtrema': list(out_alpha.getextrema()),
    'sourceSha256': hashlib.sha256(RAW.read_bytes()).hexdigest(),
    'outputSha256': hashlib.sha256(out.read_bytes()).hexdigest(),
    'processing': 'alpha-bbox crop only; aspect-preserving resize to visible height 256; centered 240x320 RGBA canvas with feet at y=300; no redraw or proportion change',
    'mechanicalPass': bool(frame.size == (240,320) and out_box[3]-out_box[1] == 256 and out_box[3] == 300 and abs((out_box[0]+out_box[2])/2-120) <= 1 and out_alpha.getextrema()[0] == 0),
}
(QA / 'shanzei_b_rightup.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
(QA / 'summary.json').write_text(json.dumps({'count': 1, 'mechanicalPass': record['mechanicalPass'], 'files': [record]}, ensure_ascii=False, indent=2) + '\n')

# Review pair: the accepted B-right anchor alongside this isolated B-rightup candidate.
anchor = Path('assets/_trial_20260906/t45_batch2a_bright_v8_two_ref_hero_height_codex_native/normalized/shanzei_b_right.png')
canvas = Image.new('RGBA', (1040, 460), (28, 24, 21, 255))
draw = ImageDraw.Draw(canvas)
draw.text((38, 20), 'B right · approved identity anchor', fill=(255,255,255,255))
draw.text((560, 20), 'B right-up · single-frame candidate', fill=(255,255,255,255))
for x in (0, 520):
    draw.line((x, 54, x + 520, 54), fill=(137,108,66,255), width=2)
for x, p in ((140, anchor), (660, out)):
    sprite = Image.open(p).convert('RGBA').resize((360, 480), Image.Resampling.NEAREST)
    canvas.alpha_composite(sprite, (x - 60, 18))
canvas.save(ROOT / 'review_pair.png')
print(json.dumps(record, ensure_ascii=False, indent=2))
