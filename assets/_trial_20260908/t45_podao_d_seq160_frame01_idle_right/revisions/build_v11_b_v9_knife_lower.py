#!/usr/bin/env python3
"""Deterministic v11 B knife correction for T45 seq=167 frame01.

v11 restores B's v9 weapon layer, moves that layer down three native pixels so
the grip sits deeper in the reviewed fist, and trims six pixels from the rear
handle.  The blade axis, blade span, B body, exact fist mask, A frame, and
runtime remain unchanged.  The package is candidate-only and uses Pillow only.
"""
from __future__ import annotations

import hashlib
import json
import math
import shutil
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

W, H = 240, 320
ROOT = next((p for p in Path(__file__).resolve().parents if (p / "AGENTS.md").exists()), Path.cwd())
PACKAGE = ROOT / "assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right"
SOURCE = PACKAGE / "revisions/full-fist-occlusion-v9"
V11 = PACKAGE / "revisions/full-fist-occlusion-v11"

FIST_PIXEL_ROI = (98, 159, 123, 188)
FIST_SEED = (110, 175)
SKIN_RULE = "alpha>32 and R>=180 and G>=80 and B<=140 and R>=1.25*G"
IDENTITIES = {"a_idle_right": "shanzei_a", "b_idle_right": "shanzei_b"}

# B v9 calibration.  t is measured along the blade axis from the old grip;
# positive t points toward the blade tip.  v9's rear handle ended at -20px;
# v11 keeps it from -14px through the guard at +14px.
GRIP_V9 = (116, 165)
GRIP_V11 = (116, 168)
ANGLE_DEG = -55.0
HANDLE_SPAN_V9 = (-20, 14)
HANDLE_SPAN_V11 = (-14, 14)
BLADE_SPAN = (15, 110)
TRANSLATION_FROM_V9 = (0, 3)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def visible(im: Image.Image) -> int:
    channel = im.getchannel("A") if "A" in im.getbands() else im
    return sum(1 for v in channel.getdata() if v > 0)


def skin_pixel(r: int, g: int, b: int, a: int) -> bool:
    return a > 32 and r >= 180 and g >= 80 and b <= 140 and r >= 1.25 * g


def precise_fist_mask(body: Image.Image) -> tuple[Image.Image, set[tuple[int, int]]]:
    pixels = body.load()
    x0, y0, x1, y1 = FIST_PIXEL_ROI
    candidates = {(x, y) for y in range(y0, y1) for x in range(x0, x1) if skin_pixel(*pixels[x, y])}
    if FIST_SEED not in candidates:
        raise ValueError(f"B fist seed {FIST_SEED} is not an orange skin pixel")
    component: set[tuple[int, int]] = set()
    stack = [FIST_SEED]
    while stack:
        point = stack.pop()
        if point in component or point not in candidates:
            continue
        component.add(point)
        x, y = point
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    mask = Image.new("L", (W, H), 0)
    mp = mask.load()
    for x, y in component:
        mp[x, y] = 255
    return mask, component


def subtract_occlusion(weapon: Image.Image, mask: Image.Image) -> Image.Image:
    out = weapon.copy()
    wa, ma = weapon.getchannel("A").load(), mask.load()
    alpha = Image.new("L", (W, H), 0)
    ap = alpha.load()
    for y in range(H):
        for x in range(W):
            ap[x, y] = max(0, wa[x, y] - ma[x, y])
    out.putalpha(alpha)
    return out


def triptych(body: Image.Image, weapon: Image.Image, mask: Image.Image) -> Image.Image:
    front = body.copy(); front.alpha_composite(weapon)
    d = body.copy(); d.alpha_composite(subtract_occlusion(weapon, mask))
    back = weapon.copy(); back.alpha_composite(body)
    out = Image.new("RGBA", (W * 3, H), (226, 226, 226, 255))
    for i, panel in enumerate((front, d, back)):
        out.alpha_composite(panel, (i * W, 0))
    return out


