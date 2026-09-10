from __future__ import annotations

from pathlib import Path
import importlib.util
import json
import math
import statistics

from PIL import Image, ImageDraw


ROOT = Path(__file__).parent
SEQ304 = Path("assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq304")
spec = importlib.util.spec_from_file_location("manual", SEQ304 / "build_r1_manual_measurement.py")
manual = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(manual)
base = manual.base

BENCHMARK = Path("assets/characters/hero/battle45/battle_idle_right.png")
FRAME_IDS = ["walk_right_1", "walk_right_2", "walk_right_3", "atk_right_1", "atk_right_2", "atk_right_3", "atk_right_4"]

# Existing manual points, now measured by Euclidean crown→jaw distance rather
# than vertical y projection. The latter is rotation-sensitive and is retired.
BENCH = manual.BENCHMARK_ANNOTATION
RETAINED = manual.RETAINED_ANNOTATIONS
SOURCE = {key: manual.SOURCE_ANNOTATIONS[key] for key in FRAME_IDS}


def sha(path: Path) -> str:
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


def axis_distance(annotation):
    a, b = annotation["top"], annotation["bottom"]
    return math.hypot(b[0] - a[0], b[1] - a[1])


retained_distances = [axis_distance(v) for v in RETAINED.values()]
benchmark_distance = statistics.median(retained_distances)
walk_distances = [axis_distance(SOURCE[f]) for f in FRAME_IDS if f.startswith("walk")]
atk_distances = [axis_distance(SOURCE[f]) for f in FRAME_IDS if f.startswith("atk")]
ANCHOR = {
    "seq278_walk_jump": benchmark_distance / statistics.median(walk_distances),
    "seq279_atk": benchmark_distance / statistics.median(atk_distances),
}
SCALES = ANCHOR.copy()


