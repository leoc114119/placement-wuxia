from pathlib import Path
from PIL import Image, ImageOps
import hashlib, json

src_dir = Path('assets/characters/hero/battle45')
out_dir = src_dir
trial = Path('assets/_trial_20260906/t45_hero_left_mirror_codex_native')
entries=[]
for action in ('battle_idle','walk','jump','atk','cast'):
    frames = [None] if action == 'battle_idle' else range(1, {'walk':2,'jump':2,'atk':2,'cast':3}[action]+1)
    for direction in ('right','rightup','rightdown'):
        leftdir = {'right':'left','rightup':'leftup','rightdown':'leftdown'}[direction]
        for n in frames:
            suffix = '' if n is None else f'_{n}'
            src_name = f'{action}_{direction}{suffix}.png'
            dst_name = f'{action}_{leftdir}{suffix}.png'
            src = src_dir/src_name
            dst = out_dir/dst_name
            im = Image.open(src).convert('RGBA')
            flipped = ImageOps.mirror(im)
            flipped.save(dst, 'PNG', optimize=False)
            raw = flipped.tobytes()
            bbox = flipped.getchannel('A').getbbox()
            def sha(path):
                return hashlib.sha256(path.read_bytes()).hexdigest()
            entries.append({
                'path': str(dst.relative_to(Path('.'))),
                'derivedFrom': str(src.relative_to(Path('.'))),
                'flipX': True,
                'size': list(flipped.size),
                'mode': flipped.mode,
                'alphaBBox': list(bbox) if bbox else None,
                'sourceSha256': sha(src),
                'outputSha256': sha(dst)
            })
manifest = {
    'task':'T45',
    'batch':'hero-left-mirror',
    'artifactStage':'release',
    'visualReview':'selected',
    'specGate':'pending',
    'integrationGate':'not_handed_off',
    'mirrorPolicy':'deterministic horizontal FLIP_LEFT_RIGHT from accepted hero right系 frames; die_common is shared and excluded',
    'count': len(entries),
    'entries': entries
}
(trial/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
(trial/'request.md').write_text('''# T45 hero 左系确定性镜像\n\n- Source: accepted hero battle45 right/rightup/rightdown frames.\n- Operation: Pillow horizontal mirror only; no redraw, resize, crop, alpha edit or color change.\n- Output: left/leftup/leftdown × idle1+walk2+jump2+atk2+cast3 = 30 PNG.\n- die_common is shared across six directions and is intentionally excluded.\n''')
