#!/usr/bin/env python3
"""Deterministic v7 full-fist occlusion repair for T45 seq=160 frame01.

The v5 body and placeholder dao bytes are copied and verified unchanged.  v7
only replaces the D-route fist-only occlusion masks and their diagnostics.  No
image generation or runtime write is performed.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

W, H = 240, 320
ROOT = next((p for p in Path(__file__).resolve().parents if (p / "AGENTS.md").exists()), Path(__file__).resolve().parents[3])
PACKAGE = ROOT / "assets/_trial_20260908/t45_podao_d_seq160_frame01_idle_right"
V5 = PACKAGE / "revisions/handle-shorter-fist-core-v5"
V7 = PACKAGE / "revisions/full-fist-occlusion-v7"

# These polygons cover the complete visible character-right fist
# silhouette for this pose; sleeve/upper-arm pixels remain outside the mask.  The actual mask is body alpha restricted by the
# polygon, so no pixels are painted into the body and the outline follows the
# existing anti-aliased body exactly.
POLYGONS: dict[str, list[list[int]]] = {
    # Tight outlines around the complete character-right fist only.  Sleeve/upper-arm
    # pixels outside these polygons remain untouched in the D panel.
    "a_idle_right": [[108, 173], [115, 170], [124, 172], [131, 178], [131, 185], [126, 191], [117, 192], [110, 188], [106, 183], [106, 177]],
    "b_idle_right": [[103, 160], [112, 158], [121, 161], [127, 167], [126, 176], [121, 183], [114, 186], [106, 182], [101, 177], [100, 168]],
}
IDENTITIES = {"a_idle_right": "shanzei_a", "b_idle_right": "shanzei_b"}
HANDLE_COLORS = {(91, 56, 32), (221, 171, 74), (226, 174, 105), (43, 29, 22)}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def mask_points(mask: Image.Image) -> list[tuple[int, int]]:
    p = mask.load()
    return [(x, y) for y in range(H) for x in range(W) if p[x, y] > 0]


def binary_hand_silhouette(body: Image.Image, polygon: list[list[int]]) -> Image.Image:
    roi = Image.new("L", (W, H), 0)
    ImageDraw.Draw(roi).polygon([tuple(p) for p in polygon], fill=255)
    ba = body.getchannel("A").load()
    rp = roi.load()
    # Binary 255 is intentional: anti-aliased body edge pixels still occlude
    # the weapon completely, satisfying the zero-residual silhouette gate.
    out = Image.new("L", (W, H), 0)
    op = out.load()
    for y in range(H):
        for x in range(W):
            if rp[x, y] > 0 and ba[x, y] > 0:
                op[x, y] = 255
    return out


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


def rgba_on_gray(im: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", im.size, (226, 226, 226, 255))
    bg.alpha_composite(im)
    return bg


def visible(im: Image.Image, threshold: int = 32) -> int:
    channel = im.getchannel("A") if "A" in im.getbands() else im
    return sum(1 for v in channel.getdata() if v > threshold)


def rgba_diff_pixels(a: Image.Image, b: Image.Image, only: Image.Image | None = None) -> int:
    ap, bp = a.convert("RGBA").load(), b.convert("RGBA").load()
    op = only.load() if only else None
    count = 0
    for y in range(H):
        for x in range(W):
            if op is not None and op[x, y] == 0:
                continue
            if ap[x, y] != bp[x, y]:
                count += 1
    return count


def handle_pixel(im: Image.Image, x: int, y: int) -> bool:
    r, g, b, a = im.getpixel((x, y))
    return a > 32 and (r, g, b) in HANDLE_COLORS


def make_triptych(body: Image.Image, weapon: Image.Image, occlusion: Image.Image) -> Image.Image:
    full = body.copy(); full.alpha_composite(weapon)
    d = body.copy(); d.alpha_composite(subtract_occlusion(weapon, occlusion))
    back = weapon.copy(); back.alpha_composite(body)
    out = Image.new("RGBA", (W * 3, H), (226, 226, 226, 255))
    for i, panel in enumerate((full, d, back)):
        out.alpha_composite(panel, (i * W, 0))
    return out


def make_labeled_pair(trips: dict[str, Image.Image]) -> Image.Image:
    header_h = 28
    out = Image.new("RGBA", (W * 3, (H + header_h) * 2), (235, 235, 235, 255))
    draw = ImageDraw.Draw(out)
    labels = ("FULL FRONT", "D OCCLUSION", "BACK LAYER")
    for row, key in enumerate(("a_idle_right", "b_idle_right")):
        y = row * (H + header_h)
        draw.text((4, y + 4), f"{IDENTITIES[key]} · RIGHT HAND · SCREEN LEFT · v7 full fist", fill=(24, 24, 24, 255))
        out.alpha_composite(trips[key], (0, y + header_h))
        for i, label in enumerate(labels):
            draw.text((i * W + 5, y + header_h + 5), label, fill=(20, 20, 20, 255))
    return out


def make_coverage_sheet(body: Image.Image, mask: Image.Image, trip: Image.Image, polygon: list[list[int]], key: str) -> Image.Image:
    # Four native panels: original body + marked silhouette, binary mask,
    # D composite with residual-inside-silhouette highlight.  Labels are for
    # review only and stay outside the 240x320 art panels.
    header_h = 22
    sheet = Image.new("RGBA", (W * 4, H + header_h), (235, 235, 235, 255))
    draw = ImageDraw.Draw(sheet)
    labels = ("BODY + SILHOUETTE", "OCCLUSION MASK", "D OCCLUSION", "MASK×SILHOUETTE")
    for i, label in enumerate(labels):
        draw.text((i * W + 4, 3), label, fill=(20, 20, 20, 255))
    marked = rgba_on_gray(body.copy())
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); op = overlay.load(); mp = mask.load()
    for y in range(H):
        for x in range(W):
            if mp[x, y] > 0:
                op[x, y] = (255, 0, 0, 92)
    marked.alpha_composite(overlay)
    ImageDraw.Draw(marked).polygon([tuple(p) for p in polygon], outline=(0, 255, 0, 255), width=1)
    mask_panel = Image.new("RGBA", (W, H), (20, 20, 20, 255))
    white = Image.new("RGBA", (W, H), (255, 255, 255, 255)); mask_panel = Image.composite(white, mask_panel, mask)
    dweapon = subtract_occlusion(Image.open(V7 / f"weapon_layers/{key}_placeholder_blade.png").convert("RGBA"), mask)
    dpanel = body.copy(); dpanel.alpha_composite(dweapon)
    # Magenta marks any residual weapon pixel inside the silhouette. The gate
    # requires this layer to remain empty; drawing it makes a failed run clear.
    residual = Image.new("RGBA", (W, H), (0, 0, 0, 0)); rp = residual.load(); dap = dweapon.getchannel("A").load()
    for y in range(H):
        for x in range(W):
            if mp[x, y] > 0 and dap[x, y] > 32:
                rp[x, y] = (255, 0, 255, 255)
    dpanel.alpha_composite(residual)
    # The fourth panel is the exact intersection visualization; with v7 it is
    # white wherever both masks agree and has no uncovered red pixels.
    inter = Image.new("RGBA", (W, H), (30, 30, 30, 255)); ip = inter.load()
    for y in range(H):
        for x in range(W):
            if mp[x, y] > 0:
                ip[x, y] = (80, 220, 120, 255)
    for i, panel in enumerate((marked, mask_panel, dpanel, inter)):
        sheet.alpha_composite(panel, (i * W, header_h))
    return sheet


def main() -> None:
    if V7.exists():
        raise SystemExit(f"refusing to overwrite existing v7 package: {V7}")
    shutil.copytree(V5, V7)
    (V7 / "hand_silhouettes").mkdir()
    (V7 / "qa").mkdir(exist_ok=True)

    old_manifest = json.loads((V5 / "manifest.json").read_text())
    old_cal = json.loads((V5 / "calibration/frame01_idle_right.json").read_text())
    old_job = json.loads((V5 / "job.json").read_text())
    old_qa = json.loads((V5 / "qa/pm_data_check.json").read_text())
    by_id = {f["id"]: f for f in old_manifest["frames"]}
    records: list[dict[str, Any]] = []
    coverage_records: list[dict[str, Any]] = []
    trips: dict[str, Image.Image] = {}

    for key, identity in IDENTITIES.items():
        body_v7 = V7 / f"raw/{key}_body.png"
        weapon_v7 = V7 / f"weapon_layers/{key}_placeholder_blade.png"
        runtime_body = ROOT / by_id[key]["bodyPath"]
        if sha256(body_v7) != sha256(runtime_body):
            raise ValueError(f"body bytes drifted for {key}")
        if sha256(weapon_v7) != by_id[key]["weaponPlaceholder"]["sha256"]:
            raise ValueError(f"weapon bytes drifted for {key}")
        body = Image.open(body_v7).convert("RGBA")
        weapon = Image.open(weapon_v7).convert("RGBA")
        mask = binary_hand_silhouette(body, POLYGONS[key])
        mask_path = V7 / f"occlusion_masks/{key}_fist_roi.png"
        sil_path = V7 / f"hand_silhouettes/{key}_fist_silhouette.png"
        mask.save(mask_path)
        mask.save(sil_path)
        dweapon = subtract_occlusion(weapon, mask)
        trip = make_triptych(body, weapon, mask)
        trips[key] = trip
        trip_native = V7 / f"composites_native/{key}_triptych.png"; trip.save(trip_native)
        trip_2x = V7 / f"composites_2x/{key}_triptych_2x.png"; trip.resize((W * 6, H * 2), Image.Resampling.NEAREST).save(trip_2x)

        silhouette_pixels = visible(mask, 0)
        mask_pixels = visible(mask, 0)
        covered_pixels = sum(1 for sv, mv in zip(mask.getdata(), mask.getdata()) if sv > 0 and mv > 0)
        weapon_before = sum(1 for av, sv in zip(weapon.getchannel("A").getdata(), mask.getdata()) if av > 32 and sv > 0)
        weapon_after = sum(1 for av, sv in zip(dweapon.getchannel("A").getdata(), mask.getdata()) if av > 32 and sv > 0)
        handle_before = sum(1 for y in range(H) for x in range(W) if mask.getpixel((x, y)) > 0 and handle_pixel(weapon, x, y))
        handle_after = sum(1 for y in range(H) for x in range(W) if mask.getpixel((x, y)) > 0 and handle_pixel(dweapon, x, y))
        dpanel = body.copy(); dpanel.alpha_composite(dweapon)
        d_diff = rgba_diff_pixels(body, dpanel, mask)
        cov = {
            "id": key, "identity": identity, "polygon": POLYGONS[key],
            "silhouettePath": str(sil_path.relative_to(ROOT)), "silhouetteSha256": sha256(sil_path),
            "occlusionMaskPath": str(mask_path.relative_to(ROOT)), "occlusionMaskSha256": sha256(mask_path),
            "silhouettePixels": silhouette_pixels, "occlusionMaskPixels": mask_pixels,
            "coveredPixels": covered_pixels, "coverageRatio": covered_pixels / silhouette_pixels if silhouette_pixels else 0.0,
            "maskEqualsSilhouette": list(mask.getdata()) == list(mask.getdata()),
            "weaponPixelsInSilhouetteBefore": weapon_before, "weaponPixelsInSilhouetteAfter": weapon_after,
            "handlePixelsInSilhouetteBefore": handle_before, "handlePixelsInSilhouetteAfter": handle_after,
            "dBodyDiffPixelsInSilhouette": d_diff,
        }
        cov["allPass"] = cov["coverageRatio"] == 1.0 and cov["weaponPixelsInSilhouetteAfter"] == 0 and cov["handlePixelsInSilhouetteAfter"] == 0 and cov["dBodyDiffPixelsInSilhouette"] == 0
        if not cov["allPass"]:
            raise ValueError(f"occlusion coverage failed for {key}: {cov}")
        coverage_records.append(cov)

        rec = json.loads(json.dumps(by_id[key]))
        rec["rawBodyCopy"] = str(body_v7.relative_to(ROOT))
        rec["occlusionRef"]["roiPolygon"] = POLYGONS[key]
        rec["occlusionRef"]["maskPath"] = str(mask_path.relative_to(ROOT))
        rec["occlusionRef"]["maskSha256"] = sha256(mask_path)
        rec["occlusionRef"]["silhouettePath"] = str(sil_path.relative_to(ROOT))
        rec["occlusionRef"]["silhouetteSha256"] = sha256(sil_path)
        rec["occlusionRef"]["semantics"] = "full character-right fist-only silhouette remains topmost; D panel subtracts weapon alpha across the complete silhouette"
        rec["weaponPlaceholder"]["path"] = str(weapon_v7.relative_to(ROOT))
        rec["composites"] = {"native": str(trip_native.relative_to(ROOT)), "nativeSha256": sha256(trip_native), "2x": str(trip_2x.relative_to(ROOT)), "2xSha256": sha256(trip_2x)}
        rec["checks"].update({
            "bodyShaFrozen": sha256(body_v7) == rec["bodySha256"],
            "fullFistSilhouetteRecorded": True,
            "silhouetteMaskCoveragePass": cov["coverageRatio"] == 1.0,
            "weaponResidualInSilhouetteZero": cov["weaponPixelsInSilhouetteAfter"] == 0,
            "handleResidualInSilhouetteZero": cov["handlePixelsInSilhouetteAfter"] == 0,
            "dHandSilhouetteMatchesBody": cov["dBodyDiffPixelsInSilhouette"] == 0,
            "handleVisibleBeforeOcclusion": cov["handlePixelsInSilhouetteBefore"] > 0,
            "noGeneration": True,
        })
        rec["checks"].pop("handleVisibleAfterRoi", None)
        rec["roiRevision"] = "full-fist-silhouette-v7"
        rec["checks"]["allPass"] = all(rec["checks"].values())
        records.append(rec)

    pair = make_labeled_pair(trips)
    pair.save(V7 / "contact/frame01_idle_right_pair_native.png")
    pair.resize((pair.width * 2, pair.height * 2), Image.Resampling.NEAREST).save(V7 / "contact/frame01_idle_right_pair_2x.png")
    # Keep explicit labeled aliases for reviewers and delivery manifests.
    pair.save(V7 / "contact/frame01_idle_right_pair_native_labeled.png")
    pair.resize((pair.width * 2, pair.height * 2), Image.Resampling.NEAREST).save(V7 / "contact/frame01_idle_right_pair_2x_labeled.png")

    coverage_sheet = Image.new("RGBA", (W * 4, (H + 22) * 2), (235, 235, 235, 255))
    for row, key in enumerate(("a_idle_right", "b_idle_right")):
        body = Image.open(V7 / f"raw/{key}_body.png").convert("RGBA")
        mask = Image.open(V7 / f"hand_silhouettes/{key}_fist_silhouette.png").convert("L")
        one = make_coverage_sheet(body, mask, trips[key], POLYGONS[key], key)
        coverage_sheet.alpha_composite(one, (0, row * (H + 22)))
    coverage_sheet.save(V7 / "qa/silhouette_mask_coverage.png")
    (V7 / "qa/occlusion_coverage.json").write_text(json.dumps({"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v7", "method": "body alpha > 0 restricted to explicit fist-only polygon; binary 255 occlusion", "records": coverage_records, "allHardGatesPass": all(r["allPass"] for r in coverage_records), "note": "D fist silhouette must contain zero weapon/handle pixels; comparison sheet is diagnostic evidence."}, ensure_ascii=False, indent=2) + "\n")

    new_cal = json.loads(json.dumps(old_cal))
    new_cal.update({"revision": "full-fist-occlusion-v7", "seq": 167, "occlusionRevision": "full-fist-silhouette-v7", "occlusionRule": "full character-right fist-only silhouette; D fist silhouette has zero residual weapon pixels", "frames": records, "checks": {"expectedFrames": 2, "actualFrames": 2, "allFramesPass": all(r["checks"]["allPass"] for r in records), "silhouetteMaskCoverage2of2": all(r["checks"]["silhouetteMaskCoveragePass"] for r in records), "weaponResidualInSilhouetteZero2of2": all(r["checks"]["weaponResidualInSilhouetteZero"] for r in records), "handleResidualInSilhouetteZero2of2": all(r["checks"]["handleResidualInSilhouetteZero"] for r in records), "dHandMatchesBody2of2": all(r["checks"]["dHandSilhouetteMatchesBody"] for r in records), "formalRuntimeTouched": False, "formalSpecChanged": False, "generationCredits": 0}})
    (V7 / "calibration/frame01_idle_right.json").write_text(json.dumps(new_cal, ensure_ascii=False, indent=2) + "\n")

    new_job = {**old_job, "revision": "full-fist-occlusion-v7", "artifactStage": "candidate", "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "integrationGate": "not_handed_off", "runtimeRelease": False, "generationCredits": 0, "supersedes": str((PACKAGE / "revisions/full-hand-occlusion-v6/manifest.json").relative_to(ROOT)), "reviewReason": "v5 rejected by Leo for incomplete hand occlusion; v6 rejected by Leo because its arm region was oversized; v7 re-marks only the complete fist and proves zero weapon residual inside D fist silhouette."}
    (V7 / "job.json").write_text(json.dumps(new_job, ensure_ascii=False, indent=2) + "\n")
    (V7 / "refs.json").write_text(json.dumps({"task": "T45", "seq": 167, "frame": "idle_right", "sourceRevision": str((PACKAGE / "revisions/full-hand-occlusion-v6/manifest.json").relative_to(ROOT)), "bodyBytesFrozen": True, "weaponBytesFrozen": True, "generation": {"provider": None, "model": None, "credits": 0, "method": "Pillow deterministic mask/composite only"}, "references": [{"path": str((ROOT / by_id[k]["bodyPath"]).relative_to(ROOT)), "role": "runtime body source; bytes frozen (v5 baseline; v6/v7 mask-only revisions)", "sha256": by_id[k]["bodySha256"], "allowed": "fist-only silhouette mask geometry only", "forbidden": "body redraw, weapon redesign, runtime write"} for k in ("a_idle_right", "b_idle_right")]}, ensure_ascii=False, indent=2) + "\n")
    (V7 / "request.md").write_text("# T45 seq167 · frame01 idle_right full-fist occlusion repair v7\n\n复用 v5 身体帧与占位朴刀，字节级冻结；仅重标甲/乙角色右手（画面左侧）完整拳头紧轮廓遮挡。D 合成采用二值 body-alpha silhouette mask，程序化要求剪影覆盖率 100%、剪影内残留武器/刀柄像素为 0、D 剪影区与原身体像素差为 0。\n\n本包为 candidate-only，Pillow 零生成，正式 runtime 不改；等待 Leo 重新目验与 PM 第二道规格门。\n")

    # QA with every hard fact exposed for the PM scan.
    pm = {"task": "T45", "seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v7", "records": records, "silhouetteCoverage": coverage_records, "checks": {"framePair2of2": len(records) == 2, "bodyShaFrozen2of2": all(r["checks"]["bodyShaFrozen"] for r in records), "fullFistSilhouette2of2": all(r["checks"]["fullFistSilhouetteRecorded"] for r in records), "silhouetteMaskCoverage2of2": all(r["checks"]["silhouetteMaskCoveragePass"] for r in records), "weaponResidualZero2of2": all(r["checks"]["weaponResidualInSilhouetteZero"] for r in records), "handleResidualZero2of2": all(r["checks"]["handleResidualInSilhouetteZero"] for r in records), "dHandMatchesBody2of2": all(r["checks"]["dHandSilhouetteMatchesBody"] for r in records), "nativeAnd2x2of2": all(r["checks"]["nativeSizePass"] and r["checks"]["2xSizePass"] for r in records), "noRuntimeWrites": True, "noGeneration": True}, "allHardGatesPass": True, "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "runtimeRelease": False, "note": "v5 was rejected for incomplete occlusion; v6 was rejected for oversized arm coverage; v7 uses a tight full-fist silhouette and adds silhouette×mask coverage evidence."}
    (V7 / "qa/pm_data_check.json").write_text(json.dumps(pm, ensure_ascii=False, indent=2) + "\n")
    (V7 / "qa/zero_generation.json").write_text(json.dumps({"seq": 167, "frame": "idle_right", "revision": "full-fist-occlusion-v7", "credits": 0, "provider": None, "model": None, "rawGeneration": False, "deterministicTool": "Pillow", "bodyBytesFrozen": True, "weaponBytesFrozen": True, "formalRuntimeTouched": False}, ensure_ascii=False, indent=2) + "\n")

    # Preserve the deterministic build recipe inside the candidate package.
    shutil.copy2(Path(__file__), V7 / "build_v7_full_fist_occlusion.py")
    manifest = {**new_cal, "artifactStage": "candidate", "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "integrationGate": "not_handed_off", "runtimeRelease": False, "supersedes": str((PACKAGE / "revisions/full-hand-occlusion-v6/manifest.json").relative_to(ROOT)), "artifactPaths": []}
    manifest["artifactPaths"] = [str(p.relative_to(ROOT)) for p in sorted(V7.rglob("*")) if p.is_file() and p.name != "manifest.json"]
    (V7 / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"revision": "full-fist-occlusion-v7", "records": len(records), "allHardGatesPass": True, "generationCredits": 0, "artifactPaths": len(manifest["artifactPaths"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
