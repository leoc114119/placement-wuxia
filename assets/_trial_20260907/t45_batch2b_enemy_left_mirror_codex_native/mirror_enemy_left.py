from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import hashlib, json

ROOT = Path('.')
SOURCES = [
    ('shanzei_a', 'right', 'left'),
    ('shanzei_a', 'rightup', 'leftup'),
    ('shanzei_a', 'rightdown', 'leftdown'),
    ('shanzei_b', 'right', 'left'),
    ('shanzei_b', 'rightup', 'leftup'),
    ('shanzei_b', 'rightdown', 'leftdown'),
]
TRIAL = ROOT / 'assets/_trial_20260907/t45_batch2b_enemy_left_mirror_codex_native'
entries = []
checks = []
contact_tiles = []
for role, src_dir, dst_dir in SOURCES:
    src_path = ROOT / f'assets/characters/enemy/{role}/battle45/walk_{src_dir}_2.png'
    # infer action from the fixed release set below; this loop is replaced in the second loop

for role in ('shanzei_a', 'shanzei_b'):
    for action in ('walk', 'atk'):
        for src_dir, dst_dir in (('right','left'), ('rightup','leftup'), ('rightdown','leftdown')):
            src_path = ROOT / f'assets/characters/enemy/{role}/battle45/{action}_{src_dir}_2.png'
            dst_path = TRIAL / 'normalized' / f'{role}_{action}_{dst_dir}_2.png'
            src = Image.open(src_path).convert('RGBA')
            out = ImageOps.mirror(src)
            out.save(dst_path, 'PNG', optimize=False)
            src_sha = hashlib.sha256(src_path.read_bytes()).hexdigest()
            out_sha = hashlib.sha256(dst_path.read_bytes()).hexdigest()
            alpha = out.getchannel('A')
            bbox = alpha.getbbox()
            alpha_min, alpha_max = alpha.getextrema()
            # Full-pixel exactness: output must equal Pillow mirror of source.
            expected = ImageOps.mirror(src)
            pixel_exact = list(out.getdata()) == list(expected.getdata())
            # Mechanical checks used by T45 right系 gate.
            px = out.load()
            edge_alpha_zero = all(px[x, y][3] == 0 for x in range(out.width) for y in (0, out.height-1)) and all(px[x, y][3] == 0 for y in range(out.height) for x in (0, out.width-1))
            size_pass = out.size == (240, 320)
            mode_pass = out.mode == 'RGBA'
            feet_y = bbox[3] if bbox else None
            visual_height = (bbox[3]-bbox[1]) if bbox else None
            # alpha>32 centroid, matching PM gate.
            sx = sy = n = 0
            for y in range(out.height):
                for x in range(out.width):
                    if px[x,y][3] > 32:
                        sx += x; sy += y; n += 1
            cx = sx / n if n else None
            cy = sy / n if n else None
            hard_pass = bool(pixel_exact and size_pass and mode_pass and edge_alpha_zero and bbox and visual_height == 256 and feet_y == 300 and abs(cx - 120) <= 20)
            entry = {
                'name': dst_path.name,
                'path': str(dst_path),
                'derivedFrom': str(src_path),
                'flipX': True,
                'sourceSha256': src_sha,
                'outputSha256': out_sha,
                'size': list(out.size),
                'mode': out.mode,
                'bboxT32': list(bbox) if bbox else None,
                'visualHeightT32': visual_height,
                'feetY': feet_y,
                'alpha32CentroidX': cx,
                'alpha32CentroidY': cy,
                'alphaExtrema': [alpha_min, alpha_max],
                'pixelExact': pixel_exact,
                'edgeAlphaZero': edge_alpha_zero,
                'hardGatesPass': hard_pass,
            }
            entries.append(entry)
            checks.append({
                'path': str(dst_path),
                'derivedFrom': str(src_path),
                'pixelExact': pixel_exact,
                'sizePass': size_pass,
                'modePass': mode_pass,
                'alphaBBoxMirrorPass': bool(bbox and bbox == (240 - Image.open(src_path).getchannel('A').getbbox()[2], Image.open(src_path).getchannel('A').getbbox()[1], 240 - Image.open(src_path).getchannel('A').getbbox()[0], Image.open(src_path).getchannel('A').getbbox()[3])),
                'edgeAlphaZero': edge_alpha_zero,
                'visualHeightPass': visual_height == 256,
                'feetYPass': feet_y == 300,
                'centroidPass': abs(cx - 120) <= 20 if cx is not None else False,
                'hardGatesPass': hard_pass,
            })
            contact_tiles.append((f'{role} {action} {dst_dir} 2', out))

font = ImageFont.load_default()
tile_w, tile_h, header = 240, 320, 20
cols = 4
rows = (len(contact_tiles)+cols-1)//cols
sheet = Image.new('RGBA', (cols*tile_w, rows*(tile_h+header)), (24,28,34,255))
draw = ImageDraw.Draw(sheet)
for i, (label, im) in enumerate(contact_tiles):
    x = (i % cols) * tile_w; y = (i // cols) * (tile_h+header)
    draw.rectangle((x,y,x+tile_w-1,y+header-1), fill=(44,51,62,255))
    draw.text((x+4,y+4), label, fill=(235,238,242,255), font=font)
    # checker-free black preview matches runtime visibility, while files remain transparent.
    sheet.alpha_composite(Image.new('RGBA', (tile_w,tile_h), (0,0,0,255)), (x,y+header))
    sheet.alpha_composite(im, (x,y+header))
sheet.save(TRIAL/'contact/left_mirror_right2_contact.png', 'PNG', optimize=False)

manifest = {
    'task': 'T45',
    'batch': '2b-enemy-left-mirror',
    'artifactStage': 'candidate',
    'visualReview': 'selected_by_Leo',
    'specGate': 'pending',
    'integrationGate': 'not_handed_off',
    'runtimeRelease': False,
    'sourcePolicy': 'Only PM-accepted T45 right系 release frames; no ImageGen; Pillow ImageOps.mirror pixel-exact output.',
    'mirrorPolicy': 'left/leftup/leftdown = deterministic horizontal mirror of right/rightup/rightdown; die_common shared and excluded.',
    'count': len(entries),
    'files': entries,
    'hardGatesAllPass': all(e['hardGatesPass'] for e in entries),
    'qaPath': 'qa/mirror_check.json',
    'contactPath': 'contact/left_mirror_right2_contact.png',
}
(TRIAL/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
(TRIAL/'qa/mirror_check.json').write_text(json.dumps({
    'task':'T45', 'batch':'2b-enemy-left-mirror', 'count':len(checks),
    'pixelExactCount':sum(1 for c in checks if c['pixelExact']),
    'allPixelExact':all(c['pixelExact'] for c in checks),
    'allMechanicalPass':all(c['hardGatesPass'] for c in checks),
    'checks':checks,
}, ensure_ascii=False, indent=2)+'\n')
(TRIAL/'request.md').write_text('''# T45 批 2b 山贼左系确定性镜像（动作帧 _2）

- 来源：已通过 Leo 目验与 PM 规格门的山贼甲/乙右系 `walk_*_2`、`atk_*_2` release 帧。
- 操作：Pillow `ImageOps.mirror`，只做水平翻转；不重绘、不裁切、不缩放、不改 alpha 或色彩。
- 产出：甲乙 × walk/atk × left/leftup/leftdown × `_2`，共 12 张透明 PNG。
- `die_common` 为全角色共用，不重复镜像；`_1` 仍待 Leo 逐张目验后再派生。
- 运行时目录暂不改，先交候选与机械 QA 做第二道规格门复核。
''')
