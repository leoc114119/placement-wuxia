from __future__ import annotations

from collections import deque
from pathlib import Path
import hashlib
import json
import statistics

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).parent
W, H = 240, 320
CX, FEET = 120, 300
THRESHOLD = 32

BENCHMARK = Path("assets/characters/hero/battle45/battle_idle_right.png")
SOURCES = {
    **{
        f"walk_right_{i}": Path(
            f"assets/_trial_20260910/t45_hero_right_walk_jump_selected_seq278/raw/walk_right_{i}.png"
        )
        for i in range(1, 4)
    },
    **{
        f"jump_right_{i}": Path(
            f"assets/_trial_20260910/t45_hero_right_walk_jump_selected_seq278/raw/jump_right_{i}.png"
        )
        for i in range(1, 4)
    },
    **{
        f"atk_right_{i}": Path(
            f"assets/_trial_20260910/t45_hero_atk_selected_seq279/raw/atk_right_{i}.png"
        )
        for i in range(1, 5)
    },
}

GROUP = {
    **{f"walk_right_{i}": "seq278_walk_jump" for i in range(1, 4)},
    **{f"jump_right_{i}": "seq278_walk_jump" for i in range(1, 4)},
    **{f"atk_right_{i}": "seq279_atk" for i in range(1, 5)},
}

# One coefficient per accepted source batch.  The source spans below are
# measured on the selected raw files after deterministic background isolation;
# the coefficient is never recomputed per output frame.
SCALES = {
    "seq278_walk_jump": 256 / 312,
    "seq279_atk": 256 / 214,
}

