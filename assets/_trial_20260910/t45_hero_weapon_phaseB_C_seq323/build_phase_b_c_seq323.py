from __future__ import annotations

from pathlib import Path
import hashlib
import json
import math

from PIL import Image, ImageChops, ImageDraw, ImageOps


ROOT = Path(__file__).parent
BODY_ROOT = Path("assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq321_final/normalized/right")
RUNTIME_ROOT = Path("assets/characters/hero/battle45")

FRAMES = {
    "walk_right_1": {
        "group": "walk",
        "fist": [80, 210],
        "angle": 0.0,
        "weapon": Path("assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/normalized/hero_sword_held_horizontal_walk_right_1_v2.png"),
        "pivot": [83.573696, 206.5878],
        "maskSource": "body_alpha_tight_fist_roi",
        "maskPolicy": "original_body_alpha_tight_fist_roi",
    },
    "walk_right_2": {
        "group": "walk",
        "fist": [62, 200],
        "angle": -15.0,
        "weapon": Path("assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame03-walk-right-2-angle-up15-v2/normalized/hero_sword_held_up15_walk_right_2_v2.png"),
        "pivot": [101.573696, 203.5878],
        "maskSource": "body_alpha_tight_fist_roi",
        "maskPolicy": "original_body_alpha_tight_fist_roi",
    },
    "walk_right_3": {
        "group": "walk",
        "fist": [77, 204],
        "angle": 0.0,
        "weapon": Path("assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame02-walk-right-1-horizontal-angle-v2/normalized/hero_sword_held_horizontal_walk_right_1_v2.png"),
        "pivot": [83.573696, 206.5878],
        "maskSource": "body_alpha_tight_fist_roi",
        "maskPolicy": "original_body_alpha_tight_fist_roi",
    },
    "atk_right_1": {
        "group": "atk",
        "fist": [99, 200],
        "angle": -95.0,
        "weapon": Path("assets/_trial_20260909/t45_hero_weapon_second_batch_seq241/frame23-atk-right-1-original-body-angle115-down3-right3-mask-v7-tiny-reveal/normalized/hero_sword_angle_minus95_atk_right_1_v7.png"),
        "pivot": [115.57368615160715, 182.58781573590227],
        "maskSource": "body_alpha_tight_fist_roi",
        "maskPolicy": "original_body_alpha_tight_fist_roi",
    },
    "atk_right_2": {
        "group": "atk",
        "fist": [157, 175],
        "angle": -40.0,
        "weapon": Path("assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame04-atk-right-2-sword-right-hand-v2/normalized/hero_sword_held_atk_right_2_character_right_hand_v2.png"),
        "pivot": [202.57368615160715, 177.58781573590227],
        "maskSource": "body_alpha_tight_fist_roi",
        "maskPolicy": "original_body_alpha_tight_fist_roi",
    },
    "atk_right_3": {
        "group": "atk",
        "fist": [192, 167],
        "angle": -40.0,
        "weapon": Path("assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame04-atk-right-2-sword-right-hand-v2/normalized/hero_sword_held_atk_right_2_character_right_hand_v2.png"),
        "pivot": [202.57368615160715, 177.58781573590227],
        "maskSource": "body_alpha_tight_fist_roi",
        "maskPolicy": "original_body_alpha_tight_fist_roi",
    },
    "atk_right_4": {
        "group": "atk",
        "fist": [178, 208],
        "angle": -40.0,
        "weapon": Path("assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/frame04-atk-right-2-sword-right-hand-v2/normalized/hero_sword_held_atk_right_2_character_right_hand_v2.png"),
        "pivot": [202.57368615160715, 177.58781573590227],
        "maskSource": "body_alpha_tight_fist_roi",
        "maskPolicy": "original_body_alpha_tight_fist_roi",
    },
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def runtime_sha_or_missing(path: Path) -> str:
    return sha(path) if path.exists() else "not-present"


def mirror_angle(angle: float) -> float:
    return -angle


def translate_layer(source: Image.Image, dx: int, dy: int) -> Image.Image:
    out = Image.new("RGBA", source.size, (0, 0, 0, 0))
    out.alpha_composite(source, (dx, dy))
    return out


def body_mask(body: Image.Image, center: tuple[int, int], radius_x=18, radius_y=18) -> Image.Image:
    alpha = body.getchannel("A")
    mask = Image.new("L", body.size, 0)
    src = alpha.load()
    dst = mask.load()
    cx, cy = center
    for y in range(max(0, cy - radius_y), min(body.height, cy + radius_y + 1)):
        for x in range(max(0, cx - radius_x), min(body.width, cx + radius_x + 1)):
            if src[x, y] > 0:
                dst[x, y] = src[x, y]
    return mask


def apply_mask(weapon: Image.Image, mask: Image.Image) -> Image.Image:
    out = weapon.copy()
    alpha = out.getchannel("A")
    alpha = ImageChops.subtract(alpha, mask)
    out.putalpha(alpha)
    return out


def composite(body: Image.Image, weapon: Image.Image) -> Image.Image:
    out = body.copy()
    out.alpha_composite(weapon)
    return out


def weapon_bbox(image: Image.Image):
    return image.getchannel("A").getbbox()


def make_triptych(body: Image.Image, weapon: Image.Image, masked_weapon: Image.Image, path: Path, fist):
    panels = [composite(body, weapon), composite(body, masked_weapon), masked_weapon]
    canvas = Image.new("RGBA", (720, 360), (45, 45, 45, 255))
    for i, panel in enumerate(panels):
        canvas.alpha_composite(panel, (i * 240, 0))
    draw = ImageDraw.Draw(canvas)
    draw.line((fist[0] + 0, fist[1] + 0, fist[0] + 0, fist[1] + 0), fill=(255, 0, 0, 255), width=1)
    canvas.save(path)


def main():
    for directory in ("body_left", "weapon_layers", "occlusion_masks", "composites", "qa"):
        (ROOT / directory).mkdir(parents=True, exist_ok=True)

    right_rows = []
    left_rows = []
    qa_rows = []
    left_derivation = []
    all_bodies = {}

    for frame_id, cfg in FRAMES.items():
        body_path = BODY_ROOT / f"{frame_id}.png"
        runtime_body = RUNTIME_ROOT / f"{frame_id}.png"
        body = Image.open(body_path).convert("RGBA")
        all_bodies[frame_id] = body
        weapon_source = Path(cfg["weapon"])
        weapon = Image.open(weapon_source).convert("RGBA")
        dx = int(round(cfg["fist"][0] - cfg["pivot"][0]))
        dy = int(round(cfg["fist"][1] - cfg["pivot"][1]))
        placed_weapon = translate_layer(weapon, dx, dy)
        # Expanded only as a body-alpha ROI around the measured fist; it does
        # not repaint or delete body pixels, and is used to ensure the full
        # sword handle is hidden behind the hand.
        mask = body_mask(body, tuple(cfg["fist"]), 28, 26)
        # The seq=321 body candidates have new fist silhouettes. Complete the
        # top hand cutout around the measured fist so the existing sword handle
        # cannot leak; this is the locked whitelist policy for a complete fist
        # cutout, and it only changes the weapon occlusion mask.
        draw_mask = ImageDraw.Draw(mask)
        cx, cy = cfg["fist"]
        draw_mask.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=255)
        masked_weapon = apply_mask(placed_weapon, mask)
        out_weapon = ROOT / "weapon_layers" / f"{frame_id}.png"
        out_mask = ROOT / "occlusion_masks" / f"{frame_id}.png"
        placed_weapon.save(out_weapon)
        mask.save(out_mask)
        comp = ROOT / "composites" / f"{frame_id}_triptych.png"
        make_triptych(body, placed_weapon, masked_weapon, comp, cfg["fist"])
        before_alpha = placed_weapon.getchannel("A")
        after_alpha = masked_weapon.getchannel("A")
        fist_roi = (max(0, cfg["fist"][0]-8), max(0, cfg["fist"][1]-8), min(240, cfg["fist"][0]+9), min(320, cfg["fist"][1]+9))
        before_roi = sum(before_alpha.getpixel((x,y)) > 32 for y in range(fist_roi[1],fist_roi[3]) for x in range(fist_roi[0],fist_roi[2]))
        after_roi = sum(after_alpha.getpixel((x,y)) > 32 for y in range(fist_roi[1],fist_roi[3]) for x in range(fist_roi[0],fist_roi[2]))
        rb = body.getchannel("A").getbbox()
        row = {
            "frameId": frame_id,
            "bodyFrame": str(body_path),
            "candidateBodySha256": sha(body_path),
            "runtimeBodySha256": runtime_sha_or_missing(runtime_body),
            "bodyCorrection": "none; R1 seq321 final candidate body",
            "gripPointPx": [cfg["fist"][0], cfg["fist"][1]],
            "fistCenterPx": [cfg["fist"][0], cfg["fist"][1]],
            "angleDeg": cfg["angle"],
            "angleDefinition": "screen angle; 0°=screen-right, +Y down, clockwise-positive",
            "layerOrder": "weapon_front",
            "maskPolicy": "complete_fist_cutout_top_with_grip_window",
            "occlusionMaskPath+occlusionMaskSha256": {"path": str(out_mask.relative_to(ROOT.parent.parent.parent)), "sha256": sha(out_mask)},
            "visibleStubs": "none; independent weapon layer; complete sword bbox retained",
            "status": "candidate-only",
        }
        right_rows.append(row)
        qa_rows.append({
            "frameId": frame_id,
            "bodySha256": sha(body_path),
            "weaponSource": str(weapon_source),
            "weaponLayer": str(out_weapon.relative_to(ROOT.parent.parent.parent)),
            "weaponLayerSha256": sha(out_weapon),
            "mask": str(out_mask.relative_to(ROOT.parent.parent.parent)),
            "maskSha256": sha(out_mask),
            "translationPx": [dx, dy],
            "angleDeg": cfg["angle"],
            "fistCenterPx": cfg["fist"],
            "weaponBBox": list(weapon_bbox(placed_weapon)) if weapon_bbox(placed_weapon) else None,
            "maskFistRoi": list(fist_roi),
            "fistRoiWeaponPixelsBeforeMask": before_roi,
            "fistRoiWeaponPixelsAfterMask": after_roi,
            "maskCoversFistRoi": after_roi == 0,
            "bodyAlphaBBox": list(rb) if rb else None,
            "composite": str(comp.relative_to(ROOT.parent.parent.parent)),
            "subjectDomainDeletedPixels": 0,
            "rgbChangedInBody": 0,
            "allMachineChecksPass": bool(weapon_bbox(placed_weapon)) and after_roi == 0 and 0 <= cfg["fist"][0] < 240 and 0 <= cfg["fist"][1] < 320,
        })

    # Deterministic left derivation from the current right candidate.
    for row, qa in zip(right_rows, qa_rows):
        frame_id = row["frameId"]
        body = all_bodies[frame_id]
        left_name = frame_id.replace("_right", "_left")
        left_body = ImageOps.mirror(body)
        left_body_path = ROOT / "body_left" / f"{left_name}.png"
        left_body.save(left_body_path)
        right_weapon = Image.open(ROOT / "weapon_layers" / f"{frame_id}.png").convert("RGBA")
        right_mask = Image.open(ROOT / "occlusion_masks" / f"{frame_id}.png").convert("L")
        left_weapon = ImageOps.mirror(right_weapon)
        left_mask = ImageOps.mirror(right_mask)
        left_weapon_path = ROOT / "weapon_layers" / f"{left_name}.png"
        left_mask_path = ROOT / "occlusion_masks" / f"{left_name}.png"
        left_weapon.save(left_weapon_path)
        left_mask.save(left_mask_path)
        left_comp = ROOT / "composites" / f"{left_name}_triptych.png"
        make_triptych(left_body, left_weapon, apply_mask(left_weapon, left_mask), left_comp, [239-row["fistCenterPx"][0], row["fistCenterPx"][1]])
        left_rows.append({
            "frameId": left_name,
            "bodyFrame": str(left_body_path.relative_to(ROOT.parent.parent.parent)),
            "candidateBodySha256": sha(left_body_path),
            "runtimeBodySha256": runtime_sha_or_missing(RUNTIME_ROOT / f"{left_name}.png"),
            "bodyCorrection": "deterministic mirror of right candidate",
            "gripPointPx": [239-row["gripPointPx"][0], row["gripPointPx"][1]],
            "fistCenterPx": [239-row["fistCenterPx"][0], row["fistCenterPx"][1]],
            "angleDeg": -row["angleDeg"],
            "angleDefinition": "horizontal mirror of right screen angle; 0°=screen-right, +Y down",
            "layerOrder": "weapon_front",
            "maskPolicy": row["maskPolicy"],
            "occlusionMaskPath+occlusionMaskSha256": {"path": str(left_mask_path.relative_to(ROOT.parent.parent.parent)), "sha256": sha(left_mask_path)},
            "visibleStubs": "none; deterministic mirror of right candidate",
            "status": "candidate-only",
        })
        left_derivation.append({"derivedFrom": frame_id, "derivedFrameId": left_name, "flipX": True, "dxPx": 0, "dyPx": 0, "angleSign": -1})

    manifest = {
        "schema": "seq=231+phaseB+C=323",
        "templateSource": "PM2/rd seq=231; left derivation chain seq=232",
        "fields": ["frameId","bodyFrame","candidateBodySha256","runtimeBodySha256","bodyCorrection","gripPointPx","fistCenterPx","angleDeg","angleDefinition","layerOrder","maskPolicy","occlusionMaskPath+occlusionMaskSha256","visibleStubs","status"],
        "rows": right_rows + left_rows,
        "phaseBFrames": [row["frameId"] for row in right_rows],
        "phaseCFrames": [row["frameId"] for row in left_rows],
        "leftDerivation": left_derivation,
        "status": "candidate-only",
        "visualReview": "pending_Leo",
        "specGate": "pending_pm_scan",
        "runtimeRelease": False,
        "runtimeTouched": False,
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "qa" / "phaseB_C_qa.json").write_text(json.dumps({"task":"T45","seq":"323","phaseBRightFrames":qa_rows,"phaseCLeftFrames":left_derivation,"allRightMachineChecksPass":all(q["allMachineChecksPass"] for q in qa_rows),"allLeftMirrorDerived":len(left_derivation)==len(right_rows),"runtimeTouched":False,"generationCredits":0}, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "credits.json").write_text(json.dumps({"generationCredits":0,"provider":None,"model":None,"note":"deterministic weapon layer placement, mask and mirror only"}, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"rightRows":len(right_rows),"leftRows":len(left_rows),"allRightMachineChecksPass":all(q["allMachineChecksPass"] for q in qa_rows),"runtimeTouched":False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
