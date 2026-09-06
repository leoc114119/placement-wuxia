from collections import deque
from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw


ROOT = Path("assets/_trial_20260906/t45_batch2a_bright_v8_two_ref_hero_height_codex_native")
RAW = ROOT / "raw" / "shanzei_b_right_two_ref_attempt1.png"
OUT = ROOT / "normalized" / "shanzei_b_right.png"
QA = ROOT / "qa"
CONTACT = ROOT / "contact" / "hero_b_right_height_compare.png"
HERO = Path("assets/characters/hero/battle45/battle_idle_right.png")


def is_light_neutral(pixel):
    red, green, blue, alpha = pixel
    return alpha >= 245 and min(red, green, blue) >= 225 and max(red, green, blue) - min(red, green, blue) <= 12


def remove_exterior_light_background(image):
    image = image.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    queue = deque()
    seen = set()
    for x in range(width):
        for y in (0, height - 1):
            if is_light_neutral(pixels[x, y]) and (x, y) not in seen:
                queue.append((x, y))
                seen.add((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if is_light_neutral(pixels[x, y]) and (x, y) not in seen:
                queue.append((x, y))
                seen.add((x, y))
    while queue:
        x, y = queue.popleft()
        red, green, blue, _ = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen and is_light_neutral(pixels[nx, ny]):
                queue.append((nx, ny))
                seen.add((nx, ny))
    return image


def opaque_bbox(image):
    return image.getchannel("A").point(lambda value: 255 if value >= 30 else 0).getbbox()


def main():
    QA.mkdir(exist_ok=True)
    cut = remove_exterior_light_background(Image.open(RAW))
    source_bbox = opaque_bbox(cut)
    crop = cut.crop(source_bbox)
    scale = 256 / crop.height
    normalized_width = round(crop.width * scale)
    normalized = crop.resize((normalized_width, 256), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (240, 320), (0, 0, 0, 0))
    frame.alpha_composite(normalized, (round(120 - normalized_width / 2), 44))
    frame.save(OUT, "PNG", optimize=False)
    bbox = opaque_bbox(frame)
    ratio = (bbox[2] - bbox[0]) / (bbox[3] - bbox[1])
    rec = {
        "key": "shanzei_b_right",
        "source": str(RAW),
        "output": str(OUT),
        "sourceSize": list(cut.size),
        "sourceBBox": list(source_bbox),
        "size": list(frame.size),
        "bbox": list(bbox),
        "visualHeight": bbox[3] - bbox[1],
        "feetY": bbox[3],
        "centroidX": (bbox[0] + bbox[2]) / 2,
        "widthHeightRatio": ratio,
        "ratioPass": 0.38 <= ratio <= 0.55,
        "alphaExtrema": list(frame.getchannel("A").getextrema()),
        "backgroundRemoval": "exterior-connected near-neutral checkerboard only",
        "references": {
            "identity": "Leo supplied b-right figure",
            "proportion": "hero/battle45/battle_idle_right.png",
        },
        "nativeAttempt": 1,
        "change": "two-reference img2img; retains Leo-approved b identity and extends lower body to hero standing height",
        "sourceSha256": hashlib.sha256(RAW.read_bytes()).hexdigest(),
        "outputSha256": hashlib.sha256(OUT.read_bytes()).hexdigest(),
    }
    (QA / "shanzei_b_right.json").write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
    mechanical_pass = rec["size"] == [240, 320] and rec["visualHeight"] == 256 and rec["feetY"] == 300 and abs(rec["centroidX"] - 120) <= 1 and rec["ratioPass"] and rec["alphaExtrema"][0] == 0
    (QA / "summary.json").write_text(json.dumps({"count": 1, "mechanicalPass": mechanical_pass, "files": [rec]}, ensure_ascii=False, indent=2) + "\n")

    hero = Image.open(HERO).convert("RGBA")
    preview = Image.new("RGBA", (520, 390), (237, 233, 219, 255))
    preview.alpha_composite(hero.resize((240, 320), Image.Resampling.NEAREST), (20, 42))
    preview.alpha_composite(frame, (270, 42))
    draw = ImageDraw.Draw(preview)
    draw.line((10, 342, 510, 342), fill=(181, 81, 57, 255), width=2)
    draw.text((70, 12), "hero right idle", fill=(45, 45, 45, 255))
    draw.text((304, 12), "b right: two-reference candidate", fill=(45, 45, 45, 255))
    draw.text((18, 354), "same 256px visual height / feet y=300", fill=(45, 45, 45, 255))
    preview.save(CONTACT, "PNG")
    print(json.dumps({"qa": rec, "mechanicalPass": mechanical_pass, "contact": str(CONTACT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
