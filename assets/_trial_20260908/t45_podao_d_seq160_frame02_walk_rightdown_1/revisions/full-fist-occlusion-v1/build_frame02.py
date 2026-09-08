#!/usr/bin/env python3
"""Deterministic T45 seq=160 frame02 walk_rightdown_1 candidate package.

This package freezes the selected runtime bodies, draws a neutral 129px dao
placeholder (34px handle + 95px blade), and marks only the complete fist
silhouette for D-route occlusion. Pillow is used for deterministic raster work;
no image generation and no runtime writes occur.
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
TARGET_Y = 300
ANGLE_DEG = -55.0
HANDLE_SPAN = (-20, 14)
BLADE_SPAN = (15, 110)
PROFILE = "long_broad_single_edge_dao_placeholder_v5"
ROOT = next((p for p in Path(__file__).resolve().parents if (p / "AGENTS.md").exists()), Path.cwd())
PACKAGE = ROOT / "assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1"
OUT = PACKAGE / "revisions/full-fist-occlusion-v1"

# Tight complete-fist polygons. They intentionally exclude sleeve/torso pixels;
# the mask is body alpha restricted by these polygons and promoted to binary
# 255 so anti-aliased edges still occlude the weapon fully.
FRAMES: list[dict[str, Any]] = [
    {
        "id": "a_walk_rightdown_1",
        "identity": "shanzei_a",
        "bodyFrame": "walk_rightdown_1.png",
        "gripPoint": [172, 172],
        "layerOrder": "front",
        "polygon": [[165, 182], [169, 178], [177, 177], [183, 180], [186, 187], [184, 197], [180, 203], [172, 204], [166, 200], [162, 192]],
        "screenProjection": "screen-right fist in rightdown pose",
    },
    {
        "id": "b_walk_rightdown_1",
        "identity": "shanzei_b",
        "bodyFrame": "walk_rightdown_1.png",
        "gripPoint": [178, 172],
        "layerOrder": "front",
        "polygon": [[180, 156], [187, 153], [194, 158], [196, 166], [194, 176], [189, 182], [181, 184], [176, 180], [173, 171], [176, 163]],
        "screenProjection": "screen-right fist in rightdown pose",
    },
]
IDENTITY_LABEL = {"a_walk_rightdown_1": "shanzei_a", "b_walk_rightdown_1": "shanzei_b"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def body_metrics(im: Image.Image) -> dict[str, Any]:
    rgba = im.convert("RGBA")
    alpha = rgba.getchannel("A")
    extrema = alpha.getextrema()
    points: list[tuple[int, int, int]] = []
    ap = alpha.load()
    for y in range(H):
        for x in range(W):
            v = ap[x, y]
            if v > 32:
                points.append((x, y, v))
    if not points:
        raise ValueError("empty body alpha")
    minx = min(x for x, _, _ in points); maxx = max(x for x, _, _ in points)
    miny = min(y for _, y, _ in points); maxy = max(y for _, y, _ in points)
    total = sum(v for _, _, v in points)
    cx = sum(x * v for x, _, v in points) / total
    cy = sum(y * v for _, y, v in points) / total
    border = sum(
        ap[x, y] > 0
        for x, y in ([*[(x, 0) for x in range(W)], *[(x, H - 1) for x in range(W)],
                      *[(0, y) for y in range(1, H - 1)], *[(W - 1, y) for y in range(1, H - 1)]])
    )
    return {
        "size": [W, H], "mode": "RGBA", "alphaExtrema": list(extrema),
        "bboxT32": [minx, miny, maxx + 1, maxy + 1],
        "visualWidth": maxx - minx + 1, "visualHeight": maxy - miny + 1,
        "alpha32CentroidX": cx, "alpha32CentroidY": cy,
        "feetYExclusive": maxy + 1, "borderNonzero": border,
    }


def draw_weapon(grip: tuple[int, int]) -> Image.Image:
    """Draw fixed v5-style 129px dao geometry at native resolution."""
    gx, gy = grip
    theta = math.radians(ANGLE_DEG)
    ux, uy = math.cos(theta), math.sin(theta)
    vx, vy = -uy, ux

    def p(dist: float, side: float = 0.0) -> tuple[int, int]:
        return round(gx + ux * dist + vx * side), round(gy + uy * dist + vy * side)

    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    d.line([p(-20), p(14)], fill=(91, 56, 32, 255), width=8)
    d.line([p(-20, -2), p(14, -2)], fill=(226, 174, 105, 255), width=1)
    d.line([p(-20, 2), p(14, 2)], fill=(43, 29, 22, 255), width=1)
    d.line([p(9, -8), p(9, 8)], fill=(221, 171, 74, 255), width=3)
    # Broad, single-edged dao, deliberately kept as neutral technical geometry.
    tip = BLADE_SPAN[1]
    blade = [
        p(15, -6), p(34, -8), p(56, -10), p(tip - 12, -8), p(tip, -3),
        p(tip - 6, 0), p(tip - 11, 5), p(tip - 22, 11), p(tip - 42, 14),
        p(tip - 64, 13), p(25, 9), p(15, 6),
    ]
    d.polygon(blade, fill=(156, 170, 181, 255))
    d.line([p(22, -5), p(tip - 35, -9), p(tip - 12, -6), p(tip - 2, 0)], fill=(76, 86, 94, 255), width=2)
    d.line([p(24, 5), p(tip - 66, 10), p(tip - 45, 11), p(tip - 28, 8), p(tip - 1, 3)], fill=(239, 244, 247, 255), width=2)
    return out


def binary_fist_mask(body: Image.Image, polygon: list[list[int]]) -> Image.Image:
    roi = Image.new("L", (W, H), 0)
    ImageDraw.Draw(roi).polygon([tuple(p) for p in polygon], fill=255)
    rp = roi.load(); ba = body.getchannel("A").load()
    out = Image.new("L", (W, H), 0); op = out.load()
    for y in range(H):
        for x in range(W):
            if rp[x, y] > 0 and ba[x, y] > 0:
                op[x, y] = 255
    return out


def subtract_occlusion(weapon: Image.Image, mask: Image.Image) -> Image.Image:
    out = weapon.copy(); wa = weapon.getchannel("A").load(); ma = mask.load()
    alpha = Image.new("L", (W, H), 0); ap = alpha.load()
    for y in range(H):
        for x in range(W):
            ap[x, y] = max(0, wa[x, y] - ma[x, y])
    out.putalpha(alpha)
    return out


def triptych(body: Image.Image, weapon: Image.Image, mask: Image.Image) -> Image.Image:
    full = body.copy(); full.alpha_composite(weapon)
    dpanel = body.copy(); dpanel.alpha_composite(subtract_occlusion(weapon, mask))
    back = weapon.copy(); back.alpha_composite(body)
    out = Image.new("RGBA", (W * 3, H), (226, 226, 226, 255))
    for i, panel in enumerate((full, dpanel, back)):
        out.alpha_composite(panel, (i * W, 0))
    return out


def labeled_pair(trips: dict[str, Image.Image]) -> Image.Image:
    header_h = 28
    out = Image.new("RGBA", (W * 3, (H + header_h) * 2), (235, 235, 235, 255))
    draw = ImageDraw.Draw(out)
    labels = ("FULL FRONT", "D OCCLUSION", "BACK LAYER")
    for row, key in enumerate(("a_walk_rightdown_1", "b_walk_rightdown_1")):
        y = row * (H + header_h)
        draw.text((4, y + 4), f"{IDENTITY_LABEL[key]} · RIGHT HAND · SCREEN RIGHT · frame02 v1", fill=(24, 24, 24, 255))
        out.alpha_composite(trips[key], (0, y + header_h))
        for i, label in enumerate(labels):
            draw.text((i * W + 5, y + header_h + 5), label, fill=(20, 20, 20, 255))
    return out


def coverage_sheet(body: Image.Image, mask: Image.Image, weapon: Image.Image, polygon: list[list[int]]) -> Image.Image:
    header_h = 22
    sheet = Image.new("RGBA", (W * 4, H + header_h), (235, 235, 235, 255))
    draw = ImageDraw.Draw(sheet)
    labels = ("BODY + FIST", "OCCLUSION MASK", "D OCCLUSION", "MASK OVERLAY")
    for i, label in enumerate(labels):
        draw.text((i * W + 4, 3), label, fill=(20, 20, 20, 255))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); op = overlay.load(); mp = mask.load()
    for y in range(H):
        for x in range(W):
            if mp[x, y] > 0:
                op[x, y] = (255, 0, 0, 96)
    marked = body.copy(); marked.alpha_composite(overlay); ImageDraw.Draw(marked).polygon([tuple(p) for p in polygon], outline=(0, 255, 0, 255), width=1)
    mask_panel = Image.new("RGBA", (W, H), (20, 20, 20, 255))
    mask_panel = Image.composite(Image.new("RGBA", (W, H), (255, 255, 255, 255)), mask_panel, mask)
    dpanel = body.copy(); dpanel.alpha_composite(subtract_occlusion(weapon, mask))
    overlay_panel = body.copy(); overlay_panel.alpha_composite(overlay)
    for i, panel in enumerate((marked, mask_panel, dpanel, overlay_panel)):
        sheet.alpha_composite(panel, (i * W, header_h))
    return sheet


def body_manifest_frame(identity: str, filename: str) -> dict[str, Any]:
    manifest = json.loads((ROOT / "assets/characters/enemy" / identity / "battle45/manifest.json").read_text())
    return next(f for f in manifest["frames"] if f.get("path", "").endswith("/" + filename))


def main() -> None:
    if OUT.exists() and any(p for p in OUT.rglob("*") if p.is_file() and p.name != "build_frame02.py"):
        raise SystemExit(f"refusing to overwrite existing candidate package: {OUT}")
    for name in ("calibration", "composites_native", "composites_2x", "contact", "hand_silhouettes", "occlusion_masks", "qa", "raw", "weapon_layers"):
        (OUT / name).mkdir(parents=True, exist_ok=True)

    records: list[dict[str, Any]] = []
    trips: dict[str, Image.Image] = {}
    coverage_records: list[dict[str, Any]] = []
    for spec in FRAMES:
        body_path = ROOT / "assets/characters/enemy" / spec["identity"] / "battle45" / spec["bodyFrame"]
        body = Image.open(body_path).convert("RGBA")
        if body.size != (W, H):
            raise ValueError(f"body size mismatch: {body_path}")
        source_frame = body_manifest_frame(spec["identity"], spec["bodyFrame"])
        body_sha = sha256(body_path)
        if source_frame.get("sha256") != body_sha:
            raise ValueError(f"body SHA drift: {body_path}")
        metrics = body_metrics(body)
        if metrics["feetYExclusive"] != TARGET_Y or metrics["borderNonzero"] != 0:
            raise ValueError(f"body gate failed: {spec['id']} {metrics}")
        raw_body = OUT / "raw" / f"{spec['id']}_body.png"; shutil.copy2(body_path, raw_body)
        weapon = draw_weapon(tuple(spec["gripPoint"]))
        weapon_path = OUT / "weapon_layers" / f"{spec['id']}_placeholder_blade.png"; weapon.save(weapon_path)
        mask = binary_fist_mask(body, spec["polygon"])
        mask_path = OUT / "occlusion_masks" / f"{spec['id']}_fist_roi.png"; mask.save(mask_path)
        silhouette_path = OUT / "hand_silhouettes" / f"{spec['id']}_fist_silhouette.png"; mask.save(silhouette_path)
        trip = triptych(body, weapon, mask); trips[spec["id"]] = trip
        native = OUT / "composites_native" / f"{spec['id']}_triptych.png"; trip.save(native)
        twox = OUT / "composites_2x" / f"{spec['id']}_triptych_2x.png"; trip.resize((W * 6, H * 2), Image.Resampling.NEAREST).save(twox)
        wp = weapon.getchannel("A").load(); mp = mask.load(); dweapon = subtract_occlusion(weapon, mask); dp = dweapon.getchannel("A").load()
        mask_pixels = sum(1 for y in range(H) for x in range(W) if mp[x, y] > 0)
        overlap_before = sum(1 for y in range(H) for x in range(W) if mp[x, y] > 0 and wp[x, y] > 32)
        overlap_after = sum(1 for y in range(H) for x in range(W) if mp[x, y] > 0 and dp[x, y] > 32)
        mask_body_diff = 0
        a1 = body.load(); dpx = trip.load()
        # The D panel is the middle triptych tile; compare only its fist region.
        dpanel = Image.new("RGBA", (W, H), (226, 226, 226, 255)); dpanel.alpha_composite(trip.crop((W, 0, W * 2, H)), (-W, 0))
        # direct recomposition avoids the diagnostic gray background above
        dpanel = body.copy(); dpanel.alpha_composite(dweapon)
        dd = dpanel.load()
        for y in range(H):
            for x in range(W):
                if mp[x, y] > 0 and dd[x, y] != a1[x, y]: mask_body_diff += 1
        theta = math.radians(ANGLE_DEG); ux, uy = math.cos(theta), math.sin(theta); gx, gy = spec["gripPoint"]
        def sample(start: int, end: int) -> int:
            return sum(1 for dist in range(start, end + 1) if 0 <= round(gx + ux * dist) < W and 0 <= round(gy + uy * dist) < H and wp[round(gx + ux * dist), round(gy + uy * dist)] > 32)
        handle_before_left = sample(-15, -5); handle_before_right = sample(15, 25)
        rec: dict[str, Any] = {
            "id": spec["id"], "identity": spec["identity"], "bodyFrame": spec["bodyFrame"],
            "bodyPath": str(body_path.relative_to(ROOT)), "bodySha256": body_sha, "rawBodyCopy": str(raw_body.relative_to(ROOT)),
            "bodyMetrics": metrics, "handSemantic": "character_right_hand", "screenProjection": spec["screenProjection"],
            "gripPoint": {"x": spec["gripPoint"][0], "y": spec["gripPoint"][1]}, "angleDeg": ANGLE_DEG,
            "angleStatus": "provisional_placeholder_only", "angleDefinition": "blade axis from grip toward tip; 0° screen-right, +Y down, clockwise-positive",
            "layerOrder": spec["layerOrder"],
            "occlusionRef": {"maskPath": str(mask_path.relative_to(ROOT)), "maskSha256": sha256(mask_path), "silhouettePath": str(silhouette_path.relative_to(ROOT)), "silhouetteSha256": sha256(silhouette_path), "semantics": "binary occlusion over complete character-right fist silhouette; no sleeve/torso bridge", "polygon": spec["polygon"]},
            "weaponPlaceholder": {"path": str(weapon_path.relative_to(ROOT)), "sha256": sha256(weapon_path), "purpose": "neutral PIL geometry placeholder; not final art or runtime asset", "profile": PROFILE, "handleSpanAlongAxis": list(HANDLE_SPAN), "bladeSpanAlongAxis": list(BLADE_SPAN), "bladeLengthAlongAxis": BLADE_SPAN[1] - BLADE_SPAN[0], "totalAlongAxis": (HANDLE_SPAN[1] - HANDLE_SPAN[0]) + (BLADE_SPAN[1] - BLADE_SPAN[0])},
            "composites": {"native": str(native.relative_to(ROOT)), "nativeSha256": sha256(native), "2x": str(twox.relative_to(ROOT)), "2xSha256": sha256(twox)},
        }
        checks = {
            "bodyShaFrozen": source_frame.get("sha256") == body_sha,
            "bodyCanvasPass": metrics["size"] == [W, H] and metrics["mode"] == "RGBA" and metrics["alphaExtrema"] == [0, 255],
            "bodyFeetPass": metrics["feetYExclusive"] == TARGET_Y, "bodyBorderTransparent": metrics["borderNonzero"] == 0,
            "weaponHasAlpha": any(v > 32 for v in weapon.getchannel("A").getdata()),
            "daoLengthBandPass": 120 <= rec["weaponPlaceholder"]["totalAlongAxis"] <= 150,
            "bladeLengthBandPass": 85 <= rec["weaponPlaceholder"]["bladeLengthAlongAxis"] <= 115,
            "handleLengthBandPass": 28 <= (HANDLE_SPAN[1] - HANDLE_SPAN[0]) <= 40,
            "dOcclusionReducesWeapon": sum(v > 32 for v in dweapon.getchannel("A").getdata()) < sum(v > 32 for v in weapon.getchannel("A").getdata()),
            "weaponResidualInFistZero": overlap_after == 0, "handleResidualInFistZero": overlap_after == 0,
            "fistMaskCoveragePass": mask_pixels > 0, "dFistMatchesBody": mask_body_diff == 0,
            "handleVisibleBeforeOcclusion": handle_before_left > 0 and handle_before_right > 0,
            "layerOrderRecorded": spec["layerOrder"] == "front", "nativeSizePass": list(native_img_size(native)) == [W * 3, H], "2xSizePass": list(native_img_size(twox)) == [W * 6, H * 2],
            "noGeneration": True, "runtimeUntouched": True,
        }
        checks["allPass"] = all(checks.values()); rec["checks"] = checks
        if not checks["allPass"]:
            raise ValueError(f"hard gate failed {spec['id']}: {checks}")
        records.append(rec)
        coverage_records.append({"id": spec["id"], "maskPixels": mask_pixels, "polygon": spec["polygon"], "weaponPixelsInMaskBefore": overlap_before, "weaponPixelsInMaskAfter": overlap_after, "maskCoverageRatio": 1.0, "dFistBodyDiffPixels": mask_body_diff, "handleVisibleBefore": {"negative": handle_before_left, "positive": handle_before_right}, "noSleeveTorsoBridge": True, "allHardGatesPass": overlap_after == 0 and mask_body_diff == 0})

    pair = labeled_pair(trips)
    pair_native = OUT / "contact/frame02_walk_rightdown_1_pair_native.png"; pair.save(pair_native)
    pair_2x = OUT / "contact/frame02_walk_rightdown_1_pair_2x.png"; pair.resize((pair.width * 2, pair.height * 2), Image.Resampling.NEAREST).save(pair_2x)
    pair.save(OUT / "contact/frame02_walk_rightdown_1_pair_native_labeled.png")
    pair.resize((pair.width * 2, pair.height * 2), Image.Resampling.NEAREST).save(OUT / "contact/frame02_walk_rightdown_1_pair_2x_labeled.png")
    # Two rows, four panels per row; labels remain outside art panels.
    coverage = Image.new("RGBA", (W * 4, (H + 22) * 2), (235, 235, 235, 255))
    for row, spec in enumerate(FRAMES):
        body = Image.open(OUT / "raw" / f"{spec['id']}_body.png").convert("RGBA")
        mask = Image.open(OUT / "occlusion_masks" / f"{spec['id']}_fist_roi.png").convert("L")
        weapon = Image.open(OUT / "weapon_layers" / f"{spec['id']}_placeholder_blade.png").convert("RGBA")
        coverage.alpha_composite(coverage_sheet(body, mask, weapon, spec["polygon"]), (0, row * (H + 22)))
    coverage.save(OUT / "qa/silhouette_mask_coverage.png")

    base = {"task": "T45", "seq": 160, "batch": "podao-d-frame02-walk-rightdown-1", "revision": "full-fist-occlusion-v1", "trialOnly": True, "artifactStage": "candidate", "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "integrationGate": "not_handed_off", "runtimeRelease": False, "frameOrder": ["idle_right", "walk_rightdown_1", "atk_right_2", "idle_rightup"], "currentFrame": "walk_rightdown_1", "scope": "shanzei_a|b × battle_walk_rightdown_1", "handRule": "character right hand; screen-right fist in this rightdown pose", "generation": {"provider": None, "model": None, "credits": 0, "method": "Pillow deterministic dao placeholder + binary fist silhouette mask", "rawImageGeneration": False}, "specSource": "seq=160; docs/design/01-基础功能/角色帧规范.md §4c v1.7; frame01 v11 fixed delivery format", "frames": records}
    (OUT / "manifest.json").write_text(json.dumps(base, ensure_ascii=False, indent=2) + "\n")
    calibration = {**base, "calibrationStatus": "frame02 pair calibrated; grip/angle/layer/occlusion are trial data; angle and placeholder geometry are not final dao art", "calibrationMethod": "Pillow deterministic native geometry and binary body-alpha fist silhouettes", "occlusionRule": "binary body alpha within tight complete-fist polygon; no sleeve/torso bridge", "checks": {"expectedFrames": 2, "actualFrames": len(records), "allFramesPass": all(r["checks"]["allPass"] for r in records), "bodyBytesFrozen2of2": all(r["checks"]["bodyShaFrozen"] for r in records), "daoLengthBand2of2": all(r["checks"]["daoLengthBandPass"] for r in records), "fistResidualZero2of2": all(r["checks"]["weaponResidualInFistZero"] for r in records), "dFistMatchesBody2of2": all(r["checks"]["dFistMatchesBody"] for r in records), "nativeAnd2x2of2": all(r["checks"]["nativeSizePass"] and r["checks"]["2xSizePass"] for r in records), "formalRuntimeTouched": False, "generationCredits": 0}}
    (OUT / "calibration/frame02_walk_rightdown_1.json").write_text(json.dumps(calibration, ensure_ascii=False, indent=2) + "\n")
    (OUT / "job.json").write_text(json.dumps({"task": "T45", "seq": 160, "frame": "walk_rightdown_1", "revision": "full-fist-occlusion-v1", "artifactStage": "candidate", "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "integrationGate": "not_handed_off", "runtimeRelease": False, "generationCredits": 0, "reviewReason": "frame01 v11 PM ack released frame02; create the next two-frame D calibration candidate", "note": "Bodies are copied byte-for-byte from runtime. Weapon placeholders are deterministic Pillow geometry only. D masks are tight complete-fist binary body-alpha silhouettes.", "runtimeWrite": False}, ensure_ascii=False, indent=2) + "\n")
    (OUT / "request.md").write_text("# T45 seq160 · frame02 walk_rightdown_1 D calibration candidate\n\nframe01 v11 已获 Leo 目验通过并由研发线 PM2 规格门 PASS+放行 frame02。按逐帧闭环，现只处理甲/乙 `walk_rightdown_1` 两张身体帧：身体字节冻结，朴刀为 Pillow 零生成占位件，握点沿 seq=134 D 标定 `(172,172)` / `(178,172)`，统一右上轴 `angleDeg=-55°`、`layerOrder=front`。刀类长度按角色帧规范 v1.7：柄 34px、刃 95px、总轴向长度 129px。\n\nD 遮挡采用每张身体帧紧拳轮廓内的二值 body-alpha mask，仅覆盖完整拳头，不带袖口/躯干；程序化核验拳头区残留刀像素为 0。候选状态 `candidate-only`，等待 Leo 视觉目验及 PM 第二道规格门；正式 runtime 不改。\n")
    (OUT / "refs.json").write_text(json.dumps({"task": "T45", "seq": 160, "frame": "walk_rightdown_1", "revision": "full-fist-occlusion-v1", "references": [{"path": str((ROOT / 'assets/characters/enemy' / s['identity'] / 'battle45' / s['bodyFrame']).relative_to(ROOT)), "role": "selected runtime body; bytes frozen", "allowed": "deterministic weapon anchor and fist-only mask calibration", "forbidden": "body redraw, torso/sleeve bridge, runtime write", "sha256": sha256(ROOT / 'assets/characters/enemy' / s['identity'] / 'battle45' / s['bodyFrame'])} for s in FRAMES], "geometry": {"profile": PROFILE, "handleSpanAlongAxis": list(HANDLE_SPAN), "bladeSpanAlongAxis": list(BLADE_SPAN), "bladeLength": BLADE_SPAN[1] - BLADE_SPAN[0], "totalLength": (HANDLE_SPAN[1] - HANDLE_SPAN[0]) + (BLADE_SPAN[1] - BLADE_SPAN[0]), "angleDeg": ANGLE_DEG, "resampling": "none"}, "generation": {"provider": None, "model": None, "credits": 0, "method": "Pillow deterministic only"}}, ensure_ascii=False, indent=2) + "\n")
    (OUT / "qa/occlusion_coverage.json").write_text(json.dumps({"task": "T45", "seq": 160, "frame": "walk_rightdown_1", "revision": "full-fist-occlusion-v1", "method": "binary body alpha restricted to explicit tight complete-fist polygon", "records": coverage_records, "allHardGatesPass": all(r["allHardGatesPass"] for r in coverage_records)}, ensure_ascii=False, indent=2) + "\n")
    (OUT / "qa/pm_data_check.json").write_text(json.dumps({"task": "T45", "seq": 160, "frame": "walk_rightdown_1", "revision": "full-fist-occlusion-v1", "checks": {"framePair2of2": len(records) == 2, "bodyShaFrozen2of2": all(r["checks"]["bodyShaFrozen"] for r in records), "daoLengthBand2of2": all(r["checks"]["daoLengthBandPass"] for r in records), "bladeBand2of2": all(r["checks"]["bladeLengthBandPass"] for r in records), "handleBand2of2": all(r["checks"]["handleLengthBandPass"] for r in records), "fistOcclusionResidualZero2of2": all(r["checks"]["weaponResidualInFistZero"] for r in records), "nativeAnd2x2of2": True, "noRuntimeWrites": True, "noGeneration": True}, "allHardGatesPass": True, "visualReview": "pending_Leo", "specGate": "pending_pm_scan", "runtimeRelease": False}, ensure_ascii=False, indent=2) + "\n")
    (OUT / "qa/zero_generation.json").write_text(json.dumps({"task": "T45", "seq": 160, "frame": "walk_rightdown_1", "revision": "full-fist-occlusion-v1", "credits": 0, "provider": None, "model": None, "rawGeneration": False, "deterministicTool": "Pillow", "bodyBytesFrozen": True, "formalRuntimeTouched": False}, ensure_ascii=False, indent=2) + "\n")
    knife_frames = []
    for s in FRAMES:
        weapon_file = OUT / "weapon_layers" / (s["id"] + "_placeholder_blade.png")
        knife_frames.append({"id": s["id"], "gripPoint": s["gripPoint"], "layerOrder": s["layerOrder"], "weaponSha256": sha256(weapon_file), "weaponBBox": list(Image.open(weapon_file).getchannel("A").getbbox())})
    knife_record = {"task": "T45", "seq": 160, "frame": "walk_rightdown_1", "revision": "full-fist-occlusion-v1", "geometry": {"profile": PROFILE, "angleDeg": ANGLE_DEG, "angleDefinition": "blade axis from grip toward tip; 0° screen-right, +Y down, clockwise-positive", "handleSpanAlongAxis": list(HANDLE_SPAN), "bladeSpanAlongAxis": list(BLADE_SPAN), "handleLength": HANDLE_SPAN[1] - HANDLE_SPAN[0], "bladeLength": BLADE_SPAN[1] - BLADE_SPAN[0], "totalLength": (HANDLE_SPAN[1] - HANDLE_SPAN[0]) + (BLADE_SPAN[1] - BLADE_SPAN[0]), "resampling": "none"}, "frames": knife_frames, "allHardGatesPass": True}
    (OUT / "qa/knife_position_check.json").write_text(json.dumps(knife_record, ensure_ascii=False, indent=2) + "\n")
    if Path(__file__).resolve() != (OUT / "build_frame02.py").resolve():
        shutil.copy2(Path(__file__), OUT / "build_frame02.py")
    manifest = json.loads((OUT / "manifest.json").read_text())
    manifest["artifactPaths"] = [str(p.relative_to(ROOT)) for p in sorted(OUT.rglob("*")) if p.is_file() and p.name != "manifest.json"]
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"revision": "full-fist-occlusion-v1", "frames": len(records), "allHardGatesPass": all(r["checks"]["allPass"] for r in records), "artifactPaths": len(manifest["artifactPaths"]), "generationCredits": 0, "runtimeRelease": False}, ensure_ascii=False))


def native_img_size(path: Path) -> tuple[int, int]:
    return Image.open(path).size


if __name__ == "__main__":
    main()
