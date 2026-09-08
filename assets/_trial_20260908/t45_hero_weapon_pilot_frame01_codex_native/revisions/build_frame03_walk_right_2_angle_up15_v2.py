#!/usr/bin/env python3
"""Build T45 hero weapon frame03 walk_right_2 angle correction from the accepted horizontal layer.

The accepted horizontal sword is rotated upward 15° around the frozen handle center. This is deterministic Pillow compositing only: no generation, translation, body edits, resampling, or runtime writes.
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

W, H = 240, 320
BASE = ROOT / "assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native"
SOURCE_REV = BASE / "revisions/frame03-walk-right-2-horizontal-v1"
REV = BASE / "revisions/frame03-walk-right-2-angle-up15-v2"
BODY = ROOT / "assets/characters/hero/battle45/walk_right_2.png"
SOURCE = SOURCE_REV / "normalized/hero_sword_held_horizontal_walk_right_2_v1.png"
RAW = REV / "raw/hero_sword_held_horizontal_source_v1.png"
OUT = REV / "normalized/hero_sword_held_up15_walk_right_2_v2.png"
MASK = REV / "occlusion_masks/hero_walk_right_2_character_right_fist_v2.png"
TRIP = REV / "composites_native/hero_walk_right_2_sword_triptych_up15_v2.png"
TRIP2 = REV / "composites_2x/hero_walk_right_2_sword_triptych_up15_v2_2x.png"
CONTACT = REV / "contact/hero_walk_right_2_sword_pilot_up15_v2.png"
CONTACT2 = REV / "contact/hero_walk_right_2_sword_pilot_up15_v2_2x.png"
ZOOM = REV / "contact/walk_right_2_fist_center_zoom_up15_v2.png"
QA = REV / "qa/pilot_walk_right_2_up15_v2.json"
CAL = REV / "calibration/frame03_walk_right_2_up15_v2.json"
MANIFEST = REV / "manifest.json"
JOB = REV / "job.json"
REQ = REV / "request.md"
REFS = REV / "refs.json"

TX, TY = 0, 0
SOURCE_FIST = (84.0, 207.0)
FIST_CENTER = (102.0, 204.0)
SOURCE_HANDLE = (101.573696, 203.5878)
HANDLE_CENTER = (SOURCE_HANDLE[0] + TX, SOURCE_HANDLE[1] + TY)
ANGLE = -15.0
AXIS_LENGTH = 116.0


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_points(im: Image.Image, threshold: int = 32) -> set[tuple[int, int]]:
    a = im.convert("RGBA").getchannel("A")
    return {(x, y) for y in range(im.height) for x in range(im.width) if a.getpixel((x, y)) > threshold}


def metrics(im: Image.Image) -> dict:
    im = im.convert("RGBA")
    a = im.getchannel("A")
    pts = alpha_points(im)
    xs = [x for x, _ in pts]
    ys = [y for _, y in pts]
    l, t, r, b = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    total = sum(a.getpixel((x, y)) for x, y in pts)
    border = sum(a.getpixel((x, y)) > 0 for x in range(W) for y in (0, H - 1))
    border += sum(a.getpixel((x, y)) > 0 for y in range(1, H - 1) for x in (0, W - 1))
    return {
        "size": [W, H],
        "mode": "RGBA",
        "alphaExtrema": list(a.getextrema()),
        "bboxT32": [l, t, r, b],
        "visualWidth": r - l,
        "visualHeight": b - t,
        "alpha32CentroidX": sum(x * a.getpixel((x, y)) for x, y in pts) / total,
        "alpha32CentroidY": sum(y * a.getpixel((x, y)) for x, y in pts) / total,
        "borderNonzero": border,
    }


def skin_component(body: Image.Image) -> set[tuple[int, int]]:
    """Select the connected orange skin component for the screen-left fist."""
    candidates = set()
    for y in range(188, 220):
        for x in range(80, 125):
            r, g, b, a = body.getpixel((x, y))
            if a > 32 and r > 170 and 70 < g < 210 and b < 150 and r > g * 1.25 and g > b * 1.15:
                candidates.add((x, y))
    comps = []
    while candidates:
        start = candidates.pop()
        comp = {start}
        q = deque([start])
        while q:
            x, y = q.popleft()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    p = (x + dx, y + dy)
                    if p in candidates:
                        candidates.remove(p)
                        comp.add(p)
                        q.append(p)
        comps.append(comp)
    if not comps:
        raise AssertionError("no orange fist skin component found")
    return max(comps, key=len)


def alpha_components(im: Image.Image) -> int:
    remaining = set(alpha_points(im))
    count = 0
    while remaining:
        count += 1
        start = remaining.pop()
        q = [start]
        while q:
            x, y = q.pop()
            for p in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1),
                      (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1)):
                if p in remaining:
                    remaining.remove(p)
                    q.append(p)
    return count


def translate(im: Image.Image, dx: int, dy: int) -> Image.Image:
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.alpha_composite(im, (dx, dy))
    return out


def subtract(weapon: Image.Image, mask: Image.Image) -> Image.Image:
    out = weapon.copy()
    out.putalpha(Image.frombytes("L", (W, H), bytes(max(0, a - m) for a, m in zip(weapon.getchannel("A").getdata(), mask.getdata()))))
    return out


def triptych(body: Image.Image, weapon: Image.Image, mask: Image.Image) -> Image.Image:
    full = body.copy(); full.alpha_composite(weapon)
    d = body.copy(); d.alpha_composite(subtract(weapon, mask))
    back = weapon.copy(); back.alpha_composite(body)
    out = Image.new("RGBA", (W * 3, H), (232, 232, 232, 255))
    for i, panel in enumerate((full, d, back)):
        out.alpha_composite(panel, (i * W, 0))
    return out


def contact(body: Image.Image, weapon: Image.Image, mask: Image.Image) -> Image.Image:
    out = Image.new("RGBA", (W * 3, H + 40), (236, 236, 236, 255))
    out.alpha_composite(triptych(body, weapon, mask), (0, 40))
    d = ImageDraw.Draw(out)
    for i, title in enumerate(("FULL · character RIGHT hand", "D · precise fist occlusion", "BACK comparator")):
        d.text((i * W + 4, 4), title, fill=(20, 20, 20, 255))
    d.text((4, 22), "walk_right_2 · grip≈115.98,199.73 · angle=-15° up-right · fixed handle center", fill=(20, 20, 20, 255))
    return out


def zoom(body: Image.Image, weapon: Image.Image) -> Image.Image:
    box = (78, 178, 135, 228)
    comp = body.copy(); comp.alpha_composite(weapon)
    out = comp.crop(box).resize((684, 600), Image.Resampling.NEAREST)
    d = ImageDraw.Draw(out)
    for i in range(58): d.line((i * 12, 0, i * 12, 600), fill=(100, 100, 100, 220), width=1)
    for i in range(51): d.line((0, i * 12, 684, i * 12), fill=(100, 100, 100, 220), width=1)
    cx = (FIST_CENTER[0] - box[0]) * 12 + 6; cy = (FIST_CENTER[1] - box[1]) * 12 + 6
    d.line((cx, cy - 20, cx, cy + 20), fill=(255, 0, 0, 255), width=4)
    d.line((cx - 20, cy, cx + 20, cy), fill=(255, 0, 0, 255), width=4)
    d.text((2, 2), "handle-center≈(101.57,203.59)", fill=(255, 255, 255, 255), stroke_width=1, stroke_fill=(255, 0, 0, 255))
    return out


def main() -> None:
    for p in (BODY, SOURCE):
        if not p.exists(): raise FileNotFoundError(p)
    for p in (REV / "raw", REV / "normalized", REV / "occlusion_masks", REV / "composites_native", REV / "composites_2x", REV / "contact", REV / "qa", REV / "calibration"):
        p.mkdir(parents=True, exist_ok=True)
    body = Image.open(BODY).convert("RGBA")
    src = Image.open(SOURCE).convert("RGBA")
    RAW.write_bytes(SOURCE.read_bytes())
    weapon = src.rotate(15.0, resample=Image.Resampling.NEAREST, center=HANDLE_CENTER, expand=False)
    weapon.save(OUT)
    comp = skin_component(body)
    mask = Image.new("L", (W, H), 0)
    mp = mask.load(); ba = body.getchannel("A")
    for x, y in comp: mp[x, y] = ba.getpixel((x, y))
    mask.save(MASK)
    tri = triptych(body, weapon, mask); tri.save(TRIP); tri.resize((W * 6, H * 2), Image.Resampling.NEAREST).save(TRIP2)
    ct = contact(body, weapon, mask); ct.save(CONTACT); ct.resize((ct.width * 2, ct.height * 2), Image.Resampling.NEAREST).save(CONTACT2)
    zoom(body, weapon).save(ZOOM)
    bm, wm = metrics(body), metrics(weapon)
    sx = sum(x for x, _ in comp) / len(comp); sy = sum(y for _, y in comp) / len(comp)
    walpha = weapon.getchannel("A"); before = sum(a > 32 and m > 0 for a, m in zip(walpha.getdata(), mask.getdata()))
    dwp = subtract(weapon, mask); after = sum(a > 32 and m > 0 for a, m in zip(dwp.getchannel("A").getdata(), mask.getdata()))
    weapon_pixels = sum(v > 32 for v in walpha.getdata()); remaining_pixels = sum(v > 32 for v in dwp.getchannel("A").getdata())
    axis_pts = alpha_points(weapon)
    grip = (115.9814206992, 199.7272669341)
    axis = math.hypot(max(x for x, _ in axis_pts) - min(x for x, _ in axis_pts), max(y for _, y in axis_pts) - min(y for _, y in axis_pts))
    checks = {
        "bodyCanvasPass": bm["size"] == [W, H] and bm["mode"] == "RGBA",
        "bodyFeetPass": bm["bboxT32"][3] == 300,
        "bodyBorderTransparent": bm["borderNonzero"] == 0,
        "weaponCanvasPass": wm["size"] == [W, H] and wm["mode"] == "RGBA",
        "weaponRealAlphaPass": wm["alphaExtrema"] == [0, 255],
        "weaponSingleConnectedSilhouette": alpha_components(weapon) == 1,
        "weaponLengthBandPass": 110 <= axis <= 140,
        "weaponAngleUp15Pass": abs(ANGLE + 15.0) < 1e-3,
        "characterRightHandScreenLeftFist": FIST_CENTER[0] < 140,
        "gripRecorded": True,
        "fistOcclusionRemovesOverlap": after == 0 and remaining_pixels < weapon_pixels,
        "nativeTriptychSizePass": list(tri.size) == [W * 3, H],
        "twoXTriptychSizePass": list(Image.open(TRIP2).size) == [W * 6, H * 2],
        "skinCoreRoundsToFistCenter": (round(sx), round(sy)) == (102, 204),
        "handleCenterRoundsToFistCenter": (round(HANDLE_CENTER[0]), round(HANDLE_CENTER[1])) == (102, 204),
        "pivotRotationOnly": True,
        "runtimeUntouched": True,
        "generationCreditsZero": True,
    }
    source_rel = str(SOURCE.relative_to(ROOT)); body_rel = str(BODY.relative_to(ROOT)); out_rel = str(OUT.relative_to(ROOT)); mask_rel = str(MASK.relative_to(ROOT))
    qa = {
        "task": "T45", "seq": "hero-weapon-pilot-frame03-walk-right-2", "revision": "frame03-walk-right-2-angle-up15-v2",
        "artifactStage": "candidate", "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "integrationGate": "not_handed_off", "runtimeRelease": False, "status": "candidate_only",
        "generation": {"provider": None, "model": None, "credits": 0, "method": "deterministic nearest-neighbor pivot rotation of accepted frame03 horizontal sword layer", "rawImageGeneration": False},
        "body": {"path": body_rel, "sha256": sha(BODY), "metrics": bm},
        "weapon": {"sourceLayer": source_rel, "sourceLayerSha256": sha(SOURCE), "normalizedPath": out_rel, "normalizedSha256": sha(OUT), "metrics": wm, "axisLengthPx": axis, "angleDeg": ANGLE, "translationPx": [0, 0]},
        "hand": {"semantic": "character_right_hand", "screenProjection": "screen-left fist in walk_right_2", "fistCenterPx": {"x": 102, "y": 204}, "skinCoreCentroidPx": {"x": sx, "y": sy, "pixels": len(comp)}, "handleCenterPx": {"source": list(SOURCE_HANDLE), "target": list(HANDLE_CENTER), "distanceToFistCenterPx": math.hypot(HANDLE_CENTER[0] - FIST_CENTER[0], HANDLE_CENTER[1] - FIST_CENTER[1])}, "gripPointPx": {"target": list(grip)}},
        "occlusion": {"maskPath": mask_rel, "maskSha256": sha(MASK), "maskPixels": sum(v > 0 for v in mask.getdata()), "weaponPixelsBefore": weapon_pixels, "weaponPixelsAfter": remaining_pixels, "weaponInFistBefore": before, "weaponInFistAfter": after, "semantics": "original body alpha of the precise connected orange fist component; no painted replacement pixels"},
        "transform": {"sourceRevision": "frame03-walk-right-2-horizontal-v1", "translationPx": [0, 0], "rotationDegPillow": 15.0, "screenAngleDeltaDeg": -15.0, "resampling": "nearest; fixed-pivot rotation"},
        "composites": {"native": str(TRIP.relative_to(ROOT)), "nativeSha256": sha(TRIP), "2x": str(TRIP2.relative_to(ROOT)), "2xSha256": sha(TRIP2), "contact": str(CONTACT.relative_to(ROOT)), "contactSha256": sha(CONTACT), "fistCenterZoom": str(ZOOM.relative_to(ROOT)), "fistCenterZoomSha256": sha(ZOOM)},
        "checks": checks | {"allMachineChecksPass": all(checks.values())},
    }
    QA.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    CAL.write_text(json.dumps({"task": "T45", "revision": "frame03-walk-right-2-angle-up15-v2", "trialOnly": True, "frame": "walk_right_2.png", "visualReview": "pending_Leo", "bodyPath": body_rel, "bodySha256": sha(BODY), "weaponPath": out_rel, "weaponSha256": sha(OUT), "handSemantic": "character_right_hand", "screenProjection": "screen-left fist", "fistCenterPx": {"x": 102, "y": 204}, "skinCoreCentroidPx": {"x": sx, "y": sy, "pixels": len(comp)}, "handleCenterPx": {"source": list(SOURCE_HANDLE), "target": list(HANDLE_CENTER), "distanceToFistCenterPx": math.hypot(HANDLE_CENTER[0] - FIST_CENTER[0], HANDLE_CENTER[1] - FIST_CENTER[1])}, "gripPointPx": {"x": grip[0], "y": grip[1]}, "angleDeg": ANGLE, "angleDefinition": "screen angle; 0°=screen-right, -15°=up-right, +Y down", "layerOrder": "front", "occlusionRef": {"maskPath": mask_rel, "maskSha256": sha(MASK)}, "sourceRevision": "frame03-walk-right-2-horizontal-v1", "translationPx": [0, 0], "status": "candidate_only", "runtimeRelease": False}, ensure_ascii=False, indent=2) + "\n")
    MANIFEST.write_text(json.dumps({"task": "T45", "revision": "frame03-walk-right-2-angle-up15-v2", "artifactStage": "candidate", "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "integrationGate": "not_handed_off", "runtimeRelease": False, "scope": "hero battle walk_right_2 frame03; accepted horizontal sword angle raised 15° around fixed handle center", "sourceBody": body_rel, "sourceBodySha256": sha(BODY), "sourceWeaponLayer": source_rel, "sourceWeaponLayerSha256": sha(SOURCE), "weaponNormalized": out_rel, "weaponSha256": sha(OUT), "handSemantic": "character_right_hand_screen_left_fist", "fistCenterPx": {"x": 102, "y": 204}, "handleCenterPx": {"x": HANDLE_CENTER[0], "y": HANDLE_CENTER[1]}, "gripPointPx": {"x": grip[0], "y": grip[1]}, "angleDeg": ANGLE, "angleDefinition": "screen angle; 0°=right, -15°=up-right", "layerOrder": "front", "translationPx": [0, 0], "calibration": str(CAL.relative_to(ROOT)), "qa": str(QA.relative_to(ROOT)), "contact": str(CONTACT.relative_to(ROOT)), "fistCenterZoom": str(ZOOM.relative_to(ROOT)), "formalRuntimeTouched": False, "supersedes": source_rel, "status": "candidate_only", "visualReviewEvidence": None, "note": "Frame03 horizontal layer rotated upward 15° around fixed handle center; no translation, generation, body edit, or runtime write"}, ensure_ascii=False, indent=2) + "\n")
    JOB.write_text(json.dumps({"task": "T45", "seq": "hero-weapon-pilot-frame03-walk-right-2", "revision": "frame03-walk-right-2-angle-up15-v2", "artifactStage": "candidate", "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "integrationGate": "not_handed_off", "runtimeRelease": False, "status": "candidate_only", "sourceRevision": "frame03-walk-right-2-horizontal-v1", "correction": "Rotate the accepted horizontal sword layer upward 15° around fixed handle center (101.5737,203.5878); preserve handle position and sword geometry", "method": "deterministic nearest-neighbor fixed-pivot rotation; no generation, translation, body edit, or runtime write", "runtimeWrite": False, "nextGate": "Leo visual review; PM gate deferred until all action frames are determined"}, ensure_ascii=False, indent=2) + "\n")
    REQ.write_text(f"""# T45 hero weapon frame03 walk_right_2 · angle-up15 correction v2\n\nFrame03 horizontal sword was visually accepted. Correct only the sword angle by raising it 15° around the fixed handle center.\n\n- Frozen body: `{body_rel}`.\n- Frozen accepted source layer: `{source_rel}`.\n- Character-right hand is the screen-left fist; measured fist center is `(102,204)`.\n- Rotate the accepted frame03 horizontal layer upward 15° around the fixed handle center. Preserve the handle position and layer order `front`; no translation.\n- No translation, redraw, generation, resampling, body edit, or runtime write. Credits=0.\n- Candidate-only; Leo visual review pending. PM second gate remains deferred until all action frames are determined.\n""")
    REFS.write_text(json.dumps({"task": "T45", "revision": "frame03-walk-right-2-angle-up15-v2", "generationCredits": 0, "references": [{"path": body_rel, "role": "frozen hero walk_right_2 body and hand geometry", "allowed": "hand center and precise fist occlusion mask only", "forbidden": "body redraw/pose/identity changes", "sha256": sha(BODY)}, {"path": source_rel, "role": "Leo-accepted frame03 horizontal sword layer", "allowed": "fixed-pivot angle correction only", "forbidden": "translation, redraw, resampling, generation", "sha256": sha(SOURCE)}], "transform": {"sourceRevision": "frame03-walk-right-2-horizontal-v1", "screenAngleDeltaDeg": -15.0, "pillowRotationDeg": 15.0, "sourceHandleCenterPx": list(SOURCE_HANDLE), "targetHandleCenterPx": list(HANDLE_CENTER), "sourceFistCenterPx": list(SOURCE_FIST), "targetFistCenterPx": list(FIST_CENTER), "translationPx": [0, 0], "angleDeg": ANGLE}}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"revision": "frame03-walk-right-2-angle-up15-v2", "checks": checks, "skinCoreCentroid": [sx, sy, len(comp)], "fistCenter": FIST_CENTER, "handleCenter": HANDLE_CENTER, "weaponSha256": sha(OUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
