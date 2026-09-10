from __future__ import annotations

from pathlib import Path
import importlib.util
import json
import statistics

from PIL import Image, ImageDraw


ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location("r1_base", ROOT / "build_r1_right.py")
base = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(base)

W, H, CX, FEET = 240, 320, 120, 300
BENCHMARK = Path("assets/characters/hero/battle45/battle_idle_right.png")

# Manual, anatomical, two-point annotations. Point A is the top of the jade
# crown outer contour; point B is the lower cheek/jaw contour at the same
# screen-facing side. This is deliberately not an image-height scan window.
BENCHMARK_ANNOTATION = {"top": [120, 53], "bottom": [145, 139], "spanPx": 86}
RETAINED_ANNOTATIONS = {
    "battle_idle_right": {"top": [120, 53], "bottom": [145, 139], "spanPx": 86},
    "battle_idle_rightup": {"top": [124, 47], "bottom": [148, 133], "spanPx": 86},
    "battle_idle_rightdown": {"top": [114, 57], "bottom": [142, 142], "spanPx": 85},
    "cast_right_1": {"top": [115, 51], "bottom": [143, 137], "spanPx": 86},
    "cast_right_2": {"top": [135, 54], "bottom": [163, 141], "spanPx": 87},
    "cast_right_3": {"top": [131, 53], "bottom": [159, 139], "spanPx": 86},
    "cast_rightup_1": {"top": [120, 46], "bottom": [145, 132], "spanPx": 86},
    "cast_rightup_2": {"top": [149, 52], "bottom": [174, 139], "spanPx": 87},
    "cast_rightup_3": {"top": [125, 49], "bottom": [151, 135], "spanPx": 86},
    "cast_rightdown_1": {"top": [116, 58], "bottom": [143, 144], "spanPx": 86},
    "cast_rightdown_2": {"top": [128, 57], "bottom": [154, 142], "spanPx": 85},
    "cast_rightdown_3": {"top": [129, 59], "bottom": [155, 145], "spanPx": 86},
}
SOURCE_ANNOTATIONS = {
    "walk_right_1": {"top": [240, 55], "bottom": [278, 163], "spanPx": 108},
    "walk_right_2": {"top": [220, 52], "bottom": [267, 160], "spanPx": 108},
    "walk_right_3": {"top": [194, 53], "bottom": [238, 160], "spanPx": 107},
    "jump_right_1": {"top": [225, 82], "bottom": [253, 186], "spanPx": 104},
    "jump_right_2": {"top": [205, 19], "bottom": [253, 128], "spanPx": 109},
    "jump_right_3": {"top": [205, 15], "bottom": [264, 124], "spanPx": 109},
    "atk_right_1": {"top": [61, 29], "bottom": [84, 101], "spanPx": 72},
    "atk_right_2": {"top": [60, 29], "bottom": [83, 101], "spanPx": 72},
    "atk_right_3": {"top": [58, 29], "bottom": [81, 101], "spanPx": 72},
    "atk_right_4": {"top": [62, 29], "bottom": [85, 102], "spanPx": 73},
}

BENCHMARK_SPAN = BENCHMARK_ANNOTATION["spanPx"]
SOURCE_GROUP_SPANS = [SOURCE_ANNOTATIONS[f]["spanPx"] for f in SOURCE_ANNOTATIONS if f.startswith(("walk", "jump"))]
ATK_GROUP_SPANS = [SOURCE_ANNOTATIONS[f]["spanPx"] for f in SOURCE_ANNOTATIONS if f.startswith("atk")]
ANCHOR_SCALES = {
    "seq278_walk_jump": BENCHMARK_SPAN / statistics.median(SOURCE_GROUP_SPANS),
    "seq279_atk": BENCHMARK_SPAN / statistics.median(ATK_GROUP_SPANS),
}
SCALES = {
    "seq278_walk_jump": min(ANCHOR_SCALES["seq278_walk_jump"], 238 / 299),
    "seq279_atk": ANCHOR_SCALES["seq279_atk"],
}


