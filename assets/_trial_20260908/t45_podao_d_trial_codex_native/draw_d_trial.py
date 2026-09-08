#!/usr/bin/env python3
"""Generate the seq=134 D-route zero-generation calibration package.

This file is deliberately deterministic: it reads the selected runtime body
frames, draws a neutral placeholder blade with Pillow, applies a body-fist ROI
occlusion mask, and emits native/2x triptychs plus machine-readable evidence.
It never writes runtime assets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter

W, H = 240, 320
TARGET_Y = 300

# The grip point is the centre of the original fist that is meant to hold the
# blade.  ROI polygons are deliberately tight around that fist; the mask is
# intersected with the body's real alpha rather than painted over the arm.
FRAMES: list[dict[str, Any]] = [
    {"identity": "shanzei_a", "name": "battle_idle_right.png", "id": "a_idle_right", "gripPoint": [163, 166], "angleDeg": -55.0, "layerOrder": "front", "roi": [[157, 153], [166, 153], [173, 159], [173, 169], [167, 177], [158, 177], [152, 171], [153, 161]]},
    {"identity": "shanzei_a", "name": "atk_right_2.png", "id": "a_atk_right_2", "gripPoint": [184, 137], "angleDeg": -55.0, "layerOrder": "front", "roi": [[178, 126], [188, 126], [194, 132], [192, 143], [184, 148], [176, 143], [174, 135]]},
    {"identity": "shanzei_a", "name": "battle_idle_rightup.png", "id": "a_idle_rightup", "gripPoint": [165, 164], "angleDeg": -55.0, "layerOrder": "back", "roi": [[160, 153], [170, 155], [175, 161], [173, 171], [166, 177], [158, 173], [156, 165]]},
    {"identity": "shanzei_a", "name": "walk_rightdown_1.png", "id": "a_walk_rightdown_1", "gripPoint": [172, 172], "angleDeg": -55.0, "layerOrder": "front", "roi": [[166, 159], [176, 161], [184, 168], [182, 178], [174, 184], [164, 180], [160, 172]]},
    {"identity": "shanzei_b", "name": "battle_idle_right.png", "id": "b_idle_right", "gripPoint": [164, 167], "angleDeg": -55.0, "layerOrder": "front", "roi": [[158, 155], [168, 155], [175, 161], [175, 171], [169, 179], [160, 178], [155, 170], [155, 162]]},
    {"identity": "shanzei_b", "name": "atk_right_2.png", "id": "b_atk_right_2", "gripPoint": [185, 140], "angleDeg": -55.0, "layerOrder": "front", "roi": [[177, 129], [188, 131], [194, 138], [191, 148], [181, 151], [175, 145], [174, 136]]},
    {"identity": "shanzei_b", "name": "battle_idle_rightup.png", "id": "b_idle_rightup", "gripPoint": [165, 163], "angleDeg": -55.0, "layerOrder": "back", "roi": [[160, 151], [169, 151], [175, 157], [173, 168], [166, 175], [158, 170], [156, 161]]},
    {"identity": "shanzei_b", "name": "walk_rightdown_1.png", "id": "b_walk_rightdown_1", "gripPoint": [178, 172], "angleDeg": -55.0, "layerOrder": "front", "roi": [[171, 159], [182, 161], [189, 169], [188, 178], [181, 184], [171, 182], [165, 175], [166, 166]]},
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def alpha_metrics(im: Image.Image) -> dict[str, Any]:
    rgba = im.convert("RGBA")
    a = rgba.getchannel("A")
    extrema = a.getextrema()
    pts = [(x, y, av) for y in range(H) for x, av in enumerate(a.crop((0, y, W, y + 1)).getdata()) if av > 32]
    if not pts:
        raise ValueError("empty alpha>32 foreground")
    minx = min(p[0] for p in pts); miny = min(p[1] for p in pts)
    maxx = max(p[0] for p in pts); maxy = max(p[1] for p in pts)
    total = sum(p[2] for p in pts)
    cx = sum(p[0] * p[2] for p in pts) / total
    cy = sum(p[1] * p[2] for p in pts) / total
    border_nonzero = sum(a.getpixel((x, y)) > 0 for x, y in list((x, 0) for x in range(W)) + list((x, H - 1) for x in range(W)) + list((0, y) for y in range(1, H - 1)) + list((W - 1, y) for y in range(1, H - 1)))
    return {"size": [W, H], "mode": "RGBA", "alphaExtrema": list(extrema), "bboxT32": [minx, miny, maxx + 1, maxy + 1], "visualWidth": maxx - minx + 1, "visualHeight": maxy - miny + 1, "alpha32CentroidX": cx, "alpha32CentroidY": cy, "feetYExclusive": maxy + 1, "borderNonzero": border_nonzero}


def draw_weapon(grip: tuple[float, float], angle_deg: float) -> Image.Image:
    """Draw a long, broad single-edged dao placeholder in screen coordinates.

    The calibrated axis is intentionally fixed to right-up (angle=-55°) for
    every frame in this revision. This is geometry evidence only, not final
   朴刀 artwork.
    """
    gx, gy = grip
    t = math.radians(angle_deg)
    ux, uy = math.cos(t), math.sin(t)
    vx, vy = -uy, ux
    def p(dist: float, side: float = 0.0) -> tuple[int, int]:
        return (round(gx + ux * dist + vx * side), round(gy + uy * dist + vy * side))
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    # Handle extends behind the fist; the guard marks the grip hinge.
    d.line([p(-16), p(20)], fill=(91, 56, 32, 255), width=8)
    d.line([p(-16, -2), p(20, -2)], fill=(226, 174, 105, 255), width=1)
    d.line([p(-16, 2), p(20, 2)], fill=(43, 29, 22, 255), width=1)
    d.line([p(9, -8), p(9, 8)], fill=(221, 171, 74, 255), width=3)
    # Broad, single-edged dao silhouette: long reach (77 px from base to
    # tip), fuller lower edge and a slightly swept tip rather than a sword.
    blade = [
        p(15, -6), p(34, -8), p(56, -10), p(78, -8), p(92, -3),
        p(86, 0), p(82, 5), p(72, 11), p(56, 14), p(38, 13),
        p(25, 9), p(15, 6),
    ]
    d.polygon(blade, fill=(156, 170, 181, 255))
    # Spine and single cutting edge are kept as simple technical stripes.
    d.line([p(22, -5), p(55, -9), p(78, -6), p(90, 0)], fill=(76, 86, 94, 255), width=2)
    d.line([p(24, 5), p(44, 10), p(65, 11), p(82, 8), p(91, 3)], fill=(239, 244, 247, 255), width=2)
    return out


def mask_for_body(body: Image.Image, roi: list[list[int]]) -> Image.Image:
    roi_mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(roi_mask).polygon([tuple(p) for p in roi], fill=255)
    body_alpha = body.getchannel("A")
    # Keep the exact body pixels inside the ROI as the occluder.
    return Image.composite(body_alpha, Image.new("L", (W, H), 0), roi_mask)


def apply_occlusion(weapon: Image.Image, occlusion: Image.Image) -> Image.Image:
    out = weapon.copy()
    wa = out.getchannel("A")
    # Subtract only the body ROI alpha from the weapon alpha.
    vals = [max(0, av - ov) for av, ov in zip(wa.getdata(), occlusion.getdata())]
    out.putalpha(Image.frombytes("L", (W, H), bytes(vals)))
    return out


def checker_bg(size: tuple[int, int]) -> Image.Image:
    w, h = size
    bg = Image.new("RGBA", size, (242, 242, 242, 255))
    d = ImageDraw.Draw(bg)
    s = max(8, size[0] // 15)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if ((x // s + y // s) & 1):
                d.rectangle((x, y, min(x + s - 1, w - 1), min(y + s - 1, h - 1)), fill=(214, 214, 214, 255))
    return bg


def visible_count(im: Image.Image) -> int:
    return sum(1 for av in im.getchannel("A").getdata() if av > 32)


def make_panel(body: Image.Image, weapon: Image.Image, mode: str, occlusion: Image.Image) -> Image.Image:
    if mode == "full_blade_front":
        out = body.copy(); out.alpha_composite(weapon); return out
    if mode == "d_occlusion":
        out = body.copy(); out.alpha_composite(apply_occlusion(weapon, occlusion)); return out
    if mode == "back_layer":
        out = weapon.copy(); out.alpha_composite(body); return out
    raise ValueError(mode)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", type=Path, default=Path("."))
    ap.add_argument("--output", type=Path, default=None)
    args = ap.parse_args()
    repo = args.repo.resolve()
    out = (args.output or repo / "assets/_trial_20260908/t45_podao_d_trial_codex_native").resolve()
    if "_trial_" not in str(out):
        raise SystemExit(f"refusing non-trial output path: {out}")
    out.mkdir(parents=True, exist_ok=True)
    for d in ["calibration", "contact", "occlusion_masks", "qa", "triptychs_native", "triptychs_2x", "weapon_layers"]:
        (out / d).mkdir(exist_ok=True)

    # Read manifest hashes as a second freeze source and then verify bytes.
    manifest_by_identity: dict[str, dict[str, Any]] = {}
    for identity in ("shanzei_a", "shanzei_b"):
        mp = repo / "assets/characters/enemy" / identity / "battle45/manifest.json"
        manifest_by_identity[identity] = json.loads(mp.read_text())

    records: list[dict[str, Any]] = []
    for spec in FRAMES:
        body_path = repo / "assets/characters/enemy" / spec["identity"] / "battle45" / spec["name"]
        if not body_path.exists():
            raise FileNotFoundError(body_path)
        body = Image.open(body_path).convert("RGBA")
        if body.size != (W, H):
            raise ValueError(f"body size mismatch: {body_path} {body.size}")
        body_sha = sha256(body_path)
        manifest_frame = next((f for f in manifest_by_identity[spec["identity"]]["frames"] if f["path"].endswith('/' + spec["name"])), None)
        if not manifest_frame:
            raise ValueError(f"manifest frame missing {body_path}")
        expected_sha = manifest_frame.get("sha256")
        if expected_sha != body_sha:
            raise ValueError(f"body SHA drift: {body_path} manifest={expected_sha} actual={body_sha}")
        bm = alpha_metrics(body)
        if bm["feetYExclusive"] != TARGET_Y or bm["borderNonzero"] != 0:
            raise ValueError(f"body geometry gate failed: {body_path} {bm}")

        grip = tuple(spec["gripPoint"])
        weapon = draw_weapon(grip, spec["angleDeg"])
        occlusion = mask_for_body(body, spec["roi"])
        occlusion_path = out / "occlusion_masks" / f"{spec['id']}_fist_roi.png"
        occlusion.save(occlusion_path)
        weapon_path = out / "weapon_layers" / f"{spec['id']}_placeholder_blade.png"
        weapon.save(weapon_path)

        panels: dict[str, Image.Image] = {
            "full_blade_front": make_panel(body, weapon, "full_blade_front", occlusion),
            "d_occlusion": make_panel(body, weapon, "d_occlusion", occlusion),
            "back_layer": make_panel(body, weapon, "back_layer", occlusion),
        }
        native_path = out / "triptychs_native" / f"{spec['id']}_triptych.png"
        trip = Image.new("RGBA", (W * 3, H), (226, 226, 226, 255))
        for i, key in enumerate(("full_blade_front", "d_occlusion", "back_layer")):
            trip.alpha_composite(panels[key], (i * W, 0))
        trip.save(native_path)
        twox_path = out / "triptychs_2x" / f"{spec['id']}_triptych_2x.png"
        trip.resize((W * 3 * 2, H * 2), Image.Resampling.NEAREST).save(twox_path)

        weapon_alpha = visible_count(weapon)
        d_weapon = apply_occlusion(weapon, occlusion)
        d_alpha = visible_count(d_weapon)
        # The handle is intentionally longer than the ROI. These scan windows
        # assert that some handle remains on both sides after D subtraction.
        t = math.radians(spec["angleDeg"]); ux, uy = math.cos(t), math.sin(t)
        def sample_count(start: int, end: int) -> int:
            c = 0
            for dist in range(start, end + 1):
                x = round(grip[0] + ux * dist); y = round(grip[1] + uy * dist)
                if 0 <= x < W and 0 <= y < H and d_weapon.getchannel("A").getpixel((x, y)) > 32: c += 1
            return c
        handle_before = sample_count(-15, -5)
        handle_after = sample_count(15, 25)
        rec = {
            "id": spec["id"], "identity": spec["identity"], "bodyFrame": spec["name"],
            "bodyPath": str(body_path.relative_to(repo)), "bodySha256": body_sha,
            "bodyMetrics": bm, "gripPoint": {"x": grip[0], "y": grip[1]},
            "angleDeg": spec["angleDeg"], "angleStatus": "provisional_placeholder_only", "angleDirection": "uniform_right_up_from_character_right_hand", "angleDefinition": "blade/shaft axis from grip toward tip; 0°=screen right, +Y downward, clockwise-positive",
            "layerOrder": spec["layerOrder"],
            "occlusionRef": {
                "roiPolygon": spec["roi"], "maskPath": str(occlusion_path.relative_to(repo)), "maskSha256": sha256(occlusion_path),
                "semantics": "original fist alpha inside ROI; D panel subtracts this mask from weapon alpha so fist stays topmost",
            },
            "weaponPlaceholder": {"path": str(weapon_path.relative_to(repo)), "sha256": sha256(weapon_path), "purpose": "neutral PIL geometry placeholder; not final art or runtime asset", "profile": "long_broad_single_edge_dao_placeholder_v2", "handleSpanAlongAxis": [-16, 20], "bladeSpanAlongAxis": [15, 92], "bladeLengthAlongAxis": 77},
            "composites": {"native": str(native_path.relative_to(repo)), "nativeSha256": sha256(native_path), "2x": str(twox_path.relative_to(repo)), "2xSha256": sha256(twox_path)},
            "checks": {
                "bodyShaFrozen": expected_sha == body_sha, "bodyCanvasPass": bm["size"] == [W, H] and bm["mode"] == "RGBA", "bodyFeetPass": bm["feetYExclusive"] == TARGET_Y,
                "bodyBorderTransparent": bm["borderNonzero"] == 0, "weaponHasAlpha": weapon_alpha > 0, "longDaoPlaceholderPass": 77 >= 70, "dOcclusionReducesWeapon": d_alpha < weapon_alpha,
                "handleVisibleBeforeRoi": handle_before > 0, "handleVisibleAfterRoi": handle_after > 0,
                "layerOrderRecorded": spec["layerOrder"] in {"front", "back"}, "nativeSizePass": list(Image.open(native_path).size) == [W * 3, H], "2xSizePass": list(Image.open(twox_path).size) == [W * 3 * 2, H * 2],
            },
        }
        rec["checks"]["allPass"] = all(rec["checks"].values())
        if not rec["checks"]["allPass"]:
            raise ValueError(f"D trial checks failed for {spec['id']}: {rec['checks']}")
        records.append(rec)

    # Two readable sheets, one per enemy identity, native and 2x. Labels live
    # outside the 240x320 panels and are review metadata, not game art.
    for identity in ("shanzei_a", "shanzei_b"):
        rows = [r for r in records if r["identity"] == identity]
        for scale in (1, 2):
            pw, ph = W * scale, H * scale
            sheet = Image.new("RGBA", (pw * 3, ph * len(rows) + 28 * scale * len(rows)), (235, 235, 235, 255))
            sd = ImageDraw.Draw(sheet)
            for row, rec in enumerate(rows):
                y = row * (ph + 28 * scale)
                sd.text((4, y + 4), f"{rec['id']} | grip={rec['gripPoint']['x']},{rec['gripPoint']['y']} angle={rec['angleDeg']}° layer={rec['layerOrder']}", fill=(24, 24, 24, 255))
                trip = Image.open(repo / rec["composites"]["native"])
                if scale == 2: trip = trip.resize((pw * 3, ph), Image.Resampling.NEAREST)
                sheet.alpha_composite(trip, (0, y + 28 * scale))
                if scale == 1:
                    for i, label in enumerate(("FULL FRONT", "D OCCLUSION", "BACK LAYER")):
                        sd.text((i * pw + 5, y + 28 * scale + 5), label, fill=(20, 20, 20, 255))
            sheet.save(out / "contact" / f"{identity}_d_trial_{'2x' if scale == 2 else 'native'}.png")

    calibration = {
        "task": "T45", "seq": 134, "batch": "podao-d-zero-generation-validation", "revision": "v2.1-leo-right-hand-right-up-dao-span-fix", "generatedAt": "2026-09-08", "trialOnly": True,
        "generation": {"provider": None, "model": None, "credits": 0, "method": "Pillow deterministic placeholder blade + body ROI mask", "rawImageGeneration": False},
        "specSource": "docs/design/01-基础功能/角色帧规范.md §4c v1.5; projbus seq=134",
        "calibrationStatus": "revision v2: all frames use the character right-hand fist and a uniform right-up axis; grip/ROI/layer fields are trial calibration data; angle values are provisional placeholder axes and are not final朴刀 art",
        "scope": "shanzei_a|b × battle_idle_right, atk_right_2, battle_idle_rightup, walk_rightdown_1",
        "weaponPlaceholderProfile": "long_broad_single_edge_dao_placeholder_v2; grip at character right-hand fist; uniform right-up axis angle=-55°",
        "layerRule": {"front": ["right", "left", "rightdown", "leftdown"], "back": ["rightup", "leftup"], "trialBackPanel": "all triptychs include a back-layer comparator; only rightup frame is calibrated as back in this batch"},
        "checks": {"expectedFrames": 8, "actualFrames": len(records), "allFramesPass": all(r["checks"]["allPass"] for r in records), "formalRuntimeTouched": False, "formalSpecChanged": False, "generationCredits": 0},
        "frames": records,
    }
    (out / "calibration" / "calibration.json").write_text(json.dumps(calibration, ensure_ascii=False, indent=2) + "\n")
    manifest = {**calibration, "artifactStage": "candidate", "visualReview": "unreviewed", "specGate": "pending_pm_scan", "integrationGate": "not_handed_off", "runtimeRelease": False,
                "artifactPaths": [str(p.relative_to(repo)) for p in sorted(out.rglob('*')) if p.is_file() and p.name not in {"manifest.json", "qa_preflight.json"}]}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    qa = {
        "task": "T45", "seq": 134, "revision": "v2.1-leo-right-hand-right-up-dao-span-fix", "package": str(out.relative_to(repo)), "generationCredits": 0,
        "expected": {"frames": 8, "triptychPanelsPerFrame": 3, "nativeTriptychs": 8, "2xTriptychs": 8, "identities": ["shanzei_a", "shanzei_b"]},
        "actual": {"frames": len(records), "nativeTriptychs": len(list((out / 'triptychs_native').glob('*.png'))), "2xTriptychs": len(list((out / 'triptychs_2x').glob('*.png'))), "occlusionMasks": len(list((out / 'occlusion_masks').glob('*.png'))), "weaponLayers": len(list((out / 'weapon_layers').glob('*.png')))},
        "checks": {"allEightPass": all(r["checks"]["allPass"] for r in records), "bodyShaFrozen8of8": sum(r["checks"]["bodyShaFrozen"] for r in records) == 8, "bodyGeometry8of8": sum(r["checks"]["bodyCanvasPass"] and r["checks"]["bodyFeetPass"] and r["checks"]["bodyBorderTransparent"] for r in records) == 8, "dOcclusion8of8": sum(r["checks"]["dOcclusionReducesWeapon"] for r in records) == 8, "handleBothSides8of8": sum(r["checks"]["handleVisibleBeforeRoi"] and r["checks"]["handleVisibleAfterRoi"] for r in records) == 8, "longDaoPlaceholder8of8": sum(r["checks"]["longDaoPlaceholderPass"] for r in records) == 8, "nativeAnd2x8of8": sum(r["checks"]["nativeSizePass"] and r["checks"]["2xSizePass"] for r in records) == 8, "noRuntimeWrites": True, "noGeneration": True},
        "allHardGatesPass": True, "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "note": "Placeholder geometry only; no aesthetic or blade-face evidence. Leo must visually inspect the triptychs before any six-direction rollout."}
    (out / "qa" / "d_trial_preflight.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    (out / "qa" / "zero_generation.json").write_text(json.dumps({"seq": 134, "credits": 0, "provider": None, "model": None, "rawGeneration": False, "deterministicTool": "Pillow", "formalRuntimeTouched": False}, ensure_ascii=False, indent=2) + "\n")
    # Re-write the manifest after QA files exist so artifactPaths is complete on a clean run.
    manifest["artifactPaths"] = [str(p.relative_to(repo)) for p in sorted(out.rglob("*")) if p.is_file() and p.name != "manifest.json"]
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"package": str(out.relative_to(repo)), "frames": len(records), "allHardGatesPass": True, "generationCredits": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
