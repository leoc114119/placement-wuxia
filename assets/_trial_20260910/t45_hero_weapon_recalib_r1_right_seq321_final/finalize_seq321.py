from __future__ import annotations

from pathlib import Path
import copy
import hashlib
import importlib.util
import json

from PIL import Image


ROOT = Path(__file__).parent
SEQ317 = Path("assets/_trial_20260910/t45_hero_weapon_recalib_r1_right_seq317_078")
spec = importlib.util.spec_from_file_location("seq317", SEQ317 / "build_seq317_078.py")
seq317 = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(seq317)
base = seq317.base


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    jump_source = ROOT / "cleaned" / "jump_right_3.png"
    cleaned = Image.open(jump_source).convert("RGBA")
    crop_box = cleaned.getchannel("A").getbbox()
    assert crop_box is not None
    crop = cleaned.crop(crop_box)
    scale = 0.780
    width = round(crop.width * scale)
    height = round(crop.height * scale)
    resized = crop.resize((width, height), Image.Resampling.LANCZOS)
    # seq=319 ruling: bbox-center the complete 233px scaled content at x=3.
    placement_x = 3
    placement_y = 300 - height
    output = Image.new("RGBA", (240, 320), (0, 0, 0, 0))
    output.alpha_composite(resized, (placement_x, placement_y))
    jump_out = ROOT / "normalized" / "right" / "jump_right_3.png"
    output.save(jump_out)

    qa = json.loads((SEQ317 / "qa" / "r1_right_seq317_078.json").read_text())
    qa = copy.deepcopy(qa)
    qa["seq"] = "321"
    qa["revision"] = "R1.8"
    qa["phase"] = "right_side_final_bbox_center_fallback"
    qa["finalPlacementRuling"] = {
        "frame": "jump_right_3",
        "mode": "bbox_center_fallback",
        "placement": [placement_x, placement_y],
        "scaledContentSize": [width, height],
        "reason": "seq=319 ruling; full 233px scaled content centered by bbox, no crop",
        "centroidGate": "action-frame ±20px",
    }
    frames = qa["frames"]
    for frame_id, item in frames.items():
        out = ROOT / "normalized" / "right" / f"{frame_id}.png"
        item["output"] = str(out)
        item["outputSha256"] = sha(out)
        item["finalPlacementMode"] = "bbox_center_fallback" if frame_id == "jump_right_3" else "centroid_center"
        image = Image.open(out).convert("RGBA")
        metrics = base.metrics(image)
        item["metrics"] = metrics
        expected = item["expectedScaledSize"]
        observed = [metrics["visualWidthAlphaGt32"], metrics["visualHeightAlphaGt32"]]
        item["observedOutputAlphaGt32Size"] = observed
        item["finalChecks"] = {
            "frozenCoefficientExact": item["actualCoefficient"] == (0.780 if item["group"] == "seq278_walk_jump" else 1.1944444444444444),
            "noCropAssertion": abs(observed[0] - expected[0]) <= 1 and abs(observed[1] - expected[1]) <= 1,
            "fourBorderZeroAlpha": metrics["border"]["total"] == 0,
            "feetY300": metrics["feetYExclusiveAlphaGt32"] == 300,
            "alphaGt32SingleComponent": metrics["alphaGt32Components4Connected"] == 1,
            "actionCentroidWithin20": abs(metrics["alphaCentroidXGt32Weighted"] - 120) <= 20,
        }
        item["allHardGatesPass"] = all(item["finalChecks"].values())

    qa["shaDistinct"] = len({item["outputSha256"] for item in frames.values()}) == 10
    qa["allHardGatesPass"] = qa["shaDistinct"] and all(item["allHardGatesPass"] for item in frames.values())
    qa["failedFrames"] = [frame_id for frame_id, item in frames.items() if not item["allHardGatesPass"]]
    qa["otherNineShaUnchangedFromSeq317"] = all(
        frames[frame_id]["outputSha256"] == sha(SEQ317 / "normalized" / "right" / f"{frame_id}.png")
        for frame_id in frames if frame_id != "jump_right_3"
    )
    qa["runtimeTouched"] = False
    qa["phaseBStarted"] = False

    benchmark = Image.open("assets/characters/hero/battle45/battle_idle_right.png").convert("RGBA")
    items = [("BASE battle_idle_right", benchmark)]
    for frame_id in ("walk_right_1", "walk_right_2", "walk_right_3", "atk_right_1", "atk_right_2", "atk_right_3", "atk_right_4", "jump_right_1", "jump_right_2", "jump_right_3"):
        items.append((frame_id, Image.open(frames[frame_id]["output"]).convert("RGBA")))
    contact = ROOT / "contact" / "right_r1_seq321_final.png"
    base.draw_contact(items, contact)
    qa["contact"] = str(contact)
    (ROOT / "qa" / "r1_right_seq321_final.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "manifest.json").write_text(json.dumps({"task":"T45","seq":"321","revision":"R1.8","phase":"right_side_final_bbox_center_fallback","status":"candidate-only","frameCount":10,"qa":"qa/r1_right_seq321_final.json","contact":"contact/right_r1_seq321_final.png","runtimeRelease":False,"runtimeTouched":False,"phaseBStarted":False,"coefficientSource":"Leo frozen 0.780 / atk 1.19444","placementMode":"jump_right_3=bbox_center_fallback x=3; others=centroid_center","shaDistinct":qa["shaDistinct"],"otherNineShaUnchangedFromSeq317":qa["otherNineShaUnchangedFromSeq317"],"allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"]}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"seq":"321","allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"],"shaDistinct":qa["shaDistinct"],"otherNineShaUnchanged":qa["otherNineShaUnchangedFromSeq317"],"contact":str(contact)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