def draw_annotation_sheet(items, output: Path, tile_size=(240, 260), columns=5):
    tile_w, tile_h = tile_size
    rows = (len(items) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * tile_w, rows * tile_h), (42, 42, 42, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (label, image_path, annotation) in enumerate(items):
        image = Image.open(image_path).convert("RGBA")
        scale = min(tile_w / image.width, (tile_h - 22) / image.height)
        nw, nh = round(image.width * scale), round(image.height * scale)
        image = image.resize((nw, nh), Image.Resampling.NEAREST)
        ox = (tile_w - nw) // 2
        oy = 2
        x = (i % columns) * tile_w
        y = (i // columns) * tile_h
        sheet.alpha_composite(image, (x + ox, y + oy))
        for key, color in (("top", (255, 80, 80, 255)), ("bottom", (80, 180, 255, 255))):
            px, py = annotation[key]
            sx, sy = x + ox + round(px * scale), y + oy + round(py * scale)
            draw.ellipse((sx - 4, sy - 4, sx + 4, sy + 4), outline=color, width=2)
        top = annotation["top"]
        bottom = annotation["bottom"]
        draw.line(
            (x + ox + round(top[0] * scale), y + oy + round(top[1] * scale), x + ox + round(bottom[0] * scale), y + oy + round(bottom[1] * scale)),
            fill=(255, 220, 80, 255),
            width=2,
        )
        draw.rectangle((x, y + tile_h - 22, x + tile_w, y + tile_h), fill=(42, 42, 42, 255))
        draw.text((x + 3, y + tile_h - 18), f"{label} span={annotation['spanPx']}", fill=(245, 245, 245, 255))
    sheet.save(output)


def output_annotation(source_annotation, crop_box, scale, placement):
    top = [
        round(placement[0] + (source_annotation["top"][0] - crop_box[0]) * scale),
        round(placement[1] + (source_annotation["top"][1] - crop_box[1]) * scale),
    ]
    bottom = [
        round(placement[0] + (source_annotation["bottom"][0] - crop_box[0]) * scale),
        round(placement[1] + (source_annotation["bottom"][1] - crop_box[1]) * scale),
    ]
    return {"top": top, "bottom": bottom, "spanPx": bottom[1] - top[1]}


def main():
    qa = {
        "task": "T45",
        "seq": "304",
        "revision": "R1",
        "phase": "right_side_fixed_scale_rework_manual_rigid_feature",
        "status": "candidate-only",
        "benchmark": {"path": str(BENCHMARK), "annotation": BENCHMARK_ANNOTATION},
        "measurementMethod": {
            "kind": "manual_two_point_anatomical_annotation",
            "feature": "crown outer top to lower cheek/jaw contour",
            "saturation": "not applicable; no bbox-height scan window or color-mask cap is used",
            "retainedValuesPx": [item["spanPx"] for item in RETAINED_ANNOTATIONS.values()],
            "retainedMedianPx": statistics.median(item["spanPx"] for item in RETAINED_ANNOTATIONS.values()),
            "retainedVariationPct": (max(item["spanPx"] for item in RETAINED_ANNOTATIONS.values()) - min(item["spanPx"] for item in RETAINED_ANNOTATIONS.values())) / statistics.median(item["spanPx"] for item in RETAINED_ANNOTATIONS.values()) * 100,
            "maxAllowedVariationPct": 5,
            "valid": True,
        },
        "retainedAnnotations": RETAINED_ANNOTATIONS,
        "sourceAnnotations": SOURCE_ANNOTATIONS,
        "anchorScales": ANCHOR_SCALES,
        "fixedScales": SCALES,
        "frames": {},
        "runtimeTouched": False,
        "phaseBStarted": False,
    }

    source_items = []
    retained_items = []
    for key, annotation in SOURCE_ANNOTATIONS.items():
        source = base.SOURCES[key]
        isolated, _ = base.isolate_edge_background(Image.open(source))
        cleaned, _ = base.remove_secondary_components(isolated)
        cleaned_path = ROOT / "cleaned" / f"{key}.png"
        cleaned.save(cleaned_path)
        source_items.append((key, cleaned_path, annotation))
    for key, annotation in RETAINED_ANNOTATIONS.items():
        retained_path = Path("assets/characters/hero/battle45") / f"{key}.png"
        retained_items.append((key, retained_path, annotation))
    draw_annotation_sheet(source_items, ROOT / "calibration" / "source_head_manual_annotations.png")
    draw_annotation_sheet(retained_items, ROOT / "calibration" / "retained_head_manual_annotations.png", tile_size=(240, 260), columns=4)

    for frame_id, source in base.SOURCES.items():
        raw = ROOT / "raw" / f"{frame_id}.png"
        cleaned_path = ROOT / "cleaned" / f"{frame_id}.png"
        output_path = ROOT / "normalized" / "right" / f"{frame_id}.png"
        raw.write_bytes(source.read_bytes())
        isolated, isolated_pixels = base.isolate_edge_background(Image.open(source))
        cleaned, cleanup = base.remove_secondary_components(isolated)
        cleaned.save(cleaned_path)
        group = base.GROUP[frame_id]
        scale = SCALES[group]
        output, placement = base.normalize(cleaned, scale)
        output.save(output_path)
        m = base.metrics(output)
        source_crop = cleaned.getchannel("A").getbbox()
        source_bbox = base.threshold_bbox(cleaned)
        if source_bbox is None:
            raise ValueError(frame_id)
        annotation = SOURCE_ANNOTATIONS[frame_id]
        output_feature = output_annotation(annotation, source_crop, scale, placement["placedAt"])
        feature_delta = (output_feature["spanPx"] - BENCHMARK_SPAN) / BENCHMARK_SPAN * 100
        expected_scaled = [round((source_bbox[2] - source_bbox[0]) * scale), round((source_bbox[3] - source_bbox[1]) * scale)]
        observed = [m["visualWidthAlphaGt32"], m["visualHeightAlphaGt32"]]
        checks = {
            "size240x320": m["size"] == [240, 320],
            "rgba": m["mode"] == "RGBA",
            "alphaHas0And255": m["alphaExtrema"] == [0, 255],
            "widthLe238": m["visualWidthAlphaGt32"] <= 238,
            "feetY300": m["feetYExclusiveAlphaGt32"] == 300,
            "centroidXWithin1": abs(m["alphaCentroidXGt32Weighted"] - CX) <= 1,
            "borderTransparent": m["border"]["total"] == 0,
            "alphaGt32SingleComponent": m["alphaGt32Components4Connected"] == 1,
            "outputRigidFeatureWithin5pct": abs(feature_delta) <= 5,
            "cleanupSafe": cleanup["cleanupSafe"],
            "noCropBboxWithin1": abs(observed[0] - expected_scaled[0]) <= 1 and abs(observed[1] - expected_scaled[1]) <= 1,
        }
        qa["frames"][frame_id] = {
            "source": str(source),
            "sourceSha256": base.sha256(source),
            "sourceMapping": {"path": str(source), "sheet": None, "crop": None},
            "group": group,
            "fixedScale": scale,
            "anchorScale": ANCHOR_SCALES[group],
            "sourceAnnotation": annotation,
            "outputAnnotation": output_feature,
            "outputRigidFeatureDeltaPct": feature_delta,
            "sourceAlphaGt32BBox": list(source_bbox),
            "expectedScaledAlphaGt32Size": expected_scaled,
            "observedOutputAlphaGt32Size": observed,
            "edgeBackgroundPixelsCleared": isolated_pixels,
            "cleanup": cleanup,
            "raw": str(raw),
            "cleaned": str(cleaned_path),
            "processing": placement,
            "output": str(output_path),
            "outputSha256": base.sha256(output_path),
            "metrics": m,
            "checks": checks,
            "allHardGatesPass": all(checks.values()),
        }

    qa["shaDistinct"] = len({item["outputSha256"] for item in qa["frames"].values()}) == 10
    qa["allHardGatesPass"] = qa["shaDistinct"] and all(item["allHardGatesPass"] for item in qa["frames"].values())
    qa["failedFrames"] = [key for key, item in qa["frames"].items() if not item["allHardGatesPass"]]
    qa["stopReason"] = "jump_right_3 has no placement satisfying border-zero and centroid x=120±1 without crop" if qa["failedFrames"] else None

    benchmark_image = Image.open(BENCHMARK).convert("RGBA")
    items = [("BASE battle_idle_right", benchmark_image)]
    for frame_id in ("walk_right_1", "walk_right_2", "walk_right_3", "atk_right_1", "atk_right_2", "atk_right_3", "atk_right_4", "jump_right_1", "jump_right_2", "jump_right_3"):
        items.append((frame_id, Image.open(qa["frames"][frame_id]["output"]).convert("RGBA")))
    contact_path = ROOT / "contact" / "right_r1_seq304_manual_feature.png"
    base.draw_contact(items, contact_path)
    qa["contact"] = str(contact_path)
    (ROOT / "qa" / "r1_right_seq304_manual.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "manifest.json").write_text(json.dumps({"task":"T45","seq":"304","revision":"R1","phase":qa["phase"],"status":"candidate-only","frameCount":10,"qa":"qa/r1_right_seq304_manual.json","contact":"contact/right_r1_seq304_manual_feature.png","runtimeRelease":False,"runtimeTouched":False,"phaseBStarted":False,"shaDistinct":qa["shaDistinct"],"allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"],"stopReason":qa["stopReason"]}, ensure_ascii=False, indent=2)+"\n")
    (ROOT / "credits.json").write_text(json.dumps({"generationCredits":0,"provider":None,"model":None,"note":"deterministic local normalization only"}, ensure_ascii=False, indent=2)+"\n")
    (ROOT / "calibration" / "rigid_feature_annotations.json").write_text(json.dumps({"task":"T45","seq":"304","method":"manual anatomical two-point annotation; non-saturated","benchmark":BENCHMARK_ANNOTATION,"retained":RETAINED_ANNOTATIONS,"source":SOURCE_ANNOTATIONS,"anchorScales":ANCHOR_SCALES,"fixedScales":SCALES}, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"seq":"304","frames":10,"allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"],"contact":str(contact_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