MANUAL_RIGID_ANNOTATIONS = {
    "benchmark": {
        "frame": str(BENCHMARK),
        "feature": "head crown top → lower cheek/jaw anchor",
        "topPx": 53,
        "bottomPx": 139,
        "spanPx": 86,
        "note": "manual two-point annotation; used as the scale reference, not a per-frame bbox fit",
    },
    "seq278_walk_jump": {
        "feature": "head crown top → lower cheek/jaw anchor",
        "sourceFrames": {
            "walk_right_1": {"topPx": 55, "bottomPx": 160, "spanPx": 105},
            "walk_right_2": {"topPx": 52, "bottomPx": 157, "spanPx": 105},
            "walk_right_3": {"topPx": 53, "bottomPx": 157, "spanPx": 104},
            "jump_right_1": {"topPx": 82, "bottomPx": 187, "spanPx": 105},
            "jump_right_2": {"topPx": 19, "bottomPx": 124, "spanPx": 105},
            "jump_right_3": {"topPx": 15, "bottomPx": 120, "spanPx": 105},
        },
        "coefficientBasis": "fixed coefficient anchored by the standing walk source median span; jump frames reuse it",
        "sourceStandingSpanMedianPx": 105,
        "benchmarkSpanPx": 86,
        "fixedScale": SCALES["seq278_walk_jump"],
    },
    "seq279_atk": {
        "feature": "head crown top → lower cheek/jaw anchor",
        "sourceFrames": {
            "atk_right_1": {"topPx": 29, "bottomPx": 101, "spanPx": 72},
            "atk_right_2": {"topPx": 29, "bottomPx": 101, "spanPx": 72},
            "atk_right_3": {"topPx": 29, "bottomPx": 101, "spanPx": 72},
            "atk_right_4": {"topPx": 29, "bottomPx": 101, "spanPx": 72},
        },
        "coefficientBasis": "fixed coefficient anchored by the seq279 standing source median span",
        "sourceStandingSpanMedianPx": 72,
        "benchmarkSpanPx": 86,
        "fixedScale": SCALES["seq279_atk"],
    },
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def neutral_background(r: int, g: int, b: int, a: int) -> bool:
    return a > 0 and max(r, g, b) - min(r, g, b) <= 28 and min(r, g, b) >= 185


def isolate_edge_background(image: Image.Image) -> tuple[Image.Image, int]:
    """Remove only edge-connected neutral checker pixels."""
    image = image.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    seen: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if (x, y) not in seen and neutral_background(*pixels[x, y]):
            seen.add((x, y))
            queue.append((x, y))

    for x in range(width):
        seed(x, 0)
        seed(x, height - 1)
    for y in range(height):
        seed(0, y)
        seed(width - 1, y)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen:
                if neutral_background(*pixels[nx, ny]):
                    seen.add((nx, ny))
                    queue.append((nx, ny))

    for x, y in seen:
        pixels[x, y] = (0, 0, 0, 0)
    return image, len(seen)


def alpha_components(image: Image.Image) -> list[list[tuple[int, int]]]:
    pixels = image.load()
    width, height = image.size
    seen: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if (x, y) in seen or pixels[x, y][3] <= THRESHOLD:
                continue
            points: list[tuple[int, int]] = []
            queue = [(x, y)]
            seen.add((x, y))
            while queue:
                xx, yy = queue.pop()
                points.append((xx, yy))
                for nx, ny in ((xx - 1, yy), (xx + 1, yy), (xx, yy - 1), (xx, yy + 1)):
                    if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen:
                        if pixels[nx, ny][3] > THRESHOLD:
                            seen.add((nx, ny))
                            queue.append((nx, ny))
            components.append(points)
    return sorted(components, key=len, reverse=True)


def remove_secondary_components(image: Image.Image) -> tuple[Image.Image, dict]:
    """Delete secondary alpha>32 components by exact pixel membership only."""
    before = image.copy()
    components = alpha_components(image)
    if not components:
        raise ValueError("no alpha>32 component")
    main = set(components[0])
    removed: list[dict] = []
    pixels = image.load()
    for component in components[1:]:
        for x, y in component:
            pixels[x, y] = (0, 0, 0, 0)
        xs = [point[0] for point in component]
        ys = [point[1] for point in component]
        removed.append(
            {
                "pixels": len(component),
                "bbox": [min(xs), min(ys), max(xs) + 1, max(ys) + 1],
            }
        )

    subject_deleted = 0
    subject_rgb_changed = 0
    for x, y in main:
        before_px = before.getpixel((x, y))
        after_px = image.getpixel((x, y))
        if before_px[3] > THRESHOLD and after_px[3] <= THRESHOLD:
            subject_deleted += 1
        if before_px[:3] != after_px[:3]:
            subject_rgb_changed += 1

    return image, {
        "componentsBefore": len(components),
        "mainComponentPixels": len(main),
        "removedComponents": removed,
        "removedPixelCount": sum(item["pixels"] for item in removed),
        "subjectDomainDeletedPixels": subject_deleted,
        "subjectDomainRgbChangedPixels": subject_rgb_changed,
        "cleanupSafe": subject_deleted == 0 and subject_rgb_changed == 0,
    }


def weighted_centroid_x(image: Image.Image) -> float:
    alpha = image.getchannel("A")
    total = 0
    weighted = 0
    for y in range(image.height):
        for x in range(image.width):
            value = alpha.getpixel((x, y))
            if value > THRESHOLD:
                total += value
                weighted += x * value
    return weighted / total


def border_nonzero(image: Image.Image) -> dict:
    alpha = image.getchannel("A")
    top = sum(alpha.getpixel((x, 0)) for x in range(image.width))
    bottom = sum(alpha.getpixel((x, image.height - 1)) for x in range(image.width))
    left = sum(alpha.getpixel((0, y)) for y in range(image.height))
    right = sum(alpha.getpixel((image.width - 1, y)) for y in range(image.height))
    return {"top": top, "bottom": bottom, "left": left, "right": right, "total": top + bottom + left + right}


def metrics(image: Image.Image) -> dict:
    alpha = image.getchannel("A")
    mask = Image.new("L", image.size, 0)
    mask_pixels = mask.load()
    alpha_pixels = alpha.load()
    for y in range(image.height):
        for x in range(image.width):
            mask_pixels[x, y] = 255 if alpha_pixels[x, y] > THRESHOLD else 0
    bbox = mask.getbbox()
    components = alpha_components(image)
    return {
        "size": list(image.size),
        "mode": image.mode,
        "alphaExtrema": list(alpha.getextrema()),
        "bboxAlphaGt32": list(bbox) if bbox else None,
        "visualHeightAlphaGt32": (bbox[3] - bbox[1]) if bbox else 0,
        "visualWidthAlphaGt32": (bbox[2] - bbox[0]) if bbox else 0,
        "feetYExclusiveAlphaGt32": bbox[3] if bbox else None,
        "alphaGt32Components4Connected": len(components),
        "alphaCentroidXGt32Weighted": weighted_centroid_x(image),
        "border": border_nonzero(image),
    }


def normalize(cleaned: Image.Image, scale: float) -> tuple[Image.Image, dict]:
    crop_box = cleaned.getchannel("A").getbbox()
    if not crop_box:
        raise ValueError("empty cleaned image")
    crop = cleaned.crop(crop_box)
    width = round(crop.width * scale)
    height = round(crop.height * scale)
    resized = crop.resize((width, height), Image.Resampling.LANCZOS)
    local_centroid = weighted_centroid_x(resized)
    x = round(CX - local_centroid)
    y = FEET - height
    output = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    output.alpha_composite(resized, (x, y))
    # Do not erase a touching subject pixel to manufacture a border pass.  The
    # edge is measured as-is and a touching frame is reported as a hard-gate
    # failure for PM2/Leo to adjudicate.
    pre_border = border_nonzero(output)
    return output, {
        "sourceAlphaCropBox": list(crop_box),
        "scaledSize": [width, height],
        "localAlphaGt32WeightedCentroidX": local_centroid,
        "placedAt": [x, y],
        "borderBeforePostprocess": pre_border,
        "edgePixelsDeleted": 0,
    }


def draw_contact(images: list[tuple[str, Image.Image]], output: Path) -> None:
    tile_w, tile_h, label_h = 240, 320, 24
    cols = 4
    rows = (len(images) + cols - 1) // cols
    contact = Image.new("RGBA", (cols * tile_w, rows * (tile_h + label_h)), (48, 48, 48, 255))
    draw = ImageDraw.Draw(contact)
    for index, (label, image) in enumerate(images):
        x = (index % cols) * tile_w
        y = (index // cols) * (tile_h + label_h)
        contact.alpha_composite(image, (x, y))
        draw.rectangle((x, y + tile_h, x + tile_w, y + tile_h + label_h), fill=(48, 48, 48, 255))
        draw.text((x + 4, y + tile_h + 4), label, fill=(240, 240, 240, 255))
    contact.save(output)


def dark_head_probe(image: Image.Image) -> int:
    """Read-only calibration probe: dark head silhouette span in the top band."""
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise ValueError("empty calibration image")
    x0, y0, x1, y1 = bbox
    limit = min(y1, y0 + round((y1 - y0) * 0.34))
    points = []
    pixels = image.load()
    for y in range(y0, limit):
        for x in range(x0, x1):
            r, g, b, a = pixels[x, y]
            if a > THRESHOLD and max(r, g, b) < 100:
                points.append((x, y))
    if not points:
        raise ValueError("head probe found no pixels")
    return max(y for _, y in points) + 1 - min(y for _, y in points)


def main() -> None:
    benchmark_image = Image.open(BENCHMARK).convert("RGBA")
    retained = [
        Path(f"assets/characters/hero/battle45/battle_idle_{direction}.png")
        for direction in ("right", "rightup", "rightdown")
    ] + [
        Path(f"assets/characters/hero/battle45/cast_{direction}_{index}.png")
        for direction in ("right", "rightup", "rightdown")
        for index in range(1, 4)
    ]
    probe_values = {str(path): dark_head_probe(Image.open(path).convert("RGBA")) for path in retained}
    probe_spans = list(probe_values.values())
    probe_median = statistics.median(probe_spans)
    probe_variation_pct = (max(probe_spans) - min(probe_spans)) / probe_median * 100

    qa = {
        "task": "T45",
        "seq": "300",
        "revision": "R1",
        "phase": "right_side_fixed_scale_rework",
        "status": "candidate-only",
        "benchmark": {
            "path": str(BENCHMARK),
            "standingHeightAlphaGt32": 256,
            "manualRigidAnnotation": MANUAL_RIGID_ANNOTATIONS["benchmark"],
        },
        "automaticMethodPreflight": {
            "method": "dark head silhouette probe, read-only validation only",
            "retainedSet": [str(path) for path in retained],
            "valuesPx": probe_values,
            "medianPx": probe_median,
            "variationPct": probe_variation_pct,
            "maxAllowedPct": 5,
            "validForCalibrationSet": probe_variation_pct <= 5,
            "coefficientUse": "not used for per-frame fitting; coefficients are fixed by the manual source-group calibration table",
        },
        "fixedScaleGroups": MANUAL_RIGID_ANNOTATIONS,
        "frames": {},
        "shaDistinct": False,
        "allHardGatesPass": False,
        "runtimeTouched": False,
        "phaseBStarted": False,
    }

    for frame_id, source in SOURCES.items():
        raw = ROOT / "raw" / f"{frame_id}.png"
        cleaned_path = ROOT / "cleaned" / f"{frame_id}.png"
        output_path = ROOT / "normalized" / "right" / f"{frame_id}.png"
        raw.write_bytes(source.read_bytes())

        isolated, isolated_pixels = isolate_edge_background(Image.open(source))
        cleaned, cleanup = remove_secondary_components(isolated)
        cleaned.save(cleaned_path)
        output, placement = normalize(cleaned, SCALES[GROUP[frame_id]])
        output.save(output_path)
        m = metrics(output)
        output_sha = sha256(output_path)
        source_bbox = list(cleaned.getchannel("A").getbbox())
        source_height = source_bbox[3] - source_bbox[1]
        source_width = source_bbox[2] - source_bbox[0]
        benchmark_feature = 86
        annotation = MANUAL_RIGID_ANNOTATIONS[GROUP[frame_id]]["sourceFrames"][frame_id]
        scaled_feature = annotation["spanPx"] * SCALES[GROUP[frame_id]]
        feature_delta = (scaled_feature - benchmark_feature) / benchmark_feature * 100
        checks = {
            "size240x320": m["size"] == [240, 320],
            "rgba": m["mode"] == "RGBA",
            "alphaHas0And255": m["alphaExtrema"] == [0, 255],
            "widthLe238": m["visualWidthAlphaGt32"] <= 238,
            "feetY300": m["feetYExclusiveAlphaGt32"] == 300,
            "centroidXWithin1": abs(m["alphaCentroidXGt32Weighted"] - CX) <= 1,
            "borderTransparent": m["border"]["total"] == 0,
            "alphaGt32SingleComponent": m["alphaGt32Components4Connected"] == 1,
            "rigidFeatureWithin5pct": abs(feature_delta) <= 5,
            "cleanupSafe": cleanup["cleanupSafe"],
        }
        qa["frames"][frame_id] = {
            "source": str(source),
            "sourceSha256": sha256(source),
            "sourceMapping": {"path": str(source), "sheet": None, "crop": None},
            "group": GROUP[frame_id],
            "fixedScale": SCALES[GROUP[frame_id]],
            "sourceAlphaGt32BBoxAfterIsolation": source_bbox,
            "sourceAlphaGt32Height": source_height,
            "sourceAlphaGt32Width": source_width,
            "edgeBackgroundPixelsCleared": isolated_pixels,
            "cleanup": cleanup,
            "manualRigidFeature": annotation,
            "scaledRigidFeaturePx": scaled_feature,
            "scaleDeltaVsBenchmarkPct": feature_delta,
            "raw": str(raw),
            "cleaned": str(cleaned_path),
            "processing": placement,
            "output": str(output_path),
            "outputSha256": output_sha,
            "metrics": m,
            "checks": checks,
            "allHardGatesPass": all(checks.values()),
        }

    qa["shaDistinct"] = len({frame["outputSha256"] for frame in qa["frames"].values()}) == 10
    qa["allHardGatesPass"] = qa["shaDistinct"] and all(
        frame["allHardGatesPass"] for frame in qa["frames"].values()
    )
    failed_frames = [
        frame_id for frame_id, frame in qa["frames"].items() if not frame["allHardGatesPass"]
    ]
    qa["failedFrames"] = failed_frames
    qa["stopReason"] = (
        "right_jump_3 touches the right canvas border after the fixed seq278 coefficient; "
        "do not crop, shrink per-frame, or erase subject pixels"
        if "jump_right_3" in failed_frames
        else None
    )

    # One contact sheet for this batch.  It includes the benchmark in the same
    # fixed 240x320 tiles as the ten new frames for the mandatory visual pass.
    contact_items = [("BASE battle_idle_right", benchmark_image)]
    for frame_id in (
        "walk_right_1",
        "walk_right_2",
        "walk_right_3",
        "atk_right_1",
        "atk_right_2",
        "atk_right_3",
        "atk_right_4",
        "jump_right_1",
        "jump_right_2",
        "jump_right_3",
    ):
        contact_items.append((frame_id, Image.open(qa["frames"][frame_id]["output"]).convert("RGBA")))
    contact_path = ROOT / "contact" / "right_r1_seq300_with_benchmark.png"
    draw_contact(contact_items, contact_path)
    qa["contact"] = str(contact_path)
    (ROOT / "qa" / "r1_right_seq300.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")

    manifest = {
        "task": "T45",
        "seq": "300",
        "revision": "R1",
        "phase": "right_side_fixed_scale_rework",
        "status": "candidate-only",
        "frameCount": 10,
        "frames": list(qa["frames"]),
        "qa": "qa/r1_right_seq300.json",
        "contact": "contact/right_r1_seq300_with_benchmark.png",
        "runtimeRelease": False,
        "runtimeTouched": False,
        "phaseBStarted": False,
        "shaDistinct": qa["shaDistinct"],
        "allHardGatesPass": qa["allHardGatesPass"],
        "failedFrames": qa["failedFrames"],
        "stopReason": qa["stopReason"],
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "credits.json").write_text(
        json.dumps({"generationCredits": 0, "provider": None, "model": None, "note": "deterministic local normalization only"}, ensure_ascii=False, indent=2)
        + "\n"
    )
    (ROOT / "calibration" / "rigid_feature_annotations.json").write_text(
        json.dumps(
            {
                "task": "T45",
                "seq": "300",
                "method": "manual two-point head crown-to-jaw annotation for fixed source-group calibration",
                "benchmark": MANUAL_RIGID_ANNOTATIONS["benchmark"],
                "groups": {
                    "seq278_walk_jump": MANUAL_RIGID_ANNOTATIONS["seq278_walk_jump"],
                    "seq279_atk": MANUAL_RIGID_ANNOTATIONS["seq279_atk"],
                },
                "automaticPreflight": qa["automaticMethodPreflight"],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    print(json.dumps({"seq": "300", "frames": 10, "shaDistinct": qa["shaDistinct"], "allHardGatesPass": qa["allHardGatesPass"], "contact": str(contact_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
