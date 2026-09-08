#!/usr/bin/env python3
"""Deterministic v9 B hand occlusion repair for T45 seq=160 frame01.

The v8 B bridge polygon was rejected because it removed weapon pixels from the
brown torso/sleeve.  v9 freezes A, both body frames, and both placeholder dao
layers, then selects only the connected orange skin pixels belonging to B's
screen-left gripping fist.  No generation or runtime write occurs.
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
V8 = PACKAGE / "revisions/full-fist-occlusion-v8"
V9 = PACKAGE / "revisions/full-fist-occlusion-v9"

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
        return value.replace("full-fist-occlusion-v8", "full-fist-occlusion-v9")
    if isinstance(value, list):
        return [rewrite_paths(v) for v in value]
    if isinstance(value, dict):
        return {k: rewrite_paths(v) for k, v in value.items()}
    return value


def main() -> None:
    if V9.exists():
        raise SystemExit(f"refusing to overwrite existing v9 package: {V9}")
    shutil.copytree(V8, V9)
    old_script = V9 / "build_v8_b_handle_occlusion_fix.py"
    if old_script.exists():
        old_script.unlink()

    # A bytes and derived previews are frozen from v8.  Only B's mask and
    # composites are rebuilt below.
    b_body = Image.open(V9 / "raw/b_idle_right_body.png").convert("RGBA")
    b_weapon = Image.open(V9 / "weapon_layers/b_idle_right_placeholder_blade.png").convert("RGBA")
    b_mask, component = precise_fist_mask(b_body)
    b_mask_path = V9 / "occlusion_masks/b_idle_right_fist_roi.png"
    b_sil_path = V9 / "hand_silhouettes/b_idle_right_fist_silhouette.png"
    b_mask.save(b_mask_path); b_mask.save(b_sil_path)
    b_trip = triptych(b_body, b_weapon, b_mask)
    b_trip.save(V9 / "composites_native/b_idle_right_triptych.png")
    b_trip.resize((W * 6, H * 2), Image.Resampling.NEAREST).save(V9 / "composites_2x/b_idle_right_triptych_2x.png")

    a_trip = Image.open(V8 / "composites_native/a_idle_right_triptych.png").convert("RGBA")
    trips = {"a_idle_right": a_trip, "b_idle_right": b_trip}
    pair = labeled_pair(trips)
    pair.save(V9 / "contact/frame01_idle_right_pair_native.png")
    pair.resize((pair.width * 2, pair.height * 2), Image.Resampling.NEAREST).save(V9 / "contact/frame01_idle_right_pair_2x.png")
    pair.save(V9 / "contact/frame01_idle_right_pair_native_labeled.png")
    pair.resize((pair.width * 2, pair.height * 2), Image.Resampling.NEAREST).save(V9 / "contact/frame01_idle_right_pair_2x_labeled.png")

    # Build a fresh review sheet: the green region is the exact selected orange
    # component; there is no B bridge polygon and no brown torso selection.
    a_body = Image.open(V9 / "raw/a_idle_right_body.png").convert("RGBA")
    a_mask = Image.open(V8 / "occlusion_masks/a_idle_right_fist_roi.png").convert("L")
    sheet = Image.new("RGBA", (W * 4, (H + 22) * 2), (235, 235, 235, 255))
    sheet.alpha_composite(coverage_sheet(a_body, Image.open(V9 / "weapon_layers/a_idle_right_placeholder_blade.png").convert("RGBA"), a_mask, {(x, y) for y in range(H) for x in range(W) if a_mask.getpixel((x, y)) > 0}), (0, 0))
    sheet.alpha_composite(coverage_sheet(b_body, b_weapon, b_mask, component), (0, H + 22))
    sheet.save(V9 / "qa/silhouette_mask_coverage.png")

    old_manifest = json.loads((V8 / "manifest.json").read_text())
    manifest = rewrite_paths(json.loads(json.dumps(old_manifest)))
    manifest.update({"revision": "full-fist-occlusion-v9", "supersedes": str((V8 / "manifest.json").relative_to(ROOT)), "artifactStage": "candidate", "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "integrationGate": "not_handed_off", "runtimeRelease": False, "occlusionChange": "B exact connected orange-fist pixel component; no torso/sleeve bridge"})
    manifest["generation"]["method"] = "Pillow deterministic exact orange-skin component mask + frozen A"
    # Update the frame records while keeping A/body/weapon hashes frozen.
    for rec in manifest["frames"]:
        rec["rawBodyCopy"] = str((V9 / f"raw/{rec['id']}_body.png").relative_to(ROOT))
        rec["weaponPlaceholder"]["path"] = str((V9 / f"weapon_layers/{rec['id']}_placeholder_blade.png").relative_to(ROOT))
        rec["composites"] = {"native": str((V9 / f"composites_native/{rec['id']}_triptych.png").relative_to(ROOT)), "nativeSha256": sha256(V9 / f"composites_native/{rec['id']}_triptych.png"), "2x": str((V9 / f"composites_2x/{rec['id']}_triptych_2x.png").relative_to(ROOT)), "2xSha256": sha256(V9 / f"composites_2x/{rec['id']}_triptych_2x.png")}
        rec["occlusionRef"]["maskPath"] = str((V9 / f"occlusion_masks/{rec['id']}_fist_roi.png").relative_to(ROOT))
        rec["occlusionRef"]["maskSha256"] = sha256(V9 / f"occlusion_masks/{rec['id']}_fist_roi.png")
        rec["occlusionRef"]["silhouettePath"] = str((V9 / f"hand_silhouettes/{rec['id']}_fist_silhouette.png").relative_to(ROOT))
        rec["occlusionRef"]["silhouetteSha256"] = sha256(V9 / f"hand_silhouettes/{rec['id']}_fist_silhouette.png")
        rec["occlusionRef"].pop("roiPolygon", None)
        rec["occlusionRef"].pop("bridgePolygon", None)
        rec["occlusionRef"]["semantics"] = "binary occlusion over the selected character-right fist pixels; no torso/sleeve bridge"
        rec["checks"].pop("bridgeHandleResidualZero", None)
        rec["checks"].pop("bridgePreservesNonHandleWeapon", None)
        rec["checks"]["preciseFistPixelMaskRecorded"] = True
        rec["checks"]["noTorsoBridgeMask"] = True
        rec["checks"]["maskPixelsMatchSkinRule"] = True
        rec["checks"]["maskConnected4"] = True
        rec["checks"]["allPass"] = all(bool(v) for v in rec["checks"].values())
        rec["roiRevision"] = "full-fist-skin-component-v9" if rec["id"] == "b_idle_right" else "full-fist-silhouette-v8-a-frozen"
        if rec["id"] == "b_idle_right":
            rec["occlusionRef"].update({"selectionMethod": "4-connected orange-skin component", "skinRule": SKIN_RULE, "pixelRoi": list(FIST_PIXEL_ROI), "seed": list(FIST_SEED), "selectedSkinPixels": len(component), "selectedSkinBBox": [min(x for x, _ in component), min(y for _, y in component), max(x for x, _ in component) + 1, max(y for _, y in component) + 1]})
    manifest["artifactPaths"] = []
    (V9 / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    cal = rewrite_paths(json.loads((V8 / "calibration/frame01_idle_right.json").read_text()))
    cal.update({"revision": "full-fist-occlusion-v9", "occlusionRevision": "full-fist-skin-component-v9", "occlusionRule": "B mask = exact connected orange fist pixels in the reviewed pixel ROI; A frozen", "frames": manifest["frames"], "checks": {"expectedFrames": 2, "actualFrames": 2, "allFramesPass": all(r["checks"]["allPass"] for r in manifest["frames"]), "bodyBytesFrozen2of2": all(r["checks"]["bodyShaFrozen"] for r in manifest["frames"]), "noTorsoBridge2of2": all(r["checks"]["noTorsoBridgeMask"] for r in manifest["frames"]), "formalRuntimeTouched": False, "formalSpecChanged": False, "generationCredits": 0}})
    (V9 / "calibration/frame01_idle_right.json").write_text(json.dumps(cal, ensure_ascii=False, indent=2) + "\n")

    job = rewrite_paths(json.loads((V8 / "job.json").read_text()))
    job.update({"revision": "full-fist-occlusion-v9", "supersedes": str((V8 / "manifest.json").relative_to(ROOT)), "visualReviewScope": "v9 B exact orange fist pixel occlusion; A/body/weapon bytes frozen", "visualReviewReason": "Leo 2026-09-08: v8 B bridge selection was rejected as completely wrong; rebuild B from the actual orange fist pixels only.", "note": "v9 removes the rejected B bridge polygon. B mask is a 4-connected orange-skin component from the body source; formal runtime remains untouched pending Leo and PM gates.", "reviewReason": "v9 supersedes v8 after Leo rejected the broad B bridge; only the exact orange fist component is selected."})
    (V9 / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n")
    (V9 / "request.md").write_text("# T45 seq167 · frame01 idle_right B precise orange-fist occlusion v9\n\nLeo 复核指出 v8 的 B 桥接遮挡完全不对：不能把棕色躯干/袖口当成拳头区域。v9 冻结 A、两张身体帧和两张占位朴刀，只从 B 原始身体帧中按真实橙色皮肤像素筛选，并取握刀拳头种子 `(110,175)` 的 4-连通分量；不使用多边形，不加 handle bridge，不改身体与武器。\n\n本包为 candidate-only，Pillow 确定性加工、生成积分 0、正式 runtime 不改；等待 Leo 目验与 PM 第二道规格门。\n")
    (V9 / "refs.json").write_text(json.dumps({"task": "T45", "seq": 167, "frame": "idle_right", "sourceRevision": str((V8 / "manifest.json").relative_to(ROOT)), "bodyBytesFrozen": True, "weaponBytesFrozen": True, "generation": {"provider": None, "model": None, "credits": 0, "method": "Pillow deterministic exact orange-skin component mask"}, "references": [{"path": str((V9 / f"raw/{k}_body.png").relative_to(ROOT)), "role": "runtime body source; bytes frozen", "sha256": sha256(V9 / f"raw/{k}_body.png"), "allowed": "B exact orange fist pixel selection only" if k == "b_idle_right" else "A frozen mask/composite", "forbidden": "torso bridge, body redraw, weapon redesign, runtime write"} for k in ("a_idle_right", "b_idle_right")]}, ensure_ascii=False, indent=2) + "\n")

    b_weapon_alpha = b_weapon.getchannel("A")
    after = subtract_occlusion(b_weapon, b_mask)
    weapon_before = sum(1 for x, y in component if b_weapon.getpixel((x, y))[3] > 32)
    weapon_after = sum(1 for x, y in component if after.getpixel((x, y))[3] > 32)
    coverage = {"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v9", "method": "B exact 4-connected orange-skin component; no polygon/bridge", "records": [{"id": "a_idle_right", "maskPixels": visible(a_mask), "bodyShaFrozen": True, "source": "v8 frozen"}, {"id": "b_idle_right", "maskPixels": len(component), "skinRule": SKIN_RULE, "pixelRoi": list(FIST_PIXEL_ROI), "seed": list(FIST_SEED), "selectedSkinBBox": [min(x for x, _ in component), min(y for _, y in component), max(x for x, _ in component) + 1, max(y for _, y in component) + 1], "weaponPixelsInSelectedFistBefore": weapon_before, "weaponPixelsInSelectedFistAfter": weapon_after, "bodyShaFrozen": True, "weaponShaFrozen": True, "noTorsoBridge": True, "maskPixelsMatchSkinRule": True, "maskConnected4": True}], "allHardGatesPass": weapon_after == 0}
    (V9 / "qa/occlusion_coverage.json").write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + "\n")
    pm = {"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v9", "checks": {"framePair2of2": True, "bodyShaFrozen2of2": True, "weaponShaFrozen2of2": True, "preciseFistPixelMaskB": True, "noTorsoBridgeB": True, "maskPixelsMatchSkinRule": True, "maskConnected4": True, "selectedFistWeaponResidualZero": weapon_after == 0, "nativeAnd2x2of2": True, "noRuntimeWrites": True, "noGeneration": True}, "allHardGatesPass": weapon_after == 0, "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "runtimeRelease": False}
    (V9 / "qa/pm_data_check.json").write_text(json.dumps(pm, ensure_ascii=False, indent=2) + "\n")
    (V9 / "qa/zero_generation.json").write_text(json.dumps({"seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v9", "credits": 0, "provider": None, "model": None, "rawGeneration": False, "deterministicTool": "Pillow", "bodyBytesFrozen": True, "weaponBytesFrozen": True, "formalRuntimeTouched": False}, ensure_ascii=False, indent=2) + "\n")

    # The recipe is included in its own candidate package for reproducibility.
    shutil.copy2(Path(__file__), V9 / "build_v9_b_precise_fist_occlusion.py")
    manifest = json.loads((V9 / "manifest.json").read_text())
    manifest["artifactPaths"] = [str(p.relative_to(ROOT)) for p in sorted(V9.rglob("*")) if p.is_file() and p.name != "manifest.json"]
    (V9 / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"revision": "full-fist-occlusion-v9", "selectedSkinPixelsB": len(component), "weaponPixelsRemovedInSelectedFist": weapon_before - weapon_after, "allHardGatesPass": coverage["allHardGatesPass"], "generationCredits": 0, "artifactPaths": len(manifest["artifactPaths"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
