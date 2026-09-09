#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json
from pathlib import Path
from PIL import Image,ImageChops,ImageOps

ROOT=Path(__file__).resolve()
while ROOT!=ROOT.parent and not (ROOT/'AGENTS.md').exists(): ROOT=ROOT.parent
OUT=ROOT/'assets/_trial_20260909/t45_hero_weapon_left_derivation_seq232'
RIGHT_MANIFEST=ROOT/'tasks/handoff/T45-hero-weapon-right-series-manifest-13rows-seq231-20260909.json'
RIGHT_WEAPONS={
 'frame01':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png',
 'frame02':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/normalized/hero_sword_held_horizontal_walk_right_1_v2.png',
 'frame03':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/normalized/hero_sword_held_up15_walk_right_2_v2.png',
 'frame04':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame04-atk-right-2-sword-right-hand-v2/normalized/hero_sword_held_atk_right_2_character_right_hand_v2.png',
 'frame05':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/normalized/hero_sword_held_idle_rightup_character_right_hand_v4.png',
 'frame06':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v9-precise-fist-mask-repair/normalized/hero_sword_held_idle_rightdown_character_right_hand_v9.png',
 'frame07':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame07-walk-rightup-1-sword-character-right-hand-v3-leftup2/normalized/hero_sword_vertical_walk_rightup_1_v3_leftup2.png',
 'frame08':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame08-walk-rightup-2-sword-character-right-hand-v1-vertical-leftup2/normalized/hero_sword_vertical_walk_rightup_2_v1.png',
 'frame09':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame09-atk-rightup-1-sword-character-right-hand-v5-down1/normalized/hero_sword_vertical_atk_rightup_1_v5_down1.png',
 'frame10':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame10-atk-rightup-2-sword-character-right-hand-v7-angle-160-rightdown2/normalized/hero_sword_angle_minus160_atk_rightup_2_v7.png',
 'frame11':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame11-walk-rightdown-1-sword-character-right-hand-v6-angle35-down1/normalized/hero_sword_angle35_walk_rightdown_1_v6_down1.png',
 'frame12':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame12-atk-rightdown-1-sword-character-right-hand-v2-vertical/normalized/hero_sword_vertical_atk_rightdown_1_v2.png',
 'frame13':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame13-atk-rightdown-2-sword-character-right-hand-v10-left4/normalized/hero_sword_angle_minus15_atk_rightdown_2_v10_left4.png',
}
RIGHT_MASKS={
 'frame01':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/occlusion_masks/hero_idle_right_character_right_fist.png',
 'frame02':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/occlusion_masks/hero_walk_right_1_character_right_fist.png',
 'frame03':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/occlusion_masks/hero_walk_right_2_character_right_fist_v2.png',
 'frame04':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame04-atk-right-2-sword-right-hand-v2/occlusion_masks/hero_atk_right_2_screen_right_fist_v2.png',
 'frame05':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame05-idle-rightup-sword-right-hand-v4-body-front-up2/occlusion_masks/hero_idle_rightup_screen_right_fist_v4.png',
 'frame06':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v9-precise-fist-mask-repair/occlusion_masks/hero_idle_rightdown_screen_left_fist_v9.png',
 'frame11':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame11-walk-rightdown-1-sword-character-right-hand-v6-angle35-down1/occlusion_masks/walk_rightdown_1_screen_left_fist_v6.png',
 'frame12':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame12-atk-rightdown-1-sword-character-right-hand-v2-vertical/occlusion_masks/atk_rightdown_1_screen_left_fist_v2.png',
 'frame13':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame13-atk-rightdown-2-sword-character-right-hand-v10-left4/occlusion_masks/atk_rightdown_2_screen_right_fist_v10.png',
}
BODY_LEFT={
 'frame01':'battle_idle_left.png','frame02':'walk_left_1.png','frame03':'walk_left_2.png','frame04':'atk_left_2.png','frame05':'battle_idle_leftup.png','frame06':'battle_idle_leftdown.png','frame07':'walk_leftup_1.png','frame08':'walk_leftup_2.png','frame09':'atk_leftup_1.png','frame10':'atk_leftup_2.png','frame11':'walk_leftdown_1.png','frame12':'atk_leftdown_1.png','frame13':'atk_leftdown_2.png'}
