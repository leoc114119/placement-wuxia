from __future__ import annotations

from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw


ROOT = Path(__file__).parent
RAW = ROOT / "raw/idle_right_native.png"
OUT = ROOT / "normalized/idle_right.png"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bbox_threshold(image: Image.Image, threshold=32):
    alpha = image.getchannel("A")
    points = [(x, y) for y in range(image.height) for x in range(image.width) if alpha.getpixel((x, y)) > threshold]
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def components(image: Image.Image, threshold=32):
    px = image.load()
    seen = set()
    result = []
    for y in range(image.height):
        for x in range(image.width):
            if (x, y) in seen or px[x, y][3] <= threshold:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            count = 0
            while stack:
                xx, yy = stack.pop()
                count += 1
                for nx, ny in ((xx-1, yy), (xx+1, yy), (xx, yy-1), (xx, yy+1)):
                    if 0 <= nx < image.width and 0 <= ny < image.height and (nx, ny) not in seen:
                        if px[nx, ny][3] > threshold:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            result.append(count)
    return sorted(result, reverse=True)


def weighted_centroid_x(image: Image.Image, threshold=32):
    alpha = image.getchannel("A")
    total = 0
    weighted = 0
    for y in range(image.height):
        for x in range(image.width):
            value = alpha.getpixel((x, y))
            if value > threshold:
                total += value
                weighted += x * value
    return weighted / total


def border_sum(image: Image.Image):
    alpha = image.getchannel("A")
    return sum(alpha.getpixel((x, 0)) for x in range(image.width)) + sum(alpha.getpixel((x, image.height-1)) for x in range(image.width)) + sum(alpha.getpixel((0, y)) for y in range(image.height)) + sum(alpha.getpixel((image.width-1, y)) for y in range(image.height))


def main():
    source = Image.open(RAW).convert("RGBA")
    crop_box = source.getchannel("A").getbbox()
    crop = source.crop(crop_box)
    scale = 256 / bbox_threshold(source)[3] - 0  # replaced below with crop height
    scale = 256 / crop.height
    resized = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (240, 320), (0, 0, 0, 0))
    local = weighted_centroid_x(resized)
    resized_bbox = bbox_threshold(resized)
    output.alpha_composite(resized, (round(120 - local), 300 - resized_bbox[3]))
    output.save(OUT)
    bbox = bbox_threshold(output)
    checks = {
        "size240x320": list(output.size) == [240, 320],
        "rgba": output.mode == "RGBA",
        "alphaHas0And255": list(output.getchannel("A").getextrema()) == [0, 255],
        "fourBorderZeroAlpha": border_sum(output) == 0,
        "feetY300": bbox[3] == 300,
        "alphaGt32SingleComponent": len(components(output)) == 1,
        "centroidXWithin1": abs(weighted_centroid_x(output) - 120) <= 1,
    }
    qa = {
        "task": "T45",
        "seq": "328",
        "stage": "idle_sample_gate",
        "source": str(RAW),
        "sourceSha256": sha(RAW),
        "sourceCropBox": list(crop_box),
        "sampleOnlyNormalizationScale": scale,
        "output": str(OUT),
        "outputSha256": sha(OUT),
        "outputBBoxAlphaGt32": list(bbox),
        "outputCentroidX": weighted_centroid_x(output),
        "checks": checks,
        "allMachineChecksPass": all(checks.values()),
        "visualReview": "pending_Leo",
        "specGate": "pending_pm_scan",
        "runtimeTouched": False,
        "next": "Do not generate walk/atk/jump until Leo and PM2 pass this sample gate",
    }
    benchmark = Image.open("assets/characters/hero/battle45/battle_idle_right.png").convert("RGBA")
    contact = Image.new("RGBA", (480, 344), (45, 45, 45, 255))
    contact.alpha_composite(benchmark, (0, 0))
    contact.alpha_composite(output, (240, 0))
    drawer = ImageDraw.Draw(contact)
    drawer.text((4, 322), "BASE battle_idle_right", fill=(245, 245, 245, 255))
    drawer.text((244, 322), "V2 idle sample", fill=(245, 245, 245, 255))
    contact.save(ROOT / "contact/idle_sample_vs_baseline.png")
    qa["contact"] = str(ROOT / "contact/idle_sample_vs_baseline.png")
    (ROOT / "qa/idle_sample.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "manifest.json").write_text(json.dumps({"task":"T45","seq":"328","stage":"idle_sample_gate","status":"candidate-only","sample":"idle_right","qa":"qa/idle_sample.json","visualReview":"pending_Leo","specGate":"pending_pm_scan","runtimeRelease":False}, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "credits.json").write_text(json.dumps({"channel":"Codex native ImageGen","generationCount":1,"fallbackUsed":False}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"allMachineChecksPass":qa["allMachineChecksPass"],"output":str(OUT),"sha":qa["outputSha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