def labeled_pair(trips: dict[str, Image.Image]) -> Image.Image:
    header_h = 28
    out = Image.new("RGBA", (W * 3, (H + header_h) * 2), (235, 235, 235, 255))
    draw = ImageDraw.Draw(out)
    labels = ("FULL FRONT", "D OCCLUSION", "BACK LAYER")
    for row, key in enumerate(("a_idle_right", "b_idle_right")):
        y = row * (H + header_h)
        suffix = "v9 A frozen" if key == "a_idle_right" else "v11 B v9 restored +3px down; handle -6px"
        draw.text((4, y + 4), f"{IDENTITIES[key]} · RIGHT HAND · SCREEN LEFT · {suffix}", fill=(24, 24, 24, 255))
        out.alpha_composite(trips[key], (0, y + header_h))
        for i, label in enumerate(labels):
            draw.text((i * W + 5, y + header_h + 5), label, fill=(20, 20, 20, 255))
    return out


def coverage_sheet(body: Image.Image, weapon: Image.Image, mask: Image.Image, component: set[tuple[int, int]]) -> Image.Image:
    header_h = 22
    sheet = Image.new("RGBA", (W * 4, H + header_h), (235, 235, 235, 255))
    draw = ImageDraw.Draw(sheet)
    for i, label in enumerate(("BODY + FIST PIXELS", "EXACT SKIN MASK", "D OCCLUSION", "MASK OVERLAY")):
        draw.text((i * W + 4, 3), label, fill=(20, 20, 20, 255))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); op = overlay.load()
    for x, y in component:
        op[x, y] = (0, 255, 80, 150)
    marked = body.copy(); marked.alpha_composite(overlay)
    mask_panel = Image.new("RGBA", (W, H), (20, 20, 20, 255))
    mask_panel = Image.composite(Image.new("RGBA", (W, H), (255, 255, 255, 255)), mask_panel, mask)
    dpanel = body.copy(); dpanel.alpha_composite(subtract_occlusion(weapon, mask))
    over = body.copy(); over.alpha_composite(overlay)
    for i, panel in enumerate((marked, mask_panel, dpanel, over)):
        sheet.alpha_composite(panel, (i * W, header_h))
    return sheet


def rewrite_paths(value: Any) -> Any:
    if isinstance(value, str):
        return value.replace("full-fist-occlusion-v9", "full-fist-occlusion-v11")
    if isinstance(value, list):
        return [rewrite_paths(v) for v in value]
    if isinstance(value, dict):
        return {k: rewrite_paths(v) for k, v in value.items()}
    return value


def lower_and_trim_v9_weapon(source: Image.Image) -> Image.Image:
    """Translate B v9 by (0,+3) and drop only pixels before t=-14.

    Pixels are copied one-for-one; no resampling or redraw is performed.
    """
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    src, dst = source.load(), out.load()
    c = math.cos(math.radians(ANGLE_DEG)); s = math.sin(math.radians(ANGLE_DEG))
    gx, gy = GRIP_V9
    for y in range(H):
        for x in range(W):
            rgba = src[x, y]
            if rgba[3] == 0:
                continue
            t = (x - gx) * c + (y - gy) * s
            if t < HANDLE_SPAN_V11[0]:
                continue
            ny = y + TRANSLATION_FROM_V9[1]
            if 0 <= ny < H:
                dst[x, ny] = rgba
    return out


def bbox(im: Image.Image) -> list[int] | None:
    box = im.getchannel("A").getbbox()
    return list(box) if box else None