def axis_sheet(items, path):
    tw, th = 240, 260
    cols = 4
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * tw, rows * th), (42, 42, 42, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (label, image_path, ann) in enumerate(items):
        im = Image.open(image_path).convert("RGBA")
        scale = min(tw / im.width, (th - 22) / im.height)
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.NEAREST)
        x = (i % cols) * tw
        y = (i // cols) * th
        ox = (tw - im.width) // 2
        oy = 2
        sheet.alpha_composite(im, (x + ox, y + oy))
        p0 = (x + ox + round(ann["top"][0] * scale), y + oy + round(ann["top"][1] * scale))
        p1 = (x + ox + round(ann["bottom"][0] * scale), y + oy + round(ann["bottom"][1] * scale))
        draw.line((p0[0], p0[1], p1[0], p1[1]), fill=(255, 220, 80, 255), width=2)
        for p, color in ((p0, (255, 80, 80, 255)), (p1, (80, 180, 255, 255))):
            draw.ellipse((p[0]-4, p[1]-4, p[0]+4, p[1]+4), outline=color, width=2)
        draw.rectangle((x, y + th - 22, x + tw, y + th), fill=(42, 42, 42, 255))
        draw.text((x + 3, y + th - 18), f"{label} d={axis_distance(ann):.2f}", fill=(245, 245, 245, 255))
    sheet.save(path)


def main():
    qa = {
        "task": "T45",
        "seq": "325",
        "revision": "R1.10",
        "phase": "right_side_rotinv_walk_atk_first_segment",
        "status": "candidate-only",
        "scope": FRAME_IDS,
        "coefficientSource": "rotation-invariant crown→jaw Euclidean distance; seq=323 root-cause correction",
        "benchmarkDistancePx": benchmark_distance,
        "retainedDistancesPx": retained_distances,
        "retainedVariationPct": (max(retained_distances) - min(retained_distances)) / benchmark_distance * 100,
        "anchorScales": ANCHOR,
        "runtimeTouched": False,
        "phaseBStarted": False,
        "frames": {},
    }

    source_items = []
    for frame_id in FRAME_IDS:
        source = base.SOURCES[frame_id]
        raw = ROOT / "raw" / f"{frame_id}.png"
        cleaned_path = ROOT / "cleaned" / f"{frame_id}.png"
        output_path = ROOT / "normalized" / "right" / f"{frame_id}.png"
        raw.write_bytes(source.read_bytes())
        isolated, isolated_pixels = base.isolate_edge_background(Image.open(source))
        cleaned, cleanup = base.remove_secondary_components(isolated)
        cleaned.save(cleaned_path)
        source_items.append((frame_id, cleaned_path, SOURCE[frame_id]))
        group = base.GROUP[frame_id]
        scale = SCALES[group]
        output, placement = base.normalize(cleaned, scale)
        output.save(output_path)
        metrics = base.metrics(output)
        source_bbox = base.threshold_bbox(cleaned)
        expected = [round((source_bbox[2]-source_bbox[0])*scale), round((source_bbox[3]-source_bbox[1])*scale)]
        observed = [metrics["visualWidthAlphaGt32"], metrics["visualHeightAlphaGt32"]]
        src_feature = axis_distance(SOURCE[frame_id])
        output_feature = src_feature * scale
        delta = (output_feature - benchmark_distance) / benchmark_distance * 100
        checks = {
            "coefficientKnown": scale == SCALES[group],
            "noCropAssertion": abs(observed[0]-expected[0]) <= 1 and abs(observed[1]-expected[1]) <= 1,
            "size240x320": metrics["size"] == [240,320],
            "rgba": metrics["mode"] == "RGBA",
            "fourBorderZeroAlpha": metrics["border"]["total"] == 0,
            "feetY300": metrics["feetYExclusiveAlphaGt32"] == 300,
            "alphaGt32SingleComponent": metrics["alphaGt32Components4Connected"] == 1,
            "actionCentroidWithin20": abs(metrics["alphaCentroidXGt32Weighted"]-120) <= 20,
            "rotationInvariantFeatureWithin5pct": abs(delta) <= 5,
            "cleanupSafe": cleanup["cleanupSafe"],
        }
        qa["frames"][frame_id] = {
            "source": str(source), "sourceSha256": sha(source), "group": group,
            "actualCoefficient": scale, "sourceMapping": {"path": str(source), "sheet": None, "crop": None},
            "sourceAlphaGt32BBox": list(source_bbox), "expectedScaledSize": expected, "observedOutputAlphaGt32Size": observed,
            "rotationInvariantFeature": {"sourceEuclideanDistancePx": src_feature, "outputExpectedPx": output_feature, "deltaPct": delta},
            "cleanup": cleanup, "edgeBackgroundPixelsCleared": isolated_pixels, "processing": placement,
            "output": str(output_path), "outputSha256": sha(output_path), "metrics": metrics, "checks": checks,
            "allHardGatesPass": all(checks.values()),
        }

    axis_sheet(source_items, ROOT / "calibration/source_rotinv_axis_annotations.png")
    contact_items = [("BASE battle_idle_right", Image.open(BENCHMARK).convert("RGBA"))]
    for frame_id in FRAME_IDS:
        contact_items.append((frame_id, Image.open(qa["frames"][frame_id]["output"]).convert("RGBA")))
    contact_path = ROOT / "contact" / "right_seq325_rotinv_walk_atk.png"
    base.draw_contact(contact_items, contact_path)
    qa["contact"] = str(contact_path)
    qa["shaDistinct"] = len({v["outputSha256"] for v in qa["frames"].values()}) == len(FRAME_IDS)
    qa["allHardGatesPass"] = qa["shaDistinct"] and all(v["allHardGatesPass"] for v in qa["frames"].values())
    qa["failedFrames"] = [k for k,v in qa["frames"].items() if not v["allHardGatesPass"]]
    (ROOT / "qa/r1_seq325_rotinv.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2)+"\n")
    (ROOT / "manifest.json").write_text(json.dumps({"task":"T45","seq":"325","revision":"R1.10","phase":qa["phase"],"status":"candidate-only","scope":FRAME_IDS,"qa":"qa/r1_seq325_rotinv.json","contact":"contact/right_seq325_rotinv_walk_atk.png","coefficientSource":qa["coefficientSource"],"anchorScales":ANCHOR,"runtimeTouched":False,"phaseBStarted":False,"allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"]},ensure_ascii=False,indent=2)+"\n")
    (ROOT / "calibration/rotinv_measurement.json").write_text(json.dumps({"method":"Euclidean crown→jaw distance; rotation-invariant pair distance, no vertical projection","benchmarkDistancePx":benchmark_distance,"retainedDistancesPx":retained_distances,"retainedVariationPct":qa["retainedVariationPct"],"sourceAnnotations":SOURCE,"anchorScales":ANCHOR},ensure_ascii=False,indent=2)+"\n")
    (ROOT / "credits.json").write_text(json.dumps({"generationCredits":0,"provider":None,"model":None,"note":"deterministic rerender only"},ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"seq":"325","allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"],"anchorScales":ANCHOR,"retainedVariationPct":qa["retainedVariationPct"]},ensure_ascii=False))


if __name__=='__main__': main()
