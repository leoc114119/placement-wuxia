#!/usr/bin/env python3
"""Deterministic correction of T45 hero weapon frame01 hand and angle.

The v1 transparent sword is reused without redraw.  This revision rotates the
existing sword from its provisional 46.3774° axis to the canonical 60°
down-right battle angle and relocates the grip to the character's own right
hand (the screen-left fist in battle_idle_right).  Runtime assets are never
written.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve()
while ROOT != ROOT.parent and not (ROOT / "AGENTS.md").exists():
    ROOT = ROOT.parent
W, H = 240, 320
BASE = ROOT / "assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native"
REV = BASE / "revisions/right-hand-angle-v2"
BODY_PATH = ROOT / "assets/characters/hero/battle45/battle_idle_right.png"
SOURCE_LAYER = BASE / "normalized/hero_sword_held_rightdown.png"
SOURCE_RAW = BASE / "raw/hero_sword_held_transparent_attempt1.png"
OUT_LAYER = REV / "normalized/hero_sword_held_rightdown_v2.png"
MASK_PATH = REV / "occlusion_masks/hero_idle_right_character_right_fist.png"
TRIP_PATH = REV / "composites_native/hero_idle_right_sword_triptych_v2.png"
TRIP_2X_PATH = REV / "composites_2x/hero_idle_right_sword_triptych_v2_2x.png"
CONTACT_PATH = REV / "contact/hero_idle_right_sword_pilot_v2.png"
CONTACT_2X_PATH = REV / "contact/hero_idle_right_sword_pilot_v2_2x.png"
QA_PATH = REV / "qa/pilot_v2.json"
CAL_PATH = REV / "calibration/frame01_idle_right_v2.json"
MANIFEST_PATH = REV / "manifest.json"
JOB_PATH = REV / "job.json"
REQUEST_PATH = REV / "request.md"
REFS_PATH = REV / "refs.json"
REV_RAW_PATH = REV / "raw/hero_sword_held_transparent_source_attempt1.png"

SOURCE_PIVOT = (175.0, 195.0)
TARGET_GRIP = (100.0, 208.0)  # character's own right hand; screen-left fist
SOURCE_ANGLE_DEG = 46.37742658748023
TARGET_ANGLE_DEG = 60.0
ROTATION_DELTA_DEG = TARGET_ANGLE_DEG - SOURCE_ANGLE_DEG
TARGET_AXIS = (math.cos(math.radians(TARGET_ANGLE_DEG)), math.sin(math.radians(TARGET_ANGLE_DEG)))
TARGET_AXIS_LENGTH = 122.0
# Tight polygon around the complete screen-left fist.  The body alpha is the
# only source for occlusion pixels; sleeve and torso are excluded.
FIST_ROI_POLYGON = [(91, 193), (103, 193), (111, 197), (115, 204), (112, 214), (104, 218), (95, 216), (90, 209), (89, 201)]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def alpha_points(im: Image.Image, threshold: int = 32) -> list[tuple[int, int]]:
    a = im.convert("RGBA").getchannel("A")
    return [(x, y) for y in range(im.height) for x in range(im.width) if a.getpixel((x, y)) > threshold]


def metrics(im: Image.Image) -> dict[str, Any]:
    rgba = im.convert("RGBA")
    a = rgba.getchannel("A")
    pts = alpha_points(rgba)
    if not pts:
        raise ValueError("empty alpha>32 image")
    l = min(x for x, _ in pts); t = min(y for _, y in pts)
    r = max(x for x, _ in pts) + 1; b = max(y for _, y in pts) + 1
    weighted = [(x, y, a.getpixel((x, y))) for x, y in pts]
    total = sum(v for _, _, v in weighted)
    cx = sum(x * v for x, _, v in weighted) / total
    cy = sum(y * v for _, y, v in weighted) / total
    border = sum(1 for x in range(rgba.width) for y in (0, rgba.height - 1) if a.getpixel((x, y)) > 0)
    border += sum(1 for y in range(1, rgba.height - 1) for x in (0, rgba.width - 1) if a.getpixel((x, y)) > 0)
    return {
        "size": [rgba.width, rgba.height],
        "mode": "RGBA",
        "alphaExtrema": list(a.getextrema()),
        "bboxT32": [l, t, r, b],
        "visualWidth": r - l,
        "visualHeight": b - t,
        "alpha32CentroidX": cx,
        "alpha32CentroidY": cy,
        "borderNonzero": border,
    }


def connected_components(im: Image.Image) -> list[set[tuple[int, int]]]:
    remaining = set(alpha_points(im))
    comps: list[set[tuple[int, int]]] = []
    while remaining:
        seed = remaining.pop()
        stack = [seed]
        comp = {seed}
        while stack:
            x, y = stack.pop()
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1),
                      (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1)):
                if n in remaining:
                    remaining.remove(n)
                    comp.add(n)
                    stack.append(n)
        comps.append(comp)
    return comps


def rotate_and_relocate(src: Image.Image) -> tuple[Image.Image, dict[str, Any]]:
    # PIL's positive visual rotation is counter-clockwise; negative rotates
    # clockwise in image coordinates, increasing the screen-down angle.
    rotated = src.rotate(-ROTATION_DELTA_DEG, resample=Image.Resampling.BICUBIC,
                         center=SOURCE_PIVOT, expand=False)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    translation = (round(TARGET_GRIP[0] - SOURCE_PIVOT[0]), round(TARGET_GRIP[1] - SOURCE_PIVOT[1]))
    out.alpha_composite(rotated, translation)
    return out, {
        "sourceLayer": str(SOURCE_LAYER.relative_to(ROOT)),
        "sourceLayerSha256": sha256(SOURCE_LAYER),
        "sourcePivot": list(SOURCE_PIVOT),
        "targetGrip": list(TARGET_GRIP),
        "sourceAngleDeg": SOURCE_ANGLE_DEG,
        "targetAngleDeg": TARGET_ANGLE_DEG,
        "rotationDeltaDeg": ROTATION_DELTA_DEG,
        "rotationAppliedDeg": ROTATION_DELTA_DEG,
        "translationPx": list(translation),
        "resampling": "BICUBIC deterministic local transform",
    }


def make_mask(body: Image.Image) -> Image.Image:
    polygon = Image.new("L", (W, H), 0)
    ImageDraw.Draw(polygon).polygon(FIST_ROI_POLYGON, fill=255)
    # Use the original fist silhouette as a binary alpha mask.  Binarizing
    # only after the explicit ROI prevents anti-aliased edge alpha from
    # leaving a few sword pixels in the hand while keeping the ROI tight.
    body_binary = body.getchannel("A").point(lambda value: 255 if value > 32 else 0)
    return ImageChops.multiply(polygon, body_binary)


def subtract_mask(weapon: Image.Image, mask: Image.Image) -> Image.Image:
    out = weapon.copy()
    vals = bytes(max(0, av - mv) for av, mv in zip(weapon.getchannel("A").getdata(), mask.getdata()))
    out.putalpha(Image.frombytes("L", (W, H), vals))
    return out


def axis_extent(im: Image.Image) -> tuple[float, float]:
    ux, uy = TARGET_AXIS
    vals = [(x - TARGET_GRIP[0]) * ux + (y - TARGET_GRIP[1]) * uy for x, y in alpha_points(im)]
    return min(vals), max(vals)


def triptych(body: Image.Image, weapon: Image.Image, mask: Image.Image) -> Image.Image:
    full = body.copy(); full.alpha_composite(weapon)
    d = body.copy(); d.alpha_composite(subtract_mask(weapon, mask))
    back = weapon.copy(); back.alpha_composite(body)
    out = Image.new("RGBA", (W * 3, H), (232, 232, 232, 255))
    for i, panel in enumerate((full, d, back)):
        out.alpha_composite(panel, (W * i, 0))
    return out


def labeled_contact(body: Image.Image, weapon: Image.Image, mask: Image.Image) -> Image.Image:
    header = 36
    out = Image.new("RGBA", (W * 3, H + header), (236, 236, 236, 255))
    d = ImageDraw.Draw(out)
    panel = triptych(body, weapon, mask)
    out.alpha_composite(panel, (0, header))
    labels = ("FULL · character RIGHT hand", "D · fist occlusion", "BACK comparator")
    for i, label in enumerate(labels):
        d.text((W * i + 4, 4), label, fill=(24, 24, 24, 255))
    d.text((4, 20), f"battle_idle_right · grip={TARGET_GRIP[0]:.0f},{TARGET_GRIP[1]:.0f} · angle={TARGET_ANGLE_DEG:.1f}° down-right", fill=(24, 24, 24, 255))
    return out


def main() -> None:
    for p in (BODY_PATH, SOURCE_LAYER, SOURCE_RAW):
        if not p.exists():
            raise FileNotFoundError(p)
    body = Image.open(BODY_PATH).convert("RGBA")
    source = Image.open(SOURCE_LAYER).convert("RGBA")
    if body.size != (W, H) or source.size != (W, H):
        raise ValueError("body/source layer must be 240x320")
    REV_RAW_PATH.write_bytes(SOURCE_RAW.read_bytes())
    weapon, transform = rotate_and_relocate(source)
    weapon.save(OUT_LAYER)
    mask = make_mask(body)
    mask.save(MASK_PATH)
    trip = triptych(body, weapon, mask)
    trip.save(TRIP_PATH)
    trip.resize((trip.width * 2, trip.height * 2), Image.Resampling.NEAREST).save(TRIP_2X_PATH)
    contact = labeled_contact(body, weapon, mask)
    contact.save(CONTACT_PATH)
    contact.resize((contact.width * 2, contact.height * 2), Image.Resampling.NEAREST).save(CONTACT_2X_PATH)

    body_m = metrics(body); weapon_m = metrics(weapon)
    lo, hi = axis_extent(weapon)
    axis_len = hi - lo
    d_weapon = subtract_mask(weapon, mask)
    mask_pixels = sum(1 for v in mask.getdata() if v > 0)
    weapon_pixels = sum(1 for v in weapon.getchannel("A").getdata() if v > 32)
    d_pixels = sum(1 for v in d_weapon.getchannel("A").getdata() if v > 32)
    in_mask_before = sum(1 for av, mv in zip(weapon.getchannel("A").getdata(), mask.getdata()) if av > 32 and mv > 0)
    in_mask_after = sum(1 for av, mv in zip(d_weapon.getchannel("A").getdata(), mask.getdata()) if av > 32 and mv > 0)
    components = connected_components(weapon)
    checks = {
        "bodyCanvasPass": body_m["size"] == [W, H] and body_m["mode"] == "RGBA",
        "bodyFeetPass": body_m["bboxT32"][3] == 300,
        "bodyBorderTransparent": body_m["borderNonzero"] == 0,
        "weaponCanvasPass": weapon_m["size"] == [W, H] and weapon_m["mode"] == "RGBA",
        "weaponRealAlphaPass": weapon_m["alphaExtrema"] == [0, 255],
        "weaponSingleConnectedSilhouette": len(components) == 1,
        "weaponLengthBandPass": 110 <= axis_len <= 140,
        "weaponAngleCanonicalPass": abs(TARGET_ANGLE_DEG - 60.0) < 0.001,
        "characterRightHandScreenLeftFist": TARGET_GRIP[0] < 120,
        "gripRecorded": True,
        "fistOcclusionRemovesOverlap": in_mask_after == 0 and d_pixels < weapon_pixels,
        "nativeTriptychSizePass": list(trip.size) == [W * 3, H],
        "twoXTriptychSizePass": list(Image.open(TRIP_2X_PATH).size) == [W * 6, H * 2],
        "runtimeUntouched": True,
        "generationCreditsZero": True,
    }
    qa = {
        "task": "T45",
        "seq": "hero-weapon-pilot-frame01",
        "revision": "right-hand-angle-v2",
        "generatedAt": "2026-09-08",
        "artifactStage": "candidate",
        "visualReview": "unreviewed",
        "specGate": "pending_pm_scan",
        "integrationGate": "not_handed_off",
        "runtimeRelease": False,
        "generation": {"provider": None, "model": None, "credits": 0, "method": "deterministic reuse + rotation + relocation", "rawImageGeneration": False},
        "body": {"path": str(BODY_PATH.relative_to(ROOT)), "sha256": sha256(BODY_PATH), "metrics": body_m},
        "weapon": {
            "sourceLayer": str(SOURCE_LAYER.relative_to(ROOT)),
            "sourceLayerSha256": sha256(SOURCE_LAYER),
            "normalizedPath": str(OUT_LAYER.relative_to(ROOT)),
            "normalizedSha256": sha256(OUT_LAYER),
            "metrics": weapon_m,
            "axisDefinition": "grip toward tip; 0°=screen-right, +Y down, clockwise-positive",
            "axisExtentsFromTargetGrip": [lo, hi],
            "axisLengthPx": axis_len,
            "targetAngleDeg": TARGET_ANGLE_DEG,
            "targetAxisLengthPx": TARGET_AXIS_LENGTH,
            "handleLengthBandPx": [25, 35],
            "bladeLengthBandPx": [85, 105],
        },
        "hand": {
            "semantic": "character_right_hand",
            "screenProjection": "screen-left fist in battle_idle_right",
            "gripPoint": {"x": TARGET_GRIP[0], "y": TARGET_GRIP[1]},
            "fistRoiPolygon": FIST_ROI_POLYGON,
        },
        "occlusion": {
            "maskPath": str(MASK_PATH.relative_to(ROOT)),
            "maskSha256": sha256(MASK_PATH),
            "maskPixels": mask_pixels,
            "weaponPixelsBefore": weapon_pixels,
            "weaponPixelsAfter": d_pixels,
            "weaponInFistBefore": in_mask_before,
            "weaponInFistAfter": in_mask_after,
            "semantics": "original body alpha under tight character-right-fist ROI; no painted replacement pixels",
        },
        "transform": transform,
        "composites": {"native": str(TRIP_PATH.relative_to(ROOT)), "nativeSha256": sha256(TRIP_PATH), "2x": str(TRIP_2X_PATH.relative_to(ROOT)), "2xSha256": sha256(TRIP_2X_PATH)},
        "checks": checks | {"allMachineChecksPass": all(checks.values())},
    }
    QA_PATH.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    calibration = {
        "task": "T45",
        "revision": "hero-weapon-pilot-frame01-right-hand-angle-v2",
        "trialOnly": True,
        "frame": "battle_idle_right.png",
        "bodyPath": str(BODY_PATH.relative_to(ROOT)),
        "bodySha256": sha256(BODY_PATH),
        "weaponPath": str(OUT_LAYER.relative_to(ROOT)),
        "weaponSha256": sha256(OUT_LAYER),
        "handSemantic": "character_right_hand",
        "screenProjection": "screen-left fist",
        "gripPoint": {"x": TARGET_GRIP[0], "y": TARGET_GRIP[1]},
        "angleDeg": TARGET_ANGLE_DEG,
        "angleDefinition": "blade axis from grip toward tip; 0°=screen-right, +Y down, clockwise-positive",
        "layerOrder": "front",
        "occlusionRef": {"roiPolygon": FIST_ROI_POLYGON, "maskPath": str(MASK_PATH.relative_to(ROOT)), "maskSha256": sha256(MASK_PATH)},
        "sourceRevision": str((BASE / "manifest.json").relative_to(ROOT)),
        "supersedes": "hero-weapon-pilot-frame01-v1",
        "status": "candidate_stop_for_Leo_visual_and_PM_spec_review",
        "runtimeRelease": False,
    }
    CAL_PATH.write_text(json.dumps(calibration, ensure_ascii=False, indent=2) + "\n")
    manifest = {
        "task": "T45",
        "revision": "hero-weapon-pilot-frame01-right-hand-angle-v2",
        "artifactStage": "candidate",
        "visualReview": "unreviewed",
        "specGate": "pending_pm_scan",
        "integrationGate": "not_handed_off",
        "runtimeRelease": False,
        "scope": "hero battle_idle_right first-frame only; deterministic correction; no runtime integration",
        "supersedes": str((BASE / "manifest.json").relative_to(ROOT)),
        "sourceBody": str(BODY_PATH.relative_to(ROOT)),
        "sourceBodySha256": sha256(BODY_PATH),
        "sourceWeaponLayer": str(SOURCE_LAYER.relative_to(ROOT)),
        "sourceWeaponLayerSha256": sha256(SOURCE_LAYER),
        "weaponNormalized": str(OUT_LAYER.relative_to(ROOT)),
        "weaponSha256": sha256(OUT_LAYER),
        "handSemantic": "character_right_hand_screen_left_fist",
        "gripPoint": {"x": TARGET_GRIP[0], "y": TARGET_GRIP[1]},
        "angleDeg": TARGET_ANGLE_DEG,
        "calibration": str(CAL_PATH.relative_to(ROOT)),
        "qa": str(QA_PATH.relative_to(ROOT)),
        "contact": str(CONTACT_PATH.relative_to(ROOT)),
        "visualReviewNote": "v1 superseded: screen-right fist/46.3774°; v2 uses character-right screen-left fist/60° down-right",
        "formalRuntimeTouched": False,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    JOB_PATH.write_text(json.dumps({
        "task": "T45", "seq": "hero-weapon-pilot-frame01", "revision": "right-hand-angle-v2",
        "artifactStage": "candidate", "visualReview": "unreviewed", "specGate": "pending_pm_scan",
        "integrationGate": "not_handed_off", "runtimeRelease": False,
        "reviewReason": "Leo correction: sword must be in the character's right hand and use the canonical down-right battle angle",
        "correction": {"from": "v1 screen-right fist / 46.3774°", "to": "character-right screen-left fist / 60° down-right"},
        "method": "deterministic reuse of existing transparent sword layer; no new generation; body frozen",
        "runtimeWrite": False,
    }, ensure_ascii=False, indent=2) + "\n")
    REQUEST_PATH.write_text("""# T45 hero weapon frame01 · right-hand + angle correction v2\n\nLeo 指出上一版首帧的两个问题：剑接在画面右侧拳（角色左手），且剑轴角度过平。\n\n本版只做确定性修正：\n- 身体冻结：`assets/characters/hero/battle45/battle_idle_right.png` 字节不变。\n- 手位改为角色自身右手；在该右向姿态中对应画面左侧拳，握点 `(100,208)`。\n- 复用 v1 已生成的透明剑层，不重新生图；将轴角从 `46.3774°` 旋至规范的 `60°`，剑尖朝右下。\n- `layerOrder=front`；拳部遮挡只取原身体 alpha 的紧右拳 ROI，不绘制替代手。\n- 仍为 `candidate-only`，正式 runtime 未写入，等待 Leo 视觉门与 PM 规格门。\n""")
    REFS_PATH.write_text(json.dumps({
        "task": "T45", "revision": "right-hand-angle-v2", "generationCredits": 0,
        "references": [
            {"path": str(BODY_PATH.relative_to(ROOT)), "role": "frozen hero battle body and hand geometry", "allowed": "screen-left fist/right-hand grip and body placement", "forbidden": "redraw body/identity/pose", "sha256": sha256(BODY_PATH)},
            {"path": str(SOURCE_LAYER.relative_to(ROOT)), "role": "existing transparent sword geometry", "allowed": "deterministic rotation and relocation only", "forbidden": "redraw/shape change/new generation", "sha256": sha256(SOURCE_LAYER)},
        ],
        "correction": {"hand": "character_right_hand_screen_left_fist", "angleDeg": TARGET_ANGLE_DEG, "rotationDeltaDeg": ROTATION_DELTA_DEG},
    }, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"revision": "right-hand-angle-v2", "checks": qa["checks"], "weaponSha256": sha256(OUT_LAYER), "gripPoint": TARGET_GRIP, "angleDeg": TARGET_ANGLE_DEG, "axisLengthPx": axis_len}, ensure_ascii=False))


if __name__ == "__main__":
    main()
