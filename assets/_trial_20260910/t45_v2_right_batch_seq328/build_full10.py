from __future__ import annotations

from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw

from build_sample4 import bbox, border_sum, centroid_x, components

ROOT = Path(__file__).parent
FRAME_IDS = [
    "idle_right", "walk_right_1", "walk_right_2", "walk_right_3",
    "atk_right_1", "atk_right_2", "atk_right_3",
    "jump_right_1", "jump_right_2", "jump_right_3",
]
RAW_NAMES = {
    "idle_right": "idle_right_native.png",
    "walk_right_1": "walk_right_1_native.png",
    "walk_right_2": "walk_right_2_native.png",
    "walk_right_3": "walk_right_3_native_attempt2.png",
    "atk_right_1": "atk_right_1_native_attempt2.png",
    "atk_right_2": "atk_right_2_native_attempt2.png",
    "atk_right_3": "atk_right_3_native_attempt2.png",
    "jump_right_1": "jump_right_1_native.png",
    "jump_right_2": "jump_right_2_native.png",
    "jump_right_3": "jump_right_3_native.png",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    raw = {frame: ROOT / "raw" / RAW_NAMES[frame] for frame in FRAME_IDS}
    raw_images = {frame: Image.open(path).convert("RGBA") for frame, path in raw.items()}
    raw_bbox = {frame: bbox(image) for frame, image in raw_images.items()}
    scale = 256 / (raw_bbox["idle_right"][3] - raw_bbox["idle_right"][1])
    qa = {
        "task": "T45",
        "seq": "333",
        "revision": "V2-R3-full10",
        "stage": "full_10_frame_gate",
        "coefficientSource": "single coefficient derived from idle_right alpha>32 bbox height = 256 / source idle bbox height",
        "coefficient": scale,
        "frames": {},
        "sourceSelection": RAW_NAMES,
        "rejectedCandidates": {
            "walk_right_3": "initial native output had checkerboard rendered into opaque canvas; replaced by native attempt2",
            "atk_right_2": "initial native output had checkerboard rendered into opaque canvas; replaced by native attempt2",
            "atk_right_3": "initial native output had checkerboard rendered into opaque canvas; replaced by native attempt2",
            "jump_right_3": "wrong copied atk attempt was quarantined as jump_right_3_native_wrong_copied_atk.png; not used",
        },
        "runtimeTouched": False,
    }
    for frame in FRAME_IDS:
        src = raw_images[frame]
        source_box = raw_bbox[frame]
        crop = src.crop(source_box)
        nw = round(crop.width * scale)
        nh = round(crop.height * scale)
        resized = crop.resize((nw, nh), Image.Resampling.LANCZOS)
        local = centroid_x(resized)
        out = Image.new("RGBA", (240, 320), (0, 0, 0, 0))
        out.alpha_composite(resized, (round(120 - local), 300 - nh))
        out_path = ROOT / "normalized" / f"{frame}.png"
        out.save(out_path)
        out_box = bbox(out)
        action_centroid_limit = 1 if frame == "idle_right" else 20
        checks = {
            "coefficientExact": True,
            "size240x320": list(out.size) == [240, 320],
            "rgba": out.mode == "RGBA",
            "noCropWithin1": abs((out_box[2] - out_box[0]) - nw) <= 1 and abs((out_box[3] - out_box[1]) - nh) <= 1,
            "fourBorderZeroAlpha": border_sum(out) == 0,
            "feetY300": out_box[3] == 300,
            "alphaGt32SingleComponent": len(components(out)) == 1,
            "centroidXWithinGate": abs(centroid_x(out) - 120) <= action_centroid_limit,
            "width238": (out_box[2] - out_box[0]) <= 238,
            "idleBBox256": frame != "idle_right" or abs((out_box[3] - out_box[1]) - 256) <= 1,
        }
        qa["frames"][frame] = {
            "source": str(raw[frame]),
            "sourceSha256": sha(raw[frame]),
            "sourceBBoxAlphaGt32": list(source_box),
            "actualCoefficient": scale,
            "expectedScaledSize": [nw, nh],
            "output": str(out_path),
            "outputSha256": sha(out_path),
            "outputBBoxAlphaGt32": list(out_box),
            "outputCentroidX": centroid_x(out),
            "checks": checks,
            "allHardGatesPass": all(checks.values()),
        }
    qa["shaDistinct"] = len({v["outputSha256"] for v in qa["frames"].values()}) == len(FRAME_IDS)
    qa["allHardGatesPass"] = qa["shaDistinct"] and all(v["allHardGatesPass"] for v in qa["frames"].values())
    qa["failedFrames"] = [k for k, v in qa["frames"].items() if not v["allHardGatesPass"]]

    contact = Image.new("RGBA", (2640, 360), (45, 45, 45, 255))
    benchmark = Image.open("assets/characters/hero/battle45/battle_idle_right.png").convert("RGBA")
    contact.alpha_composite(benchmark, (0, 0))
    for i, frame in enumerate(FRAME_IDS, start=1):
        contact.alpha_composite(Image.open(qa["frames"][frame]["output"]).convert("RGBA"), (i * 240, 0))
    drawer = ImageDraw.Draw(contact)
    for i, label in enumerate(["BASE"] + FRAME_IDS):
        drawer.text((i * 240 + 4, 338), label, fill=(245, 245, 245, 255))
    contact_path = ROOT / "contact/full_10frame_vs_baseline.png"
    contact.save(contact_path)
    qa["contact"] = str(contact_path)
    (ROOT / "qa/full_10_frame.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    manifest = {
        "task": "T45",
        "seq": "333",
        "revision": "V2-R3-full10",
        "stage": "full_10_frame_gate",
        "frames": FRAME_IDS,
        "sourceSelection": RAW_NAMES,
        "rejectedCandidates": qa["rejectedCandidates"],
        "coefficient": scale,
        "qa": "qa/full_10_frame.json",
        "contact": "contact/full_10frame_vs_baseline.png",
        "status": "candidate-only",
        "runtimeRelease": False,
        "allHardGatesPass": qa["allHardGatesPass"],
        "failedFrames": qa["failedFrames"],
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"allHardGatesPass": qa["allHardGatesPass"], "failedFrames": qa["failedFrames"], "coefficient": scale, "contact": str(contact_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