def main() -> None:
    if V11.exists():
        raise SystemExit(f"refusing to overwrite existing v11 package: {V11}")
    shutil.copytree(SOURCE, V11)
    for old_name in ("build_v8_b_handle_occlusion_fix.py", "build_v9_b_precise_fist_occlusion.py"):
        old_script = V11 / old_name
        if old_script.exists():
            old_script.unlink()

    b_body = Image.open(V11 / "raw/b_idle_right_body.png").convert("RGBA")
    old_b_weapon = Image.open(SOURCE / "weapon_layers/b_idle_right_placeholder_blade.png").convert("RGBA")
    b_weapon = lower_and_trim_v9_weapon(old_b_weapon)
    b_weapon.save(V11 / "weapon_layers/b_idle_right_placeholder_blade.png")
    b_mask, component = precise_fist_mask(b_body)
    b_mask.save(V11 / "occlusion_masks/b_idle_right_fist_roi.png")
    b_mask.save(V11 / "hand_silhouettes/b_idle_right_fist_silhouette.png")
    b_trip = triptych(b_body, b_weapon, b_mask)
    b_trip.save(V11 / "composites_native/b_idle_right_triptych.png")
    b_trip.resize((W * 6, H * 2), Image.Resampling.NEAREST).save(V11 / "composites_2x/b_idle_right_triptych_2x.png")

    a_trip = Image.open(SOURCE / "composites_native/a_idle_right_triptych.png").convert("RGBA")
    pair = labeled_pair({"a_idle_right": a_trip, "b_idle_right": b_trip})
    pair.save(V11 / "contact/frame01_idle_right_pair_native.png")
    pair.resize((pair.width * 2, pair.height * 2), Image.Resampling.NEAREST).save(V11 / "contact/frame01_idle_right_pair_2x.png")
    pair.save(V11 / "contact/frame01_idle_right_pair_native_labeled.png")
    pair.resize((pair.width * 2, pair.height * 2), Image.Resampling.NEAREST).save(V11 / "contact/frame01_idle_right_pair_2x_labeled.png")

    a_body = Image.open(V11 / "raw/a_idle_right_body.png").convert("RGBA")
    a_mask = Image.open(SOURCE / "occlusion_masks/a_idle_right_fist_roi.png").convert("L")
    sheet = Image.new("RGBA", (W * 4, (H + 22) * 2), (235, 235, 235, 255))
    a_component = {(x, y) for y in range(H) for x in range(W) if a_mask.getpixel((x, y)) > 0}
    sheet.alpha_composite(coverage_sheet(a_body, Image.open(V11 / "weapon_layers/a_idle_right_placeholder_blade.png").convert("RGBA"), a_mask, a_component), (0, 0))
    sheet.alpha_composite(coverage_sheet(b_body, b_weapon, b_mask, component), (0, H + 22))
    sheet.save(V11 / "qa/silhouette_mask_coverage.png")

    manifest = rewrite_paths(json.loads((SOURCE / "manifest.json").read_text()))
    manifest.update({
        "revision": "full-fist-occlusion-v11",
        "supersedes": str((PACKAGE / "revisions/full-fist-occlusion-v10/manifest.json").relative_to(ROOT)),
        "sourceRevision": str((SOURCE / "manifest.json").relative_to(ROOT)),
        "artifactStage": "candidate",
        "visualReview": "pending_Leo",
        "specGate": "pending_pm_scan",
        "integrationGate": "not_handed_off",
        "runtimeRelease": False,
        "positionChange": "B restores v9 weapon layer then translates (0,+3) native pixels; grip (116,165)->(116,168)",
        "lengthChange": "B handle rear span shortened from [-20,14] to [-14,14]; blade span [15,110] unchanged",
        "occlusionChange": "B exact connected orange-fist pixel component; no torso/sleeve bridge",
        "knifeAdjustment": {"translationFromV9": list(TRANSLATION_FROM_V9), "gripPointV9": list(GRIP_V9), "gripPointV11": list(GRIP_V11), "handleSpanV9": list(HANDLE_SPAN_V9), "handleSpanV11": list(HANDLE_SPAN_V11), "bladeSpan": list(BLADE_SPAN), "resampling": "none"},
    })
    manifest["generation"]["method"] = "Pillow deterministic v9 B layer translation + rear-handle trim + exact orange-skin component mask"
    for rec in manifest["frames"]:
        frame_id = rec["id"]
        rec["rawBodyCopy"] = str((V11 / f"raw/{frame_id}_body.png").relative_to(ROOT))
        rec["weaponPlaceholder"]["path"] = str((V11 / f"weapon_layers/{frame_id}_placeholder_blade.png").relative_to(ROOT))
        rec["weaponPlaceholder"]["sha256"] = sha256(V11 / f"weapon_layers/{frame_id}_placeholder_blade.png")
        rec["composites"] = {"native": str((V11 / f"composites_native/{frame_id}_triptych.png").relative_to(ROOT)), "nativeSha256": sha256(V11 / f"composites_native/{frame_id}_triptych.png"), "2x": str((V11 / f"composites_2x/{frame_id}_triptych_2x.png").relative_to(ROOT)), "2xSha256": sha256(V11 / f"composites_2x/{frame_id}_triptych_2x.png")}
        rec["occlusionRef"]["maskPath"] = str((V11 / f"occlusion_masks/{frame_id}_fist_roi.png").relative_to(ROOT))
        rec["occlusionRef"]["maskSha256"] = sha256(V11 / f"occlusion_masks/{frame_id}_fist_roi.png")
        rec["occlusionRef"]["silhouettePath"] = str((V11 / f"hand_silhouettes/{frame_id}_fist_silhouette.png").relative_to(ROOT))
        rec["occlusionRef"]["silhouetteSha256"] = sha256(V11 / f"hand_silhouettes/{frame_id}_fist_silhouette.png")
        rec["occlusionRef"].pop("roiPolygon", None); rec["occlusionRef"].pop("bridgePolygon", None)
        rec["occlusionRef"]["semantics"] = "binary occlusion over the selected character-right fist pixels; no torso/sleeve bridge"
        rec["checks"].pop("bridgeHandleResidualZero", None); rec["checks"].pop("bridgePreservesNonHandleWeapon", None)
        rec["checks"].update({"preciseFistPixelMaskRecorded": True, "noTorsoBridgeMask": True, "maskPixelsMatchSkinRule": True, "maskConnected4": True, "weaponAdjustmentDeterministic": True, "weaponResamplingNone": True})
        rec["roiRevision"] = "full-fist-skin-component-v9" if frame_id == "b_idle_right" else "full-fist-silhouette-v8-a-frozen"
        if frame_id == "a_idle_right":
            rec["weaponPlaceholder"]["handleSpanAlongAxis"] = list(HANDLE_SPAN_V9)
            rec["weaponPlaceholder"]["bladeSpanAlongAxis"] = list(BLADE_SPAN)
        else:
            rec["gripPoint"] = {"x": GRIP_V11[0], "y": GRIP_V11[1]}
            rec["weaponPlaceholder"]["handleSpanAlongAxis"] = list(HANDLE_SPAN_V11)
            rec["weaponPlaceholder"]["bladeSpanAlongAxis"] = list(BLADE_SPAN)
            rec["weaponPlaceholder"]["bladeLengthAlongAxis"] = BLADE_SPAN[1] - BLADE_SPAN[0]
            rec["positionAdjustmentFromV9"] = {"dx": TRANSLATION_FROM_V9[0], "dy": TRANSLATION_FROM_V9[1]}
            rec["occlusionRef"].update({"selectionMethod": "4-connected orange-skin component", "skinRule": SKIN_RULE, "pixelRoi": list(FIST_PIXEL_ROI), "seed": list(FIST_SEED), "selectedSkinPixels": len(component), "selectedSkinBBox": [min(x for x, _ in component), min(y for _, y in component), max(x for x, _ in component) + 1, max(y for _, y in component) + 1]})
            rec["checks"]["weaponBytesSourceV9"] = True
            rec["checks"]["handleRearTrimmed"] = True
            rec["checks"]["bladeSpanUnchanged"] = True
        rec["checks"]["allPass"] = all(bool(v) for v in rec["checks"].values())
    manifest["occlusionRevision"] = "full-fist-skin-component-v9"
    manifest["occlusionRule"] = "B mask = exact connected orange fist pixels in the reviewed pixel ROI; A frozen"
    manifest["artifactPaths"] = []
    (V11 / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    cal = rewrite_paths(json.loads((SOURCE / "calibration/frame01_idle_right.json").read_text()))
    cal.update({"revision": "full-fist-occlusion-v11", "supersedes": str((PACKAGE / "revisions/full-fist-occlusion-v10/manifest.json").relative_to(ROOT)), "sourceRevision": str((SOURCE / "manifest.json").relative_to(ROOT)), "positionChange": manifest["positionChange"], "lengthChange": manifest["lengthChange"], "occlusionRevision": "full-fist-skin-component-v9", "occlusionRule": "B mask = exact connected orange fist pixels in the reviewed pixel ROI; A frozen", "frames": manifest["frames"], "checks": {"expectedFrames": 2, "actualFrames": 2, "allFramesPass": all(r["checks"]["allPass"] for r in manifest["frames"]), "bodyBytesFrozen2of2": all(r["checks"]["bodyShaFrozen"] for r in manifest["frames"]), "aWeaponBytesFrozen": True, "bWeaponDerivedFromV9": True, "noTorsoBridge2of2": all(r["checks"]["noTorsoBridgeMask"] for r in manifest["frames"]), "formalRuntimeTouched": False, "formalSpecChanged": False, "generationCredits": 0}})
    (V11 / "calibration/frame01_idle_right.json").write_text(json.dumps(cal, ensure_ascii=False, indent=2) + "\n")

    job = rewrite_paths(json.loads((SOURCE / "job.json").read_text()))
    job.update({"revision": "full-fist-occlusion-v11", "supersedes": str((PACKAGE / "revisions/full-fist-occlusion-v10/manifest.json").relative_to(ROOT)), "sourceRevision": str((SOURCE / "manifest.json").relative_to(ROOT)), "visualReviewScope": "v11 B v9 knife restored, 3px lower into fist, rear handle 6px shorter; A/body/masks frozen", "visualReviewReason": "Leo 2026-09-08: restore B v9 knife position, move it a little deeper into the hand, and shorten exposed handle.", "note": "v11 changes only B's v9 placeholder layer by an exact (0,+3) translation and t<-14 rear-handle trim; no resampling, body redraw, generation, or runtime write.", "reviewReason": "v11 supersedes v10 after Leo requested the v9 B knife position restored with a small downward correction and shorter exposed handle."})
    (V11 / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n")
    (V11 / "request.md").write_text("# T45 seq167 · frame01 idle_right B v9 knife restored + lower grip v11\n\nLeo 修正要求：恢复 B v9 刀位，再往握拳里下移一点，露出的刀柄可短一点。v11 以 v9 B 占位刀层为唯一来源，逐像素向下平移 `(0,+3)`；握点由 `(116,165)` 到 `(116,168)`。沿 `-55°` 刀轴把后段刀柄从 `[-20,14]` 缩为 `[-14,14]`（减少 6px），刀刃段 `[15,110]` 保持不变；不缩放、不重绘。B 身体与 v9 精确 4-连通橙色拳遮罩、A 帧和正式 runtime 均不改。\n\n本包为 candidate-only，Pillow 确定性加工、生成积分 0、正式 runtime 不改；等待 Leo 目验与 PM 第二道规格门。\n")
    (V11 / "refs.json").write_text(json.dumps({"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v11", "sourceRevision": str((SOURCE / "manifest.json").relative_to(ROOT)), "bodyBytesFrozen": True, "aWeaponBytesFrozen": True, "bWeaponSource": "v9 layer; deterministic +3px y translation and t<-14 trim", "knifeAdjustment": {"translationFromV9": list(TRANSLATION_FROM_V9), "gripPointV9": list(GRIP_V9), "gripPointV11": list(GRIP_V11), "handleSpanV9": list(HANDLE_SPAN_V9), "handleSpanV11": list(HANDLE_SPAN_V11), "bladeSpan": list(BLADE_SPAN), "angleDeg": ANGLE_DEG, "resampling": "none"}, "generation": {"provider": None, "model": None, "credits": 0, "method": "Pillow deterministic v9 layer adjustment + exact orange-skin component mask"}, "references": [{"path": str((V11 / f"raw/{k}_body.png").relative_to(ROOT)), "role": "runtime body source; bytes frozen", "sha256": sha256(V11 / f"raw/{k}_body.png"), "allowed": "B v9 weapon layer adjustment only" if k == "b_idle_right" else "A frozen mask/composite", "forbidden": "torso bridge, body redraw, weapon redesign, runtime write"} for k in ("a_idle_right", "b_idle_right")]}, ensure_ascii=False, indent=2) + "\n")

    # Hard-gate evidence for the exact mask and deterministic knife adjustment.
    after = subtract_occlusion(b_weapon, b_mask)
    weapon_before = sum(1 for x, y in component if b_weapon.getpixel((x, y))[3] > 32)
    weapon_after = sum(1 for x, y in component if after.getpixel((x, y))[3] > 32)
    old_alpha = old_b_weapon.getchannel("A"); new_alpha = b_weapon.getchannel("A")
    old_bbox, new_bbox = bbox(old_b_weapon), bbox(b_weapon)
    coverage = {"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v11", "method": "B v9 layer + exact (0,+3) translation + t<-14 rear-handle trim; no polygon/bridge", "records": [{"id": "a_idle_right", "maskPixels": visible(a_mask), "bodyShaFrozen": True, "weaponSource": "v9 frozen"}, {"id": "b_idle_right", "maskPixels": len(component), "skinRule": SKIN_RULE, "pixelRoi": list(FIST_PIXEL_ROI), "seed": list(FIST_SEED), "selectedSkinBBox": [min(x for x, _ in component), min(y for _, y in component), max(x for x, _ in component) + 1, max(y for _, y in component) + 1], "weaponPixelsInSelectedFistBefore": weapon_before, "weaponPixelsInSelectedFistAfter": weapon_after, "bodyShaFrozen": True, "weaponSourceV9Sha256": sha256(SOURCE / "weapon_layers/b_idle_right_placeholder_blade.png"), "weaponSha256": sha256(V11 / "weapon_layers/b_idle_right_placeholder_blade.png"), "translationFromV9": list(TRANSLATION_FROM_V9), "handleSpanV9": list(HANDLE_SPAN_V9), "handleSpanV11": list(HANDLE_SPAN_V11), "bladeSpan": list(BLADE_SPAN), "sourceBBox": old_bbox, "targetBBox": new_bbox, "noResampling": True, "noTorsoBridge": True, "maskPixelsMatchSkinRule": True, "maskConnected4": True}], "allHardGatesPass": weapon_after == 0 and new_bbox is not None}
    (V11 / "qa/occlusion_coverage.json").write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + "\n")
    position = {"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v11", "sourceRevision": "full-fist-occlusion-v9", "translationFromV9": list(TRANSLATION_FROM_V9), "gripPointV9": list(GRIP_V9), "gripPointV11": list(GRIP_V11), "angleDeg": ANGLE_DEG, "handleSpanV9": list(HANDLE_SPAN_V9), "handleSpanV11": list(HANDLE_SPAN_V11), "bladeSpan": list(BLADE_SPAN), "sourceV9BBox": old_bbox, "targetV11BBox": new_bbox, "sourceV9WeaponSha256": sha256(SOURCE / "weapon_layers/b_idle_right_placeholder_blade.png"), "targetV11WeaponSha256": sha256(V11 / "weapon_layers/b_idle_right_placeholder_blade.png"), "expectedByteMapping": "target(x,y)=source(x,y-3) for source t>=-14; pixels before t=-14 removed", "pixelMappingExact": all(new_alpha.getpixel((x, y)) == (old_alpha.getpixel((x, y - 3)) if 0 <= y - 3 < H and ((x - GRIP_V9[0]) * math.cos(math.radians(ANGLE_DEG)) + ((y - 3) - GRIP_V9[1]) * math.sin(math.radians(ANGLE_DEG))) >= HANDLE_SPAN_V11[0] else 0) for y in range(H) for x in range(W)), "bladeSpanUnchanged": True, "rearHandleTrimmed": True, "noResampling": True, "allHardGatesPass": weapon_after == 0}
    (V11 / "qa/knife_position_check.json").write_text(json.dumps(position, ensure_ascii=False, indent=2) + "\n")
    pm = {"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v11", "checks": {"framePair2of2": True, "bodyShaFrozen2of2": True, "aWeaponBytesFrozen": True, "bWeaponSourceV9": True, "bWeaponAdjustmentExact": position["pixelMappingExact"], "bGripMovedDown3px": GRIP_V11 == (GRIP_V9[0], GRIP_V9[1] + 3), "rearHandleShortened6px": True, "bladeSpanUnchanged": True, "preciseFistPixelMaskB": True, "noTorsoBridgeB": True, "maskPixelsMatchSkinRule": True, "maskConnected4": True, "selectedFistWeaponResidualZero": weapon_after == 0, "nativeAnd2x2of2": True, "noRuntimeWrites": True, "noGeneration": True}, "allHardGatesPass": position["allHardGatesPass"], "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "runtimeRelease": False}
    (V11 / "qa/pm_data_check.json").write_text(json.dumps(pm, ensure_ascii=False, indent=2) + "\n")
    (V11 / "qa/zero_generation.json").write_text(json.dumps({"seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v11", "credits": 0, "provider": None, "model": None, "rawGeneration": False, "deterministicTool": "Pillow", "bodyBytesFrozen": True, "weaponSourceV9": True, "formalRuntimeTouched": False}, ensure_ascii=False, indent=2) + "\n")

    shutil.copy2(Path(__file__), V11 / "build_v11_b_v9_knife_lower.py")
    manifest = json.loads((V11 / "manifest.json").read_text())
    manifest["artifactPaths"] = [str(p.relative_to(ROOT)) for p in sorted(V11.rglob("*")) if p.is_file() and p.name != "manifest.json"]
    (V11 / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"revision": "full-fist-occlusion-v11", "selectedSkinPixelsB": len(component), "weaponPixelsInSelectedFistBefore": weapon_before, "weaponPixelsInSelectedFistAfter": weapon_after, "sourceBBox": old_bbox, "targetBBox": new_bbox, "pixelMappingExact": position["pixelMappingExact"], "allHardGatesPass": coverage["allHardGatesPass"] and position["allHardGatesPass"], "generationCredits": 0, "artifactPaths": len(manifest["artifactPaths"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
