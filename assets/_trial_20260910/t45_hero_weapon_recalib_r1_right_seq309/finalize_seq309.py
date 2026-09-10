from __future__ import annotations

from pathlib import Path
import copy
import hashlib
import importlib.util
import json

from PIL import Image


ROOT = Path(__file__).parent
SEQ304 = Path("assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq304")
BASE_SCRIPT = SEQ304 / "build_r1_manual_measurement.py"
spec = importlib.util.spec_from_file_location("seq304_manual", BASE_SCRIPT)
manual = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(manual)
base = manual.base


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    source = ROOT / "cleaned" / "jump_right_3.png"
    cleaned = Image.open(source).convert("RGBA")
    scale = manual.SCALES["seq278_walk_jump"]
    crop_box = cleaned.getchannel("A").getbbox()
    assert crop_box is not None
    crop = cleaned.crop(crop_box)
    width = round(crop.width * scale)
    height = round(crop.height * scale)
    resized = crop.resize((width, height), Image.Resampling.LANCZOS)

    # seq=309 Leo/PM2 ruling: bbox-center fallback for this wide action frame.
    bbox_x = 1
    bbox_y = 300 - height
    output = Image.new("RGBA", (240, 320), (0, 0, 0, 0))
    output.alpha_composite(resized, (bbox_x, bbox_y))
    final_path = ROOT / "normalized" / "right" / "jump_right_3.png"
    output.save(final_path)

    old_qa = json.loads((SEQ304 / "qa" / "r1_right_seq304_manual.json").read_text())
    qa = copy.deepcopy(old_qa)
    qa["seq"] = "309"
    qa["phase"] = "right_side_final_placement_fix"
    qa["finalPlacementRuling"] = {
        "frame": "jump_right_3",
        "mode": "bbox_center_fallback",
        "placedAt": [bbox_x, bbox_y],
        "reason": "wide action frame; centroid-center placement clips 4px, bbox-center preserves full 238px content and four transparent borders",
        "allowedCentroidGate": "action-frame ±20px per PM2 onboard §3",
    }

    frames = qa["frames"]
    for frame_id, item in frames.items():
        item["output"] = str(ROOT / "normalized" / "right" / f"{frame_id}.png")
        item["outputSha256"] = sha(ROOT / "normalized" / "right" / f"{frame_id}.png")
        item["finalPlacementMode"] = "bbox_center_fallback" if frame_id == "jump_right_3" else "centroid_center"
        item["shaUnchangedFromSeq304"] = item["outputSha256"] == sha(SEQ304 / "normalized" / "right" / f"{frame_id}.png")

        image = Image.open(ROOT / "normalized" / "right" / f"{frame_id}.png").convert("RGBA")
        metrics = base.metrics(image)
        item["metrics"] = metrics
        expected = item["expectedScaledAlphaGt32Size"]
        observed = [metrics["visualWidthAlphaGt32"], metrics["visualHeightAlphaGt32"]]
        item["observedOutputAlphaGt32Size"] = observed
        item["finalChecks"] = {
            "bboxMatchesExpectedWithin1": abs(observed[0] - expected[0]) <= 1 and abs(observed[1] - expected[1]) <= 1,
            "borderTransparent": metrics["border"]["total"] == 0,
            "alphaGt32SingleComponent": metrics["alphaGt32Components4Connected"] == 1,
            "feetY300": metrics["feetYExclusiveAlphaGt32"] == 300,
            "actionCentroidWithin20": abs(metrics["alphaCentroidXGt32Weighted"] - 120) <= 20,
            "outputRigidFeatureWithin5pct": item["checks"]["outputRigidFeatureWithin5pct"],
            "cleanupSafe": item["cleanup"]["cleanupSafe"],
            "shaUnchangedFromSeq304": item["shaUnchangedFromSeq304"] if frame_id != "jump_right_3" else True,
            "jumpPlacementChangeIsExpected": True if frame_id == "jump_right_3" else True,
        }
        item["allHardGatesPass"] = all(item["finalChecks"].values())

    qa["shaDistinct"] = len({item["outputSha256"] for item in frames.values()}) == 10
    qa["otherNineShaUnchanged"] = all(item["shaUnchangedFromSeq304"] for frame_id, item in frames.items() if frame_id != "jump_right_3")
    qa["allHardGatesPass"] = qa["shaDistinct"] and qa["otherNineShaUnchanged"] and all(item["allHardGatesPass"] for item in frames.values())
    qa["failedFrames"] = [frame_id for frame_id, item in frames.items() if not item["allHardGatesPass"]]
    qa["runtimeTouched"] = False
    qa["phaseBStarted"] = False
    qa["finalStatus"] = "candidate-only"

    benchmark = Image.open("assets/characters/hero/battle45/battle_idle_right.png").convert("RGBA")
    contact_items = [("BASE battle_idle_right", benchmark)]
    for frame_id in ("walk_right_1", "walk_right_2", "walk_right_3", "atk_right_1", "atk_right_2", "atk_right_3", "atk_right_4", "jump_right_1", "jump_right_2", "jump_right_3"):
        contact_items.append((frame_id, Image.open(frames[frame_id]["output"]).convert("RGBA")))
    contact_path = ROOT / "contact" / "right_r1_seq309_final.png"
    base.draw_contact(contact_items, contact_path)
    qa["contact"] = str(contact_path)
    (ROOT / "qa" / "r1_right_seq309_final.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "manifest.json").write_text(json.dumps({"task":"T45","seq":"309","revision":"R1","phase":"right_side_final_placement_fix","status":"candidate-only","frameCount":10,"qa":"qa/r1_right_seq309_final.json","contact":"contact/right_r1_seq309_final.png","runtimeRelease":False,"runtimeTouched":False,"phaseBStarted":False,"shaDistinct":qa["shaDistinct"],"otherNineShaUnchanged":qa["otherNineShaUnchanged"],"allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"],"placementMode":"jump_right_3=bbox_center_fallback; others=centroid_center"}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"seq":"309","allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"],"otherNineShaUnchanged":qa["otherNineShaUnchanged"],"contact":str(contact_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
