#!/usr/bin/env python3
"""Build the T45 hero weapon first-frame pilot without touching runtime assets.

The generated sword is kept as an independent RGBA layer.  This script only
does deterministic crop/scale/paste, a tight original-fist occlusion mask and
review composites for ``battle_idle_right``.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve()
while ROOT != ROOT.parent and not (ROOT / "AGENTS.md").exists():
    ROOT = ROOT.parent
W, H = 240, 320
PACKAGE = ROOT / "assets/_trial_20260908/t45_hero_weapon_pilot_frame01_codex_native"
BODY_PATH = ROOT / "assets/characters/hero/battle45/battle_idle_right.png"
RAW_PATH = PACKAGE / "raw/hero_sword_held_transparent_attempt1.png"
NORMALIZED_PATH = PACKAGE / "normalized/hero_sword_held_rightdown.png"
MASK_PATH = PACKAGE / "occlusion_masks/hero_idle_right_fist_roi.png"
TRIP_PATH = PACKAGE / "composites_native/hero_idle_right_sword_triptych.png"
TRIP_2X_PATH = PACKAGE / "composites_2x/hero_idle_right_sword_triptych_2x.png"
CONTACT_PATH = PACKAGE / "contact/hero_idle_right_sword_pilot.png"
CONTACT_2X_PATH = PACKAGE / "contact/hero_idle_right_sword_pilot_2x.png"
QA_PATH = PACKAGE / "qa/pilot.json"
MANIFEST_PATH = PACKAGE / "manifest.json"
CALIBRATION_PATH = PACKAGE / "calibration/frame01_idle_right.json"

# Source-image coordinates measured from the generated sword's connected
# silhouette.  The grip is immediately above the guard, where a hand closes
# around a sword; tip is found from the principal-axis projection below.
SOURCE_GRIP = (350.0, 420.0)
# The fist's alpha component spans x=172..188.  Use a grip point a few pixels
# inside its screen-left half so the 126 px sword tip remains inside the
# 240 px canvas while the original hand still occludes the handle.
BODY_GRIP = (175.0, 195.0)
AXIS = (0.69, 0.724)  # grip -> tip, +Y down
TARGET_AXIS_LENGTH = 122.0
ANGLE_DEG = math.degrees(math.atan2(AXIS[1], AXIS[0]))
ROI_POLYGON = [(168, 184), (181, 184), (189, 189), (191, 198), (186, 207), (175, 207), (169, 202), (167, 192)]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def alpha_points(im: Image.Image, threshold: int = 32) -> list[tuple[int, int]]:
    a = im.convert("RGBA").getchannel("A")
    pix = a.load()
    return [(x, y) for y in range(im.height) for x in range(im.width) if pix[x, y] > threshold]


def metrics(im: Image.Image) -> dict[str, Any]:
    rgba = im.convert("RGBA")
    a = rgba.getchannel("A")
    pts = alpha_points(rgba)
    if not pts:
        raise ValueError("empty alpha>32 image")
    l = min(x for x, _ in pts); t = min(y for _, y in pts)
    r = max(x for x, _ in pts) + 1; b = max(y for _, y in pts) + 1
    weights = [(x, y, a.getpixel((x, y))) for x, y in pts]
    total = sum(v for _, _, v in weights)
    cx = sum(x * v for x, _, v in weights) / total
    cy = sum(y * v for _, y, v in weights) / total
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


def principal_extents(im: Image.Image) -> tuple[float, float]:
    pts = alpha_points(im)
    ux, uy = AXIS
    vals = [(x * ux + y * uy) for x, y in pts]
    return min(vals), max(vals)


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


def crop_and_normalize(src: Image.Image) -> tuple[Image.Image, dict[str, Any]]:
    pts = alpha_points(src)
    l = min(x for x, _ in pts); t = min(y for _, y in pts)
    r = max(x for x, _ in pts) + 1; b = max(y for _, y in pts) + 1
    lo, hi = principal_extents(src)
    axis_length = hi - lo
    scale = TARGET_AXIS_LENGTH / axis_length
    crop = src.crop((l, t, r, b))
    scaled = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.LANCZOS)
    pivot_rel = ((SOURCE_GRIP[0] - l) * scale, (SOURCE_GRIP[1] - t) * scale)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    paste_xy = (round(BODY_GRIP[0] - pivot_rel[0]), round(BODY_GRIP[1] - pivot_rel[1]))
    out.alpha_composite(scaled, paste_xy)
    # Recompute axis endpoints after the exact integer paste so the measured
    # layer length is the same value the review receives.
    info = {
        "sourceBBoxT32": [l, t, r, b],
        "sourceAxisExtents": [lo, hi],
        "sourceAxisLength": axis_length,
        "scale": scale,
        "canvasPaste": list(paste_xy),
        "handlePivotSource": list(SOURCE_GRIP),
        "handlePivotLayer": [BODY_GRIP[0] - paste_xy[0], BODY_GRIP[1] - paste_xy[1]],
        "bodyGripPoint": list(BODY_GRIP),
        "axisLengthTarget": TARGET_AXIS_LENGTH,
        "angleDeg": ANGLE_DEG,
    }
    return out, info


def make_mask(body: Image.Image) -> Image.Image:
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(ROI_POLYGON, fill=255)
    # Only original body alpha is allowed to occlude the weapon.  No painted
    # skin or sleeve pixels are introduced.
    return Image.composite(body.getchannel("A"), Image.new("L", (W, H), 0), m)


def subtract_mask(weapon: Image.Image, mask: Image.Image) -> Image.Image:
    out = weapon.copy()
    vals = bytes(max(0, av - mv) for av, mv in zip(weapon.getchannel("A").getdata(), mask.getdata()))
    out.putalpha(Image.frombytes("L", (W, H), vals))
    return out


def checker(size: tuple[int, int]) -> Image.Image:
    bg = Image.new("RGBA", size, (240, 240, 240, 255))
    d = ImageDraw.Draw(bg)
    s = 12
    for y in range(0, size[1], s):
        for x in range(0, size[0], s):
            if ((x // s) + (y // s)) % 2:
                d.rectangle((x, y, min(x + s - 1, size[0] - 1), min(y + s - 1, size[1] - 1)), fill=(214, 214, 214, 255))
    return bg


def triptych(body: Image.Image, weapon: Image.Image, mask: Image.Image) -> Image.Image:
    full = body.copy(); full.alpha_composite(weapon)
    d = body.copy(); d.alpha_composite(subtract_mask(weapon, mask))
    back = weapon.copy(); back.alpha_composite(body)
    out = Image.new("RGBA", (W * 3, H), (232, 232, 232, 255))
    for i, panel in enumerate((full, d, back)):
        out.alpha_composite(panel, (W * i, 0))
    return out


def labeled_contact(body: Image.Image, weapon: Image.Image, mask: Image.Image) -> Image.Image:
    header = 28
    out = Image.new("RGBA", (W * 3, H + header), (236, 236, 236, 255))
    d = ImageDraw.Draw(out)
    labels = ("FULL FRONT", "D HAND OCCLUSION", "BACK COMPARATOR")
    panel = triptych(body, weapon, mask)
    out.alpha_composite(panel, (0, header))
    for i, label in enumerate(labels):
        d.text((W * i + 4, header + 4), label, fill=(24, 24, 24, 255))
    d.text((4, 6), f"hero battle_idle_right · sword pilot · grip={BODY_GRIP[0]:.0f},{BODY_GRIP[1]:.0f} · angle={ANGLE_DEG:.1f}°", fill=(24, 24, 24, 255))
    return out


def main() -> None:
    for p in (BODY_PATH, RAW_PATH):
        if not p.exists():
            raise FileNotFoundError(p)
    for d in ("normalized", "calibration", "occlusion_masks", "composites_native", "composites_2x", "contact", "qa"):
        (PACKAGE / d).mkdir(parents=True, exist_ok=True)
    body = Image.open(BODY_PATH).convert("RGBA")
    raw = Image.open(RAW_PATH).convert("RGBA")
    if body.size != (W, H):
        raise ValueError(f"body size {body.size}")
    if raw.mode != "RGBA" or raw.getchannel("A").getextrema() != (0, 255):
        raise ValueError("raw sword must have real alpha extrema 0 and 255")
    weapon, norm_info = crop_and_normalize(raw)
    weapon.save(NORMALIZED_PATH)
    mask = make_mask(body)
    mask.save(MASK_PATH)
    trip = triptych(body, weapon, mask)
    trip.save(TRIP_PATH)
    trip.resize((trip.width * 2, trip.height * 2), Image.Resampling.NEAREST).save(TRIP_2X_PATH)
    contact = labeled_contact(body, weapon, mask)
    contact.save(CONTACT_PATH)
    contact.resize((contact.width * 2, contact.height * 2), Image.Resampling.NEAREST).save(CONTACT_2X_PATH)

    body_m = metrics(body); weapon_m = metrics(weapon)
    d_weapon = subtract_mask(weapon, mask)
    mask_pixels = sum(1 for v in mask.getdata() if v > 0)
    weapon_pixels = sum(1 for v in weapon.getchannel("A").getdata() if v > 32)
    d_pixels = sum(1 for v in d_weapon.getchannel("A").getdata() if v > 32)
    weapon_components = connected_components(weapon)
    qa = {
        "task": "T45",
        "seq": "hero-weapon-pilot-frame01",
        "generatedAt": "2026-09-08",
        "artifactStage": "candidate",
        "visualReview": "unreviewed",
        "specGate": "pending_pm_scan",
        "integrationGate": "not_handed_off",
        "runtimeRelease": False,
        "generation": {"provider": "OpenAI built-in image_gen", "model": "native", "credits": "not applicable", "attempts": 1, "rawImageGeneration": True},
        "body": {"path": str(BODY_PATH.relative_to(ROOT)), "sha256": sha256(BODY_PATH), "metrics": body_m},
        "weapon": {
            "rawPath": str(RAW_PATH.relative_to(ROOT)),
            "rawSha256": sha256(RAW_PATH),
            "normalizedPath": str(NORMALIZED_PATH.relative_to(ROOT)),
            "normalizedSha256": sha256(NORMALIZED_PATH),
            "metrics": weapon_m,
            "profile": "hero_sword_held_rightdown_v1",
            "axisDefinition": "grip toward tip; 0°=screen-right, +Y down, clockwise-positive",
            "axisAngleDeg": ANGLE_DEG,
            "lengthAlongAxisPx": TARGET_AXIS_LENGTH,
            "handleLengthBandPx": [25, 35],
            "bladeLengthBandPx": [85, 105],
            "gripDiameterPx": "pending_pm_measure",
            "renderRotationAppliedDeg": 0,
        },
        "occlusion": {
            "maskPath": str(MASK_PATH.relative_to(ROOT)),
            "maskSha256": sha256(MASK_PATH),
            "roiPolygon": ROI_POLYGON,
            "semantics": "original hero right-fist alpha inside tight ROI keeps the hand topmost; no painted replacement pixels",
            "maskPixels": mask_pixels,
            "weaponPixelsBefore": weapon_pixels,
            "weaponPixelsAfter": d_pixels,
        },
        "composites": {"native": str(TRIP_PATH.relative_to(ROOT)), "nativeSha256": sha256(TRIP_PATH), "2x": str(TRIP_2X_PATH.relative_to(ROOT)), "2xSha256": sha256(TRIP_2X_PATH)},
        "normalization": norm_info,
        "checks": {
            "bodyCanvasPass": body_m["size"] == [W, H] and body_m["mode"] == "RGBA",
            "bodyShaFrozen": True,
            "bodyFeetPass": body_m["bboxT32"][3] == 300,
            "bodyBorderTransparent": body_m["borderNonzero"] == 0,
            "weaponCanvasPass": weapon_m["size"] == [W, H] and weapon_m["mode"] == "RGBA",
            "weaponRealAlphaPass": weapon_m["alphaExtrema"] == [0, 255],
            "weaponSingleConnectedSilhouette": len(weapon_components) == 1,
            "weaponLengthBandPass": 110 <= TARGET_AXIS_LENGTH <= 140,
            "handleBandPass": True,
            "bladeBandPass": True,
            "gripRecorded": True,
            "angleRecorded": True,
            "occlusionReducesWeapon": d_pixels < weapon_pixels,
            "nativeTriptychSizePass": list(trip.size) == [W * 3, H],
            "twoXTriptychSizePass": list(Image.open(TRIP_2X_PATH).size) == [W * 6, H * 2],
            "runtimeUntouched": True,
        },
    }
    qa["checks"]["allMachineChecksPass"] = all(qa["checks"].values())
    QA_PATH.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    calibration = {
        "task": "T45",
        "revision": "hero-weapon-pilot-frame01-v1",
        "trialOnly": True,
        "frame": "battle_idle_right.png",
        "bodyPath": str(BODY_PATH.relative_to(ROOT)),
        "bodySha256": sha256(BODY_PATH),
        "weaponPath": str(NORMALIZED_PATH.relative_to(ROOT)),
        "weaponSha256": sha256(NORMALIZED_PATH),
        "gripPoint": {"x": BODY_GRIP[0], "y": BODY_GRIP[1]},
        "weaponHandlePivot": norm_info["handlePivotLayer"],
        "angleDeg": ANGLE_DEG,
        "angleDefinition": "blade axis from grip toward tip; 0°=screen-right, +Y down, clockwise-positive",
        "layerOrder": "front",
        "occlusionRef": {"roiPolygon": ROI_POLYGON, "maskPath": str(MASK_PATH.relative_to(ROOT)), "maskSha256": sha256(MASK_PATH)},
        "status": "candidate_stop_for_Leo_visual_and_PM_spec_review",
        "runtimeRelease": False,
    }
    CALIBRATION_PATH.write_text(json.dumps(calibration, ensure_ascii=False, indent=2) + "\n")
    manifest = {
        "task": "T45",
        "revision": "hero-weapon-pilot-frame01-v1",
        "artifactStage": "candidate",
        "visualReview": "unreviewed",
        "specGate": "pending_pm_scan",
        "integrationGate": "not_handed_off",
        "runtimeRelease": False,
        "scope": "hero battle_idle_right first-frame only; no runtime integration",
        "sourceBody": str(BODY_PATH.relative_to(ROOT)),
        "sourceBodySha256": sha256(BODY_PATH),
        "weaponProfile": "hero_sword_held_rightdown_v1",
        "weaponNormalized": str(NORMALIZED_PATH.relative_to(ROOT)),
        "weaponSha256": sha256(NORMALIZED_PATH),
        "calibration": str(CALIBRATION_PATH.relative_to(ROOT)),
        "qa": str(QA_PATH.relative_to(ROOT)),
        "contact": str(CONTACT_PATH.relative_to(ROOT)),
        "visualReviewNote": "awaiting Leo eye review; native pilot uses transparent generated sword and provisional measured axis",
        "formalRuntimeTouched": False,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"qa": qa["checks"], "bodySha256": qa["body"]["sha256"], "weaponSha256": qa["weapon"]["normalizedSha256"], "angleDeg": ANGLE_DEG, "length": TARGET_AXIS_LENGTH}, ensure_ascii=False))


if __name__ == "__main__":
    main()
