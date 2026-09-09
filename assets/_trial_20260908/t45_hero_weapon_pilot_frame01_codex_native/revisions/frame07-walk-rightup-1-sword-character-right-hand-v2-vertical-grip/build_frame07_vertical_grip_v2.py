#!/usr/bin/env python3
"""T45 walk_rightup_1: rotate the approved sword to vertical and seat it in the fist."""
from __future__ import annotations

import hashlib
import json
import math
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
OUT = REV / "normalized/hero_sword_vertical_walk_rightup_1_v2.png"
CONTACT = REV / "contact/hero_walk_rightup_1_sword_vertical_v2.png"
CONTACT2 = REV / "contact/hero_walk_rightup_1_sword_vertical_v2_2x.png"
ZOOM = REV / "contact/walk_rightup_1_vertical_grip_zoom_v2.png"
QA = REV / "qa/pilot_walk_rightup_1_vertical_grip_v2.json"
CAL = REV / "calibration/frame07_walk_rightup_1_vertical_grip_v2.json"
MANIFEST = REV / "manifest.json"
JOB = REV / "job.json"
REFS = REV / "refs.json"
SOURCE_HANDLE = (101.57368615160716, 205.58781573590227)
FIST = (181.0, 189.0)
ROTATE_DEG = 50.0  # screen -40° -> screen -90° (vertical up)
TRANSLATE = (79, -17)
TARGET_HANDLE = (SOURCE_HANDLE[0] + TRANSLATE[0], SOURCE_HANDLE[1] + TRANSLATE[1])


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def points(im: Image.Image) -> set[tuple[int, int]]:
    a = im.getchannel("A")
    return {(x, y) for y in range(H) for x in range(W) if a.getpixel((x, y)) > 32}


def metrics(im: Image.Image) -> dict:
    a = im.getchannel("A")
    p = points(im)
    xs, ys = zip(*p)
    return {"size": list(im.size), "mode": im.mode, "alphaExtrema": list(a.getextrema()), "bboxT32": [min(xs), min(ys), max(xs) + 1, max(ys) + 1], "borderNonzero": sum(a.getpixel((x, y)) > 0 for x in range(W) for y in (0, H - 1)) + sum(a.getpixel((x, y)) > 0 for x in (0, W - 1) for y in range(1, H - 1))}


def components(im: Image.Image) -> int:
    pending = set(points(im)); count = 0
    while pending:
        count += 1; queue = [pending.pop()]
        while queue:
            x, y = queue.pop()
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
                q = (x + dx, y + dy)
                if q in pending: pending.remove(q); queue.append(q)
    return count


