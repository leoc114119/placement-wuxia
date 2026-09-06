from pathlib import Path
import hashlib
import json
from collections import deque

from PIL import Image, ImageDraw


ROOT = Path(__file__).parents[1]
CANONICAL = ROOT.parent / "t45_batch2a_a_right_singleframe_v1_codex_native" / "normalized" / "shanzei_a_right.png"
PREVIEW = ROOT / "qa" / "shanzei_a_right_recentered_preview.png"
BACKUP = ROOT / "qa" / "shanzei_a_right_before_recenter_canonical.png"
CONTACT = ROOT / "contact_six_selected.png"
MANIFEST = ROOT / "manifest.json"
QA = ROOT / "qa" / "recenter_canonical_a_right_qa.json"
THRESHOLD = 32
DX = 6

SOURCES = [
    ("shanzei_a_right · Leo selected", CANONICAL),
    ("shanzei_a_rightup · Leo selected", ROOT.parent / "t45_batch2a_a_rightup_singleframe_v1_codex_native" / "normalized" / "shanzei_a_rightup.png"),
    ("shanzei_a_rightdown · Leo selected", ROOT.parent / "t45_batch2a_a_rightdown_singleframe_v1_codex_native" / "normalized" / "shanzei_a_rightdown.png"),
    ("shanzei_b_right · Leo selected", ROOT.parent / "t45_batch2a_bright_v8_two_ref_hero_height_codex_native" / "normalized" / "shanzei_b_right.png"),
    ("shanzei_b_rightup · Leo selected", ROOT.parent / "t45_batch2a_b_rightup_singleframe_v5_codex_native" / "normalized" / "shanzei_b_rightup.png"),
    ("shanzei_b_rightdown · Leo selected", ROOT.parent / "t45_batch2a_b_rightdown_singleframe_v1_codex_native" / "normalized" / "shanzei_b_rightdown.png"),
]


def facts(image: Image.Image) -> dict:
    image = image.convert("RGBA")
    points = {
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if image.getpixel((x, y))[3] > THRESHOLD
    }
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    visited = set()
    components = 0
    for point in points:
        if point in visited:
            continue
        components += 1
        queue = deque([point])
        visited.add(point)
        while queue:
            x, y = queue.popleft()
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor in points and neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
    perimeter = sum(
        image.getpixel((x, y))[3] > THRESHOLD
        for x in range(image.width)
        for y in (0, image.height - 1)
    ) + sum(
        image.getpixel((x, y))[3] > THRESHOLD
        for y in range(1, image.height - 1)
        for x in (0, image.width - 1)
    )
    return {
        "size": list(image.size),
        "mode": image.mode,
        "bbox": [min(xs), min(ys), max(xs) + 1, max(ys) + 1],
        "visualHeight": max(ys) - min(ys) + 1,
        "feetY": max(ys) + 1,
        "centroidX": sum(xs) / len(xs),
        "alphaExtrema": [min(pixel[3] for pixel in image.getdata()), max(pixel[3] for pixel in image.getdata())],
        "perimeterNonzero": int(perimeter),
        "components": components,
    }


def main() -> None:
    source = Image.open(CANONICAL).convert("RGBA")
    before = facts(source)
    if not BACKUP.exists():
        source.save(BACKUP, "PNG", optimize=False)
    shifted = Image.open(PREVIEW).convert("RGBA")
    shifted.save(CANONICAL, "PNG", optimize=False)
    after = facts(shifted)

    manifest = json.loads(MANIFEST.read_text())
    for entry in manifest["files"]:
        if entry["role"] == "shanzei_a" and entry["direction"] == "right":
            entry["bbox"] = after["bbox"]
            entry["centroidX"] = after["centroidX"]
            entry["sha256"] = hashlib.sha256(CANONICAL.read_bytes()).hexdigest()
            entry["correction"] = "deterministic horizontal translation +6px after full-pixel alpha>32 centroid review"
            break
    else:
        raise RuntimeError("canonical A-right entry not found")
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    report = {
        "task": "T45",
        "target": "shanzei_a_right",
        "sourceBefore": str(BACKUP),
        "output": str(CANONICAL),
        "operation": "deterministic horizontal translation",
        "shiftX": DX,
        "alphaThreshold": THRESHOLD,
        "before": before,
        "after": after,
        "sourceBeforeSha256": hashlib.sha256(BACKUP.read_bytes()).hexdigest(),
        "outputSha256": hashlib.sha256(CANONICAL.read_bytes()).hexdigest(),
        "noRedraw": True,
        "manifestUpdated": True,
        "runtimeRelease": False,
    }
    QA.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    cell_w, cell_h = 520, 460
    sheet = Image.new("RGBA", (cell_w * 3, cell_h * 2), (27, 23, 20, 255))
    draw = ImageDraw.Draw(sheet)
    for index, (label, path) in enumerate(SOURCES):
        image = Image.open(path).convert("RGBA")
        x = (index % 3) * cell_w
        y = (index // 3) * cell_h
        draw.text((x + 34, y + 10), label, fill=(236, 231, 215, 255))
        sheet.alpha_composite(image.resize((270, 360), Image.Resampling.NEAREST), (x + 125, y + 54))
        draw.line((x, y + cell_h - 1, x + cell_w, y + cell_h - 1), fill=(147, 111, 47, 255), width=1)
    sheet.save(CONTACT, "PNG", optimize=False)
    print(json.dumps({"canonical": str(CANONICAL), "manifest": str(MANIFEST), "qa": str(QA), "contact": str(CONTACT), "before": before, "after": after}, ensure_ascii=False))


if __name__ == "__main__":
    main()
