from __future__ import annotations

from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw


ROOT = Path(__file__).parent
FRAME_IDS = ["idle_right", "walk_right_1", "atk_right_1", "jump_right_1"]
RAW_NAMES = {
    "idle_right": "idle_right_native.png",
    "walk_right_1": "walk_right_1_native.png",
    "atk_right_1": "atk_right_1_native_attempt2.png",
    "jump_right_1": "jump_right_1_native.png",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bbox(image: Image.Image, threshold=32):
    alpha = image.getchannel("A")
    points = [(x, y) for y in range(image.height) for x in range(image.width) if alpha.getpixel((x, y)) > threshold]
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def components(image: Image.Image, threshold=32):
    px = image.load()
    seen = set()
    sizes = []
    for y in range(image.height):
        for x in range(image.width):
            if (x, y) in seen or px[x, y][3] <= threshold:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            n = 0
            while stack:
                xx, yy = stack.pop()
                n += 1
                for nx, ny in ((xx-1, yy), (xx+1, yy), (xx, yy-1), (xx, yy+1)):
                    if 0 <= nx < image.width and 0 <= ny < image.height and (nx, ny) not in seen and px[nx, ny][3] > threshold:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            sizes.append(n)
    return sorted(sizes, reverse=True)


def centroid_x(image: Image.Image, threshold=32):
    alpha = image.getchannel("A")
    total = 0
    weighted = 0
    for y in range(image.height):
        for x in range(image.width):
            a = alpha.getpixel((x, y))
            if a > threshold:
                total += a
                weighted += x * a
    return weighted / total


def border_sum(image: Image.Image):
    alpha = image.getchannel("A")
    return sum(alpha.getpixel((x, 0)) for x in range(image.width)) + sum(alpha.getpixel((x, image.height-1)) for x in range(image.width)) + sum(alpha.getpixel((0, y)) for y in range(image.height)) + sum(alpha.getpixel((image.width-1, y)) for y in range(image.height))


def main():
    raw = {frame: ROOT / "raw" / RAW_NAMES[frame] for frame in FRAME_IDS}
    raw_bbox = {frame: bbox(Image.open(path).convert("RGBA")) for frame, path in raw.items()}
    scale = 256 / (raw_bbox["idle_right"][3] - raw_bbox["idle_right"][1])
    qa = {
        "task": "T45",
        "seq": "328",
        "revision": "V2-R2",
        "stage": "four_frame_sample_gate",
        "coefficientSource": "single coefficient derived from idle_right alpha>32 bbox height = 256 / source idle bbox height",
        "coefficient": scale,
        "sourceSelection": RAW_NAMES,
        "rejectedCandidates": {
            "atk_right_1": {
                "source": str(ROOT / "raw" / "atk_right_1_native.png"),
                "reason": "same coefficient produced alpha>32 bbox height 248px; standing-frame gate requires 256±1px",
            }
        },
        "failedCandidate": {
            "atk_right_1": {
                "source": str(ROOT / "raw" / "atk_right_1_native_attempt2.png"),
                "reason": "same coefficient produced alpha>32 bbox height 246px; standing-frame gate requires 256±1px",
            }
        },
        "frames": {},
        "runtimeTouched": False,
    }
    for frame in FRAME_IDS:
        src = Image.open(raw[frame]).convert("RGBA")
        source_box = raw_bbox[frame]
        crop = src.crop(source_box)
        nw = round(crop.width * scale)
        nh = round(crop.height * scale)
        resized = crop.resize((nw, nh), Image.Resampling.LANCZOS)
        local = centroid_x(resized)
        out = Image.new("RGBA", (240, 320), (0, 0, 0, 0))
        out.alpha_composite(resized, (round(120-local), 300-nh))
        out_path = ROOT / "normalized" / f"{frame}.png"
        out.save(out_path)
        out_box = bbox(out)
        checks = {
            "coefficientExact": True,
            "size240x320": list(out.size) == [240, 320],
            "rgba": out.mode == "RGBA",
            "noCropWithin1": abs((out_box[2]-out_box[0])-nw) <= 1 and abs((out_box[3]-out_box[1])-nh) <= 1,
            "fourBorderZeroAlpha": border_sum(out) == 0,
            "feetY300": out_box[3] == 300,
            "alphaGt32SingleComponent": len(components(out)) == 1,
            "centroidXWithin1": abs(centroid_x(out)-120) <= 1,
            "standingBBox256": (frame in ("idle_right", "atk_right_1") and abs((out_box[3]-out_box[1])-256) <= 1) or frame not in ("idle_right", "atk_right_1"),
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
    qa["shaDistinct"] = len({v["outputSha256"] for v in qa["frames"].values()}) == 4
    qa["allHardGatesPass"] = qa["shaDistinct"] and all(v["allHardGatesPass"] for v in qa["frames"].values())
    qa["failedFrames"] = [k for k,v in qa["frames"].items() if not v["allHardGatesPass"]]
    contact = Image.new("RGBA", (1200, 344), (45,45,45,255))
    benchmark = Image.open("assets/characters/hero/battle45/battle_idle_right.png").convert("RGBA")
    contact.alpha_composite(benchmark, (0,0))
    for i, frame in enumerate(FRAME_IDS):
        contact.alpha_composite(Image.open(qa["frames"][frame]["output"]).convert("RGBA"), (i*240, 0))
    drawer=ImageDraw.Draw(contact)
    for i, label in enumerate(["BASE"]+FRAME_IDS): drawer.text((i*240+4,322),label,fill=(245,245,245,255))
    contact_path=ROOT/"contact/four_frame_sample_vs_baseline.png";contact.save(contact_path);qa["contact"]=str(contact_path)
    (ROOT/"qa/four_frame_sample.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2)+"\n")
    (ROOT/"manifest.json").write_text(json.dumps({"task":"T45","seq":"328","revision":"V2-R2","stage":"four_frame_sample_gate","frames":FRAME_IDS,"sourceSelection":RAW_NAMES,"rejectedCandidates":qa["rejectedCandidates"],"failedCandidate":qa["failedCandidate"],"coefficient":scale,"qa":"qa/four_frame_sample.json","contact":"contact/four_frame_sample_vs_baseline.png","status":"candidate-only","runtimeRelease":False,"allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"]},ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"allHardGatesPass":qa["allHardGatesPass"],"failedFrames":qa["failedFrames"],"coefficient":scale,"contact":str(contact_path)},ensure_ascii=False))


if __name__ == "__main__": main()