RIGHT_BODY_CANDIDATE={'frame04':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame04-atk-right-2-fist-up-v1/normalized/hero_atk_right_2_fist_up_user_selected.png','frame06':'assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame06-idle-rightdown-sword-character-right-hand-v9-precise-fist-mask-repair/body/battle_idle_rightdown_fist_out_v9.png'}
FRAME_ALIAS={
 'frame01':'battle_idle_right.png','frame02':'walk_right_1.png','frame03':'walk_right_2.png','frame04':'atk_right_2.png','frame05':'battle_idle_rightup.png','frame06':'battle_idle_rightdown.png','frame07':'walk_rightup_1.png','frame08':'walk_rightup_2.png','frame09':'atk_rightup_1.png','frame10':'atk_rightup_2.png','frame11':'walk_rightdown_1.png','frame12':'atk_rightdown_1.png','frame13':'atk_rightdown_2.png'}

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def norm_angle(a):
    x=(180-a)%360-180
    return 180.0 if x==-180 else x
def main():
    data=json.loads(RIGHT_MANIFEST.read_text())
    rows=data['rows']; by={r['frameId']:r for r in rows}
    for d in ['sword_layers','occlusion_masks','body_candidates','qa']: (OUT/d).mkdir(parents=True,exist_ok=True)
    ledger=[]; left_rows=[]; qa=[]
    for fid in [f'frame{i:02d}' for i in range(1,14)]:
        r=by[fid]; right_body=ROOT/r['bodyFrame']; left_body=ROOT/'assets/characters/hero/battle45'/BODY_LEFT[fid]
        rb=Image.open(right_body).convert('RGBA'); lb=Image.open(left_body).convert('RGBA'); expected=ImageOps.mirror(rb); diff=ImageChops.difference(expected,lb)
        body_exact=not diff.getbbox(); dx=0
        ledger.append({'frameId':fid,'rightBody':r['bodyFrame'],'leftBody':str(left_body.relative_to(ROOT)),'dxPx':dx,'bodyMirrorExact':body_exact,'rightBodySha256':sha(right_body),'leftBodySha256':sha(left_body)})
        if fid in RIGHT_BODY_CANDIDATE:
            cand=ROOT/RIGHT_BODY_CANDIDATE[fid]; cand_left=OUT/'body_candidates'/f'{fid}_{BODY_LEFT[fid]}'
            cand_left.parent.mkdir(parents=True,exist_ok=True); ImageOps.mirror(Image.open(cand).convert('RGBA')).save(cand_left); cand_sha=sha(cand_left); body_corr=r['bodyCorrection']+'; left candidate is deterministic horizontal mirror'
        else: cand_sha=sha(left_body); cand_left=None; body_corr='none'
        src=ROOT/RIGHT_WEAPONS[fid]; out=OUT/'sword_layers'/f'{fid}_left_sword.png'; ImageOps.mirror(Image.open(src).convert('RGBA')).save(out)
        grip=r['gripPointPx']; fist=r['fistCenterPx']; left_grip=[round(239-grip[0]+dx,6),grip[1]]; left_fist=[round(239-fist[0]+dx,6),fist[1]]; angle=norm_angle(r['angleDeg'])
        if fid in RIGHT_MASKS:
            msrc=ROOT/RIGHT_MASKS[fid]; mout=OUT/'occlusion_masks'/f'{fid}_left_mask.png'; ImageOps.mirror(Image.open(msrc).convert('L')).save(mout); occ={'path':str(mout.relative_to(ROOT)),'sha256':sha(mout)}
        else: occ={'path':'none','sha256':'none'}
        left_id=fid+'_left'
        left_rows.append({'frameId':left_id,'bodyFrame':'assets/characters/hero/battle45/'+BODY_LEFT[fid],'candidateBodySha256':cand_sha,'runtimeBodySha256':sha(left_body),'bodyCorrection':body_corr,'gripPointPx':left_grip,'fistCenterPx':left_fist,'angleDeg':angle,'angleDefinition':'horizontal mirror of right screen angle; 0°=screen-right, +Y down','layerOrder':r['layerOrder'],'maskPolicy':r['maskPolicy'] if r['maskPolicy']!='none' else 'none','occlusionMaskPath+occlusionMaskSha256':occ,'visibleStubs':r['visibleStubs']+'; horizontal mirror','status':'candidate-only'})
        qa.append({'frameId':left_id,'allMachineChecksPass':body_exact and out.exists(),'credits':0,'compositeNative':'none; deterministic mirror contact/QA primary','sourceRightFrame':fid,'derivedFromWeapon':str(src.relative_to(ROOT)),'derivedWeaponPath':str(out.relative_to(ROOT)),'weaponSha256':sha(out),'dxPx':dx,'bodyMirrorExact':body_exact})
    source_ledger=OUT/'qa/source_ledger.json'; source_ledger.write_text(json.dumps({'schema':'seq=232','dxFormula':'x_left=239-x_right+dx','dxSource':'runtime left/right body exact-mirror comparison; all dx=0','entries':ledger},ensure_ascii=False,indent=2)+'\n')
    merged=data.copy(); merged['schema']='seq=231+seq=232'; merged['templateSource']='PM2/rd seq=231 + left derivation seq=232'; merged['rows']=rows+left_rows; merged['qaSummary']=data['qaSummary']+qa; merged['reviewState']='candidate-only; visualReview=selected_by_Leo for right source; left visualReview=pending_Leo; specGate=pending_pm_scan; runtimeRelease=false'
    (OUT/'manifest-26rows-seq232.json').write_text(json.dumps(merged,ensure_ascii=False,indent=2)+'\n')
    (OUT/'qa/mirror_summary.json').write_text(json.dumps({'count':13,'allMachineChecksPass':all(x['allMachineChecksPass'] for x in qa),'sourceLedger':str(source_ledger.relative_to(ROOT)),'rows':qa},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'leftRows':len(left_rows),'allMachineChecksPass':all(x['allMachineChecksPass'] for x in qa),'allBodyExact':all(x['bodyMirrorExact'] for x in ledger),'manifestRows':len(merged['rows']),'manifestQaRows':len(merged['qaSummary'])},ensure_ascii=False))
if __name__=='__main__':
    from PIL import ImageChops,ImageOps
    main()