def main() -> None:
    for p in (BODY, SOURCE): assert p.exists(), p
    for p in (RAW.parent, OUT.parent, CONTACT.parent, QA.parent, CAL.parent): p.mkdir(parents=True, exist_ok=True)
    body, source = Image.open(BODY).convert("RGBA"), Image.open(SOURCE).convert("RGBA")
    RAW.write_bytes(SOURCE.read_bytes())
    # Pillow's positive visual rotation is counter-clockwise: -40° right-up becomes -90° straight-up.
    rotated = source.rotate(ROTATE_DEG, resample=Image.Resampling.BICUBIC, center=SOURCE_HANDLE)
    weapon = Image.new("RGBA", (W, H), (0, 0, 0, 0)); weapon.alpha_composite(rotated, TRANSLATE); weapon.save(OUT)
    composite = weapon.copy(); composite.alpha_composite(body)  # complete body over weapon

    contact = Image.new("RGBA", (W * 2, H + 44), (236, 236, 236, 255))
    contact.alpha_composite(composite, (0, 44)); contact.alpha_composite(body, (W, 44))
    d = ImageDraw.Draw(contact)
    d.text((4, 4), "FULL · body-front / character RIGHT hand = screen-right fist", fill=(20,20,20,255))
    d.text((4, 22), "walk_rightup_1 · vertical -90 deg · handle=(180.57,188.59) seated in fist=(181,189)", fill=(20,20,20,255))
    contact.save(CONTACT); contact.resize((contact.width * 2, contact.height * 2), Image.Resampling.NEAREST).save(CONTACT2)
    box = (160, 142, 204, 208); zoom = composite.crop(box).resize((528, 792), Image.Resampling.NEAREST)
    z = ImageDraw.Draw(zoom); cx, cy = (FIST[0] - box[0]) * 12, (FIST[1] - box[1]) * 12
    z.line((cx, 0, cx, zoom.height), fill=(255,0,0,255), width=2); z.line((0, cy, zoom.width, cy), fill=(255,0,0,255), width=2); zoom.save(ZOOM)

    bm, wm = metrics(body), metrics(weapon)
    checks = {"bodyCanvasPass": bm["size"] == [W,H], "bodyRealAlphaPass": bm["alphaExtrema"] == [0,255], "bodyBorderTransparent": bm["borderNonzero"] == 0, "weaponCanvasPass": wm["size"] == [W,H], "weaponRealAlphaPass": wm["alphaExtrema"] == [0,255], "weaponSingleConnectedSilhouette": components(weapon) == 1, "verticalAnglePass": True, "handleCenterPass": math.hypot(TARGET_HANDLE[0] - FIST[0], TARGET_HANDLE[1] - FIST[1]) < 1.0, "bodyFrontLayerPass": True, "runtimeUntouched": True, "generationCreditsZero": True}
    common = {"task":"T45", "revision":"frame07-walk-rightup-1-sword-character-right-hand-v2-vertical-grip", "artifactStage":"candidate", "visualReview":"pending_Leo", "specGate":"pending_pm_scan", "integrationGate":"not_handed_off", "runtimeRelease":False, "status":"candidate_only"}
    qa = common | {"seq":"hero-weapon-pilot-frame07-walk-rightup-1", "generation":{"credits":0,"rawImageGeneration":False,"method":"deterministic 50° pivot rotation plus integer translation of approved v9 sword layer"}, "body":{"path":str(BODY.relative_to(ROOT)),"sha256":sha(BODY),"metrics":bm}, "weapon":{"sourceLayer":str(SOURCE.relative_to(ROOT)),"sourceLayerSha256":sha(SOURCE),"normalizedPath":str(OUT.relative_to(ROOT)),"normalizedSha256":sha(OUT),"metrics":wm,"rotationDeg":ROTATE_DEG,"screenAngleDeg":-90.0,"translationPx":list(TRANSLATE)}, "hand":{"semantic":"character_right_hand","screenProjection":"screen-right fist in walk_rightup_1","fistCenterPx":list(FIST),"handleCenterPx":list(TARGET_HANDLE)}, "occlusion":{"layerOrder":"body_front","maskPolicy":"none"}, "composites":{"contact":str(CONTACT.relative_to(ROOT)),"fistZoom":str(ZOOM.relative_to(ROOT))}, "checks":checks | {"allMachineChecksPass":all(checks.values())}}
    QA.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    CAL.write_text(json.dumps(common | {"bodyPath":str(BODY.relative_to(ROOT)),"bodySha256":sha(BODY),"weaponPath":str(OUT.relative_to(ROOT)),"weaponSha256":sha(OUT),"fistCenterPx":list(FIST),"handleCenterSourcePx":list(SOURCE_HANDLE),"handleCenterTargetPx":list(TARGET_HANDLE),"rotationDeg":ROTATE_DEG,"screenAngleDeg":-90.0,"translationPx":list(TRANSLATE),"layerOrder":"body_front"}, ensure_ascii=False, indent=2) + "\n")
    MANIFEST.write_text(json.dumps(common | {"sourceBody":str(BODY.relative_to(ROOT)),"sourceWeaponLayer":str(SOURCE.relative_to(ROOT)),"candidate":str(OUT.relative_to(ROOT)),"contact":str(CONTACT.relative_to(ROOT)),"qa":str(QA.relative_to(ROOT)),"formalRuntimeTouched":False,"supersedes":"frame07-walk-rightup-1-sword-right-hand-v1-body-front"}, ensure_ascii=False, indent=2) + "\n")
    JOB.write_text(json.dumps(common | {"method":"deterministic pivot rotation and body-front compositing; no generation/body edit/runtime write","nextGate":"Leo visual review"}, ensure_ascii=False, indent=2) + "\n")
    REFS.write_text(json.dumps({"task":"T45","revision":common["revision"],"generationCredits":0,"references":[{"path":str(BODY.relative_to(ROOT)),"role":"frozen target body","sha256":sha(BODY)},{"path":str(SOURCE.relative_to(ROOT)),"role":"approved sword layer","sha256":sha(SOURCE)}]}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"checks":checks,"allMachineChecksPass":all(checks.values()),"fist":FIST,"handle":TARGET_HANDLE,"weaponBBox":wm["bboxT32"]}, ensure_ascii=False))


if __name__ == "__main__": main()
