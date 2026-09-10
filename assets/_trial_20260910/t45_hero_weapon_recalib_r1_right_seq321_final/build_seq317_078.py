from __future__ import annotations

from pathlib import Path
import copy
import hashlib
import importlib.util
import json

from PIL import Image


ROOT = Path(__file__).parent
SOURCE_PACKAGE = Path("assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq304")
spec = importlib.util.spec_from_file_location("manual", SOURCE_PACKAGE / "build_r1_manual_measurement.py")
manual = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(manual)
base = manual.base

W, H, CX, FEET = 240, 320, 120, 300
FROZEN_SEQ278 = 0.780
ATK_SCALE = 1.1944444444444444
SCALES = {"seq278_walk_jump": FROZEN_SEQ278, "seq279_atk": ATK_SCALE}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bbox_threshold(image: Image.Image, threshold=32):
    alpha = image.getchannel("A")
    points = [(x, y) for y in range(image.height) for x in range(image.width) if alpha.getpixel((x, y)) > threshold]
    if not points:
        raise ValueError("empty threshold bbox")
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def main():
    qa = {
        "task": "T45",
        "seq": "317",
        "revision": "R1.7",
        "phase": "right_side_frozen_0780_rerender",
        "status": "candidate-only",
        "coefficientSource": "Leo-circled frozen coefficient / projbus seq=317",
        "frozenCoefficients": {"seq278_walk_jump": FROZEN_SEQ278, "seq279_atk": ATK_SCALE},
        "runtimeTouched": False,
        "phaseBStarted": False,
        "frames": {},
    }

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
        metrics = base.metrics(output)
        source_bbox = bbox_threshold(cleaned)
        expected = [round((source_bbox[2] - source_bbox[0]) * scale), round((source_bbox[3] - source_bbox[1]) * scale)]
        observed = [metrics["visualWidthAlphaGt32"], metrics["visualHeightAlphaGt32"]]
        annotation = manual.SOURCE_ANNOTATIONS[frame_id]
        output_feature = manual.output_annotation(annotation, cleaned.getchannel("A").getbbox(), scale, placement["placedAt"])
        feature_delta = (output_feature["spanPx"] - manual.BENCHMARK_SPAN) / manual.BENCHMARK_SPAN * 100
        checks = {
            "frozenCoefficientExact": scale == FROZEN_SEQ278 if group == "seq278_walk_jump" else scale == ATK_SCALE,
            "noCropAssertion": abs(observed[0] - expected[0]) <= 1 and abs(observed[1] - expected[1]) <= 1,
            "size240x320": metrics["size"] == [240, 320],
            "rgba": metrics["mode"] == "RGBA",
            "fourBorderZeroAlpha": metrics["border"]["total"] == 0,
            "feetY300": metrics["feetYExclusiveAlphaGt32"] == FEET,
            "alphaGt32SingleComponent": metrics["alphaGt32Components4Connected"] == 1,
            "actionCentroidWithin20": abs(metrics["alphaCentroidXGt32Weighted"] - CX) <= 20,
            "outputRigidFeatureWithin5pct": abs(feature_delta) <= 5,
            "cleanupSafe": cleanup["cleanupSafe"],
        }
        qa["frames"][frame_id] = {
            "source": str(source),
            "sourceSha256": sha(source),
            "sourceMapping": {"path": str(source), "sheet": None, "crop": None},
            "group": group,
            "actualCoefficient": scale,
            "sourceAlphaGt32BBox": list(source_bbox),
            "expectedScaledSize": expected,
            "observedOutputAlphaGt32Size": observed,
            "manualRigidFeature": annotation,
            "outputRigidFeature": output_feature,
            "outputRigidFeatureDeltaPct": feature_delta,
            "edgeBackgroundPixelsCleared": isolated_pixels,
            "cleanup": cleanup,
            "processing": placement,
            "raw": str(raw),
            "cleaned": str(cleaned_path),
            "output": str(output_path),
            "outputSha256": sha(output_path),
            "metrics": metrics,
            "checks": checks,
            "allHardGatesPass": all(checks.values()),
        }

    qa["shaDistinct"] = len({frame["outputSha256"] for frame in qa["frames"].values()}) == 10
    qa["allHardGatesPass"] = qa["shaDistinct"] and all(frame["allHardGatesPass"] for frame in qa["frames"].values())
    qa["failedFrames"] = [key for key, frame in qa["frames"].items() if not frame["allHardGatesPass"]]

    benchmark = Image.open("assets/characters/hero/battle45/battle_idle_right.png").convert("RGBA")
    contact_items = [("BASE battle_idle_right", benchmark)]
    for frame_id in ("walk_right_1", "walk_right_2", "walk_right_3", "atk_right_1", "atk_right_2", "atk_right_3", "atk_right_4", "jump_right_1", "jump_right_2", "jump_right_3"):
        contact_items.append((frame_id, Image.open(qa["frames"][frame_id]["output"]).convert("RGBA")))
    contact_path = ROOT / "contact" / "right_r1_seq317_078.png"
    base.draw_contact(contact_items, contact_path)
    qa["contact"] = str(contact_path)
    (ROOT / "qa" / "r1_right_seq317_078.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "manifest.json").write_text(json.dumps({"task":"T45","seq":"317","revision":"R1.7","phase":qa["phase"],"status":"candidate-only","frameCount":10,"qa":"qa/r1_right_seq317_078.json","contact":"contact/right_r1_seq317_078.png","runtimeRelease":False,"runtimeTouched":False,"phaseBStarted":False,"coefficientSource":qa["coefficientSource"],"frozenCoefficients":qa["frozenCoefficients"],"shaDistinct":qa["shaDistinct"],"allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"]}, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "credits.json").write_text(json.dumps({"generationCredits":0,"provider":None,"model":None,"note":"deterministic local rerender at frozen coefficients"}, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"seq":"317","allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"],"shaDistinct":qa["shaDistinct"],"contact":str(contact_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
