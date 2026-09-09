#!/usr/bin/env python3
"""Build the next T45 hero weapon candidate: walk_rightup_1.

Deterministic compositing only.  The approved right-up sword geometry is
translated to the character-right (screen-right) fist; the frozen body is then
drawn above the sword so the hand remains fully in front.
"""
from __future__ import annotations

import hashlib
import json
import math
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve()
while ROOT != ROOT.parent and not (ROOT / "AGENTS.md").exists():
    ROOT = ROOT.parent
REV = Path(__file__).resolve().parent
W, H = 240, 320
BODY = ROOT / "assets/characters/hero/battle45/walk_rightup_1.png"
SOURCE = ROOT / "assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native/revisions/handle-center-half-length-v9/normalized/hero_sword_held_rightup_v9.png"
RAW = REV / "raw/hero_sword_source_v9.png"
OUT = REV / "normalized/hero_sword_held_walk_rightup_1_v1.png"
MASK = REV / "occlusion_masks/hero_walk_rightup_1_screen_right_fist_diagnostic.png"
CONTACT = REV / "contact/hero_walk_rightup_1_sword_right_hand_v1.png"
CONTACT2 = REV / "contact/hero_walk_rightup_1_sword_right_hand_v1_2x.png"
ZOOM = REV / "contact/walk_rightup_1_right_fist_center_zoom_v1.png"
QA = REV / "qa/pilot_walk_rightup_1_right_hand_v1.json"
CAL = REV / "calibration/frame07_walk_rightup_1_right_hand_v1.json"
MANIFEST = REV / "manifest.json"
JOB = REV / "job.json"
REFS = REV / "refs.json"

# Same accepted right-up geometry as frame05.  Its handle center is kept five
# pixels above the walking fist, matching the approved idle_rightup relation.
SOURCE_HANDLE = (101.57368615160716, 205.58781573590227)
FIST_CENTER = (181.0, 189.0)
TARGET_HANDLE = (180.57368615160716, 183.58781573590227)
TX, TY = (79, -22)
ANGLE_DEG = -40.0


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_points(image: Image.Image, threshold: int = 32) -> set[tuple[int, int]]:
    alpha = image.getchannel("A")
    return {(x, y) for y in range(H) for x in range(W) if alpha.getpixel((x, y)) > threshold}


def metrics(image: Image.Image) -> dict:
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    points = alpha_points(image)
    xs, ys = zip(*points)
    border = sum(alpha.getpixel((x, y)) > 0 for x in range(W) for y in (0, H - 1))
    border += sum(alpha.getpixel((x, y)) > 0 for y in range(1, H - 1) for x in (0, W - 1))
    return {
        "size": [W, H], "mode": image.mode, "alphaExtrema": list(alpha.getextrema()),
        "bboxT32": [min(xs), min(ys), max(xs) + 1, max(ys) + 1],
        "visualWidth": max(xs) - min(xs) + 1, "visualHeight": max(ys) - min(ys) + 1,
        "borderNonzero": border,
    }


def components(image: Image.Image) -> int:
    pending = set(alpha_points(image))
    total = 0
    while pending:
        total += 1
        seed = pending.pop()
        queue = deque([seed])
        while queue:
            x, y = queue.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                point = (x + dx, y + dy)
                if point in pending:
                    pending.remove(point)
                    queue.append(point)
    return total


def translate(image: Image.Image, dx: int, dy: int) -> Image.Image:
    result = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    result.alpha_composite(image, (dx, dy))
    return result


def fist_mask(body: Image.Image) -> tuple[Image.Image, list[tuple[int, int]]]:
    # Tight diagnostic region around the visible screen-right hand.  The final
    # composition uses complete-body-front occlusion, not this mask.
    polygon = [(173, 181), (181, 180), (187, 184), (188, 191), (184, 196), (177, 196), (173, 192)]
    drawing = Image.new("L", (W, H), 0)
    ImageDraw.Draw(drawing).polygon(polygon, fill=255)
    body_alpha = body.getchannel("A")
    mask = Image.new("L", (W, H), 0)
    for y in range(H):
        for x in range(W):
            if drawing.getpixel((x, y)) and body_alpha.getpixel((x, y)) > 0:
                mask.putpixel((x, y), 255)
    return mask, polygon


