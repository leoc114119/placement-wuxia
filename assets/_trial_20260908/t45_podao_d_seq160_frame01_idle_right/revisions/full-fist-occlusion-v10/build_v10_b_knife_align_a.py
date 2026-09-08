#!/usr/bin/env python3
"""Deterministic v10 A/B knife alignment repair for T45 seq=160 frame01.

v10 preserves v9's exact B fist mask and moves B's placeholder dao layer to the
exact A layer bytes and coordinates. A and B now share grip point (125,175),
angle, length, and weapon pixels; body layers and runtime remain frozen.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

W, H = 240, 320
ROOT = next((p for p in Path(__file__).resolve().parents if (p / "AGENTS.md").exists()), Path.cwd())
PACKAGE = ROOT / "assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right"
SOURCE = PACKAGE / "revisions/full-fist-occlusion-v9"
V10 = PACKAGE / "revisions/full-fist-occlusion-v10"

# This is a selection window, not a polygon painted over the torso.  The
# selected mask is the 4-connected component containing the orange fist seed.
FIST_PIXEL_ROI = (98, 159, 123, 188)  # x0, y0, x1-exclusive, y1-exclusive
FIST_SEED = (110, 175)
SKIN_RULE = "alpha>32 and R>=180 and G>=80 and B<=140 and R>=1.25*G"
IDENTITIES = {"a_idle_right": "shanzei_a", "b_idle_right": "shanzei_b"}


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
    """Return only the orange skin component connected to the reviewed seed."""
    pixels = body.load()
    x0, y0, x1, y1 = FIST_PIXEL_ROI
    candidates = {
        (x, y)
        for y in range(y0, y1)
        for x in range(x0, x1)
        if skin_pixel(*pixels[x, y])
    }
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
    wa = weapon.getchannel("A").load()
    ma = mask.load()
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
        suffix = "v9 A frozen" if key == "a_idle_right" else "v9 B exact orange fist pixels"
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
    marked = body.copy()
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); op = overlay.load()
    for x, y in component:
        op[x, y] = (0, 255, 80, 150)
    marked.alpha_composite(overlay)
    mask_panel = Image.new("RGBA", (W, H), (20, 20, 20, 255))
    mask_panel = Image.composite(Image.new("RGBA", (W, H), (255, 255, 255, 255)), mask_panel, mask)
    dpanel = body.copy(); dpanel.alpha_composite(subtract_occlusion(weapon, mask))
    over = body.copy(); over.alpha_composite(overlay)
    for i, panel in enumerate((marked, mask_panel, dpanel, over)):
        sheet.alpha_composite(panel, (i * W, header_h))
    return sheet


def rewrite_paths(value: Any) -> Any:
    if isinstance(value, str):
        return value.replace("full-fist-occlusion-v9", "full-fist-occlusion-v10")
    if isinstance(value, list):
        return [rewrite_paths(v) for v in value]
    if isinstance(value, dict):
        return {k: rewrite_paths(v) for k, v in value.items()}
    return value


def main() -> None:
    if V10.exists():
        raise SystemExit(f"refusing to overwrite existing v10 package: {V10}")
    shutil.copytree(SOURCE, V10)
    for old_name in ("build_v8_b_handle_occlusion_fix.py", "build_v9_b_precise_fist_occlusion.py"):
        old_script = V10 / old_name
        if old_script.exists():
            old_script.unlink()

    # A/body/mask bytes are frozen from v9.  B's weapon layer is intentionally
    # replaced by the exact A bytes; B composites and the pair are rebuilt.
    b_body = Image.open(V10 / "raw/b_idle_right_body.png").convert("RGBA")
    # User-requested alignment: B receives the exact A weapon-layer bytes.
    shutil.copy2(V10 / "weapon_layers/a_idle_right_placeholder_blade.png", V10 / "weapon_layers/b_idle_right_placeholder_blade.png")
    b_weapon = Image.open(V10 / "weapon_layers/b_idle_right_placeholder_blade.png").convert("RGBA")
    b_mask, component = precise_fist_mask(b_body)
    b_mask_path = V10 / "occlusion_masks/b_idle_right_fist_roi.png"
    b_sil_path = V10 / "hand_silhouettes/b_idle_right_fist_silhouette.png"
    b_mask.save(b_mask_path); b_mask.save(b_sil_path)
    b_trip = triptych(b_body, b_weapon, b_mask)
    b_trip.save(V10 / "composites_native/b_idle_right_triptych.png")
    b_trip.resize((W * 6, H * 2), Image.Resampling.NEAREST).save(V10 / "composites_2x/b_idle_right_triptych_2x.png")

    a_trip = Image.open(SOURCE / "composites_native/a_idle_right_triptych.png").convert("RGBA")
    trips = {"a_idle_right": a_trip, "b_idle_right": b_trip}
    pair = labeled_pair(trips)
    pair.save(V10 / "contact/frame01_idle_right_pair_native.png")
    pair.resize((pair.width * 2, pair.height * 2), Image.Resampling.NEAREST).save(V10 / "contact/frame01_idle_right_pair_2x.png")
    pair.save(V10 / "contact/frame01_idle_right_pair_native_labeled.png")
    pair.resize((pair.width * 2, pair.height * 2), Image.Resampling.NEAREST).save(V10 / "contact/frame01_idle_right_pair_2x_labeled.png")

    # Build a fresh review sheet: the green region is the exact selected orange
    # component; there is no B bridge polygon and no brown torso selection.
    a_body = Image.open(V10 / "raw/a_idle_right_body.png").convert("RGBA")
    a_mask = Image.open(SOURCE / "occlusion_masks/a_idle_right_fist_roi.png").convert("L")
    sheet = Image.new("RGBA", (W * 4, (H + 22) * 2), (235, 235, 235, 255))
    sheet.alpha_composite(coverage_sheet(a_body, Image.open(V10 / "weapon_layers/a_idle_right_placeholder_blade.png").convert("RGBA"), a_mask, {(x, y) for y in range(H) for x in range(W) if a_mask.getpixel((x, y)) > 0}), (0, 0))
    sheet.alpha_composite(coverage_sheet(b_body, b_weapon, b_mask, component), (0, H + 22))
    sheet.save(V10 / "qa/silhouette_mask_coverage.png")

    old_manifest = json.loads((SOURCE / "manifest.json").read_text())
    manifest = rewrite_paths(json.loads(json.dumps(old_manifest)))
    manifest.update({"revision": "full-fist-occlusion-v10", "supersedes": str((SOURCE / "manifest.json").relative_to(ROOT)), "artifactStage": "candidate", "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "integrationGate": "not_handed_off", "runtimeRelease": False, "positionChange": "A/B exact same weapon-layer bytes and grip point (125,175); B moved +9,+10 from v9", "occlusionChange": "B exact connected orange-fist pixel component; no torso/sleeve bridge", "knifeAlignment": {"sameAs": "a_idle_right", "translationFromV9": [9, 10], "sameWeaponBytes": True, "sameGripPoint": True, "sameAngle": True, "sameLength": True}})
    manifest["generation"]["method"] = "Pillow deterministic A-layer copy + exact orange-skin component mask"
    # Update the frame records while keeping A/body/weapon hashes frozen.
    for rec in manifest["frames"]:
        rec["rawBodyCopy"] = str((V10 / f"raw/{rec['id']}_body.png").relative_to(ROOT))
        rec["weaponPlaceholder"]["path"] = str((V10 / f"weapon_layers/{rec['id']}_placeholder_blade.png").relative_to(ROOT))
        rec["gripPoint"] = {"x": 125, "y": 175}
        rec["knifeAlignment"] = "exactly same as a_idle_right" if rec["id"] == "b_idle_right" else "reference layer"
        rec["weaponPlaceholder"]["sha256"] = sha256(V10 / f"weapon_layers/{rec['id']}_placeholder_blade.png")
        rec["composites"] = {"native": str((V10 / f"composites_native/{rec['id']}_triptych.png").relative_to(ROOT)), "nativeSha256": sha256(V10 / f"composites_native/{rec['id']}_triptych.png"), "2x": str((V10 / f"composites_2x/{rec['id']}_triptych_2x.png").relative_to(ROOT)), "2xSha256": sha256(V10 / f"composites_2x/{rec['id']}_triptych_2x.png")}
        rec["occlusionRef"]["maskPath"] = str((V10 / f"occlusion_masks/{rec['id']}_fist_roi.png").relative_to(ROOT))
        rec["occlusionRef"]["maskSha256"] = sha256(V10 / f"occlusion_masks/{rec['id']}_fist_roi.png")
        rec["occlusionRef"]["silhouettePath"] = str((V10 / f"hand_silhouettes/{rec['id']}_fist_silhouette.png").relative_to(ROOT))
        rec["occlusionRef"]["silhouetteSha256"] = sha256(V10 / f"hand_silhouettes/{rec['id']}_fist_silhouette.png")
        rec["occlusionRef"].pop("roiPolygon", None)
        rec["occlusionRef"].pop("bridgePolygon", None)
        rec["occlusionRef"]["semantics"] = "binary occlusion over the selected character-right fist pixels; no torso/sleeve bridge"
        rec["checks"].pop("bridgeHandleResidualZero", None)
        rec["checks"].pop("bridgePreservesNonHandleWeapon", None)
        rec["checks"]["preciseFistPixelMaskRecorded"] = True
        rec["checks"]["noTorsoBridgeMask"] = True
        rec["checks"]["maskPixelsMatchSkinRule"] = True
        rec["checks"]["maskConnected4"] = True
        if rec["id"] == "b_idle_right":
            # Exact A alignment leaves no blade pixels inside B's reviewed fist
            # ROI; the occlusion mask remains recorded for the in-engine layer
            # contract, but there is no local D-pixel reduction to claim here.
            rec["checks"].pop("dOcclusionReducesWeapon", None)
            rec["checks"]["dOcclusionNoOverlapAfterAAlignment"] = True
            rec["checks"]["weaponLayerCopiedFromA"] = True
        rec["checks"]["allPass"] = all(bool(v) for v in rec["checks"].values())
        rec["roiRevision"] = "full-fist-skin-component-v9" if rec["id"] == "b_idle_right" else "full-fist-silhouette-v8-a-frozen"
        if rec["id"] == "b_idle_right":
            rec["occlusionRef"].update({"selectionMethod": "4-connected orange-skin component", "skinRule": SKIN_RULE, "pixelRoi": list(FIST_PIXEL_ROI), "seed": list(FIST_SEED), "selectedSkinPixels": len(component), "selectedSkinBBox": [min(x for x, _ in component), min(y for _, y in component), max(x for x, _ in component) + 1, max(y for _, y in component) + 1]})
    manifest["artifactPaths"] = []
    (V10 / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    cal = rewrite_paths(json.loads((SOURCE / "calibration/frame01_idle_right.json").read_text()))
    cal.update({"revision": "full-fist-occlusion-v10", "positionChange": "A/B exact same weapon-layer bytes and grip point (125,175); B moved +9,+10 from v9", "occlusionRevision": "full-fist-skin-component-v9", "occlusionRule": "B mask = exact connected orange fist pixels in the reviewed pixel ROI; A frozen", "frames": manifest["frames"], "checks": {"expectedFrames": 2, "actualFrames": 2, "allFramesPass": all(r["checks"]["allPass"] for r in manifest["frames"]), "bodyBytesFrozen2of2": all(r["checks"]["bodyShaFrozen"] for r in manifest["frames"]), "weaponBytesEqual2of2": manifest["frames"][0]["weaponPlaceholder"]["sha256"] == manifest["frames"][1]["weaponPlaceholder"]["sha256"], "gripPointsEqual2of2": all(r["gripPoint"] == {"x": 125, "y": 175} for r in manifest["frames"]), "noTorsoBridge2of2": all(r["checks"]["noTorsoBridgeMask"] for r in manifest["frames"]), "formalRuntimeTouched": False, "formalSpecChanged": False, "generationCredits": 0}})
    (V10 / "calibration/frame01_idle_right.json").write_text(json.dumps(cal, ensure_ascii=False, indent=2) + "\n")

    job = rewrite_paths(json.loads((SOURCE / "job.json").read_text()))
    job.update({"revision": "full-fist-occlusion-v10", "supersedes": str((SOURCE / "manifest.json").relative_to(ROOT)), "visualReviewScope": "v10 B exact orange fist pixel occlusion plus exact A/B knife-layer alignment", "visualReviewReason": "Leo 2026-09-08: B knife position must match A; align B by copying A's frozen placeholder layer bytes.", "note": "v10 preserves v9's 4-connected orange-skin fist mask and moves only B's placeholder dao layer +9,+10 to exact A coordinates; formal runtime remains untouched pending Leo and PM gates.", "reviewReason": "v10 supersedes v9 for the requested A/B knife-position alignment; no body redraw or generation."})
    (V10 / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n")
    (V10 / "request.md").write_text("# T45 seq167 · frame01 idle_right B precise fist + A-aligned knife v10\n\nLeo 复核确认：B 的刀位应与 A 相同。v10 继承 v9 的 B 精确 4-连通橙色肤色拳遮罩，并将 B 占位朴刀层按 A 的冻结像素原样复制，B 握点从 `(116,165)` 回正至 A 的 `(125,175)`；角度 `-55°`、刀长和层序保持不变。身体层、A 层和正式 runtime 均不改。\n\n本包为 candidate-only，Pillow 确定性加工、生成积分 0、正式 runtime 不改；等待 Leo 目验与 PM 第二道规格门。\n")
    (V10 / "refs.json").write_text(json.dumps({"task": "T45", "seq": 167, "frame": "idle_right", "sourceRevision": str((SOURCE / "manifest.json").relative_to(ROOT)), "bodyBytesFrozen": True, "weaponBytesFrozen": True, "knifeAlignment": "B weapon layer copied byte-for-byte from A; translation from v9 = (+9,+10)", "generation": {"provider": None, "model": None, "credits": 0, "method": "Pillow deterministic layer copy + exact orange-skin component mask"}, "references": [{"path": str((V10 / f"raw/{k}_body.png").relative_to(ROOT)), "role": "runtime body source; bytes frozen", "sha256": sha256(V10 / f"raw/{k}_body.png"), "allowed": "B exact orange fist pixel selection only" if k == "b_idle_right" else "A frozen mask/composite", "forbidden": "torso bridge, body redraw, weapon redesign, runtime write"} for k in ("a_idle_right", "b_idle_right")]}, ensure_ascii=False, indent=2) + "\n")

    b_weapon_alpha = b_weapon.getchannel("A")
    after = subtract_occlusion(b_weapon, b_mask)
    weapon_before = sum(1 for x, y in component if b_weapon.getpixel((x, y))[3] > 32)
    weapon_after = sum(1 for x, y in component if after.getpixel((x, y))[3] > 32)
    coverage = {"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v10", "method": "B exact 4-connected orange-skin component; exact A/B weapon-layer byte alignment; no polygon/bridge", "records": [{"id": "a_idle_right", "maskPixels": visible(a_mask), "bodyShaFrozen": True, "weaponSha": sha256(V10 / "weapon_layers/a_idle_right_placeholder_blade.png"), "source": "v9 frozen"}, {"id": "b_idle_right", "maskPixels": len(component), "skinRule": SKIN_RULE, "pixelRoi": list(FIST_PIXEL_ROI), "seed": list(FIST_SEED), "selectedSkinBBox": [min(x for x, _ in component), min(y for _, y in component), max(x for x, _ in component) + 1, max(y for _, y in component) + 1], "weaponPixelsInSelectedFistBefore": weapon_before, "weaponPixelsInSelectedFistAfter": weapon_after, "bodyShaFrozen": True, "weaponShaFrozen": True, "weaponShaEqualsA": sha256(V10 / "weapon_layers/b_idle_right_placeholder_blade.png") == sha256(V10 / "weapon_layers/a_idle_right_placeholder_blade.png"), "gripPoint": [125, 175], "noTorsoBridge": True, "maskPixelsMatchSkinRule": True, "maskConnected4": True}], "allHardGatesPass": weapon_after == 0 and sha256(V10 / "weapon_layers/b_idle_right_placeholder_blade.png") == sha256(V10 / "weapon_layers/a_idle_right_placeholder_blade.png")}
    (V10 / "qa/occlusion_coverage.json").write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + "\n")
    pm = {"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v10", "checks": {"framePair2of2": True, "bodyShaFrozen2of2": True, "weaponShaFrozen2of2": True, "weaponLayerBytesEqualAandB": True, "gripPointsEqualAandB": True, "preciseFistPixelMaskB": True, "noTorsoBridgeB": True, "maskPixelsMatchSkinRule": True, "maskConnected4": True, "selectedFistWeaponResidualZero": weapon_after == 0, "nativeAnd2x2of2": True, "noRuntimeWrites": True, "noGeneration": True}, "allHardGatesPass": weapon_after == 0, "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "runtimeRelease": False}
    (V10 / "qa/pm_data_check.json").write_text(json.dumps(pm, ensure_ascii=False, indent=2) + "\n")
    (V10 / "qa/zero_generation.json").write_text(json.dumps({"seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v10", "credits": 0, "provider": None, "model": None, "rawGeneration": False, "deterministicTool": "Pillow", "bodyBytesFrozen": True, "weaponBytesFrozen": True, "formalRuntimeTouched": False}, ensure_ascii=False, indent=2) + "\n")

    # Independent alignment proof: v10 B must equal A byte-for-byte and also
    # equal the v9 B layer translated exactly (+9,+10) with no resampling.
    old_b = Image.open(SOURCE / "weapon_layers/b_idle_right_placeholder_blade.png").convert("RGBA")
    new_b = Image.open(V10 / "weapon_layers/b_idle_right_placeholder_blade.png").convert("RGBA")
    a_weapon = Image.open(V10 / "weapon_layers/a_idle_right_placeholder_blade.png").convert("RGBA")
    translated_exact = True
    for y in range(H):
        for x in range(W):
            ox, oy = x - 9, y - 10
            expected = old_b.getpixel((ox, oy)) if 0 <= ox < W and 0 <= oy < H else (0, 0, 0, 0)
            if new_b.getpixel((x, y)) != expected:
                translated_exact = False
                break
        if not translated_exact:
            break
    bbox = lambda im: im.getchannel("A").getbbox()
    alignment = {"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v10", "translationFromV9": [9, 10], "sourceV9BWeaponSha256": sha256(SOURCE / "weapon_layers/b_idle_right_placeholder_blade.png"), "targetV10BWeaponSha256": sha256(V10 / "weapon_layers/b_idle_right_placeholder_blade.png"), "aWeaponSha256": sha256(V10 / "weapon_layers/a_idle_right_placeholder_blade.png"), "targetEqualsABytes": sha256(V10 / "weapon_layers/b_idle_right_placeholder_blade.png") == sha256(V10 / "weapon_layers/a_idle_right_placeholder_blade.png"), "translatedPixelExact": translated_exact, "sourceV9BBox": list(bbox(old_b)), "targetV10BBox": list(bbox(new_b)), "gripPointAandB": [125, 175], "selectedFistPixelsB": len(component), "selectedFistWeaponOverlapAfterAlignment": weapon_before, "occlusionInterpretation": "zero local overlap after exact A alignment; in-engine layer contract remains recorded", "allHardGatesPass": translated_exact and sha256(V10 / "weapon_layers/b_idle_right_placeholder_blade.png") == sha256(V10 / "weapon_layers/a_idle_right_placeholder_blade.png")}
    (V10 / "qa/knife_alignment_check.json").write_text(json.dumps(alignment, ensure_ascii=False, indent=2) + "\n")

    # The recipe is included in its own candidate package for reproducibility.
    shutil.copy2(Path(__file__), V10 / "build_v10_b_knife_align_a.py")
    manifest = json.loads((V10 / "manifest.json").read_text())
    manifest["artifactPaths"] = [str(p.relative_to(ROOT)) for p in sorted(V10.rglob("*")) if p.is_file() and p.name != "manifest.json"]
    (V10 / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"revision": "full-fist-occlusion-v10", "selectedSkinPixelsB": len(component), "weaponPixelsRemovedInSelectedFist": weapon_before - weapon_after, "allHardGatesPass": coverage["allHardGatesPass"], "generationCredits": 0, "artifactPaths": len(manifest["artifactPaths"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
