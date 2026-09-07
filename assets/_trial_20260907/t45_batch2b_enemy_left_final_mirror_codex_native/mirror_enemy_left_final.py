from pathlib import Path
import hashlib, json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[3]
PKG = ROOT / 'assets/_trial_20260907/t45_batch2b_enemy_left_final_mirror_codex_native'
ROLES = ('shanzei_a', 'shanzei_b')
DIRECTIONS = (('right', 'left'), ('rightup', 'leftup'), ('rightdown', 'leftdown'))
SPECS = []
for role in ROLES:
    for src, dst in DIRECTIONS:
        SPECS.append((role, 'battle_idle', src, dst, None))
    for action in ('walk', 'atk'):
        for src, dst in DIRECTIONS:
            SPECS.append((role, action, src, dst, '1'))

entries=[]
for role, action, src_dir, dst_dir, phase in SPECS:
    suffix = f'_{phase}' if phase else ''
    runtime_name = f'{action}_{dst_dir}{suffix}.png'
    canonical = f'{role}_{runtime_name}'
    source_path = ROOT / f'assets/characters/enemy/{role}/battle45/{action}_{src_dir}{suffix}.png'
    out_path = PKG / 'integrated_candidate' / canonical
    source = Image.open(source_path).convert('RGBA')
    mirrored = ImageOps.mirror(source)
    mirrored.save(out_path, 'PNG', optimize=False)
    exact = list(mirrored.getdata()) == list(ImageOps.mirror(source).getdata())
    entries.append({
        'name': canonical,
        'runtimeName': runtime_name,
        'identity': role,
        'action': 'idle' if action == 'battle_idle' else action,
        'direction': dst_dir,
        'phase': phase,
        'source': str(source_path.relative_to(ROOT)),
        'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
        'mirroredSha256': hashlib.sha256(out_path.read_bytes()).hexdigest(),
        'mirrorPixelExact': exact,
        'flipX': True,
        'processing': 'Pillow ImageOps.mirror only; release preflight then removes exposed light fringe and recenters alpha>32 centroid to x=120',
        'integratedPath': str(out_path.relative_to(ROOT)),
    })
assert len(entries)==18 and all(e['mirrorPixelExact'] for e in entries)
(PKG/'qa/source_ledger.json').write_text(json.dumps({'task':'T45','instruction':'seq113','count':18,'sourceAuthority':'current runtime right-side battle45 frames','mirrorPolicy':'horizontal mirror only before release preflight; die_common excluded','entries':entries},ensure_ascii=False,indent=2)+'\n')
(PKG/'request.md').write_text('''# T45 seq113 · 敌型左系 idle/_1 确定性镜像

- 范围：甲乙各 9 张：`battle_idle_left/leftup/leftdown`、`walk_left/leftup/leftdown_1`、`atk_left/leftup/leftdown_1`。
- 源：`assets/characters/enemy/{shanzei_a,shanzei_b}/battle45/` 当前右系 runtime 帧。
- 处理：Pillow 水平镜像；release preflight 做浅色边缘晕染清除与 alpha>32 质心 x=120 归一；无 ImageGen、无语义重绘；`die_common` 不镜像。
- PM 精扫完成前，runtime manifest 的新增帧标记为 `specGate=pending_pm_scan`。
''')
print(json.dumps({'count':len(entries),'allPixelExact':all(e['mirrorPixelExact'] for e in entries)},ensure_ascii=False))