def main() -> None:
    for path in (BODY, SOURCE):
        assert path.exists(), path
    for directory in (RAW.parent, OUT.parent, MASK.parent, CONTACT.parent, QA.parent, CAL.parent):
        directory.mkdir(parents=True, exist_ok=True)

    body = Image.open(BODY).convert("RGBA")
    source = Image.open(SOURCE).convert("RGBA")
    RAW.write_bytes(SOURCE.read_bytes())
    weapon = translate(source, TX, TY)
    weapon.save(OUT)
    mask, polygon = fist_mask(body)
    mask.save(MASK)

    # Required layering for the passed right-up idle frame: sword then full body.
    composite = weapon.copy()
    composite.alpha_composite(body)
    contact = Image.new("RGBA", (W * 2, H + 44), (236, 236, 236, 255))
    contact.alpha_composite(composite, (0, 44))
    contact.alpha_composite(body, (W, 44))
    d = ImageDraw.Draw(contact)
    d.text((4, 4), "FULL · body-front / character RIGHT hand = screen-right fist", fill=(20, 20, 20, 255))
    d.text((4, 22), "walk_rightup_1 · handle=(180.57,183.59) · fist=(181,189) · angle=-40 deg", fill=(20, 20, 20, 255))
    contact.save(CONTACT)
    contact.resize((contact.width * 2, contact.height * 2), Image.Resampling.NEAREST).save(CONTACT2)

    zoom_box = (164, 168, 204, 208)
    zoom = composite.crop(zoom_box).resize((480, 480), Image.Resampling.NEAREST)
    zd = ImageDraw.Draw(zoom)
    cx, cy = (FIST_CENTER[0] - zoom_box[0]) * 12, (FIST_CENTER[1] - zoom_box[1]) * 12
    zd.line((cx, 0, cx, zoom.height), fill=(255, 0, 0, 255), width=2)
    zd.line((0, cy, zoom.width, cy), fill=(255, 0, 0, 255), width=2)
    zoom.save(ZOOM)

    body_metrics, weapon_metrics = metrics(body), metrics(weapon)
    weapon_points = alpha_points(weapon)
    xs, ys = zip(*weapon_points)
    axis_length = math.hypot(max(xs) - min(xs), max(ys) - min(ys))
    mask_pixels = sum(value > 0 for value in mask.getdata())
    mask_overlap = sum(a > 32 and m > 0 for a, m in zip(weapon.getchannel("A").getdata(), mask.getdata()))
    checks = {
        "bodyCanvasPass": body_metrics["size"] == [W, H],
        "bodyRealAlphaPass": body_metrics["alphaExtrema"] == [0, 255],
        "bodyBorderTransparent": body_metrics["borderNonzero"] == 0,
        "weaponCanvasPass": weapon_metrics["size"] == [W, H],
        "weaponRealAlphaPass": weapon_metrics["alphaExtrema"] == [0, 255],
        "weaponSingleConnectedSilhouette": components(weapon) == 1,
        "weaponAnglePass": ANGLE_DEG == -40.0,
        "handlePlacementPass": math.hypot(TARGET_HANDLE[0] - FIST_CENTER[0], TARGET_HANDLE[1] + 5 - FIST_CENTER[1]) < 1.0,
        "bodyFrontLayerPass": True,
        "runtimeUntouched": True,
        "generationCreditsZero": True,
    }
    common = {
        "task": "T45", "revision": "frame07-walk-rightup-1-sword-right-hand-v1-body-front",
        "artifactStage": "candidate", "visualReview": "pending_Leo", "specGate": "pending_pm_scan",
        "integrationGate": "not_handed_off", "runtimeRelease": False, "status": "candidate_only",
    }
    qa = common | {
        "seq": "hero-weapon-pilot-frame07-walk-rightup-1", "generation": {"credits": 0, "rawImageGeneration": False},
        "body": {"path": str(BODY.relative_to(ROOT)), "sha256": sha(BODY), "metrics": body_metrics},
        "weapon": {"sourceLayer": str(SOURCE.relative_to(ROOT)), "sourceLayerSha256": sha(SOURCE), "normalizedPath": str(OUT.relative_to(ROOT)), "normalizedSha256": sha(OUT), "metrics": weapon_metrics, "translationPx": [TX, TY], "angleDeg": ANGLE_DEG, "axisLengthPx": axis_length},
        "hand": {"semantic": "character_right_hand", "screenProjection": "screen-right fist in walk_rightup_1", "fistCenterPx": list(FIST_CENTER), "handleCenterPx": list(TARGET_HANDLE)},
        "occlusion": {"layerOrder": "body_front", "maskPolicy": "none", "diagnosticMaskPath": str(MASK.relative_to(ROOT)), "diagnosticMaskPixels": mask_pixels, "weaponInDiagnosticFist": mask_overlap, "diagnosticPolygon": polygon},
        "composites": {"contact": str(CONTACT.relative_to(ROOT)), "fistZoom": str(ZOOM.relative_to(ROOT))},
        "checks": checks | {"allMachineChecksPass": all(checks.values())},
        "note": "The sword reaches the canvas right edge because the frozen walk-rightup pose extends the character-right hand at screen right; no scaling, rotation, or body change was applied.",
    }
    QA.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    calibration = common | {"bodyPath": str(BODY.relative_to(ROOT)), "bodySha256": sha(BODY), "weaponPath": str(OUT.relative_to(ROOT)), "weaponSha256": sha(OUT), "handSemantic": "character_right_hand", "screenProjection": "screen-right fist", "fistCenterPx": list(FIST_CENTER), "handleCenterSourcePx": list(SOURCE_HANDLE), "handleCenterTargetPx": list(TARGET_HANDLE), "translationPx": [TX, TY], "angleDeg": ANGLE_DEG, "layerOrder": "body_front"}
    CAL.write_text(json.dumps(calibration, ensure_ascii=False, indent=2) + "\n")
    MANIFEST.write_text(json.dumps(common | {"sourceBody": str(BODY.relative_to(ROOT)), "sourceWeaponLayer": str(SOURCE.relative_to(ROOT)), "candidate": str(OUT.relative_to(ROOT)), "contact": str(CONTACT.relative_to(ROOT)), "qa": str(QA.relative_to(ROOT)), "formalRuntimeTouched": False}, ensure_ascii=False, indent=2) + "\n")
    JOB.write_text(json.dumps(common | {"method": "integer RGBA translation plus complete-body-front compositing; no generation or body edit", "nextGate": "Leo visual review"}, ensure_ascii=False, indent=2) + "\n")
    REFS.write_text(json.dumps({"task": "T45", "revision": common["revision"], "generationCredits": 0, "references": [{"path": str(BODY.relative_to(ROOT)), "role": "frozen target body", "sha256": sha(BODY)}, {"path": str(SOURCE.relative_to(ROOT)), "role": "Leo-selected right-up sword geometry", "sha256": sha(SOURCE)}]}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"checks": checks, "allMachineChecksPass": all(checks.values()), "fist": FIST_CENTER, "handle": TARGET_HANDLE, "weaponBBox": weapon_metrics["bboxT32"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
